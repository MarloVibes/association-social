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

const SPORT_TEAM_NAMES = {
  madden: {
    ARI: 'Arizona Cardinals', ATL: 'Atlanta Falcons', BAL: 'Baltimore Ravens', BUF: 'Buffalo Bills',
    CAR: 'Carolina Panthers', CHI: 'Chicago Bears', CIN: 'Cincinnati Bengals', CLE: 'Cleveland Browns',
    DAL: 'Dallas Cowboys', DEN: 'Denver Broncos', DET: 'Detroit Lions', GB: 'Green Bay Packers',
    HOU: 'Houston Texans', IND: 'Indianapolis Colts', JAX: 'Jacksonville Jaguars', KC: 'Kansas City Chiefs',
    LAC: 'Los Angeles Chargers', LAR: 'Los Angeles Rams', LV: 'Las Vegas Raiders', MIA: 'Miami Dolphins',
    MIN: 'Minnesota Vikings', NE: 'New England Patriots', NO: 'New Orleans Saints', NYG: 'New York Giants',
    NYJ: 'New York Jets', PHI: 'Philadelphia Eagles', PIT: 'Pittsburgh Steelers', SEA: 'Seattle Seahawks',
    SF: 'San Francisco 49ers', TB: 'Tampa Bay Buccaneers', TEN: 'Tennessee Titans', WAS: 'Washington Commanders',
  },
  mlb: {
    ARI: 'Arizona Diamondbacks', ATH: 'Athletics', ATL: 'Atlanta Braves', BAL: 'Baltimore Orioles',
    BOS: 'Boston Red Sox', CHC: 'Chicago Cubs', CIN: 'Cincinnati Reds', CLE: 'Cleveland Guardians',
    COL: 'Colorado Rockies', CWS: 'Chicago White Sox', DET: 'Detroit Tigers', HOU: 'Houston Astros',
    KC: 'Kansas City Royals', LAA: 'Los Angeles Angels', LAD: 'Los Angeles Dodgers', MIA: 'Miami Marlins',
    MIL: 'Milwaukee Brewers', MIN: 'Minnesota Twins', NYM: 'New York Mets', NYY: 'New York Yankees',
    PHI: 'Philadelphia Phillies', PIT: 'Pittsburgh Pirates', SD: 'San Diego Padres', SEA: 'Seattle Mariners',
    SF: 'San Francisco Giants', STL: 'St. Louis Cardinals', TB: 'Tampa Bay Rays', TEX: 'Texas Rangers',
    TOR: 'Toronto Blue Jays', WSH: 'Washington Nationals',
  },
};

function sportTeamName(sport, abbreviation) {
  const sportKey = sport === 'nfl' ? 'madden' : sport;
  const abbr = displayTeamAbbr(abbreviation);
  return (SPORT_TEAM_NAMES[sportKey] && SPORT_TEAM_NAMES[sportKey][abbr]) || abbr;
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
    name: sportTeamName(sport, abbreviation),
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function average(values) {
  const finite = values.map(Number).filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : NaN;
}

function normalizeSport(value) {
  const key = String(value || '').trim().toLowerCase();
  if (['madden', 'nfl', 'football'].includes(key)) return 'madden';
  if (['mlb', 'baseball', 'the_show'].includes(key)) return 'mlb';
  return 'nba';
}

function inferredSport(player, fallbackSport = 'nba') {
  const direct = player && (player.sport || player.league_sport || player.franchiseSport);
  if (direct) return normalizeSport(direct);
  const normalizedFallback = normalizeSport(fallbackSport);
  if (normalizedFallback !== 'nba') return normalizedFallback;
  const pos = normalizedPosition(player);
  if (['QB', 'RB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT', 'OL', 'DL', 'DE', 'DT', 'EDGE', 'LB', 'MLB', 'OLB', 'CB', 'FS', 'SS', 'S', 'K', 'P'].includes(pos)) {
    return 'madden';
  }
  if (['SP', 'RP', 'CP', 'P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'OF'].includes(pos)) {
    return 'mlb';
  }
  const keys = Object.keys(player || {});
  if (keys.some((key) => /^(passing|rushing|receiving)_|^(sacks|tackles|interceptions)$/.test(key))) return 'madden';
  if (keys.some((key) => /^(avg|obp|slg|ops|era|whip|hr|rbi|so|saves)$/.test(key))) return 'mlb';
  return normalizedFallback;
}

function skillValue(player, ...aliases) {
  const sources = [
    player && player.hidden,
    player && player.ratings,
    player && player.attribute_model,
  ].filter((source) => source && typeof source === 'object');
  for (const alias of aliases) {
    for (const source of sources) {
      const value = Number(source[alias]);
      if (Number.isFinite(value)) return value;
    }
  }
  return NaN;
}

function ratingAverage(player, aliases) {
  return average(aliases.map((alias) => skillValue(player, alias)));
}

function maddenOverall(player) {
  const pos = normalizedPosition(player);
  const awareness = skillValue(player, 'awareness', 'footballIq', 'basketballIq');
  const technique = skillValue(player, 'technique', 'routeRunning', 'coverage');
  const speed = skillValue(player, 'speed', 'athleticism');
  const strength = skillValue(player, 'strength', 'power');
  const defense = skillValue(player, 'defense', 'coverage', 'tackling');
  const passingYards = numberFrom(player && player.passing_yards, player && player.pass_yards);
  const passingTds = numberFrom(player && player.passing_tds, player && player.pass_tds);
  const rushingYards = numberFrom(player && player.rushing_yards, player && player.rush_yards);
  const receivingYards = numberFrom(player && player.receiving_yards, player && player.rec_yards);
  const receivingTds = numberFrom(player && player.receiving_tds, player && player.rec_tds);
  const sacks = numberFrom(player && player.sacks);
  const tackles = numberFrom(player && player.tackles);
  const interceptions = numberFrom(player && player.interceptions, player && player.ints);

  if (pos === 'QB') {
    const ratings = average([awareness, technique, speed]);
    const passingStats = average([
      Number.isFinite(passingYards) ? clamp(60 + passingYards / 180, 60, 88) : NaN,
      Number.isFinite(passingTds) ? clamp(60 + passingTds * 0.8, 60, 90) : NaN,
    ]);
    const rushBonus = Number.isFinite(rushingYards) ? clamp(rushingYards / 220, 0, 4) : 0;
    const value = average([ratings, passingStats, passingStats]);
    return Number.isFinite(value) ? value + rushBonus : value;
  }
  if (['RB', 'FB'].includes(pos)) {
    return average([
      average([speed, strength, awareness]),
      Number.isFinite(rushingYards) ? clamp(60 + rushingYards / 60, 60, 88) : NaN,
      Number.isFinite(receivingYards) ? clamp(58 + receivingYards / 80, 58, 78) : NaN,
    ]);
  }
  if (['WR', 'TE'].includes(pos)) {
    return average([
      average([speed, technique, awareness]),
      Number.isFinite(receivingYards) ? clamp(60 + receivingYards / 55, 60, 90) : NaN,
      Number.isFinite(receivingTds) ? clamp(60 + receivingTds * 1.8, 60, 88) : NaN,
    ]);
  }
  if (['DE', 'DT', 'DL', 'EDGE', 'LB', 'MLB', 'OLB'].includes(pos)) {
    return average([
      average([defense, strength, technique, awareness]),
      Number.isFinite(sacks) ? clamp(62 + sacks * 2.2, 62, 92) : NaN,
      Number.isFinite(tackles) ? clamp(58 + tackles / 4, 58, 86) : NaN,
    ]);
  }
  if (['CB', 'FS', 'SS', 'S'].includes(pos)) {
    return average([
      average([defense, speed, technique, awareness]),
      Number.isFinite(interceptions) ? clamp(63 + interceptions * 3, 63, 90) : NaN,
      Number.isFinite(tackles) ? clamp(58 + tackles / 5, 58, 82) : NaN,
    ]);
  }
  if (['LT', 'LG', 'C', 'RG', 'RT', 'OL'].includes(pos)) {
    return average([strength, technique, awareness]);
  }
  return ratingAverage(player, ['awareness', 'technique', 'strength', 'speed', 'defense']);
}

function mlbOverall(player) {
  const pos = normalizedPosition(player);
  const isPitcher = ['SP', 'RP', 'CP', 'P'].includes(pos);
  if (isPitcher) {
    const era = numberFrom(player && player.era);
    const whip = numberFrom(player && player.whip);
    const strikeouts = numberFrom(player && player.so, player && player.strikeouts);
    const saves = numberFrom(player && player.saves, player && player.sv);
    return average([
      ratingAverage(player, ['command', 'stamina', 'velocity', 'arm']),
      Number.isFinite(era) ? clamp(96 - era * 5, 58, 93) : NaN,
      Number.isFinite(whip) ? clamp(96 - whip * 14, 58, 92) : NaN,
      Number.isFinite(strikeouts) ? clamp(60 + strikeouts / 7, 60, 91) : NaN,
      Number.isFinite(saves) ? clamp(62 + saves * 0.75, 62, 90) : NaN,
    ]);
  }
  const battingAverage = numberFrom(player && player.avg, player && player.batting_avg);
  const onBase = numberFrom(player && player.obp);
  const slugging = numberFrom(player && player.slg);
  const homers = numberFrom(player && player.hr, player && player.home_runs);
  const rbi = numberFrom(player && player.rbi);
  const steals = numberFrom(player && player.sb, player && player.stolen_bases);
  return average([
    ratingAverage(player, ['contact', 'power', 'fielding', 'speed', 'arm', 'discipline']),
    Number.isFinite(battingAverage) ? clamp(45 + battingAverage * 140, 55, 90) : NaN,
    Number.isFinite(onBase) ? clamp(45 + onBase * 120, 55, 90) : NaN,
    Number.isFinite(slugging) ? clamp(40 + slugging * 95, 55, 92) : NaN,
    Number.isFinite(homers) ? clamp(58 + homers * 0.8, 58, 91) : NaN,
    Number.isFinite(rbi) ? clamp(58 + rbi / 4, 58, 86) : NaN,
    Number.isFinite(steals) ? clamp(58 + steals * 0.6, 58, 84) : NaN,
  ]);
}

function playerOverall(player, fallbackSport = 'nba') {
  const direct = numberFrom(
    player && player.overall,
    player && player.rating,
    player && player.overall_rating,
    player && player.player_overall,
  );
  if (Number.isFinite(direct)) return direct;
  const sport = inferredSport(player, fallbackSport);
  if (sport === 'madden') {
    const value = maddenOverall(player);
    if (Number.isFinite(value)) return value;
  }
  if (sport === 'mlb') {
    const value = mlbOverall(player);
    if (Number.isFinite(value)) return value;
  }
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

function playerPotential(player, sport = 'nba') {
  const direct = numberFrom(player && player.potential, player && player.future_overall);
  return Number.isFinite(direct) ? direct : playerOverall(player, sport);
}

function normalizedPosition(player) {
  return String(player && (player.position || player.pos || player.primary_position) || 'UNK')
    .split(/[/-]/)[0]
    .trim()
    .toUpperCase() || 'UNK';
}

function teamIdentity(team, sport = 'nba') {
  const wins = Number(team && team.wins);
  const losses = Number(team && team.losses);
  if (Number.isFinite(wins) && Number.isFinite(losses) && wins + losses > 0) {
    const pct = wins / (wins + losses);
    if (pct >= 0.58) return 'competing';
    if (pct <= 0.42) return 'rebuilding';
  }
  const roster = Array.isArray(team && team.players) ? team.players : [];
  if (roster.length >= 5) {
    const sorted = [...roster].sort((a, b) => playerOverall(b, sport) - playerOverall(a, sport)).slice(0, 5);
    const topAverage = sorted.reduce((sum, player) => sum + playerOverall(player, sport), 0) / sorted.length;
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

function playerTradeValue(player, identity, needs, sport = 'nba') {
  const overall = playerOverall(player, sport);
  const age = playerAge(player);
  const potential = playerPotential(player, sport);
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

function offeredPlayersValue(players, identity, needs, sport = 'nba') {
  return (players || []).reduce((sum, player) => sum + playerTradeValue(player, identity, needs, sport), 0);
}

function offeredPicksValue(picks, identity) {
  return (picks || []).reduce((sum, pick) => sum + pickTradeValue(pick, identity), 0);
}

function topCpuAssetKeys(cpuTeam, sport = 'nba') {
  return new Set((cpuTeam && cpuTeam.players || [])
    .slice()
    .sort((a, b) => playerTradeValue(b, 'balanced', null, sport) - playerTradeValue(a, 'balanced', null, sport))
    .slice(0, 2)
    .map(playerKey)
    .filter(Boolean));
}

function evaluateCpuTrade({ league, source, proposerTeam, cpuTeam }) {
  const sport = normalizeSport(league && league.sport || 'nba');
  const identity = teamIdentity(cpuTeam || {}, sport);
  const needs = teamNeeds(cpuTeam || {});
  const incomingPlayers = source && source.give || [];
  const outgoingPlayers = source && source.get || [];
  const incomingPicks = source && source.givePicks || [];
  const outgoingPicks = source && source.getPicks || [];
  const incomingValue = offeredPlayersValue(incomingPlayers, identity, needs, sport) + offeredPicksValue(incomingPicks, identity);
  const outgoingValue = offeredPlayersValue(outgoingPlayers, identity, null, sport) + offeredPicksValue(outgoingPicks, identity);
  const protectedKeys = topCpuAssetKeys(cpuTeam || {}, sport);
  const givesStar = outgoingPlayers.some((player) => {
    const key = playerKey(player);
    return key && protectedKeys.has(key) && playerTradeValue(player, 'balanced', null, sport) >= 45;
  });
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
