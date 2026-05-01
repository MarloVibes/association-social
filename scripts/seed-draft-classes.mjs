import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import https from 'https';

const app = initializeApp({
  apiKey: "AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY",
  projectId: "association-social",
});
const db = getFirestore(app);

function fetchPage(year) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www.basketball-reference.com',
      path: `/draft/NBA_${year}.html`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
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

function parseDraft(html, year) {
  // Uncomment hidden tables
  const uncommented = html.replace(/<!--([\s\S]*?)-->/g, '$1');

  // Find stats table
  const tablePos = uncommented.indexOf('id="stats"');
  if (tablePos === -1) return [];

  // Find tbody start
  const tbodyStart = uncommented.indexOf('<tbody>', tablePos);
  if (tbodyStart === -1) return [];

  // tbody has no closing tag - grab until </table>
  const tableEnd = uncommented.indexOf('</table>', tbodyStart);
  const tbodyContent = tableEnd > 0
    ? uncommented.slice(tbodyStart, tableEnd)
    : uncommented.slice(tbodyStart, tbodyStart + 50000);

  const players = [];
  const rowMatches = tbodyContent.match(/<tr[\s\S]*?<\/tr>/g) || [];

  for (const row of rowMatches) {
    if (row.includes('class="thead"')) continue;

    // Pick number - has an anchor tag around it
    const pickMatch = row.match(/data-stat="pick_overall"[^>]*>[\s\S]*?>(\d+)<\/a>/);
    if (!pickMatch) continue;
    const pick = parseInt(pickMatch[1]);
    if (isNaN(pick)) continue;

    // Team
    const teamMatch = row.match(/data-stat="team_id"[^>]*>[\s\S]*?title="[^"]*">([A-Z]{2,3})<\/a>/);
    const team = teamMatch ? teamMatch[1] : '';

    // Player name
    const playerMatch = row.match(/data-stat="player"[^>]*>[\s\S]*?href='[^']*'>([^<]+)<\/a>/);
    if (!playerMatch) continue;
    const name = playerMatch[1].trim();
    if (!name) continue;

    // College
    const collegeMatch = row.match(/data-stat="college_name"[^>]*>(?:<a[^>]*>)?([^<]*)/);
    let college = collegeMatch ? collegeMatch[1].replace(/<[^>]*>/g, '').trim() : '';

    const nameParts = name.split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ');
    const round = pick <= 30 ? 1 : 2;

    players.push({
      player_id: `draft_${year}_${pick}`,
      first_name: firstName,
      last_name: lastName,
      full_name: name,
      draft_year: year,
      draft_pick: pick,
      draft_round: round,
      drafted_by: team,
      college: college,
      position: '',
      jersey_number: '',
    });
  }
  return players;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getEraForYear(year) {
  if (year >= 1984 && year <= 1991) return 'magic_bird';
  if (year >= 1992 && year <= 2002) return 'jordan';
  if (year >= 2003 && year <= 2010) return 'kobe';
  if (year >= 2011 && year <= 2016) return 'lebron';
  if (year >= 2017 && year <= 2023) return 'steph';
  return 'current';
}

async function main() {
  const years = [];
  for (let y = 1984; y <= 2023; y++) {
    if (y === 1999) continue;
    years.push(y);
  }

  // Test 2003 first
  console.log('Testing 2003 draft...');
  const testHtml = await fetchPage(2003);
  const testPlayers = parseDraft(testHtml, 2003);
  console.log(`Result: ${testPlayers.length} players`);
  if (testPlayers.length > 0) {
    console.log('Top 5:');
    testPlayers.slice(0, 5).forEach(p => console.log(`  ${p.draft_pick}. ${p.full_name} (${p.drafted_by})`));
    console.log('\nTest passed! Starting full scrape in 4 seconds...\n');
  } else {
    console.log('Still failing - exiting');
    process.exit(1);
  }

  await sleep(4000);

  let totalPlayers = 0;
  for (const year of years) {
    try {
      process.stdout.write(`${year}: `);
      const html = await fetchPage(year);
      const players = parseDraft(html, year);

      if (players.length === 0) {
        console.log('0 players - skipping');
        await sleep(4000);
        continue;
      }

      await setDoc(doc(db, 'draft_classes', String(year)), {
        year,
        players,
        era: getEraForYear(year),
        total: players.length,
        seeded_at: new Date().toISOString(),
      });

      totalPlayers += players.length;
      console.log(`${players.length} players`);
      await sleep(4000);

    } catch (e) {
      console.log(`ERROR: ${e.message}`);
      await sleep(8000);
    }
  }

  console.log(`\nComplete! ${totalPlayers} total draft picks seeded`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
