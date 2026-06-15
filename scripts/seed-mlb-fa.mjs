// Seed the MLB FREE-AGENT pool — players who appeared in 2024 (fullSeason roster)
// but are NOT on the current 40-man (already in era_player_pools/mlb). These are
// the signable depth/fringe players.
//
// Reads:   era_player_pools/mlb   (to know who's already rostered)
// Writes:  era_player_pools/mlb_fa
//
// USAGE:
//   node scripts/seed-mlb-fa.mjs --dry-run
//   node scripts/seed-mlb-fa.mjs
//
// NOTE: requires the era_player_pools write rule open during the real write.

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

const app = initializeApp({ apiKey: 'AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY', projectId: 'association-social' });
const db = getFirestore(app);

const DRY_RUN = process.argv.includes('--dry-run');
const seasonArg = process.argv.find(a => a.startsWith('--season='));
const SEASON = seasonArg ? parseInt(seasonArg.split('=')[1], 10) : 2025;

const TEAM_ID_TO_ABBR = {
  108: 'LAA', 109: 'ARI', 110: 'BAL', 111: 'BOS', 112: 'CHC', 113: 'CIN', 114: 'CLE',
  115: 'COL', 116: 'DET', 117: 'HOU', 118: 'KC', 119: 'LAD', 120: 'WSH', 121: 'NYM',
  133: 'ATH', 134: 'PIT', 135: 'SD', 136: 'SEA', 137: 'SF', 138: 'STL', 139: 'TB',
  140: 'TEX', 141: 'TOR', 142: 'MIN', 143: 'PHI', 144: 'ATL', 145: 'CWS', 146: 'MIA',
  147: 'NYY', 158: 'MIL',
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function splitName(full) { const p = (full || '').trim().split(/\s+/); return { first_name: p[0] || '', last_name: p.slice(1).join(' ') || '' }; }

async function fetchRoster(teamId, type) {
  const url = `https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=${type}&season=${SEASON}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'FranchiseSocial/1.0' } });
  if (!res.ok) throw new Error(`roster ${teamId} HTTP ${res.status}`);
  return (await res.json()).roster || [];
}

async function main() {
  // Existing 40-man player IDs (already rostered — exclude these).
  const mainSnap = await getDoc(doc(db, 'era_player_pools', 'mlb'));
  if (!mainSnap.exists()) { console.error('era_player_pools/mlb not found — run seed-mlb-pool.mjs first'); process.exit(1); }
  const rostered = new Set((mainSnap.data().players || []).map((p) => String(p.player_id)));
  console.log(`Already rostered (40-man): ${rostered.size}`);

  const players = [];
  for (const [teamId, abbr] of Object.entries(TEAM_ID_TO_ABBR)) {
    try {
      const roster = await fetchRoster(teamId, 'fullSeason');
      let added = 0;
      for (const r of roster) {
        const id = String(r.person?.id || '');
        if (!id || rostered.has(id)) continue; // skip 40-man players
        const fullName = r.person?.fullName || '';
        if (!fullName) continue;
        const { first_name, last_name } = splitName(fullName);
        players.push({ full_name: fullName, first_name, last_name, team: '', former_team: abbr, position: r.position?.abbreviation || '', player_id: id });
        added++;
      }
      console.log(`${abbr}: +${added} free agents`);
    } catch (e) { console.log(`${abbr}: FAILED — ${e.message}`); }
    await sleep(120);
  }

  console.log(`\nMLB free agents (fullSeason minus 40-man): ${players.length}`);
  if (DRY_RUN) {
    console.log('\n--dry-run: not writing. Samples:');
    players.slice(0, 6).forEach(p => console.log('  ', JSON.stringify({ name: p.full_name, pos: p.position, from: p.former_team })));
    process.exit(0);
  }
  await setDoc(doc(db, 'era_player_pools', 'mlb_fa'), { sport: 'mlb', kind: 'free_agents', season: SEASON, players, updatedAt: new Date().toISOString() });
  console.log('✓ Wrote era_player_pools/mlb_fa');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
