import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
const app = initializeApp({ apiKey: 'AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY', projectId: 'association-social' });
const db = getFirestore(app);

// Check what's in vault that matches "Cam Thomas" by name OR bref_id thomaca02
const byName = await getDocs(query(collection(db, 'players'), where('full_name', '==', 'Cam Thomas')));
console.log('Vault docs with full_name == "Cam Thomas":', byName.size);
byName.forEach(d => console.log('  ', d.id, '=>', d.data().full_name, 'eras:', d.data().eras));

const directLookup = await getDoc(doc(db, 'players', 'thomaca02'));
console.log('\nVault doc thomaca02 exists?', directLookup.exists(), directLookup.exists() ? directLookup.data().full_name : 'N/A');

const collisionDoc = await getDoc(doc(db, 'players', 'thomaca01'));
console.log('Vault doc thomaca01:', collisionDoc.exists() ? collisionDoc.data().full_name : 'N/A');
console.log('  eras:', collisionDoc.exists() ? collisionDoc.data().eras : 'N/A');

process.exit(0);
