import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, getDoc, doc, updateDoc } from 'firebase/firestore';

const app = initializeApp({
  apiKey: "AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY",
  projectId: "association-social",
});
const db = getFirestore(app);

async function fixRosters() {
  const leaguesSnap = await getDocs(collection(db, 'leagues'));
  for (const league of leaguesSnap.docs) {
    const leagueData = league.data();
    const era = leagueData.era;
    const mode = leagueData.mode;
    if (!era || mode === 'draft') continue;

    const poolSnap = await getDoc(doc(db, 'era_player_pools', era));
    if (!poolSnap.exists()) { console.log('No pool for era:', era); continue; }
    const allPoolPlayers = poolSnap.data().players || [];

    const teamsSnap = await getDocs(collection(db, 'leagues', league.id, 'teams'));
    for (const team of teamsSnap.docs) {
      const teamData = team.data();
      const abbr = teamData.abbreviation;
      if (!abbr) continue;

      const fullRoster = allPoolPlayers.filter(p => p.team === abbr);
      if (fullRoster.length === 0) {
        console.log('No pool players for', abbr, 'in era', era);
        continue;
      }

      await updateDoc(doc(db, 'leagues', league.id, 'teams', team.id), {
        players: fullRoster,
      });
      console.log('Updated', teamData.name, ':', fullRoster.length, 'players');
    }
  }
  console.log('Done');
  process.exit(0);
}

fixRosters().catch(e => { console.error(e); process.exit(1); });
