// Audit how many player_profiles docs are NOT in the vault.
// These are the "unmatched" players we couldn't migrate cleanly.

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, getDocs, collection } from 'firebase/firestore';

const app = initializeApp({
  apiKey: "AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY",
  projectId: "association-social",
});
const db = getFirestore(app);

console.log('\n=== Audit: player_profiles missing from vault ===\n');

const profilesSnap = await getDocs(collection(db, 'player_profiles'));
console.log(`Total player_profiles: ${profilesSnap.size}`);

let inVault = 0;
const missing = [];

for (const pDoc of profilesSnap.docs) {
  const pid = pDoc.id;
  const vaultDoc = await getDoc(doc(db, 'players', pid));
  if (vaultDoc.exists()) {
    inVault++;
  } else {
    missing.push({
      bref_id: pid,
      full_name: pDoc.data().full_name || '(no name)',
    });
  }
}

console.log(`In vault: ${inVault}`);
console.log(`Missing from vault: ${missing.length}`);

if (missing.length > 0 && missing.length <= 100) {
  console.log('\nFirst 30 missing:');
  missing.slice(0, 30).forEach(m => console.log(`  ${m.bref_id} : ${m.full_name}`));
}
process.exit(0);
