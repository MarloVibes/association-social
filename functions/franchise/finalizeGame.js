'use strict';

class FinalizeGameError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'FinalizeGameError';
    this.code = code;
    this.details = details;
  }
}

const MAX_MINOR_EVENTS = 6;
const MAX_SEVERE_EVENTS = 2;

function hash(value) {
  let h = 2166136261;
  for (let i = 0; i < String(value).length; i += 1) {
    h ^= String(value).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededInt(seed, min, max) {
  return min + (hash(seed) % (max - min + 1));
}

function pickSeverity(seed) {
  const roll = hash(seed) % 100;
  if (roll < 1) return 'severe';
  if (roll < 9) return 'minor';
  return null;
}

function generateInjuryEvent({ minorCount, severeCount, seed, force }) {
  const severity = force || pickSeverity(seed);
  if (!severity) return null;
  if (severity === 'minor') {
    if (minorCount >= MAX_MINOR_EVENTS) return null;
    return {
      severity,
      gamesRemaining: seededInt(`${seed}:minor`, 1, 2),
      label: 'Minor injury',
      recoveryTag: 'day-to-day',
    };
  }
  if (severeCount >= MAX_SEVERE_EVENTS) return null;
  return {
    severity,
    gamesRemaining: seededInt(`${seed}:severe`, 6, 15),
    label: 'Severe injury',
    recoveryTag: 'out',
  };
}

function updateTeamFatigue({ current, minutesPlayed, recoveryDays }) {
  const next = Number(current || 0) + (Number(minutesPlayed || 0) / 60) - (Number(recoveryDays || 0) * 3);
  return Math.max(0, Math.min(20, Math.round(next * 10) / 10));
}

function normalizedInjury(injury) {
  const gamesRemaining = Number(injury && injury.gamesRemaining);
  if (!Number.isInteger(gamesRemaining) || gamesRemaining < 0 || gamesRemaining > 82) {
    throw new FinalizeGameError('invalid-argument', 'Enter a valid games remaining value.');
  }
  if (!injury || (injury.severity !== 'minor' && injury.severity !== 'severe')) {
    throw new FinalizeGameError('invalid-argument', 'Choose a valid injury severity.');
  }
  return {
    ...injury,
    id: String(injury.id || `${injury.playerId || 'manual'}-${Date.now()}`),
    label: String(injury.label || (injury.severity === 'minor' ? 'Minor injury' : 'Severe injury')),
    recoveryTag: String(injury.recoveryTag || (injury.severity === 'minor' ? 'day-to-day' : 'out')),
    gamesRemaining,
  };
}

function applyInjuryAction({ injuries, action }) {
  const current = Array.isArray(injuries) ? injuries : [];
  if (!action || !action.type) throw new FinalizeGameError('invalid-argument', 'Choose an injury action.');
  if (action.type === 'add') {
    const next = normalizedInjury(action.injury || {});
    return [...current.filter(injury => injury.id !== next.id), next];
  }
  if (action.type === 'remove') {
    return current.filter(injury => injury.id !== action.injuryId);
  }
  if (action.type === 'update') {
    return current.map((injury) => {
      if (injury.id !== action.injuryId) return injury;
      return normalizedInjury({ ...injury, ...(action.patch || {}) });
    });
  }
  throw new FinalizeGameError('invalid-argument', 'Choose an injury action.');
}

function normalizeScore(value, label) {
  const score = Number(value);
  if (!Number.isInteger(score) || score < 0) {
    throw new FinalizeGameError('invalid-argument', `Enter a valid ${label} score.`);
  }
  return score;
}

function defaultTeamState(state) {
  return {
    fatigue: Number(state && state.fatigue) || 0,
    fatigueSequence: Number(state && state.fatigueSequence) || 0,
    minorInjuryCount: Number(state && state.minorInjuryCount) || 0,
    severeInjuryCount: Number(state && state.severeInjuryCount) || 0,
    injuries: Array.isArray(state && state.injuries) ? state.injuries : [],
  };
}

function finalizeTeamState({ game, teamId, side, state, nowMs }) {
  const previous = defaultTeamState(state);
  const sequence = previous.fatigueSequence + 1;
  const fatigue = updateTeamFatigue({
    current: previous.fatigue,
    minutesPlayed: 240,
    recoveryDays: 0,
  });
  const event = generateInjuryEvent({
    minorCount: previous.minorInjuryCount,
    severeCount: previous.severeInjuryCount,
    seed: `${game.id}:${teamId}:${sequence}:injury`,
  });
  const injuries = event
    ? [{
      ...event,
      id: `${game.id}_${teamId}_${sequence}`,
      teamId,
      gameId: game.id,
      createdAtMs: nowMs,
    }]
    : [];

  return {
    nextState: {
      ...previous,
      fatigue,
      fatigueSequence: sequence,
      minorInjuryCount: previous.minorInjuryCount + injuries.filter(injury => injury.severity === 'minor').length,
      severeInjuryCount: previous.severeInjuryCount + injuries.filter(injury => injury.severity === 'severe').length,
      injuries: [...previous.injuries, ...injuries],
    },
    gameFatigue: {
      teamId,
      side,
      before: previous.fatigue,
      after: fatigue,
      sequence,
    },
    injuries,
  };
}

function finalizeGame({
  game,
  uid,
  nowMs,
  homeScore,
  awayScore,
  source = 'manual',
  teamStates = {},
}) {
  if (!game) {
    throw new FinalizeGameError('not-found', 'Game not found.');
  }
  if (game.status === 'final' || game.completionMarkerId || game.finalAtMs) {
    throw new FinalizeGameError('already-exists', 'This game has already been finalized.');
  }
  const normalizedHomeScore = normalizeScore(homeScore, 'home');
  const normalizedAwayScore = normalizeScore(awayScore, 'away');
  if (normalizedHomeScore === normalizedAwayScore) {
    throw new FinalizeGameError('invalid-argument', 'Enter valid non-tied final scores.');
  }

  const homeTeamId = game.homeTeamId;
  const awayTeamId = game.awayTeamId;
  const completionMarkerId = `${game.id}:final`;
  const home = finalizeTeamState({
    game,
    teamId: homeTeamId,
    side: 'home',
    state: teamStates[homeTeamId],
    nowMs,
  });
  const away = finalizeTeamState({
    game,
    teamId: awayTeamId,
    side: 'away',
    state: teamStates[awayTeamId],
    nowMs,
  });
  const homeWon = normalizedHomeScore > normalizedAwayScore;
  const sourceFields = source === 'simulation'
    ? { simulationStartedByUid: uid, simulationStartedAtMs: nowMs }
    : { finalScoreSubmittedByUid: uid };

  return {
    completionMarkerId,
    game: {
      ...game,
      ...sourceFields,
      status: 'final',
      homeScore: normalizedHomeScore,
      awayScore: normalizedAwayScore,
      winnerTeamId: homeWon ? homeTeamId : awayTeamId,
      loserTeamId: homeWon ? awayTeamId : homeTeamId,
      resultSource: source,
      completionMarkerId,
      finalAtMs: nowMs,
      fatigue: {
        home: home.gameFatigue,
        away: away.gameFatigue,
      },
      injuries: {
        home: home.injuries,
        away: away.injuries,
      },
    },
    teamStates: {
      [homeTeamId]: home.nextState,
      [awayTeamId]: away.nextState,
    },
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

function teamKeyMatches(team, docId, teamId) {
  return [docId, team && team.id, team && team.teamId, team && team.abbreviation]
    .map(value => String(value || '').trim())
    .includes(String(teamId || '').trim());
}

function createManageTeamInjuryHandler({ getFirestore, HttpsError }) {
  return async (request) => {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
    const data = request.data || {};
    const leagueId = String(data.leagueId || '').trim();
    const teamId = String(data.teamId || '').trim();
    const action = data.action || null;
    if (!leagueId || !teamId || !action) {
      throw new HttpsError('invalid-argument', 'Provide leagueId, teamId, and action.');
    }

    const db = getFirestore();
    const leagueRef = db.collection('leagues').doc(leagueId);
    return db.runTransaction(async (tx) => {
      const [leagueSnap, teamsSnap] = await Promise.all([
        tx.get(leagueRef),
        tx.get(leagueRef.collection('teams')),
      ]);
      if (!leagueSnap.exists) throw new HttpsError('not-found', 'League not found.');
      const league = leagueSnap.data() || {};
      if (!isCommissioner(uid, league)) {
        throw new HttpsError('permission-denied', 'Only commissioners can manage injuries.');
      }
      const teamDoc = teamsSnap.docs.find((doc) => teamKeyMatches(doc.data() || {}, doc.id, teamId));
      if (!teamDoc) throw new HttpsError('not-found', 'Team not found.');
      let injuries;
      try {
        injuries = applyInjuryAction({
          injuries: (teamDoc.data() || {}).injuries || [],
          action,
        });
      } catch (error) {
        if (error instanceof FinalizeGameError) {
          throw new HttpsError(error.code, error.message, error.details);
        }
        throw error;
      }
      tx.update(teamDoc.ref, {
        injuries,
        injuriesUpdatedAt: new Date().toISOString(),
        injuriesUpdatedByUid: uid,
      });
      return { teamId: teamDoc.id, injuries };
    });
  };
}

module.exports = {
  FinalizeGameError,
  applyInjuryAction,
  createManageTeamInjuryHandler,
  finalizeGame,
  generateInjuryEvent,
  updateTeamFatigue,
};
