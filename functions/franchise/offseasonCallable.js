'use strict';

const {
  OffseasonTransitionError,
  transitionOffseasonState,
} = require('./offseason');

const OFFSEASON_STAGES = new Set([
  'season_end',
  'lottery_and_draft_order',
  'player_progression',
  'team_options',
  're_signing',
  'free_agency',
  'draft_class_review',
  'live_draft',
  'expansion',
  'roster_cuts',
  'ready_for_season',
  'regular_season',
]);

const TEAM_ACTION_STAGES = new Set([
  'team_options',
  're_signing',
  'free_agency',
  'roster_cuts',
  'ready_for_season',
]);

class OffseasonCallableError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'OffseasonCallableError';
    this.code = code;
    this.details = details;
  }
}

function validateAdvanceInput(data) {
  const input = data && typeof data === 'object' ? data : {};
  const leagueId = typeof input.leagueId === 'string' ? input.leagueId.trim() : '';
  const expectedStage = typeof input.expectedStage === 'string'
    ? input.expectedStage.trim()
    : '';
  const expectedVersion = input.expectedVersion;
  if (
    !leagueId
    || !expectedStage
    || !OFFSEASON_STAGES.has(expectedStage)
    || typeof expectedVersion !== 'number'
    || !Number.isInteger(expectedVersion)
    || expectedVersion < 0
  ) {
    throw new OffseasonCallableError(
      'invalid-argument',
      'Provide leagueId, expectedStage, and a non-negative integer expectedVersion.',
    );
  }
  return { leagueId, expectedStage, expectedVersion };
}

function defaultSeasonYear(sport) {
  return sport === 'mlb' ? 2026 : 2025;
}

function initializeOffseason(league, expectedStage, expectedVersion) {
  if (expectedStage !== 'season_end' || expectedVersion !== 0) {
    throw new OffseasonTransitionError(
      'aborted',
      'The offseason stage changed before this request completed.',
      { currentStage: null, currentVersion: null },
    );
  }
  const currentYear = league && league.currentYear;
  const draftTimerSeconds = league && league.draftTimerSeconds;
  return {
    stage: 'season_end',
    seasonYear: typeof currentYear === 'number' && Number.isFinite(currentYear)
      ? currentYear
      : defaultSeasonYear(league && league.sport),
    stageStartedAt: null,
    completedTeamIds: [],
    draftTimerSeconds: typeof draftTimerSeconds === 'number' && Number.isFinite(draftTimerSeconds)
      ? draftTimerSeconds
      : 120,
    draftStatus: 'none',
    version: 0,
  };
}

function transitionForCallable(input) {
  const { league, teams, expectedStage } = input;
  if (TEAM_ACTION_STAGES.has(expectedStage)) {
    return transitionOffseasonState(input);
  }
  const completedTeamIds = (Array.isArray(teams) ? teams : [])
    .filter((team) => team && team.gmId != null && String(team.gmId).trim() !== '')
    .map((team) => String(team.id));
  return transitionOffseasonState({
    ...input,
    league: {
      ...league,
      offseason: {
        ...league.offseason,
        completedTeamIds,
      },
    },
  });
}

function toHttpsError(error, HttpsError) {
  if (error instanceof OffseasonTransitionError || error instanceof OffseasonCallableError) {
    return new HttpsError(error.code, error.message, error.details);
  }
  return error;
}

function createAdvanceOffseasonHandler({ getFirestore, serverTimestamp, HttpsError }) {
  return async function advanceOffseasonStage(request) {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');

    let input;
    try {
      input = validateAdvanceInput(request.data);
    } catch (error) {
      throw toHttpsError(error, HttpsError);
    }

    const db = getFirestore();
    const leagueRef = db.collection('leagues').doc(input.leagueId);
    const teamsQuery = leagueRef.collection('teams');

    try {
      return await db.runTransaction(async (tx) => {
        const [leagueSnap, teamsSnap] = await Promise.all([
          tx.get(leagueRef),
          tx.get(teamsQuery),
        ]);
        if (!leagueSnap.exists) {
          throw new HttpsError('not-found', 'League not found.');
        }

        const storedLeague = leagueSnap.data() || {};
        const league = storedLeague.offseason
          ? storedLeague
          : {
            ...storedLeague,
            offseason: initializeOffseason(
              storedLeague,
              input.expectedStage,
              input.expectedVersion,
            ),
          };
        const teams = teamsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
        const offseason = transitionForCallable({
          uid,
          league,
          teams,
          expectedStage: input.expectedStage,
          expectedVersion: input.expectedVersion,
          stageStartedAt: serverTimestamp(),
        });
        tx.update(leagueRef, { offseason });
        return { offseason };
      });
    } catch (error) {
      throw toHttpsError(error, HttpsError);
    }
  };
}

module.exports = {
  OFFSEASON_STAGES,
  OffseasonCallableError,
  TEAM_ACTION_STAGES,
  createAdvanceOffseasonHandler,
  initializeOffseason,
  toHttpsError,
  transitionForCallable,
  validateAdvanceInput,
};
