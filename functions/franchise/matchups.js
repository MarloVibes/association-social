'use strict';

const REQUEST_WINDOW_MS = 60 * 60 * 1000;
const PREPARATION_WINDOW_MS = 5 * 60 * 1000;

class MatchupError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'MatchupError';
    this.code = code;
    this.details = details;
  }
}

function isActiveRequest(game) {
  return game && (game.status === 'requested' || game.status === 'preparing');
}

function participatingGms(game) {
  return [game.homeGmId, game.awayGmId].filter(Boolean);
}

function assertParticipant(game, uid) {
  if (!participatingGms(game).includes(uid)) {
    throw new MatchupError('permission-denied', 'Only a participating GM can manage this matchup.');
  }
}

function opponentUid(game, uid) {
  if (game.homeGmId === uid) return game.awayGmId || null;
  if (game.awayGmId === uid) return game.homeGmId || null;
  return null;
}

function requestMatchup({ game, uid, nowMs }) {
  if (!game || game.status !== 'scheduled') {
    if (isActiveRequest(game)) throw new MatchupError('already-exists', 'This game already has an active request.');
    throw new MatchupError('failed-precondition', 'Only scheduled games can be requested.');
  }
  assertParticipant(game, uid);
  const opponent = opponentUid(game, uid);
  if (!opponent) {
    return simulateScheduledGame({ game, uid, nowMs });
  }
  return {
    ...game,
    status: 'requested',
    requestedByUid: uid,
    requestedAtMs: nowMs,
    responseDeadlineMs: nowMs + REQUEST_WINDOW_MS,
  };
}

function expireMatchupRequest({ game, nowMs }) {
  if (!game || game.status !== 'requested') {
    throw new MatchupError('failed-precondition', 'Only requested games can expire.');
  }
  if (nowMs <= Number(game.responseDeadlineMs || 0)) {
    throw new MatchupError('failed-precondition', 'Request has not expired yet.');
  }
  return {
    ...game,
    status: 'expired',
    expiredAtMs: nowMs,
  };
}

function acceptMatchupRequest({ game, uid, nowMs }) {
  if (!game || game.status !== 'requested') {
    throw new MatchupError('failed-precondition', 'Only requested games can be accepted.');
  }
  assertParticipant(game, uid);
  if (game.requestedByUid === uid) {
    throw new MatchupError('permission-denied', 'The requesting GM cannot accept their own matchup.');
  }
  if (nowMs > Number(game.responseDeadlineMs || 0)) {
    return expireMatchupRequest({ game, nowMs });
  }
  return {
    ...game,
    status: 'preparing',
    acceptedByUid: uid,
    acceptedAtMs: nowMs,
    preparationDeadlineMs: nowMs + PREPARATION_WINDOW_MS,
  };
}

function simulateScheduledGame({ game, uid, nowMs }) {
  if (!game || !['scheduled', 'preparing'].includes(game.status)) {
    throw new MatchupError('failed-precondition', 'This game cannot be simulated yet.');
  }
  assertParticipant(game, uid);
  return {
    ...game,
    status: 'simulating',
    simulationStartedByUid: uid,
    simulationStartedAtMs: nowMs,
  };
}

function mapError(error, HttpsError) {
  if (error instanceof MatchupError) {
    return new HttpsError(error.code, error.message, error.details);
  }
  return error;
}

function createMatchupHandler({ getFirestore, HttpsError, now }) {
  return async (request) => {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
    const data = request.data || {};
    const leagueId = typeof data.leagueId === 'string' ? data.leagueId.trim() : '';
    const gameId = typeof data.gameId === 'string' ? data.gameId.trim() : '';
    if (!leagueId || !gameId) throw new HttpsError('invalid-argument', 'Provide leagueId and gameId.');
    return { uid, data, leagueId, gameId };
  };
}

function createGameMutationHandler({ getFirestore, HttpsError, now, mutate }) {
  const base = createMatchupHandler({ getFirestore, HttpsError, now });
  return async (request) => {
    const { uid, leagueId, gameId } = await base(request);
    const db = getFirestore();
    const leagueRef = db.collection('leagues').doc(leagueId);
    return db.runTransaction(async (tx) => {
      const leagueSnap = await tx.get(leagueRef);
      if (!leagueSnap.exists) throw new HttpsError('not-found', 'League not found.');
      const league = leagueSnap.data() || {};
      const scheduleId = league.scheduleId || String(league.currentYear || 2025);
      const scheduleRef = leagueRef.collection('schedules').doc(scheduleId);
      const scheduleSnap = await tx.get(scheduleRef);
      if (!scheduleSnap.exists) throw new HttpsError('not-found', 'Schedule not found.');
      const schedule = scheduleSnap.data() || {};
      const games = Array.isArray(schedule.games) ? schedule.games : [];
      const gameIndex = games.findIndex(game => game.id === gameId);
      if (gameIndex < 0) throw new HttpsError('not-found', 'Game not found.');
      let nextGame;
      try {
        nextGame = mutate({ game: games[gameIndex], uid, nowMs: now() });
      } catch (error) {
        throw mapError(error, HttpsError);
      }
      const nextGames = [...games];
      nextGames[gameIndex] = nextGame;
      tx.update(scheduleRef, { games: nextGames });
      return nextGame;
    });
  };
}

function createRequestMatchupHandler(deps) {
  return createGameMutationHandler({
    ...deps,
    mutate: ({ game, uid, nowMs }) => requestMatchup({ game, uid, nowMs }),
  });
}

function createAcceptMatchupHandler(deps) {
  return createGameMutationHandler({
    ...deps,
    mutate: ({ game, uid, nowMs }) => acceptMatchupRequest({ game, uid, nowMs }),
  });
}

function createSimulateScheduledGameHandler(deps) {
  return createGameMutationHandler({
    ...deps,
    mutate: ({ game, uid, nowMs }) => simulateScheduledGame({ game, uid, nowMs }),
  });
}

function createExpireMatchupRequestHandler(deps) {
  return createGameMutationHandler({
    ...deps,
    mutate: ({ game, nowMs }) => expireMatchupRequest({ game, nowMs }),
  });
}

module.exports = {
  MatchupError,
  REQUEST_WINDOW_MS,
  PREPARATION_WINDOW_MS,
  acceptMatchupRequest,
  createAcceptMatchupHandler,
  createExpireMatchupRequestHandler,
  createRequestMatchupHandler,
  createSimulateScheduledGameHandler,
  expireMatchupRequest,
  requestMatchup,
  simulateScheduledGame,
};
