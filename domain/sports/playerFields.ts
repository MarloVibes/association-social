export type PlayerEditorField = Readonly<{
  key: string;
  label: string;
}>;

export type PlayerEditorSchema = Readonly<{
  positions: readonly string[];
  stats: readonly PlayerEditorField[];
  awards: readonly PlayerEditorField[];
}>;

export const NBA_POSITIONS = Object.freeze(['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F']);

export const NFL_POSITIONS = Object.freeze([
  'QB', 'HB', 'RB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT', 'OL',
  'EDGE', 'DE', 'DT', 'NT', 'LOLB', 'ROLB', 'OLB', 'MLB', 'ILB', 'LB',
  'CB', 'FS', 'SS', 'S', 'DB', 'K', 'P', 'LS',
]);

export const MLB_POSITIONS = Object.freeze([
  'SP', 'RP', 'CP', 'P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF',
  'OF', 'DH', 'IF', 'UT', 'UTIL', 'TWP',
]);

const NBA_STATS = Object.freeze([
  { key: 'gp', label: 'GP' },
  { key: 'ppg', label: 'PPG' },
  { key: 'apg', label: 'APG' },
  { key: 'rpg', label: 'RPG' },
  { key: 'blk', label: 'BLK' },
  { key: 'stl', label: 'STL' },
  { key: 'fg_pct', label: 'FG%' },
  { key: 'three_pct', label: '3FG%' },
]);

const NBA_AWARDS = Object.freeze([
  { key: 'mvp', label: 'MVP' },
  { key: 'championship', label: 'Championship' },
  { key: 'dpoy', label: 'DPOY' },
  { key: 'all_nba_1st', label: 'All-NBA 1st Team' },
  { key: 'all_nba_2nd', label: 'All-NBA 2nd Team' },
  { key: 'all_nba_3rd', label: 'All-NBA 3rd Team' },
  { key: 'sixth_man', label: 'Sixth Man of the Year' },
  { key: 'mip', label: 'Most Improved Player' },
  { key: 'roy', label: 'Rookie of the Year' },
  { key: 'all_star', label: 'All-Star' },
]);

const NFL_STATS = Object.freeze([
  { key: 'gp', label: 'GP' },
  { key: 'passing_yards', label: 'Pass Yds' },
  { key: 'passing_tds', label: 'Pass TD' },
  { key: 'interceptions_thrown', label: 'INT Thrown' },
  { key: 'rushing_yards', label: 'Rush Yds' },
  { key: 'rushing_tds', label: 'Rush TD' },
  { key: 'receiving_yards', label: 'Rec Yds' },
  { key: 'receptions', label: 'REC' },
  { key: 'receiving_tds', label: 'Rec TD' },
  { key: 'tackles', label: 'Tackles' },
  { key: 'sacks', label: 'Sacks' },
  { key: 'interceptions', label: 'INT' },
  { key: 'forced_fumbles', label: 'FF' },
  { key: 'field_goal_pct', label: 'FG%' },
  { key: 'punt_average', label: 'Punt Avg' },
]);

const NFL_AWARDS = Object.freeze([
  { key: 'mvp', label: 'MVP' },
  { key: 'opoy', label: 'OPOY' },
  { key: 'dpoy', label: 'DPOY' },
  { key: 'roy', label: 'Rookie of the Year' },
  { key: 'pro_bowl', label: 'Pro Bowl' },
  { key: 'all_pro', label: 'All-Pro' },
  { key: 'championship', label: 'Championship' },
]);

const MLB_STATS = Object.freeze([
  { key: 'gp', label: 'GP' },
  { key: 'avg', label: 'AVG' },
  { key: 'obp', label: 'OBP' },
  { key: 'slg', label: 'SLG' },
  { key: 'hr', label: 'HR' },
  { key: 'rbi', label: 'RBI' },
  { key: 'runs', label: 'R' },
  { key: 'sb', label: 'SB' },
  { key: 'wins', label: 'W' },
  { key: 'losses', label: 'L' },
  { key: 'era', label: 'ERA' },
  { key: 'whip', label: 'WHIP' },
  { key: 'so', label: 'SO' },
  { key: 'saves', label: 'SV' },
]);

const MLB_AWARDS = Object.freeze([
  { key: 'mvp', label: 'MVP' },
  { key: 'cy_young', label: 'Cy Young' },
  { key: 'roy', label: 'Rookie of the Year' },
  { key: 'gold_glove', label: 'Gold Glove' },
  { key: 'silver_slugger', label: 'Silver Slugger' },
  { key: 'all_star', label: 'All-Star' },
  { key: 'championship', label: 'Championship' },
]);

const NBA_SCHEMA: PlayerEditorSchema = Object.freeze({
  positions: NBA_POSITIONS,
  stats: NBA_STATS,
  awards: NBA_AWARDS,
});

const NFL_SCHEMA: PlayerEditorSchema = Object.freeze({
  positions: NFL_POSITIONS,
  stats: NFL_STATS,
  awards: NFL_AWARDS,
});

const MLB_SCHEMA: PlayerEditorSchema = Object.freeze({
  positions: MLB_POSITIONS,
  stats: MLB_STATS,
  awards: MLB_AWARDS,
});

function normalizeSport(sport?: string | null) {
  if (sport === 'madden' || sport === 'nfl') return 'madden';
  if (sport === 'mlb') return 'mlb';
  return 'nba';
}

export function getPositionFilters(sport?: string | null): readonly string[] {
  return Object.freeze(['ALL', ...getPlayerEditorSchema(sport).positions]);
}

export function matchesPositionFilter(playerPosition: string, positionFilter: string): boolean {
  return positionFilter === 'ALL' || playerPosition === positionFilter;
}

export function getPlayerEditorSchema(sport?: string | null): PlayerEditorSchema {
  const normalizedSport = normalizeSport(sport);
  if (normalizedSport === 'madden') return NFL_SCHEMA;
  if (normalizedSport === 'mlb') return MLB_SCHEMA;
  return NBA_SCHEMA;
}
