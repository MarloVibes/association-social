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

const NBA_TEAMS = [
  { bref: 'ATL', app: 'ATL', full: 'Atlanta Hawks', city: 'Atlanta', name: 'Hawks' },
  { bref: 'BOS', app: 'BOS', full: 'Boston Celtics', city: 'Boston', name: 'Celtics' },
  { bref: 'BRK', app: 'BKN', full: 'Brooklyn Nets', city: 'Brooklyn', name: 'Nets' },
  { bref: 'CHO', app: 'CHA', full: 'Charlotte Hornets', city: 'Charlotte', name: 'Hornets' },
  { bref: 'CHI', app: 'CHI', full: 'Chicago Bulls', city: 'Chicago', name: 'Bulls' },
  { bref: 'CLE', app: 'CLE', full: 'Cleveland Cavaliers', city: 'Cleveland', name: 'Cavaliers' },
  { bref: 'DAL', app: 'DAL', full: 'Dallas Mavericks', city: 'Dallas', name: 'Mavericks' },
  { bref: 'DEN', app: 'DEN', full: 'Denver Nuggets', city: 'Denver', name: 'Nuggets' },
  { bref: 'DET', app: 'DET', full: 'Detroit Pistons', city: 'Detroit', name: 'Pistons' },
  { bref: 'GSW', app: 'GSW', full: 'Golden State Warriors', city: 'Golden State', name: 'Warriors' },
  { bref: 'HOU', app: 'HOU', full: 'Houston Rockets', city: 'Houston', name: 'Rockets' },
  { bref: 'IND', app: 'IND', full: 'Indiana Pacers', city: 'Indiana', name: 'Pacers' },
  { bref: 'LAC', app: 'LAC', full: 'LA Clippers', city: 'LA', name: 'Clippers' },
  { bref: 'LAL', app: 'LAL', full: 'Los Angeles Lakers', city: 'Los Angeles', name: 'Lakers' },
  { bref: 'MEM', app: 'MEM', full: 'Memphis Grizzlies', city: 'Memphis', name: 'Grizzlies' },
  { bref: 'MIA', app: 'MIA', full: 'Miami Heat', city: 'Miami', name: 'Heat' },
  { bref: 'MIL', app: 'MIL', full: 'Milwaukee Bucks', city: 'Milwaukee', name: 'Bucks' },
  { bref: 'MIN', app: 'MIN', full: 'Minnesota Timberwolves', city: 'Minnesota', name: 'Timberwolves' },
  { bref: 'NOP', app: 'NOP', full: 'New Orleans Pelicans', city: 'New Orleans', name: 'Pelicans' },
  { bref: 'NYK', app: 'NYK', full: 'New York Knicks', city: 'New York', name: 'Knicks' },
  { bref: 'OKC', app: 'OKC', full: 'Oklahoma City Thunder', city: 'Oklahoma City', name: 'Thunder' },
  { bref: 'ORL', app: 'ORL', full: 'Orlando Magic', city: 'Orlando', name: 'Magic' },
  { bref: 'PHI', app: 'PHI', full: 'Philadelphia 76ers', city: 'Philadelphia', name: '76ers' },
  { bref: 'PHO', app: 'PHX', full: 'Phoenix Suns', city: 'Phoenix', name: 'Suns' },
  { bref: 'POR', app: 'POR', full: 'Portland Trail Blazers', city: 'Portland', name: 'Trail Blazers' },
  { bref: 'SAC', app: 'SAC', full: 'Sacramento Kings', city: 'Sacramento', name: 'Kings' },
  { bref: 'SAS', app: 'SAS', full: 'San Antonio Spurs', city: 'San Antonio', name: 'Spurs' },
  { bref: 'TOR', app: 'TOR', full: 'Toronto Raptors', city: 'Toronto', name: 'Raptors' },
  { bref: 'UTA', app: 'UTA', full: 'Utah Jazz', city: 'Utah', name: 'Jazz' },
  { bref: 'WAS', app: 'WAS', full: 'Washington Wizards', city: 'Washington', name: 'Wizards' },
];

function parsePlayers(html, appAbbr) {
  // Find the roster table specifically
  const rosterIdx = html.indexOf('id="roster"');
  if (rosterIdx === -1) return [];
  const tbodyIdx = html.indexOf('<tbody>', rosterIdx);
  const tbodyEnd = html.indexOf('</tbody>', tbodyIdx);
  if (tbodyIdx === -1 || tbodyEnd === -1) return [];
  const tbody = html.slice(tbodyIdx, tbodyEnd);
  const rows = tbody.match(/<tr[\s\S]*?<\/tr>/g) || [];
  const players = [];
  for (const row of rows) {
    if (row.includes('class="thead"')) continue;
    // 2026 pages use href pattern to get bref_id
    const hrefMatch = row.match(/href='\/players\/[a-z]\/([^.]+)\.html'/);
    const nameMatch = row.match(/data-stat="player"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/);
    const posMatch = row.match(/data-stat="pos"[^>]*>[\s\S]*?csk="[^"]*"[^>]*>([^<]*)<\/td>/);
    const posMatch2 = row.match(/data-stat="pos"[^>]*>([^<]*)<\/td>/);
    const birthMatch = row.match(/data-stat="birth_date"[^>]*>csk="(\d{8})"/);
    const numMatch = row.match(/data-stat="number"[^>]*>([^<]*)<\/th>/);
    if (hrefMatch && nameMatch) {
      const name = nameMatch[1].trim();
      const parts = name.split(' ');
      const pos = (posMatch?.[1] || posMatch2?.[1] || 'G').trim();
      // Calculate age from birth date csk (YYYYMMDD)
      const birthCsk = row.match(/csk="(\d{8})"/)?.[1];
      let age = 25;
      let birthYear = 2000;
      if (birthCsk) {
        birthYear = parseInt(birthCsk.slice(0, 4));
        age = new Date().getFullYear() - birthYear;
      }
      players.push({
        player_id: 'current_' + hrefMatch[1],
        bref_id: hrefMatch[1],
        full_name: name,
        first_name: parts[0] || '',
        last_name: parts.slice(1).join(' ') || '',
        position: pos,
        jersey_number: numMatch?.[1]?.trim() || '',
        age,
        birth_year: birthYear,
        team: appAbbr,
        season: 2025,
      });
    }
  }
  return players;
}

async function main() {
  console.log('Seeding 2025-26 NBA rosters from Basketball Reference...');
  const allPlayers = [];

  for (const team of NBA_TEAMS) {
    process.stdout.write('Fetching ' + team.full + '...');
    try {
      // Use 2026 year for 2025-26 season
      const html = await fetchPage('/teams/' + team.bref + '/2026.html');
      const players = parsePlayers(html, team.app);
      console.log(' ' + players.length + ' players');

      await setDoc(doc(db, 'era_rosters', 'current', 'teams', team.app + '_current'), {
        id: team.app + '_current',
        abbreviation: team.app,
        full_name: team.full,
        city: team.city,
        name: team.name,
        era: 'current',
        players: players.slice(0, 6),
      });

      allPlayers.push(...players);
      await sleep(4000);
    } catch (e) {
      console.log(' ERROR:', e.message);
      await sleep(5000);
    }
  }

  // Deduplicate by player name - keep last occurrence (most recent team)
  const seen = new Map();
  for (const p of allPlayers) {
    seen.set(p.full_name, p);
  }
  const deduped = Array.from(seen.values());

  console.log('\nSaving pool:', deduped.length, 'unique players...');
  await setDoc(doc(db, 'era_player_pools', 'current'), {
    era: 'current',
    season: 2025,
    players: deduped,
  });

  console.log('Done!', NBA_TEAMS.length, 'teams,', deduped.length, 'unique players');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
