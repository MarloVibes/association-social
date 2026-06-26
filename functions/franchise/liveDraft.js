'use strict';

class LiveDraftError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'LiveDraftError';
    this.code = code;
    this.details = details;
  }
}

const NFL_TEAM_IDS = [
  'BUF', 'MIA', 'NE', 'NYJ', 'BAL', 'CIN', 'CLE', 'PIT',
  'HOU', 'IND', 'JAX', 'TEN', 'DEN', 'KC', 'LV', 'LAC',
  'DAL', 'NYG', 'PHI', 'WAS', 'CHI', 'DET', 'GB', 'MIN',
  'ATL', 'CAR', 'NO', 'TB', 'ARI', 'LAR', 'SF', 'SEA',
];
const MLB_TEAM_IDS = [
  'BAL', 'BOS', 'NYY', 'TB', 'TOR', 'CWS', 'CLE', 'DET', 'KC', 'MIN',
  'HOU', 'LAA', 'ATH', 'SEA', 'TEX', 'ATL', 'MIA', 'NYM', 'PHI', 'WSH',
  'CHC', 'CIN', 'MIL', 'PIT', 'STL', 'ARI', 'COL', 'LAD', 'SD', 'SF',
];
const NBA_TEAM_IDS = [
  'ATL', 'BOS', 'BKN', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GSW',
  'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NOP', 'NYK',
  'OKC', 'ORL', 'PHI', 'PHX', 'POR', 'SAC', 'SAS', 'TOR', 'UTA', 'WAS',
];

function prospectId(prospect) {
  return String(prospect && (prospect.id || prospect.player_id) || '');
}

function teamIdentity(team) {
  return String(
    team && (team.teamId || team.abbreviation || team.abbr || String(team.id || '').replace(/^cpu_/, ''))
    || '',
  ).toUpperCase();
}

function buildDraftFranchises(sportInput, liveTeams, poolPlayers = []) {
  const sport = sportInput === 'nfl' ? 'madden' : sportInput;
  const canonicalIds = sport === 'nba'
    ? NBA_TEAM_IDS
    : sport === 'madden'
    ? NFL_TEAM_IDS
    : sport === 'mlb' ? MLB_TEAM_IDS : [];
  if (canonicalIds.length === 0) {
    throw new LiveDraftError('failed-precondition', 'Live draft franchises are unavailable for this sport.');
  }
  const byIdentity = new Map();
  for (const team of liveTeams || []) {
    const identity = teamIdentity(team);
    if (!canonicalIds.includes(identity)) continue;
    const existing = byIdentity.get(identity);
    if (!existing || (!existing.gmId && team.gmId)) byIdentity.set(identity, team);
  }
  const franchises = canonicalIds.map(identity => {
    const existing = byIdentity.get(identity);
    return existing
      ? { ...existing, teamId: identity, abbreviation: existing.abbreviation || identity, virtual: false }
      : {
        id: `cpu_${identity}`,
        teamId: identity,
        abbreviation: identity,
        name: identity,
        gmId: null,
        players: poolPlayers.filter(player => String(player.team || '').toUpperCase() === identity),
        needs: [],
        virtual: true,
      };
  });
  if (sport !== 'nba') return franchises;
  const seen = new Set(canonicalIds);
  for (const team of liveTeams || []) {
    const identity = teamIdentity(team);
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    franchises.push({
      ...team,
      teamId: identity,
      abbreviation: team.abbreviation || identity,
      players: Array.isArray(team.players) && team.players.length > 0
        ? team.players
        : poolPlayers.filter(player => String(player.team || '').toUpperCase() === identity),
      needs: team.needs || [],
      virtual: false,
    });
  }
  return franchises;
}

function buildDraftOrder(teams, preferredOrder) {
  const ids = new Set((teams || []).map(team => String(team.id)).filter(Boolean));
  const preferredIds = (preferredOrder || []).map(value => {
    const normalized = String(value);
    const matchingTeam = (teams || []).find(team => (
      String(team.id) === normalized || teamIdentity(team) === normalized.toUpperCase()
    ));
    return matchingTeam ? String(matchingTeam.id) : normalized;
  });
  const order = [];
  for (const id of preferredIds) {
    const normalized = String(id);
    if (ids.has(normalized) && !order.includes(normalized)) order.push(normalized);
  }
  for (const id of (teams || []).map(team => String(team.id)).filter(Boolean)) {
    if (!order.includes(id)) order.push(id);
  }
  return order;
}

function draftRoundsForSport(sportInput) {
  const sport = sportInput === 'nfl' ? 'madden' : sportInput;
  if (sport === 'nba') return 2;
  if (sport === 'madden') return 7;
  return 5;
}

function normalizeSport(sportInput) {
  if (sportInput === 'nfl' || sportInput === 'madden') return 'madden';
  if (sportInput === 'mlb') return 'mlb';
  return 'nba';
}

function roundMoney(value) {
  return Math.round(value / 1_000) * 1_000;
}

function rookieContractForPick({ sport: sportInput, round, overall, league = {} }) {
  const sport = normalizeSport(sportInput);
  const draftRound = Number.isInteger(round) && round > 0 ? round : 1;
  const overallPick = Number.isInteger(overall) && overall > 0 ? overall : 1;
  if (sport === 'madden') {
    const roundSalary = [5_000_000, 2_800_000, 1_600_000, 1_100_000, 950_000, 850_000, 800_000];
    return {
      rookie: true,
      contractType: 'rookie',
      contractYears: 4,
      salary: roundSalary[Math.max(0, Math.min(roundSalary.length - 1, draftRound - 1))],
    };
  }
  if (sport === 'mlb') {
    return {
      rookie: true,
      contractType: 'pre_arbitration',
      contractYears: 3,
      salary: Number.isFinite(league.minimumSalary) ? league.minimumSalary : 760_000,
    };
  }

  const minimumSalary = Number.isFinite(league.minimumSalary) ? league.minimumSalary : 1_200_000;
  if (draftRound >= 2) {
    return {
      rookie: true,
      contractType: 'minimum_rookie',
      contractYears: 2,
      salary: minimumSalary,
    };
  }
  const capBasedBase = Number.isFinite(league.salaryCap) ? league.salaryCap * 0.05 : 8_000_000;
  const rookieScaleBase = Number.isFinite(league.rookieScaleBase) ? league.rookieScaleBase : capBasedBase;
  const scaleFactor = Math.max(0.35, 1 - Math.max(0, overallPick - 1) * 0.02);
  return {
    rookie: true,
    contractType: 'rookie_scale',
    contractYears: 4,
    salary: Math.max(minimumSalary, roundMoney(rookieScaleBase * scaleFactor)),
  };
}

function buildDraftedPlayer({ prospect, session, league = {} }) {
  return {
    ...prospect,
    ...rookieContractForPick({
      sport: session && (session.sport || league.sport),
      round: session && session.round,
      overall: session && session.currentOverallPick,
      league,
    }),
    draftedSeason: session && session.seasonYear,
    draftedOverall: session && session.currentOverallPick,
    draftedRound: session && session.round,
  };
}

function createDraftSession({
  seasonYear,
  sport,
  teamOrder,
  rounds,
  timerSeconds,
  now,
}) {
  if (!Number.isInteger(seasonYear) || !Array.isArray(teamOrder) || teamOrder.length === 0) {
    throw new LiveDraftError('failed-precondition', 'Draft season and team order are required.');
  }
  if (!Number.isInteger(rounds) || rounds < 1 || !Number.isFinite(timerSeconds) || timerSeconds < 1) {
    throw new LiveDraftError('invalid-argument', 'Draft rounds and timer must be valid.');
  }
  return {
    seasonYear,
    sport,
    status: 'live',
    teamOrder: [...teamOrder],
    totalPicks: teamOrder.length * rounds,
    currentOverallPick: 1,
    currentTeamId: teamOrder[0],
    round: 1,
    deadlineMillis: now + timerSeconds * 1000,
    selectedIds: [],
    picks: [],
    version: 0,
  };
}

function validateManualDraftPick({
  uid,
  team,
  session,
  prospectId: selectedProspectId,
  expectedPickNumber,
  expectedVersion,
  now,
}) {
  if (!session || session.status !== 'live') {
    return { valid: false, code: 'failed-precondition', reason: 'draft_not_live' };
  }
  if (
    session.currentOverallPick !== expectedPickNumber
    || session.version !== expectedVersion
  ) {
    return { valid: false, code: 'aborted', reason: 'pick_changed' };
  }
  if (!team || String(team.id) !== String(session.currentTeamId) || team.gmId !== uid) {
    return { valid: false, code: 'permission-denied', reason: 'not_current_gm' };
  }
  if (session.deadlineMillis != null && now > session.deadlineMillis) {
    return { valid: false, code: 'failed-precondition', reason: 'clock_expired' };
  }
  if (!selectedProspectId || (session.selectedIds || []).includes(String(selectedProspectId))) {
    return { valid: false, code: 'failed-precondition', reason: 'prospect_unavailable' };
  }
  return { valid: true };
}

function applyDraftPick({
  session,
  teamId,
  prospect,
  selectedBy,
  selectionType,
  now,
  timerSeconds,
}) {
  const selectedProspectId = prospectId(prospect);
  if (
    !session
    || session.status !== 'live'
    || String(session.currentTeamId) !== String(teamId)
    || !selectedProspectId
    || (session.selectedIds || []).includes(selectedProspectId)
  ) {
    throw new LiveDraftError('failed-precondition', 'The draft selection is no longer available.');
  }
  const pick = {
    overall: session.currentOverallPick,
    round: session.round,
    teamId: String(teamId),
    prospectId: selectedProspectId,
    prospect,
    selectedBy,
    selectionType,
    selectedAtMillis: now,
  };
  const nextOverallPick = session.currentOverallPick + 1;
  const complete = nextOverallPick > session.totalPicks;
  const nextIndex = nextOverallPick - 1;
  return {
    ...session,
    status: complete ? 'complete' : 'live',
    currentOverallPick: nextOverallPick,
    currentTeamId: complete
      ? null
      : session.teamOrder[nextIndex % session.teamOrder.length],
    round: complete
      ? session.round
      : Math.floor(nextIndex / session.teamOrder.length) + 1,
    deadlineMillis: complete ? null : now + timerSeconds * 1000,
    selectedIds: [...(session.selectedIds || []), selectedProspectId],
    picks: [...(session.picks || []), pick],
    version: session.version + 1,
  };
}

function authorizeAutoPick({
  uid,
  commissionerIds,
  currentTeam,
  session,
  now,
}) {
  if (!uid || !session || session.status !== 'live') return false;
  if ((commissionerIds || []).includes(uid)) return true;
  if (!currentTeam || !currentTeam.gmId) return true;
  return session.deadlineMillis != null && now > session.deadlineMillis;
}

function talent(prospect) {
  if (Number.isFinite(prospect && prospect.talent)) return prospect.talent;
  const ratings = Object.values(prospect && prospect.ratings || {}).filter(Number.isFinite);
  const average = ratings.length
    ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length
    : 60;
  const potential = Number.isFinite(prospect && prospect.potential) ? prospect.potential : average;
  const roundBonus = Number.isFinite(prospect && prospect.projectedRound)
    ? Math.max(0, 8 - prospect.projectedRound) * 0.75
    : 0;
  return average * 0.65 + potential * 0.35 + roundBonus;
}

function chooseServerAutoPick(prospects, selectedIds, needs) {
  const selected = new Set((selectedIds || []).map(String));
  const available = (prospects || []).filter(prospect => {
    const id = prospectId(prospect);
    return id && !selected.has(id);
  });
  if (available.length === 0) {
    throw new LiveDraftError('failed-precondition', 'No draft prospects remain.');
  }
  return [...available].sort((left, right) => {
    const leftNeed = Math.max(0, Math.min(1, needs[left.position] || 0));
    const rightNeed = Math.max(0, Math.min(1, needs[right.position] || 0));
    const leftScore = talent(left) + leftNeed * 8;
    const rightScore = talent(right) + rightNeed * 8;
    return rightScore - leftScore
      || talent(right) - talent(left)
      || prospectId(left).localeCompare(prospectId(right));
  })[0];
}

function normalizedNeeds(team) {
  if (team && team.needs && !Array.isArray(team.needs)) return team.needs;
  return Object.fromEntries((team && team.needs || []).map(position => [position, 1]));
}

function isCommissioner(uid, league) {
  return league.commissionerId === uid || (league.coCommissioners || []).includes(uid);
}

function assertLeagueDraftIsLive(league) {
  const offseason = league && league.offseason || {};
  if (
    offseason.stage !== 'live_draft'
    || offseason.draftStatus !== 'live'
    || !Number.isInteger(offseason.seasonYear)
  ) {
    throw new LiveDraftError('failed-precondition', 'The live draft stage is not active.');
  }
  return offseason;
}

function toHttpsError(error, HttpsError) {
  if (error instanceof LiveDraftError) {
    return new HttpsError(error.code, error.message, error.details);
  }
  return error;
}

function createInitializeLiveDraftHandler({ getFirestore, now, HttpsError }) {
  return async function initializeLiveDraft(request) {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
    const leagueId = request.data && typeof request.data.leagueId === 'string'
      ? request.data.leagueId.trim()
      : '';
    if (!leagueId) throw new HttpsError('invalid-argument', 'Provide leagueId.');
    const db = getFirestore();
    const leagueRef = db.collection('leagues').doc(leagueId);
    return db.runTransaction(async tx => {
      const [leagueSnap, teamsSnap] = await Promise.all([
        tx.get(leagueRef),
        tx.get(leagueRef.collection('teams')),
      ]);
      if (!leagueSnap.exists) throw new HttpsError('not-found', 'League not found.');
      const league = leagueSnap.data() || {};
      if (!isCommissioner(uid, league)) {
        throw new HttpsError('permission-denied', 'Only a commissioner can initialize the draft.');
      }
      const offseason = assertLeagueDraftIsLive(league);
      const classRef = leagueRef.collection('draft_classes').doc(String(offseason.seasonYear));
      const sessionRef = leagueRef.collection('draft_sessions').doc(String(offseason.seasonYear));
      const sport = league.sport === 'nfl' ? 'madden' : league.sport;
      const poolRef = db.collection('era_player_pools').doc(sport);
      const [classSnap, sessionSnap, poolSnap] = await Promise.all([
        tx.get(classRef),
        tx.get(sessionRef),
        tx.get(poolRef),
      ]);
      if (!classSnap.exists || (classSnap.data() || {}).published !== true) {
        throw new HttpsError('failed-precondition', 'Publish the draft class first.');
      }
      if (sessionSnap.exists) return { session: sessionSnap.data() };
      const teamDocs = teamsSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() || {}) }));
      const poolPlayers = poolSnap.exists && Array.isArray((poolSnap.data() || {}).players)
        ? poolSnap.data().players
        : [];
      const draftTeams = buildDraftFranchises(sport, teamDocs, poolPlayers);
      const teamOrder = buildDraftOrder(draftTeams, league.draftOrder);
      const session = createDraftSession({
        seasonYear: offseason.seasonYear,
        sport,
        teamOrder,
        rounds: draftRoundsForSport(sport),
        timerSeconds: offseason.draftTimerSeconds || league.draftTimerSeconds || 120,
        now: now(),
      });
      for (const team of draftTeams) {
        if (team.virtual) {
          const { virtual, ...storedTeam } = team;
          tx.create(leagueRef.collection('teams').doc(team.id), storedTeam);
        }
      }
      tx.create(sessionRef, session);
      return { session };
    });
  };
}

function createDraftPickHandler({ getFirestore, now, HttpsError }) {
  return async function makeDraftPick(request) {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
    const data = request.data || {};
    const leagueId = typeof data.leagueId === 'string' ? data.leagueId.trim() : '';
    const prospectIdInput = typeof data.prospectId === 'string' ? data.prospectId.trim() : '';
    if (
      !leagueId
      || !prospectIdInput
      || !Number.isInteger(data.expectedPickNumber)
      || !Number.isInteger(data.expectedVersion)
    ) {
      throw new HttpsError('invalid-argument', 'Provide league, prospect, pick number, and version.');
    }
    const db = getFirestore();
    const leagueRef = db.collection('leagues').doc(leagueId);
    try {
      return await db.runTransaction(async tx => {
        const leagueSnap = await tx.get(leagueRef);
        if (!leagueSnap.exists) throw new HttpsError('not-found', 'League not found.');
        const league = leagueSnap.data() || {};
        const offseason = assertLeagueDraftIsLive(league);
        const seasonYear = offseason.seasonYear;
        const sessionRef = leagueRef.collection('draft_sessions').doc(String(seasonYear));
        const classRef = leagueRef.collection('draft_classes').doc(String(seasonYear));
        const [sessionSnap, classSnap] = await Promise.all([
          tx.get(sessionRef),
          tx.get(classRef),
        ]);
        if (!sessionSnap.exists || !classSnap.exists) {
          throw new HttpsError('failed-precondition', 'The live draft is not initialized.');
        }
        const session = sessionSnap.data() || {};
        const teamRef = leagueRef.collection('teams').doc(String(session.currentTeamId));
        const teamSnap = await tx.get(teamRef);
        if (!teamSnap.exists) throw new HttpsError('not-found', 'Current draft team not found.');
        const team = { id: teamSnap.id, ...(teamSnap.data() || {}) };
        const validation = validateManualDraftPick({
          uid,
          team,
          session,
          prospectId: prospectIdInput,
          expectedPickNumber: data.expectedPickNumber,
          expectedVersion: data.expectedVersion,
          now: now(),
        });
        if (!validation.valid) {
          throw new LiveDraftError(validation.code, 'This draft pick is no longer valid.', {
            reason: validation.reason,
          });
        }
        const prospect = ((classSnap.data() || {}).players || [])
          .find(candidate => prospectId(candidate) === prospectIdInput);
        if (!prospect) throw new HttpsError('not-found', 'Prospect not found.');
        const timestamp = now();
        const next = applyDraftPick({
          session,
          teamId: team.id,
          prospect,
          selectedBy: uid,
          selectionType: 'manual',
          now: timestamp,
          timerSeconds: session.deadlineMillis == null
            ? 120
            : offseason.draftTimerSeconds || 120,
        });
        tx.update(teamRef, {
          players: [...(team.players || []), buildDraftedPlayer({ prospect, session, league })],
        });
        tx.set(sessionRef, next);
        if (next.status === 'complete') {
          tx.update(leagueRef, { 'offseason.draftStatus': 'complete' });
        }
        return { session: next, pick: next.picks[next.picks.length - 1] };
      });
    } catch (error) {
      throw toHttpsError(error, HttpsError);
    }
  };
}

function createAutoPickHandler({ getFirestore, now, HttpsError }) {
  return async function autoPickDraftSelection(request) {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
    const data = request.data || {};
    const leagueId = typeof data.leagueId === 'string' ? data.leagueId.trim() : '';
    if (
      !leagueId
      || !Number.isInteger(data.expectedPickNumber)
      || !Number.isInteger(data.expectedVersion)
    ) {
      throw new HttpsError('invalid-argument', 'Provide league, pick number, and version.');
    }
    const db = getFirestore();
    const leagueRef = db.collection('leagues').doc(leagueId);
    try {
      return await db.runTransaction(async tx => {
        const leagueSnap = await tx.get(leagueRef);
        if (!leagueSnap.exists) throw new HttpsError('not-found', 'League not found.');
        const league = leagueSnap.data() || {};
        const offseason = assertLeagueDraftIsLive(league);
        const member = isCommissioner(uid, league) || (league.members || []).includes(uid);
        if (!member) throw new HttpsError('permission-denied', 'Only league members can advance an expired draft pick.');
        const seasonYear = offseason.seasonYear;
        const sessionRef = leagueRef.collection('draft_sessions').doc(String(seasonYear));
        const classRef = leagueRef.collection('draft_classes').doc(String(seasonYear));
        const [sessionSnap, classSnap] = await Promise.all([
          tx.get(sessionRef),
          tx.get(classRef),
        ]);
        if (!sessionSnap.exists || !classSnap.exists) {
          throw new HttpsError('failed-precondition', 'The live draft is not initialized.');
        }
        const session = sessionSnap.data() || {};
        if (
          session.currentOverallPick !== data.expectedPickNumber
          || session.version !== data.expectedVersion
        ) {
          throw new LiveDraftError('aborted', 'The current draft pick changed.');
        }
        const teamRef = leagueRef.collection('teams').doc(String(session.currentTeamId));
        const teamSnap = await tx.get(teamRef);
        if (!teamSnap.exists) throw new HttpsError('not-found', 'Current draft team not found.');
        const team = { id: teamSnap.id, ...(teamSnap.data() || {}) };
        const timestamp = now();
        if (!authorizeAutoPick({
          uid,
          commissionerIds: [league.commissionerId, ...(league.coCommissioners || [])].filter(Boolean),
          currentTeam: team,
          session,
          now: timestamp,
        })) {
          throw new LiveDraftError('failed-precondition', 'The current draft clock has not expired.');
        }
        const prospect = chooseServerAutoPick(
          (classSnap.data() || {}).players || [],
          session.selectedIds,
          normalizedNeeds(team),
        );
        const next = applyDraftPick({
          session,
          teamId: team.id,
          prospect,
          selectedBy: isCommissioner(uid, league) ? uid : 'system',
          selectionType: 'auto',
          now: timestamp,
          timerSeconds: offseason.draftTimerSeconds || 120,
        });
        tx.update(teamRef, {
          players: [...(team.players || []), buildDraftedPlayer({ prospect, session, league })],
        });
        tx.set(sessionRef, next);
        if (next.status === 'complete') {
          tx.update(leagueRef, { 'offseason.draftStatus': 'complete' });
        }
        return { session: next, pick: next.picks[next.picks.length - 1] };
      });
    } catch (error) {
      throw toHttpsError(error, HttpsError);
    }
  };
}

module.exports = {
  LiveDraftError,
  applyDraftPick,
  assertLeagueDraftIsLive,
  authorizeAutoPick,
  buildDraftedPlayer,
  buildDraftFranchises,
  buildDraftOrder,
  chooseServerAutoPick,
  createAutoPickHandler,
  createDraftPickHandler,
  createDraftSession,
  draftRoundsForSport,
  createInitializeLiveDraftHandler,
  validateManualDraftPick,
};
