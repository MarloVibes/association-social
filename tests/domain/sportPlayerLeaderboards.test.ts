import { describe, expect, it } from 'vitest';
import { buildSportPlayerLeaderboard, playerLeaderboardTabsForSport } from '@/domain/sports/playerLeaderboards';

describe('sport player leaderboards', () => {
  it('builds football leaders from saved season stat totals', () => {
    const teams = [
      {
        id: 'KC',
        name: 'Kansas City Chiefs',
        abbreviation: 'KC',
        players: [
          { player_id: 'qb-1', full_name: 'QB One', position: 'QB', seasonStats: { games: 3, passingYards: 910, passingTouchdowns: 7, interceptions: 2 } },
          { player_id: 'wr-1', full_name: 'WR One', position: 'WR', seasonStats: { games: 3, receivingYards: 340, receivingTouchdowns: 3 } },
          { player_id: 'edge-1', full_name: 'Edge One', position: 'EDGE', seasonStats: { games: 3, sacks: 5, tackles: 14 } },
        ],
      },
      {
        id: 'PHI',
        name: 'Philadelphia Eagles',
        abbreviation: 'PHI',
        players: [
          { player_id: 'qb-2', full_name: 'QB Two', position: 'QB', seasonStats: { games: 3, passingYards: 760, passingTouchdowns: 9, interceptions: 1 } },
          { player_id: 'rb-1', full_name: 'RB One', position: 'RB', seasonStats: { games: 3, rushingYards: 285, rushingTouchdowns: 4 } },
        ],
      },
    ];

    expect(playerLeaderboardTabsForSport('madden').map(tab => tab.key)).toEqual([
      'passYds',
      'passTd',
      'rushYds',
      'recYds',
      'sacks',
      'ints',
    ]);
    expect(buildSportPlayerLeaderboard({ sport: 'madden', teams, stat: 'passYds' })[0]).toMatchObject({
      name: 'QB One',
      valueText: '910',
      teamAbbreviation: 'KC',
    });
    expect(buildSportPlayerLeaderboard({ sport: 'madden', teams, stat: 'passTd' })[0]).toMatchObject({
      name: 'QB Two',
      valueText: '9',
    });
    expect(buildSportPlayerLeaderboard({ sport: 'madden', teams, stat: 'sacks' })[0]).toMatchObject({
      name: 'Edge One',
      valueText: '5',
    });
  });

  it('builds baseball leaders and sorts run-prevention stats low to high', () => {
    const teams = [
      {
        id: 'LAD',
        name: 'Los Angeles Dodgers',
        abbreviation: 'LAD',
        players: [
          { player_id: 'bat-1', full_name: 'Bat One', position: '1B', seasonStats: { games: 6, atBats: 22, hits: 8, homeRuns: 4, rbi: 10 } },
          { player_id: 'ace-1', full_name: 'Ace One', position: 'SP', seasonStats: { games: 2, inningsPitched: 12, earnedRuns: 3, strikeouts: 15, walks: 2, hitsAllowed: 4 } },
        ],
      },
      {
        id: 'SEA',
        name: 'Seattle Mariners',
        abbreviation: 'SEA',
        players: [
          { player_id: 'bat-2', full_name: 'Bat Two', position: 'CF', seasonStats: { games: 6, atBats: 20, hits: 7, homeRuns: 1, rbi: 6 } },
          { player_id: 'ace-2', full_name: 'Ace Two', position: 'SP', seasonStats: { games: 2, inningsPitched: 11, earnedRuns: 1, strikeouts: 10, walks: 1, hitsAllowed: 1 } },
        ],
      },
    ];

    expect(playerLeaderboardTabsForSport('mlb').map(tab => tab.key)).toEqual([
      'avg',
      'hr',
      'rbi',
      'era',
      'whip',
      'so',
    ]);
    expect(buildSportPlayerLeaderboard({ sport: 'mlb', teams, stat: 'avg' })[0]).toMatchObject({
      name: 'Bat One',
      valueText: '.364',
    });
    expect(buildSportPlayerLeaderboard({ sport: 'mlb', teams, stat: 'era' })[0]).toMatchObject({
      name: 'Ace Two',
      valueText: '0.82',
    });
    expect(buildSportPlayerLeaderboard({ sport: 'mlb', teams, stat: 'whip' })[0]).toMatchObject({
      name: 'Ace Two',
      valueText: '0.18',
    });
  });
});
