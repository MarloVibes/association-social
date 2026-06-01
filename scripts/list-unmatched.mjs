import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, getDocs, collection } from 'firebase/firestore';

const app = initializeApp({
  apiKey: "AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY",
  projectId: "association-social",
});
const db = getFirestore(app);

const profilesSnap = await getDocs(collection(db, 'player_profiles'));
const missing = [];

// Parallel check (10 at a time) to speed it up
const CONCURRENCY = 10;
const docs = profilesSnap.docs;
for (let i = 0; i < docs.length; i += CONCURRENCY) {
  const batch = docs.slice(i, i + CONCURRENCY);
  const results = await Promise.all(
    batch.map(async pDoc => {
      const pid = pDoc.id;
      const vaultDoc = await getDoc(doc(db, 'players', pid));
      return { pid, exists: vaultDoc.exists(), data: pDoc.data() };
    })
  );
  for (const r of results) {
    if (!r.exists) {
      missing.push({
        bref_id: r.pid,
        full_name: r.data.full_name || '(NO NAME)',
        position: r.data.position || '',
        seasons_count: (r.data.seasons || []).length,
        has_seasons: (r.data.seasons || []).length > 0,
      });
    }
  }
}

console.log(`\n=== ${missing.length} unmatched players ===\n`);

const noName = missing.filter(m => m.full_name === '(NO NAME)' || !m.full_name.trim());
const withName = missing.filter(m => m.full_name !== '(NO NAME)' && m.full_name.trim());
const noSeasons = missing.filter(m => !m.has_seasons);
const withSeasons = missing.filter(m => m.has_seasons);

console.log(`Without full_name: ${noName.length}`);
console.log(`With full_name: ${withName.length}`);
console.log(`Without seasons data: ${noSeasons.length}`);
console.log(`With seasons data: ${withSeasons.length}`);

console.log('\nFirst 30 with name:');
withName.slice(0, 30).forEach(m => console.log(`  ${m.bref_id.padEnd(15)} | ${m.full_name.padEnd(30)} | ${m.position} | ${m.seasons_count} seasons`));

if (noName.length > 0) {
  console.log('\nFirst 10 without name:');
  noName.slice(0, 10).forEach(m => console.log(`  ${m.bref_id.padEnd(15)} | (no name) | ${m.position} | ${m.seasons_count} seasons`));
}

process.exit(0);
