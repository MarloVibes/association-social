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

function playerValue(player: SimPlayerInput) {
  return skill(player, 'shooting') * 0.45
    + skill(player, 'playmaking') * 0.25
    + skill(player, 'defense') * 0.2
    + skill(player, 'basketballIq') * 0.1
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
  const weights = players.map(player => Math.max(1, player.minutes * (skill(player, 'shooting') + skill(player, 'playmaking') * 0.25 + (hash(`${seed}:${player.playerId}`) % 8)) / 100));
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
    skill(player, 'rebounding') * 0.62
    + skill(player, 'defense') * 0.22
    + skill(player, 'athleticism') * 0.16
  ));
  return clamp(Math.round(40 + ((rebounding - 60) / 3.4) + (hash(`${seed}:team-rebounds`) % 5)), 34, 58);
}

function targetTeamAssists(players: Array<SimPlayerInput & { minutes: number }>, fieldGoalsMade: number, seed: string) {
  const creation = weightedTeamSkill(players, player => (
    skill(player, 'playmaking') * 0.68
    + skill(player, 'basketballIq') * 0.22
    + skill(player, 'shooting') * 0.1
  ));
  const assistedRate = clamp(0.48 + ((creation - 60) / 155) + ((hash(`${seed}:team-assists`) % 7) - 3) / 100, 0.42, 0.76);
  return clamp(Math.round(fieldGoalsMade * assistedRate), 12, Math.min(34, Math.max(12, fieldGoalsMade)));
}

function shootingLine(points: number, variance: number) {
  const threePointersMade = Math.min(Math.floor(points / 3), Math.floor((points * (15 + (variance % 18))) / 300));
  let remaining = points - (threePointersMade * 3);
  let freeThrowsMade = Math.min(remaining, variance % 5);
  if ((remaining - freeThrowsMade) % 2 !== 0 && freeThrowsMade > 0) freeThrowsMade -= 1;
  remaining -= freeThrowsMade;
  const twoPointersMade = Math.max(0, Math.floor(remaining / 2));
  const fieldGoalsMade = twoPointersMade + threePointersMade;
  return {
    fieldGoalsMade,
    fieldGoalsAttempted: fieldGoalsMade + 2 + (variance % 7),
    threePointersMade,
    threePointersAttempted: threePointersMade + (variance % 5),
    freeThrowsMade,
    freeThrowsAttempted: freeThrowsMade + (variance % 3),
  };
}

function buildTeamBox(team: SimTeamInput, targetPoints: number, seed: string, pointMargin: number): TeamBoxScore {
  const players = normalizeMinutes(team.players);
  const points = distributePoints(players, targetPoints, `${seed}:${team.teamId}`);
  const shootingLines = players.map((player, index) => shootingLine(points[index], hash(`${seed}:${team.teamId}:${player.playerId}:line`)));
  const fieldGoalsMade = shootingLines.reduce((total, line) => total + line.fieldGoalsMade, 0);
  const rebounds = distributeStatTotal(players, targetTeamRebounds(players, seed), `${seed}:rebounds`, (player, index) => (
    player.minutes
    * positionFactor(player, 'rebound')
    * (skill(player, 'rebounding') * 0.64 + skill(player, 'defense') * 0.22 + skill(player, 'athleticism') * 0.14)
    * (0.95 + (hash(`${seed}:${index}:rebound-variance`) % 15) / 100)
  ));
  const assists = distributeStatTotal(players, targetTeamAssists(players, fieldGoalsMade, seed), `${seed}:assists`, (player, index) => (
    player.minutes
    * positionFactor(player, 'assist')
    * (skill(player, 'playmaking') * 0.72 + skill(player, 'basketballIq') * 0.2 + skill(player, 'shooting') * 0.08)
    * (0.95 + (hash(`${seed}:${index}:assist-variance`) % 15) / 100)
  ));
  const boxPlayers = players.map((player, index): PlayerBoxScore => {
    const variance = hash(`${seed}:${team.teamId}:${player.playerId}:line`);
    const playerRebounds = rebounds[index];
    const offensiveRebounds = Math.floor(playerRebounds * (20 + (variance % 18)) / 100);
    const line = shootingLines[index];
    return {
      playerId: player.playerId,
      name: player.name || player.playerId,
      minutes: player.minutes,
      points: points[index],
      rebounds: playerRebounds,
      assists: assists[index],
      steals: variance % 3,
      blocks: Math.floor((variance / 7) % 3),
      turnovers: Math.floor((variance / 11) % 4),
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

function teamTargetPoints(team: SimTeamInput, seed: string, homeBonus = 0) {
  const topEight = normalizeMinutes(team.players).slice(0, 8);
  const skill = topEight.reduce((sum, player) => sum + playerValue(player), 0) / Math.max(1, topEight.length);
  return 82 + Math.round(skill / 3) + homeBonus + (hash(`${seed}:${team.teamId}:score`) % 16);
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

export function simulateGame(input: SimGameInput, seed: string): SimulatedGame {
  let homePoints = teamTargetPoints(input.home, seed, 3);
  let awayPoints = teamTargetPoints(input.away, seed);
  if (homePoints === awayPoints) {
    homePoints += (hash(`${seed}:tie`) % 2) + 1;
  }
  const home = buildTeamBox(input.home, homePoints, seed, homePoints - awayPoints);
  const away = buildTeamBox(input.away, awayPoints, seed, awayPoints - homePoints);
  const winnerTeamId = home.points > away.points ? home.teamId : away.teamId;

  return {
    home,
    away,
    quarters: quarters(home.points, away.points, seed),
    winnerTeamId,
    story: `${winnerTeamId} controlled the decisive stretches behind balanced rotation production.`,
  };
}
