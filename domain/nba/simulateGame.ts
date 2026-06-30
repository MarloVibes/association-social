import { simSkillsFromEvaluation } from './evaluation';

export type SimPlayerInput = {
  playerId: string;
  name?: string;
  position?: string;
  minutes?: number;
  shooting?: number;
  playmaking?: number;
  rebounding?: number;
  defense?: number;
  athleticism?: number;
  basketballIq?: number;
  closeShot?: number;
  midRange?: number;
  threePoint?: number;
  freeThrow?: number;
  dunking?: number;
  shotIq?: number;
  passing?: number;
  ballHandle?: number;
  offenseIq?: number;
  clutch?: number;
  perimeterDefense?: number;
  postDefense?: number;
  blocking?: number;
  stealsSkill?: number;
  defenseIq?: number;
  helpDefense?: number;
  speed?: number;
  acceleration?: number;
  strength?: number;
  postOffense?: number;
  stamina?: number;
  currentForm?: number;
  confidence?: number;
  chemistry?: number;
  fatigue?: number;
  hidden?: Record<string, number>;
  category_skill_grades?: Record<string, { rating?: number; grade?: string } | number>;
  baselineRatingProfile?: {
    category_skill_grades?: Record<string, { rating?: number; grade?: string } | number>;
    attribute_model?: Record<string, number>;
    era_adjusted_profiles?: Record<string, number>;
    source_stat_line?: {
      threePointAttemptsPerGame?: number;
    };
  };
  tendencies?: Partial<Record<
    | 'paintAttack'
    | 'rimFinishFrequency'
    | 'dunkFrequency'
    | 'drawFoulPressure'
    | 'midRangeFrequency'
    | 'threePointFrequency'
    | 'catchAndShootFrequency'
    | 'pullUpFrequency'
    | 'postTouchFrequency'
    | 'transitionFrequency'
    | 'passFirst'
    | 'isolationFrequency'
    | 'pickAndRollBallHandler'
    | 'pickAndRollRollMan'
    | 'defensivePlaymaking'
    | 'foulRisk'
    | 'reboundCrash',
    number
  >>;
};

export type SimTeamInput = {
  teamId: string;
  players: SimPlayerInput[];
};

export type SimGameInput = {
  home: SimTeamInput;
  away: SimTeamInput;
};

export type PlayerBoxScore = {
  playerId: string;
  name: string;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  threePointersMade: number;
  threePointersAttempted: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
  offensiveRebounds: number;
  defensiveRebounds: number;
  fouls: number;
  plusMinus: number;
  starter: boolean;
};

export type TeamBoxScore = {
  teamId: string;
  points: number;
  rebounds: number;
  assists: number;
  turnovers: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  threePointersMade: number;
  threePointersAttempted: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
  fouls: number;
  players: PlayerBoxScore[];
};

export type SimulatedGame = {
  home: TeamBoxScore;
  away: TeamBoxScore;
  quarters: Array<{
    quarter: number;
    home: number;
    away: number;
  }>;
  winnerTeamId: string;
  story: string;
};

function hash(value: string): number {
  let h = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function skill(player: SimPlayerInput, key: keyof SimPlayerInput, fallback = 60) {
  const value = Number(player[key]);
  return Number.isFinite(value) ? value : fallback;
}

function categoryRating(player: SimPlayerInput, key: string, fallback: number) {
  const entry = player.baselineRatingProfile?.category_skill_grades?.[key]
    ?? player.category_skill_grades?.[key];
  const value = typeof entry === 'number' ? entry : entry?.rating;
  return clamp(Number.isFinite(Number(value)) ? Number(value) : fallback, 0, 100);
}

function tendency(player: SimPlayerInput, key: keyof NonNullable<SimPlayerInput['tendencies']>, fallback: number) {
  const value = Number(player.tendencies?.[key]);
  return clamp(Number.isFinite(value) ? value : fallback, 0, 100);
}

function playerValue(player: SimPlayerInput) {
  const sim = simSkillsFromEvaluation(player as Record<string, unknown>);
  const offense = categoryRating(player, 'overallOffense', sim.offensiveImpact);
  const defense = Math.max(
    categoryRating(player, 'perimeterDefense', sim.defensiveImpact),
    categoryRating(player, 'interiorDefense', sim.defensiveImpact),
  );
  const playmaking = categoryRating(player, 'playmaking', skill(player, 'playmaking'));
  const iq = categoryRating(player, 'basketballIq', skill(player, 'basketballIq'));
  return offense * 0.42
    + defense * 0.24
    + playmaking * 0.12
    + iq * 0.1
    + sim.formMultiplier * 10
    + (player.minutes || 0) * 0.1;
}

function positionFactor(player: SimPlayerInput, kind: 'assist' | 'rebound') {
  const position = String(player.position || '').toUpperCase();
  const isGuard = position.includes('PG') || position.includes('SG') || position === 'G';
  const isBig = position.includes('PF') || position.includes('C') || position === 'F-C';
  if (kind === 'assist') {
    if (position.includes('PG')) return 1.45;
    if (isGuard) return 1.18;
    if (isBig) return 0.62;
    return 0.88;
  }
  if (position.includes('C')) return 1.45;
  if (position.includes('PF')) return 1.25;
  if (isBig) return 1.08;
  if (isGuard) return 0.68;
  return 0.9;
}

function normalizeMinutes(players: SimPlayerInput[]): Array<SimPlayerInput & { minutes: number }> {
  const sorted = [...players].sort((a, b) => playerValue(b) - playerValue(a) || a.playerId.localeCompare(b.playerId)).slice(0, 10);
  const raw = sorted.map(player => Math.max(1, Number(player.minutes || 0)));
  const total = raw.reduce((sum, value) => sum + value, 0) || 1;
  const scaled = raw.map(value => Math.max(1, Math.floor((value / total) * 240)));
  let diff = 240 - scaled.reduce((sum, value) => sum + value, 0);
  let cursor = 0;
  while (diff !== 0 && scaled.length > 0) {
    const direction = diff > 0 ? 1 : -1;
    if (direction > 0 || scaled[cursor] > 1) {
      scaled[cursor] += direction;
      diff -= direction;
    }
    cursor = (cursor + 1) % scaled.length;
  }
  return sorted.map((player, index) => ({ ...player, minutes: scaled[index] }));
}

function distributePoints(players: Array<SimPlayerInput & { minutes: number }>, teamPoints: number, seed: string) {
  const weights = players.map((player) => {
    const sim = simSkillsFromEvaluation(player as Record<string, unknown>);
    const finishing = categoryRating(player, 'finishing', (sim.closeShot + sim.dunking + sim.postOffense) / 3);
    const midRange = categoryRating(player, 'midRange', sim.midRange);
    const threePoint = categoryRating(player, 'threePoint', sim.threePoint);
    const playmaking = categoryRating(player, 'playmaking', sim.passing);
    const paintAttack = tendency(player, 'paintAttack', 58);
    const threeFrequency = tendency(player, 'threePointFrequency', 58);
    const scorerProfile = finishing * 0.22
      + midRange * 0.14
      + threePoint * 0.2
      + playmaking * 0.07
      + sim.dunking * 0.06
      + sim.postOffense * 0.08
      + sim.shotIq * 0.1
      + sim.offenseIq * 0.05
      + paintAttack * 0.04
      + threeFrequency * 0.04;
    return Math.max(1, player.minutes * scorerProfile * sim.formMultiplier * sim.confidenceMultiplier * sim.fatigueMultiplier / 100 + (hash(`${seed}:${player.playerId}`) % 8));
  });
  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || 1;
  const points = weights.map(weight => Math.floor((weight / totalWeight) * teamPoints));
  let diff = teamPoints - points.reduce((sum, value) => sum + value, 0);
  let cursor = 0;
  while (diff > 0 && points.length > 0) {
    points[cursor] += 1;
    diff -= 1;
    cursor = (cursor + 1) % points.length;
  }
  return points;
}

function distributeStatTotal(
  players: Array<SimPlayerInput & { minutes: number }>,
  targetTotal: number,
  seed: string,
  weightForPlayer: (player: SimPlayerInput & { minutes: number }, index: number) => number,
) {
  const weights = players.map((player, index) => Math.max(0.01, weightForPlayer(player, index)));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || 1;
  const raw = weights.map(weight => (weight / totalWeight) * targetTotal);
  const values = raw.map(value => Math.floor(value));
  let diff = targetTotal - values.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({
      index,
      remainder: value - Math.floor(value),
      tie: hash(`${seed}:${players[index].playerId}:stat-share`),
    }))
    .sort((left, right) => right.remainder - left.remainder || left.tie - right.tie);
  let cursor = 0;
  while (diff > 0 && order.length > 0) {
    values[order[cursor].index] += 1;
    diff -= 1;
    cursor = (cursor + 1) % order.length;
  }
  return values;
}

function weightedTeamSkill(players: Array<SimPlayerInput & { minutes: number }>, skillForPlayer: (player: SimPlayerInput) => number) {
  const totalMinutes = players.reduce((sum, player) => sum + player.minutes, 0) || 1;
  return players.reduce((sum, player) => sum + skillForPlayer(player) * player.minutes, 0) / totalMinutes;
}

function targetTeamRebounds(players: Array<SimPlayerInput & { minutes: number }>, seed: string) {
  const rebounding = weightedTeamSkill(players, player => (
    categoryRating(player, 'rebounding', simSkillsFromEvaluation(player as Record<string, unknown>).rebounding) * 0.62
    + categoryRating(player, 'interiorDefense', simSkillsFromEvaluation(player as Record<string, unknown>).postDefense) * 0.18
    + simSkillsFromEvaluation(player as Record<string, unknown>).strength * 0.12
    + tendency(player, 'reboundCrash', 55) * 0.08
  ));
  return clamp(Math.round(40 + ((rebounding - 60) / 3.4) + (hash(`${seed}:team-rebounds`) % 5)), 34, 58);
}

function targetTeamAssists(players: Array<SimPlayerInput & { minutes: number }>, fieldGoalsMade: number, seed: string) {
  const creation = weightedTeamSkill(players, player => (
    categoryRating(player, 'playmaking', simSkillsFromEvaluation(player as Record<string, unknown>).passing) * 0.44
    + simSkillsFromEvaluation(player as Record<string, unknown>).ballHandle * 0.16
    + categoryRating(player, 'basketballIq', simSkillsFromEvaluation(player as Record<string, unknown>).offenseIq) * 0.18
    + simSkillsFromEvaluation(player as Record<string, unknown>).shotIq * 0.07
    + tendency(player, 'passFirst', 50) * 0.1
    + tendency(player, 'pickAndRollBallHandler', 45) * 0.05
  ));
  const assistedRate = clamp(0.48 + ((creation - 60) / 155) + ((hash(`${seed}:team-assists`) % 7) - 3) / 100, 0.42, 0.76);
  return clamp(Math.round(fieldGoalsMade * assistedRate), 12, Math.min(34, Math.max(12, fieldGoalsMade)));
}

function shootingLine(points: number, variance: number, player: SimPlayerInput) {
  const sim = simSkillsFromEvaluation(player as Record<string, unknown>);
  const threePoint = categoryRating(player, 'threePoint', sim.threePoint);
  const midRange = categoryRating(player, 'midRange', sim.midRange);
  const finishing = categoryRating(player, 'finishing', (sim.closeShot + sim.dunking + sim.postOffense) / 3);
  const threeFrequency = tendency(player, 'threePointFrequency', 58);
  const catchAndShoot = tendency(player, 'catchAndShootFrequency', 55);
  const pullUp = tendency(player, 'pullUpFrequency', 50);
  const paintAttack = tendency(player, 'paintAttack', 58);
  const rimFinish = tendency(player, 'rimFinishFrequency', 55);
  const foulPressure = tendency(player, 'drawFoulPressure', (sim.freeThrow + finishing + paintAttack) / 3);
  const perimeterProfile = threePoint * 0.56 + sim.shotIq * 0.18 + threeFrequency * 0.18 + catchAndShoot * 0.05 + pullUp * 0.03;
  const interiorProfile = finishing * 0.45 + sim.closeShot * 0.18 + sim.dunking * 0.14 + sim.postOffense * 0.08 + paintAttack * 0.1 + rimFinish * 0.05;
  const threeRate = clamp(0.08 + (perimeterProfile - interiorProfile + 52) / 170, 0.04, 0.62);
  const sourceThreeAttempts = Number(player.baselineRatingProfile?.source_stat_line?.threePointAttemptsPerGame);
  const hasSourceThreeVolume = Number.isFinite(sourceThreeAttempts);
  const minuteScale = clamp(Number(player.minutes || 0) / 36, 0.25, 1.45);
  const sourceAttemptCap = hasSourceThreeVolume
    ? Math.max(0, Math.round(Math.max(0, sourceThreeAttempts) * minuteScale + (variance % 6 === 0 ? 1 : 0)))
    : null;
  const nonShootingProfile = threePoint < 65 && threeFrequency < 55 && (sourceAttemptCap ?? 2) <= 1;
  let threePointersMade = Math.min(Math.floor(points / 3), Math.floor(points * threeRate / 3));
  if (nonShootingProfile) threePointersMade = 0;
  let remaining = points - (threePointersMade * 3);
  const freeThrowPressure = clamp(foulPressure * 0.45 + paintAttack * 0.24 + finishing * 0.22 + sim.freeThrow * 0.09, 35, 99);
  let freeThrowsMade = Math.min(remaining, Math.round((freeThrowPressure / 100) * (variance % 7)));
  if ((remaining - freeThrowsMade) % 2 !== 0 && freeThrowsMade > 0) freeThrowsMade -= 1;
  remaining -= freeThrowsMade;
  const twoPointersMade = Math.max(0, Math.floor(remaining / 2));
  const fieldGoalsMade = twoPointersMade + threePointersMade;
  const shotQuality = clamp((sim.shotIq + sim.confidenceMultiplier * 80 + sim.formMultiplier * 80) / 240, 0.48, 0.9);
  const extraFreeThrowAttempts = Math.max(variance % 3, Math.round((freeThrowPressure - 62) / 14));
  const generatedThreeAttempts = threePointersMade + Math.max(0, Math.round(threeRate * 8) + (variance % 3));
  const volumeCappedThreeAttempts = sourceAttemptCap === null
    ? generatedThreeAttempts
    : Math.min(generatedThreeAttempts, Math.max(sourceAttemptCap, threePointersMade));
  return {
    fieldGoalsMade,
    fieldGoalsAttempted: fieldGoalsMade + 2 + Math.max(0, Math.round((variance % 7) * (1.04 - shotQuality))),
    threePointersMade,
    threePointersAttempted: Math.max(threePointersMade, volumeCappedThreeAttempts),
    freeThrowsMade,
    freeThrowsAttempted: freeThrowsMade + extraFreeThrowAttempts,
  };
}

function buildTeamBox(team: SimTeamInput, targetPoints: number, seed: string, pointMargin: number): TeamBoxScore {
  const players = normalizeMinutes(team.players);
  const points = distributePoints(players, targetPoints, `${seed}:${team.teamId}`);
  const shootingLines = players.map((player, index) => shootingLine(points[index], hash(`${seed}:${team.teamId}:${player.playerId}:line`), player));
  const fieldGoalsMade = shootingLines.reduce((total, line) => total + line.fieldGoalsMade, 0);
  const rebounds = distributeStatTotal(players, targetTeamRebounds(players, seed), `${seed}:rebounds`, (player, index) => (
    player.minutes
    * positionFactor(player, 'rebound')
    * (
      categoryRating(player, 'rebounding', simSkillsFromEvaluation(player as Record<string, unknown>).rebounding) * 0.62
      + categoryRating(player, 'interiorDefense', simSkillsFromEvaluation(player as Record<string, unknown>).postDefense) * 0.2
      + simSkillsFromEvaluation(player as Record<string, unknown>).strength * 0.12
      + tendency(player, 'reboundCrash', 55) * 0.06
    )
    * (0.95 + (hash(`${seed}:${index}:rebound-variance`) % 15) / 100)
  ));
  const assists = distributeStatTotal(players, targetTeamAssists(players, fieldGoalsMade, seed), `${seed}:assists`, (player, index) => (
    player.minutes
    * positionFactor(player, 'assist')
    * (
      categoryRating(player, 'playmaking', simSkillsFromEvaluation(player as Record<string, unknown>).passing) * 0.5
      + simSkillsFromEvaluation(player as Record<string, unknown>).ballHandle * 0.16
      + categoryRating(player, 'basketballIq', simSkillsFromEvaluation(player as Record<string, unknown>).offenseIq) * 0.16
      + simSkillsFromEvaluation(player as Record<string, unknown>).shotIq * 0.06
      + tendency(player, 'passFirst', 50) * 0.08
      + tendency(player, 'pickAndRollBallHandler', 45) * 0.04
    )
    * (0.95 + (hash(`${seed}:${index}:assist-variance`) % 15) / 100)
  ));
  const boxPlayers = players.map((player, index): PlayerBoxScore => {
    const variance = hash(`${seed}:${team.teamId}:${player.playerId}:line`);
    const playerRebounds = rebounds[index];
    const offensiveRebounds = Math.floor(playerRebounds * (20 + (variance % 18)) / 100);
    const line = shootingLines[index];
    const sim = simSkillsFromEvaluation(player as Record<string, unknown>);
    return {
      playerId: player.playerId,
      name: player.name || player.playerId,
      minutes: player.minutes,
      points: points[index],
      rebounds: playerRebounds,
      assists: assists[index],
      steals: Math.min(5, Math.floor((sim.stealsSkill + tendency(player, 'defensivePlaymaking', sim.stealsSkill) - 110) / 34) + (variance % 2)),
      blocks: Math.min(5, Math.floor((sim.blocking + categoryRating(player, 'interiorDefense', sim.blocking) - 110) / 34) + Math.floor((variance / 7) % 2)),
      turnovers: Math.max(0, Math.floor((variance / 11) % 4) - Math.floor((sim.ballHandle + sim.offenseIq - 140) / 32)),
      ...line,
      offensiveRebounds,
      defensiveRebounds: playerRebounds - offensiveRebounds,
      fouls: 1 + (variance % 5),
      plusMinus: Math.round(pointMargin * (player.minutes / 240) + ((variance % 7) - 3)),
      starter: index < 5,
    };
  });

  return {
    teamId: team.teamId,
    points: targetPoints,
    rebounds: boxPlayers.reduce((total, player) => total + player.rebounds, 0),
    assists: boxPlayers.reduce((total, player) => total + player.assists, 0),
    turnovers: boxPlayers.reduce((total, player) => total + player.turnovers, 0),
    fieldGoalsMade: boxPlayers.reduce((total, player) => total + player.fieldGoalsMade, 0),
    fieldGoalsAttempted: boxPlayers.reduce((total, player) => total + player.fieldGoalsAttempted, 0),
    threePointersMade: boxPlayers.reduce((total, player) => total + player.threePointersMade, 0),
    threePointersAttempted: boxPlayers.reduce((total, player) => total + player.threePointersAttempted, 0),
    freeThrowsMade: boxPlayers.reduce((total, player) => total + player.freeThrowsMade, 0),
    freeThrowsAttempted: boxPlayers.reduce((total, player) => total + player.freeThrowsAttempted, 0),
    fouls: boxPlayers.reduce((total, player) => total + player.fouls, 0),
    players: boxPlayers,
  };
}

function teamTargetPoints(team: SimTeamInput, opponent: SimTeamInput, seed: string, homeBonus = 0) {
  const topEight = normalizeMinutes(team.players).slice(0, 8);
  const opponentTopEight = normalizeMinutes(opponent.players).slice(0, 8);
  const offense = topEight.reduce((sum, player) => sum + simSkillsFromEvaluation(player as Record<string, unknown>).offensiveImpact * (player.minutes / 30), 0) / Math.max(1, topEight.length);
  const defense = opponentTopEight.reduce((sum, player) => sum + simSkillsFromEvaluation(player as Record<string, unknown>).defensiveImpact * (player.minutes / 30), 0) / Math.max(1, opponentTopEight.length);
  return 82 + Math.round((offense - 58) / 2.8) - Math.round((defense - 68) / 6) + homeBonus + (hash(`${seed}:${team.teamId}:score`) % 16);
}

function quarters(homePoints: number, awayPoints: number, seed: string) {
  const homeParts = [0, 1, 2, 3].map(index => 20 + (hash(`${seed}:home:q${index}`) % 12));
  const awayParts = [0, 1, 2, 3].map(index => 20 + (hash(`${seed}:away:q${index}`) % 12));
  const scale = (parts: number[], total: number) => {
    const rawTotal = parts.reduce((sum, value) => sum + value, 0);
    const scaled = parts.map(value => Math.floor((value / rawTotal) * total));
    let diff = total - scaled.reduce((sum, value) => sum + value, 0);
    let cursor = 0;
    while (diff > 0) {
      scaled[cursor] += 1;
      diff -= 1;
      cursor = (cursor + 1) % scaled.length;
    }
    return scaled;
  };
  const home = scale(homeParts, homePoints);
  const away = scale(awayParts, awayPoints);
  return [0, 1, 2, 3].map(index => ({ quarter: index + 1, home: home[index], away: away[index] }));
}

function cleanTeamLabel(teamId: string) {
  const match = String(teamId || '').toUpperCase().match(/^([A-Z]{2,3})_\d{4}$/);
  return match ? match[1] : teamId;
}

function playerImpact(player: PlayerBoxScore) {
  return player.points * 2
    + player.rebounds * 1.15
    + player.assists * 1.35
    + player.steals * 2
    + player.blocks * 2
    - player.turnovers * 0.8;
}

function buildGameStory({
  home,
  away,
  quarters,
  winnerTeamId,
}: {
  home: TeamBoxScore;
  away: TeamBoxScore;
  quarters: SimulatedGame['quarters'];
  winnerTeamId: string;
}) {
  const homeWon = winnerTeamId === home.teamId;
  const winner = homeWon ? home : away;
  const loser = homeWon ? away : home;
  const winnerLabel = cleanTeamLabel(winner.teamId);
  const loserLabel = cleanTeamLabel(loser.teamId);
  const margin = Math.abs(home.points - away.points);
  const opener = quarters.some(quarter => Number(quarter.quarter) > 4)
    ? `${winnerLabel} outlasted ${loserLabel} in overtime, ${winner.points}-${loser.points}.`
    : margin <= 3
      ? `${winnerLabel} survived a one-possession finish against ${loserLabel}, ${winner.points}-${loser.points}.`
      : margin <= 9
        ? `${winnerLabel} closed a tight game over ${loserLabel}, ${winner.points}-${loser.points}.`
        : margin >= 20
          ? `${winnerLabel} ran away from ${loserLabel}, ${winner.points}-${loser.points}.`
          : `${winnerLabel} handled the key stretches against ${loserLabel}, ${winner.points}-${loser.points}.`;

  const performers = [
    ...home.players.map(player => ({ player, teamId: home.teamId })),
    ...away.players.map(player => ({ player, teamId: away.teamId })),
  ].sort((left, right) => playerImpact(right.player) - playerImpact(left.player));
  const leader = performers[0];
  const support = leader
    ? performers.find(item => item.teamId === leader.teamId && item.player.playerId !== leader.player.playerId)
    : null;
  const leaderLine = leader
    ? `${leader.player.name} powered ${cleanTeamLabel(leader.teamId)} with ${leader.player.points} points, ${leader.player.rebounds} rebounds, and ${leader.player.assists} assists.`
    : '';
  const supportLine = support
    ? `${support.player.name} added ${support.player.points} points as a second option.`
    : '';

  return [opener, leaderLine, supportLine].filter(Boolean).join(' ');
}

export function simulateGame(input: SimGameInput, seed: string): SimulatedGame {
  if (input.home.players.length < 5 || input.away.players.length < 5) {
    throw new Error('Cannot simulate an NBA game without real players for both teams.');
  }

  let homePoints = teamTargetPoints(input.home, input.away, seed, 3);
  let awayPoints = teamTargetPoints(input.away, input.home, seed);
  if (homePoints === awayPoints) {
    homePoints += (hash(`${seed}:tie`) % 2) + 1;
  }
  const home = buildTeamBox(input.home, homePoints, seed, homePoints - awayPoints);
  const away = buildTeamBox(input.away, awayPoints, seed, awayPoints - homePoints);
  const winnerTeamId = home.points > away.points ? home.teamId : away.teamId;
  const periodScores = quarters(home.points, away.points, seed);

  return {
    home,
    away,
    quarters: periodScores,
    winnerTeamId,
    story: buildGameStory({ home, away, quarters: periodScores, winnerTeamId }),
  };
}
