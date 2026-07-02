'use strict';

const { reconcileTeamRotation } = require('./rotationSync');

function playerKey(player) {
  return String(player.player_id || player.id || player.bref_id || player.full_name || '');
}

function displayTeamAbbr(value) {
  const key = String(value || '').trim().toUpperCase();
  const eraSuffix = key.match(/^([A-Z]{2,3})_\d{4}$/);
  return eraSuffix ? eraSuffix[1] : key;
}

function displayTeamLabel(team, fallback) {
  const raw = String(team && (team.name || team.full_name || team.abbreviation || team.abbr) || fallback || '').trim();
  return raw.replace(/\b[A-Z]{2,3}_\d{4}\b/g, match => displayTeamAbbr(match));
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
  if (type === 'cpu') {
    if (commissioner && ['pending', 'cpu_accepted'].includes(source.status)) return true;
    return source.status === 'cpu_accepted'
      && league.allowCpuTrades === true
      && source.proposerUid === uid
      && source.cpuDecision
      && source.cpuDecision.decision === 'accept';
  }
  if (source.status === 'vote_passed') return commissioner || member || participant;
  if (source.status === 'pending_veto') {
    if (commissioner) return true;
    const deadline = deadlineMillis(source.vetoDeadline);
    return Number.isFinite(deadline) && now >= deadline && participant;
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

function tradeFingerprint(source) {
  const keys = (assets, keyOf) => (assets || []).map(keyOf).filter(Boolean).sort();
  return JSON.stringify({
    hostTeamId: String(source.hostTeamId || ''),
    guestTeamId: String(source.guestTeamId || ''),
    hostOffer: keys(source.hostOffer, playerKey),
    guestOffer: keys(source.guestOffer, playerKey),
    hostPicks: keys(source.hostPicks, pickKey),
    guestPicks: keys(source.guestPicks, pickKey),
  });
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
      ...reconcileTeamRotation(teamA, (teamA.players || []).filter((asset) => !playerKeysA.has(playerKey(asset))).concat(playersB)),
      picks: (teamA.picks || []).filter((asset) => !pickKeysA.has(pickKey(asset))).concat(picksB),
    },
    teamB: {
      ...reconcileTeamRotation(teamB, (teamB.players || []).filter((asset) => !playerKeysB.has(playerKey(asset))).concat(playersA)),
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

function validationInput({
  league, source, teamA, teamB, type, approvedOverride = false,
}) {
  const sport = league.sport === 'nfl' ? 'madden' : (league.sport || 'nba');
  const overrideAuthorized = type === 'room'
    && league.commissionerCanOverride === true
    && approvedOverride === true;
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
    teamALabel: displayTeamLabel(teamA, source.hostTeamName || source.hostTeamId || 'Team A'),
    teamBLabel: displayTeamLabel(teamB, source.guestTeamName || source.guestTeamId || 'Team B'),
    teamACap: limitA,
    teamBCap: limitB,
    teamABudget: limitA,
    teamBBudget: limitB,
    nbaMatchingTolerance: league.tradeApronTolerance,
    nbaMatchingBuffer: league.tradeMatchingBuffer,
    commissionerOverride: overrideAuthorized,
  };
}

function numberFrom(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

function playerOverall(player) {
  const direct = numberFrom(
    player && player.overall,
    player && player.rating,
    player && player.overall_rating,
    player && player.player_overall,
  );
  if (Number.isFinite(direct)) return direct;
  const hidden = player && player.hidden;
  if (!hidden || typeof hidden !== 'object') return 70;
  const values = ['shooting', 'playmaking', 'defense', 'rebounding', 'basketballIq', 'athleticism']
    .map((key) => Number(hidden[key]))
    .filter(Number.isFinite);
  if (values.length === 0) return 70;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function playerAge(player) {
  const direct = numberFrom(player && player.age, player && player.display_age, player && player.season_age);
  if (Number.isFinite(direct)) return direct;
  if (player && player.birth_date) {
    const year = Number(String(player.birth_date).slice(0, 4));
    if (Number.isFinite(year)) return 2026 - year;
  }
  return 27;
}

function playerPotential(player) {
  const direct = numberFrom(player && player.potential, player && player.future_overall);
  return Number.isFinite(direct) ? direct : playerOverall(player);
}

function normalizedPosition(player) {
  return String(player && (player.position || player.pos || player.primary_position) || 'UNK')
    .split(/[/-]/)[0]
    .trim()
    .toUpperCase() || 'UNK';
}

function teamIdentity(team) {
  const wins = Number(team && team.wins);
  const losses = Number(team && team.losses);
  if (Number.isFinite(wins) && Number.isFinite(losses) && wins + losses > 0) {
    const pct = wins / (wins + losses);
    if (pct >= 0.58) return 'competing';
    if (pct <= 0.42) return 'rebuilding';
  }
  const roster = Array.isArray(team && team.players) ? team.players : [];
  if (roster.length >= 5) {
    const sorted = [...roster].sort((a, b) => playerOverall(b) - playerOverall(a)).slice(0, 5);
    const topAverage = sorted.reduce((sum, player) => sum + playerOverall(player), 0) / sorted.length;
    const ageAverage = sorted.reduce((sum, player) => sum + playerAge(player), 0) / sorted.length;
    if (topAverage >= 84 && ageAverage <= 31) return 'competing';
    if (topAverage < 78 || ageAverage > 30) return 'rebuilding';
  }
  return 'balanced';
}

function pickTradeValue(pick, identity) {
  const round = Number(pick && pick.round);
  const base = round === 1 ? 18 : round === 2 ? 7 : 4;
  return identity === 'rebuilding' ? base * 1.25 : identity === 'competing' ? base * 0.8 : base;
}

function teamNeeds(team) {
  const counts = new Map();
  for (const player of team && team.players || []) {
    const pos = normalizedPosition(player);
    counts.set(pos, (counts.get(pos) || 0) + 1);
  }
  return counts;
}

function playerTradeValue(player, identity, needs) {
  const overall = playerOverall(player);
  const age = playerAge(player);
  const potential = playerPotential(player);
  const currentValue = Math.max(1, (overall - 60) * 2);
  const youthBonus = age <= 23 ? 7 : age <= 25 ? 4 : age >= 33 ? -5 : age >= 31 ? -2 : 0;
  const potentialBonus = Math.max(0, potential - overall) * 0.65;
  const needBonus = needs && (needs.get(normalizedPosition(player)) || 0) < 2 ? 1.08 : 1;
  const directionBonus = identity === 'rebuilding'
    ? youthBonus + potentialBonus
    : identity === 'competing'
      ? Math.max(0, overall - 80) * 0.35 + Math.min(2, youthBonus)
      : (youthBonus * 0.5) + (potentialBonus * 0.5);
  return Math.max(1, (currentValue + directionBonus) * needBonus);
}

function offeredPlayersValue(players, identity, needs) {
  return (players || []).reduce((sum, player) => sum + playerTradeValue(player, identity, needs), 0);
}

function offeredPicksValue(picks, identity) {
  return (picks || []).reduce((sum, pick) => sum + pickTradeValue(pick, identity), 0);
}

function topCpuAssetKeys(cpuTeam) {
  return new Set((cpuTeam && cpuTeam.players || [])
    .slice()
    .sort((a, b) => playerTradeValue(b, 'balanced', null) - playerTradeValue(a, 'balanced', null))
    .slice(0, 2)
    .map(playerKey)
    .filter(Boolean));
}

function evaluateCpuTrade({ league, source, proposerTeam, cpuTeam }) {
  const identity = teamIdentity(cpuTeam || {});
  const needs = teamNeeds(cpuTeam || {});
  const incomingPlayers = source && source.give || [];
  const outgoingPlayers = source && source.get || [];
  const incomingPicks = source && source.givePicks || [];
  const outgoingPicks = source && source.getPicks || [];
  const incomingValue = offeredPlayersValue(incomingPlayers, identity, needs) + offeredPicksValue(incomingPicks, identity);
  const outgoingValue = offeredPlayersValue(outgoingPlayers, identity, null) + offeredPicksValue(outgoingPicks, identity);
  const protectedKeys = topCpuAssetKeys(cpuTeam || {});
  const givesStar = outgoingPlayers.some((player) => {
    const key = playerKey(player);
    return key && protectedKeys.has(key) && playerTradeValue(player, 'balanced', null) >= 45;
  });
  const sport = league && league.sport || 'nba';
  const acceptThreshold = identity === 'rebuilding' ? 0.9 : identity === 'competing' ? 1.14 : 1.02;
  const reviewThreshold = identity === 'rebuilding' ? 0.8 : identity === 'competing' ? 1.02 : 0.92;
  const reasons = [];

  if (outgoingValue <= 0 && incomingValue > 0) {
    return {
      decision: 'accept',
      identity,
      incomingValue,
      outgoingValue,
      sport,
      reasons: ['free_value'],
    };
  }

  if (givesStar && incomingValue < outgoingValue * 1.22) {
    return {
      decision: 'decline',
      identity,
      incomingValue,
      outgoingValue,
      sport,
      reasons: ['star_protection'],
    };
  }

  if (incomingValue >= outgoingValue * acceptThreshold) {
    reasons.push(identity === 'rebuilding' ? 'future_value' : 'fair_value');
    return { decision: 'accept', identity, incomingValue, outgoingValue, sport, reasons };
  }
  if (incomingValue >= outgoingValue * reviewThreshold) {
    reasons.push('close_value');
    return { decision: 'review', identity, incomingValue, outgoingValue, sport, reasons };
  }
  reasons.push('insufficient_value');
  return { decision: 'decline', identity, incomingValue, outgoingValue, sport, reasons };
}

module.exports = {
  authorizeFinalization,
  canonicalCpuTeams,
  evaluateCpuTrade,
  isCommissioner,
  matchesCpuIdentity,
  resolveCpuIdentity,
  swapAssets,
  tradeFingerprint,
  validateTeamBindings,
  validationInput,
};
