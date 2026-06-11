// Enrich the NFL player pool with 2024 season stats so the football archetype
// engine produces rich labels (GUNSLINGER, DUAL-THREAT QB, WR1, ELITE PASS RUSHER)
// instead of position-only fallbacks.
//
// Source:  nflverse weekly player stats (offense + defense CSVs), summed to season.
// Reads:   era_player_pools/madden  (must already be seeded by seed-nfl-pool.mjs)
// Writes:  era_player_pools/madden  (players now carry passing/rushing/receiving + sacks)
//
// USAGE:
//   node scripts/seed-nfl-stats.mjs --dry-run
//   node scripts/seed-nfl-stats.mjs
//
// NOTE: requires the era_player_pools write rule open during the real write.
// If a fetch 404s, the nflverse asset filename may differ — paste the error and
// we adjust the URL (the data moves release tags occasionally).

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

const app = initializeApp({
  apiKey: 'AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY',
  projectId: 'association-social',
});
const db = getFirestore(app);

const DRY_RUN = process.argv.includes('--dry-run');
const SEASON = 2024;
const OFF_URL = `https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_${SEASON}.csv`;
const DEF_URL = `https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_def_${SEASON}.csv`;

function parseCSV(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.length) continue;
    const cells = [];
    let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (c === ',' && !q) { cells.push(cur); cur = ''; }
      else cur += c;
    }
    cells.push(cur);
    rows.push(cells);
  }
  return rows;
}

async function fetchCSV(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return parseCSV(await res.text());
}

// Sum a numeric column across all weekly rows, keyed by player_id.
function sumByPlayer(rows, idCol, statCols) {
  const header = rows[0];
  const iId = header.indexOf(idCol);
  const idxs = {};
  for (const [field, names] of Object.entries(statCols)) {
    idxs[field] = names.map(n => header.indexOf(n)).find(i => i !== -1) ?? -1;
  }
  const totals = {};
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const id = row[iId];
    if (!id) continue;
    if (!totals[id]) totals[id] = {};
    for (const [field, i] of Object.entries(idxs)) {
      if (i === -1) continue;
      totals[id][field] = (totals[id][field] || 0) + (parseFloat(row[i]) || 0);
    }
  }
  return totals;
}

async function main() {
  const poolRef = doc(db, 'era_player_pools', 'madden');
  const snap = await getDoc(poolRef);
  if (!snap.exists()) { console.error('era_player_pools/madden not found — run seed-nfl-pool.mjs first'); process.exit(1); }
  const data = snap.data();
  const players = data.players || [];
  console.log(`Loaded ${players.length} players from era_player_pools/madden`);

  console.log('Fetching offense stats...');
  const offRows = await fetchCSV(OFF_URL);
  const off = sumByPlayer(offRows, 'player_id', {
    passing_yards: ['passing_yards'],
    passing_tds: ['passing_tds'],
    rushing_yards: ['rushing_yards'],
    receiving_yards: ['receiving_yards'],
  });

  console.log('Fetching defense stats...');
  let def = {};
  try {
    const defRows = await fetchCSV(DEF_URL);
    def = sumByPlayer(defRows, 'player_id', { sacks: ['def_sacks', 'sacks'] });
  } catch (e) { console.log(`defense stats skipped: ${e.message}`); }

  let enriched = 0;
  players.forEach((p, i) => {
    const id = String(p.player_id || '');
    const o = off[id], d = def[id];
    if (!o && !d) return;
    players[i] = {
      ...p,
      ...(o ? { passing_yards: Math.round(o.passing_yards || 0), passing_tds: Math.round(o.passing_tds || 0), rushing_yards: Math.round(o.rushing_yards || 0), receiving_yards: Math.round(o.receiving_yards || 0) } : {}),
      ...(d ? { sacks: d.sacks || 0 } : {}),
    };
    enriched++;
  });

  console.log(`\nEnriched ${enriched}/${players.length} players with stats`);

  if (DRY_RUN) {
    console.log('\n--dry-run: not writing. Sample enriched players:');
    players.filter(p => p.passing_yards || p.rushing_yards || p.receiving_yards || p.sacks)
      .slice(0, 8)
      .forEach(p => console.log('  ', JSON.stringify({ name: p.full_name, pos: p.position, passYds: p.passing_yards, passTds: p.passing_tds, rushYds: p.rushing_yards, recYds: p.receiving_yards, sacks: p.sacks })));
    process.exit(0);
  }

  await setDoc(poolRef, { ...data, players, statsSeason: SEASON, statsUpdatedAt: new Date().toISOString() });
  console.log('✓ Wrote enriched era_player_pools/madden');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
