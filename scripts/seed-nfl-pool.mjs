// Seed the NFL player pool for Franchise Social (Madden leagues).
//
// Source:  nflverse open data (CSV on GitHub releases) — free, automated, no key.
// Writes:  era_player_pools/madden  (same shape as the NBA/MLB pools, so
//          team-select and rosters consume it identically — { players: [...] }).
//
// USAGE:
//   node scripts/seed-nfl-pool.mjs --dry-run   (fetch + print counts, NO write)
//   node scripts/seed-nfl-pool.mjs             (writes era_player_pools/madden)
//
// NOTE: writing era_player_pools requires the write rule open. In the Firebase
// Console, temporarily set  match /era_player_pools/{era} { allow write: if true; }
// run this once, then set it back to  allow write: if false;

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const app = initializeApp({
  apiKey: 'AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY',
  projectId: 'association-social',
});
const db = getFirestore(app);

const DRY_RUN = process.argv.includes('--dry-run');
const SEASON = 2024;
const ROSTER_URL = `https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${SEASON}.csv`;

// Our NFL_TEAMS keys (the 32 valid teams).
const VALID = new Set(['BUF','MIA','NE','NYJ','BAL','CIN','CLE','PIT','HOU','IND','JAX','TEN','DEN','KC','LV','LAC','DAL','NYG','PHI','WAS','CHI','DET','GB','MIN','ATL','CAR','NO','TB','ARI','LAR','SF','SEA']);

// Roster statuses to KEEP. Default = realistic rosters (active + reserve/IR/PUP),
// which drops practice squad, retired, and cut players.
//   Realistic:  ['ACT','RES','PUP','EXE','NON','SUS']
//   Deeper:     add 'DEV' (practice squad) for more draftable depth.
const KEEP_STATUS = new Set(['ACT', 'RES', 'PUP', 'EXE', 'NON', 'SUS']);

// nflverse abbreviation -> our abbreviation (only differences need mapping).
function normTeam(t) {
  const map = { LA: 'LAR', SD: 'LAC', OAK: 'LV', STL: 'LAR', WSH: 'WAS' };
  return map[t] || t;
}

// Minimal CSV parser that respects double-quoted fields (handles commas inside).
function parseCSV(text) {
  const rows = [];
  const lines = text.split(/\r?\n/).filter(l => l.length);
  for (const line of lines) {
    const cells = [];
    let cur = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (c === ',' && !inQuotes) {
        cells.push(cur); cur = '';
      } else cur += c;
    }
    cells.push(cur);
    rows.push(cells);
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
  const col = (name) => header.indexOf(name);
  const iTeam = col('team');
  const iPos = col('position');
  const iFull = col('full_name');
  const iFirst = col('first_name');
  const iLast = col('last_name');
  const iStatus = col('status');
  const iId = col('gsis_id') !== -1 ? col('gsis_id') : col('espn_id');

  const players = [];
  const counts = {};
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const team = normTeam((row[iTeam] || '').toUpperCase());
    if (!VALID.has(team)) continue;
    const status = (iStatus !== -1 ? (row[iStatus] || '') : '').toUpperCase();
    if (status && !KEEP_STATUS.has(status)) continue;
    const full = iFull !== -1 ? row[iFull] : `${row[iFirst]} ${row[iLast]}`;
    if (!full || !full.trim()) continue;
    const { first_name, last_name } = splitName(full);
    players.push({
      full_name: full.trim(),
      first_name: iFirst !== -1 ? row[iFirst] : first_name,
      last_name: iLast !== -1 ? row[iLast] : last_name,
      team,
      position: (iPos !== -1 ? row[iPos] : '') || '',
      player_id: iId !== -1 ? (row[iId] || '') : '',
      status: iStatus !== -1 ? (row[iStatus] || '') : '',
    });
    counts[team] = (counts[team] || 0) + 1;
  }

  Object.keys(counts).sort().forEach(t => console.log(`${t}: ${counts[t]} players`));
  console.log(`\nTotal NFL pool: ${players.length} players across ${Object.keys(counts).length} teams`);

  if (DRY_RUN) {
    console.log('\n--dry-run: not writing. Sample entries:');
    players.slice(0, 5).forEach(p => console.log('  ', JSON.stringify(p)));
    process.exit(0);
  }

  await setDoc(doc(db, 'era_player_pools', 'madden'), {
    sport: 'madden',
    season: SEASON,
    players,
    updatedAt: new Date().toISOString(),
  });
  console.log('\n✓ Wrote era_player_pools/madden');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
