import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
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
      path, method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// All NBA champions by year with team abbreviation
const CHAMPIONS = [
  { year: 1984, team: 'BOS' }, { year: 1985, team: 'LAL' },
  { year: 1986, team: 'BOS' }, { year: 1987, team: 'LAL' },
  { year: 1988, team: 'LAL' }, { year: 1989, team: 'DET' },
  { year: 1990, team: 'DET' }, { year: 1991, team: 'CHI' },
  { year: 1992, team: 'CHI' }, { year: 1993, team: 'CHI' },
  { year: 1994, team: 'HOU' }, { year: 1995, team: 'HOU' },
  { year: 1996, team: 'CHI' }, { year: 1997, team: 'CHI' },
  { year: 1998, team: 'CHI' }, { year: 1999, team: 'SAS' },
  { year: 2000, team: 'LAL' }, { year: 2001, team: 'LAL' },
  { year: 2002, team: 'LAL' }, { year: 2003, team: 'SAS' },
  { year: 2004, team: 'DET' }, { year: 2005, team: 'SAS' },
  { year: 2006, team: 'MIA' }, { year: 2007, team: 'SAS' },
  { year: 2008, team: 'BOS' }, { year: 2009, team: 'LAL' },
  { year: 2010, team: 'LAL' }, { year: 2011, team: 'DAL' },
  { year: 2012, team: 'MIA' }, { year: 2013, team: 'MIA' },
  { year: 2014, team: 'SAS' }, { year: 2015, team: 'GSW' },
  { year: 2016, team: 'CLE' }, { year: 2017, team: 'GSW' },
  { year: 2018, team: 'GSW' }, { year: 2019, team: 'TOR' },
  { year: 2020, team: 'LAL' }, { year: 2021, team: 'MIL' },
  { year: 2022, team: 'GSW' }, { year: 2023, team: 'DEN' },
];

function parsePlayers(html) {
  const uncommented = html.replace(/<!--([\s\S]*?)-->/g, '$1');
  const tbodyStart = uncommented.indexOf('<tbody>');
  const tableEnd = uncommented.indexOf('</table>', tbodyStart);
  const tbody = uncommented.slice(tbodyStart, tableEnd);
  const rows = tbody.match(/<tr[\s\S]*?<\/tr>/g) || [];
  const players = [];
  for (const row of rows) {
    if (row.includes('thead')) continue;
    const csvMatch = row.match(/data-append-csv="([^"]+)"/);
    const nameMatch = row.match(/data-stat="player"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/);
    if (csvMatch && nameMatch) {
      players.push({ bref_id: csvMatch[1], name: nameMatch[1].trim() });
    }
  }
  return players;
}

async function main() {
  let total = 0;
  for (const { year, team } of CHAMPIONS) {
    const url = '/teams/' + team + '/' + year + '.html';
    process.stdout.write('Fetching ' + year + ' ' + team + '...');
    try {
      const html = await fetchPage(url);
      const players = parsePlayers(html);
      console.log(' ' + players.length + ' players');

      const seasonStr = (year - 1) + '-' + String(year).slice(2);
      const accolade = seasonStr + ' NBA Champion';

      for (const player of players) {
        try {
          const profileSnap = await getDoc(doc(db, 'player_profiles', player.bref_id));
          if (profileSnap.exists()) {
            const existing = profileSnap.data().accolades || [];
            if (!existing.includes(accolade)) {
              await updateDoc(doc(db, 'player_profiles', player.bref_id), {
                accolades: arrayUnion(accolade),
              });
              total++;
            }
          }
        } catch (e) {}
      }
      await sleep(4000);
    } catch (e) {
      console.log(' ERROR:', e.message);
      await sleep(5000);
    }
  }
  console.log('Done! Added rings to ' + total + ' player-seasons');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
