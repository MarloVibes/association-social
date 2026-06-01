// Seed free agents into the vault for eras with meaningful free agency.
//
// Strategy: for each modern era (kobe/lebron/steph/current), scrape the
// PREVIOUS year's per_game stats. Any player who appeared in the previous
// year but is NOT in the current era's player_pool = candidate free agent.
//
// Adds free_in_eras: [era] tag to vault docs. Roster screen will surface
// these as free agents when querying by era.
//
// Usage:
//   node scripts/seed-vault-free-agents.mjs --dry-run
//   node scripts/seed-vault-free-agents.mjs
//
// Skips magic_bird and jordan — free agency was extremely limited pre-1988.

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, updateDoc, setDoc, arrayUnion } from 'firebase/firestore';
import https from 'https';

const app = initializeApp({
  apiKey: "AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY",
  projectId: "association-social",
});
const db = getFirestore(app);

const DRY_RUN = process.argv.includes('--dry-run');

// Modern eras: era key + previous season year
// (per_game URL uses ending year, e.g. NBA_2002 = 2001-02 season)
const ERAS = [
  { era: 'kobe',    priorYear: 2002, priorUrl: '/leagues/NBA_2002_per_game.html' },
  { era: 'lebron',  priorYear: 2010, priorUrl: '/leagues/NBA_2010_per_game.html' },
  { era: 'steph',   priorYear: 2016, priorUrl: '/leagues/NBA_2016_per_game.html' },
  { era: 'current', priorYear: 2025, priorUrl: '/leagues/NBA_2025_per_game.html' },
];

function fetchPage(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'www.basketball-reference.com',
      path,
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function normName(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parsePriorYearPlayers(html) {
  const uncommented = html.replace(/<!--([\s\S]*?)-->/g, '$1');
  const tbodyStart = uncommented.indexOf('<tbody>');
  const tableEnd = uncommented.indexOf('</table>', tbodyStart);
  const tbody = uncommented.slice(tbodyStart, tableEnd);
  const rows = tbody.match(/<tr[\s\S]*?<\/tr>/g) || [];

  const players = [];
  const seen = new Set();

  for (const row of rows) {
    if (row.includes('thead') || row.includes('class="over_header"')) continue;
    const idMatch = row.match(/data-append-csv="([^"]+)"/);
    const nameMatch = row.match(/data-stat="name_display"[^>]*>(?:<a[^>]*>)?([^<]+)/);
    const gamesMatch = row.match(/data-stat="games"[^>]*>([^<]+)/);

    if (!idMatch || !nameMatch) continue;
    const brefId = idMatch[1];
    if (seen.has(brefId)) continue;
    seen.add(brefId);

    const name = nameMatch[1].trim();
    const games = parseInt(gamesMatch ? gamesMatch[1] : '0', 10) || 0;

    // Filter: must have played at least 10 games (rules out token appearances)
    if (games < 10) continue;

    players.push({ bref_id: brefId, full_name: name, games });
  }

  return players;
}

async function main() {
  console.log(`\n=== Vault Free Agents Seeder ${DRY_RUN ? '(DRY RUN)' : '(LIVE WRITE)'} ===\n`);

  for (const { era, priorYear, priorUrl } of ERAS) {
    console.log(`\n--- ERA: ${era} (looking at ${priorYear} season for free agent candidates) ---`);

    // 1. Get the current era's pool to know who's already rostered
    const poolSnap = await getDoc(doc(db, 'era_player_pools', era));
    if (!poolSnap.exists()) {
      console.log(`  era_player_pools/${era} not found, skipping`);
      continue;
    }
    const poolPlayers = poolSnap.data().players || [];
    const rosteredNames = new Set(poolPlayers.map(p => normName(p.full_name)));
    console.log(`  ${rosteredNames.size} players already rostered in ${era}`);

    // 2. Scrape the prior year's per_game data
    console.log(`  Fetching ${priorUrl}...`);
    const html = await fetchPage(priorUrl);
    const priorPlayers = parsePriorYearPlayers(html);
    console.log(`  Found ${priorPlayers.length} players in prior season (>=10 games)`);

    // 3. Candidate free agents: in prior season but NOT in current era pool
    const candidates = priorPlayers.filter(p => !rosteredNames.has(normName(p.full_name)));
    console.log(`  Candidate free agents (in prior season but not in era pool): ${candidates.length}`);

    if (candidates.length === 0) continue;

    // 4. For each candidate: tag existing vault doc OR create new one
    let matched = 0;
    let created = 0;
    let updated = 0;

    for (const c of candidates) {
      const vaultSnap = await getDoc(doc(db, 'players', c.bref_id));
      if (vaultSnap.exists()) {
        matched++;
        if (!DRY_RUN) {
          await updateDoc(doc(db, 'players', c.bref_id), {
            free_in_eras: arrayUnion(era),
            eras: arrayUnion(era),
          });
          updated++;
        }
      } else {
        // Player not in vault yet - add them as free agent
        if (!DRY_RUN) {
          const parts = c.full_name.split(' ');
          await setDoc(doc(db, 'players', c.bref_id), {
            bref_id: c.bref_id,
            full_name: c.full_name,
            first_name: parts[0] || '',
            last_name: parts.slice(1).join(' ') || '',
            position: '',
            height: '',
            weight: '',
            birth_date: '',
            jersey_number: '',
            accolades: [],
            seasons: [],
            eras: [era],
            free_in_eras: [era],
            is_custom: false,
            no_profile: true,
            added_as_free_agent: true,
            created_at: new Date().toISOString(),
          });
          created++;
        }
      }
    }

    console.log(`  Matched to existing vault: ${matched}/${candidates.length}`);
    console.log(`  Need to create in vault: ${candidates.length - matched}`);
    if (!DRY_RUN) {
      console.log(`  Updated: ${updated} | Created: ${created}`);
    }

    await sleep(4000); // be nice to basketball-reference
  }

  console.log('\n=== Done ===');
  if (DRY_RUN) {
    console.log('DRY RUN - no writes performed. Run without --dry-run to commit.');
  }
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
