// Phase 6a: delete leagues/{id}/custom_players/* subcollections.
// Vault has all custom players via Phase 4 migration. This is the final cleanup.
//
// USAGE:
//   node scripts/cleanup-old-custom-players.mjs --dry-run
//   node scripts/cleanup-old-custom-players.mjs

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc } from 'firebase/firestore';

const app = initializeApp({
  apiKey: "AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY",
  projectId: "association-social",
});
const db = getFirestore(app);

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(`\n=== Cleanup old custom_players ${DRY_RUN ? '(DRY RUN)' : '(LIVE DELETE)'} ===\n`);

  const leaguesSnap = await getDocs(collection(db, 'leagues'));
  let totalToDelete = 0;
  let totalDeleted = 0;
  let skipped = 0;

  for (const leagueDoc of leaguesSnap.docs) {
    const leagueId = leagueDoc.id;
    const customSnap = await getDocs(collection(db, 'leagues', leagueId, 'custom_players'));
    if (customSnap.empty) continue;

    console.log(`League ${leagueId}: ${customSnap.size} custom players to delete`);
    totalToDelete += customSnap.size;

    for (const cDoc of customSnap.docs) {
      // Verify the corresponding vault doc exists before deleting old
      const vaultCheck = await import('firebase/firestore').then(m =>
        m.getDoc(m.doc(db, 'players', cDoc.id))
      );
      if (!vaultCheck.exists()) {
        console.log(`  SKIP ${cDoc.id}: vault doc missing - keeping old for safety`);
        skipped++;
        continue;
      }

      if (!DRY_RUN) {
        try {
          await deleteDoc(doc(db, 'leagues', leagueId, 'custom_players', cDoc.id));
          totalDeleted++;
        } catch (e) {
          console.log(`  FAILED ${cDoc.id}: ${e.message}`);
        }
      } else {
        totalDeleted++;
      }
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total found: ${totalToDelete}`);
  console.log(`${DRY_RUN ? 'Would delete' : 'Deleted'}: ${totalDeleted}`);
  if (skipped > 0) console.log(`Skipped (no vault match): ${skipped}`);

  if (DRY_RUN) {
    console.log('\nDRY RUN - no deletes performed.');
  }
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
