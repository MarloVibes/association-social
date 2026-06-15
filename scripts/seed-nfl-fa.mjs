// Seed the NFL FREE-AGENT pool — practice-squad players (status DEV) that were
// filtered out of the main roster pool. These become signable depth from day one.
//
// Writes:  era_player_pools/madden_fa  (same player shape as the main pool)
//
// USAGE:
//   node scripts/seed-nfl-fa.mjs --dry-run
//   node scripts/seed-nfl-fa.mjs
//
// NOTE: requires the era_player_pools write rule open during the real write.

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const app = initializeApp({ apiKey: 'AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY', projectId: 'association-social' });
const db = getFirestore(app);

const DRY_RUN = process.argv.includes('--dry-run');
const seasonArg = process.argv.find(a => a.startsWith('--season='));
const SEASON = seasonArg ? parseInt(seasonArg.split('=')[1], 10) : 2025;
const ROSTER_URL = `https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${SEASON}.csv`;

const VALID = new Set(['BUF','MIA','NE','NYJ','BAL','CIN','CLE','PIT','HOU','IND','JAX','TEN','DEN','KC','LV','LAC','DAL','NYG','PHI','WAS','CHI','DET','GB','MIN','ATL','CAR','NO','TB','ARI','LAR','SF','SEA']);
// Free-agent statuses: practice squad + cut players (signable depth).
const FA_STATUS = new Set(['DEV', 'CUT']);

function normTeam(t) { return ({ LA: 'LAR', SD: 'LAC', OAK: 'LV', STL: 'LAR', WSH: 'WAS' })[t] || t; }

function parseCSV(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.length) continue;
    const cells = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (c === ',' && !q) { cells.push(cur); cur = ''; }
      else cur += c;
    }
    cells.push(cur); rows.push(cells);
  }
  return rows;
}

function splitName(full) {
  const parts = (full || '').trim().split(/\s+/);
  return { first_name: parts[0] || '', last_name: parts.slice(1).join(' ') || '' };
}

async function main() {
  console.log(`Fetching ${ROSTER_URL} ...`);
  const res = await fetch(ROSTER_URL, { redirect: 'follow' });
  if (!res.ok) throw new Error(`roster CSV HTTP ${res.status}`);
  const rows = parseCSV(await res.text());
  const header = rows[0];
  const col = (n) => header.indexOf(n);
  const iTeam = col('team'), iPos = col('position'), iFull = col('full_name'),
        iFirst = col('first_name'), iLast = col('last_name'), iStatus = col('status'),
        iId = col('gsis_id') !== -1 ? col('gsis_id') : col('espn_id');

  const players = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const team = normTeam((row[iTeam] || '').toUpperCase());
    if (!VALID.has(team)) continue;
    const status = (iStatus !== -1 ? (row[iStatus] || '') : '').toUpperCase();
    if (!FA_STATUS.has(status)) continue;
    const full = iFull !== -1 ? row[iFull] : `${row[iFirst]} ${row[iLast]}`;
    if (!full || !full.trim()) continue;
    const { first_name, last_name } = splitName(full);
    players.push({
      full_name: full.trim(),
      first_name: iFirst !== -1 ? row[iFirst] : first_name,
      last_name: iLast !== -1 ? row[iLast] : last_name,
      team: '',
      former_team: team,
      position: (iPos !== -1 ? row[iPos] : '') || '',
      player_id: iId !== -1 ? (row[iId] || '') : '',
    });
  }

  console.log(`NFL free agents (practice squad + cut): ${players.length}`);
  if (DRY_RUN) {
    console.log('\n--dry-run: not writing. Samples:');
    players.slice(0, 6).forEach(p => console.log('  ', JSON.stringify({ name: p.full_name, pos: p.position, from: p.former_team })));
    process.exit(0);
  }
  await setDoc(doc(db, 'era_player_pools', 'madden_fa'), { sport: 'madden', kind: 'free_agents', season: SEASON, players, updatedAt: new Date().toISOString() });
  console.log('✓ Wrote era_player_pools/madden_fa');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
