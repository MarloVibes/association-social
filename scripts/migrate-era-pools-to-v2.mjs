// Phase 5: migrate era_player_pools from full-object array to lightweight
// team-keyed map. Writes to era_player_pools_v2 first for validation.
// After validation we can atomic-swap or write directly to era_player_pools.
//
// Per locked vault decisions:
//   - Salary stays per-era (in the new shape)
//   - Identity (name, position, height, etc.) lives in vault, NOT in pool
//   - bref_id is the join key
//
// USAGE:
//   node scripts/migrate-era-pools-to-v2.mjs --dry-run
//   node scripts/migrate-era-pools-to-v2.mjs

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

const app = initializeApp({
  apiKey: "AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY",
  projectId: "association-social",
});
const db = getFirestore(app);

const DRY_RUN = process.argv.includes('--dry-run');
const ERAS = ['magic_bird', 'jordan', 'kobe', 'lebron', 'steph', 'current'];

function deriveBrefId(player) {
  // Try fields in order: bref_id, player_id (parse), fallback empty
  if (player.bref_id) return player.bref_id;
  if (player.player_id) {
    // Format like "pool_2003_jamesle01" or "current_jamesle01"
    const m = String(player.player_id).match(/^(?:current|pool_\d+)_(.+)$/);
    if (m) return m[1];
  }
  return null;
}

async function main() {
  console.log(`\n=== Era Pool Migration to v2 ${DRY_RUN ? '(DRY RUN)' : '(LIVE WRITE)'} ===\n`);

  const report = [];

  for (const era of ERAS) {
    console.log(`\n--- ${era} ---`);
    const snap = await getDoc(doc(db, 'era_player_pools', era));
    if (!snap.exists()) {
      console.log(`  era_player_pools/${era} not found, skipping`);
      continue;
    }

    const oldData = snap.data();
    const oldPlayers = oldData.players || [];
    console.log(`  Old shape: ${oldPlayers.length} players in players[] array`);

    // Group by team
    const teams = {};
    let withoutBrefId = 0;
    let withoutTeam = 0;

    for (const p of oldPlayers) {
      const brefId = deriveBrefId(p);
      if (!brefId) {
        withoutBrefId++;
        continue;
      }

      const team = p.team || 'FA';  // 'FA' bucket for teamless (shouldn't happen in pool, but safety)
      if (!p.team) withoutTeam++;

      if (!teams[team]) teams[team] = [];

      // Build lightweight per-era entry: only per-era data + bref_id reference
      teams[team].push({
        bref_id: brefId,
        player_id: p.player_id || (era + '_' + brefId),
        salary: p.salary || 0,
        team,
        jersey_number: p.jersey_number || '',
        age: p.age || null,
        season: p.season || null,
      });
    }

    const teamCount = Object.keys(teams).length;
    const playerCount = Object.values(teams).reduce((sum, arr) => sum + arr.length, 0);

    console.log(`  New shape: ${teamCount} teams, ${playerCount} total players`);
    if (withoutBrefId > 0) console.log(`  ⚠️  ${withoutBrefId} players without bref_id (dropped)`);
    if (withoutTeam > 0) console.log(`  ⚠️  ${withoutTeam} players without team (placed in 'FA' bucket)`);

    // Per-team breakdown (sample)
    const teamNames = Object.keys(teams).sort();
    console.log(`  Teams: ${teamNames.join(', ')}`);
    const sampleTeam = teamNames[0];
    console.log(`  Sample team ${sampleTeam}: ${teams[sampleTeam].length} players`);
    console.log(`  Sample player:`, JSON.stringify(teams[sampleTeam][0]));

    report.push({
      era,
      oldCount: oldPlayers.length,
      newCount: playerCount,
      teamCount,
      withoutBrefId,
      withoutTeam,
    });

    if (!DRY_RUN) {
      await setDoc(doc(db, 'era_player_pools_v2', era), {
        era,
        season: oldData.season || '',
        teams,
        total: playerCount,
        migrated_at: new Date().toISOString(),
      });
      console.log(`  ✅ Wrote era_player_pools_v2/${era}`);
    }
  }

  console.log(`\n=== Validation Report ===`);
  for (const r of report) {
    const lost = r.oldCount - r.newCount;
    const marker = lost === 0 ? '✅' : '⚠️';
    console.log(`${marker} ${r.era}: ${r.oldCount} -> ${r.newCount} (${lost} lost) | ${r.teamCount} teams`);
  }

  if (DRY_RUN) {
    console.log('\nDRY RUN - no writes performed.');
  }
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
