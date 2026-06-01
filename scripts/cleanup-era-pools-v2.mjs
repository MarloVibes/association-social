import { initializeApp } from 'firebase/app';
import { getFirestore, doc, deleteDoc } from 'firebase/firestore';

const app = initializeApp({
  apiKey: "AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY",
  projectId: "association-social",
});
const db = getFirestore(app);

const ERAS = ['magic_bird', 'jordan', 'kobe', 'lebron', 'steph', 'current'];

for (const era of ERAS) {
  try {
    await deleteDoc(doc(db, 'era_player_pools_v2', era));
    console.log(`deleted era_player_pools_v2/${era}`);
  } catch (e) {
    console.log(`${era}: ${e.message}`);
  }
}
process.exit(0);
