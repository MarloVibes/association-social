export type NbaScheduleGameStatus = 'scheduled' | 'in_progress' | 'final';

export type NbaScheduleGame = {
  id: string;
  week: number;
  sequence: number;
  homeTeamId: string;
  awayTeamId: string;
  status: NbaScheduleGameStatus;
};

export type GenerateScheduleInput = {
  teams: string[];
  gamesPerTeam: 14 | 29 | 58 | 82;
  seed: string;
};

const APPROVED_LENGTHS = new Set([14, 29, 58, 82]);

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function gameId(seed: string, sequence: number, awayTeamId: string, homeTeamId: string): string {
  return `nba_${hash(`${seed}:${sequence}:${awayTeamId}:${homeTeamId}`).toString(36)}`;
}

function assertValidInput(input: GenerateScheduleInput) {
  if (input.teams.length < 30 || input.teams.length > 36) {
    throw new Error('NBA schedules require 30 to 36 teams.');
  }
  if (!APPROVED_LENGTHS.has(input.gamesPerTeam)) {
    throw new Error('Unsupported NBA schedule length.');
  }
  if (new Set(input.teams).size !== input.teams.length) {
    throw new Error('Team IDs must be unique.');
  }
  if ((input.teams.length * input.gamesPerTeam) % 2 !== 0) {
    throw new Error('Schedule length must create an even number of team games.');
  }
}

function seededTeams(teams: string[], seed: string): string[] {
  return [...teams].sort((a, b) => hash(`${seed}:${a}`) - hash(`${seed}:${b}`) || a.localeCompare(b));
}

function roundRobinRounds(teams: string[]): [string, string][][] {
  const rotating = [...teams];
  const rounds: [string, string][][] = [];
  const half = rotating.length / 2;
  for (let round = 0; round < rotating.length - 1; round += 1) {
    const pairings: [string, string][] = [];
    for (let index = 0; index < half; index += 1) {
      pairings.push([rotating[index], rotating[rotating.length - 1 - index]]);
    }
    rounds.push(pairings);
    const fixed = rotating[0];
    const moved = rotating.pop();
    rotating.splice(1, 0, moved as string);
    rotating[0] = fixed;
  }
  return rounds;
}

function rebalanceHomeGames(games: NbaScheduleGame[], teams: string[], target: number, seed: string): NbaScheduleGame[] {
  const minHome = Math.floor(target / 2);
  const maxHome = Math.ceil(target / 2);
  const homeCounts = new Map(teams.map(team => [team, games.filter(game => game.homeTeamId === team).length]));
  const nextGames = [...games];

  let changed = true;
  let passes = 0;
  while (changed && passes < teams.length * target) {
    changed = false;
    passes += 1;
    const over = teams
      .filter(team => (homeCounts.get(team) || 0) > maxHome)
      .sort((a, b) => (homeCounts.get(b) || 0) - (homeCounts.get(a) || 0) || a.localeCompare(b));
    if (over.length === 0) break;

    for (const team of over) {
      const candidates = nextGames
        .map((game, index) => ({ game, index }))
        .filter(({ game }) => (
          game.homeTeamId === team
          && (homeCounts.get(game.awayTeamId) || 0) < maxHome
        ))
        .sort((a, b) => (
          hash(`${seed}:flip:${a.game.id}`) - hash(`${seed}:flip:${b.game.id}`)
        ));
      const candidate = candidates[0];
      if (!candidate) continue;
      const oldHome = candidate.game.homeTeamId;
      const oldAway = candidate.game.awayTeamId;
      nextGames[candidate.index] = {
        ...candidate.game,
        homeTeamId: oldAway,
        awayTeamId: oldHome,
        id: gameId(seed, candidate.game.sequence, oldHome, oldAway),
      };
      homeCounts.set(oldHome, (homeCounts.get(oldHome) || 0) - 1);
      homeCounts.set(oldAway, (homeCounts.get(oldAway) || 0) + 1);
      changed = true;
    }
  }

  return nextGames;
}

export function generateSchedule(input: GenerateScheduleInput): NbaScheduleGame[] {
  assertValidInput(input);
  const teams = seededTeams(input.teams, input.seed);
  const target = input.gamesPerTeam;
  const home = new Map(teams.map(team => [team, 0]));
  const totalHomeGames = (teams.length * target) / 2;
  const baseHomeTarget = Math.floor(totalHomeGames / teams.length);
  const extraHomeTeams = totalHomeGames - baseHomeTarget * teams.length;
  const homeQuota = new Map(teams.map((team, index) => [
    team,
    baseHomeTarget + (index < extraHomeTeams ? 1 : 0),
  ]));
  const rounds = roundRobinRounds(teams);
  const games: NbaScheduleGame[] = [];

  for (let roundIndex = 0; roundIndex < target; roundIndex += 1) {
    const baseRound = rounds[roundIndex % rounds.length];
    const cycle = Math.floor(roundIndex / rounds.length);
    for (let pairingIndex = 0; pairingIndex < baseRound.length; pairingIndex += 1) {
      const [left, right] = baseRound[pairingIndex];
      const leftNeed = (homeQuota.get(left) || 0) - (home.get(left) || 0);
      const rightNeed = (homeQuota.get(right) || 0) - (home.get(right) || 0);
      const homeTeamId = leftNeed > rightNeed
        ? left
        : rightNeed > leftNeed
          ? right
          : (roundIndex + pairingIndex + cycle) % 2 === 0 ? left : right;
      const awayTeamId = homeTeamId === left ? right : left;
      const sequence = games.length + 1;
      games.push({
        id: gameId(input.seed, sequence, awayTeamId, homeTeamId),
        week: Math.ceil(sequence / Math.max(1, Math.floor(teams.length / 2))),
        sequence,
        homeTeamId,
        awayTeamId,
        status: 'scheduled',
      });
      home.set(homeTeamId, (home.get(homeTeamId) || 0) + 1);
    }
  }

  return rebalanceHomeGames(games, teams, target, input.seed);
}
