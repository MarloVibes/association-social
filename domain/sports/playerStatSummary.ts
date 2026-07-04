type Sport = 'nba' | 'madden' | 'mlb';

function normalizeSport(sport?: string | null): Sport {
  if (sport === 'nfl' || sport === 'madden') return 'madden';
  if (sport === 'mlb') return 'mlb';
  return 'nba';
}

function statSource(player: Record<string, any>) {
  return player.seasonStats || player.stats || player.seasons?.[0] || player || {};
}

function firstValue(source: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
  }
  return 0;
}

function formatAverage(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0';
  return numeric.toFixed(3).replace(/^0/, '');
}

function formatLine(source: Record<string, any>, fields: [string[], string, 'average'?][]) {
  return fields.map(([keys, label, format]) => {
    const value = firstValue(source, keys);
    return `${format === 'average' ? formatAverage(value) : value || 0} ${label}`;
  }).join(' · ');
}

function footballFields(position: string): [string[], string][] {
  if (position === 'QB') {
    return [
      [['passingYards', 'passing_yards', 'passYards'], 'PASS YDS'],
      [['passingTouchdowns', 'passing_tds', 'passTds'], 'PASS TD'],
      [['interceptionsThrown', 'interceptions_thrown', 'intThrown'], 'INT'],
    ];
  }
  if (['HB', 'RB', 'FB'].includes(position)) {
    return [
      [['rushingYards', 'rushing_yards', 'rushYards'], 'RUSH YDS'],
      [['rushingTouchdowns', 'rushing_tds', 'rushTds'], 'RUSH TD'],
      [['receptions'], 'REC'],
    ];
  }
  if (['WR', 'TE'].includes(position)) {
    return [
      [['receivingYards', 'receiving_yards', 'recYards'], 'REC YDS'],
      [['receptions'], 'REC'],
      [['receivingTouchdowns', 'receiving_tds', 'recTds'], 'REC TD'],
    ];
  }
  if (position === 'K') return [[['fieldGoalPct', 'field_goal_pct'], 'FG%'], [['games', 'gp'], 'GP']];
  if (position === 'P') return [[['puntAverage', 'punt_average'], 'PUNT AVG'], [['games', 'gp'], 'GP']];
  return [
    [['tackles'], 'TACKLES'],
    [['sacks'], 'SACKS'],
    [['interceptions', 'ints'], 'INT'],
  ];
}

export function playerStatSummary(player: Record<string, any>, sportInput?: string | null) {
  const sport = normalizeSport(sportInput);
  const source = statSource(player);
  if (sport === 'madden') {
    return formatLine(source, footballFields(String(player.position || '').toUpperCase()));
  }
  if (sport === 'mlb') {
    const position = String(player.position || '').toUpperCase();
    const pitcher = ['SP', 'RP', 'CP', 'P', 'TWP'].includes(position)
      || ['era', 'whip', 'wins', 'saves', 'inningsPitched', 'innings_pitched'].some(key => source[key] !== undefined);
    return pitcher
      ? formatLine(source, [[['era'], 'ERA'], [['whip'], 'WHIP'], [['strikeouts', 'so', 'k'], 'SO']])
      : formatLine(source, [[['avg', 'battingAverage', 'batting_avg'], 'AVG', 'average'], [['homeRuns', 'home_runs', 'hr'], 'HR'], [['rbi'], 'RBI']]);
  }
  return formatLine(source, [
    [['ppg', 'pointsPerGame', 'points'], 'PPG'],
    [['rpg', 'reboundsPerGame', 'rebounds', 'reb'], 'RPG'],
    [['apg', 'assistsPerGame', 'assists', 'ast'], 'APG'],
  ]);
}
