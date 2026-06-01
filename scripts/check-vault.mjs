import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
const app = initializeApp({ apiKey: 'AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY', projectId: 'association-social' });
const db = getFirestore(app);

const NAMES_TO_CHECK = ['Cam Thomas', 'Jaden Ivey', 'Cole Anthony', 'Greg Oden', 'Alonzo Mourning'];

for (const name of NAMES_TO_CHECK) {
  // Try lower-name bref_id construction
  const parts = name.split(' ');
  const last = (parts[parts.length-1] || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 5);
  const first = (parts[0] || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 2);
  const candidates = ['01','02','03','04','05'].map(s => last + first + s);
  
  console.log(`\n${name}: checking ${candidates.join(', ')}`);
  for (const c of candidates) {
    const snap = await getDoc(doc(db, 'players', c));
    if (snap.exists()) {
      console.log(`  FOUND in vault: ${c} -> ${snap.data().full_name}`);
    }
  }
}
process.exit(0);
