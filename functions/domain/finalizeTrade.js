'use strict';

function playerKey(player) {
  return String(player.player_id || player.id || player.bref_id || player.full_name || '');
}

function pickKey(pick) {
  return String(pick.id || '');
}

function isCommissioner(uid, league) {
  return league.commissionerId === uid || (league.coCommissioners || []).includes(uid);
}

function deadlineMillis(deadline) {
  if (Number.isFinite(deadline)) return Number(deadline);
  if (deadline && typeof deadline.toMillis === 'function') return deadline.toMillis();
  return NaN;
}

function authorizeFinalization({ uid, league, source, type, now = Date.now() }) {
  const commissioner = isCommissioner(uid, league);
  const participant = source.hostUid === uid || source.guestUid === uid;
  const member = (league.members || []).includes(uid);
  const inactive = league.paused === true
    || league.archived === true
    || league.status === 'archived';
  if (inactive) return false;
  if (type === 'cpu') return commissioner && source.status === 'pending';
  if (source.status === 'vote_passed') return commissioner || member || participant;
  if (source.status === 'pending_veto') {
    if (commissioner) return true;
    const deadline = deadlineMillis(source.vetoDeadline);
    return Number.isFinite(deadline) && now >= deadline && (member || participant);
  }

  const active = ['open', 'live', 'pushed', 'countered'].includes(source.status);
  return participant
    && league.tradeApprovalMode === 'instant'
    && active
    && source.hostConfirmed === true
    && source.guestConfirmed === true;
}

function validateTeamBindings({ leagueId, type, source, teamAId, teamBId, teamA, teamB }) {
  if (source.leagueId && source.leagueId !== leagueId) {
    return { valid: false, reason: 'league_mismatch' };
  }
  if (String(teamAId) === String(teamBId)) {
    return { valid: false, reason: 'same_team' };
  }
  if (type === 'cpu') {
    return teamA.gmId === source.proposerUid
      ? { valid: true }
      : { valid: false, reason: 'proposer_team_mismatch' };
  }
  if (teamA.gmId !== source.hostUid || teamB.gmId !== source.guestUid) {
    return { valid: false, reason: 'participant_team_mismatch' };
  }
  return { valid: true };
}

function sameTeam(team, requestedId, requestedAbbr) {
  const id = String(team.id || team.teamId || '').toUpperCase();
  const abbr = String(team.abbreviation || team.abbr || '').toUpperCase();
  return (!!requestedId && id === String(requestedId).toUpperCase())
    || (!!requestedAbbr && abbr === String(requestedAbbr).toUpperCase());
}

function matchesRequest(team, requestedId, requestedAbbr) {
  const idMatches = !requestedId
    || String(team.id || team.teamId || '').toUpperCase() === String(requestedId).toUpperCase();
  const abbrMatches = !requestedAbbr
    || String(team.abbreviation || team.abbr || '').toUpperCase() === String(requestedAbbr).toUpperCase();
  return !!(requestedId || requestedAbbr) && idMatches && abbrMatches;
}

function resolveCpuIdentity({ requestedId, requestedAbbr, eraTeams, liveTeams }) {
  const canonical = (eraTeams || []).find((team) => matchesRequest(team, requestedId, requestedAbbr));
  if (!canonical) return null;
  const claimed = (liveTeams || []).some((team) => (
    sameTeam(team, canonical.id || canonical.teamId, canonical.abbreviation || canonical.abbr)
    && !!team.gmId
  ));
  return claimed ? null : canonical;
}

function canonicalCpuTeams(sport, poolPlayers, eraTeams) {
  if (sport === 'nba') return eraTeams || [];
  const abbreviations = new Set(
    (poolPlayers || []).map((player) => String(player.team || '').trim().toUpperCase()).filter(Boolean),
  );
  return Array.from(abbreviations).sort().map((abbreviation) => ({
    id: abbreviation,
    abbreviation,
  }));
}

function matchesCpuIdentity(team, identity) {
  return sameTeam(team, identity.id || identity.teamId, identity.abbreviation || identity.abbr);
}

function authoritativeAssets(owned, offered, keyOf) {
  const byKey = new Map((owned || []).map((asset) => [keyOf(asset), asset]));
  return (offered || []).map((asset) => byKey.get(keyOf(asset))).filter(Boolean);
}

function swapAssets({ teamA, teamB, offerA, offerB, pickOfferA, pickOfferB }) {
  const playersA = authoritativeAssets(teamA.players, offerA, playerKey);
  const playersB = authoritativeAssets(teamB.players, offerB, playerKey);
  const picksA = authoritativeAssets(teamA.picks, pickOfferA, pickKey);
  const picksB = authoritativeAssets(teamB.picks, pickOfferB, pickKey);
  const playerKeysA = new Set(playersA.map(playerKey));
  const playerKeysB = new Set(playersB.map(playerKey));
  const pickKeysA = new Set(picksA.map(pickKey));
  const pickKeysB = new Set(picksB.map(pickKey));

  return {
    teamA: {
      players: (teamA.players || []).filter((asset) => !playerKeysA.has(playerKey(asset))).concat(playersB),
      picks: (teamA.picks || []).filter((asset) => !pickKeysA.has(pickKey(asset))).concat(picksB),
    },
    teamB: {
      players: (teamB.players || []).filter((asset) => !playerKeysB.has(playerKey(asset))).concat(playersA),
      picks: (teamB.picks || []).filter((asset) => !pickKeysB.has(pickKey(asset))).concat(picksA),
    },
  };
}

function financeLimit(team, league, sport) {
  if (sport === 'mlb') {
    return Number.isFinite(team.budget) ? team.budget
      : Number.isFinite(league.teamBudget) ? league.teamBudget
        : league.salaryCap;
  }
  return Number.isFinite(team.salaryCap) ? team.salaryCap : league.salaryCap;
}

function validationInput({ league, source, teamA, teamB, type }) {
  const sport = league.sport === 'nfl' ? 'madden' : (league.sport || 'nba');
  const commissioners = [league.commissionerId, ...(league.coCommissioners || [])].filter(Boolean);
  const approvedOverride = type === 'room'
    && league.commissionerCanOverride === true
    && source.salaryOverrideApplied === true
    && commissioners.includes(source.overrideApprovedBy);
  const offerA = type === 'cpu' ? (source.give || []) : (source.hostOffer || []);
  const offerB = type === 'cpu' ? (source.get || []) : (source.guestOffer || []);
  const pickOfferA = type === 'cpu' ? (source.givePicks || []) : (source.hostPicks || []);
  const pickOfferB = type === 'cpu' ? (source.getPicks || []) : (source.guestPicks || []);
  const limitA = financeLimit(teamA, league, sport);
  const limitB = financeLimit(teamB, league, sport);

  return {
    sport,
    teamA,
    teamB,
    offerA,
    offerB,
    pickOfferA,
    pickOfferB,
    teamACap: limitA,
    teamBCap: limitB,
    teamABudget: limitA,
    teamBBudget: limitB,
    nbaMatchingTolerance: league.tradeApronTolerance,
    nbaMatchingBuffer: league.tradeMatchingBuffer,
    commissionerOverride: approvedOverride,
  };
}

module.exports = {
  authorizeFinalization,
  canonicalCpuTeams,
  isCommissioner,
  matchesCpuIdentity,
  resolveCpuIdentity,
  swapAssets,
  validateTeamBindings,
  validationInput,
};
