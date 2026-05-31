// Migrate custom players from leagues/{id}/custom_players/{playerId}
// into the canonical players/ vault with is_custom: true.
//
// Reads:  every leagues/*/custom_players/*
// Writes: players/{playerId} with custom-specific flags
//
// Old subcollection stays intact - Phase 6 cleanup deletes those later.
//
// USAGE:
//   node scripts/migrate-custom-players.mjs --dry-run
//   node scripts/migrate-custom-players.mjs

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, getDocs, setDoc, collection } from 'firebase/firestore';

const app = initializeApp({
  apiKey: "AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY",
  projectId: "association-social",
});
const db = getFirestore(app);

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(`\n=== Migrate Custom Players ${DRY_RUN ? '(DRY RUN)' : '(LIVE WRITE)'} ===\n`);

  const leaguesSnap = await getDocs(collection(db, 'leagues'));
  console.log(`Found ${leaguesSnap.size} leagues\n`);

  let totalCustom = 0;
  let totalMigrated = 0;
  const collisions = [];

  for (const leagueDoc of leaguesSnap.docs) {
    const leagueId = leagueDoc.id;
    const customSnap = await getDocs(collection(db, 'leagues', leagueId, 'custom_players'));
    if (customSnap.empty) continue;

    console.log(`League ${leagueId}: ${customSnap.size} custom players`);
    totalCustom += customSnap.size;

    for (const cDoc of customSnap.docs) {
      const customId = cDoc.id;
      const data = cDoc.data();

      // Check if vault already has this id (collision check)
      const vaultExists = await getDoc(doc(db, 'players', customId));
      if (vaultExists.exists() && !vaultExists.data().is_custom) {
        collisions.push({ leagueId, customId, conflictWith: vaultExists.data().full_name });
        console.log(`  ⚠️  ID COLLISION: ${customId} already exists in vault as "${vaultExists.data().full_name}". Skipping.`);
        continue;
      }

      const vaultDoc = {
        ...data,
        // Required vault fields
        bref_id: customId,
        is_custom: true,
        created_by_league: leagueId,
        // Custom players are available in all eras per locked decision
        available_in: ['all'],
        // Custom players don't have career history
        seasons: data.seasons || [],
        accolades: data.accolades || [],
        eras: data.eras || ['all'],
        migrated_at: new Date().toISOString(),
      };

      // Preserve created_by_uid if it exists; otherwise leave unset
      if (data.created_by_uid) vaultDoc.created_by_uid = data.created_by_uid;
      if (data.createdBy) vaultDoc.created_by_uid = data.createdBy;
      if (data.creator) vaultDoc.created_by_uid = data.creator;

      console.log(`  ${customId}: "${data.full_name || data.name || '?'}" (created by ${vaultDoc.created_by_uid || 'unknown'})`);

      if (!DRY_RUN) {
        try {
          await setDoc(doc(db, 'players', customId), vaultDoc);
          totalMigrated++;
        } catch (e) {
          console.log(`    FAILED: ${e.message}`);
        }
      } else {
        totalMigrated++;
      }
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total custom players found: ${totalCustom}`);
  console.log(`Migrated: ${totalMigrated}`);
  if (collisions.length > 0) {
    console.log(`Collisions skipped: ${collisions.length}`);
    collisions.forEach(c => console.log(`  ${c.leagueId}/${c.customId} - real player "${c.conflictWith}" already has that id`));
  }

  if (DRY_RUN) {
    console.log('\nDRY RUN - no writes performed. Run without --dry-run to commit.');
  }
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
