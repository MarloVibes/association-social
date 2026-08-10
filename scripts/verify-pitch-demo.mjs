import admin from 'firebase-admin';
import { resolve } from 'node:path';
import { readDemoServiceAccount } from './seed-pitch-demo-league.mjs';

const DEMO_PROJECT_ID = 'association-social-demo';

function argValue(name, fallback = '') {
  const prefix = `--${name}=`;
  return process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length) || fallback;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function verifyPitchDemo() {
  const serviceAccount = readDemoServiceAccount(argValue('serviceAccount', './demo-service-account.json'));
  const app = admin.apps.length
    ? admin.app()
    : admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: DEMO_PROJECT_ID,
    });
  const db = app.firestore();

  let leagueId = argValue('leagueId');
  if (!leagueId) {
    const leagues = await db.collection('leagues').get();
    const candidates = leagues.docs
      .filter(doc => doc.data()?.isPitchDemoLeague === true)
      .sort((a, b) => String(b.id).localeCompare(String(a.id)));
    leagueId = candidates[0]?.id || '';
  }
  assert(leagueId, 'No pitch demo league was found.');

  const leagueRef = db.collection('leagues').doc(leagueId);
  const [leagueSnap, teamsSnap] = await Promise.all([
    leagueRef.get(),
    leagueRef.collection('teams').get(),
  ]);
  assert(leagueSnap.exists, `Pitch demo league does not exist: ${leagueId}`);
  const league = leagueSnap.data() || {};
  assert(league.pitchDemoLocked === true, 'Pitch demo league is not locked.');
  assert(league.demoAccessLocked === true, 'Demo access lock is missing.');
  assert(Array.isArray(league.members) && league.members.length >= 2, 'Founder and viewer are not both league members.');
  assert(teamsSnap.size === 30, `Expected 30 teams, found ${teamsSnap.size}.`);

  const nonCpuTeams = teamsSnap.docs.filter(doc => doc.data()?.cpuControlled !== true);
  assert(nonCpuTeams.length <= 1, `Expected at most one founder-controlled team; found ${nonCpuTeams.length}.`);
  if (nonCpuTeams.length === 1) {
    assert(
      String(nonCpuTeams[0].data()?.gmId || '') === String(league.commissionerId || ''),
      'The claimed demo franchise is not controlled by the founder.',
    );
  }

  const memberSnaps = await Promise.all(league.members.map(uid => db.collection('users').doc(uid).get()));
  const roles = new Set(memberSnaps.map(snap => snap.data()?.pitchAccessRole));
  assert(roles.has('founder'), 'Founder role is missing from demo members.');
  assert(roles.has('viewer'), 'Viewer role is missing from demo members.');

  const scheduleId = String(league.scheduleId || '');
  assert(scheduleId, 'League scheduleId is missing.');
  const scheduleSnap = await leagueRef.collection('schedules').doc(scheduleId).get();
  assert(scheduleSnap.exists, `Schedule document is missing: ${scheduleId}`);
  const schedule = scheduleSnap.data() || {};
  assert(schedule.locked === true, 'Schedule document is not locked.');
  assert(Array.isArray(schedule.games) && schedule.games.length === 1230, `Expected 1230 games, found ${schedule.games?.length || 0}.`);
  const showcaseGameIds = Array.isArray(schedule.pitchDemoShowcaseGames) ? schedule.pitchDemoShowcaseGames : [];
  if (showcaseGameIds.length > 0) {
    const resultSnaps = await Promise.all(showcaseGameIds.map(gameId => (
      leagueRef.collection('schedules').doc(scheduleId).collection('gameResults').doc(String(gameId)).get()
    )));
    resultSnaps.forEach((resultSnap, index) => {
      assert(resultSnap.exists, `Showcase result is missing: ${showcaseGameIds[index]}`);
      const game = resultSnap.data()?.game;
      assert(game?.status === 'final', `Showcase game is not final: ${showcaseGameIds[index]}`);
      assert(game?.boxScore?.home?.players?.length >= 5, `Showcase home box score is incomplete: ${showcaseGameIds[index]}`);
      assert(game?.boxScore?.away?.players?.length >= 5, `Showcase away box score is incomplete: ${showcaseGameIds[index]}`);
    });
  }

  console.log('Pitch demo verification passed.');
  console.log(`Firebase project: ${DEMO_PROJECT_ID}`);
  console.log(`League: ${leagueId}`);
  console.log(`Members: ${league.members.length} (founder and viewer)`);
  console.log(`Teams: ${teamsSnap.size} (${nonCpuTeams.length === 1 ? '1 founder-controlled, 29 CPU-controlled' : 'all CPU-controlled'})`);
  console.log(`Schedule: ${schedule.games.length} games (locked)`);
  console.log(`Showcase results: ${showcaseGameIds.length} complete box scores`);
}

verifyPitchDemo()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
