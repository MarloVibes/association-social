import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
const app = initializeApp({ apiKey: 'AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY', projectId: 'association-social' });
const db = getFirestore(app);
const leagues = await getDocs(collection(db, 'leagues'));
let totalCustom = 0;
let leaguesWithCustom = 0;
for (const ldoc of leagues.docs) {
  const customs = await getDocs(collection(db, 'leagues', ldoc.id, 'custom_players'));
  if (customs.size > 0) {
    leaguesWithCustom++;
    totalCustom += customs.size;
    console.log(`  ${ldoc.id}: ${customs.size} custom players`);
  }
}
console.log(`\nTotal: ${totalCustom} custom players across ${leaguesWithCustom} leagues`);
process.exit(0);
