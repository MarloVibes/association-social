export type SimPlayerInput = {
  playerId: string;
  name?: string;
  minutes?: number;
  shooting?: number;
  playmaking?: number;
  defense?: number;
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

function playerValue(player: SimPlayerInput) {
  return (player.shooting || 60) * 0.5
    + (player.playmaking || 60) * 0.25
    + (player.defense || 60) * 0.15
    + (player.minutes || 0) * 0.1;
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
  const weights = players.map(player => Math.max(1, player.minutes * ((player.shooting || 60) + 20 + (hash(`${seed}:${player.playerId}`) % 12)) / 100));
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
  const boxPlayers = players.map((player, index): PlayerBoxScore => {
    const variance = hash(`${seed}:${team.teamId}:${player.playerId}:line`);
    const rebounds = Math.max(0, Math.round(player.minutes * ((player.defense || 60) / 120) + (variance % 4)));
    const offensiveRebounds = Math.floor(rebounds * (20 + (variance % 18)) / 100);
    const line = shootingLine(points[index], variance);
    return {
      playerId: player.playerId,
      name: player.name || player.playerId,
      minutes: player.minutes,
      points: points[index],
      rebounds,
      assists: Math.max(0, Math.round(player.minutes * ((player.playmaking || 60) / 150) + (variance % 3))),
      steals: variance % 3,
      blocks: Math.floor((variance / 7) % 3),
      turnovers: Math.floor((variance / 11) % 4),
      ...line,
      offensiveRebounds,
      defensiveRebounds: rebounds - offensiveRebounds,
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
