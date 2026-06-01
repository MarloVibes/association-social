// Phase 6b: backfill the 145 player_profiles docs missing from vault.
// Uses Firebase Admin SDK with service account credentials to bypass
// the production security rules (vault is read-only from client).
//
// USAGE:
//   node scripts/backfill-vault-from-profiles.mjs --dry-run
//   node scripts/backfill-vault-from-profiles.mjs

import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(
  readFileSync('./service-account.json', 'utf8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(`\n=== Backfill vault from profiles ${DRY_RUN ? '(DRY RUN)' : '(LIVE WRITE — admin SDK)'} ===\n`);

  const profilesSnap = await db.collection('player_profiles').get();
  console.log(`Scanning ${profilesSnap.size} player_profiles...`);

  let copied = 0;
  let copiedWithName = 0;
  let copiedNoName = 0;
  let alreadyInVault = 0;
  let errors = 0;

  const CONCURRENCY = 5;
  const docs = profilesSnap.docs;

  for (let i = 0; i < docs.length; i += CONCURRENCY) {
    const batch = docs.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async pDoc => {
      const pid = pDoc.id;
      const data = pDoc.data();

      if (pid === '_index') return;

      const vaultSnap = await db.collection('players').doc(pid).get();
      if (vaultSnap.exists) {
        alreadyInVault++;
        return;
      }

      const hasName = data.full_name && data.full_name.trim();
      let fullName = data.full_name || pid;

      const vaultDoc = {
        bref_id: pid,
        full_name: fullName,
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        position: data.position || '',
        height: data.height || '',
        weight: data.weight || '',
        birth_date: data.birth_date || '',
        seasons: data.seasons || [],
        accolades: data.accolades || [],
        eras: data.eras || [],
        is_custom: false,
        no_profile: !hasName,
        backfilled_from_profile: true,
        backfilled_at: new Date().toISOString(),
      };

      try {
        if (!DRY_RUN) {
          await db.collection('players').doc(pid).set(vaultDoc);
        }
        copied++;
        if (hasName) copiedWithName++;
        else copiedNoName++;
      } catch (e) {
        console.log(`  ERROR ${pid}: ${e.message}`);
        errors++;
      }
    }));
  }

  console.log(`\nSummary:`);
  console.log(`  Already in vault: ${alreadyInVault}`);
  console.log(`  Backfilled: ${copied}`);
  console.log(`    With name: ${copiedWithName}`);
  console.log(`    No name (placeholder): ${copiedNoName}`);
  if (errors > 0) console.log(`  Errors: ${errors}`);

  if (DRY_RUN) {
    console.log('\nDRY RUN - no writes performed.');
  }
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
