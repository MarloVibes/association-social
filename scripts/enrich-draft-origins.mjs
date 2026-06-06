// enrich-draft-origins.mjs
// Adds high_school + country (+ college if found) to draft_classes players by
// scraping each player's individual basketball-reference page.
//
// By default it only fetches players MISSING a college (the prep-to-pro and
// overseas guys — the actual gap). It's resumable (caches to disk) and rate
// limited so it's polite to bref.
//
// Flags:
//   --dry-run   parse + print, do NOT write to Firestore
//   --all       enrich every drafted player, not just those missing college
//   --from=YYYY --to=YYYY   limit the year range (default 1984..2023)
//
// Run (writes require UNLOCKED rules):
//   node scripts/enrich-draft-origins.mjs --dry-run        # preview first
//   node scripts/enrich-draft-origins.mjs                  # then write

import { initializeApp } from 'firebase/app';
import { getFirestore, initializeFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import https from 'https';
import fs from 'fs';

const app = initializeApp({
  apiKey: 'AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY',
  projectId: 'association-social',
});
let db;
try { db = initializeFirestore(app, { ignoreUndefinedProperties: true }); }
catch { db = getFirestore(app); }

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const ALL = args.includes('--all');
const FROM = parseInt((args.find(a => a.startsWith('--from=')) || '').split('=')[1]) || 1984;
const TO = parseInt((args.find(a => a.startsWith('--to=')) || '').split('=')[1]) || 2023;

const CACHE_PATH = new URL('./.draft-origins-cache.json', import.meta.url);
let cache = {};
try { cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')); } catch { cache = {}; }
const saveCache = () => { try { fs.writeFileSync(CACHE_PATH, JSON.stringify(cache)); } catch {} };

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function fetchPlayer(brefId) {
  const letter = brefId[0];
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'www.basketball-reference.com',
      path: `/players/${letter}/${brefId}.html`,
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'Accept': 'text/html' },
    }, (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d })); });
    req.on('error', reject);
    req.end();
  });
}

const stripTags = (s) => s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

// ISO-3166 alpha-2 -> country name (covers the codes bref uses for intl players)
const COUNTRY = {
  ar: 'Argentina', au: 'Australia', at: 'Austria', ba: 'Bosnia', be: 'Belgium',
  bg: 'Bulgaria', br: 'Brazil', ca: 'Canada', cd: 'DR Congo', ch: 'Switzerland',
  cm: 'Cameroon', cn: 'China', cz: 'Czechia', de: 'Germany', dk: 'Denmark',
  do: 'Dominican Republic', dz: 'Algeria', ee: 'Estonia', eg: 'Egypt', es: 'Spain',
  fi: 'Finland', fr: 'France', gb: 'United Kingdom', ge: 'Georgia', gr: 'Greece',
  hr: 'Croatia', ht: 'Haiti', hu: 'Hungary', il: 'Israel', it: 'Italy',
  jm: 'Jamaica', jp: 'Japan', ke: 'Kenya', kr: 'South Korea', lt: 'Lithuania',
  lv: 'Latvia', mk: 'North Macedonia', mx: 'Mexico', ng: 'Nigeria', nl: 'Netherlands',
  no: 'Norway', nz: 'New Zealand', pl: 'Poland', pr: 'Puerto Rico', pt: 'Portugal',
  ro: 'Romania', rs: 'Serbia', ru: 'Russia', se: 'Sweden', si: 'Slovenia',
  sk: 'Slovakia', sn: 'Senegal', td: 'Chad', tn: 'Tunisia', tr: 'Turkey',
  ua: 'Ukraine', uy: 'Uruguay', uz: 'Uzbekistan', ve: 'Venezuela', vi: 'US Virgin Islands',
  cg: 'Congo', ao: 'Angola', ml: 'Mali', sd: 'Sudan', gn: 'Guinea',
};

function parseOrigins(html) {
  // bio lives in the meta/info block at the top of the page
  const meta = (html.match(/<div[^>]*id=["']meta["'][\s\S]*?<\/div>\s*<\/div>/) || [])[0] || html.slice(0, 20000);

  // High School: "<strong>High School:</strong> <a>St. Vincent-St. Mary</a> in Akron, Ohio"
  let high_school = '';
  const hsBlock = meta.match(/High School:<\/strong>([\s\S]*?)<\/p>/i);
  if (hsBlock) {
    const txt = stripTags(hsBlock[1]);
    high_school = (txt.split(/\s+in\s+/i)[0] || '').trim();
  }

  // College: "<strong>College:</strong> <a>Duke</a>"
  let college = '';
  const colBlock = meta.match(/College:<\/strong>([\s\S]*?)<\/p>/i);
  if (colBlock) college = stripTags(colBlock[1]).replace(/\(.*?\)/g, '').trim();

  // Country: prefer the flag country code (f-i f-XX). 'us' => domestic.
  let country = '';
  const flag = meta.match(/class=["']f-i f-([a-z]{2})["']/i);
  const code = flag ? flag[1].toLowerCase() : '';
  if (code && code !== 'us') {
    // Prefer a clean country name from the code; fall back to the birthplace text.
    if (COUNTRY[code]) {
      country = COUNTRY[code];
    } else {
      const born = meta.match(/Born:<\/strong>([\s\S]*?)<\/p>/i);
      const place = born ? (stripTags(born[1]).split(/\s+in\s+/i)[1] || '') : '';
      const parts = place.split(',').map(s => s.trim()).filter(Boolean);
      country = parts.length ? parts[parts.length - 1] : code.toUpperCase();
    }
  }
  return { high_school, college, country };
}

(async () => {
  console.log(`Range ${FROM}-${TO} | ${DRY ? 'DRY RUN' : 'WRITING'} | ${ALL ? 'all players' : 'missing-college only'}\n`);
  let fetched = 0, enriched = 0, samples = 0;

  for (let year = FROM; year <= TO; year++) {
    const ref = doc(db, 'draft_classes', String(year));
    const snap = await getDoc(ref);
    if (!snap.exists()) { console.log(year, '— no draft class, skipping'); continue; }
    const data = snap.data();
    const players = data.players || [];
    let changed = false;

    const withBref = players.filter(p => p.bref_id).length;
    const targetedCount = players.filter(p => p.bref_id && (ALL || !p.college)).length;
    console.log(`${year} — ${players.length} players, ${withBref} have bref_id, ${targetedCount} to enrich`);

    for (const p of players) {
      if (!p.bref_id) continue;
      const targeted = ALL || !p.college;
      if (!targeted) continue;

      let origins = cache[p.bref_id];
      if (!origins) {
        try {
          const res = await fetchPlayer(p.bref_id);
          fetched++;
          if (res.status !== 200) { await sleep(2500); continue; }
          origins = parseOrigins(res.body);
          cache[p.bref_id] = origins;
          if (fetched % 25 === 0) saveCache();
          await sleep(2500); // be polite
        } catch (e) { await sleep(2500); continue; }
      }

      if (origins.high_school && p.high_school !== origins.high_school) { p.high_school = origins.high_school; changed = true; }
      if (origins.country && p.country !== origins.country) { p.country = origins.country; changed = true; }
      if (origins.college && !p.college) { p.college = origins.college; changed = true; }
      if (changed) enriched++;

      if (samples < 12) {
        console.log(`  ${p.full_name} (${year}) -> HS:"${origins.high_school || ''}" College:"${origins.college || ''}" Country:"${origins.country || ''}"`);
        samples++;
      }
    }

    if (changed && !DRY) {
      await setDoc(ref, { ...data, players });
      console.log(year, '— updated');
    } else if (changed) {
      console.log(year, '— (dry run, not written)');
    }
    saveCache();
  }

  saveCache();
  console.log(`\nDone. Fetched ${fetched} player pages, enriched ${enriched} records.`);
  process.exit(0);
})();
