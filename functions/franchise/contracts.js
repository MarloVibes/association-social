'use strict';

const { serverRosterCompliance } = require('./newSeason');
const { buildDraftFranchises } = require('./liveDraft');

const CONTRACT_STAGES = new Set(['re_signing', 'free_agency']);
const CONTRACT_ROLES = new Set(['franchise', 'starter', 'rotation', 'depth']);
const TEAM_ACTION_STAGES = new Set([
  'team_options',
  're_signing',
  'free_agency',
  'roster_cuts',
  'ready_for_season',
]);
const MAX_OFFERS_PER_ROUND = 200;

function normalizeSport(sport) {
  if (sport === 'nfl' || sport === 'madden') return 'madden';
  if (sport === 'mlb') return 'mlb';
  return 'nba';
}

function playerKey(player) {
  return String(player && (player.player_id || player.id || player.bref_id || player.full_name) || '');
}

function contractOfferId({ seasonYear, stage, teamId, playerId }) {
  return [seasonYear, stage, teamId, playerId]
    .map(value => encodeURIComponent(String(value)))
    .join('__');
}

function contractResolutionId({ seasonYear, stage, playerId }) {
  return [seasonYear, stage, playerId]
    .map(value => encodeURIComponent(String(value)))
    .join('__');
}

function cpuContractDecisionId({ leagueId, seasonYear, stage, teamId, playerId }) {
  return [leagueId, seasonYear, stage, teamId, playerId]
    .map(value => encodeURIComponent(String(value)))
    .join('__');
}

function seededUnit(seed) {
  let hash = 2166136261;
  const value = String(seed || '');
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function scoreContractOffer(offer) {
  const roleScore = {
    franchise: 18,
    starter: 12,
    rotation: 7,
    depth: 3,
  }[offer.role] || 0;
  const salary = Number.isFinite(offer.salary) ? Math.max(0, offer.salary) : 0;
  const salaryScore = Math.log1p(salary) / Math.log1p(50000000) * 40;
  const yearsScore = Math.min(Math.max(0, Number(offer.years) || 0), 7) * 2;
  const contextScore = (
    Math.max(0, Math.min(1, Number(offer.contender) || 0)) * 8
    + Math.max(0, Math.min(1, Number(offer.need) || 0)) * 10
    + Math.max(0, Math.min(1, Number(offer.loyalty) || 0)) * 7
    + Math.max(0, Math.min(1, Number(offer.reputation) || 0)) * 6
  );
  const score = salaryScore + yearsScore + roleScore + contextScore + seededUnit(offer.seed) * 4 - 2;
  return Math.round(score * 1000) / 1000;
}

function sumPayroll(players) {
  return (Array.isArray(players) ? players : []).reduce((total, player) => (
    total + (Number.isFinite(player && player.salary) ? Math.max(0, player.salary) : 0)
  ), 0);
}

function rosterLimit(sport) {
  if (sport === 'madden') return 53;
  if (sport === 'mlb') return 40;
  return 15;
}

function financeLimit(sport, team, league) {
  if (sport === 'mlb') {
    if (Number.isFinite(team && team.budget)) return team.budget;
    if (Number.isFinite(league && league.teamBudget)) return league.teamBudget;
    return league && league.salaryCap;
  }
  if (sport === 'madden') {
    if (Number.isFinite(team && team.salaryCap)) return team.salaryCap;
    return league && league.salaryCap;
  }
  return Infinity;
}

function offerFit({ sport, league, team, offer }) {
  const players = Array.isArray(team && team.players) ? team.players : [];
  const reSigningExisting = offer.expectedStage === 're_signing'
    && players.some(player => playerKey(player) === offer.playerId);
  if (offer.expectedStage === 're_signing' && !reSigningExisting) {
    return { valid: false, reason: 'not_incumbent' };
  }
  if (!reSigningExisting && players.length + 1 > rosterLimit(sport)) {
    return { valid: false, reason: 'roster_limit' };
  }
  const existingSalary = reSigningExisting
    ? Number(players.find(player => playerKey(player) === offer.playerId)?.salary) || 0
    : 0;
  const payrollAfter = sumPayroll(players) - existingSalary + offer.salary;
  const limit = financeLimit(sport, team, league);
  if (sport !== 'nba' && (!Number.isFinite(limit) || payrollAfter > limit)) {
    return { valid: false, reason: 'financial_limit' };
  }
  return { valid: true, payrollAfter };
}

function validateContractOffer({ uid, league, team, offer }) {
  const stage = league && league.offseason && league.offseason.stage;
  const version = league && league.offseason && league.offseason.version;
  if (!uid || !team || team.gmId !== uid) {
    return { valid: false, code: 'permission-denied', reason: 'team_ownership' };
  }
  if (
    !CONTRACT_STAGES.has(stage)
    || offer.expectedStage !== stage
    || offer.expectedVersion !== version
  ) {
    return { valid: false, code: 'failed-precondition', reason: 'stage_changed' };
  }
  if (
    !offer.playerId
    || playerKey(offer.player) !== String(offer.playerId)
    || !Number.isFinite(offer.salary)
    || offer.salary < 0
    || !Number.isInteger(offer.years)
    || offer.years < 1
    || offer.years > 7
    || !CONTRACT_ROLES.has(offer.role)
  ) {
    return { valid: false, code: 'invalid-argument', reason: 'invalid_terms' };
  }
  const hasPlayer = (team.players || []).some(player => playerKey(player) === String(offer.playerId));
  if (stage === 're_signing' && !hasPlayer) {
    return { valid: false, code: 'failed-precondition', reason: 'not_incumbent' };
  }
  if (stage === 'free_agency' && hasPlayer) {
    return { valid: false, code: 'failed-precondition', reason: 'already_rostered' };
  }
  const sport = normalizeSport(league.sport);
  const fit = offerFit({ sport, league, team, offer });
  return fit.valid
    ? { valid: true, payrollAfter: fit.payrollAfter }
    : { valid: false, code: 'failed-precondition', reason: fit.reason };
}

function applyContract(team, offer, stage) {
  const players = Array.isArray(team.players) ? team.players : [];
  const signedPlayer = {
    ...offer.player,
    salary: offer.salary,
    contractYears: offer.years,
    contractRole: offer.role,
    signedSeason: offer.seasonYear,
  };
  if (stage === 're_signing') {
    const target = offer.playerId;
    return {
      ...team,
      players: players.map(player => (
        playerKey(player) === target ? signedPlayer : player
      )),
    };
  }
  return { ...team, players: [...players, signedPlayer] };
}

function resolveContractRound({
  sport: sportInput,
  league,
  seasonYear,
  stage,
  teams,
  offers,
  resolvedPlayerIds,
}) {
  const sport = normalizeSport(sportInput);
  const resolved = new Set((resolvedPlayerIds || []).map(String));
  const projectedTeams = new Map((teams || []).map(team => [String(team.id), {
    ...team,
    players: [...(team.players || [])],
  }]));
  const offersByPlayer = new Map();
  const offerResults = [];
  for (const offer of offers || []) {
    const playerId = String(offer.playerId || '');
    if (!playerId) continue;
    if (resolved.has(playerId)) {
      offerResults.push({
        id: offer.id,
        playerId,
        teamId: offer.teamId,
        status: 'rejected',
        reason: 'already_resolved',
        preferenceScore: null,
      });
      continue;
    }
    const current = offersByPlayer.get(playerId) || [];
    current.push(offer);
    offersByPlayer.set(playerId, current);
  }

  const resolutions = [];
  for (const playerId of [...offersByPlayer.keys()].sort()) {
    const playerOffers = offersByPlayer.get(playerId);
    const alreadyRostered = stage === 'free_agency' && [...projectedTeams.values()]
      .some(team => (team.players || []).some(player => playerKey(player) === playerId));
    if (alreadyRostered) {
      for (const offer of playerOffers) {
        offerResults.push({
          id: offer.id,
          playerId,
          teamId: offer.teamId,
          status: 'invalid',
          reason: 'already_rostered',
          preferenceScore: null,
        });
      }
      continue;
    }
    const ranked = playerOffers.map(offer => {
      const team = projectedTeams.get(String(offer.teamId));
      const fit = team
        ? offerFit({
          sport,
          league,
          team,
          offer: {
            ...offer,
            playerId,
            expectedStage: stage,
          },
        })
        : { valid: false, reason: 'team_not_found' };
      return {
        offer,
        team,
        fit,
        score: fit.valid ? scoreContractOffer(offer) : -Infinity,
      };
    }).sort((left, right) => (
      right.score - left.score || String(left.offer.id).localeCompare(String(right.offer.id))
    ));
    const winner = ranked.find(candidate => candidate.fit.valid);

    for (const candidate of ranked) {
      if (!candidate.fit.valid) {
        offerResults.push({
          id: candidate.offer.id,
          playerId,
          teamId: candidate.offer.teamId,
          status: 'invalid',
          reason: candidate.fit.reason,
          preferenceScore: null,
        });
      } else {
        offerResults.push({
          id: candidate.offer.id,
          playerId,
          teamId: candidate.offer.teamId,
          status: candidate === winner ? 'accepted' : 'rejected',
          preferenceScore: candidate.score,
        });
      }
    }

    if (!winner) continue;
    const winningOffer = {
      ...winner.offer,
      playerId,
      seasonYear,
    };
    projectedTeams.set(
      String(winningOffer.teamId),
      applyContract(winner.team, winningOffer, stage),
    );
    resolutions.push({
      playerId,
      winnerTeamId: String(winningOffer.teamId),
      winningOfferId: winningOffer.id,
      preferenceScore: winner.score,
      seasonYear,
      stage,
    });
    resolved.add(playerId);
  }

  return {
    teams: [...projectedTeams.values()],
    resolutions,
    offerResults,
  };
}

function callableError(HttpsError, code, message, details) {
  return new HttpsError(code, message, details);
}

function requireString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function pendingTeamOfferIds(offers, teamId, stage, version) {
  return (offers || [])
    .filter(offer => (
      offer.teamId === teamId
      && offer.stage === stage
      && offer.version === version
      && offer.status === 'pending'
    ))
    .map(offer => String(offer.id));
}

function teamCompletionBlocker(stage, team, league) {
  if (stage !== 'roster_cuts') return null;
  const compliance = serverRosterCompliance(league.sport, team, league);
  return compliance.valid
    ? null
    : { reason: 'roster_noncompliant', compliance };
}

function selectOfferBatch(offers, maxOffers = MAX_OFFERS_PER_ROUND) {
  const groups = new Map();
  for (const offer of offers || []) {
    const playerId = String(offer.playerId || '');
    if (!playerId) continue;
    const group = groups.get(playerId) || [];
    group.push(offer);
    groups.set(playerId, group);
  }
  const selected = [];
  for (const playerId of [...groups.keys()].sort()) {
    const group = groups.get(playerId);
    if (selected.length > 0 && selected.length + group.length > maxOffers) break;
    selected.push(...group);
  }
  return selected;
}

function buildCpuContractOffers({
  leagueId,
  sport,
  league,
  seasonYear,
  stage,
  version,
  teams,
  freeAgents,
  existingOfferIds,
}) {
  if (!CONTRACT_STAGES.has(stage)) return [];
  const existing = new Set(existingOfferIds || []);
  const offers = [];
  for (const team of teams || []) {
    if (team.gmId) continue;
    const cpuTeam = { ...team, needs: deriveCpuNeeds(sport, team) };
    const candidates = stage === 're_signing'
      ? (cpuTeam.players || []).filter(candidate => (
        Number(candidate.age) <= 27
        && Number(candidate.overall || candidate.rating || candidate.value) >= 80
        && (candidate.contractYears == null || candidate.contractYears <= 1)
      ))
      : (freeAgents || []).filter(candidate => (
        cpuTeam.needs.includes(contractPositionGroup(sport, candidate.position))
      ));
    for (const candidate of candidates) {
      const id = cpuContractDecisionId({
        leagueId,
        seasonYear,
        stage,
        teamId: cpuTeam.id,
        playerId: playerKey(candidate),
      });
      if (!playerKey(candidate) || existing.has(id)) continue;
      const salary = Number.isFinite(candidate.askingSalary)
        ? candidate.askingSalary
        : Number.isFinite(candidate.salary) ? candidate.salary : 0;
      const years = Number.isInteger(candidate.askingYears)
        ? candidate.askingYears
        : 2;
      const offer = {
        id,
        leagueId,
        seasonYear,
        stage,
        version,
        teamId: String(cpuTeam.id),
        playerId: playerKey(candidate),
        player: candidate,
        salary,
        years,
        role: Number(candidate.overall || candidate.rating || candidate.value) >= 88
          ? 'franchise'
          : 'starter',
        contender: Number.isFinite(cpuTeam.contender) ? cpuTeam.contender : 0.5,
        need: stage === 'free_agency' ? 1 : 0.5,
        loyalty: stage === 're_signing' ? 0.8 : 0.2,
        reputation: Number.isFinite(cpuTeam.reputation) ? cpuTeam.reputation : 0.5,
        seed: id,
        status: 'pending',
        source: 'cpu',
      };
      if (offerFit({
        sport: normalizeSport(sport),
        league,
        team: cpuTeam,
        offer: { ...offer, expectedStage: stage },
      }).valid) {
        offers.push(offer);
        existing.add(id);
      }
    }
  }
  return offers;
}

function deriveCpuNeeds(sportInput, team) {
  if (Array.isArray(team.needs) && team.needs.length > 0) return team.needs;
  const sport = normalizeSport(sportInput);
  const counts = (team.players || []).reduce((result, player) => {
    const position = contractPositionGroup(sport, player.position);
    result[position] = (result[position] || 0) + 1;
    return result;
  }, {});
  const targets = sport === 'madden'
    ? { QB: 2, HB: 3, WR: 6, TE: 3, OL: 8, EDGE: 4, DT: 4, MLB: 3, CB: 5, FS: 2, SS: 2 }
    : { SP: 5, RP: 7, C: 2, '1B': 2, '2B': 2, '3B': 2, SS: 2, OF: 5 };
  return Object.entries(targets)
    .filter(([position, target]) => (counts[position] || 0) < target)
    .map(([position]) => position);
}

function contractPositionGroup(sportInput, positionInput) {
  const sport = normalizeSport(sportInput);
  const position = String(positionInput || '');
  if (sport === 'mlb' && ['LF', 'CF', 'RF', 'OF'].includes(position)) return 'OF';
  if (sport === 'madden' && ['LT', 'LG', 'C', 'RG', 'RT', 'OL'].includes(position)) return 'OL';
  if (sport === 'madden' && ['HB', 'RB'].includes(position)) return 'HB';
  if (sport === 'madden' && ['EDGE', 'DE', 'LOLB', 'ROLB', 'OLB'].includes(position)) return 'EDGE';
  return position;
}

function createSubmitContractOfferHandler({
  getFirestore,
  serverTimestamp,
  HttpsError,
}) {
  return async function submitContractOffer(request) {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw callableError(HttpsError, 'unauthenticated', 'You must be signed in.');
    const data = request.data || {};
    const leagueId = requireString(data.leagueId);
    const teamId = requireString(data.teamId);
    const playerId = requireString(data.playerId);
    const expectedStage = requireString(data.expectedStage);
    const expectedVersion = data.expectedVersion;
    const salary = data.salary;
    const years = data.years;
    const role = requireString(data.role);
    if (
      !leagueId
      || !teamId
      || !playerId
      || !CONTRACT_STAGES.has(expectedStage)
      || !Number.isInteger(expectedVersion)
      || !Number.isFinite(salary)
      || !Number.isInteger(years)
      || !CONTRACT_ROLES.has(role)
    ) {
      throw callableError(HttpsError, 'invalid-argument', 'Provide valid league, team, player, stage, and contract terms.');
    }

    const db = getFirestore();
    const leagueRef = db.collection('leagues').doc(leagueId);
    const teamRef = leagueRef.collection('teams').doc(teamId);
    const freeAgentsQuery = leagueRef.collection('free_agents');
    const resolutions = leagueRef.collection('contract_resolutions');

    return db.runTransaction(async tx => {
      const [leagueSnap, teamSnap, freeAgentsSnap] = await Promise.all([
        tx.get(leagueRef),
        tx.get(teamRef),
        tx.get(freeAgentsQuery),
      ]);
      if (!leagueSnap.exists || !teamSnap.exists) {
        throw callableError(HttpsError, 'not-found', 'League or team not found.');
      }

      const league = leagueSnap.data() || {};
      const team = { id: teamSnap.id, ...(teamSnap.data() || {}) };
      const offseason = league.offseason || {};
      const authoritativePlayer = expectedStage === 're_signing'
        ? (team.players || []).find(player => playerKey(player) === playerId)
        : freeAgentsSnap.docs
          .flatMap(doc => (doc.data() || {}).players || [])
          .find(player => playerKey(player) === playerId);
      if (!authoritativePlayer) {
        throw callableError(HttpsError, 'not-found', 'The player is not eligible for this contract stage.');
      }
      const resolutionId = contractResolutionId({
        seasonYear: offseason.seasonYear,
        stage: expectedStage,
        playerId,
      });
      const resolutionSnap = await tx.get(resolutions.doc(resolutionId));
      if (resolutionSnap.exists) {
        throw callableError(HttpsError, 'already-exists', 'This player has already chosen a team.');
      }
      const offerId = contractOfferId({
        seasonYear: offseason.seasonYear,
        stage: expectedStage,
        teamId,
        playerId,
      });
      const offerRef = leagueRef.collection('contract_offers').doc(offerId);
      const offer = {
        player: authoritativePlayer,
        playerId,
        salary,
        years,
        role,
        expectedStage,
        expectedVersion,
      };
      const validation = validateContractOffer({ uid, league, team, offer });
      if (!validation.valid) {
        throw callableError(
          HttpsError,
          validation.code,
          'This contract offer is not valid.',
          { reason: validation.reason },
        );
      }

      const needPositions = Array.isArray(team.needs) ? team.needs : [];
      const storedOffer = {
        id: offerId,
        leagueId,
        seasonYear: offseason.seasonYear,
        stage: offseason.stage,
        version: offseason.version,
        teamId,
        playerId,
        player: authoritativePlayer,
        salary,
        years,
        role,
        contender: Number.isFinite(team.contender) ? team.contender : 0.5,
        need: needPositions.includes(authoritativePlayer.position) ? 1 : 0,
        loyalty: Number.isFinite(authoritativePlayer.loyalty) ? authoritativePlayer.loyalty : 0.5,
        reputation: Number.isFinite(team.reputation) ? team.reputation : 0.5,
        seed: offerId,
        status: 'pending',
        submittedBy: uid,
        createdAt: serverTimestamp(),
      };
      tx.update(leagueRef, {
        'offseason.completedTeamIds': (offseason.completedTeamIds || [])
          .map(String)
          .filter(completedTeamId => completedTeamId !== teamId),
        'offseason.contractRoundsComplete': false,
      });
      tx.set(offerRef, storedOffer);
      return { offer: storedOffer };
    });
  };
}

function createResolveContractRoundHandler({
  getFirestore,
  serverTimestamp,
  HttpsError,
}) {
  return async function resolveFreeAgencyRound(request) {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw callableError(HttpsError, 'unauthenticated', 'You must be signed in.');
    const data = request.data || {};
    const leagueId = requireString(data.leagueId);
    const expectedStage = requireString(data.expectedStage);
    const expectedVersion = data.expectedVersion;
    if (
      !leagueId
      || !CONTRACT_STAGES.has(expectedStage)
      || !Number.isInteger(expectedVersion)
    ) {
      throw callableError(HttpsError, 'invalid-argument', 'Provide leagueId, expectedStage, and expectedVersion.');
    }

    const db = getFirestore();
    const leagueRef = db.collection('leagues').doc(leagueId);
    const teamsQuery = leagueRef.collection('teams');
    const offersQuery = leagueRef.collection('contract_offers');
    const resolutionsQuery = leagueRef.collection('contract_resolutions');
    const freeAgentsQuery = leagueRef.collection('free_agents');
    return db.runTransaction(async tx => {
      const leagueSnap = await tx.get(leagueRef);
      if (!leagueSnap.exists) {
        throw callableError(HttpsError, 'not-found', 'League not found.');
      }
      const league = leagueSnap.data() || {};
      const sport = normalizeSport(league.sport);
      const poolRef = db.collection('era_player_pools').doc(sport);
      const [teamsSnap, offersSnap, resolutionsSnap, freeAgentsSnap, poolSnap] = await Promise.all([
        tx.get(teamsQuery),
        tx.get(offersQuery),
        tx.get(resolutionsQuery),
        tx.get(freeAgentsQuery),
        tx.get(poolRef),
      ]);
      const commissioner = league.commissionerId === uid
        || (league.coCommissioners || []).includes(uid);
      if (!commissioner) {
        throw callableError(HttpsError, 'permission-denied', 'Only a commissioner can resolve contract offers.');
      }
      const offseason = league.offseason || {};
      if (offseason.stage !== expectedStage || offseason.version !== expectedVersion) {
        throw callableError(HttpsError, 'aborted', 'The offseason stage changed before resolution.');
      }

      const storedTeams = teamsSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() || {}) }));
      const poolPlayers = poolSnap.exists && Array.isArray((poolSnap.data() || {}).players)
        ? poolSnap.data().players
        : [];
      const teams = sport === 'madden' || sport === 'mlb'
        ? buildDraftFranchises(sport, storedTeams, poolPlayers)
        : storedTeams;
      const storedOffers = offersSnap.docs
        .map(doc => ({ id: doc.id, ...(doc.data() || {}) }))
        .filter(offer => (
          offer.status === 'pending'
          && offer.stage === expectedStage
          && offer.version === expectedVersion
        ));
      const freeAgents = expectedStage === 'free_agency'
        ? freeAgentsSnap.docs.flatMap(doc => (doc.data() || {}).players || [])
        : [];
      const cpuOffers = buildCpuContractOffers({
        leagueId,
        sport: league.sport,
        league,
        seasonYear: offseason.seasonYear,
        stage: expectedStage,
        version: expectedVersion,
        teams,
        freeAgents,
        existingOfferIds: offersSnap.docs.map(doc => doc.id),
      });
      const allOffers = [...storedOffers, ...cpuOffers];
      const offers = selectOfferBatch(allOffers);
      const result = resolveContractRound({
        sport: league.sport,
        league,
        seasonYear: offseason.seasonYear,
        stage: expectedStage,
        teams,
        offers,
        resolvedPlayerIds: resolutionsSnap.docs
          .map(doc => doc.data() || {})
          .filter(resolution => (
            resolution.seasonYear === offseason.seasonYear
            && resolution.stage === expectedStage
          ))
          .map(resolution => String(resolution.playerId || '')),
      });

      const changedTeamIds = new Set(result.resolutions.map(resolution => resolution.winnerTeamId));
      for (const team of result.teams) {
        if (team.virtual) {
          const { virtual, ...storedTeam } = team;
          tx.set(teamsQuery.doc(team.id), storedTeam);
        } else if (changedTeamIds.has(String(team.id))) {
          tx.update(teamsQuery.doc(team.id), { players: team.players || [] });
        }
      }
      for (const offerResult of result.offerResults) {
        const cpuOffer = cpuOffers.find(offer => offer.id === offerResult.id);
        if (cpuOffer) {
          tx.set(offersQuery.doc(offerResult.id), {
            ...cpuOffer,
            ...offerResult,
            resolvedAt: serverTimestamp(),
          });
        } else {
          tx.update(offersQuery.doc(offerResult.id), {
            ...offerResult,
            resolvedAt: serverTimestamp(),
          });
        }
      }
      for (const resolution of result.resolutions) {
        const resolutionId = contractResolutionId(resolution);
        tx.create(resolutionsQuery.doc(resolutionId), {
          ...resolution,
          resolvedAt: serverTimestamp(),
          resolvedBy: uid,
        });
      }
      tx.update(leagueRef, {
        'offseason.contractRoundsComplete': offers.length >= allOffers.length,
      });
      return {
        resolvedCount: result.resolutions.length,
        resolutions: result.resolutions,
        hasMore: offers.length < allOffers.length,
      };
    });
  };
}

function createCompleteOffseasonActionHandler({
  getFirestore,
  serverTimestamp,
  HttpsError,
}) {
  return async function completeOffseasonTeamAction(request) {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw callableError(HttpsError, 'unauthenticated', 'You must be signed in.');
    const data = request.data || {};
    const leagueId = requireString(data.leagueId);
    const expectedStage = requireString(data.expectedStage);
    const expectedVersion = data.expectedVersion;
    if (
      !leagueId
      || !TEAM_ACTION_STAGES.has(expectedStage)
      || !Number.isInteger(expectedVersion)
    ) {
      throw callableError(HttpsError, 'invalid-argument', 'Provide a valid league stage and version.');
    }

    const db = getFirestore();
    const leagueRef = db.collection('leagues').doc(leagueId);
    const teamsQuery = leagueRef.collection('teams');
    const offersQuery = leagueRef.collection('contract_offers');
    return db.runTransaction(async tx => {
      const [leagueSnap, teamsSnap, offersSnap] = await Promise.all([
        tx.get(leagueRef),
        tx.get(teamsQuery),
        tx.get(offersQuery),
      ]);
      if (!leagueSnap.exists) {
        throw callableError(HttpsError, 'not-found', 'League not found.');
      }
      const league = leagueSnap.data() || {};
      const offseason = league.offseason || {};
      if (offseason.stage !== expectedStage || offseason.version !== expectedVersion) {
        throw callableError(HttpsError, 'aborted', 'The offseason stage changed before completion.');
      }
      const team = teamsSnap.docs.find(doc => (doc.data() || {}).gmId === uid);
      if (!team) {
        throw callableError(HttpsError, 'permission-denied', 'You must control a team in this league.');
      }
      const completionBlocker = teamCompletionBlocker(expectedStage, team.data() || {}, league);
      if (completionBlocker) {
        throw callableError(
          HttpsError,
          'failed-precondition',
          'Your roster must meet its sport limits before it can be marked complete.',
          completionBlocker,
        );
      }
      const pendingOfferIds = pendingTeamOfferIds(
        offersSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() || {}) })),
        team.id,
        expectedStage,
        expectedVersion,
      );
      if (pendingOfferIds.length > 0) {
        throw callableError(
          HttpsError,
          'failed-precondition',
          'Resolve this team’s pending contract offers before marking the stage complete.',
          { pendingOfferIds },
        );
      }
      const completed = new Set((offseason.completedTeamIds || []).map(String));
      completed.add(team.id);
      tx.update(leagueRef, {
        'offseason.completedTeamIds': [...completed].sort(),
        'offseason.lastTeamActionAt': serverTimestamp(),
      });
      return { teamId: team.id, completed: true };
    });
  };
}

module.exports = {
  CONTRACT_ROLES,
  CONTRACT_STAGES,
  MAX_OFFERS_PER_ROUND,
  TEAM_ACTION_STAGES,
  buildCpuContractOffers,
  contractOfferId,
  contractResolutionId,
  cpuContractDecisionId,
  createCompleteOffseasonActionHandler,
  createResolveContractRoundHandler,
  createSubmitContractOfferHandler,
  deriveCpuNeeds,
  pendingTeamOfferIds,
  selectOfferBatch,
  teamCompletionBlocker,
  resolveContractRound,
  scoreContractOffer,
  validateContractOffer,
};
