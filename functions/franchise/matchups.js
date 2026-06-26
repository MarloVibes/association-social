'use strict';

const { FinalizeGameError, finalizeGame } = require('./finalizeGame');

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

function hash(value) {
  let h = 2166136261;
  for (let i = 0; i < String(value).length; i += 1) {
    h ^= String(value).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function simulatedScore(game, nowMs) {
  const seed = `${game.id}:${game.homeTeamId}:${game.awayTeamId}:${nowMs}`;
  let homeScore = 88 + (hash(`${seed}:home`) % 45);
  let awayScore = 88 + (hash(`${seed}:away`) % 45);
  if (homeScore === awayScore) {
    homeScore += (hash(`${seed}:ot`) % 2) + 1;
  }
  return { homeScore, awayScore };
}

function numberFrom(value, fallback = 60) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function playerKey(player) {
  return String(player && (player.player_id || player.playerId || player.id || player.full_name || player.name) || '');
}

function playerSkill(player, key) {
  if (player && player.hidden && typeof player.hidden === 'object') return numberFrom(player.hidden[key], 60);
  if (player && Number.isFinite(player[key])) return numberFrom(player[key], 60);
  return 60;
}

function simPlayerValue(player) {
  return playerSkill(player, 'shooting') * 0.45
    + playerSkill(player, 'playmaking') * 0.25
    + playerSkill(player, 'defense') * 0.2
    + playerSkill(player, 'basketballIq') * 0.1;
}

function simPlayersForTeam(team, teamId) {
  const source = Array.isArray(team && team.players) ? team.players : [];
  const players = source.length > 0
    ? source
    : Array.from({ length: 8 }, (_, index) => ({
      player_id: `${teamId || 'cpu'}-${index}`,
      full_name: `${teamId || 'CPU'} Player ${index + 1}`,
      hidden: { shooting: 60, playmaking: 60, defense: 60, basketballIq: 60 },
    }));
  return [...players]
    .sort((left, right) => simPlayerValue(right) - simPlayerValue(left) || playerKey(left).localeCompare(playerKey(right)))
    .slice(0, 10);
}

function normalizeSimulationMinutes(players) {
  const weights = players.map((player, index) => Math.max(1, Number(player.minutes || player.rotationMinutes || (index < 5 ? 32 : 18))));
  const total = weights.reduce((sum, value) => sum + value, 0) || 1;
  const minutes = weights.map(value => Math.max(1, Math.floor((value / total) * 240)));
  let diff = 240 - minutes.reduce((sum, value) => sum + value, 0);
  let cursor = 0;
  while (diff !== 0 && minutes.length > 0) {
    const direction = diff > 0 ? 1 : -1;
    if (direction > 0 || minutes[cursor] > 1) {
      minutes[cursor] += direction;
      diff -= direction;
    }
    cursor = (cursor + 1) % minutes.length;
  }
  return minutes;
}

function distributeTeamPoints(players, minutes, teamPoints, seed) {
  const weights = players.map((player, index) => (
    Math.max(1, minutes[index] * (playerSkill(player, 'shooting') + playerSkill(player, 'playmaking') * 0.25 + (hash(`${seed}:${playerKey(player)}`) % 8)) / 100)
  ));
  const total = weights.reduce((sum, value) => sum + value, 0) || 1;
  const points = weights.map(weight => Math.floor((weight / total) * teamPoints));
  let diff = teamPoints - points.reduce((sum, value) => sum + value, 0);
  let cursor = 0;
  while (diff > 0 && points.length > 0) {
    points[cursor] += 1;
    diff -= 1;
    cursor = (cursor + 1) % points.length;
  }
  return points;
}

function shootingLine(points, variance) {
  const threePointersMade = Math.min(Math.floor(points / 3), Math.floor((points * (15 + (variance % 18))) / 300));
  let remaining = points - (threePointersMade * 3);
  let freeThrowsMade = Math.min(remaining, variance % 5);
  if ((remaining - freeThrowsMade) % 2 !== 0 && freeThrowsMade > 0) freeThrowsMade -= 1;
  remaining -= freeThrowsMade;
  const twoPointersMade = Math.max(0, Math.floor(remaining / 2));
  const fieldGoalsMade = twoPointersMade + threePointersMade;
  return {
    fieldGoalsMade,
    fieldGoalsAttempted: fieldGoalsMade + 2 + (variance % 7),
    threePointersMade,
    threePointersAttempted: threePointersMade + (variance % 5),
    freeThrowsMade,
    freeThrowsAttempted: freeThrowsMade + (variance % 3),
  };
}

function buildSimulationTeamBox({ team, teamId, targetPoints, seed, pointMargin }) {
  const players = simPlayersForTeam(team, teamId);
  const minutes = normalizeSimulationMinutes(players);
  const points = distributeTeamPoints(players, minutes, targetPoints, seed);
  const boxPlayers = players.map((player, index) => {
    const variance = hash(`${seed}:${teamId}:${playerKey(player)}:line`);
    const rebounds = Math.max(0, Math.round(minutes[index] * (playerSkill(player, 'rebounding') || playerSkill(player, 'defense')) / 150) + (variance % 4));
    const offensiveRebounds = Math.floor(rebounds * (20 + (variance % 18)) / 100);
    const line = shootingLine(points[index], variance);
    return {
      playerId: playerKey(player),
      name: player.full_name || player.name || playerKey(player),
      minutes: minutes[index],
      points: points[index],
      rebounds,
      assists: Math.max(0, Math.round(minutes[index] * playerSkill(player, 'playmaking') / 170) + (variance % 3)),
      steals: variance % 3,
      blocks: Math.floor((variance / 7) % 3),
      turnovers: Math.floor((variance / 11) % 4),
      ...line,
      offensiveRebounds,
      defensiveRebounds: rebounds - offensiveRebounds,
      fouls: 1 + (variance % 5),
      plusMinus: Math.round(pointMargin * (minutes[index] / 240) + ((variance % 7) - 3)),
      starter: index < 5,
    };
  });
  return {
    teamId,
    points: targetPoints,
    rebounds: boxPlayers.reduce((total, player) => total + player.rebounds, 0),
    assists: boxPlayers.reduce((total, player) => total + player.assists, 0),
    turnovers: boxPlayers.reduce((total, player) => total + player.turnovers, 0),
    fieldGoalsMade: boxPlayers.reduce((total, player) => total + player.fieldGoalsMade, 0),
    fieldGoalsAttempted: boxPlayers.reduce((total, player) => total + player.fieldGoalsAttempted, 0),
    threePointersMade: boxPlayers.reduce((total, player) => total + player.threePointersMade, 0),
    threePointersAttempted: boxPlayers.reduce((total, player) => total + player.threePointersAttempted, 0),
    freeThrowsMade: boxPlayers.reduce((total, player) => total + player.freeThrowsMade, 0),
    freeThrowsAttempted: boxPlayers.reduce((total, player) => total + player.freeThrowsAttempted, 0),
    fouls: boxPlayers.reduce((total, player) => total + player.fouls, 0),
    players: boxPlayers,
  };
}

function teamSimulationStrength(team, teamId) {
  const players = simPlayersForTeam(team, teamId);
  const topEight = players.slice(0, 8);
  return topEight.reduce((sum, player) => sum + simPlayerValue(player), 0) / Math.max(1, topEight.length);
}

function quarterScores(homeScore, awayScore, seed) {
  const split = (total, label) => {
    const raw = [0, 1, 2, 3].map(index => 20 + (hash(`${seed}:${label}:${index}`) % 12));
    const rawTotal = raw.reduce((sum, value) => sum + value, 0) || 1;
    const scores = raw.map(value => Math.floor((value / rawTotal) * total));
    let diff = total - scores.reduce((sum, value) => sum + value, 0);
    let cursor = 0;
    while (diff > 0) {
      scores[cursor] += 1;
      diff -= 1;
      cursor = (cursor + 1) % scores.length;
    }
    return scores;
  };
  const home = split(homeScore, 'home');
  const away = split(awayScore, 'away');
  return [0, 1, 2, 3].map(index => ({ quarter: index + 1, home: home[index], away: away[index] }));
}

function simulateRosterGame({ game, homeTeam, awayTeam, nowMs }) {
  const seed = `${game.id}:${game.homeTeamId}:${game.awayTeamId}:${nowMs}`;
  const homeStrength = teamSimulationStrength(homeTeam, game.homeTeamId);
  const awayStrength = teamSimulationStrength(awayTeam, game.awayTeamId);
  let homeScore = 75 + Math.round(homeStrength * 0.55) + 3 + (hash(`${seed}:home-roster`) % 8);
  let awayScore = 75 + Math.round(awayStrength * 0.55) + (hash(`${seed}:away-roster`) % 8);
  if (homeScore === awayScore) homeScore += 1;
  const home = buildSimulationTeamBox({
    team: homeTeam,
    teamId: game.homeTeamId,
    targetPoints: homeScore,
    seed: `${seed}:home`,
    pointMargin: homeScore - awayScore,
  });
  const away = buildSimulationTeamBox({
    team: awayTeam,
    teamId: game.awayTeamId,
    targetPoints: awayScore,
    seed: `${seed}:away`,
    pointMargin: awayScore - homeScore,
  });
  const winnerTeamId = homeScore > awayScore ? game.homeTeamId : game.awayTeamId;
  return {
    homeScore,
    awayScore,
    boxScore: { home, away },
    quarters: quarterScores(homeScore, awayScore, seed),
    story: `${winnerTeamId} controlled the decisive stretches behind roster strength and rotation production.`,
  };
}

function teamStateForFinalization(team) {
  return {
    fatigue: team && team.fatigue,
    fatigueSequence: team && team.fatigueSequence,
    minorInjuryCount: team && team.minorInjuryCount,
    severeInjuryCount: team && team.severeInjuryCount,
    injuries: team && team.injuries,
  };
}

function teamStateUpdatePayload(state) {
  if (!state) return null;
  return {
    fatigue: Number(state.fatigue) || 0,
    fatigueSequence: Number(state.fatigueSequence) || 0,
    minorInjuryCount: Number(state.minorInjuryCount) || 0,
    severeInjuryCount: Number(state.severeInjuryCount) || 0,
    injuries: Array.isArray(state.injuries) ? state.injuries : [],
  };
}

function playerBoxScoreKey(player) {
  return String(player && (player.playerId || player.player_id || player.id || player.full_name || player.name) || '');
}

function addStat(stats, key, value) {
  const next = { ...(stats || {}) };
  next[key] = Number(next[key] || 0) + Number(value || 0);
  return next;
}

function subtractStat(stats, key, value) {
  const next = { ...(stats || {}) };
  const nextValue = Number(next[key] || 0) - Number(value || 0);
  next[key] = key === 'plusMinus' ? nextValue : Math.max(0, nextValue);
  return next;
}

function applyBoxScoreToRoster(players, teamBoxScore) {
  if (!Array.isArray(players) || !teamBoxScore || !Array.isArray(teamBoxScore.players)) return players;
  const lines = new Map(teamBoxScore.players.map(line => [playerBoxScoreKey(line), line]));
  return players.map((player) => {
    const line = lines.get(playerBoxScoreKey(player));
    if (!line) return player;
    let seasonStats = addStat(player.seasonStats, 'games', 1);
    [
      'minutes',
      'points',
      'rebounds',
      'assists',
      'steals',
      'blocks',
      'turnovers',
      'fieldGoalsMade',
      'fieldGoalsAttempted',
      'threePointersMade',
      'threePointersAttempted',
      'freeThrowsMade',
      'freeThrowsAttempted',
      'offensiveRebounds',
      'defensiveRebounds',
      'fouls',
      'plusMinus',
    ].forEach((key) => {
      seasonStats = addStat(seasonStats, key, line[key]);
    });
    return { ...player, seasonStats };
  });
}

function rollbackBoxScoreFromRoster(players, teamBoxScore) {
  if (!Array.isArray(players) || !teamBoxScore || !Array.isArray(teamBoxScore.players)) return players;
  const lines = new Map(teamBoxScore.players.map(line => [playerBoxScoreKey(line), line]));
  return players.map((player) => {
    const line = lines.get(playerBoxScoreKey(player));
    if (!line) return player;
    let seasonStats = subtractStat(player.seasonStats, 'games', 1);
    [
      'minutes',
      'points',
      'rebounds',
      'assists',
      'steals',
      'blocks',
      'turnovers',
      'fieldGoalsMade',
      'fieldGoalsAttempted',
      'threePointersMade',
      'threePointersAttempted',
      'freeThrowsMade',
      'freeThrowsAttempted',
      'offensiveRebounds',
      'defensiveRebounds',
      'fouls',
      'plusMinus',
    ].forEach((key) => {
      seasonStats = subtractStat(seasonStats, key, line[key]);
    });
    return { ...player, seasonStats };
  });
}

function teamPersistencePayload({ state, team, teamBoxScore }) {
  const payload = teamStateUpdatePayload(state);
  if (!payload) return null;
  if (team && Array.isArray(team.players) && teamBoxScore) {
    payload.players = applyBoxScoreToRoster(team.players, teamBoxScore);
  }
  return payload;
}

function teamResetPayload({ game, side, team }) {
  if (!game || !team || game.status !== 'final') return null;
  const fatigue = game.fatigue && game.fatigue[side];
  const gameInjuries = game.injuries && Array.isArray(game.injuries[side]) ? game.injuries[side] : [];
  const injuryIds = new Set(gameInjuries.map(injury => injury && injury.id).filter(Boolean));
  const remainingInjuries = Array.isArray(team.injuries)
    ? team.injuries.filter(injury => !injuryIds.has(injury && injury.id))
    : [];
  const minorRollback = gameInjuries.filter(injury => injury && injury.severity === 'minor').length;
  const severeRollback = gameInjuries.filter(injury => injury && injury.severity === 'severe').length;
  const payload = {
    fatigue: fatigue ? Number(fatigue.before || 0) : Number(team.fatigue || 0),
    fatigueSequence: fatigue ? Math.max(0, Number(fatigue.sequence || 0) - 1) : Number(team.fatigueSequence || 0),
    minorInjuryCount: Math.max(0, Number(team.minorInjuryCount || 0) - minorRollback),
    severeInjuryCount: Math.max(0, Number(team.severeInjuryCount || 0) - severeRollback),
    injuries: remainingInjuries,
  };
  const teamBoxScore = game.boxScore && game.boxScore[side];
  if (Array.isArray(team.players) && teamBoxScore) {
    payload.players = rollbackBoxScoreFromRoster(team.players, teamBoxScore);
  }
  return payload;
}

function safeCoachingSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const offense = typeof snapshot.offense === 'string' ? snapshot.offense : null;
  const defense = typeof snapshot.defense === 'string' ? snapshot.defense : null;
  if (!offense && !defense) return null;
  return {
    name: typeof snapshot.name === 'string' ? snapshot.name : null,
    offense,
    defense,
    presetId: typeof snapshot.presetId === 'string' ? snapshot.presetId : typeof snapshot.id === 'string' ? snapshot.id : null,
  };
}

function gameWithCoachingSnapshots({ game, homeSnapshot, awaySnapshot }) {
  const home = safeCoachingSnapshot(homeSnapshot);
  const away = safeCoachingSnapshot(awaySnapshot);
  return {
    ...game,
    ...(home ? {
      homeCoachingStyle: home.offense,
      homeDefensiveStyle: home.defense,
      homeCoachingPresetName: home.name,
      homeCoachingPresetId: home.presetId,
    } : {}),
    ...(away ? {
      awayCoachingStyle: away.offense,
      awayDefensiveStyle: away.defense,
      awayCoachingPresetName: away.name,
      awayCoachingPresetId: away.presetId,
    } : {}),
  };
}

function persistTeamStates({ tx, homeTeam, awayTeam, result }) {
  const homePayload = teamPersistencePayload({
    state: result && result.teamStates && result.teamStates[result.game.homeTeamId],
    team: homeTeam,
    teamBoxScore: result && result.game && result.game.boxScore && result.game.boxScore.home,
  });
  const awayPayload = teamPersistencePayload({
    state: result && result.teamStates && result.teamStates[result.game.awayTeamId],
    team: awayTeam,
    teamBoxScore: result && result.game && result.game.boxScore && result.game.boxScore.away,
  });
  if (homeTeam && homeTeam.ref && homePayload) tx.update(homeTeam.ref, homePayload);
  if (awayTeam && awayTeam.ref && awayPayload) tx.update(awayTeam.ref, awayPayload);
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

function simulateScheduledGameResult({ game, uid, nowMs, homeTeam, awayTeam }) {
  if (!game || !['scheduled', 'preparing'].includes(game.status)) {
    throw new MatchupError('failed-precondition', 'This game cannot be simulated yet.');
  }
  assertParticipant(game, uid);
  const rosterSimulation = homeTeam || awayTeam
    ? simulateRosterGame({ game, homeTeam, awayTeam, nowMs })
    : null;
  const { homeScore, awayScore } = rosterSimulation || simulatedScore(game, nowMs);
  const result = finalizeGame({
    game,
    uid,
    nowMs,
    homeScore,
    awayScore,
    source: 'simulation',
    teamStates: {
      [game.homeTeamId]: teamStateForFinalization(homeTeam),
      [game.awayTeamId]: teamStateForFinalization(awayTeam),
    },
  });
  return {
    ...result,
    game: rosterSimulation
    ? {
      ...result.game,
      boxScore: rosterSimulation.boxScore,
      quarters: rosterSimulation.quarters,
      story: rosterSimulation.story,
    }
    : result.game,
  };
}

function simulateScheduledGame(args) {
  return simulateScheduledGameResult(args).game;
}

function finalScoreGameResult({
  game,
  uid,
  nowMs,
  homeScore,
  awayScore,
  skipParticipantCheck = false,
  homeTeam,
  awayTeam,
}) {
  if (!game || !['scheduled', 'preparing', 'simulating'].includes(game.status)) {
    throw new MatchupError('failed-precondition', 'This game cannot be finalized.');
  }
  if (!skipParticipantCheck) assertParticipant(game, uid);
  const normalizedHomeScore = Number(homeScore);
  const normalizedAwayScore = Number(awayScore);
  if (
    !Number.isInteger(normalizedHomeScore)
    || !Number.isInteger(normalizedAwayScore)
    || normalizedHomeScore < 0
    || normalizedAwayScore < 0
    || normalizedHomeScore === normalizedAwayScore
  ) {
    throw new MatchupError('invalid-argument', 'Enter valid non-tied final scores.');
  }
  return finalizeGame({
    game,
    uid,
    nowMs,
    homeScore: normalizedHomeScore,
    awayScore: normalizedAwayScore,
    source: 'manual',
    teamStates: {
      [game.homeTeamId]: teamStateForFinalization(homeTeam),
      [game.awayTeamId]: teamStateForFinalization(awayTeam),
    },
  });
}

function finalScoreGame(args) {
  return finalScoreGameResult(args).game;
}

function resetScheduledGame({ game, uid, nowMs }) {
  if (!game) {
    throw new MatchupError('not-found', 'Game not found.');
  }
  const {
    requestedByUid,
    requestedAtMs,
    responseDeadlineMs,
    acceptedByUid,
    acceptedAtMs,
    preparationDeadlineMs,
    expiredAtMs,
    simulationStartedByUid,
    simulationStartedAtMs,
    homeScore,
    awayScore,
    winnerTeamId,
    loserTeamId,
    finalScoreSubmittedByUid,
    finalAtMs,
    resultSource,
    completionMarkerId,
    fatigue,
    injuries,
    boxScore,
    quarters,
    story,
    ...baseGame
  } = game;
  void requestedByUid;
  void requestedAtMs;
  void responseDeadlineMs;
  void acceptedByUid;
  void acceptedAtMs;
  void preparationDeadlineMs;
  void expiredAtMs;
  void simulationStartedByUid;
  void simulationStartedAtMs;
  void homeScore;
  void awayScore;
  void winnerTeamId;
  void loserTeamId;
  void finalScoreSubmittedByUid;
  void finalAtMs;
  void resultSource;
  void completionMarkerId;
  void fatigue;
  void injuries;
  void boxScore;
  void quarters;
  void story;
  return {
    ...baseGame,
    status: 'scheduled',
    resetByUid: uid,
    resetAtMs: nowMs,
  };
}

function scheduleCompetition(data) {
  return data && data.competition === 'nbaCup' ? 'nbaCup' : 'regular';
}

function gamesForCompetition(schedule, competition) {
  if (competition === 'nbaCup') {
    return schedule && schedule.nbaCup && Array.isArray(schedule.nbaCup.games)
      ? schedule.nbaCup.games
      : [];
  }
  return schedule && Array.isArray(schedule.games) ? schedule.games : [];
}

function updatePayloadForCompetition(competition, games) {
  return competition === 'nbaCup' ? { 'nbaCup.games': games } : { games };
}

function mapError(error, HttpsError) {
  if (error instanceof MatchupError || error instanceof FinalizeGameError) {
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
    return { uid, data, leagueId, gameId, competition: scheduleCompetition(data) };
  };
}

function createGameMutationHandler({ getFirestore, HttpsError, now, mutate }) {
  const base = createMatchupHandler({ getFirestore, HttpsError, now });
  return async (request) => {
    const { uid, leagueId, gameId, competition } = await base(request);
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
      const games = gamesForCompetition(schedule, competition);
      const gameIndex = games.findIndex(game => game.id === gameId);
      if (gameIndex < 0) throw new HttpsError('not-found', 'Game not found.');
      const game = games[gameIndex];
      const [homeTeam, awayTeam] = await Promise.all([
        teamForScheduledGame({ tx, leagueRef, schedule, teamId: game.homeTeamId }),
        teamForScheduledGame({ tx, leagueRef, schedule, teamId: game.awayTeamId }),
      ]);
      let nextGame;
      try {
        nextGame = mutate({ game, uid, nowMs: now() });
      } catch (error) {
        throw mapError(error, HttpsError);
      }
      const nextGames = [...games];
      nextGames[gameIndex] = nextGame;
      tx.update(scheduleRef, updatePayloadForCompetition(competition, nextGames));
      const homePayload = teamResetPayload({ game, side: 'home', team: homeTeam });
      const awayPayload = teamResetPayload({ game, side: 'away', team: awayTeam });
      if (homeTeam && homeTeam.ref && homePayload) tx.update(homeTeam.ref, homePayload);
      if (awayTeam && awayTeam.ref && awayPayload) tx.update(awayTeam.ref, awayPayload);
      return nextGame;
    });
  };
}

function isCommissioner(uid, league) {
  return Boolean(
    uid
    && league
    && (
      league.commissionerId === uid
      || (league.coCommissioners || []).includes(uid)
    )
  );
}

function normalizeScheduleKey(value) {
  return String(value || '').trim().toUpperCase();
}

function scheduleAliases(value) {
  const key = normalizeScheduleKey(value);
  if (!key) return [];
  if (key === 'NOP') return ['NOP', 'NOH', 'NOK'];
  if (key === 'NOH' || key === 'NOK') return ['NOH', 'NOK', 'NOP'];
  if (key === 'BKN') return ['BKN', 'NJN'];
  if (key === 'NJN') return ['NJN', 'BKN'];
  if (key === 'OKC') return ['OKC', 'SEA'];
  if (key === 'SEA') return ['SEA', 'OKC'];
  return [key];
}

function participantForScheduledTeam(schedule, teamId) {
  const wanted = new Set(scheduleAliases(teamId));
  return (schedule.participants || []).find(participant => (
    scheduleAliases(participant.scheduleTeamId).some(key => wanted.has(key))
    || scheduleAliases(participant.abbreviation).some(key => wanted.has(key))
  )) || null;
}

async function teamForScheduledGame({ tx, leagueRef, schedule, teamId }) {
  const participant = participantForScheduledTeam(schedule, teamId);
  const teamDocId = participant && participant.sourceTeamDocId
    ? participant.sourceTeamDocId
    : null;
  if (teamDocId) {
    const teamRef = leagueRef.collection('teams').doc(teamDocId);
    const teamSnap = await tx.get(teamRef);
    if (teamSnap.exists) return { id: teamSnap.id, ref: teamRef, ...(teamSnap.data() || {}) };
  }
  const directRef = leagueRef.collection('teams').doc(String(teamId));
  const directSnap = await tx.get(directRef);
  if (directSnap.exists) return { id: directSnap.id, ref: directRef, ...(directSnap.data() || {}) };
  return participant ? {
    id: participant.sourceTeamDocId || participant.scheduleTeamId || teamId,
    teamId: participant.scheduleTeamId || teamId,
    abbreviation: participant.abbreviation || participant.scheduleTeamId || teamId,
    name: participant.name || participant.abbreviation || teamId,
    players: [],
  } : null;
}

async function coachingSnapshotForTeam({ tx, scheduleRef, game, team }) {
  if (!team || !team.id) return null;
  const prepRef = scheduleRef.collection('preparation').doc(`${game.id}_${team.id}`);
  const prepSnap = await tx.get(prepRef);
  if (prepSnap.exists) {
    const prep = prepSnap.data() || {};
    return safeCoachingSnapshot(prep.presetSnapshot);
  }
  const presets = Array.isArray(team.coachingPresets) ? team.coachingPresets : [];
  const preset = presets.find(item => item && item.id === team.defaultCoachingPresetId) || null;
  return safeCoachingSnapshot(preset);
}

function createAdminGameMutationHandler({ getFirestore, HttpsError, now, mutate }) {
  const base = createMatchupHandler({ getFirestore, HttpsError, now });
  return async (request) => {
    const { uid, leagueId, gameId, competition } = await base(request);
    const db = getFirestore();
    const leagueRef = db.collection('leagues').doc(leagueId);
    return db.runTransaction(async (tx) => {
      const leagueSnap = await tx.get(leagueRef);
      if (!leagueSnap.exists) throw new HttpsError('not-found', 'League not found.');
      const league = leagueSnap.data() || {};
      if (!isCommissioner(uid, league)) {
        throw new HttpsError('permission-denied', 'Only commissioners can reset games.');
      }
      const scheduleId = league.scheduleId || String(league.currentYear || 2025);
      const scheduleRef = leagueRef.collection('schedules').doc(scheduleId);
      const scheduleSnap = await tx.get(scheduleRef);
      if (!scheduleSnap.exists) throw new HttpsError('not-found', 'Schedule not found.');
      const schedule = scheduleSnap.data() || {};
      const games = gamesForCompetition(schedule, competition);
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
      tx.update(scheduleRef, updatePayloadForCompetition(competition, nextGames));
      return nextGame;
    });
  };
}

function createReportGameScoreHandler({ getFirestore, HttpsError, now }) {
  const base = createMatchupHandler({ getFirestore, HttpsError, now });
  return async (request) => {
    const { uid, data, leagueId, gameId, competition } = await base(request);
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
      const games = gamesForCompetition(schedule, competition);
      const gameIndex = games.findIndex(game => game.id === gameId);
      if (gameIndex < 0) throw new HttpsError('not-found', 'Game not found.');
      const game = games[gameIndex];
      const admin = isCommissioner(uid, league);
      if (!admin && !participatingGms(game).includes(uid)) {
        throw new HttpsError('permission-denied', 'Only participating GMs or commissioners can submit this score.');
      }
      const [homeTeam, awayTeam] = await Promise.all([
        teamForScheduledGame({ tx, leagueRef, schedule, teamId: game.homeTeamId }),
        teamForScheduledGame({ tx, leagueRef, schedule, teamId: game.awayTeamId }),
      ]);
      const [homeSnapshot, awaySnapshot] = await Promise.all([
        coachingSnapshotForTeam({ tx, scheduleRef, game, team: homeTeam }),
        coachingSnapshotForTeam({ tx, scheduleRef, game, team: awayTeam }),
      ]);
      let result;
      try {
        result = finalScoreGameResult({
          game: gameWithCoachingSnapshots({ game, homeSnapshot, awaySnapshot }),
          uid,
          nowMs: now(),
          homeScore: data.homeScore,
          awayScore: data.awayScore,
          skipParticipantCheck: admin,
          homeTeam,
          awayTeam,
        });
      } catch (error) {
        throw mapError(error, HttpsError);
      }
      const nextGames = [...games];
      nextGames[gameIndex] = result.game;
      tx.update(scheduleRef, updatePayloadForCompetition(competition, nextGames));
      persistTeamStates({ tx, homeTeam, awayTeam, result });
      return result.game;
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
  const { getFirestore, HttpsError, now } = deps;
  const base = createMatchupHandler({ getFirestore, HttpsError, now });
  return async (request) => {
    const { uid, leagueId, gameId, competition } = await base(request);
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
      const games = gamesForCompetition(schedule, competition);
      const gameIndex = games.findIndex(game => game.id === gameId);
      if (gameIndex < 0) throw new HttpsError('not-found', 'Game not found.');
      const game = games[gameIndex];
      const [homeTeam, awayTeam] = await Promise.all([
        teamForScheduledGame({ tx, leagueRef, schedule, teamId: game.homeTeamId }),
        teamForScheduledGame({ tx, leagueRef, schedule, teamId: game.awayTeamId }),
      ]);
      const [homeSnapshot, awaySnapshot] = await Promise.all([
        coachingSnapshotForTeam({ tx, scheduleRef, game, team: homeTeam }),
        coachingSnapshotForTeam({ tx, scheduleRef, game, team: awayTeam }),
      ]);
      let result;
      try {
        result = simulateScheduledGameResult({
          game: gameWithCoachingSnapshots({ game, homeSnapshot, awaySnapshot }),
          uid,
          nowMs: now(),
          homeTeam,
          awayTeam,
        });
      } catch (error) {
        throw mapError(error, HttpsError);
      }
      const nextGames = [...games];
      nextGames[gameIndex] = result.game;
      tx.update(scheduleRef, updatePayloadForCompetition(competition, nextGames));
      persistTeamStates({ tx, homeTeam, awayTeam, result });
      return result.game;
    });
  };
}

function createExpireMatchupRequestHandler(deps) {
  return createGameMutationHandler({
    ...deps,
    mutate: ({ game, nowMs }) => expireMatchupRequest({ game, nowMs }),
  });
}

function createResetScheduledGameHandler(deps) {
  return createAdminGameMutationHandler({
    ...deps,
    mutate: ({ game, uid, nowMs }) => resetScheduledGame({ game, uid, nowMs }),
  });
}

module.exports = {
  MatchupError,
  REQUEST_WINDOW_MS,
  PREPARATION_WINDOW_MS,
  acceptMatchupRequest,
  createAcceptMatchupHandler,
  createExpireMatchupRequestHandler,
  createReportGameScoreHandler,
  createRequestMatchupHandler,
  createResetScheduledGameHandler,
  createSimulateScheduledGameHandler,
  expireMatchupRequest,
  finalScoreGame,
  finalScoreGameResult,
  gameWithCoachingSnapshots,
  gamesForCompetition,
  requestMatchup,
  resetScheduledGame,
  scheduleCompetition,
  simulateScheduledGame,
  simulateScheduledGameResult,
  teamPersistencePayload,
  teamResetPayload,
  teamStateUpdatePayload,
  updatePayloadForCompetition,
};
