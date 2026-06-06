// ─────────────────────────────────────────────────────────────────────────
// backfill-era-salaries.mjs
//
// Adds a `salary` to every player in era_player_pools/{era} for the five
// historical eras, then sweeps already-claimed rosters in leagues/*/teams/*
// so existing leagues get salaries too.
//
// HOW SALARIES ARE SET:
//   Salaries are scaled from each player's real per-game production (points,
//   with a small minutes weight) into that era's real salary cap. The top
//   scorer in an era lands near a max contract (~32% of the era cap); role
//   players sit near the era minimum. This mirrors NBA 2K's MyNBA Eras, where
//   the cap economy is scaled per era so trade value stays proportional.
//
//   This is NOT a database of exact historical contracts (those aren't
//   reliably available per-player for these seasons). It's a production-based
//   model anchored to the real per-era cap — consistent, and good for the
//   "equal value" trade-matching the app uses (a 125% ratio between sides).
//
// SAFE TO RE-RUN. Pass --dry-run to preview without writing.
//
// USAGE (on your Mac, from the repo root):
//   node scripts/backfill-era-salaries.mjs --dry-run
//   node scripts/backfill-era-salaries.mjs
// ─────────────────────────────────────────────────────────────────────────

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import https from 'https';

const app = initializeApp({
  apiKey: "AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY",
  projectId: "association-social",
});
const db = getFirestore(app);

const DRY_RUN = process.argv.includes('--dry-run');

// Real per-era cap + minimum (keep in sync with constants/eraCaps.ts)
const ERA_CAP = {
  magic_bird: 3_600_000,
  jordan: 12_500_000,
  kobe: 40_271_000,
  lebron: 58_044_000,
  steph: 94_143_000,
};
const ERA_MIN = {
  magic_bird: 75_000,
  jordan: 150_000,
  kobe: 366_000,
  lebron: 473_000,
  steph: 543_000,
};

// Era -> season (year the season ENDS) + the per-game page (same source the
// pools were originally built from).
const ERAS = [
  { era: 'magic_bird', season: 1984, url: '/leagues/NBA_1984_per_game.html' },
  { era: 'jordan',     season: 1992, url: '/leagues/NBA_1992_per_game.html' },
  { era: 'kobe',       season: 2003, url: '/leagues/NBA_2003_per_game.html' },
  { era: 'lebron',     season: 2011, url: '/leagues/NBA_2011_per_game.html' },
  { era: 'steph',      season: 2017, url: '/leagues/NBA_2017_per_game.html' },
];

const MAX_SHARE = 0.32;   // top scorer ≈ 32% of the era cap (a max-ish deal)
const CURVE = 1.5;        // convexity: few big salaries, many small (realistic)

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'www.basketball-reference.com',
      path: url,
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.end();
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Parse the per-game page into { player_id -> { pts, mp } }, keeping the best
// (highest-minute) row when a player was traded mid-season (multiple rows).
function parseProduction(html, year) {
  const uncommented = html.replace(/<!--([\s\S]*?)-->/g, '$1');
  const tbodyStart = uncommented.indexOf('<tbody>');
  const tableEnd = uncommented.indexOf('</table>', tbodyStart);
  const tbody = uncommented.slice(tbodyStart, tableEnd);
  const rows = tbody.match(/<tr[\s\S]*?<\/tr>/g) || [];

  const out = {};
  for (const row of rows) {
    if (row.includes('thead')) continue;
    const csv = row.match(/data-append-csv="([^"]+)"/);
    if (!csv) continue;
    const playerId = `pool_${year}_${csv[1]}`;
    const ptsM = row.match(/data-stat="pts_per_g"[^>]*>([\d.]+)</);
    const mpM = row.match(/data-stat="mp_per_g"[^>]*>([\d.]+)</);
    const pts = ptsM ? parseFloat(ptsM[1]) : 0;
    const mp = mpM ? parseFloat(mpM[1]) : 0;
    const prev = out[playerId];
    if (!prev || mp > prev.mp) out[playerId] = { pts, mp };
  }
  return out;
}

// Production score -> salary, scaled to the era cap. leadScore is the era's max.
function scaleSalary(score, leadScore, era) {
  const cap = ERA_CAP[era];
  const min = ERA_MIN[era];
  if (!leadScore || score <= 0) return min;
  const norm = Math.min(1, score / leadScore);
  const max = Math.round(cap * MAX_SHARE);
  const sal = min + (max - min) * Math.pow(norm, CURVE);
  // Round to a tidy figure
  return Math.max(min, Math.round(sal / 50000) * 50000);
}

// Score blends scoring (primary) with a little minutes (rotation weight).
const scoreOf = (p) => (p?.pts || 0) + (p?.mp || 0) * 0.15;

async function main() {
  console.log(`\n=== Era salary backfill ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'} ===\n`);

  for (const { era, season, url } of ERAS) {
    console.log(`\n--- ${era} (${season}) ---`);
    const poolRef = doc(db, 'era_player_pools', era);
    const poolSnap = await getDoc(poolRef);
    if (!poolSnap.exists()) { console.log('  pool missing, skipping'); continue; }
    const pool = poolSnap.data();
    const players = pool.players || [];
    if (players.length === 0) { console.log('  no players in pool, skipping'); continue; }

    console.log(`  fetching production for ${players.length} players...`);
    const prod = parseProduction(await fetchPage(url), season);
    await sleep(3000); // be polite to basketball-reference

    // Era's top production score (the anchor for "max contract")
    let lead = 0;
    for (const p of players) {
      const s = scoreOf(prod[p.player_id]);
      if (s > lead) lead = s;
    }

    let filled = 0, floored = 0;
    const updated = players.map((p) => {
      const pr = prod[p.player_id];
      const score = scoreOf(pr);
      const salary = scaleSalary(score, lead, era);
      if (pr && score > 0) filled++; else floored++;
      return { ...p, salary };
    });

    const top = [...updated].sort((a, b) => (b.salary || 0) - (a.salary || 0)).slice(0, 3)
      .map(p => `${p.full_name} $${(p.salary / 1e6).toFixed(1)}M`).join(', ');
    console.log(`  ${filled} from production, ${floored} at era minimum`);
    console.log(`  top: ${top}`);

    if (!DRY_RUN) {
      await setDoc(poolRef, { ...pool, players: updated }, { merge: true });
      console.log('  ✓ pool updated');
    }
  }

  // NOTE: Existing leagues are intentionally NOT swept here. New team
  // selections copy salaries straight from the era pools above, and an
  // anonymous client can't write into leagues/*/teams (security rules limit
  // that to league members). If you ever need to patch already-claimed
  // rosters, run a version of this with the Firebase Admin SDK.

  console.log('Done. Era pools updated — new team selections will include salaries.');
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
