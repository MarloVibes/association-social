import { initializeApp } from 'firebase/app';
import { getFirestore, getDocs, collection, query, limit } from 'firebase/firestore';
const app = initializeApp({ apiKey: 'AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY', projectId: 'association-social' });
const db = getFirestore(app);
const q = query(collection(db, 'player_profiles'), limit(5));
const snap = await getDocs(q);
snap.docs.forEach(d => {
  const data = d.data();
  console.log(d.id, '=>', JSON.stringify({ name: data.name, keys: Object.keys(data).slice(0, 8) }));
});
process.exit(0);
