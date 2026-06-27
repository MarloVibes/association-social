'use strict';

const {
  OffseasonTransitionError,
  transitionOffseasonState,
} = require('./offseason');
const {
  buildExpansionTeamDocs,
} = require('./expansion');

const OFFSEASON_STAGES = new Set([
  'awards_recap',
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

const STAGE_LABELS = Object.freeze({
  awards_recap: 'Awards Recap',
  season_end: 'Season End',
  lottery_and_draft_order: 'Lottery & Draft Order',
  player_progression: 'Player Progression',
  team_options: 'Team Options',
  re_signing: 'Re-Signing',
  free_agency: 'Free Agency',
  draft_class_review: 'Draft Class Review',
  live_draft: 'Live Draft',
  expansion: 'Expansion',
  roster_cuts: 'Roster Cuts',
  ready_for_season: 'Ready for Season',
  regular_season: 'Regular Season',
});

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

function usesNbaOffseasonSequence(sport) {
  return sport !== 'mlb' && sport !== 'madden' && sport !== 'nfl';
}

function hasLotteryComplete(offseason) {
  return Boolean(
    offseason
    && (
      offseason.lotteryComplete === true
      || (offseason.draftLottery && offseason.draftLottery.complete === true)
    )
  );
}

function dateMillis(value) {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isOffseasonStageDue(offseason, nowMillis) {
  if (!offseason || !offseason.stageDurationSeconds) return false;
  const deadline = dateMillis(offseason.stageEndsAt);
  return deadline != null && deadline <= nowMillis;
}

function stageLabel(stage) {
  return STAGE_LABELS[stage] || String(stage || 'Offseason');
}

function buildOffseasonStageNotification({
  leagueId,
  leagueName,
  offseason,
  createdAt = new Date().toISOString(),
}) {
  return {
    type: 'offseason_stage',
    leagueId,
    stage: offseason && offseason.stage,
    seasonYear: offseason && offseason.seasonYear,
    version: offseason && offseason.version,
    message: `${leagueName || 'League'} moved to ${stageLabel(offseason && offseason.stage)}.`,
    createdAt,
    read: false,
  };
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

function hasPlayoffChampion(schedule) {
  const rounds = schedule && schedule.playoffs && Array.isArray(schedule.playoffs.rounds)
    ? schedule.playoffs.rounds
    : [];
  return rounds.some(round => (
    round
    && round.name === 'final'
    && Array.isArray(round.series)
    && round.series.some(series => series && String(series.winnerTeamId || '').trim())
  ));
}

function initializeOffseason(league, expectedStage, expectedVersion, warningAcceptedAt = null, stageEndsAt = null) {
  const isNba = usesNbaOffseasonSequence(league && league.sport);
  const openingStage = isNba ? 'awards_recap' : 'season_end';
  if (expectedStage !== openingStage || expectedVersion !== 0) {
    throw new OffseasonTransitionError(
      'aborted',
      'The offseason stage changed before this request completed.',
      { currentStage: null, currentVersion: null },
    );
  }
  const currentYear = league && league.currentYear;
  const draftTimerSeconds = league && league.draftTimerSeconds;
  const state = {
    stage: openingStage,
    seasonYear: typeof currentYear === 'number' && Number.isFinite(currentYear)
      ? currentYear
      : defaultSeasonYear(league && league.sport),
    stageStartedAt: null,
    completedTeamIds: [],
    draftTimerSeconds: typeof draftTimerSeconds === 'number' && Number.isFinite(draftTimerSeconds)
      ? draftTimerSeconds
      : 120,
    draftStatus: 'none',
    ...(isNba ? { stageDurationSeconds: 600 } : {}),
    version: 0,
  };
  if (stageEndsAt != null) state.stageEndsAt = stageEndsAt;
  if (warningAcceptedAt != null) state.warningAcceptedAt = warningAcceptedAt;
  return state;
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
    usesNbaOffseasonSequence(league && league.sport)
    && expectedStage === 'lottery_and_draft_order'
    && !hasLotteryComplete(league.offseason)
  ) {
    throw new OffseasonTransitionError(
      'failed-precondition',
      'Run the draft lottery before advancing.',
    );
  }
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
    usesNbaOffseasonSequence(league && league.sport)
    && expectedStage === 're_signing'
    && draftClassPublished !== true
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

function createAdvanceOffseasonHandler({ getFirestore, serverTimestamp, HttpsError, FieldValue }) {
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
      const result = await db.runTransaction(async (tx) => {
        const [leagueSnap, teamsSnap] = await Promise.all([
          tx.get(leagueRef),
          tx.get(teamsQuery),
        ]);
        if (!leagueSnap.exists) {
          throw new HttpsError('not-found', 'League not found.');
        }

        const storedLeague = leagueSnap.data() || {};
        const isStoredNba = usesNbaOffseasonSequence(storedLeague && storedLeague.sport);
        if (!storedLeague.offseason && isStoredNba) {
          const scheduleId = storedLeague.scheduleId || String(storedLeague.currentYear || defaultSeasonYear(storedLeague.sport));
          const scheduleSnap = await tx.get(leagueRef.collection('schedules').doc(scheduleId));
          if (!scheduleSnap.exists || !hasPlayoffChampion(scheduleSnap.data() || {})) {
            throw new OffseasonTransitionError(
              'failed-precondition',
              'The playoff champion must be crowned before offseason can start.',
            );
          }
          const offseason = initializeOffseason(
            storedLeague,
            input.expectedStage,
            input.expectedVersion,
            serverTimestamp(),
            new Date(Date.now() + 600000),
          );
          tx.update(leagueRef, { offseason });
          return { offseason };
        }
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
        const expansionTeamDocs = input.expectedStage === 'expansion' && league.expansionDraftCompleted !== true
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
        if (
          input.expectedStage === 'draft_class_review'
          || (
            usesNbaOffseasonSequence(league && league.sport)
            && input.expectedStage === 're_signing'
          )
        ) {
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
          stageEndsAt: usesNbaOffseasonSequence(league && league.sport)
            ? new Date(Date.now() + 600000)
            : null,
        });
        expansionTeamDocs.forEach(team => tx.set(teamsQuery.doc(team.id), team.data));
        tx.update(leagueRef, { offseason });
        return { offseason };
      });
      if (FieldValue && result && result.offseason && result.offseason.stage !== 'regular_season') {
        const leagueSnap = await leagueRef.get();
        if (leagueSnap.exists) {
          await notifyOffseasonMembers({
            db,
            leagueId: input.leagueId,
            league: leagueSnap.data() || {},
            offseason: result.offseason,
            FieldValue,
          });
        }
      }
      return result;
    } catch (error) {
      throw toHttpsError(error, HttpsError);
    }
  };
}

function userNotificationRef(db, uid) {
  return db.collection('users').doc(uid);
}

async function notifyOffseasonMembers({ db, leagueId, league, offseason, FieldValue }) {
  const memberIds = Array.isArray(league && league.members) ? league.members.filter(Boolean) : [];
  if (memberIds.length === 0) return 0;
  const notification = buildOffseasonStageNotification({
    leagueId,
    leagueName: league.name,
    offseason,
  });
  const batch = db.batch();
  memberIds.forEach((memberId) => {
    batch.set(userNotificationRef(db, memberId), {
      notifications: FieldValue.arrayUnion({
        ...notification,
        id: `offseason-stage:${leagueId}:${offseason.version}:${memberId}`,
      }),
    }, { merge: true });
  });
  await batch.commit();
  return memberIds.length;
}

function createAdvanceDueOffseasonsHandler({
  getFirestore,
  serverTimestamp,
  now,
  FieldValue,
}) {
  return async function advanceDueOffseasons() {
    const db = getFirestore();
    const nowMillis = now();
    const dueSnap = await db.collection('leagues')
      .where('offseason.stageEndsAt', '<=', new Date(nowMillis))
      .limit(25)
      .get();
    let advanced = 0;
    let skipped = 0;
    let notified = 0;
    for (const leagueDoc of dueSnap.docs) {
      let transitionResult = null;
      try {
        transitionResult = await db.runTransaction(async (tx) => {
          const leagueRef = leagueDoc.ref;
          const [leagueSnap, teamsSnap] = await Promise.all([
            tx.get(leagueRef),
            tx.get(leagueRef.collection('teams')),
          ]);
          if (!leagueSnap.exists) return { advanced: false, reason: 'missing' };
          const league = leagueSnap.data() || {};
          if (
            league.paused === true
            || league.archived === true
            || league.status === 'archived'
            || !league.offseason
            || !isOffseasonStageDue(league.offseason, nowMillis)
            || league.offseason.stage === 'regular_season'
            || league.offseason.stage === 'ready_for_season'
          ) {
            return { advanced: false, reason: 'not_due' };
          }
          const teams = teamsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
          let draftClassPublished;
          let liveDraftComplete;
          let pendingContractOfferCount;
          const expectedStage = league.offseason.stage;
          const expectedVersion = league.offseason.version;
          if (expectedStage === 're_signing' || expectedStage === 'free_agency') {
            const offersSnap = await tx.get(leagueRef.collection('contract_offers'));
            pendingContractOfferCount = offersSnap.docs
              .map(doc => doc.data() || {})
              .filter(offer => (
                offer.status === 'pending'
                && offer.stage === expectedStage
                && offer.version === expectedVersion
              )).length;
          }
          if (
            expectedStage === 'draft_class_review'
            || (
              usesNbaOffseasonSequence(league && league.sport)
              && expectedStage === 're_signing'
            )
          ) {
            const draftClassSnap = await tx.get(leagueRef
              .collection('draft_classes')
              .doc(String(league.offseason.seasonYear)));
            draftClassPublished = draftClassSnap.exists
              && (draftClassSnap.data() || {}).published === true;
          }
          if (expectedStage === 'live_draft') {
            const sessionSnap = await tx.get(leagueRef
              .collection('draft_sessions')
              .doc(String(league.offseason.seasonYear)));
            liveDraftComplete = sessionSnap.exists
              && (sessionSnap.data() || {}).status === 'complete';
          }
          const offseason = transitionForCallable({
            uid: league.commissionerId,
            league,
            teams,
            expectedStage,
            expectedVersion,
            draftClassPublished,
            liveDraftComplete,
            pendingContractOfferCount,
            stageStartedAt: serverTimestamp(),
            stageEndsAt: usesNbaOffseasonSequence(league && league.sport)
              ? new Date(nowMillis + 600000)
              : null,
          });
          tx.update(leagueRef, { offseason });
          return { advanced: true, leagueId: leagueDoc.id, league, offseason };
        });
      } catch (error) {
        skipped += 1;
        console.warn('Skipped due offseason advance', leagueDoc.id, error && error.message);
        continue;
      }
      if (transitionResult && transitionResult.advanced) {
        advanced += 1;
        notified += await notifyOffseasonMembers({
          db,
          leagueId: transitionResult.leagueId,
          league: transitionResult.league,
          offseason: transitionResult.offseason,
          FieldValue,
        });
      } else {
        skipped += 1;
      }
    }
    return { advanced, skipped, notified };
  };
}

module.exports = {
  OFFSEASON_STAGES,
  OffseasonCallableError,
  TEAM_ACTION_STAGES,
  buildOffseasonStageNotification,
  createAdvanceOffseasonHandler,
  createAdvanceDueOffseasonsHandler,
  initializeOffseason,
  isOffseasonStageDue,
  hasPlayoffChampion,
  hasLotteryComplete,
  toHttpsError,
  transitionForCallable,
  validateExpansionProposalForCallable,
  validateAdvanceInput,
};
