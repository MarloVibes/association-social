import {
  compareRosterPlayersByValue as compareNbaRosterPlayersByValue,
  matchesRosterPosition as matchesNbaRosterPosition,
  rosterPlayerValue as nbaRosterPlayerValue,
} from '@/domain/nba/rotation';

type Sport = 'nba' | 'madden' | 'mlb';

function normalizeSport(sport?: string | null): Sport {
  if (sport === 'madden' || sport === 'nfl') return 'madden';
  if (sport === 'mlb') return 'mlb';
  return 'nba';
}

function numberFrom(player: any, keys: string[], fallback = 0): number {
  for (const key of keys) {
    const direct = Number(player?.[key]);
    if (Number.isFinite(direct)) return direct;
    const rating = Number(player?.ratings?.[key]);
    if (Number.isFinite(rating)) return rating;
    const hidden = Number(player?.hidden?.[key]);
    if (Number.isFinite(hidden)) return hidden;
    const model = Number(player?.attribute_model?.[key]);
    if (Number.isFinite(model)) return model;
  }
  return fallback;
}

function clamp(value: number, min = 0, max = 100) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function baseRating(player: any) {
  return numberFrom(player, ['value', 'overall', 'rating'], 65);
}

function nflRosterValue(player: any): number {
  const position = String(player?.position || '').toUpperCase();
  const salarySignal = Math.min(7, numberFrom(player, ['salary', 'currentSalary', 'annualSalary'], 0) / 5_000_000);
  if (position === 'QB') {
    return baseRating(player) * 0.45
      + Math.min(34, numberFrom(player, ['passing_yards', 'passingYards'], 0) / 130)
      + Math.min(22, numberFrom(player, ['passing_tds', 'passingTds'], 0) * 0.62)
      + Math.min(10, numberFrom(player, ['rushing_yards', 'rushingYards'], 0) / 80)
      - Math.min(10, numberFrom(player, ['interceptions_thrown', 'interceptionsThrown'], 0) * 0.45)
      + salarySignal;
  }
  if (['HB', 'RB', 'FB'].includes(position)) {
    return baseRating(player) * 0.48
      + Math.min(26, numberFrom(player, ['rushing_yards', 'rushingYards'], 0) / 55)
      + Math.min(12, numberFrom(player, ['receiving_yards', 'receivingYards'], 0) / 70)
      + Math.min(10, numberFrom(player, ['rushing_tds', 'rushingTds'], 0) * 0.7)
      + salarySignal;
  }
  if (['WR', 'TE'].includes(position)) {
    return baseRating(player) * 0.48
      + Math.min(28, numberFrom(player, ['receiving_yards', 'receivingYards'], 0) / 48)
      + Math.min(12, numberFrom(player, ['receptions'], 0) / 8)
      + Math.min(11, numberFrom(player, ['receiving_tds', 'receivingTds'], 0) * 0.8)
      + salarySignal;
  }
  if (['DE', 'EDGE', 'DT', 'NT', 'DL', 'LB', 'ILB', 'OLB', 'MLB', 'LOLB', 'ROLB'].includes(position)) {
    return baseRating(player) * 0.5
      + Math.min(26, numberFrom(player, ['sacks'], 0) * 1.6)
      + Math.min(12, numberFrom(player, ['tackles'], 0) / 7)
      + Math.min(8, numberFrom(player, ['forced_fumbles', 'forcedFumbles'], 0) * 1.2)
      + salarySignal;
  }
  if (['CB', 'FS', 'SS', 'S', 'DB'].includes(position)) {
    return baseRating(player) * 0.5
      + Math.min(20, numberFrom(player, ['interceptions'], 0) * 3)
      + Math.min(12, numberFrom(player, ['tackles'], 0) / 7)
      + Math.min(8, numberFrom(player, ['forced_fumbles', 'forcedFumbles'], 0) * 1.1)
      + salarySignal;
  }
  return baseRating(player) * 0.7 + salarySignal;
}

function mlbRosterValue(player: any): number {
  const position = String(player?.position || '').toUpperCase();
  const isPitcher = ['P', 'SP', 'RP', 'CP', 'LHP', 'RHP'].includes(position);
  const salarySignal = Math.min(7, numberFrom(player, ['salary', 'currentSalary', 'annualSalary'], 0) / 4_000_000);
  if (isPitcher) {
    const era = numberFrom(player, ['era'], 0);
    const whip = numberFrom(player, ['whip'], 0);
    const prevention = era > 0 ? clamp(26 - era * 3.8, 0, 22) : 8;
    const traffic = whip > 0 ? clamp(16 - whip * 7, 0, 12) : 5;
    return baseRating(player) * 0.46
      + prevention
      + traffic
      + Math.min(24, numberFrom(player, ['so', 'strikeouts'], 0) / 10)
      + Math.min(10, numberFrom(player, ['saves', 'sv'], 0) / 4)
      + salarySignal;
  }
  const avg = numberFrom(player, ['avg', 'batting_avg'], 0);
  const obp = numberFrom(player, ['obp'], 0);
  const slg = numberFrom(player, ['slg'], 0);
  return baseRating(player) * 0.42
    + Math.min(24, numberFrom(player, ['hr', 'home_runs'], 0) * 0.56)
    + Math.min(18, numberFrom(player, ['rbi'], 0) / 7)
    + Math.min(14, avg > 0 ? avg * 42 : 0)
    + Math.min(12, obp > 0 ? obp * 28 : 0)
    + Math.min(14, slg > 0 ? slg * 22 : 0)
    + Math.min(8, numberFrom(player, ['sb', 'stolen_bases'], 0) / 5)
    + salarySignal;
}

export function sportRosterPlayerValue(player: any, sport?: string | null): number {
  const normalized = normalizeSport(sport || player?.sport);
  if (normalized === 'madden') return nflRosterValue(player);
  if (normalized === 'mlb') return mlbRosterValue(player);
  return nbaRosterPlayerValue(player);
}

export function compareSportRosterPlayersByValue(sport?: string | null) {
  const normalized = normalizeSport(sport);
  if (normalized === 'nba') return compareNbaRosterPlayersByValue;
  return (left: any, right: any) => (
    sportRosterPlayerValue(right, normalized) - sportRosterPlayerValue(left, normalized)
    || String(left?.full_name || left?.name || '').localeCompare(String(right?.full_name || right?.name || ''))
  );
}

export function matchesSportRosterPosition(player: any, filter: string, sport?: string | null): boolean {
  if (!filter || filter === 'ALL') return true;
  if (normalizeSport(sport) === 'nba') return matchesNbaRosterPosition(player, filter);
  return String(player?.position || '').toUpperCase() === String(filter || '').toUpperCase();
}
