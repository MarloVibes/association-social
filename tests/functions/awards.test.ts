import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  applyAwardRecordsToTeams,
  buildSeasonAwardRecords,
  createAwardFinalizedNotifications,
} = require('../../functions/franchise/awards.js');

describe('season awards callable helpers', () => {
  it('builds final award records from team player stats', () => {
    const records = buildSeasonAwardRecords({
      seasonYear: 2026,
      teams: [
        {
          id: 'NOH',
          abbreviation: 'NOH',
          name: 'New Orleans Hornets',
          players: [
            { id: 'cp3', full_name: 'Chris Paul', seasonStats: { games: 10, points: 260, assists: 120, rebounds: 45, steals: 28 } },
            { id: 'west', full_name: 'David West', seasonStats: { games: 10, points: 220, rebounds: 90, assists: 20, blocks: 11 } },
          ],
        },
        {
          id: 'CHI',
          abbreviation: 'CHI',
          name: 'Chicago Bulls',
          players: [
            { id: 'rookie', full_name: 'Rookie Guard', rookie: true, seasonStats: { games: 10, points: 180, assists: 55, rebounds: 30, steals: 12 } },
            { id: 'stopper', full_name: 'Defensive Stopper', seasonStats: { games: 10, points: 80, rebounds: 80, assists: 10, steals: 35, blocks: 24 } },
            { id: 'sixth', full_name: 'Bench Scorer', starter: false, seasonStats: { games: 10, points: 190, assists: 40, rebounds: 35 } },
          ],
        },
      ],
    });

    expect(records.mvp[0]).toMatchObject({ winnerName: 'Chris Paul', teamAbbr: 'NOH', note: 'MVP' });
    expect(records.defensive_player[0]).toMatchObject({ winnerName: 'Defensive Stopper', teamAbbr: 'CHI', note: 'DPOY' });
    expect(records.rookie[0]).toMatchObject({ winnerName: 'Rookie Guard', teamAbbr: 'CHI', note: 'ROY' });
    expect(records.sixth_man[0]).toMatchObject({ winnerName: 'Bench Scorer', teamAbbr: 'CHI', note: 'Sixth Man' });
    expect(records.all_nba).toHaveLength(5);
    expect(records.all_defense).toHaveLength(5);
    expect(records.all_star).toHaveLength(5);
  });

  it('does not save era ids as award team names', () => {
    const records = buildSeasonAwardRecords({
      seasonYear: 2026,
      teams: [
        {
          id: 'SAS_2011',
          abbreviation: 'SAS_2011',
          name: 'SAS_2011',
          players: [
            { id: 'duncan', full_name: 'Tim Duncan', seasonStats: { games: 10, points: 260, assists: 30, rebounds: 120, steals: 10 } },
          ],
        },
      ],
    });

    expect(records.mvp[0]).toMatchObject({
      winnerName: 'Tim Duncan',
      teamName: 'SAS',
      teamAbbr: 'SAS',
    });
  });

  it('adds finalized award accolades back onto matching players', () => {
    const teams = applyAwardRecordsToTeams({
      teams: [
        {
          id: 'NOH',
          abbreviation: 'NOH',
          players: [
            { id: 'cp3', full_name: 'Chris Paul', seasonStats: { awards: ['All-Star'] }, accolades: ['All-Star'] },
            { id: 'west', full_name: 'David West', seasonStats: {} },
          ],
        },
      ],
      records: {
        mvp: [{ season: 2026, winnerName: 'Chris Paul', teamAbbr: 'NOH', note: 'MVP' }],
        all_nba: [{ season: 2026, winnerName: 'Chris Paul', teamAbbr: 'NOH', note: 'All-NBA 1' }],
      },
    });

    expect(teams[0].players[0].seasonStats.awards).toEqual(['All-Star', 'MVP', 'All-NBA 1']);
    expect(teams[0].players[0].accolades).toEqual(['All-Star', 'MVP', 'All-NBA 1']);
    expect(teams[0].players[1].seasonStats.awards).toBeUndefined();
  });

  it('builds Trophy Case notifications for league members after awards finalize', () => {
    const notifications = createAwardFinalizedNotifications({
      league: { name: 'NBA', members: ['a', 'b', 'a'] },
      leagueId: 'league-1',
      seasonYear: 2026,
      createdAt: 'now',
    });

    expect(notifications).toEqual([
      {
        uid: 'a',
        notification: expect.objectContaining({
          type: 'awards_finalized',
          leagueId: 'league-1',
          leagueName: 'NBA',
          message: '2026 awards were finalized in NBA.',
          createdAt: 'now',
        }),
      },
      {
        uid: 'b',
        notification: expect.objectContaining({
          type: 'awards_finalized',
        }),
      },
    ]);
  });
});
