export type BasketballPlayerLeaderboardStat = 'ppg' | 'rpg' | 'apg' | 'spg' | 'bpg';

export type BasketballPlayerLeaderboardRow = {
  playerId: string;
  name: string;
  position: string;
  teamId: string;
  teamName: string;
  teamAbbreviation: string;
  games: number;
  value: number;
  valueText: string;
  player: Record<string, unknown>;
};

type LeaderboardTeam = {
  id?: string;
  teamId?: string;
  name?: string;
  abbreviation?: string;
  players?: Record<string, unknown>[];
};

const STAT_TOTAL_KEYS: Record<BasketballPlayerLeaderboardStat, string[]> = {
  ppg: ['points', 'pts'],
  rpg: ['rebounds', 'reb'],
  apg: ['assists', 'ast'],
  spg: ['steals', 'stl'],
  bpg: ['blocks', 'blk'],
};

const STAT_AVERAGE_KEYS: Record<BasketballPlayerLeaderboardStat, string[]> = {
  ppg: ['ppg', 'pointsPerGame'],
  rpg: ['rpg', 'reboundsPerGame'],
  apg: ['apg', 'assistsPerGame'],
  spg: ['spg', 'stealsPerGame'],
  bpg: ['bpg', 'blocksPerGame'],
};

function numberFrom(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function firstNumber(source: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = numberFrom(source[key]);
    if (value !== null) return value;
  }
  return null;
}

function playerKey(player: Record<string, unknown>, fallback: string) {
  return String(player.player_id || player.id || player.bref_id || player.full_name || player.name || fallback);
}

function playerStats(player: Record<string, unknown>) {
  return (player.seasonStats && typeof player.seasonStats === 'object'
    ? player.seasonStats
    : player.stats && typeof player.stats === 'object'
      ? player.stats
      : player) as Record<string, unknown>;
}

function statAverage(stats: Record<string, unknown>, stat: BasketballPlayerLeaderboardStat): { games: number; value: number } | null {
  const games = firstNumber(stats, ['games', 'gp', 'gamesPlayed']) || 0;
  if (games <= 0) return null;
  const explicit = firstNumber(stats, STAT_AVERAGE_KEYS[stat]);
  if (explicit !== null) return { games, value: explicit };
  const total = firstNumber(stats, STAT_TOTAL_KEYS[stat]);
  if (total === null) return null;
  return { games, value: total / games };
}

export function buildBasketballPlayerLeaderboard({
  teams = [],
  stat = 'ppg',
  limit,
}: {
  teams?: LeaderboardTeam[];
  stat?: BasketballPlayerLeaderboardStat;
  limit?: number;
} = {}): BasketballPlayerLeaderboardRow[] {
  const rows: BasketballPlayerLeaderboardRow[] = [];

  teams.forEach((team, teamIndex) => {
    (team.players || []).forEach((player, playerIndex) => {
      const stats = playerStats(player);
      const average = statAverage(stats, stat);
      if (!average) return;
      rows.push({
        playerId: playerKey(player, `${teamIndex}-${playerIndex}`),
        name: String(player.full_name || player.name || 'Unknown Player'),
        position: String(player.position || '?'),
        teamId: String(team.id || team.teamId || team.abbreviation || ''),
        teamName: String(team.name || team.abbreviation || 'Team'),
        teamAbbreviation: String(team.abbreviation || team.teamId || team.id || 'TEAM'),
        games: average.games,
        value: average.value,
        valueText: average.value.toFixed(1),
        player,
      });
    });
  });

  const sorted = rows.sort((left, right) => (
    right.value - left.value
    || right.games - left.games
    || left.name.localeCompare(right.name)
  ));

  return typeof limit === 'number' && limit > 0 ? sorted.slice(0, limit) : sorted;
}
