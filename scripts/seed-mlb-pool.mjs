// Seed the MLB player pool for Franchise Mobile leagues.
//
// Source:  MLB's official free Stats API (statsapi.mlb.com) — no key needed.
// Writes:  era_player_pools/mlb  (same shape as the NBA pools, so team-select
//          and rosters consume it identically — { players: [...] }).
//
// Players are keyed to your MLB_TEAMS abbreviations via stable numeric team IDs
// (not the API's abbreviation strings), so there are no team-mismatch issues.
//
// USAGE:
//   node scripts/seed-mlb-pool.mjs --dry-run   (fetch + print counts, NO write)
//   node scripts/seed-mlb-pool.mjs             (writes era_player_pools/mlb)
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
const seasonArg = process.argv.find(a => a.startsWith('--season='));
const SEASON = seasonArg ? parseInt(seasonArg.split('=')[1], 10) : 2026;

// Stable MLB Stats API team IDs -> your MLB_TEAMS abbreviations.
const TEAM_ID_TO_ABBR = {
  108: 'LAA', 109: 'ARI', 110: 'BAL', 111: 'BOS', 112: 'CHC',
  113: 'CIN', 114: 'CLE', 115: 'COL', 116: 'DET', 117: 'HOU',
  118: 'KC',  119: 'LAD', 120: 'WSH', 121: 'NYM', 133: 'ATH',
  134: 'PIT', 135: 'SD',  136: 'SEA', 137: 'SF',  138: 'STL',
  139: 'TB',  140: 'TEX', 141: 'TOR', 142: 'MIN', 143: 'PHI',
  144: 'ATL', 145: 'CWS', 146: 'MIA', 147: 'NYY', 158: 'MIL',
};

function splitName(full) {
  const parts = (full || '').trim().split(/\s+/);
  return { first_name: parts[0] || '', last_name: parts.slice(1).join(' ') || '' };
}

async function fetchRoster(teamId) {
  const url = `https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=40Man&season=${SEASON}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'FranchiseSocial/1.0' } });
  if (!res.ok) throw new Error(`roster ${teamId} HTTP ${res.status}`);
  const json = await res.json();
  return json.roster || [];
}

async function main() {
  const players = [];
  const ids = Object.keys(TEAM_ID_TO_ABBR).map(Number);

  for (const teamId of ids) {
    const abbr = TEAM_ID_TO_ABBR[teamId];
    try {
      const roster = await fetchRoster(teamId);
      for (const r of roster) {
        const fullName = r.person?.fullName || '';
        if (!fullName) continue;
        const { first_name, last_name } = splitName(fullName);
        players.push({
          full_name: fullName,
          first_name,
          last_name,
          team: abbr,
          position: r.position?.abbreviation || '',
          player_id: String(r.person?.id || ''),
        });
      }
      console.log(`${abbr}: ${roster.length} players`);
    } catch (e) {
      console.log(`${abbr}: FAILED — ${e.message}`);
    }
  }

  console.log(`\nTotal MLB pool: ${players.length} players across ${ids.length} teams`);

  if (DRY_RUN) {
    console.log('\n--dry-run: not writing. Sample entries:');
    players.slice(0, 5).forEach(p => console.log('  ', JSON.stringify(p)));
    process.exit(0);
  }

  await setDoc(doc(db, 'era_player_pools', 'mlb'), {
    sport: 'mlb',
    season: SEASON,
    players,
    updatedAt: new Date().toISOString(),
  });
  console.log('\n✓ Wrote era_player_pools/mlb');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
