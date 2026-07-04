import { describe, expect, it } from 'vitest';

import { buildLeagueDefaults } from '../../domain/sports/rules';

describe('buildLeagueDefaults', () => {
  it('builds Madden league defaults', () => {
    expect(buildLeagueDefaults('madden')).toEqual({
      maxMembers: 32,
      currentYear: 2025,
      currentSeason: '2025',
      rosterLimit: 53,
      twoWayLimit: 0,
      draftRounds: 7,
      draftTimerSeconds: 80,
      financeMode: 'hard_cap',
      defaultFinanceLimit: 279_200_000,
      gamesPerTeam: 17,
    });
  });

  it('builds MLB league defaults', () => {
    expect(buildLeagueDefaults('mlb')).toEqual({
      maxMembers: 30,
      currentYear: 2026,
      currentSeason: '2026',
      rosterLimit: 40,
      twoWayLimit: 0,
      draftRounds: 5,
      draftTimerSeconds: 80,
      financeMode: 'team_budget',
      defaultFinanceLimit: 244_000_000,
      gamesPerTeam: 162,
    });
  });

  it('builds NBA league defaults', () => {
    expect(buildLeagueDefaults('nba')).toEqual({
      maxMembers: 30,
      currentYear: 2025,
      currentSeason: '2025-26',
      rosterLimit: 15,
      twoWayLimit: 3,
      draftRounds: 2,
      draftTimerSeconds: 80,
      financeMode: 'nba_cap',
      defaultFinanceLimit: 154_647_000,
      gamesPerTeam: 29,
    });
  });

  it('treats nfl as a Madden alias', () => {
    expect(buildLeagueDefaults('nfl')).toEqual(buildLeagueDefaults('madden'));
  });

  it('falls back to NBA defaults for unknown sports', () => {
    expect(buildLeagueDefaults('soccer')).toEqual(buildLeagueDefaults('nba'));
    expect(buildLeagueDefaults(null)).toEqual(buildLeagueDefaults('nba'));
  });
});
