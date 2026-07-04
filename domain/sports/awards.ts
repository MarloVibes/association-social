import {
  NBA_AWARD_CATEGORIES,
  recordsForAward,
  type NbaAwardCategory,
  type NbaAwardRecord,
} from '@/domain/nba/awards';
import { displayScheduleAbbr, displayScheduleName } from '@/domain/nba/scheduleView';

export type SportAwardCategory = NbaAwardCategory;
export type SportAwardRecord = NbaAwardRecord;
type SportAwardKind = SportAwardCategory['kind'];

type AwardParticipant = {
  id?: string | null;
  scheduleTeamId?: string | null;
  teamId?: string | null;
  abbreviation?: string | null;
  abbr?: string | null;
  name?: string | null;
  full_name?: string | null;
  players?: any[];
};

type SportAwardContext = {
  currentYear?: string | number | null;
  includeProjected?: boolean;
  teams?: AwardParticipant[];
  standings?: any[];
  schedule?: {
    participants?: AwardParticipant[];
    playoffs?: {
      rounds?: Array<{
        name?: string | null;
        series?: Array<{
          homeTeamId?: string | null;
          awayTeamId?: string | null;
          homeTeamName?: string | null;
          awayTeamName?: string | null;
          winnerTeamId?: string | null;
        }>;
      }>;
    } | null;
  } | null;
};

const NFL_AWARD_CATEGORIES: readonly SportAwardCategory[] = Object.freeze([
  category('championship', 'Super Bowl Championships', 'Rings', 'championship', 'League champions and title rings by season.', 'RING'),
  category('super_bowl_mvp', 'Super Bowl MVP', 'SB MVP', 'player', 'Best player of the championship game.', 'SBMVP'),
  category('mvp', 'NFL Most Valuable Player', 'MVP', 'player', 'Regular season most valuable player.', 'MVP'),
  category('opoy', 'Offensive Player of the Year', 'OPOY', 'player', 'Top offensive player in the league.', 'OPOY'),
  category('dpoy', 'Defensive Player of the Year', 'DPOY', 'player', 'Top defensive player in the league.', 'DPOY'),
  category('roy', 'Rookie of the Year', 'ROY', 'player', 'Top first-year player.', 'ROY'),
  category('coach', 'Coach of the Year', 'COY', 'coach', 'Top coaching season.', 'COY'),
  category('all_pro', 'All-Pro Team', 'All-Pro', 'team', 'Best players at their positions.', 'ALL'),
  category('pro_bowl', 'Pro Bowl', 'Pro Bowl', 'player', 'Season Pro Bowl selections.', 'STAR'),
]);

const MLB_AWARD_CATEGORIES: readonly SportAwardCategory[] = Object.freeze([
  category('championship', 'World Series Championships', 'Rings', 'championship', 'League champions and title rings by season.', 'RING'),
  category('world_series_mvp', 'World Series MVP', 'WS MVP', 'player', 'Best player of the championship series.', 'WSMVP'),
  category('mvp', 'Most Valuable Player', 'MVP', 'player', 'Top regular season player.', 'MVP'),
  category('cy_young', 'Cy Young Award', 'Cy Young', 'player', 'Top pitcher in the league.', 'CY'),
  category('roy', 'Rookie of the Year', 'ROY', 'player', 'Top first-year player.', 'ROY'),
  category('reliever', 'Reliever of the Year', 'Reliever', 'player', 'Top late-inning pitcher.', 'REL'),
  category('gold_glove', 'Gold Glove', 'Gold Glove', 'team', 'Top defensive players by position.', 'GOLD'),
  category('silver_slugger', 'Silver Slugger', 'Slugger', 'team', 'Top hitters by position.', 'BAT'),
  category('all_star', 'MLB All-Star', 'All-Star', 'player', 'All-Star selections by season.', 'STAR'),
]);

function category(key: string, title: string, shortTitle: string, kind: SportAwardKind, description: string, symbol: string): SportAwardCategory {
  return { key, title, shortTitle, kind, description, symbol };
}

function normalizeSport(sport?: string | null): 'nba' | 'madden' | 'mlb' {
  if (sport === 'nfl' || sport === 'madden') return 'madden';
  if (sport === 'mlb') return 'mlb';
  return 'nba';
}

export function awardCategoriesForSport(sport?: string | null): readonly SportAwardCategory[] {
  const normalized = normalizeSport(sport);
  if (normalized === 'madden') return NFL_AWARD_CATEGORIES;
  if (normalized === 'mlb') return MLB_AWARD_CATEGORIES;
  return NBA_AWARD_CATEGORIES;
}

function numberFrom(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalize(value?: string | null) {
  return String(value || '').trim().toUpperCase();
}

function normalizeRecord(value: any): SportAwardRecord | null {
  if (!value) return null;
  if (typeof value === 'string') return { winnerName: value };
  if (typeof value !== 'object') return null;
  return {
    season: value.season || value.year || value.currentYear || null,
    winnerName: value.winnerName || value.playerName || value.name || value.gmName || null,
    teamName: value.teamName || value.team || null,
    teamAbbr: value.teamAbbr || value.abbreviation || null,
    note: value.note || value.result || value.round || null,
  };
}

function recordsFromSource(source: any, key: string): SportAwardRecord[] {
  const raw = source?.[key];
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(normalizeRecord).filter(Boolean) as SportAwardRecord[];
  if (typeof raw === 'object') return Object.values(raw).map(normalizeRecord).filter(Boolean) as SportAwardRecord[];
  const record = normalizeRecord(raw);
  return record ? [record] : [];
}

function playerName(player: any) {
  return player?.full_name || player?.name || player?.winnerName || 'Unnamed Player';
}

function playerStats(player: any) {
  return player?.seasonStats || player?.stats || player || {};
}

function metric(player: any, keys: string | string[]) {
  const stats = playerStats(player);
  const candidates = Array.isArray(keys) ? keys : [keys];
  for (const key of candidates) {
    const value = numberFrom(stats[key]);
    if (value !== 0) return value;
  }
  return 0;
}

function isRookie(player: any) {
  return Boolean(
    player?.rookie
    || player?.isRookie
    || (player && Object.prototype.hasOwnProperty.call(player, 'yearsPro') && numberFrom(player.yearsPro) === 0)
    || (player && Object.prototype.hasOwnProperty.call(player, 'seasonsPlayed') && numberFrom(player.seasonsPlayed) === 0)
  );
}

function awardPool(context?: SportAwardContext) {
  return (context?.teams || []).flatMap(team => (team.players || []).map(player => ({
    player,
    team,
    games: metric(player, ['games', 'gp', 'gamesPlayed']),
  }))).filter(item => item.games > 0);
}

function teamLabel(team: AwardParticipant) {
  return {
    name: displayScheduleName(team),
    abbr: displayScheduleAbbr(team.abbreviation || team.abbr || team.teamId || team.scheduleTeamId || team.id),
  };
}

function recordForPlayer(item: { player: any; team: AwardParticipant }, season: SportAwardContext['currentYear'], note: string): SportAwardRecord {
  const team = teamLabel(item.team);
  return {
    season: season || null,
    winnerName: playerName(item.player),
    teamName: team.name,
    teamAbbr: team.abbr,
    note,
  };
}

function topPlayers(context: SportAwardContext | undefined, scorer: (item: { player: any; team: AwardParticipant; games: number }) => number, limit = 1) {
  return awardPool(context)
    .sort((left, right) => (
      scorer(right) - scorer(left)
      || right.games - left.games
      || playerName(left.player).localeCompare(playerName(right.player))
    ))
    .slice(0, limit);
}

function filteredContext(context: SportAwardContext | undefined, predicate: (player: any) => boolean): SportAwardContext | undefined {
  if (!context?.teams) return context;
  return {
    ...context,
    teams: context.teams.map(team => ({
      ...team,
      players: (team.players || []).filter(predicate),
    })),
  };
}

function nflOffenseScore(player: any) {
  return metric(player, ['passingYards', 'passing_yards', 'passYards']) * 0.04
    + metric(player, ['passingTouchdowns', 'passing_tds', 'passTds']) * 4
    - metric(player, ['interceptionsThrown', 'interceptions_thrown', 'intThrown']) * 2
    + metric(player, ['rushingYards', 'rushing_yards', 'rushYards']) * 0.02
    + metric(player, ['rushingTouchdowns', 'rushing_tds', 'rushTds']) * 3
    + metric(player, ['receivingYards', 'receiving_yards', 'recYards']) * 0.02
    + metric(player, ['receivingTouchdowns', 'receiving_tds', 'recTds']) * 3
    + metric(player, ['receptions']) * 0.5;
}

function nflDefenseScore(player: any) {
  return metric(player, ['tackles']) * 0.25
    + metric(player, ['sacks']) * 4
    + metric(player, ['interceptions', 'ints']) * 5
    + metric(player, ['forcedFumbles', 'forced_fumbles']) * 4;
}

function mlbHitterScore(player: any) {
  return metric(player, ['avg', 'battingAverage', 'batting_avg']) * 180
    + metric(player, ['obp']) * 80
    + metric(player, ['slg']) * 80
    + metric(player, ['homeRuns', 'home_runs', 'hr']) * 3
    + metric(player, ['rbi']) * 1
    + metric(player, ['runs']) * 0.8
    + metric(player, ['stolenBases', 'sb']) * 0.8;
}

function mlbPitcherScore(player: any) {
  return metric(player, ['wins']) * 4
    + metric(player, ['strikeouts', 'so', 'k']) * 0.25
    + metric(player, ['saves']) * 1.25
    - metric(player, ['era']) * 12
    - metric(player, ['whip']) * 8;
}

function projectedSportAwardRecords(sport: 'madden' | 'mlb', key: string, context?: SportAwardContext): SportAwardRecord[] {
  if (!context?.teams?.length) return [];
  if (sport === 'madden') {
    if (key === 'mvp') return topPlayers(context, item => nflOffenseScore(item.player) + nflDefenseScore(item.player) * 0.35).map(item => recordForPlayer(item, context.currentYear, 'Projected NFL MVP'));
    if (key === 'opoy') return topPlayers(context, item => nflOffenseScore(item.player)).map(item => recordForPlayer(item, context.currentYear, 'Projected OPOY'));
    if (key === 'dpoy') return topPlayers(context, item => nflDefenseScore(item.player)).map(item => recordForPlayer(item, context.currentYear, 'Projected DPOY'));
    if (key === 'roy') return topPlayers(filteredContext(context, isRookie), item => nflOffenseScore(item.player) + nflDefenseScore(item.player)).map(item => recordForPlayer(item, context.currentYear, 'Projected ROY'));
    if (key === 'all_pro') return topPlayers(context, item => nflOffenseScore(item.player) + nflDefenseScore(item.player), 5).map((item, index) => recordForPlayer(item, context.currentYear, `Projected All-Pro ${index + 1}`));
    if (key === 'pro_bowl') return topPlayers(context, item => nflOffenseScore(item.player) + nflDefenseScore(item.player), 12).map(item => recordForPlayer(item, context.currentYear, 'Projected Pro Bowl'));
    return [];
  }
  if (key === 'mvp') return topPlayers(context, item => mlbHitterScore(item.player) + Math.max(0, mlbPitcherScore(item.player) * 0.4)).map(item => recordForPlayer(item, context.currentYear, 'Projected MVP'));
  if (key === 'cy_young') return topPlayers(context, item => mlbPitcherScore(item.player)).map(item => recordForPlayer(item, context.currentYear, 'Projected Cy Young'));
  if (key === 'roy') return topPlayers(filteredContext(context, isRookie), item => Math.max(mlbHitterScore(item.player), mlbPitcherScore(item.player))).map(item => recordForPlayer(item, context.currentYear, 'Projected ROY'));
  if (key === 'reliever') return topPlayers(context, item => metric(item.player, ['saves']) * 3 + metric(item.player, ['holds']) * 1.5 - metric(item.player, ['era']) * 5).map(item => recordForPlayer(item, context.currentYear, 'Projected Reliever'));
  if (key === 'gold_glove') return topPlayers(context, item => metric(item.player, ['fieldingPct', 'fielding_pct']) * 100 + metric(item.player, ['defensiveRunsSaved', 'drs']) + metric(item.player, ['assists']) * 0.05, 5).map((item, index) => recordForPlayer(item, context.currentYear, `Projected Gold Glove ${index + 1}`));
  if (key === 'silver_slugger') return topPlayers(context, item => mlbHitterScore(item.player), 5).map((item, index) => recordForPlayer(item, context.currentYear, `Projected Silver Slugger ${index + 1}`));
  if (key === 'all_star') return topPlayers(context, item => Math.max(mlbHitterScore(item.player), mlbPitcherScore(item.player)), 12).map(item => recordForPlayer(item, context.currentYear, 'Projected All-Star'));
  return [];
}

function scheduleChampionshipRecord(sport: 'madden' | 'mlb', context?: SportAwardContext): SportAwardRecord[] {
  const finalRound = [...(context?.schedule?.playoffs?.rounds || [])]
    .reverse()
    .find(round => normalize(round.name) === 'FINAL' || normalize(round.name).includes('CHAMPIONSHIP'));
  const finalSeries = finalRound?.series?.find(series => series.winnerTeamId);
  if (!finalSeries?.winnerTeamId) return [];
  const homeWon = normalize(finalSeries.homeTeamId) === normalize(finalSeries.winnerTeamId);
  const championId = homeWon ? finalSeries.homeTeamId : finalSeries.awayTeamId;
  const championName = homeWon ? finalSeries.homeTeamName : finalSeries.awayTeamName;
  const participant = (context?.schedule?.participants || []).find(team => (
    [team.scheduleTeamId, team.teamId, team.abbreviation, team.abbr, team.id].map(normalize).includes(normalize(championId))
  ));
  const fallback = participant || { abbreviation: championId, name: championName };
  const label = teamLabel(fallback);
  return [{
    season: context?.currentYear || null,
    winnerName: championName || label.name || championId,
    teamName: championName || label.name || championId,
    teamAbbr: label.abbr || championId || null,
    note: sport === 'madden' ? 'Super Bowl Champion' : 'World Series Champion',
  }];
}

export function recordsForSportAward(
  sportInput: string | null | undefined,
  league: any,
  key: string,
  context?: SportAwardContext,
): SportAwardRecord[] {
  const sport = normalizeSport(sportInput);
  if (sport === 'nba') return recordsForAward(league, key, context as any);
  return [
    ...recordsFromSource(league?.awards, key),
    ...recordsFromSource(league?.awardHistory, key),
    ...recordsFromSource(league?.trophyCase, key),
    ...recordsFromSource(league?.seasonAwards, key),
    ...(key === 'championship' ? scheduleChampionshipRecord(sport, context) : []),
    ...(context?.includeProjected === false ? [] : projectedSportAwardRecords(sport, key, context)),
  ];
}
