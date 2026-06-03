import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./service-account.json', 'utf-8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main() {
  console.log('Loading all era player pools...');
  const poolsSnap = await db.collection('era_player_pools').get();
  
  // Build a lookup: { eraKey -> { player_id -> salary } }
  const eraSalaries = {};
  for (const poolDoc of poolsSnap.docs) {
    const data = poolDoc.data();
    const map = {};
    (data.players || []).forEach(p => {
      const pid = p.player_id || p.full_name;
      if (pid && typeof p.salary === 'number') {
        map[pid] = p.salary;
      }
    });
    eraSalaries[poolDoc.id] = map;
    console.log(`  ${poolDoc.id}: ${Object.keys(map).length} player salaries indexed`);
  }

  console.log('\nFetching all leagues...');
  const leaguesSnap = await db.collection('leagues').get();
  
  let teamsUpdated = 0;
  let playersUpdated = 0;
  let teamsSkipped = 0;

  for (const leagueDoc of leaguesSnap.docs) {
    const teamsSnap = await db.collection('leagues').doc(leagueDoc.id).collection('teams').get();
    for (const teamDoc of teamsSnap.docs) {
      const team = teamDoc.data();
      const eraKey = team.era || 'current';
      const salaryMap = eraSalaries[eraKey];
      if (!salaryMap) {
        teamsSkipped++;
        continue;
      }
      const players = team.players || [];
      let changed = false;
      const newPlayers = players.map(p => {
        if (typeof p.salary === 'number' && p.salary > 0) return p;
        const pid = p.player_id || p.full_name;
        const salary = salaryMap[pid];
        if (salary !== undefined) {
          changed = true;
          playersUpdated++;
          return { ...p, salary };
        }
        return p;
      });
      if (changed) {
        await teamDoc.ref.update({ players: newPlayers });
        teamsUpdated++;
        console.log(`  ${team.name || teamDoc.id} (${eraKey}): updated`);
      }
    }
  }

  console.log(`\nDone. Updated ${teamsUpdated} teams, ${playersUpdated} player salaries backfilled. ${teamsSkipped} teams skipped (no era pool).`);
}

main().catch(e => { console.error(e); process.exit(1); });
