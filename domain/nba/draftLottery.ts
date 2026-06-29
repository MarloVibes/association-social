import { createSeededRandom } from '@/domain/draft/random';
import type { StandingsRow } from './standings';

export const NBA_STANDARD_LOTTERY_ODDS = Object.freeze([
  140, 140, 140, 125, 105, 90, 75, 60, 45, 30, 20, 15, 10, 5,
]);

export type DraftLotteryPick = {
  pick: number;
  teamId: string;
  abbreviation: string;
  name: string;
  source: 'lottery_draw' | 'reverse_standings';
  originalSeed: number;
  odds: number;
};

export type DraftLotteryResult = {
  seed: string;
  odds: readonly number[];
  candidates: DraftLotteryPick[];
  drawnPicks: DraftLotteryPick[];
  picks: DraftLotteryPick[];
};

function key(value: string | null | undefined) {
  return String(value || '').trim().toUpperCase();
}

function sortedWorstFirst(standings: StandingsRow[]) {
  return [...standings].sort((a, b) => (
    a.pct - b.pct
    || a.wins - b.wins
    || a.pointDiff - b.pointDiff
    || a.abbreviation.localeCompare(b.abbreviation)
  ));
}

export function lotteryCandidatesFromStandings({
  standings,
  playoffTeamIds = [],
  lotteryCount = 14,
}: {
  standings: StandingsRow[];
  playoffTeamIds?: string[];
  lotteryCount?: number;
}): StandingsRow[] {
  const playoffKeys = new Set(playoffTeamIds.map(key).filter(Boolean));
  return sortedWorstFirst(standings)
    .filter(row => !playoffKeys.has(key(row.teamId)) && !playoffKeys.has(key(row.abbreviation)))
    .slice(0, lotteryCount);
}

function pickTemplate(row: StandingsRow, index: number): DraftLotteryPick {
  return {
    pick: index + 1,
    teamId: row.teamId,
    abbreviation: row.abbreviation,
    name: row.name,
    source: 'reverse_standings',
    originalSeed: index + 1,
    odds: NBA_STANDARD_LOTTERY_ODDS[index] || 0,
  };
}

function weightedIndex(random: () => number, weights: number[]) {
  const total = weights.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) return 0;
  let target = random() * total;
  for (let index = 0; index < weights.length; index += 1) {
    target -= Math.max(0, weights[index]);
    if (target <= 0) return index;
  }
  return weights.length - 1;
}

export function buildDraftLottery({
  standings,
  playoffTeamIds = [],
  seed,
  lotteryCount = 14,
  drawnPickCount = 4,
}: {
  standings: StandingsRow[];
  playoffTeamIds?: string[];
  seed: string;
  lotteryCount?: number;
  drawnPickCount?: number;
}): DraftLotteryResult {
  const candidates = lotteryCandidatesFromStandings({ standings, playoffTeamIds, lotteryCount })
    .map(pickTemplate);
  if (candidates.length === 0) {
    return { seed, odds: NBA_STANDARD_LOTTERY_ODDS, candidates, drawnPicks: [], picks: [] };
  }

  const random = createSeededRandom(seed);
  const pool = [...candidates];
  const drawnPicks: DraftLotteryPick[] = [];
  for (let pick = 1; pick <= Math.min(drawnPickCount, pool.length); pick += 1) {
    const index = weightedIndex(random, pool.map(candidate => candidate.odds));
    const [winner] = pool.splice(index, 1);
    drawnPicks.push({ ...winner, pick, source: 'lottery_draw' });
  }

  const remainingLottery = pool.map((candidate, index) => ({
    ...candidate,
    pick: drawnPicks.length + index + 1,
    source: 'reverse_standings' as const,
  }));
  const lotteryKeys = new Set(candidates.map(candidate => key(candidate.teamId)));
  const playoffKeys = new Set(playoffTeamIds.map(key).filter(Boolean));
  const nonLotteryOrder = sortedWorstFirst(standings)
    .filter(row => !lotteryKeys.has(key(row.teamId)))
    .filter(row => playoffKeys.size === 0 || playoffKeys.has(key(row.teamId)) || playoffKeys.has(key(row.abbreviation)))
    .map((row, index): DraftLotteryPick => ({
      pick: drawnPicks.length + remainingLottery.length + index + 1,
      teamId: row.teamId,
      abbreviation: row.abbreviation,
      name: row.name,
      source: 'reverse_standings',
      originalSeed: lotteryCount + index + 1,
      odds: 0,
    }));

  return {
    seed,
    odds: NBA_STANDARD_LOTTERY_ODDS,
    candidates,
    drawnPicks,
    picks: [...drawnPicks, ...remainingLottery, ...nonLotteryOrder],
  };
}
