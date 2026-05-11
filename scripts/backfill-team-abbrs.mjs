import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, getDocs, collection, updateDoc } from 'firebase/firestore';

const app = initializeApp({
  apiKey: 'AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY',
  projectId: 'association-social',
});
const db = getFirestore(app);

// Map team name -> abbr (matches teamColors.ts)
const NAME_TO_ABBR = {
  'Atlanta Hawks': 'ATL', 'Boston Celtics': 'BOS', 'Brooklyn Nets': 'BKN',
  'Charlotte Hornets': 'CHA', 'Chicago Bulls': 'CHI', 'Cleveland Cavaliers': 'CLE',
  'Dallas Mavericks': 'DAL', 'Denver Nuggets': 'DEN', 'Detroit Pistons': 'DET',
  'Golden State Warriors': 'GSW', 'Houston Rockets': 'HOU', 'Indiana Pacers': 'IND',
  'LA Clippers': 'LAC', 'Los Angeles Clippers': 'LAC',
  'Los Angeles Lakers': 'LAL', 'Memphis Grizzlies': 'MEM', 'Miami Heat': 'MIA',
  'Milwaukee Bucks': 'MIL', 'Minnesota Timberwolves': 'MIN',
  'New Orleans Pelicans': 'NOP', 'New Orleans Hornets': 'NOH',
  'New York Knicks': 'NYK', 'Oklahoma City Thunder': 'OKC', 'Orlando Magic': 'ORL',
  'Philadelphia 76ers': 'PHI', 'Phoenix Suns': 'PHX', 'Portland Trail Blazers': 'POR',
  'Sacramento Kings': 'SAC', 'San Antonio Spurs': 'SAS', 'Toronto Raptors': 'TOR',
  'Utah Jazz': 'UTA', 'Washington Wizards': 'WAS',
  'Seattle SuperSonics': 'SEA', 'New Jersey Nets': 'NJN',
  'Vancouver Grizzlies': 'VAN', 'Kansas City Kings': 'KCK',
};

async function run() {
  const leaguesSnap = await getDocs(collection(db, 'leagues'));
  let totalFixed = 0;
  let totalSkipped = 0;
  let totalUnknown = [];

  for (const lDoc of leaguesSnap.docs) {
    const leagueId = lDoc.id;
    const teamsSnap = await getDocs(collection(db, 'leagues', leagueId, 'teams'));
    for (const tDoc of teamsSnap.docs) {
      const team = tDoc.data();
      if (team.abbr) { totalSkipped++; continue; }
      const abbr = NAME_TO_ABBR[team.name];
      if (!abbr) {
        totalUnknown.push(team.name);
        continue;
      }
      await updateDoc(doc(db, 'leagues', leagueId, 'teams', tDoc.id), { abbr });
      totalFixed++;
    }
  }

  console.log('=== ABBR BACKFILL COMPLETE ===');
  console.log('Fixed:', totalFixed);
  console.log('Skipped (already had abbr):', totalSkipped);
  if (totalUnknown.length > 0) {
    console.log('Unknown team names (manual fix needed):');
    [...new Set(totalUnknown)].forEach(n => console.log('  -', n));
  }
}

run().catch(e => { console.error(e); process.exit(1); });
