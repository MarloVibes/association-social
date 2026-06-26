'use strict';

const {
  OffseasonTransitionError,
  transitionOffseasonState,
} = require('./offseason');
const {
  buildExpansionTeamDocs,
} = require('./expansion');

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

function normalizeAbbr(value) {
  return String(value || '').trim().toUpperCase();
}

function validateExpansionProposalForCallable({ league, teams }) {
  const proposal = league && league.expansionProposal;
  const proposedTeams = Array.isArray(proposal && proposal.teams) ? proposal.teams : [];
  const errors = [];
  const currentTeams = Array.isArray(teams) ? teams.length : 0;
  if (league && league.scheduleLocked) errors.push('schedule_locked');
  if (proposedTeams.length < 1) errors.push('added_team_count_invalid');
  if (currentTeams + proposedTeams.length > 36) errors.push('team_cap_exceeded');
  const existing = new Set((teams || []).map(team => normalizeAbbr(team.abbreviation || team.teamId || team.id)));
  const seen = new Set();
  proposedTeams.forEach((team) => {
    const abbr = normalizeAbbr(team && team.abbreviation);
    if (!String(team && team.city || '').trim()) errors.push('city_missing');
    if (!String(team && team.name || '').trim()) errors.push('name_missing');
    if (!/^[A-Z]{3}$/.test(abbr)) errors.push('abbreviation_invalid');
    if (existing.has(abbr) || seen.has(abbr)) errors.push('abbreviation_taken');
    seen.add(abbr);
  });
  return { valid: errors.length === 0, errors };
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
  const {
    league,
    teams,
    expectedStage,
    draftClassPublished,
    liveDraftComplete,
    pendingContractOfferCount,
  } = input;
  if (
    (expectedStage === 're_signing' || expectedStage === 'free_agency')
    && (
      !league.offseason
      || league.offseason.contractRoundsComplete !== true
      || pendingContractOfferCount !== 0
    )
  ) {
    throw new OffseasonTransitionError(
      'failed-precondition',
      'Resolve every contract offer round before advancing.',
    );
  }
  if (
    expectedStage === 'draft_class_review'
    && (
      !league.offseason
      || league.offseason.draftStatus !== 'published'
      || draftClassPublished !== true
    )
  ) {
    throw new OffseasonTransitionError(
      'failed-precondition',
      'Publish the draft class before starting the live draft.',
    );
  }
  if (
    expectedStage === 'live_draft'
    && (
      !league.offseason
      || league.offseason.draftStatus !== 'complete'
      || liveDraftComplete !== true
    )
  ) {
    throw new OffseasonTransitionError(
      'failed-precondition',
      'Complete every draft pick before advancing to roster cuts.',
    );
  }
  if (expectedStage === 'expansion') {
    const validation = validateExpansionProposalForCallable({ league, teams });
    if (!validation.valid) {
      throw new OffseasonTransitionError(
        'failed-precondition',
        'Fix the expansion proposal before advancing.',
        { errors: validation.errors },
      );
    }
  }
  if (expectedStage === 'ready_for_season') {
    throw new OffseasonTransitionError(
      'failed-precondition',
      'Use the sport-aware next-season action to finish the offseason.',
    );
  }
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
        const expansionTeamDocs = input.expectedStage === 'expansion'
          ? buildExpansionTeamDocs({
            proposal: league.expansionProposal,
            existingTeams: teams,
            seasonYear: league.offseason.seasonYear,
          })
          : [];
        let draftClassPublished;
        let liveDraftComplete;
        let pendingContractOfferCount;
        if (input.expectedStage === 're_signing' || input.expectedStage === 'free_agency') {
          const offersSnap = await tx.get(leagueRef.collection('contract_offers'));
          pendingContractOfferCount = offersSnap.docs
            .map(doc => doc.data() || {})
            .filter(offer => (
              offer.status === 'pending'
              && offer.stage === input.expectedStage
              && offer.version === input.expectedVersion
            )).length;
        }
        if (input.expectedStage === 'draft_class_review') {
          const draftClassRef = leagueRef
            .collection('draft_classes')
            .doc(String(league.offseason.seasonYear));
          const draftClassSnap = await tx.get(draftClassRef);
          draftClassPublished = draftClassSnap.exists
            && (draftClassSnap.data() || {}).published === true;
        }
        if (input.expectedStage === 'live_draft') {
          const sessionRef = leagueRef
            .collection('draft_sessions')
            .doc(String(league.offseason.seasonYear));
          const sessionSnap = await tx.get(sessionRef);
          liveDraftComplete = sessionSnap.exists
            && (sessionSnap.data() || {}).status === 'complete';
        }
        const offseason = transitionForCallable({
          uid,
          league,
          teams,
          expectedStage: input.expectedStage,
          expectedVersion: input.expectedVersion,
          draftClassPublished,
          liveDraftComplete,
          pendingContractOfferCount,
          stageStartedAt: serverTimestamp(),
        });
        expansionTeamDocs.forEach(team => tx.set(teamsQuery.doc(team.id), team.data));
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
  validateExpansionProposalForCallable,
  validateAdvanceInput,
};
