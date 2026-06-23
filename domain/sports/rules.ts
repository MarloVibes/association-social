import type { SportKey, SportRules } from './types';

const SPORT_RULES: Readonly<Record<SportKey, SportRules>> = Object.freeze({
  nba: Object.freeze({
    key: 'nba',
    teamCount: 30,
    standardRosterLimit: 15,
    twoWayLimit: 3,
    draftRounds: 2,
    initialSeasonYear: 2025,
    financeMode: 'nba_cap',
    defaultDraftTimerSeconds: 120,
  }),
  madden: Object.freeze({
    key: 'madden',
    teamCount: 32,
    standardRosterLimit: 53,
    twoWayLimit: 0,
    draftRounds: 7,
    initialSeasonYear: 2025,
    financeMode: 'hard_cap',
    defaultDraftTimerSeconds: 120,
  }),
  mlb: Object.freeze({
    key: 'mlb',
    teamCount: 30,
    standardRosterLimit: 40,
    twoWayLimit: 0,
    draftRounds: 5,
    initialSeasonYear: 2026,
    financeMode: 'team_budget',
    defaultDraftTimerSeconds: 120,
  }),
});

function normalizeSport(sport?: string | null): SportKey {
  if (sport === 'nfl') {
    return 'madden';
  }

  if (sport === 'nba' || sport === 'madden' || sport === 'mlb') {
    return sport;
  }

  return 'nba';
}

export function getSportRules(sport?: string | null): SportRules {
  return SPORT_RULES[normalizeSport(sport)];
}

export function seasonLabel(sport: SportKey | string | null, year: number): string {
  if (normalizeSport(sport) === 'nba') {
    return `${year}-${String(year + 1).slice(-2)}`;
  }

  return String(year);
}

export function buildLeagueDefaults(sportInput?: string | null) {
  const rules = getSportRules(sportInput);
  const currentYear = rules.initialSeasonYear;

  return {
    maxMembers: rules.teamCount,
    currentYear,
    currentSeason: seasonLabel(rules.key, currentYear),
    rosterLimit: rules.standardRosterLimit,
    twoWayLimit: rules.twoWayLimit,
    draftRounds: rules.draftRounds,
    draftTimerSeconds: rules.defaultDraftTimerSeconds,
    financeMode: rules.financeMode,
  };
}
