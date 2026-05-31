// Build the canonical 'players/' vault collection from existing data.
//
// Reads:  era_player_pools/* (for era participation + team) + player_profiles/* (for identity + career)
// Writes: players/{bref_id} as the new source of truth
//
// Each vault doc holds identity + career data. Salary stays per-era in
// era_player_pools (per the locked decision). Era participation is tracked
// in a vault `eras` array.
//
// USAGE:
//   node scripts/build-player-vault.mjs --dry-run   (preview, no writes)
//   node scripts/build-player-vault.mjs              (writes to players/)
//
// THIS SCRIPT HAS NOT BEEN EXECUTED YET. Review carefully before running.

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, getDocs, setDoc, collection } from 'firebase/firestore';

const app = initializeApp({
  apiKey: "AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY",
  projectId: "association-social",
});
const db = getFirestore(app);

const ERA_KEYS = ['magic_bird', 'jordan', 'kobe', 'lebron', 'steph', 'current'];

const DRY_RUN = process.argv.includes('--dry-run');

function normName(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function main() {
  console.log(`\n=== Player Vault Builder ${DRY_RUN ? '(DRY RUN)' : '(LIVE WRITE)'} ===\n`);

  // 1. Read all era pools, collect every player by full_name
  // We'll map full_name -> { eras: Set, teams: Map<era, team>, sample_entry }
  const playerByName = new Map();

  for (const era of ERA_KEYS) {
    console.log(`Reading era_player_pools/${era}...`);
    const snap = await getDoc(doc(db, 'era_player_pools', era));
    if (!snap.exists()) {
      console.log(`  (not found, skipping)`);
      continue;
    }
    const pool = snap.data();
    const players = pool.players || [];
    console.log(`  ${players.length} players`);

    for (const p of players) {
      const key = normName(p.full_name);
      if (!key) continue;
      if (!playerByName.has(key)) {
        playerByName.set(key, {
          full_name: p.full_name,
          first_name: p.first_name || '',
          last_name: p.last_name || '',
          eras: new Set(),
          era_teams: {},          // era -> team
          sample_entry: p,         // last-seen entry for identity defaults
        });
      }
      const slot = playerByName.get(key);
      slot.eras.add(era);
      if (p.team) slot.era_teams[era] = p.team;
    }
  }

  console.log(`\nUnique players across all eras: ${playerByName.size}\n`);

  // 2. Read all player_profiles to get bref_id + career data
  // player_profiles are keyed by bref_id, and contain { name, height, weight, birth_date, position, seasons, accolades }
  console.log('Reading player_profiles/* ...');
  const profilesSnap = await getDocs(collection(db, 'player_profiles'));
  console.log(`  ${profilesSnap.size} profile docs (includes _index meta doc)`);

  const profileByName = new Map();    // normName -> profile doc
  for (const d of profilesSnap.docs) {
    if (d.id === '_index') continue;
    const data = d.data();
    if (!data.name) continue;
    profileByName.set(normName(data.name), { bref_id: d.id, ...data });
  }
  console.log(`  Indexed ${profileByName.size} profiles by name\n`);

  // 3. Merge: build vault docs
  let matched = 0;
  let unmatched_names = [];
  const vaultDocs = [];

  for (const [key, slot] of playerByName.entries()) {
    const profile = profileByName.get(key);

    let vaultId, vaultDoc;
    if (profile) {
      matched++;
      vaultId = profile.bref_id;
      vaultDoc = {
        bref_id: profile.bref_id,
        full_name: profile.name || slot.full_name,
        first_name: slot.first_name,
        last_name: slot.last_name,
        position: profile.position || slot.sample_entry.position || '',
        height: profile.height || '',
        weight: profile.weight || '',
        birth_date: profile.birth_date || '',
        jersey_number: slot.sample_entry.jersey_number || '',
        accolades: profile.accolades || [],
        seasons: profile.seasons || [],
        eras: Array.from(slot.eras),
        is_custom: false,
        created_at: new Date().toISOString(),
      };
    } else {
      // No profile match. Generate a vault id from name. Still useful for era-only players.
      unmatched_names.push(slot.full_name);
      vaultId = `pool_${key}`;
      vaultDoc = {
        bref_id: vaultId,
        full_name: slot.full_name,
        first_name: slot.first_name,
        last_name: slot.last_name,
        position: slot.sample_entry.position || '',
        height: '',
        weight: '',
        birth_date: '',
        jersey_number: slot.sample_entry.jersey_number || '',
        accolades: [],
        seasons: [],
        eras: Array.from(slot.eras),
        is_custom: false,
        no_profile: true,    // flag: this player has no career profile yet
        created_at: new Date().toISOString(),
      };
    }
    vaultDocs.push({ id: vaultId, data: vaultDoc });
  }

  console.log(`Matched with profile: ${matched}`);
  console.log(`Unmatched (no profile): ${unmatched_names.length}`);
  if (unmatched_names.length > 0 && unmatched_names.length <= 30) {
    console.log('  Unmatched names:', unmatched_names);
  } else if (unmatched_names.length > 30) {
    console.log('  First 30:', unmatched_names.slice(0, 30));
  }

  console.log(`\nTotal vault docs to write: ${vaultDocs.length}\n`);

  // 4. Write (or skip if dry run)
  if (DRY_RUN) {
    console.log('DRY RUN — no writes performed.\n');
    console.log('Sample vault doc:');
    console.log(JSON.stringify(vaultDocs[0]?.data, null, 2));
    console.log('\nRun without --dry-run to write to Firestore.');
    process.exit(0);
  }

  console.log('Writing vault docs...');
  let written = 0;
  for (const { id, data } of vaultDocs) {
    try {
      await setDoc(doc(db, 'players', id), data);
      written++;
      if (written % 50 === 0) console.log(`  ${written}/${vaultDocs.length}`);
    } catch (e) {
      console.error(`FAILED for ${id}:`, e.message);
    }
  }
  console.log(`\nDone. Wrote ${written}/${vaultDocs.length} vault docs.`);
  process.exit(0);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
