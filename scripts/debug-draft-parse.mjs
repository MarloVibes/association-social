// debug-draft-parse.mjs
// Fetches the 2003 draft page and prints what we extract for the top picks,
// plus the raw player-cell HTML so we can see the real markup.
// Run:  node scripts/debug-draft-parse.mjs
// (No Firestore, no rules needed — just prints.)

import https from 'https';

function fetchPage(year) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'www.basketball-reference.com',
      path: `/draft/NBA_${year}.html`,
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'Accept': 'text/html' },
    }, (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); });
    req.on('error', reject);
    req.end();
  });
}

const YEAR = 2003;
const html = await fetchPage(YEAR);
const uncommented = html.replace(/<!--([\s\S]*?)-->/g, '$1');
const tablePos = uncommented.indexOf('id="stats"');
console.log('stats table found at index:', tablePos);
const tbodyStart = uncommented.indexOf('<tbody>', tablePos);
const tableEnd = uncommented.indexOf('</table>', tbodyStart);
const tbody = uncommented.slice(tbodyStart, tableEnd);
const rows = tbody.match(/<tr[\s\S]*?<\/tr>/g) || [];
console.log('rows found:', rows.length, '\n');

let shown = 0;
for (const row of rows) {
  if (row.includes('class="thead"')) continue;
  const pickMatch = row.match(/data-stat="pick_overall"[^>]*>[\s\S]*?>(\d+)<\/a>/);
  const csvMatch = row.match(/data-append-csv="([^"]+)"/);
  const playerMatch = row.match(/data-stat="player"[^>]*>[\s\S]*?href=['"]([^'"]*)['"]>([^<]+)<\/a>/);
  // isolate the player cell for inspection
  const cellMatch = row.match(/(<td[^>]*data-stat="player"[\s\S]*?<\/td>)/);

  console.log('--- pick', pickMatch ? pickMatch[1] : '?', '---');
  console.log('  data-append-csv :', csvMatch ? csvMatch[1] : 'NONE');
  console.log('  href            :', playerMatch ? playerMatch[1] : 'NO MATCH');
  console.log('  name            :', playerMatch ? playerMatch[2] : 'NO MATCH');
  console.log('  raw player cell :', cellMatch ? cellMatch[1].slice(0, 220) : 'NONE');
  console.log('');

  if (++shown >= 6) break;
}
process.exit(0);
