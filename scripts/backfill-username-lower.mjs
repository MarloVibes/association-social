import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY",
  authDomain: "association-social.firebaseapp.com",
  projectId: "association-social",
  storageBucket: "association-social.firebasestorage.app",
  messagingSenderId: "444786220612",
  appId: "1:444786220612:web:53724911dead483995e611"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function backfill() {
  console.log('Reading users collection...');
  const snap = await getDocs(collection(db, 'users'));
  console.log('Found', snap.size, 'user docs');

  let updated = 0;
  let skipped = 0;
  let missing = 0;

  for (const d of snap.docs) {
    const data = d.data();
    if (!data.username) {
      console.log('  SKIP', d.id, '(no username field)');
      missing++;
      continue;
    }
    if (data.usernameLower) {
      skipped++;
      continue;
    }
    const lower = String(data.username).toLowerCase();
    await updateDoc(doc(db, 'users', d.id), { usernameLower: lower });
    console.log('  UPDATED', d.id, ':', data.username, '->', lower);
    updated++;
  }

  console.log('---');
  console.log('Updated:', updated);
  console.log('Already had usernameLower:', skipped);
  console.log('No username field:', missing);
  process.exit(0);
}

backfill().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
