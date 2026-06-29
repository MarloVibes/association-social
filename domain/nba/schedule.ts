export type NbaScheduleGameStatus = 'scheduled' | 'requested' | 'preparing' | 'expired' | 'simulating' | 'in_progress' | 'final';

export type NbaScheduleGame = {
  id: string;
  week: number;
  sequence: number;
  stage?: 'regular' | 'playoffs' | string;
  homeTeamId: string;
  awayTeamId: string;
  homeGmId?: string | null;
  awayGmId?: string | null;
  homeScore?: number;
  awayScore?: number;
  winnerTeamId?: string;
  loserTeamId?: string;
  finalScoreSubmittedByUid?: string;
  finalAtMs?: number;
  simulationStartedByUid?: string;
  simulationStartedAtMs?: number;
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

function candidatePairings(teams: string[], seed: string, cycle: number): [string, string][] {
  const pairings: [string, string][] = [];
  for (let leftIndex = 0; leftIndex < teams.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < teams.length; rightIndex += 1) {
      pairings.push([teams[leftIndex], teams[rightIndex]]);
    }
  }
  return pairings.sort((a, b) => (
    hash(`${seed}:pair:${cycle}:${a[0]}:${a[1]}`) - hash(`${seed}:pair:${cycle}:${b[0]}:${b[1]}`)
    || a[0].localeCompare(b[0])
    || a[1].localeCompare(b[1])
  ));
}

function regularPairings(teams: string[], degree: number, seed: string): [string, string][] {
  if (degree <= 0) return [];
  if (degree >= teams.length) {
    throw new Error('Schedule length is too large for this team count.');
  }
  const remaining = new Map(teams.map(team => [team, degree]));
  const pairings: [string, string][] = [];
  let iteration = 0;

  while ([...remaining.values()].some(value => value > 0)) {
    const active = teams
      .filter(team => (remaining.get(team) || 0) > 0)
      .sort((a, b) => (
        (remaining.get(b) || 0) - (remaining.get(a) || 0)
        || hash(`${seed}:active:${iteration}:${a}`) - hash(`${seed}:active:${iteration}:${b}`)
        || a.localeCompare(b)
      ));
    const team = active[0];
    const needed = remaining.get(team) || 0;
    const opponents = active
      .slice(1)
      .sort((a, b) => (
        (remaining.get(b) || 0) - (remaining.get(a) || 0)
        || hash(`${seed}:opponent:${iteration}:${a}`) - hash(`${seed}:opponent:${iteration}:${b}`)
        || a.localeCompare(b)
      ))
      .slice(0, needed);
    if (opponents.length !== needed) {
      throw new Error('Unable to build a balanced NBA schedule for this team count and length.');
    }
    remaining.set(team, 0);
    opponents.forEach((opponent) => {
      const opponentRemaining = remaining.get(opponent) || 0;
      if (opponentRemaining <= 0) {
        throw new Error('Unable to build a balanced NBA schedule for this team count and length.');
      }
      remaining.set(opponent, opponentRemaining - 1);
      pairings.push([team, opponent]);
    });
    iteration += 1;
  }

  return pairings.sort((a, b) => (
    hash(`${seed}:order:${a[0]}:${a[1]}`) - hash(`${seed}:order:${b[0]}:${b[1]}`)
    || a[0].localeCompare(b[0])
    || a[1].localeCompare(b[1])
  ));
}

function buildPairings(teams: string[], target: number, seed: string): [string, string][] {
  const fullCycles = Math.floor(target / Math.max(1, teams.length - 1));
  const remainder = target % Math.max(1, teams.length - 1);
  const pairings: [string, string][] = [];
  for (let cycle = 0; cycle < fullCycles; cycle += 1) {
    pairings.push(...candidatePairings(teams, seed, cycle));
  }
  pairings.push(...regularPairings(teams, remainder, `${seed}:remainder:${fullCycles}`));
  return pairings;
}

type FlowEdge = { to: number; rev: number; cap: number };

function addFlowEdge(graph: FlowEdge[][], from: number, to: number, cap: number) {
  const forward: FlowEdge = { to, rev: graph[to].length, cap };
  const reverse: FlowEdge = { to: from, rev: graph[from].length, cap: 0 };
  graph[from].push(forward);
  graph[to].push(reverse);
}

function maxFlow(graph: FlowEdge[][], source: number, sink: number) {
  let flow = 0;
  while (true) {
    const parent = Array.from({ length: graph.length }, () => ({ node: -1, edge: -1 }));
    const queue = [source];
    parent[source] = { node: source, edge: -1 };
    for (let cursor = 0; cursor < queue.length && parent[sink].node < 0; cursor += 1) {
      const node = queue[cursor];
      graph[node].forEach((edge, edgeIndex) => {
        if (edge.cap > 0 && parent[edge.to].node < 0) {
          parent[edge.to] = { node, edge: edgeIndex };
          queue.push(edge.to);
        }
      });
    }
    if (parent[sink].node < 0) break;
    let add = 1;
    for (let node = sink; node !== source; node = parent[node].node) {
      const prev = parent[node];
      add = Math.min(add, graph[prev.node][prev.edge].cap);
    }
    for (let node = sink; node !== source; node = parent[node].node) {
      const prev = parent[node];
      const edge = graph[prev.node][prev.edge];
      edge.cap -= add;
      graph[edge.to][edge.rev].cap += add;
    }
    flow += add;
  }
  return flow;
}

function assignHomeTeams(pairings: [string, string][], teams: string[], seed: string) {
  const teamIndex = new Map(teams.map((team, index) => [team, index]));
  const totalHomeGames = pairings.length;
  const baseHomeTarget = Math.floor(totalHomeGames / teams.length);
  const extraHomeTeams = totalHomeGames - baseHomeTarget * teams.length;
  const source = 0;
  const gameOffset = 1;
  const teamOffset = gameOffset + pairings.length;
  const sink = teamOffset + teams.length;
  const graph: FlowEdge[][] = Array.from({ length: sink + 1 }, () => []);

  pairings.forEach(([left, right], index) => {
    const gameNode = gameOffset + index;
    addFlowEdge(graph, source, gameNode, 1);
    [left, right]
      .sort((a, b) => hash(`${seed}:home-flow:${index}:${a}`) - hash(`${seed}:home-flow:${index}:${b}`) || a.localeCompare(b))
      .forEach(team => addFlowEdge(graph, gameNode, teamOffset + (teamIndex.get(team) as number), 1));
  });
  teams.forEach((team, index) => {
    const quota = baseHomeTarget + (index < extraHomeTeams ? 1 : 0);
    addFlowEdge(graph, teamOffset + index, sink, quota);
  });

  if (maxFlow(graph, source, sink) !== pairings.length) {
    throw new Error('Unable to balance NBA home and away games.');
  }

  return pairings.map(([left, right], index) => {
    const gameNode = gameOffset + index;
    const used = graph[gameNode].find(edge => (
      edge.to >= teamOffset
      && edge.to < sink
      && edge.cap === 0
      && [left, right].includes(teams[edge.to - teamOffset])
    ));
    return used ? teams[used.to - teamOffset] : left;
  });
}

export function generateSchedule(input: GenerateScheduleInput): NbaScheduleGame[] {
  assertValidInput(input);
  const teams = seededTeams(input.teams, input.seed);
  const target = input.gamesPerTeam;
  const pairings = buildPairings(teams, target, input.seed);
  const homeTeams = assignHomeTeams(pairings, teams, input.seed);
  const games: NbaScheduleGame[] = [];

  pairings.forEach(([left, right], index) => {
    const homeTeamId = homeTeams[index];
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
  });

  for (const team of teams) {
    const appearances = games.filter(game => game.homeTeamId === team || game.awayTeamId === team).length;
    if (appearances !== target) {
      throw new Error('Unable to build a balanced NBA schedule for this team count and length.');
    }
  }

  return games;
}
