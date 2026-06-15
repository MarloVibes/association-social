// Enrich the MLB player pool with 2024 season stats so the baseball archetype
// engine can produce rich labels (ACE, CLOSER, POWER HITTER, SPEEDSTER, etc.)
// instead of position-only fallbacks.
//
// Source:  MLB Stats API multi-player hydrate endpoint (batched, ~25 at a time).
// Reads:   era_player_pools/mlb  (must already be seeded by seed-mlb-pool.mjs)
// Writes:  era_player_pools/mlb  (same doc, players now carry hr/avg/sb/era/saves/so)
//
// USAGE:
//   node scripts/seed-mlb-stats.mjs --dry-run   (fetch + report, NO write)
//   node scripts/seed-mlb-stats.mjs             (writes enriched pool back)
//
// NOTE: writing era_player_pools requires the write rule open (allow write: if true),
// then set it back to false after — same as the pool seed.

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

const app = initializeApp({
  apiKey: 'AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY',
  projectId: 'association-social',
});
const db = getFirestore(app);

const DRY_RUN = process.argv.includes('--dry-run');
const seasonArg = process.argv.find(a => a.startsWith('--season='));
const SEASON = seasonArg ? parseInt(seasonArg.split('=')[1], 10) : 2025;
const BATCH = 25;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchStatsBatch(ids) {
  const url = `https://statsapi.mlb.com/api/v1/people?personIds=${ids.join(',')}` +
    `&hydrate=stats(group=[hitting,pitching],type=[season],season=${SEASON})`;
  const res = await fetch(url, { headers: { 'User-Agent': 'FranchiseSocial/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.people || [];
}

// Sum counting stats across splits (handles mid-season trades); take rate stats
// (avg, era) from the split with the most games / innings.
function aggregate(group) {
  const splits = group?.splits || [];
  if (!splits.length) return null;
  let hr = 0, sb = 0, saves = 0, so = 0, bestG = -1, avg = null, era = null;
  for (const s of splits) {
    const st = s.stat || {};
    hr += parseInt(st.homeRuns) || 0;
    sb += parseInt(st.stolenBases) || 0;
    saves += parseInt(st.saves) || 0;
    so += parseInt(st.strikeOuts) || 0;
    const g = parseInt(st.gamesPlayed) || 0;
    if (g > bestG) { bestG = g; avg = st.avg; era = st.era; }
  }
  return { hr, sb, saves, so, avg, era };
}

async function main() {
  const poolRef = doc(db, 'era_player_pools', 'mlb');
  const snap = await getDoc(poolRef);
  if (!snap.exists()) { console.error('era_player_pools/mlb not found — run seed-mlb-pool.mjs first'); process.exit(1); }
  const data = snap.data();
  const players = data.players || [];
  console.log(`Loaded ${players.length} players from era_player_pools/mlb`);

  const byId = new Map();
  players.forEach((p, i) => { if (p.player_id) byId.set(String(p.player_id), i); });
  const ids = [...byId.keys()];

  let hitters = 0, pitchers = 0, failedBatches = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    try {
      const people = await fetchStatsBatch(chunk);
      for (const person of people) {
        const idx = byId.get(String(person.id));
        if (idx === undefined) continue;
        for (const grp of person.stats || []) {
          const name = grp.group?.displayName;
          const agg = aggregate(grp);
          if (!agg) continue;
          if (name === 'hitting') {
            players[idx] = { ...players[idx], hr: agg.hr, sb: agg.sb, avg: agg.avg };
            hitters++;
          } else if (name === 'pitching') {
            players[idx] = { ...players[idx], era: agg.era, saves: agg.saves, so: agg.so };
            pitchers++;
          }
        }
      }
      process.stdout.write(`\rprocessed ${Math.min(i + BATCH, ids.length)}/${ids.length}`);
    } catch (e) {
      failedBatches++;
      console.log(`\nbatch ${i}-${i + BATCH} FAILED: ${e.message}`);
    }
    await sleep(120);
  }

  console.log(`\n\nEnriched: ${hitters} hitting lines, ${pitchers} pitching lines, ${failedBatches} failed batches`);

  if (DRY_RUN) {
    console.log('\n--dry-run: not writing. Sample enriched players:');
    players.filter(p => p.hr !== undefined || p.era !== undefined).slice(0, 6)
      .forEach(p => console.log('  ', JSON.stringify({ name: p.full_name, pos: p.position, hr: p.hr, avg: p.avg, sb: p.sb, era: p.era, saves: p.saves, so: p.so })));
    process.exit(0);
  }

  await setDoc(poolRef, { ...data, players, statsSeason: SEASON, statsUpdatedAt: new Date().toISOString() });
  console.log('✓ Wrote enriched era_player_pools/mlb');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
