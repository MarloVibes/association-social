export type BasketballSeasonStats = Record<string, unknown>;

export type SeasonStatItem = {
  label: string;
  value: string | number;
  kind: 'average' | 'percentage' | 'total';
};

function numberFrom(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function firstNumber(stats: BasketballSeasonStats, keys: string[]): number | null {
  for (const key of keys) {
    const value = numberFrom(stats[key]);
    if (value !== null) return value;
  }
  return null;
}

function perGame(stats: BasketballSeasonStats, totalKeys: string[], averageKeys: string[]): string | null {
  const explicit = firstNumber(stats, averageKeys);
  if (explicit !== null) return explicit.toFixed(1);
  const total = firstNumber(stats, totalKeys);
  const games = firstNumber(stats, ['games', 'gp', 'gamesPlayed']);
  if (total === null || !games || games <= 0) return null;
  return (total / games).toFixed(1);
}

function pct(stats: BasketballSeasonStats, pctKeys: string[], madeKeys: string[], attemptedKeys: string[]): string | null {
  const explicit = firstNumber(stats, pctKeys);
  if (explicit !== null) {
    const normalized = explicit > 1 ? explicit / 100 : explicit;
    return `${(normalized * 100).toFixed(1)}%`;
  }
  const made = firstNumber(stats, madeKeys);
  const attempted = firstNumber(stats, attemptedKeys);
  if (made === null || !attempted || attempted <= 0) return null;
  return `${((made / attempted) * 100).toFixed(1)}%`;
}

function item(label: string, value: string | null, kind: SeasonStatItem['kind']): SeasonStatItem | null {
  return value === null ? null : { label, value, kind };
}

export function basketballSeasonAverageItems(stats: BasketballSeasonStats): SeasonStatItem[] {
  return [
    item('PPG', perGame(stats, ['points', 'pts'], ['ppg', 'pointsPerGame']), 'average'),
    item('RPG', perGame(stats, ['rebounds', 'reb'], ['rpg', 'reboundsPerGame']), 'average'),
    item('APG', perGame(stats, ['assists', 'ast'], ['apg', 'assistsPerGame']), 'average'),
    item('SPG', perGame(stats, ['steals', 'stl'], ['spg', 'stealsPerGame']), 'average'),
    item('BPG', perGame(stats, ['blocks', 'blk'], ['bpg', 'blocksPerGame']), 'average'),
    item('TOV', perGame(stats, ['turnovers', 'to'], ['tov', 'turnoversPerGame']), 'average'),
    item('MPG', perGame(stats, ['minutes', 'min'], ['mpg', 'minutesPerGame']), 'average'),
    item('FG%', pct(stats, ['fgPct', 'fg_pct', 'fieldGoalPct'], ['fieldGoalsMade', 'fgm'], ['fieldGoalsAttempted', 'fga']), 'percentage'),
    item('3P%', pct(stats, ['threePct', 'fg3_pct', 'threePointPct'], ['threePointersMade', 'fg3m'], ['threePointersAttempted', 'fg3a']), 'percentage'),
    item('FT%', pct(stats, ['ftPct', 'ft_pct', 'freeThrowPct'], ['freeThrowsMade', 'ftm'], ['freeThrowsAttempted', 'fta']), 'percentage'),
  ].filter((entry): entry is SeasonStatItem => entry !== null);
}

export function basketballSeasonTotalItems(stats: BasketballSeasonStats): SeasonStatItem[] {
  return [
    { label: 'GP', value: firstNumber(stats, ['games', 'gp', 'gamesPlayed']) ?? 0, kind: 'total' },
    { label: 'Total Points', value: firstNumber(stats, ['points', 'pts']) ?? 0, kind: 'total' },
    { label: 'Total Rebounds', value: firstNumber(stats, ['rebounds', 'reb']) ?? 0, kind: 'total' },
    { label: 'Total Assists', value: firstNumber(stats, ['assists', 'ast']) ?? 0, kind: 'total' },
    { label: 'Total Steals', value: firstNumber(stats, ['steals', 'stl']) ?? 0, kind: 'total' },
    { label: 'Total Blocks', value: firstNumber(stats, ['blocks', 'blk']) ?? 0, kind: 'total' },
    { label: 'Total Turnovers', value: firstNumber(stats, ['turnovers', 'to']) ?? 0, kind: 'total' },
  ];
}
