export type SportKey = 'nba' | 'madden' | 'mlb';

export type FinanceMode = 'nba_cap' | 'hard_cap' | 'team_budget';

export interface SportRules {
  readonly key: SportKey;
  readonly teamCount: number;
  readonly standardRosterLimit: number;
  readonly twoWayLimit: number;
  readonly draftRounds: number;
  readonly initialSeasonYear: number;
  readonly financeMode: FinanceMode;
  readonly defaultDraftTimerSeconds: number;
}
