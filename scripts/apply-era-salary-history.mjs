// ─────────────────────────────────────────────────────────────────────────
// apply-era-salary-history.mjs
//
// Reads the Kaggle "NBA salaries 1985-2018" dataset (two CSV files) and writes
// a real, year-by-year `salaryByYear` map onto every matching player in the
// era_player_pools. As a league advances seasons, advance-season.tsx reads
// salaryByYear[seasonStartYear] so each player's salary tracks their actual
// historical contract. Players/years with no real data keep the
// production-scaled `salary` from backfill-era-salaries.mjs (the estimate).
//
// SETUP (one time):
//   1. Download the dataset from Kaggle — search "NBA players salaries 1985 2018".
//      You need two files:  players.csv   and   salaries_1985to2018.csv
//   2. Put BOTH files in your project root (~/AssociationManager/), next to package.json.
//   3. Unlock the data rules (paste firestore-rules-UNLOCKED.rules, Publish).
//
// RUN (from the repo root):
//   node scripts/apply-era-salary-history.mjs --dry-run
//   node scripts/apply-era-salary-history.mjs
//
// AFTER: re-lock the rules (paste firestore-rules-LOCKED.rules, Publish).
// SAFE TO RE-RUN. Pass --dry-run to preview without writing.
// ─────────────────────────────────────────────────────────────────────────

import { initializeApp } from 'firebase/app';
import { initializeFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

const app = initializeApp({
  apiKey: "AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY",
  projectId: "association-social",
});
const db = initializeFirestore(app, { ignoreUndefinedProperties: true });

const DRY_RUN = process.argv.includes('--dry-run');

// Era -> [first season-start year, last season-start year] the league can reach.
// (Matches currentYear / ERA_MAX_YEAR in advance-season.tsx; season-start basis.)
const ERA_RANGE = {
  magic_bird: [1983, 1991],
  jordan: [1991, 2002],
  kobe: [2002, 2010],
  lebron: [2010, 2016],
  steph: [2016, 2023], // 2016-2017 from the Kaggle file; 2018-2023 from salaries_extra.csv if present
};

// ---- locate the two CSVs (project root by default, with a few fallbacks) ----
function findFile(names) {
  const dirs = ['.', './data', process.env.HOME + '/Downloads'];
  for (const d of dirs) for (const n of names) {
    const p = path.join(d, n);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// ---- tiny CSV parser (handles quoted fields with commas) ----
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const norm = (s) => (s || '')
  .toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')        // strip accents
  .replace(/[.'`]/g, '')
  .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')                  // drop suffixes
  .replace(/[^a-z0-9 ]/g, ' ')
  .replace(/\s+/g, ' ').trim();

// find a header index by trying several possible column names
const col = (headers, ...names) => {
  const h = headers.map(x => x.toLowerCase().trim());
  for (const n of names) { const i = h.indexOf(n); if (i >= 0) return i; }
  return -1;
};

function main() {
  console.log(`\n=== Apply era salary history ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'} ===\n`);

  const playersPath = findFile(['players.csv']);
  const salariesPath = findFile(['salaries_1985to2018.csv', 'salaries.csv']);
  if (!playersPath || !salariesPath) {
    console.error('Could not find the CSVs. Put players.csv and salaries_1985to2018.csv in the project root.');
    console.error('  players.csv  ->', playersPath || 'NOT FOUND');
    console.error('  salaries.csv ->', salariesPath || 'NOT FOUND');
    process.exit(1);
  }
  console.log('players:  ', playersPath);
  console.log('salaries: ', salariesPath, '\n');

  // players.csv -> id => name
  const pRows = parseCSV(fs.readFileSync(playersPath, 'utf8'));
  const pHead = pRows[0];
  const pIdIdx = col(pHead, 'id', '_id');
  const pNameIdx = col(pHead, 'name', 'player', 'full_name');
  const idToName = {};
  for (let i = 1; i < pRows.length; i++) {
    const r = pRows[i]; if (!r || r.length <= Math.max(pIdIdx, pNameIdx)) continue;
    idToName[r[pIdIdx]] = r[pNameIdx];
  }

  // salaries.csv -> normName => { year: salary }
  const sRows = parseCSV(fs.readFileSync(salariesPath, 'utf8'));
  const sHead = sRows[0];
  const sPidIdx = col(sHead, 'player_id', 'playerid', 'id');
  const sSalIdx = col(sHead, 'salary');
  const sYrIdx = col(sHead, 'season_start', 'seasonstart', 'year', 'season');
  const byName = {}; // normName -> { year: salary }
  for (let i = 1; i < sRows.length; i++) {
    const r = sRows[i]; if (!r || r.length <= Math.max(sPidIdx, sSalIdx, sYrIdx)) continue;
    const name = idToName[r[sPidIdx]];
    if (!name) continue;
    let yr = parseInt(String(r[sYrIdx]).slice(0, 4), 10);
    const sal = Math.round(parseFloat(r[sSalIdx]));
    if (!yr || !sal || sal <= 0) continue;
    const key = norm(name);
    (byName[key] = byName[key] || {})[yr] = sal;
  }
  console.log('salary records indexed for', Object.keys(byName).length, 'players\n');

  // ---- optional: extra single-file salary CSV (e.g. 2018-2025) to extend Steph ----
  // Drop any salary CSV with a player-name, season/year, and salary column into the
  // project root (rename it salaries_extra.csv). Columns are auto-detected.
  const extraPath = findFile(['salaries_extra.csv', 'salaries_2018to2025.csv', 'NBA Player Salaries_2000-2025.csv']);
  if (extraPath) {
    const xRows = parseCSV(fs.readFileSync(extraPath, 'utf8'));
    const xHead = xRows[0] || [];
    const xName = col(xHead, 'player', 'name', 'full_name', 'player name', 'playername');
    const xSal = col(xHead, 'salary', 'cap hit', 'cap_hit', 'amount', 'value');
    const xYr = col(xHead, 'season_start', 'season', 'year');
    if (xName < 0 || xSal < 0 || xYr < 0) {
      console.log('⚠ extra file found but columns not recognized. Headers:', xHead.join(' | '));
      console.log('  (need a name col, a season/year col, and a salary col)\n');
    } else {
      let added = 0;
      for (let i = 1; i < xRows.length; i++) {
        const r = xRows[i]; if (!r || r.length <= Math.max(xName, xSal, xYr)) continue;
        const nm = String(r[xName]).replace(/\([^)]*\)/g, '').replace(/,\s*[A-Za-z]{1,3}\s*$/, '').trim();
        const yr = parseInt(String(r[xYr]).slice(0, 4), 10);
        const sal = Math.round(parseFloat(String(r[xSal]).replace(/[^0-9.]/g, '')));
        if (!nm || !yr || !sal || sal <= 0) continue;
        (byName[norm(nm)] = byName[norm(nm)] || {})[yr] = sal;
        added++;
      }
      console.log('extra salary file:', extraPath, '→ merged', added, 'records\n');
    }
  } else {
    console.log('(no salaries_extra.csv found — Steph 2018-2023 stays on estimates)\n');
  }

  let totalMatched = 0, totalPlayers = 0;

  (async () => {
    for (const [era, [y0, y1]] of Object.entries(ERA_RANGE)) {
      const ref = doc(db, 'era_player_pools', era);
      const snap = await getDoc(ref);
      if (!snap.exists()) { console.log(`--- ${era}: pool missing, skip`); continue; }
      const pool = snap.data();
      const players = pool.players || [];
      let matched = 0;

      const updated = players.map((p) => {
        totalPlayers++;
        const curve = byName[norm(p.full_name)];
        if (!curve) return p;
        // keep only years this era can actually reach
        const salaryByYear = {};
        for (let y = y0; y <= y1; y++) if (curve[y] != null) salaryByYear[String(y)] = curve[y];
        if (Object.keys(salaryByYear).length === 0) return p;
        matched++;
        // set the starting-season salary to the real number if we have it
        const startSal = salaryByYear[String(y0)] != null ? salaryByYear[String(y0)] : p.salary;
        return { ...p, salaryByYear, salary: startSal };
      });

      totalMatched += matched;
      const sample = updated.filter(p => p.salaryByYear).slice(0, 3)
        .map(p => `${p.full_name} (${Object.keys(p.salaryByYear).length}yr)`).join(', ');
      console.log(`--- ${era} (${y0}-${y1}): ${matched}/${players.length} players got real curves`);
      if (sample) console.log(`    e.g. ${sample}`);

      if (!DRY_RUN) {
        await setDoc(ref, { ...pool, players: updated }, { merge: true });
        console.log('    ✓ pool updated');
      }
    }

    console.log(`\n${totalMatched}/${totalPlayers} pool players matched a real salary curve.`);
    console.log('Unmatched players keep their production-scaled salary (the estimate).');
    console.log('Done.');
    process.exit(0);
  })().catch(e => { console.error('FATAL:', e); process.exit(1); });
}

main();
