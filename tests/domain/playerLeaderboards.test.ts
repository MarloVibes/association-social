import { describe, expect, it } from 'vitest';
import { buildBasketballPlayerLeaderboard } from '@/domain/nba/playerLeaderboards';

describe('basketball player leaderboards', () => {
  const teams = [
    {
      id: 'team_chi',
      name: 'Chicago Bulls',
      abbreviation: 'CHI',
      players: [
        {
          player_id: 'rose',
          full_name: 'Derrick Rose',
          position: 'PG',
          seasonStats: { games: 4, points: 92, assists: 32, rebounds: 16, steals: 4, blocks: 1 },
        },
        {
          player_id: 'noah',
          full_name: 'Joakim Noah',
          position: 'C',
          seasonStats: { games: 4, points: 42, assists: 12, rebounds: 48, steals: 5, blocks: 10 },
        },
      ],
    },
    {
      id: 'team_mia',
      name: 'Miami Heat',
      abbreviation: 'MIA',
      players: [
        {
          player_id: 'lebron',
          full_name: 'LeBron James',
          position: 'SF',
          seasonStats: { games: 2, points: 60, assists: 14, rebounds: 18, steals: 6, blocks: 4 },
        },
        {
          player_id: 'wade',
          full_name: 'Dwyane Wade',
          position: 'SG',
          seasonStats: { games: 4, points: 98, assists: 18, rebounds: 20, steals: 10, blocks: 5 },
        },
      ],
    },
  ];

  it('sorts player leaders by per-game averages instead of raw totals', () => {
    expect(buildBasketballPlayerLeaderboard({ teams, stat: 'ppg' }).map(row => [row.name, row.valueText])).toEqual([
      ['LeBron James', '30.0'],
      ['Dwyane Wade', '24.5'],
      ['Derrick Rose', '23.0'],
      ['Joakim Noah', '10.5'],
    ]);

    expect(buildBasketballPlayerLeaderboard({ teams, stat: 'apg' }).slice(0, 2).map(row => [row.name, row.valueText])).toEqual([
      ['Derrick Rose', '8.0'],
      ['LeBron James', '7.0'],
    ]);
  });

  it('supports defensive and rebounding leader tables', () => {
    expect(buildBasketballPlayerLeaderboard({ teams, stat: 'rpg' })[0]).toMatchObject({
      name: 'Joakim Noah',
      valueText: '12.0',
      teamAbbreviation: 'CHI',
    });
    expect(buildBasketballPlayerLeaderboard({ teams, stat: 'spg' })[0]).toMatchObject({
      name: 'LeBron James',
      valueText: '3.0',
    });
    expect(buildBasketballPlayerLeaderboard({ teams, stat: 'bpg' })[0]).toMatchObject({
      name: 'Joakim Noah',
      valueText: '2.5',
    });
  });

  it('ignores players without games played', () => {
    const leaders = buildBasketballPlayerLeaderboard({
      teams: [{ id: 'empty', players: [{ full_name: 'No Games', seasonStats: { games: 0, points: 99 } }] }],
      stat: 'ppg',
    });

    expect(leaders).toEqual([]);
  });

  it('cleans raw era ids from player leaderboard team labels', () => {
    const [leader] = buildBasketballPlayerLeaderboard({
      teams: [{
        id: 'MIN_2003',
        teamId: 'MIN_2003',
        name: 'MIN_2003',
        abbreviation: 'MIN_2003',
        players: [{ full_name: 'Kevin Garnett', position: 'PF', seasonStats: { games: 1, points: 28 } }],
      }],
      stat: 'ppg',
    });

    expect(leader.teamName).toBe('MIN');
    expect(leader.teamAbbreviation).toBe('MIN');
  });
});
