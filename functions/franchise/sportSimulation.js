'use strict';

const LIVE_REVEAL_DURATION_MS = 15 * 60 * 1000;

function hash(value) {
  let h = 2166136261;
  for (let i = 0; i < String(value).length; i += 1) {
    h ^= String(value).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function normalizeSport(value) {
  const sport = String(value || 'nba').trim().toLowerCase();
  if (sport === 'nfl' || sport === 'madden') return 'madden';
  if (sport === 'mlb') return 'mlb';
  return 'nba';
}

function numberFrom(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function playerId(player, fallback) {
  return String(player && (player.playerId || player.player_id || player.id || player.full_name || player.name) || fallback);
}

function playerName(player, fallback) {
  return String(player && (player.name || player.full_name || player.fullName) || fallback);
}

function positionOf(player) {
  return String(player && player.position || '').trim().toUpperCase();
}

function hiddenSkill(player, key, fallback = 70) {
  const hidden = player && player.hidden && typeof player.hidden === 'object' ? player.hidden : {};
  const ratings = player && player.ratings && typeof player.ratings === 'object' ? player.ratings : {};
  const model = player && player.attribute_model && typeof player.attribute_model === 'object' ? player.attribute_model : {};
  const aliases = {
    footballIq: ['footballIq', 'awareness', 'technique'],
    defense: ['defense', 'awareness', 'strength', 'technique'],
    contact: ['contact', 'batting', 'discipline'],
    power: ['power', 'strength'],
  };
  for (const source of [hidden, ratings, model]) {
    for (const lookup of aliases[key] || [key]) {
      const value = numberFrom(source[lookup], NaN);
      if (Number.isFinite(value)) return value;
    }
  }
  return fallback;
}

function sortByNumeric(players, keys) {
  return [...players].sort((left, right) => {
    for (const key of keys) {
      const diff = numberFrom(right && right[key]) - numberFrom(left && left[key]);
      if (diff) return diff;
    }
    return playerName(left, '').localeCompare(playerName(right, ''));
  });
}

function playersFor(team) {
  return Array.isArray(team && team.players) ? team.players : [];
}

function splitScore(total, periods, seed, minLast = 0) {
  let remaining = Math.max(0, Math.floor(total));
  const scores = Array.from({ length: periods }, () => 0);
  for (let index = 0; index < periods; index += 1) {
    if (index === periods - 1) {
      scores[index] = remaining;
      break;
    }
    const max = Math.max(0, remaining - minLast);
    const share = Math.floor(total / periods);
    const variance = hash(`${seed}:period:${index}`) % Math.max(1, share + 2);
    const value = clamp(Math.floor(share / 2) + variance, 0, max);
    scores[index] = value;
    remaining -= value;
  }
  return scores;
}

function footballStrength(team) {
  const roster = playersFor(team);
  const qbs = roster.filter(player => positionOf(player) === 'QB');
  const backs = roster.filter(player => ['HB', 'RB', 'FB'].includes(positionOf(player)));
  const receivers = roster.filter(player => ['WR', 'TE'].includes(positionOf(player)));
  const linemen = roster.filter(player => ['LT', 'LG', 'C', 'RG', 'RT', 'OL'].includes(positionOf(player)));
  const defenders = roster.filter(player => ['EDGE', 'DE', 'DT', 'NT', 'LB', 'MLB', 'OLB', 'CB', 'S', 'FS', 'SS'].includes(positionOf(player)));
  const qb = sortByNumeric(qbs, ['passing_yards', 'passingYards', 'overall'])[0] || roster[0] || {};
  const passing = 58 + numberFrom(qb.passing_yards || qb.passingYards) / 85 + numberFrom(qb.passing_tds || qb.passingTouchdowns) * 0.45 + hiddenSkill(qb, 'footballIq', 70) * 0.12;
  const topRusher = sortByNumeric(backs, ['rushing_yards', 'rushingYards'])[0] || roster.find(player => positionOf(player) === 'QB') || {};
  const rushScore = 58 + numberFrom(topRusher.rushing_yards || topRusher.rushingYards) / 45 + hiddenSkill(topRusher, 'speed', 68) * 0.1;
  const recScore = 56 + sortByNumeric(receivers, ['receiving_yards', 'receivingYards']).slice(0, 3)
    .reduce((sum, player) => sum + numberFrom(player.receiving_yards || player.receivingYards), 0) / 90;
  const lineScore = linemen.length * 3.2 + linemen.reduce((sum, player) => sum + hiddenSkill(player, 'footballIq', 68), 0) / Math.max(1, linemen.length) * 0.18;
  const defenseScore = 54 + defenders.reduce((sum, player) => sum + numberFrom(player.sacks) * 1.6 + hiddenSkill(player, 'defense', 70) * 0.04, 0);
  return clamp((passing * 0.27) + (rushScore * 0.2) + (recScore * 0.2) + (lineScore * 0.12) + (defenseScore * 0.21), 45, 98);
}

function footballScore({ ownStrength, opponentStrength, seed, home }) {
  const randomness = (hash(`${seed}:${home ? 'home' : 'away'}:football`) % 17) - 8;
  const raw = 22 + (ownStrength - opponentStrength) * 0.22 + randomness;
  return clamp(Math.round(raw), 6, 49);
}

function scoreWithPreferredWinner({ homeScore, awayScore, preferredWinnerTeamId, game, seed, increment = 1, maxScore = 99 }) {
  if (!preferredWinnerTeamId || (preferredWinnerTeamId !== game.homeTeamId && preferredWinnerTeamId !== game.awayTeamId)) {
    return { homeScore, awayScore };
  }
  const margin = increment + (hash(`${seed}:preferred-winner`) % (increment === 3 ? 9 : 4));
  if (preferredWinnerTeamId === game.homeTeamId && homeScore <= awayScore) {
    return { homeScore: Math.min(maxScore, awayScore + margin), awayScore };
  }
  if (preferredWinnerTeamId === game.awayTeamId && awayScore <= homeScore) {
    return { homeScore, awayScore: Math.min(maxScore, homeScore + margin) };
  }
  return { homeScore, awayScore };
}

function footballLine({ player, index, teamScore, seed }) {
  const position = positionOf(player);
  const id = playerId(player, `football-${index}`);
  const name = playerName(player, `Player ${index + 1}`);
  if (position === 'QB') {
    const yards = clamp(Math.round(185 + numberFrom(player.passing_yards || player.passingYards) / 24 + (hash(`${seed}:${id}:pass`) % 75)), 135, 430);
    const passingTouchdowns = clamp(Math.floor(teamScore / 14) + (hash(`${seed}:${id}:td`) % 2), 0, 5);
    const interceptions = hash(`${seed}:${id}:int`) % 5 === 0 ? 1 : 0;
    return { playerId: id, name, position, passingYards: yards, passingTouchdowns, interceptions };
  }
  if (['HB', 'RB', 'FB'].includes(position)) {
    const rushingYards = clamp(Math.round(42 + numberFrom(player.rushing_yards || player.rushingYards) / 22 + (hash(`${seed}:${id}:rush`) % 45)), 12, 185);
    const rushingTouchdowns = teamScore >= 20 && hash(`${seed}:${id}:rush-td`) % 3 === 0 ? 1 : 0;
    return { playerId: id, name, position, rushingYards, rushingTouchdowns, receivingYards: Math.round(numberFrom(player.receiving_yards || player.receivingYards) / 38) };
  }
  if (['WR', 'TE'].includes(position)) {
    const receivingYards = clamp(Math.round(28 + numberFrom(player.receiving_yards || player.receivingYards) / 18 + (hash(`${seed}:${id}:rec`) % 38)), 4, 180);
    const receivingTouchdowns = teamScore >= 17 && hash(`${seed}:${id}:rec-td`) % 4 === 0 ? 1 : 0;
    return { playerId: id, name, position, receptions: clamp(Math.round(receivingYards / 14), 1, 12), receivingYards, receivingTouchdowns };
  }
  if (['EDGE', 'DE', 'DT', 'NT', 'LB', 'MLB', 'OLB', 'CB', 'S', 'FS', 'SS'].includes(position)) {
    const sacks = Number((numberFrom(player.sacks) > 8 ? 1 : 0) + (hash(`${seed}:${id}:sack`) % 4 === 0 ? 1 : 0));
    const interceptions = ['CB', 'S', 'FS', 'SS', 'LB', 'MLB', 'OLB'].includes(position) && hash(`${seed}:${id}:def-int`) % 7 === 0 ? 1 : 0;
    return { playerId: id, name, position, tackles: 2 + (hash(`${seed}:${id}:tackle`) % 7), sacks, interceptions };
  }
  return { playerId: id, name, position, snaps: 1 };
}

function footballBoxScore(team, score, seed) {
  const lines = playersFor(team).slice(0, 16).map((player, index) => footballLine({ player, index, teamScore: score, seed }));
  const totals = lines.reduce((acc, line) => ({
    passingYards: acc.passingYards + numberFrom(line.passingYards),
    rushingYards: acc.rushingYards + numberFrom(line.rushingYards),
    receivingYards: acc.receivingYards + numberFrom(line.receivingYards),
    passingTouchdowns: acc.passingTouchdowns + numberFrom(line.passingTouchdowns),
    rushingTouchdowns: acc.rushingTouchdowns + numberFrom(line.rushingTouchdowns),
    receivingTouchdowns: acc.receivingTouchdowns + numberFrom(line.receivingTouchdowns),
    sacks: acc.sacks + numberFrom(line.sacks),
    interceptions: acc.interceptions + numberFrom(line.interceptions),
  }), { passingYards: 0, rushingYards: 0, receivingYards: 0, passingTouchdowns: 0, rushingTouchdowns: 0, receivingTouchdowns: 0, sacks: 0, interceptions: 0 });
  return { points: score, ...totals, players: lines };
}

function baseballStrength(team) {
  const roster = playersFor(team);
  const pitchers = roster.filter(player => ['SP', 'RP', 'CP', 'P'].includes(positionOf(player)));
  const hitters = roster.filter(player => !['SP', 'RP', 'CP', 'P'].includes(positionOf(player)));
  const hitting = hitters.slice(0, 9).reduce((sum, player) => (
    sum
    + numberFrom(player.hr) * 0.8
    + numberFrom(player.sb) * 0.25
    + numberFrom(String(player.avg || '').replace(/^0?\./, '0.'), 0.245) * 110
    + hiddenSkill(player, 'contact', 68) * 0.06
    + hiddenSkill(player, 'power', 68) * 0.06
  ), 0) / Math.max(1, hitters.slice(0, 9).length);
  const pitching = pitchers.slice(0, 5).reduce((sum, player) => {
    const era = numberFrom(player.era, 4.4);
    return sum + clamp(88 - era * 7 + numberFrom(player.so) / 18 + numberFrom(player.saves) * 0.15, 45, 95);
  }, 0) / Math.max(1, pitchers.slice(0, 5).length);
  return clamp(hitting * 0.58 + pitching * 0.42, 35, 95);
}

function baseballRuns({ ownStrength, opponentStrength, seed, home }) {
  const randomness = (hash(`${seed}:${home ? 'home' : 'away'}:baseball`) % 7) - 3;
  const raw = 4.4 + (ownStrength - opponentStrength) * 0.06 + randomness * 0.7;
  return clamp(Math.round(raw), 0, 14);
}

function strategyScoreBoost(sport, presetIds) {
  const ids = (Array.isArray(presetIds) ? presetIds : []).map(id => String(id || '').toLowerCase());
  if (sport === 'madden') {
    return ids.reduce((total, id) => {
      if (['air_raid', 'pass_first', 'vertical_shots'].includes(id)) return total + 1.5;
      if (['ground_and_pound', 'play_action', 'tempo_spread'].includes(id)) return total + 1;
      if (['blitz_pressure', 'press_man', 'zone_disguise'].includes(id)) return total + 0.75;
      if (['prevent_shell'].includes(id)) return total - 0.5;
      return total;
    }, 0);
  }
  if (sport === 'mlb') {
    return ids.reduce((total, id) => {
      if (['power_lineup', 'ace_day'].includes(id)) return total + 0.85;
      if (['small_ball', 'steal_pressure', 'bullpen_aggressive'].includes(id)) return total + 0.55;
      if (['defensive_shift'].includes(id)) return total + 0.25;
      return total;
    }, 0);
  }
  return 0;
}

function ordinal(value) {
  const suffix = value === 1 ? 'st' : value === 2 ? 'nd' : value === 3 ? 'rd' : 'th';
  return `${value}${suffix}`;
}

function baseballLine({ player, index, teamRuns, seed }) {
  const position = positionOf(player);
  const id = playerId(player, `baseball-${index}`);
  const name = playerName(player, `Player ${index + 1}`);
  if (['SP', 'RP', 'CP', 'P'].includes(position)) {
    const starter = position === 'SP' || index === 0;
    const inningsPitched = starter ? 5 + ((hash(`${seed}:${id}:ip`) % 7) / 3) : 1 + ((hash(`${seed}:${id}:relief-ip`) % 4) / 3);
    const earnedRuns = starter ? clamp(Math.round(teamRuns / 2 + (hash(`${seed}:${id}:er`) % 3) - 1), 0, 7) : clamp(hash(`${seed}:${id}:relief-er`) % 3, 0, 3);
    return {
      playerId: id,
      name,
      position,
      inningsPitched: Number(inningsPitched.toFixed(1)),
      earnedRuns,
      strikeouts: clamp(Math.round(numberFrom(player.so) / 32 + (hash(`${seed}:${id}:k`) % 5)), 0, 12),
      walks: hash(`${seed}:${id}:bb`) % 4,
    };
  }
  const power = numberFrom(player.hr) + hiddenSkill(player, 'power', 68) * 0.08;
  const hits = clamp((hash(`${seed}:${id}:hits`) % 3) + (numberFrom(player.avg, 0.25) >= 0.27 ? 1 : 0), 0, 4);
  const homeRuns = power > 25 && hash(`${seed}:${id}:hr`) % 5 === 0 ? 1 : 0;
  return {
    playerId: id,
    name,
    position,
    atBats: 3 + (hash(`${seed}:${id}:ab`) % 3),
    hits,
    runs: teamRuns > 0 && hash(`${seed}:${id}:run`) % 4 === 0 ? 1 : 0,
    rbi: homeRuns ? 1 + (hash(`${seed}:${id}:rbi`) % 3) : (hits > 1 && hash(`${seed}:${id}:hit-rbi`) % 3 === 0 ? 1 : 0),
    homeRuns,
    stolenBases: numberFrom(player.sb) > 18 && hash(`${seed}:${id}:sb`) % 6 === 0 ? 1 : 0,
  };
}

function baseballBoxScore(team, runs, seed) {
  const ordered = [
    ...playersFor(team).filter(player => !['SP', 'RP', 'CP', 'P'].includes(positionOf(player))).slice(0, 9),
    ...playersFor(team).filter(player => ['SP', 'RP', 'CP', 'P'].includes(positionOf(player))).slice(0, 3),
  ];
  const lines = ordered.map((player, index) => baseballLine({ player, index, teamRuns: runs, seed }));
  const totals = lines.reduce((acc, line) => ({
    runs: acc.runs + numberFrom(line.runs),
    hits: acc.hits + numberFrom(line.hits),
    rbi: acc.rbi + numberFrom(line.rbi),
    homeRuns: acc.homeRuns + numberFrom(line.homeRuns),
    stolenBases: acc.stolenBases + numberFrom(line.stolenBases),
    strikeouts: acc.strikeouts + numberFrom(line.strikeouts),
    earnedRuns: acc.earnedRuns + numberFrom(line.earnedRuns),
  }), { runs: 0, hits: 0, rbi: 0, homeRuns: 0, stolenBases: 0, strikeouts: 0, earnedRuns: 0 });
  return { runs, ...totals, players: lines };
}

function buildGenericTimeline({ sport, game, homeScore, awayScore, periods, boxScore, seed }) {
  const events = [];
  let homeRunning = 0;
  let awayRunning = 0;
  const totalSlots = Math.max(1, periods.length * 3);
  periods.forEach((period, periodIndex) => {
    homeRunning += period.home;
    awayRunning += period.away;
    const periodElapsed = Math.round((periodIndex / periods.length) * LIVE_REVEAL_DURATION_MS);
    const leadTeamId = homeRunning >= awayRunning ? game.homeTeamId : game.awayTeamId;
    const homeLeader = boxScore.home.players.find(player => numberFrom(player.passingYards) || numberFrom(player.hits) || numberFrom(player.inningsPitched)) || boxScore.home.players[0];
    const awayLeader = boxScore.away.players.find(player => numberFrom(player.passingYards) || numberFrom(player.hits) || numberFrom(player.inningsPitched)) || boxScore.away.players[0];
    const leader = leadTeamId === game.homeTeamId ? homeLeader : awayLeader;
    events.push({
      id: `${game.id}-${sport}-${period.period}-swing`,
      period: period.period,
      periodLabel: period.label,
      clockSeconds: sport === 'madden' ? Math.max(0, 900 - (hash(`${seed}:${period.period}:clock`) % 780)) : 0,
      elapsedMs: periodElapsed + Math.round(LIVE_REVEAL_DURATION_MS / totalSlots),
      homeScore: homeRunning,
      awayScore: awayRunning,
      eventType: sport === 'madden' ? 'drive' : 'inning',
      actingTeamId: leadTeamId,
      text: sport === 'madden'
        ? `${leadTeamId} finished a scoring swing in ${period.label}.`
        : `${leadTeamId} found offense in the ${period.label}.`,
      playerId: leader && leader.playerId,
      playerName: leader && leader.name,
      statDeltas: leader ? [{
        playerId: leader.playerId,
        playerName: leader.name,
        teamId: leadTeamId,
        stats: sport === 'madden'
          ? { passingYards: numberFrom(leader.passingYards), rushingYards: numberFrom(leader.rushingYards), receivingYards: numberFrom(leader.receivingYards) }
          : { hits: numberFrom(leader.hits), homeRuns: numberFrom(leader.homeRuns), strikeouts: numberFrom(leader.strikeouts) },
      }] : [],
      x: 50,
      y: 50,
      momentum: homeRunning - awayRunning,
      tags: [sport, period.label.toLowerCase()],
    });
    events.push({
      id: `${game.id}-${sport}-${period.period}-end`,
      period: period.period,
      periodLabel: period.label,
      clockSeconds: 0,
      elapsedMs: periodElapsed + Math.round((LIVE_REVEAL_DURATION_MS / totalSlots) * 2),
      homeScore: homeRunning,
      awayScore: awayRunning,
      eventType: 'period_end',
      actingTeamId: null,
      text: `${period.label}: ${game.awayTeamId} ${awayRunning} - ${game.homeTeamId} ${homeRunning}`,
      statDeltas: [],
      x: 50,
      y: 50,
      momentum: homeRunning - awayRunning,
      tags: ['period_end', sport],
    });
  });
  events.push({
    id: `${game.id}-${sport}-final`,
    period: periods[periods.length - 1].period,
    periodLabel: periods[periods.length - 1].label,
    clockSeconds: 0,
    elapsedMs: LIVE_REVEAL_DURATION_MS,
    homeScore,
    awayScore,
    eventType: 'final_buzzer',
    actingTeamId: homeScore > awayScore ? game.homeTeamId : game.awayTeamId,
    text: `Final: ${game.awayTeamId} ${awayScore} - ${game.homeTeamId} ${homeScore}`,
    statDeltas: [],
    x: 50,
    y: 50,
    momentum: homeScore - awayScore,
    tags: ['final', sport],
  });
  return {
    version: 3,
    sport,
    gameId: game.id,
    homeTeamId: game.homeTeamId,
    awayTeamId: game.awayTeamId,
    homeScore,
    awayScore,
    revealDurationMs: LIVE_REVEAL_DURATION_MS,
    periods,
    events,
  };
}

function sportStory({ sport, game, homeScore, awayScore, boxScore }) {
  const winner = homeScore > awayScore ? game.homeTeamId : game.awayTeamId;
  const loser = winner === game.homeTeamId ? game.awayTeamId : game.homeTeamId;
  const winnerScore = winner === game.homeTeamId ? homeScore : awayScore;
  const loserScore = winner === game.homeTeamId ? awayScore : homeScore;
  const winnerBox = winner === game.homeTeamId ? boxScore.home : boxScore.away;
  const leader = [...winnerBox.players].sort((left, right) => (
    sport === 'madden'
      ? numberFrom(right.passingYards) + numberFrom(right.rushingYards) + numberFrom(right.receivingYards) - numberFrom(left.passingYards) - numberFrom(left.rushingYards) - numberFrom(left.receivingYards)
      : numberFrom(right.hits) + numberFrom(right.homeRuns) * 2 + numberFrom(right.strikeouts) - numberFrom(left.hits) - numberFrom(left.homeRuns) * 2 - numberFrom(left.strikeouts)
  ))[0];
  const leaderLine = leader
    ? sport === 'madden'
      ? `${leader.name} shaped the result with ${numberFrom(leader.passingYards) || numberFrom(leader.rushingYards) || numberFrom(leader.receivingYards)} key yards.`
      : `${leader.name} led the card with ${numberFrom(leader.hits) || numberFrom(leader.strikeouts)} key ${numberFrom(leader.strikeouts) ? 'strikeouts' : 'hits'}.`
    : '';
  return [`${winner} beat ${loser}, ${winnerScore}-${loserScore}.`, leaderLine].filter(Boolean).join(' ');
}

function simulateSportGame({ sport, game, homeTeam, awayTeam, seed, preferredWinnerTeamId, homePresetIds = [], awayPresetIds = [] }) {
  const normalizedSport = normalizeSport(sport || game && (game.sport || game.leagueSport));
  if (normalizedSport === 'madden') {
    const homeStrength = footballStrength(homeTeam);
    const awayStrength = footballStrength(awayTeam);
    let homeScore = footballScore({ ownStrength: homeStrength, opponentStrength: awayStrength, seed, home: true }) + Math.round(strategyScoreBoost(normalizedSport, homePresetIds));
    let awayScore = footballScore({ ownStrength: awayStrength, opponentStrength: homeStrength, seed, home: false }) + Math.round(strategyScoreBoost(normalizedSport, awayPresetIds));
    homeScore = clamp(homeScore, 6, 49);
    awayScore = clamp(awayScore, 6, 49);
    if (homeScore === awayScore) homeScore += 3;
    ({ homeScore, awayScore } = scoreWithPreferredWinner({
      homeScore,
      awayScore,
      preferredWinnerTeamId,
      game,
      seed,
      increment: 3,
      maxScore: 59,
    }));
    const homePeriods = splitScore(homeScore, 4, `${seed}:home-football`);
    const awayPeriods = splitScore(awayScore, 4, `${seed}:away-football`);
    const periods = homePeriods.map((home, index) => ({ period: index + 1, label: `Q${index + 1}`, home, away: awayPeriods[index] }));
    const quarters = periods.map(period => ({ quarter: period.period, home: period.home, away: period.away }));
    const boxScore = {
      home: footballBoxScore(homeTeam, homeScore, `${seed}:home`),
      away: footballBoxScore(awayTeam, awayScore, `${seed}:away`),
    };
    return {
      sport: normalizedSport,
      homeScore,
      awayScore,
      quarters,
      boxScore,
      liveTimeline: buildGenericTimeline({ sport: normalizedSport, game, homeScore, awayScore, periods, boxScore, seed }),
      story: sportStory({ sport: normalizedSport, game, homeScore, awayScore, boxScore }),
    };
  }

  if (normalizedSport === 'mlb') {
    const homeStrength = baseballStrength(homeTeam);
    const awayStrength = baseballStrength(awayTeam);
    let homeScore = baseballRuns({ ownStrength: homeStrength, opponentStrength: awayStrength, seed, home: true }) + Math.round(strategyScoreBoost(normalizedSport, homePresetIds));
    let awayScore = baseballRuns({ ownStrength: awayStrength, opponentStrength: homeStrength, seed, home: false }) + Math.round(strategyScoreBoost(normalizedSport, awayPresetIds));
    homeScore = clamp(homeScore, 0, 14);
    awayScore = clamp(awayScore, 0, 14);
    if (homeScore === awayScore) homeScore += 1;
    ({ homeScore, awayScore } = scoreWithPreferredWinner({
      homeScore,
      awayScore,
      preferredWinnerTeamId,
      game,
      seed,
      increment: 1,
      maxScore: 18,
    }));
    const homeInnings = splitScore(homeScore, 9, `${seed}:home-baseball`);
    const awayInnings = splitScore(awayScore, 9, `${seed}:away-baseball`);
    const innings = homeInnings.map((home, index) => ({ inning: index + 1, period: index + 1, label: ordinal(index + 1), home, away: awayInnings[index] }));
    const periods = innings.map(inning => ({ period: inning.period, label: inning.label, home: inning.home, away: inning.away }));
    const boxScore = {
      home: baseballBoxScore(homeTeam, homeScore, `${seed}:home`),
      away: baseballBoxScore(awayTeam, awayScore, `${seed}:away`),
    };
    return {
      sport: normalizedSport,
      homeScore,
      awayScore,
      innings,
      periods,
      boxScore,
      liveTimeline: buildGenericTimeline({ sport: normalizedSport, game, homeScore, awayScore, periods, boxScore, seed }),
      story: sportStory({ sport: normalizedSport, game, homeScore, awayScore, boxScore }),
    };
  }

  return null;
}

module.exports = {
  LIVE_REVEAL_DURATION_MS,
  normalizeSport,
  simulateSportGame,
};
