'use strict';

const REGULATION_PERIOD_SECONDS = 720;
const OVERTIME_PERIOD_SECONDS = 300;
const LIVE_MODE_SPEED_MULTIPLIER = 3;
const POSITION_ORDER = ['PG', 'SG', 'SF', 'PF', 'C'];

function buildPossessionTimeline(input) {
  const attempts = input && input.preferredWinnerTeamId ? 12 : 1;
  let best = null;
  let bestMargin = Number.NEGATIVE_INFINITY;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const timeline = buildPossessionTimelineAttempt({
      ...input,
      seed: `${input.seed || input.gameId || 'game'}:${attempt}`,
      winnerBias: input.preferredWinnerTeamId ? Math.min(75, 20 + attempt * 5) : 0,
    });
    const margin = preferredWinnerMargin(timeline, input.preferredWinnerTeamId);
    if (!best || margin > bestMargin || winnerMatches(timeline, input.preferredWinnerTeamId)) {
      best = timeline;
      bestMargin = margin;
    }
    if (winnerMatches(timeline, input.preferredWinnerTeamId)) break;
  }
  return best;
}

function buildPossessionTimelineAttempt(input) {
  const rng = createRng(hashString(String(input.seed || input.gameId || 'game')));
  const home = buildTeamContext(input.homeTeamId, input.homeTeam, 'home', input);
  const away = buildTeamContext(input.awayTeamId, input.awayTeam, 'away', input);
  const events = [];
  const periods = [];
  let homeScore = 0;
  let awayScore = 0;
  let offense = rng() >= 0.5 ? 'home' : 'away';
  let period = 1;

  while (period <= 4 || homeScore === awayScore) {
    const periodSeconds = period > 4 ? OVERTIME_PERIOD_SECONDS : REGULATION_PERIOD_SECONDS;
    let clockSeconds = periodSeconds;
    let periodHome = 0;
    let periodAway = 0;
    while (clockSeconds > 0) {
      const possession = resolvePossession({
        rng,
        input,
        period,
        clockSeconds,
        offense,
        home,
        away,
        homeScore,
        awayScore,
      });
      clockSeconds = Math.max(0, clockSeconds - possession.clockUsed);
      homeScore += possession.homePoints;
      awayScore += possession.awayPoints;
      periodHome += possession.homePoints;
      periodAway += possession.awayPoints;
      events.push(eventFromPossession({
        input,
        period,
        clockSeconds,
        possession,
        elapsedIndex: events.length,
        homeScore,
        awayScore,
        home,
        away,
        periodCount: period,
      }));
      offense = possession.nextOffense;
    }
    periods.push({ period, label: periodLabel(period), home: periodHome, away: periodAway });
    events.push(periodEndEvent({ input, period, elapsedIndex: events.length, homeScore, awayScore, home, away }));
    period += 1;
  }

  const finalPeriod = periods[periods.length - 1] || { period: 4, label: 'Q4' };
  events.push(withoutUndefined({
    id: `${input.gameId}-final`,
    period: finalPeriod.period,
    periodLabel: finalPeriod.label,
    clockSeconds: 0,
    elapsedMs: elapsedMsForClock(finalPeriod.period, 0),
    homeScore,
    awayScore,
    eventType: 'final_buzzer',
    actingTeamId: homeScore > awayScore ? input.homeTeamId : input.awayTeamId,
    text: `Final: ${displayTeam(away)} ${awayScore} - ${displayTeam(home)} ${homeScore}`,
    x: 50,
    y: 50,
    momentum: homeScore - awayScore,
    tags: ['final'],
    currentLineups: {
      home: home.starters.map(player => player.playerId),
      away: away.starters.map(player => player.playerId),
    },
  }));

  return withoutUndefined({
    version: 2,
    gameId: input.gameId,
    homeTeamId: input.homeTeamId,
    awayTeamId: input.awayTeamId,
    homeScore,
    awayScore,
    revealDurationMs: elapsedMsForClock(finalPeriod.period, 0),
    speedMultiplier: LIVE_MODE_SPEED_MULTIPLIER,
    periods,
    starterMatchups: buildStarterMatchups(home, away),
    benchPreview: buildBenchPreview(home, away, events),
    events,
  });
}

function resolvePossession(ctx) {
  const offenseTeam = ctx.offense === 'home' ? ctx.home : ctx.away;
  const defenseTeam = ctx.offense === 'home' ? ctx.away : ctx.home;
  const shooter = weightedPick(offenseTeam.rotation, player => player.usage, ctx.rng);
  const assister = weightedPick(offenseTeam.rotation.filter(player => player.playerId !== shooter.playerId), player => player.assistWeight, ctx.rng);
  const defender = weightedPick(defenseTeam.rotation, player => player.defense + player.stealSkill * 0.35, ctx.rng);
  const winnerBoost = offenseTeam.teamId === ctx.input.preferredWinnerTeamId ? Number(ctx.input.winnerBias || 0) : 0;
  const defenseBoost = defenseTeam.teamId === ctx.input.preferredWinnerTeamId ? Number(ctx.input.winnerBias || 0) * 0.35 : 0;
  const roll = ctx.rng();
  const clockUsed = 7 + Math.floor(ctx.rng() * 16);
  const actingTeamId = offenseTeam.teamId;
  const normalNextOffense = ctx.offense === 'home' ? 'away' : 'home';
  const deltas = [];

  if (roll < turnoverChance(shooter, defender, offenseTeam, defenseTeam, winnerBoost, ctx.rng)) {
    const stolen = ctx.rng() < clamp((defender.stealSkill + defender.defense - shooter.playmaking) / 130 + 0.52, 0.35, 0.82);
    deltas.push(deltaFor(shooter, { turnovers: 1 }));
    if (stolen) deltas.push(deltaFor(defender, { steals: 1 }));
    return withoutUndefined({
      eventType: 'turnover',
      actingTeamId,
      player: shooter,
      text: stolen
        ? `${shortName(shooter.name)} lost ball turnover. Steal: ${shortName(defender.name)}.`
        : `${shortName(shooter.name)} committed a turnover.`,
      statDeltas: deltas,
      clockUsed,
      homePoints: 0,
      awayPoints: 0,
      nextOffense: normalNextOffense,
      x: ctx.offense === 'home' ? 70 : 30,
      y: 45,
    });
  }

  const shotValue = chooseShotValue(shooter, offenseTeam, ctx.rng);
  const shotDifficulty = shotValue === 3 ? 10 : shooter.position === 'C' || shooter.position === 'PF' ? -4 : 0;
  const efficiencyLift = (shooter.sourceEfficiency - 72) / 410;
  const makeChance = clamp(
    0.53
      + ((shooter.scoring * 0.8 + shooter.iq * 0.2 + offenseTeam.offenseBoost + winnerBoost + shooter.nightMakeBoost) - (defender.defense * 0.65 + defenseTeam.defenseBoost + defenseBoost) - shotDifficulty) / 330
      + efficiencyLift,
    shotValue === 3 ? 0.28 : 0.36,
    shotValue === 3 ? 0.49 : 0.66,
  );

  const foulThreshold = shotValue === 3
    ? 0.08 + shooter.foulDraw / 1000 + shooter.sourceFreeThrowPressure / 2200
    : 0.13 + shooter.foulDraw / 360 + shooter.sourceFreeThrowPressure / 1350;
  if (roll < foulThreshold) {
    if (shotValue === 3) {
      shooter.threePointAttemptsUsed = Math.max(0, Number(shooter.threePointAttemptsUsed || 0) - 1);
      shooter.shotChoicesUsed = Math.max(0, Number(shooter.shotChoicesUsed || 0) - 1);
    }
    const freeThrows = shotValue === 3 && ctx.rng() < 0.07 ? 3 : 2;
    const made = Array.from({ length: freeThrows }).filter(() => ctx.rng() < clamp(shooter.freeThrow / 110, 0.56, 0.93)).length;
    deltas.push(deltaFor(shooter, {
      points: made,
      freeThrowsMade: made,
      freeThrowsAttempted: freeThrows,
    }));
    const rebounder = made < freeThrows ? weightedPick([...offenseTeam.rotation, ...defenseTeam.rotation], player => (
      reboundWeight(player) * (player.side === ctx.offense ? 0.28 : 0.72)
    ), ctx.rng) : null;
    if (rebounder) deltas.push(deltaFor(rebounder, {
      rebounds: 1,
      offensiveRebounds: rebounder.side === ctx.offense ? 1 : 0,
      defensiveRebounds: rebounder.side === ctx.offense ? 0 : 1,
    }));
    return withoutUndefined({
      eventType: 'free_throw_trip',
      actingTeamId,
      player: shooter,
      points: made,
      text: rebounder
        ? `${shortName(shooter.name)} drew a shooting foul and made ${made} of ${freeThrows}. Rebound: ${shortName(rebounder.name)}.`
        : `${shortName(shooter.name)} drew a shooting foul and made ${made} of ${freeThrows}.`,
      statDeltas: deltas,
      clockUsed,
      homePoints: ctx.offense === 'home' ? made : 0,
      awayPoints: ctx.offense === 'away' ? made : 0,
      nextOffense: rebounder && rebounder.side === ctx.offense ? ctx.offense : normalNextOffense,
      x: 50,
      y: 22,
    });
  }

  if (roll < makeChance) {
    const assisted = shotValue > 1 && ctx.rng() < clamp((assister.playmaking + assister.iq * 0.25) / 140, 0.25, 0.78);
    deltas.push(deltaFor(shooter, {
      points: shotValue,
      fieldGoalsMade: 1,
      fieldGoalsAttempted: 1,
      threePointersMade: shotValue === 3 ? 1 : 0,
      threePointersAttempted: shotValue === 3 ? 1 : 0,
    }));
    if (assisted) deltas.push(deltaFor(assister, { assists: 1 }));
    return withoutUndefined({
      eventType: 'score',
      actingTeamId,
      player: shooter,
      points: shotValue,
      text: scoreText(shooter, shotValue, assisted ? assister : null),
      statDeltas: deltas,
      clockUsed,
      homePoints: ctx.offense === 'home' ? shotValue : 0,
      awayPoints: ctx.offense === 'away' ? shotValue : 0,
      nextOffense: normalNextOffense,
      x: ctx.offense === 'home' ? 75 : 25,
      y: 36 + Math.floor(ctx.rng() * 28),
    });
  }

  const blocked = ctx.rng() < clamp((defender.blocking - shooter.scoring + 30) / 260, 0.03, 0.16);
  const rebounder = weightedPick([...offenseTeam.rotation, ...defenseTeam.rotation], player => (
    reboundWeight(player) * (player.side === ctx.offense ? 0.3 : 0.7)
  ), ctx.rng);
  deltas.push(deltaFor(shooter, {
    fieldGoalsAttempted: 1,
    threePointersAttempted: shotValue === 3 ? 1 : 0,
  }));
  if (blocked) deltas.push(deltaFor(defender, { blocks: 1 }));
  deltas.push(deltaFor(rebounder, {
    rebounds: 1,
    offensiveRebounds: rebounder.side === ctx.offense ? 1 : 0,
    defensiveRebounds: rebounder.side === ctx.offense ? 0 : 1,
  }));
  return withoutUndefined({
    eventType: 'miss',
    actingTeamId,
    player: shooter,
    text: `${shortName(shooter.name)} ${blocked ? `had a ${shotValue === 3 ? '3PT jumper' : 'shot'} blocked by ${shortName(defender.name)}` : `missed ${shotValue === 3 ? '3PT jumper' : shotValue === 2 ? 'field goal' : 'shot'}`}. Rebound: ${shortName(rebounder.name)}.`,
    statDeltas: deltas,
    clockUsed,
    homePoints: 0,
    awayPoints: 0,
    nextOffense: rebounder.side === ctx.offense ? ctx.offense : normalNextOffense,
    x: ctx.offense === 'home' ? 76 : 24,
    y: 36 + Math.floor(ctx.rng() * 28),
  });
}

function buildTeamContext(teamId, team, side, input) {
  const players = (Array.isArray(team && team.players) ? team.players : [])
    .map((player, index) => normalizePlayer(player, teamId, side, index))
    .sort((left, right) => right.rotationValue - left.rotationValue || left.index - right.index);
  const selected = players.slice(0, Math.max(5, Math.min(10, players.length)));
  const starters = selectStarters(selected);
  const minutes = normalizeMinutes(selected);
  const rotation = selected.map((player, index) => {
    const night = scoringNightContext(player, minutes[index], `${input && (input.seed || input.gameId) || 'game'}:${teamId}`);
    const sourceThreeAttemptCap = sourceThreeAttemptBudget(player, minutes[index], `${input && (input.seed || input.gameId) || 'game'}:${teamId}`);
    const efficiencyUsageMultiplier = clamp(0.72 + player.sourceEfficiency / 150, 0.72, 1.34);
    const sourceUsageSignal = player.sourceScoringRole / 72;
    const productionUsageMultiplier = clamp(0.55 + Math.pow(sourceUsageSignal, 1.7) * 0.75, 0.7, 2);
    const scoringRole = player.scoring * 0.42 + player.sourceScoringRole * 0.85;
    return {
      ...player,
      ...night,
      minutes: minutes[index],
      assistWeight: player.assistWeight * (night.nightAssistMultiplier || 1),
      usage: Math.max(
        1,
        Math.pow(minutes[index], 0.92)
          * (scoringRole + player.playmaking * 0.12 + player.iq * 0.06)
          * night.nightUsageMultiplier
          * efficiencyUsageMultiplier
          * productionUsageMultiplier
          / 100,
      ),
      starter: starters.some(starter => starter.playerId === player.playerId),
      sourceThreeAttemptCap,
      threePointAttemptsUsed: 0,
      shotChoicesUsed: 0,
    };
  });
  return {
    teamId,
    side,
    name: team && (team.name || team.displayName || team.abbreviation) || teamId,
    abbreviation: team && (team.abbreviation || team.abbr || team.teamId) || teamId,
    rotation,
    starters: starters.map(starter => rotation.find(player => player.playerId === starter.playerId) || starter),
    offenseBoost: coachingBoost(side === 'home' ? input.homeCoachingPresetIds : input.awayCoachingPresetIds, 'offense'),
    defenseBoost: coachingBoost(side === 'home' ? input.homeCoachingPresetIds : input.awayCoachingPresetIds, 'defense'),
  };
}

function normalizePlayer(player, teamId, side, index) {
  const hidden = player && player.hidden || {};
  const sourceThreeAttempts = Number(player && player.baselineRatingProfile && player.baselineRatingProfile.source_stat_line && player.baselineRatingProfile.source_stat_line.threePointAttemptsPerGame);
  const sourceEfficiency = sourceEfficiencyRating(player);
  const sourceScoringRole = sourceProductionRating(player, 'points');
  const sourceAssistRole = sourceProductionRating(player, 'assists');
  const sourceReboundRole = sourceProductionRating(player, 'rebounds');
  const hasSourceAssistProof = sourceStatOrNull(player, 'assistsPerGame') != null
    || sourceStatOrNull(player, 'assistPct') != null;
  const sourceFreeThrowPressure = clamp(sourceStat(player, 'freeThrowAttemptsPerGame', 4) * 11, 24, 99);
  const sourceTurnoverPct = sourceStat(player, 'turnoverPct', 12.5);
  const position = normalizePosition(player && player.position, index);
  const shooting = skill(player, 'shooting', 72);
  const closeShot = skill(player, 'closeShot', shooting);
  const dunking = skill(player, 'dunking', skill(player, 'athleticism', 70));
  const finishing = categoryRating(player, 'finishing', (closeShot + dunking + skill(player, 'postOffense', shooting)) / 3);
  const threePoint = categoryRating(player, 'threePoint', skill(player, 'threePoint', shooting));
  const midRange = categoryRating(player, 'midRange', skill(player, 'midRange', shooting));
  const playmaking = Math.max(categoryRating(player, 'playmaking', skill(player, 'playmaking', 70)), skill(player, 'passing', 70));
  const defense = skill(player, 'defense', 70);
  const iq = categoryRating(player, 'basketballIq', Math.max(skill(player, 'basketballIq', 72), skill(player, 'offenseIq', 72), skill(player, 'shotIq', 72)));
  const perimeterDefense = categoryRating(player, 'perimeterDefense', skill(player, 'perimeterDefense', defense));
  const interiorDefense = categoryRating(player, 'interiorDefense', skill(player, 'postDefense', defense));
  const rebounding = categoryRating(player, 'rebounding', skill(player, 'rebounding', position === 'C' ? 78 : 62));
  const speed = skill(player, 'speed', position === 'C' ? 62 : 76);
  const paintAttack = tendency(player, 'paintAttack', 58);
  const rimFinish = tendency(player, 'rimFinishFrequency', 55);
  const threePointFrequency = tendency(player, 'threePointFrequency', 58);
  const catchAndShoot = tendency(player, 'catchAndShootFrequency', 55);
  const drawFoulPressure = tendency(player, 'drawFoulPressure', (finishing + paintAttack + skill(player, 'freeThrow', shooting) + sourceFreeThrowPressure) / 4);
  const defensivePlaymaking = tendency(player, 'defensivePlaymaking', defense);
  const reboundCrash = tendency(player, 'reboundCrash', 55);
  const passFirst = tendency(player, 'passFirst', 50);
  const pickAndRollBallHandler = tendency(player, 'pickAndRollBallHandler', 45);
  const bigWithoutCreationProof = (position === 'PF' || position === 'C') && !hasSourceAssistProof && playmaking < 68;
  return {
    raw: player,
    index,
    side,
    teamId,
    playerId: String(player && (player.playerId || player.player_id || player.id || player.full_name || player.name) || `${teamId}-${index}`),
    name: String(player && (player.full_name || player.name || player.playerName) || `${teamId} Player ${index + 1}`),
    position,
    scoring: clamp(threePoint * 0.22 + midRange * 0.16 + finishing * 0.26 + closeShot * 0.12 + dunking * 0.1 + shooting * 0.08 + paintAttack * 0.03 + threePointFrequency * 0.03, 35, 99),
    finishing,
    threePoint,
    midRange,
    paintAttack,
    rimFinish,
    threePointFrequency,
    catchAndShoot,
    drawFoulPressure,
    reboundCrash,
    playmaking,
    assistWeight: (
      playmaking * (position === 'PG' ? 3.05 : position === 'SG' ? 1.12 : position === 'SF' ? 0.88 : position === 'PF' ? 0.48 : 0.34)
      + passFirst * 0.7
      + pickAndRollBallHandler * 0.35
      + sourceAssistRole * (hasSourceAssistProof ? 1.15 : 0.35)
    ) * clamp(0.5 + Math.pow(sourceAssistRole / 72, 2), 0.45, 2.05) * (bigWithoutCreationProof ? 0.58 : 1),
    defense: clamp(Math.max(defense, perimeterDefense, interiorDefense) * 0.75 + iq * 0.25, 35, 99),
    stealSkill: clamp(Math.max(skill(player, 'stealsSkill', defense), skill(player, 'steal', defense), defensivePlaymaking) * 0.8 + speed * 0.2, 35, 99),
    blocking: clamp(Math.max(skill(player, 'blocking', defense), skill(player, 'block', defense), interiorDefense) * 0.82 + skill(player, 'vertical', 70) * 0.18, 25, 99),
    rebounding: clamp(rebounding * 0.58 + skill(player, 'strength', 70) * 0.11 + skill(player, 'vertical', 70) * 0.08 + reboundCrash * 0.06 + sourceReboundRole * 0.28, 25, 99),
    freeThrow: skill(player, 'freeThrow', shooting),
    foulDraw: clamp(drawFoulPressure * 0.34 + finishing * 0.22 + paintAttack * 0.16 + speed * 0.09 + skill(player, 'strength', 70) * 0.08 + sourceFreeThrowPressure * 0.11, 25, 99),
    iq,
    sourceEfficiency,
    sourceScoringRole,
    sourceAssistRole,
    sourceReboundRole,
    sourceTurnoverPct,
    sourceFreeThrowPressure,
    rotationValue: Number(player && (player.minutes || player.rotationMinutes)) || (
      clamp(shooting * 0.2 + playmaking * 0.2 + Math.max(perimeterDefense, interiorDefense) * 0.22 + rebounding * 0.13 + iq * 0.1 + Math.max(threePoint, finishing) * 0.15, 1, 99)
    ),
    baseMinutes: Number(player && (player.minutes || player.rotationMinutes)) || (index < 5 ? 30 : 16),
    sourceThreeAttemptsPerGame: Number.isFinite(sourceThreeAttempts) ? Math.max(0, sourceThreeAttempts) : null,
  };

  function skill(source, key, fallback) {
    const value = Number(source && source.hidden && source.hidden[key]);
    if (Number.isFinite(value)) return value;
    const direct = Number(source && source[key]);
    if (Number.isFinite(direct)) return direct;
    const hiddenValue = Number(hidden[key]);
    return Number.isFinite(hiddenValue) ? hiddenValue : fallback;
  }
}

function sourceThreeAttemptBudget(player, minutes, seed) {
  if (!player) return null;
  const position = String(player.position || '').toUpperCase();
  const isBig = position === 'PF' || position === 'C' || position.includes('C');
  if (player.sourceThreeAttemptsPerGame == null) {
    if (isBig && player.threePoint <= 50 && player.threePointFrequency <= 42) return 0;
    return null;
  }
  const sourceAttempts = Number(player && player.sourceThreeAttemptsPerGame);
  if (!Number.isFinite(sourceAttempts)) return null;
  if (sourceAttempts <= 0.15 && player.threePoint < 60) return 0;
  if (player.threePoint < 50 && sourceAttempts <= 0.5) return 0;
  const minuteScale = clamp(Number(minutes || 0) / 36, 0.25, 1.45);
  return Math.max(0, Math.round(sourceAttempts * minuteScale + (hashString(`${seed}:${player.playerId}:three-cap`) % 6 === 0 ? 1 : 0)));
}

function categoryRating(player, key, fallback) {
  const entry = player && player.category_skill_grades && player.category_skill_grades[key];
  const value = typeof entry === 'number' ? entry : entry && entry.rating;
  return clamp(Number.isFinite(Number(value)) ? Number(value) : fallback, 0, 100);
}

function tendency(player, key, fallback) {
  const value = Number(player && player.tendencies && player.tendencies[key]);
  return clamp(Number.isFinite(value) ? value : fallback, 0, 100);
}

function sourceStat(player, key, fallback) {
  const value = Number(player && player.baselineRatingProfile && player.baselineRatingProfile.source_stat_line && player.baselineRatingProfile.source_stat_line[key]);
  return Number.isFinite(value) ? value : fallback;
}

function sourceStatOrNull(player, key) {
  const value = Number(player && player.baselineRatingProfile && player.baselineRatingProfile.source_stat_line && player.baselineRatingProfile.source_stat_line[key]);
  return Number.isFinite(value) ? value : null;
}

function pct(value, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return value > 1 ? value / 100 : value;
}

function sourceEfficiencyRating(player) {
  const trueShooting = pct(sourceStat(player, 'trueShootingPct', 0.555), 0.555);
  const effectiveFieldGoal = pct(sourceStat(player, 'effectiveFieldGoalPct', 0.51), 0.51);
  const turnoverPct = sourceStat(player, 'turnoverPct', 12.5);
  return clamp(
    72
      + ((trueShooting - 0.555) * 115)
      + ((effectiveFieldGoal - 0.51) * 85)
      - ((turnoverPct - 12.5) * 0.7),
    42,
    98,
  );
}

function sourceProductionRating(player, kind) {
  if (kind === 'points') {
    const pointsPerGame = sourceStatOrNull(player, 'pointsPerGame');
    const usagePct = sourceStatOrNull(player, 'usagePct');
    if (pointsPerGame == null && usagePct == null) return 52;
    return clamp(42 + (pointsPerGame ?? 12) * 1.35 + ((usagePct ?? 19) - 19) * 0.75, 35, 100);
  }
  if (kind === 'assists') {
    const assistsPerGame = sourceStatOrNull(player, 'assistsPerGame');
    const assistPct = sourceStatOrNull(player, 'assistPct');
    if (assistsPerGame == null && assistPct == null) return 35;
    return clamp(42 + (assistsPerGame ?? 2.2) * 3.6 + ((assistPct ?? 14) - 14) * 0.7, 35, 100);
  }
  const reboundsPerGame = sourceStatOrNull(player, 'reboundsPerGame');
  if (reboundsPerGame == null) return 60;
  return clamp(42 + reboundsPerGame * 3.4, 35, 100);
}

function selectStarters(players) {
  const remaining = [...players];
  return POSITION_ORDER.map((position) => {
    const index = Math.max(0, remaining.findIndex(player => player.position === position));
    if (index >= 0) return remaining.splice(index, 1)[0];
    return remaining.shift();
  }).filter(Boolean);
}

function normalizeMinutes(players) {
  const weights = players.map((player, index) => Math.max(1, Number(player.baseMinutes || (index < 5 ? 30 : 15))));
  const total = weights.reduce((sum, value) => sum + value, 0) || 1;
  const minutes = weights.map(value => Math.max(4, Math.round(value / total * 240)));
  let diff = 240 - minutes.reduce((sum, value) => sum + value, 0);
  let cursor = 0;
  while (diff !== 0 && minutes.length) {
    const direction = diff > 0 ? 1 : -1;
    if (direction > 0 || minutes[cursor] > 4) {
      minutes[cursor] += direction;
      diff -= direction;
    }
    cursor = (cursor + 1) % minutes.length;
  }
  return minutes;
}

function scoringNightContext(player, minutes, seed) {
  const roll = hashString(`${seed}:${player.playerId}:scoring-night`) % 1000;
  const texture = hashString(`${seed}:${player.playerId}:scoring-texture`) % 100;
  const assistRoll = hashString(`${seed}:${player.playerId}:assist-night`) % 1000;
  const reboundRoll = hashString(`${seed}:${player.playerId}:rebound-night`) % 1000;
  const offense = Math.max(player.scoring, player.finishing, player.threePoint, player.midRange);
  const specialty = Math.max(
    player.finishing * 0.72 + player.paintAttack * 0.2 + player.rimFinish * 0.08,
    player.threePoint * 0.72 + player.threePointFrequency * 0.2 + player.catchAndShoot * 0.08,
    player.midRange * 0.78 + player.iq * 0.12,
  );
  const eliteUsage = minutes >= 32 && Math.max(offense, specialty) >= 88;
  const benchSpecialist = minutes >= 12 && minutes <= 26 && specialty >= 88 && player.scoring >= 68;
  const steady = 0.9 + texture / 320;
  const assistSpecialist = minutes >= 30 && (player.playmaking >= 88 || player.sourceAssistRole >= 82);
  const reboundSpecialist = minutes >= 26 && (player.rebounding >= 88 || player.sourceReboundRole >= 82);
  const statTexture = 0.92 + texture / 420;
  const nightAssistMultiplier = assistSpecialist && assistRoll < 70
    ? 1.48 + texture / 280
    : assistSpecialist && assistRoll > 940
      ? 0.58 + texture / 640
      : statTexture;
  const nightReboundMultiplier = reboundSpecialist && reboundRoll < 75
    ? 1.45 + texture / 260
    : reboundSpecialist && reboundRoll > 935
      ? 0.62 + texture / 650
      : statTexture;
  const statNight = { nightAssistMultiplier, nightReboundMultiplier };

  if (eliteUsage && roll < 55) return { nightUsageMultiplier: 1.72 + texture / 240, nightMakeBoost: 7, ...statNight };
  if (eliteUsage && roll > 935) return { nightUsageMultiplier: 0.52 + texture / 520, nightMakeBoost: -7, ...statNight };
  if (benchSpecialist && roll < 45) return { nightUsageMultiplier: 1.95 + texture / 210, nightMakeBoost: 6, ...statNight };
  if (benchSpecialist) return { nightUsageMultiplier: 0.82 + texture / 260, nightMakeBoost: 0, ...statNight };
  if (minutes <= 24 && Math.max(player.scoring, specialty) < 78) return { nightUsageMultiplier: Math.min(steady, 1.12), nightMakeBoost: 0, ...statNight };
  return { nightUsageMultiplier: steady, nightMakeBoost: 0, ...statNight };
}

function chooseShotValue(player, team, rng) {
  const attemptCap = Number(player && player.sourceThreeAttemptCap);
  const hasAttemptCap = player && player.sourceThreeAttemptCap != null && Number.isFinite(attemptCap);
  if (hasAttemptCap && Number(player.threePointAttemptsUsed || 0) >= attemptCap) return 2;
  const choiceCount = Number(player && player.shotChoicesUsed || 0);
  player.shotChoicesUsed = choiceCount + 1;
  const perimeterProfile = player.threePoint * 0.58 + player.threePointFrequency * 0.24 + player.catchAndShoot * 0.1 + player.midRange * 0.08;
  const interiorProfile = player.finishing * 0.42 + player.paintAttack * 0.28 + player.rimFinish * 0.18 + player.scoring * 0.12;
  const threeRate = clamp(0.1 + (perimeterProfile - interiorProfile + 46) / 155 + (team.offenseBoost || 0) / 120, 0.04, 0.7);
  const provenShooterFloor = player.threePoint >= 88 && (player.threePointFrequency >= 64 || player.catchAndShoot >= 64 || player.threePoint >= 95);
  if ((provenShooterFloor && choiceCount % 3 === 0) || rng() < threeRate) {
    player.threePointAttemptsUsed = Number(player.threePointAttemptsUsed || 0) + 1;
    return 3;
  }
  return 2;
}

function turnoverChance(shooter, defender, offenseTeam, defenseTeam, winnerBoost, rng) {
  return clamp(
    0.1
      + (defender.stealSkill + defenseTeam.defenseBoost - shooter.playmaking - offenseTeam.offenseBoost - winnerBoost) / 420
      + ((Number(shooter.sourceTurnoverPct || 12.5) - 12.5) / 310)
      + (rng() - 0.5) * 0.03,
    0.055,
    0.18,
  );
}

function reboundWeight(player) {
  const positionBoost = player.position === 'C'
    ? 2.15
    : player.position === 'PF'
      ? 1.75
      : player.position === 'SF'
        ? 1.05
        : player.position === 'SG'
          ? 0.62
          : 0.52;
  return player.rebounding * positionBoost * (player.nightReboundMultiplier || 1);
}

function buildStarterMatchups(home, away) {
  return POSITION_ORDER.map((position, index) => withoutUndefined({
    position,
    awayPlayer: playerSummary(away.starters[index] || away.rotation[index], away.teamId),
    homePlayer: playerSummary(home.starters[index] || home.rotation[index], home.teamId),
  }));
}

function buildBenchPreview(home, away, events) {
  const totals = totalsFromEvents(events);
  const preview = (team) => team.rotation
    .filter(player => !team.starters.some(starter => starter.playerId === player.playerId))
    .map(player => ({ ...playerSummary(player, team.teamId), stats: totals.players.get(player.playerId) || emptyStats(player, team.teamId) }))
    .sort((left, right) => Number(right.stats.points || 0) - Number(left.stats.points || 0))
    .slice(0, 3);
  return { home: preview(home), away: preview(away) };
}

function playerSummary(player, teamId) {
  return withoutUndefined({
    playerId: player && player.playerId || `${teamId}-player`,
    name: player && player.name || 'Player',
    teamId,
    position: player && player.position,
  });
}

function totalsFromPossessionEvents(timeline) {
  const totals = totalsFromEvents((timeline && timeline.events) || []);
  return {
    homeScore: totals.homeScore,
    awayScore: totals.awayScore,
    players: [...totals.players.values()].sort((left, right) => (
      String(left.teamId).localeCompare(String(right.teamId)) || String(left.name).localeCompare(String(right.name))
    )),
  };
}

function boxScoreFromPossessionTimeline(timeline) {
  const totals = totalsFromPossessionEvents(timeline);
  const homePlayers = totals.players
    .filter(player => String(player.teamId) === String(timeline.homeTeamId))
    .map(player => boxPlayer(player, timeline.homeScore - timeline.awayScore));
  const awayPlayers = totals.players
    .filter(player => String(player.teamId) === String(timeline.awayTeamId))
    .map(player => boxPlayer(player, timeline.awayScore - timeline.homeScore));
  return {
    home: teamBox(timeline.homeTeamId, homePlayers),
    away: teamBox(timeline.awayTeamId, awayPlayers),
  };
}

function totalsFromEvents(events) {
  const players = new Map();
  let homeScore = 0;
  let awayScore = 0;
  (events || []).forEach((event) => {
    if (event && Number.isFinite(Number(event.homeScore))) homeScore = Number(event.homeScore);
    if (event && Number.isFinite(Number(event.awayScore))) awayScore = Number(event.awayScore);
    (event && event.statDeltas || []).forEach((delta) => {
      const row = players.get(delta.playerId) || emptyStats(delta, delta.teamId);
      Object.entries(delta.stats || {}).forEach(([key, value]) => {
        row[key] = Number(row[key] || 0) + Number(value || 0);
      });
      players.set(delta.playerId, row);
    });
  });
  return { homeScore, awayScore, players };
}

function emptyStats(player, teamId) {
  return {
    playerId: player.playerId,
    name: player.playerName || player.name,
    teamId,
    points: 0,
    rebounds: 0,
    assists: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    fouls: 0,
    minutes: player.minutes || 0,
    fieldGoalsMade: 0,
    fieldGoalsAttempted: 0,
    threePointersMade: 0,
    threePointersAttempted: 0,
    freeThrowsMade: 0,
    freeThrowsAttempted: 0,
    offensiveRebounds: 0,
    defensiveRebounds: 0,
  };
}

function boxPlayer(player, plusMinus) {
  return {
    playerId: player.playerId,
    name: player.name,
    minutes: Math.max(1, Math.round(Number(player.minutes || 0))),
    points: Number(player.points || 0),
    rebounds: Number(player.rebounds || 0),
    assists: Number(player.assists || 0),
    steals: Number(player.steals || 0),
    blocks: Number(player.blocks || 0),
    turnovers: Number(player.turnovers || 0),
    fieldGoalsMade: Number(player.fieldGoalsMade || 0),
    fieldGoalsAttempted: Number(player.fieldGoalsAttempted || 0),
    threePointersMade: Number(player.threePointersMade || 0),
    threePointersAttempted: Number(player.threePointersAttempted || 0),
    freeThrowsMade: Number(player.freeThrowsMade || 0),
    freeThrowsAttempted: Number(player.freeThrowsAttempted || 0),
    offensiveRebounds: Number(player.offensiveRebounds || 0),
    defensiveRebounds: Number(player.defensiveRebounds || 0),
    fouls: Number(player.fouls || 0),
    plusMinus: Math.round(Number(plusMinus || 0) * (Number(player.minutes || 0) / 240)),
    starter: Number(player.minutes || 0) >= 24,
  };
}

function teamBox(teamId, players) {
  const sum = key => players.reduce((total, player) => total + Number(player[key] || 0), 0);
  return {
    teamId,
    points: sum('points'),
    rebounds: sum('rebounds'),
    assists: sum('assists'),
    turnovers: sum('turnovers'),
    fieldGoalsMade: sum('fieldGoalsMade'),
    fieldGoalsAttempted: sum('fieldGoalsAttempted'),
    threePointersMade: sum('threePointersMade'),
    threePointersAttempted: sum('threePointersAttempted'),
    freeThrowsMade: sum('freeThrowsMade'),
    freeThrowsAttempted: sum('freeThrowsAttempted'),
    fouls: sum('fouls'),
    players,
  };
}

function deltaFor(player, stats) {
  const cleaned = {};
  Object.entries(stats || {}).forEach(([key, value]) => {
    const numeric = Number(value || 0);
    if (numeric !== 0) cleaned[key] = numeric;
  });
  return withoutUndefined({
    playerId: player.playerId,
    playerName: player.name,
    teamId: player.teamId,
    position: player.position,
    minutes: player.minutes,
    starter: !!player.starter,
    stats: cleaned,
  });
}

function eventFromPossession({ input, period, clockSeconds, possession, elapsedIndex, homeScore, awayScore, home, away }) {
  return withoutUndefined({
    id: `${input.gameId}-${period}-${elapsedIndex}`,
    period,
    periodLabel: periodLabel(period),
    clockSeconds,
    elapsedMs: elapsedMsForClock(period, clockSeconds),
    homeScore,
    awayScore,
    eventType: possession.eventType,
    actingTeamId: possession.actingTeamId,
    text: possession.text,
    x: possession.x,
    y: possession.y,
    momentum: homeScore - awayScore,
    tags: [possession.eventType, periodLabel(period).toLowerCase()],
    playerId: possession.player && possession.player.playerId,
    playerName: possession.player && possession.player.name,
    points: possession.points,
    statDelta: possession.statDeltas && possession.statDeltas[0] && possession.statDeltas[0].stats,
    statDeltas: possession.statDeltas,
    currentLineups: {
      home: home.starters.map(player => player.playerId),
      away: away.starters.map(player => player.playerId),
    },
  });
}

function periodEndEvent({ input, period, elapsedIndex, homeScore, awayScore, home, away }) {
  const label = periodLabel(period);
  return withoutUndefined({
    id: `${input.gameId}-${label}-end`,
    period,
    periodLabel: label,
    clockSeconds: 0,
    elapsedMs: elapsedMsForClock(period, 0),
    homeScore,
    awayScore,
    eventType: 'period_end',
    actingTeamId: null,
    text: `End of ${label}: ${displayTeam(away)} ${awayScore} - ${displayTeam(home)} ${homeScore}`,
    x: 50,
    y: 50,
    momentum: homeScore - awayScore,
    tags: ['period_end', label.toLowerCase()],
    currentLineups: {
      home: home.starters.map(player => player.playerId),
      away: away.starters.map(player => player.playerId),
    },
  });
}

function elapsedMsForClock(period, clockSeconds) {
  const completedRegulation = Math.min(Math.max(period - 1, 0), 4) * REGULATION_PERIOD_SECONDS;
  const completedOvertime = Math.max(period - 5, 0) * OVERTIME_PERIOD_SECONDS;
  const currentPeriodLength = period > 4 ? OVERTIME_PERIOD_SECONDS : REGULATION_PERIOD_SECONDS;
  const elapsedSeconds = completedRegulation + completedOvertime + (currentPeriodLength - Math.max(0, Number(clockSeconds || 0)));
  return Math.round((elapsedSeconds / LIVE_MODE_SPEED_MULTIPLIER) * 1000);
}

function scoreText(player, points, assister) {
  const action = points === 3
    ? 'made 3PT jumper'
    : player.position === 'C' || player.position === 'PF'
      ? 'scored inside'
      : 'made driving layup';
  return `${shortName(player.name)} ${action}${assister ? `. Assist: ${shortName(assister.name)}.` : '.'}`;
}

function coachingBoost(presetIds, kind) {
  const ids = (presetIds || []).filter(Boolean).map(id => String(id));
  if (ids.length === 0) return 0;
  const values = ids.map((id) => {
    if (kind === 'offense') {
      if (['seven_seconds', 'pace_and_space', 'lob_city', 'triangle_control'].includes(id)) return 3;
      if (['grit_and_grind', 'twin_towers'].includes(id)) return 1;
    }
    if (['grit_and_grind', 'zone_trap', 'small_ball_switch', 'twin_towers', 'bully_ball'].includes(id)) return 3;
    return 0;
  });
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function winnerMatches(timeline, preferredWinnerTeamId) {
  if (!preferredWinnerTeamId || !timeline) return true;
  const winner = timeline.homeScore > timeline.awayScore ? timeline.homeTeamId : timeline.awayTeamId;
  return winner === preferredWinnerTeamId;
}

function preferredWinnerMargin(timeline, preferredWinnerTeamId) {
  if (!preferredWinnerTeamId || !timeline) return 0;
  if (preferredWinnerTeamId === timeline.homeTeamId) return timeline.homeScore - timeline.awayScore;
  if (preferredWinnerTeamId === timeline.awayTeamId) return timeline.awayScore - timeline.homeScore;
  return Number.NEGATIVE_INFINITY;
}

function normalizePosition(position, index) {
  const value = String(position || '').toUpperCase();
  if (value.includes('PG')) return 'PG';
  if (value.includes('SG')) return 'SG';
  if (value.includes('SF')) return 'SF';
  if (value.includes('PF')) return 'PF';
  if (value.includes('C')) return 'C';
  if (value === 'G') return index % 2 === 0 ? 'PG' : 'SG';
  if (value === 'F') return index % 2 === 0 ? 'SF' : 'PF';
  return POSITION_ORDER[Math.min(index, POSITION_ORDER.length - 1)] || 'G';
}

function periodLabel(period) {
  if (period <= 4) return `Q${period}`;
  const overtimeNumber = period - 4;
  return overtimeNumber === 1 ? 'OT' : `${overtimeNumber}OT`;
}

function shortName(name) {
  const parts = String(name || 'Player').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || 'Player';
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

function displayTeam(team) {
  const raw = String(team && (team.abbreviation || team.name || team.teamId) || 'TEAM').trim();
  const eraMatch = raw.toUpperCase().match(/^([A-Z]{2,3})_\d{4}$/);
  return eraMatch ? eraMatch[1] : raw;
}

function weightedPick(items, weightForItem, rng) {
  const weights = items.map(item => Math.max(0.01, Number(weightForItem(item)) || 0.01));
  const total = weights.reduce((sum, value) => sum + value, 0) || 1;
  let roll = rng() * total;
  for (let index = 0; index < items.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) return items[index];
  }
  return items[items.length - 1];
}

function hashString(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seed) {
  let state = seed >>> 0 || 1;
  return function rng() {
    state = Math.imul(1664525, state) + 1013904223;
    return ((state >>> 0) / 4294967296);
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function withoutUndefined(value) {
  if (Array.isArray(value)) return value.map(item => withoutUndefined(item));
  if (!value || typeof value !== 'object') return value;
  return Object.entries(value).reduce((result, [key, item]) => {
    if (item !== undefined) result[key] = withoutUndefined(item);
    return result;
  }, {});
}

module.exports = {
  boxScoreFromPossessionTimeline,
  buildPossessionTimeline,
  totalsFromPossessionEvents,
};
