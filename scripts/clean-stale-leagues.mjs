import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./service-account.json', 'utf-8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main() {
  console.log('Fetching all leagues...');
  const leaguesSnap = await db.collection('leagues').get();
  const validLeagueIds = new Set(leaguesSnap.docs.map(d => d.id));
  console.log(`Found ${validLeagueIds.size} valid leagues`);

  console.log('Fetching all users...');
  const usersSnap = await db.collection('users').get();
  console.log(`Found ${usersSnap.docs.length} users`);

  let fixedCount = 0;
  let totalRemoved = 0;

  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data();
    const userLeagues = data.leagues || [];
    if (userLeagues.length === 0) continue;

    const cleaned = userLeagues.filter(id => validLeagueIds.has(id));
    const removed = userLeagues.length - cleaned.length;

    if (removed > 0) {
      console.log(`  ${data.displayName || userDoc.id}: ${userLeagues.length} → ${cleaned.length} (removed ${removed} stale)`);
      await userDoc.ref.update({ leagues: cleaned });
      fixedCount++;
      totalRemoved += removed;
    }
  }

  console.log(`\nDone. Fixed ${fixedCount} users, removed ${totalRemoved} stale league refs.`);
}

main().catch(e => { console.error(e); process.exit(1); });
