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
    defaultFinanceLimit: 154_647_000,
    defaultDraftTimerSeconds: 80,
  }),
  madden: Object.freeze({
    key: 'madden',
    teamCount: 32,
    standardRosterLimit: 53,
    twoWayLimit: 0,
    draftRounds: 7,
    initialSeasonYear: 2025,
    financeMode: 'hard_cap',
    defaultFinanceLimit: 279_200_000,
    defaultDraftTimerSeconds: 80,
  }),
  mlb: Object.freeze({
    key: 'mlb',
    teamCount: 30,
    standardRosterLimit: 40,
    twoWayLimit: 0,
    draftRounds: 5,
    initialSeasonYear: 2026,
    financeMode: 'team_budget',
    defaultFinanceLimit: 244_000_000,
    defaultDraftTimerSeconds: 80,
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

export function getChannelTheme(sport?: string | null): 'court' | 'field' | 'diamond' {
  const normalized = normalizeSport(sport);
  if (normalized === 'madden') return 'field';
  if (normalized === 'mlb') return 'diamond';
  return 'court';
}

export function seasonLabel(sport: SportKey | string | null, year: number): string {
  if (normalizeSport(sport) === 'nba') {
    return `${year}-${String(year + 1).slice(-2)}`;
  }

  return String(year);
}

export function defaultScheduleGamesPerTeam(sportInput?: string | null): number {
  const sport = normalizeSport(sportInput);
  if (sport === 'madden') return 17;
  if (sport === 'mlb') return 162;
  return 29;
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
    defaultFinanceLimit: rules.defaultFinanceLimit,
    gamesPerTeam: defaultScheduleGamesPerTeam(rules.key),
  };
}
