import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import https from 'https';

const app = initializeApp({
  apiKey: "AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY",
  projectId: "association-social",
});
const db = getFirestore(app);

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www.basketball-reference.com',
      path: url,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html',
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.end();
  });
}

function parsePlayers(html, year) {
  const uncommented = html.replace(/<!--([\s\S]*?)-->/g, '$1');
  const tbodyStart = uncommented.indexOf('<tbody>');
  const tableEnd = uncommented.indexOf('</table>', tbodyStart);
  const tbody = uncommented.slice(tbodyStart, tableEnd);

  const rowMatches = tbody.match(/<tr[\s\S]*?<\/tr>/g) || [];
  const players = [];
  const seen = new Set();

  for (const row of rowMatches) {
    if (row.includes('thead')) continue;

    const nameMatch = row.match(/data-stat="name_display"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const teamMatch = row.match(/data-stat="team_name_abbr"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/);
    const team = teamMatch ? teamMatch[1].trim() : '';

    const posMatch = row.match(/data-stat="pos"[^>]*>([^<]+)</);
    const pos = posMatch ? posMatch[1].trim() : '';

    const ageMatch = row.match(/data-stat="age"[^>]*>(\d+)</);
    const age = ageMatch ? parseInt(ageMatch[1]) : null;

    const csvMatch = row.match(/data-append-csv="([^"]+)"/);
    const playerId = csvMatch ? csvMatch[1] : name.toLowerCase().replace(/\s+/g, '_');

    const nameParts = name.split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ');

    players.push({
      player_id: `pool_${year}_${playerId}`,
      first_name: firstName,
      last_name: lastName,
      full_name: name,
      position: pos,
      team: team,
      age: age,
      birth_year: age ? year - age : null,
      jersey_number: '',
      season: year,
    });
  }
  return players;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Era -> season year mapping (the year the season ENDS)
const ERAS = [
  { era: 'magic_bird', season: 1984, url: '/leagues/NBA_1984_per_game.html' },
  { era: 'jordan',     season: 1992, url: '/leagues/NBA_1992_per_game.html' },
  { era: 'kobe',       season: 2003, url: '/leagues/NBA_2003_per_game.html' },
  { era: 'lebron',     season: 2011, url: '/leagues/NBA_2011_per_game.html' },
  { era: 'steph',      season: 2017, url: '/leagues/NBA_2017_per_game.html' },
];

async function main() {
  for (const { era, season, url } of ERAS) {
    console.log(`\nFetching ${era} (${season})...`);
    const html = await fetchPage(url);
    const players = parsePlayers(html, season);
    console.log(`Found ${players.length} players`);

    if (players.length > 0) {
      console.log('Sample:', players.slice(0, 3).map(p => `${p.full_name} (${p.team} ${p.position})`).join(', '));

      await setDoc(doc(db, 'era_player_pools', era), {
        era,
        season,
        players,
        total: players.length,
        seeded_at: new Date().toISOString(),
      });
      console.log(`Saved to era_player_pools/${era}`);
    }

    await sleep(4000);
  }

  console.log('\nAll era player pools seeded!');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
