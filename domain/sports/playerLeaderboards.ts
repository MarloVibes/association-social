import { displayScheduleAbbr, displayScheduleTeamLabel } from '@/domain/nba/scheduleView';

export type SportPlayerLeaderboardStat =
  | 'ppg'
  | 'rpg'
  | 'apg'
  | 'spg'
  | 'bpg'
  | 'passYds'
  | 'passTd'
  | 'rushYds'
  | 'recYds'
  | 'sacks'
  | 'ints'
  | 'avg'
  | 'hr'
  | 'rbi'
  | 'era'
  | 'whip'
  | 'so';

export type SportPlayerLeaderboardRow = {
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

export type SportPlayerLeaderboardTab = {
  key: SportPlayerLeaderboardStat;
  label: string;
};

export type LeaderboardTeam = {
  id?: string;
  teamId?: string;
  name?: string;
  abbreviation?: string;
  players?: Record<string, unknown>[];
};

type BoxScoreSide = {
  teamId?: string;
  teamName?: string;
  teamAbbreviation?: string;
  abbreviation?: string;
  players?: Record<string, unknown>[];
};

type BoxScoreGame = {
  status?: string;
  id?: string;
  homeTeamId?: string;
  awayTeamId?: string;
  boxScore?: {
    home?: BoxScoreSide;
    away?: BoxScoreSide;
  };
};

type StatDefinition = {
  keys?: string[];
  averageKeys?: string[];
  compute?: (stats: Record<string, unknown>) => number | null;
  lowerIsBetter?: boolean;
  format?: 'decimal1' | 'integer' | 'average' | 'decimal2';
};

const NBA_TABS: SportPlayerLeaderboardTab[] = [
  { key: 'ppg', label: 'PPG' },
  { key: 'rpg', label: 'RPG' },
  { key: 'apg', label: 'APG' },
  { key: 'spg', label: 'SPG' },
  { key: 'bpg', label: 'BPG' },
];

const MADDEN_TABS: SportPlayerLeaderboardTab[] = [
  { key: 'passYds', label: 'PASS YDS' },
  { key: 'passTd', label: 'PASS TD' },
  { key: 'rushYds', label: 'RUSH YDS' },
  { key: 'recYds', label: 'REC YDS' },
  { key: 'sacks', label: 'SACKS' },
  { key: 'ints', label: 'INT' },
];

const MLB_TABS: SportPlayerLeaderboardTab[] = [
  { key: 'avg', label: 'AVG' },
  { key: 'hr', label: 'HR' },
  { key: 'rbi', label: 'RBI' },
  { key: 'era', label: 'ERA' },
  { key: 'whip', label: 'WHIP' },
  { key: 'so', label: 'SO' },
];

const STAT_DEFINITIONS: Record<SportPlayerLeaderboardStat, StatDefinition> = {
  ppg: { keys: ['points', 'pts'], averageKeys: ['ppg', 'pointsPerGame'], format: 'decimal1' },
  rpg: { keys: ['rebounds', 'reb'], averageKeys: ['rpg', 'reboundsPerGame'], format: 'decimal1' },
  apg: { keys: ['assists', 'ast'], averageKeys: ['apg', 'assistsPerGame'], format: 'decimal1' },
  spg: { keys: ['steals', 'stl'], averageKeys: ['spg', 'stealsPerGame'], format: 'decimal1' },
  bpg: { keys: ['blocks', 'blk'], averageKeys: ['bpg', 'blocksPerGame'], format: 'decimal1' },
  passYds: { keys: ['passingYards', 'passing_yards', 'passYards'], format: 'integer' },
  passTd: { keys: ['passingTouchdowns', 'passing_tds', 'passTds'], format: 'integer' },
  rushYds: { keys: ['rushingYards', 'rushing_yards', 'rushYards'], format: 'integer' },
  recYds: { keys: ['receivingYards', 'receiving_yards', 'recYards'], format: 'integer' },
  sacks: { keys: ['sacks'], format: 'integer' },
  ints: { keys: ['interceptions', 'ints'], format: 'integer' },
  avg: {
    compute: stats => {
      const explicit = firstNumber(stats, ['avg', 'battingAverage', 'batting_avg']);
      if (explicit !== null) return explicit;
      const hits = firstNumber(stats, ['hits']);
      const atBats = firstNumber(stats, ['atBats', 'at_bats', 'ab']);
      return hits !== null && atBats !== null && atBats > 0 ? hits / atBats : null;
    },
    format: 'average',
  },
  hr: { keys: ['homeRuns', 'home_runs', 'hr'], format: 'integer' },
  rbi: { keys: ['rbi'], format: 'integer' },
  era: {
    compute: stats => {
      const explicit = firstNumber(stats, ['era']);
      if (explicit !== null) return explicit;
      const earnedRuns = firstNumber(stats, ['earnedRuns', 'earned_runs']);
      const innings = firstNumber(stats, ['inningsPitched', 'innings_pitched', 'ip']);
      return earnedRuns !== null && innings !== null && innings > 0 ? (earnedRuns * 9) / innings : null;
    },
    lowerIsBetter: true,
    format: 'decimal2',
  },
  whip: {
    compute: stats => {
      const explicit = firstNumber(stats, ['whip']);
      if (explicit !== null) return explicit;
      const walks = firstNumber(stats, ['walks', 'bb']);
      const hitsAllowed = firstNumber(stats, ['hitsAllowed', 'hits_allowed', 'ha']) || 0;
      const innings = firstNumber(stats, ['inningsPitched', 'innings_pitched', 'ip']);
      return walks !== null && innings !== null && innings > 0 ? (walks + hitsAllowed) / innings : null;
    },
    lowerIsBetter: true,
    format: 'decimal2',
  },
  so: { keys: ['strikeouts', 'so', 'k'], format: 'integer' },
};

function normalizeSport(value?: string | null): 'nba' | 'madden' | 'mlb' {
  const sport = String(value || 'nba').toLowerCase();
  if (sport === 'nfl' || sport === 'madden') return 'madden';
  if (sport === 'mlb') return 'mlb';
  return 'nba';
}

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

function playerStats(player: Record<string, unknown>) {
  return (player.seasonStats && typeof player.seasonStats === 'object'
    ? player.seasonStats
    : player.stats && typeof player.stats === 'object'
      ? player.stats
      : player) as Record<string, unknown>;
}

function playerKey(player: Record<string, unknown>, fallback: string) {
  return String(player.player_id || player.id || player.bref_id || player.full_name || player.name || fallback);
}

function statValue(stats: Record<string, unknown>, stat: SportPlayerLeaderboardStat): { games: number; value: number } | null {
  const definition = STAT_DEFINITIONS[stat];
  const games = firstNumber(stats, ['games', 'gp', 'gamesPlayed']) || 0;
  if (games <= 0) return null;
  const explicitAverage = definition.averageKeys ? firstNumber(stats, definition.averageKeys) : null;
  if (explicitAverage !== null) return { games, value: explicitAverage };
  const value = definition.compute ? definition.compute(stats) : firstNumber(stats, definition.keys || []);
  if (value === null || value <= 0) return null;
  if (['ppg', 'rpg', 'apg', 'spg', 'bpg'].includes(stat) && definition.keys) return { games, value: value / games };
  return { games, value };
}

function formatValue(value: number, stat: SportPlayerLeaderboardStat) {
  const format = STAT_DEFINITIONS[stat].format || 'integer';
  if (format === 'average') return value.toFixed(3).replace(/^0/, '');
  if (format === 'decimal2') return value.toFixed(2);
  if (format === 'decimal1') return value.toFixed(1);
  return String(Math.round(value));
}

function addNumber(target: Record<string, unknown>, key: string, value: unknown) {
  const numeric = numberFrom(value);
  if (numeric === null) return;
  target[key] = numberFrom(target[key]) || 0;
  target[key] = Number(target[key]) + numeric;
}

function boxScoreTeamId(game: BoxScoreGame, side: 'home' | 'away') {
  const boxSide = game.boxScore?.[side];
  return String(
    boxSide?.teamId
    || (side === 'home' ? game.homeTeamId : game.awayTeamId)
    || boxSide?.teamAbbreviation
    || boxSide?.abbreviation
    || `${game.id || 'game'}-${side}`,
  );
}

function boxScoreTeamName(teamId: string, boxSide: BoxScoreSide | undefined, sport: string | null | undefined) {
  return displayScheduleTeamLabel(
    boxSide?.teamName || boxSide?.teamAbbreviation || boxSide?.abbreviation || teamId,
    teamId,
    sport,
  );
}

const BOX_SCORE_NON_STAT_KEYS = new Set([
  'id',
  'playerId',
  'player_id',
  'bref_id',
  'name',
  'full_name',
  'position',
  'team',
  'teamId',
  'teamName',
  'teamAbbreviation',
  'abbreviation',
  'starter',
]);

export function teamsFromBoxScoreGames({
  games = [],
  sport = 'nba',
}: {
  games?: BoxScoreGame[];
  sport?: string | null;
} = {}): LeaderboardTeam[] {
  const teams = new Map<string, LeaderboardTeam>();
  const playerMaps = new Map<string, Map<string, Record<string, unknown>>>();

  games.forEach((game) => {
    if (game.status && game.status !== 'final') return;
    (['home', 'away'] as const).forEach((side) => {
      const boxSide = game.boxScore?.[side];
      if (!Array.isArray(boxSide?.players) || boxSide.players.length === 0) return;
      const teamId = boxScoreTeamId(game, side);
      const abbreviation = displayScheduleAbbr(boxSide.teamAbbreviation || boxSide.abbreviation || teamId);
      if (!teams.has(teamId)) {
        teams.set(teamId, {
          id: teamId,
          teamId,
          abbreviation,
          name: boxScoreTeamName(teamId, boxSide, sport),
          players: [],
        });
        playerMaps.set(teamId, new Map());
      }
      const team = teams.get(teamId);
      const playerMap = playerMaps.get(teamId);
      if (!team || !playerMap) return;

      boxSide.players.forEach((line, lineIndex) => {
        const key = playerKey(line, `${teamId}-${lineIndex}`);
        const existing = playerMap.get(key);
        const seasonStats = (existing?.seasonStats && typeof existing.seasonStats === 'object'
          ? existing.seasonStats
          : { games: 0 }) as Record<string, unknown>;
        seasonStats.games = (numberFrom(seasonStats.games) || 0) + 1;

        Object.entries(line).forEach(([statKey, value]) => {
          if (BOX_SCORE_NON_STAT_KEYS.has(statKey)) return;
          addNumber(seasonStats, statKey, value);
        });

        const player = {
          ...(existing || {}),
          ...line,
          player_id: line.player_id || line.playerId || line.id || key,
          full_name: line.full_name || line.name || existing?.full_name || 'Unknown Player',
          position: line.position || existing?.position || '?',
          team: abbreviation,
          seasonStats,
        };
        playerMap.set(key, player);
      });

      team.players = Array.from(playerMap.values());
    });
  });

  return Array.from(teams.values());
}

export function playerLeaderboardTabsForSport(sport?: string | null): SportPlayerLeaderboardTab[] {
  const normalized = normalizeSport(sport);
  if (normalized === 'madden') return MADDEN_TABS;
  if (normalized === 'mlb') return MLB_TABS;
  return NBA_TABS;
}

export function buildSportPlayerLeaderboard({
  teams = [],
  sport = 'nba',
  stat,
  limit,
}: {
  teams?: LeaderboardTeam[];
  sport?: string | null;
  stat?: SportPlayerLeaderboardStat;
  limit?: number;
} = {}): SportPlayerLeaderboardRow[] {
  const tabs = playerLeaderboardTabsForSport(sport);
  const statKey = stat && tabs.some(tab => tab.key === stat) ? stat : tabs[0].key;
  const rows: SportPlayerLeaderboardRow[] = [];

  teams.forEach((team, teamIndex) => {
    (team.players || []).forEach((player, playerIndex) => {
      const stats = playerStats(player);
      const value = statValue(stats, statKey);
      if (!value) return;
      rows.push({
        playerId: playerKey(player, `${teamIndex}-${playerIndex}`),
        name: String(player.full_name || player.name || 'Unknown Player'),
        position: String(player.position || '?'),
        teamId: String(team.id || team.teamId || team.abbreviation || ''),
        teamName: displayScheduleTeamLabel(team.name || team.abbreviation, team.teamId || team.id || 'Team', sport),
        teamAbbreviation: displayScheduleAbbr(team.abbreviation || team.teamId || team.id || 'TEAM'),
        games: value.games,
        value: value.value,
        valueText: formatValue(value.value, statKey),
        player,
      });
    });
  });

  const lowerIsBetter = STAT_DEFINITIONS[statKey].lowerIsBetter === true;
  const sorted = rows.sort((left, right) => (
    (lowerIsBetter ? left.value - right.value : right.value - left.value)
    || right.games - left.games
    || left.name.localeCompare(right.name)
  ));

  return typeof limit === 'number' && limit > 0 ? sorted.slice(0, limit) : sorted;
}
