import admin from 'firebase-admin';
import { createRequire } from 'node:module';
import { readDemoServiceAccount } from './seed-pitch-demo-league.mjs';

const require = createRequire(import.meta.url);
const {
  cleanFirestoreData,
  simulateScheduledGameResult,
} = require('../functions/franchise/matchups.js');

const DEMO_PROJECT_ID = 'association-social-demo';

function argValue(name, fallback = '') {
  const prefix = `--${name}=`;
  return process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length) || fallback;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function teamAliases(team, docId) {
  return [docId, team.id, team.teamId, team.abbreviation, team.abbr]
    .filter(Boolean)
    .map(value => String(value).trim().toUpperCase());
}

function compactFinalGame(game) {
  return cleanFirestoreData({
    id: game.id,
    status: 'final',
    sequence: game.sequence,
    week: game.week,
    homeTeamId: game.homeTeamId,
    awayTeamId: game.awayTeamId,
    homeGmId: game.homeGmId,
    awayGmId: game.awayGmId,
    sport: game.sport,
    leagueSport: game.leagueSport,
    competition: game.competition,
    countsForRegularSeason: game.countsForRegularSeason,
    groupId: game.groupId,
    cupSequence: game.cupSequence,
    stage: game.stage,
    homeTeamName: game.homeTeamName,
    awayTeamName: game.awayTeamName,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    winnerTeamId: game.winnerTeamId,
    loserTeamId: game.loserTeamId,
    resultSource: 'pitch-demo-showcase',
    finalAtMs: game.finalAtMs,
    quarters: game.quarters,
    resultDetailsStorage: 'gameResults',
  });
}

async function seedShowcase() {
  const serviceAccount = readDemoServiceAccount(argValue('serviceAccount', './demo-service-account.json'));
  const app = admin.apps.length
    ? admin.app()
    : admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: DEMO_PROJECT_ID,
    });
  const db = app.firestore();
  const requestedCount = Number(argValue('games', '12'));
  assert(Number.isInteger(requestedCount) && requestedCount >= 1 && requestedCount <= 30, 'Use --games=1 through 30.');

  let leagueId = argValue('leagueId');
  if (!leagueId) {
    const leagues = await db.collection('leagues').where('isPitchDemoLeague', '==', true).get();
    leagueId = leagues.docs.sort((a, b) => String(b.id).localeCompare(String(a.id)))[0]?.id || '';
  }
  assert(leagueId, 'No pitch demo league was found.');

  const leagueRef = db.collection('leagues').doc(leagueId);
  const [leagueSnap, teamsSnap] = await Promise.all([
    leagueRef.get(),
    leagueRef.collection('teams').get(),
  ]);
  assert(leagueSnap.exists, `Pitch demo league does not exist: ${leagueId}`);
  const league = leagueSnap.data() || {};
  assert(league.isPitchDemoLeague === true && league.pitchDemoLocked === true, 'Refusing to seed an unlocked or non-demo league.');
  assert(teamsSnap.size === 30, `Expected 30 demo teams, found ${teamsSnap.size}.`);

  const teamsByAlias = new Map();
  teamsSnap.docs.forEach((teamDoc) => {
    const team = { id: teamDoc.id, ...teamDoc.data() };
    teamAliases(team, teamDoc.id).forEach(alias => teamsByAlias.set(alias, team));
  });

  const scheduleId = String(league.scheduleId || league.currentYear || '2025');
  const scheduleRef = leagueRef.collection('schedules').doc(scheduleId);
  const scheduleSnap = await scheduleRef.get();
  assert(scheduleSnap.exists, `Schedule document is missing: ${scheduleId}`);
  const schedule = scheduleSnap.data() || {};
  const games = Array.isArray(schedule.games) ? schedule.games : [];
  assert(games.length > 0, 'Pitch demo schedule has no games.');

  const candidates = games
    .filter(game => game && game.status === 'scheduled')
    .sort((left, right) => Number(left.sequence || 0) - Number(right.sequence || 0))
    .slice(0, requestedCount);
  assert(candidates.length === requestedCount, `Only ${candidates.length} scheduled games are available.`);

  const completedById = new Map();
  const resultWrites = [];
  candidates.forEach((game, index) => {
    const homeTeam = teamsByAlias.get(String(game.homeTeamId || '').toUpperCase());
    const awayTeam = teamsByAlias.get(String(game.awayTeamId || '').toUpperCase());
    assert(homeTeam, `Missing demo roster for ${game.homeTeamId}.`);
    assert(awayTeam, `Missing demo roster for ${game.awayTeamId}.`);
    const nowMs = Date.UTC(2026, 7, 1, 18, 0, 0) + index * 3_600_000;
    const result = simulateScheduledGameResult({
      game: { ...game, sport: 'nba', leagueSport: 'nba' },
      uid: String(league.commissionerId || 'pitch-founder'),
      nowMs,
      homeTeam,
      awayTeam,
      skipParticipantCheck: true,
    });
    const showcaseGame = cleanFirestoreData({
      ...result.game,
      liveTimeline: undefined,
      liveMode: undefined,
      resultSource: 'pitch-demo-showcase',
      resultDetailsStorage: 'gameResults',
    });
    completedById.set(String(game.id), compactFinalGame(showcaseGame));
    resultWrites.push({
      ref: scheduleRef.collection('gameResults').doc(String(game.id)),
      payload: cleanFirestoreData({
        gameId: game.id,
        game: showcaseGame,
        pitchDemoShowcase: true,
        updatedAtMs: nowMs,
      }),
    });
  });

  const updateGames = source => (Array.isArray(source)
    ? source.map(game => completedById.get(String(game?.id)) || game)
    : source);
  const batch = db.batch();
  resultWrites.forEach(({ ref, payload }) => batch.set(ref, payload, { merge: true }));
  batch.set(scheduleRef, cleanFirestoreData({
    games: updateGames(schedule.games),
    ...(schedule.nbaCup ? {
      nbaCup: {
        ...schedule.nbaCup,
        games: updateGames(schedule.nbaCup.games),
      },
    } : {}),
    pitchDemoShowcaseGames: [...completedById.keys()],
    pitchDemoShowcaseSeededAt: admin.firestore.FieldValue.serverTimestamp(),
  }), { merge: true });
  await batch.commit();

  console.log('Pitch demo showcase data ready.');
  console.log(`Firebase project: ${DEMO_PROJECT_ID}`);
  console.log(`League: ${leagueId}`);
  console.log(`Completed showcase games: ${resultWrites.length}`);
}

seedShowcase()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
