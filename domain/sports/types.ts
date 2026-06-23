export type SportKey = 'nba' | 'madden' | 'mlb';

export type FinanceMode = 'nba_cap' | 'hard_cap' | 'team_budget';

export interface SportRules {
  key: SportKey;
  teamCount: number;
  standardRosterLimit: number;
  twoWayLimit: number;
  draftRounds: number;
  initialSeasonYear: number;
  financeMode: FinanceMode;
  defaultDraftTimerSeconds: number;
}
