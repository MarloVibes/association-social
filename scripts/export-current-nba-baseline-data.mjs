import { writeFileSync } from 'node:fs';
import https from 'node:https';

import { initializeApp } from 'firebase/app';
import { doc, getDoc, getFirestore } from 'firebase/firestore';

const app = initializeApp({
  apiKey: 'AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY',
  projectId: 'association-social',
});
const db = getFirestore(app);

const NBA_POOL_EXPORTS = [
  { key: 'magic_bird', season: 1984, output: 'data/nba/magic_bird-player-pool.json' },
  { key: 'jordan', season: 1992, output: 'data/nba/jordan-player-pool.json' },
  { key: 'kobe', season: 2003, output: 'data/nba/kobe-player-pool.json' },
  { key: 'lebron', season: 2011, output: 'data/nba/lebron-player-pool.json' },
  { key: 'steph', season: 2017, output: 'data/nba/steph-player-pool.json' },
  { key: 'current', season: 2025, output: 'data/nba/current-player-pool.json' },
];

const NBA_STAT_SEASONS = [1984, 1992, 2003, 2011, 2017, 2025, 2026];

function fetchPage(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'www.basketball-reference.com',
      path,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: 'text/html',
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.end();
  });
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();
}

function numberFrom(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const numeric = Number(String(value || '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(numeric) ? numeric : null;
}

function pct(value) {
  const numeric = numberFrom(value);
  if (numeric === null) return null;
  return numeric > 1 ? numeric / 100 : numeric;
}

function cell(row, stat) {
  const match = row.match(new RegExp(`data-stat="${stat}"[^>]*>([\\s\\S]*?)<\\/(?:td|th)>`));
  return stripHtml(match?.[1]);
}

function parseRows(html, tableId) {
  const uncommented = html.replace(/<!--([\s\S]*?)-->/g, '$1');
  const tableIndex = uncommented.indexOf(`id="${tableId}"`);
  const tbodyStart = uncommented.indexOf('<tbody>', tableIndex);
  const tbodyEnd = uncommented.indexOf('</tbody>', tbodyStart);
  if (tableIndex < 0 || tbodyStart < 0 || tbodyEnd < 0) return [];
  return uncommented.slice(tbodyStart, tbodyEnd).match(/<tr[\s\S]*?<\/tr>/g) || [];
}

function preferTotalRow(map, id, row) {
  if (row.team === 'TOT' || !map.has(id)) {
    map.set(id, row);
  }
}

function definedEntries(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== null && value !== undefined && value !== ''));
}

async function exportPool({ key, season, output }) {
  const snap = await getDoc(doc(db, 'era_player_pools', key));
  if (!snap.exists()) throw new Error(`era_player_pools/${key} was not found.`);
  const data = snap.data() || {};
  const players = (Array.isArray(data.players) ? data.players : []).map(player => ({
    player_id: player.player_id || '',
    bref_id: player.bref_id || '',
    full_name: player.full_name || '',
    first_name: player.first_name || '',
    last_name: player.last_name || '',
    position: player.position || '',
    team: player.team || '',
    age: player.age ?? null,
    birth_year: player.birth_year ?? null,
    jersey_number: player.jersey_number || '',
    season: player.season ?? data.season ?? season,
  }));

  writeFileSync(output, `${JSON.stringify({
    era: key,
    season: data.season || season,
    source: `Firestore era_player_pools/${key}`,
    players,
  }, null, 2)}\n`);
  return { key, count: players.length };
}

async function exportSeasonStats(season) {
  const [perGameHtml, advancedHtml] = await Promise.all([
    fetchPage(`/leagues/NBA_${season}_per_game.html`),
    fetchPage(`/leagues/NBA_${season}_advanced.html`),
  ]);
  const perGameById = new Map();
  const advancedById = new Map();

  for (const row of parseRows(perGameHtml, 'per_game_stats')) {
    if (row.includes('thead')) continue;
    const id = row.match(/data-append-csv="([^"]+)"/)?.[1];
    if (!id) continue;
    preferTotalRow(perGameById, id, {
      bref_id: id,
      name: cell(row, 'name_display') || cell(row, 'player'),
      age: numberFrom(cell(row, 'age')),
      team: cell(row, 'team_name_abbr'),
      position: cell(row, 'pos'),
      games: numberFrom(cell(row, 'g')) ?? numberFrom(cell(row, 'games')),
      minutesPerGame: numberFrom(cell(row, 'mp_per_g')),
      pointsPerGame: numberFrom(cell(row, 'pts_per_g')),
      reboundsPerGame: numberFrom(cell(row, 'trb_per_g')),
      assistsPerGame: numberFrom(cell(row, 'ast_per_g')),
      stealsPerGame: numberFrom(cell(row, 'stl_per_g')),
      blocksPerGame: numberFrom(cell(row, 'blk_per_g')),
      fieldGoalPct: pct(cell(row, 'fg_pct')),
      effectiveFieldGoalPct: pct(cell(row, 'efg_pct')),
      threePointPct: pct(cell(row, 'fg3_pct')),
      threePointAttemptsPerGame: numberFrom(cell(row, 'fg3a_per_g')),
      freeThrowPct: pct(cell(row, 'ft_pct')),
      freeThrowAttemptsPerGame: numberFrom(cell(row, 'fta_per_g')),
    });
  }

  for (const row of parseRows(advancedHtml, 'advanced')) {
    if (row.includes('thead')) continue;
    const id = row.match(/data-append-csv="([^"]+)"/)?.[1];
    if (!id) continue;
    preferTotalRow(advancedById, id, {
      bref_id: id,
      team: cell(row, 'team_name_abbr'),
      playerEfficiencyRating: numberFrom(cell(row, 'per')),
      trueShootingPct: pct(cell(row, 'ts_pct')),
      effectiveFieldGoalPct: pct(cell(row, 'efg_pct')),
      usagePct: numberFrom(cell(row, 'usg_pct')),
      assistPct: numberFrom(cell(row, 'ast_pct')),
      turnoverPct: numberFrom(cell(row, 'tov_pct')),
      defensiveWinShares: numberFrom(cell(row, 'dws')),
      winShares: numberFrom(cell(row, 'ws')),
    });
  }

  const players = [...perGameById.values()]
    .map(player => ({ ...player, ...definedEntries(advancedById.get(player.bref_id) || {}) }))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

  const filename = season >= 2025
    ? `data/nba/current-season-stats-${season}.json`
    : `data/nba/season-stats-${season}.json`;
  writeFileSync(filename, `${JSON.stringify({
    season,
    source: `Basketball Reference NBA_${season} per_game and advanced tables`,
    players,
  }, null, 2)}\n`);
  return { season, count: players.length };
}

const [poolResults, statResults] = await Promise.all([
  Promise.all(NBA_POOL_EXPORTS.map(exportPool)),
  Promise.all(NBA_STAT_SEASONS.map(exportSeasonStats)),
]);

console.log(`Exported pools: ${poolResults.map(result => `${result.key}=${result.count}`).join(', ')}`);
console.log(`Exported stats: ${statResults.map(result => `${result.season}=${result.count}`).join(', ')}`);
process.exit(0);
