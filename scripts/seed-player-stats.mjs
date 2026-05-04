import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import https from 'https';

const app = initializeApp({
  apiKey: "AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY",
  projectId: "association-social",
});
const db = getFirestore(app);

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

function parseStats(html) {
  const uncommented = html.replace(/<!--([\s\S]*?)-->/g, '$1');
  const tbodyStart = uncommented.indexOf('<tbody>');
  const tableEnd = uncommented.indexOf('</table>', tbodyStart);
  const tbody = uncommented.slice(tbodyStart, tableEnd);
  const rows = tbody.match(/<tr[\s\S]*?<\/tr>/g) || [];
  const players = [];
  const seen = new Set();

  for (const row of rows) {
    if (row.includes('thead')) continue;
    const nm = row.match(/data-stat="name_display"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/);
    if (!nm) continue;
    const name = nm[1].trim();
    if (seen.has(name)) continue;
    seen.add(name);

    const get = (stat) => {
      const m = row.match(new RegExp('data-stat="' + stat + '"[^>]*>(?:<[^>]+>)*([^<]*)'));
      return m ? m[1].trim() : '';
    };

    const csvMatch = row.match(/data-append-csv="([^"]+)"/);

    players.push({
      name,
      bref_id: csvMatch ? csvMatch[1] : '',
      team: get('team_name_abbr'),
      pos: get('pos'),
      age: get('age'),
      games: get('games'),
      mpg: get('mp_per_g'),
      ppg: get('pts_per_g'),
      rpg: get('trb_per_g'),
      apg: get('ast_per_g'),
      spg: get('stl_per_g'),
      bpg: get('blk_per_g'),
      fg_pct: get('fg_pct'),
      fg3_pct: get('fg3_pct'),
      ft_pct: get('ft_pct'),
      orpg: get('orb_per_g'),
      drpg: get('drb_per_g'),
      tpg: get('tov_per_g'),
    });
  }
  return players;
}

const ERAS = [
  { era: 'magic_bird', season: 1984, url: '/leagues/NBA_1984_per_game.html' },
  { era: 'jordan',     season: 1992, url: '/leagues/NBA_1992_per_game.html' },
  { era: 'kobe',       season: 2003, url: '/leagues/NBA_2003_per_game.html' },
  { era: 'lebron',     season: 2011, url: '/leagues/NBA_2011_per_game.html' },
  { era: 'steph',      season: 2017, url: '/leagues/NBA_2017_per_game.html' },
];

async function main() {
  for (const { era, season, url } of ERAS) {
    console.log('Fetching ' + era + ' (' + season + ') stats...');
    const html = await fetchPage(url);
    const players = parseStats(html);
    console.log('Found ' + players.length + ' players');
    console.log('Sample:', players.slice(0, 2).map(p => p.name + ' PPG:' + p.ppg).join(', '));

    await setDoc(doc(db, 'era_stats', era), {
      era, season, players,
      total: players.length,
      seeded_at: new Date().toISOString(),
    });
    console.log('Saved to era_stats/' + era);
    await sleep(4000);
  }
  console.log('All stats seeded!');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
