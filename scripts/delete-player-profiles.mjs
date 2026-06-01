// Phase 6b final step: delete the player_profiles collection.
// All 2094 player docs have been backfilled to vault. Confirmed via audit.
// app code no longer reads from this collection.

import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(`\n=== Delete player_profiles ${DRY_RUN ? '(DRY RUN)' : '(LIVE DELETE)'} ===\n`);

  const snap = await db.collection('player_profiles').get();
  console.log(`Found ${snap.size} docs in player_profiles`);

  if (DRY_RUN) {
    console.log(`Would delete ${snap.size} docs.`);
    process.exit(0);
  }

  // Batch deletes (500 at a time max)
  const BATCH_SIZE = 500;
  let deleted = 0;

  for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const slice = snap.docs.slice(i, i + BATCH_SIZE);
    slice.forEach(d => batch.delete(d.ref));
    await batch.commit();
    deleted += slice.length;
    console.log(`Deleted ${deleted}/${snap.size}`);
  }

  console.log(`\n✅ player_profiles collection emptied. ${deleted} docs deleted.`);
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
