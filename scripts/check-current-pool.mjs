import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
const app = initializeApp({ apiKey: 'AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY', projectId: 'association-social' });
const db = getFirestore(app);

const snap = await getDoc(doc(db, 'era_player_pools', 'current'));
const players = snap.data().players || [];
console.log('Total current pool:', players.length);

const cam = players.filter(p => p.full_name && p.full_name.toLowerCase().includes('cam thomas'));
console.log('\nCam Thomas matches:', cam.length);
cam.forEach(p => console.log('  ', JSON.stringify(p)));

const allThomas = players.filter(p => p.full_name && p.full_name.toLowerCase().includes('thomas'));
console.log('\nAll Thomases:', allThomas.length);
allThomas.forEach(p => console.log('  ', p.full_name, '|', p.player_id, '|', p.team));

process.exit(0);
