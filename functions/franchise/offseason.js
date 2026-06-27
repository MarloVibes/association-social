'use strict';

const NBA_STAGES = Object.freeze([
  'awards_recap',
  'lottery_and_draft_order',
  'player_progression',
  'team_options',
  're_signing',
  'live_draft',
  'expansion',
  'free_agency',
  'ready_for_season',
  'regular_season',
]);

const MLB_NFL_STAGES = Object.freeze([
  'season_end',
  're_signing',
  'free_agency',
  'draft_class_review',
  'live_draft',
  'roster_cuts',
  'ready_for_season',
  'regular_season',
]);

const DRAFT_STATUSES = new Set(['none', 'review', 'published', 'live', 'complete']);

class OffseasonTransitionError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'OffseasonTransitionError';
    this.code = code;
    this.details = details;
  }
}

function usesMlbNflSequence(sport) {
  return sport === 'mlb' || sport === 'madden' || sport === 'nfl';
}

function getOffseasonStageSequence(sport, expansionEnabled = false) {
  if (usesMlbNflSequence(sport)) return [...MLB_NFL_STAGES];
  return expansionEnabled
    ? [...NBA_STAGES]
    : NBA_STAGES.filter((stage) => stage !== 'expansion');
}

function nextOffseasonStage(sport, currentStage, expansionEnabled = false) {
  if (currentStage === 'regular_season') return 'regular_season';
  if (currentStage === 'expansion' && !expansionEnabled) return 'free_agency';
  const stages = getOffseasonStageSequence(sport, expansionEnabled);
  const currentIndex = stages.indexOf(currentStage);
  return stages[currentIndex + 1] || currentStage;
}

function authorizeOffseasonAdvance(uid, league) {
  if (!uid || !league) return false;
  const inactive = league.paused === true
    || league.archived === true
    || league.status === 'archived';
  if (inactive) return false;
  return league.commissionerId === uid
    || (Array.isArray(league.coCommissioners) && league.coCommissioners.includes(uid));
}

function unresolvedClaimedTeamIds(teams, completedTeamIds) {
  const completed = new Set(Array.isArray(completedTeamIds) ? completedTeamIds.map(String) : []);
  return (Array.isArray(teams) ? teams : [])
    .filter((team) => team && team.gmId != null && String(team.gmId).trim() !== '')
    .map((team) => String(team.id))
    .filter((teamId) => teamId && !completed.has(teamId));
}

function expansionEnabledForLeague(league) {
  if (league.expansionEnabled === true) return true;
  const proposal = league.expansionProposal;
  return Boolean(proposal && proposal.enabled !== false);
}

function nextDraftStatus(currentState, nextStage) {
  if (nextStage === 'draft_class_review') return 'review';
  if (nextStage === 'live_draft') return 'live';
  if (
    currentState.stage === 'live_draft'
    || nextStage === 'free_agency'
    || nextStage === 'ready_for_season'
    || nextStage === 'regular_season'
  ) {
    return 'complete';
  }
  return DRAFT_STATUSES.has(currentState.draftStatus) ? currentState.draftStatus : 'none';
}

function transitionOffseasonState({
  uid,
  league,
  teams,
  expectedStage,
  expectedVersion,
  stageStartedAt,
  stageEndsAt,
}) {
  if (!authorizeOffseasonAdvance(uid, league)) {
    throw new OffseasonTransitionError(
      'permission-denied',
      'Only an active commissioner can advance the offseason.',
    );
  }

  const current = league.offseason;
  if (!current || current.stage !== expectedStage || current.version !== expectedVersion) {
    throw new OffseasonTransitionError(
      'aborted',
      'The offseason stage changed before this request completed.',
      {
        currentStage: current ? current.stage : null,
        currentVersion: current ? current.version : null,
      },
    );
  }

  const unresolvedTeamIds = unresolvedClaimedTeamIds(teams, current.completedTeamIds);
  if (unresolvedTeamIds.length > 0) {
    throw new OffseasonTransitionError(
      'failed-precondition',
      'Claimed teams still have unresolved offseason actions.',
      { unresolvedTeamIds },
    );
  }

  const nextStage = nextOffseasonStage(
    league.sport,
    current.stage,
    expansionEnabledForLeague(league),
  );
  const nextState = {
    ...current,
    stage: nextStage,
    stageStartedAt,
    stageEndsAt,
    completedTeamIds: [],
    draftStatus: nextDraftStatus(current, nextStage),
    version: current.version + 1,
  };
  if (nextStage === 're_signing' || nextStage === 'free_agency') {
    nextState.contractRoundsComplete = false;
  }
  return nextState;
}

module.exports = {
  OffseasonTransitionError,
  authorizeOffseasonAdvance,
  expansionEnabledForLeague,
  getOffseasonStageSequence,
  nextDraftStatus,
  nextOffseasonStage,
  transitionOffseasonState,
  unresolvedClaimedTeamIds,
};
