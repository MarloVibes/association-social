import admin from 'firebase-admin';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadLocalEraData, readDemoServiceAccount } from './seed-pitch-demo-league.mjs';

const DEMO_PROJECT_ID = 'association-social-demo';
const ERAS = ['current', 'magic_bird', 'jordan', 'kobe', 'lebron', 'steph'];

function argValue(name, fallback = '') {
  const prefix = `--${name}=`;
  return process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length) || fallback;
}

async function seedPitchDemoCatalogs() {
  const serviceAccount = readDemoServiceAccount(argValue('serviceAccount', './demo-service-account.json'));
  const app = admin.apps.length
    ? admin.app()
    : admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: DEMO_PROJECT_ID,
    });
  const db = app.firestore();
  const batch = db.batch();
  const now = admin.firestore.FieldValue.serverTimestamp();
  let playerCount = 0;
  let teamCount = 0;

  ERAS.forEach((era) => {
    const { players, teams, sourceFile } = loadLocalEraData(era);
    playerCount += players.length;
    batch.set(db.collection('era_player_pools').doc(era), {
      era,
      players,
      source: `pitch_demo_catalog:${sourceFile}`,
      updatedAt: now,
    }, { merge: true });

    teams.forEach((team) => {
      teamCount += 1;
      batch.set(db.collection('era_rosters').doc(era).collection('teams').doc(team.id), {
        id: team.id,
        teamId: team.teamId,
        abbreviation: team.abbreviation,
        city: team.city,
        name: team.name,
        full_name: team.fullName,
        fullName: team.fullName,
        conference: team.conference,
        division: team.division,
        era,
        players: (team.players || []).slice(0, 18),
        source: 'pitch_demo_catalog',
        updatedAt: now,
      }, { merge: true });
    });
  });

  await batch.commit();
  console.log(`Pitch demo catalogs ready: ${ERAS.length} eras, ${teamCount} teams, ${playerCount} players.`);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) {
  seedPitchDemoCatalogs()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error.message || error);
      process.exit(1);
    });
}
