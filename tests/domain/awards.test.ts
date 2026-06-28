import { describe, expect, it } from 'vitest';
import { NBA_AWARD_CATEGORIES, recordsForAward } from '@/domain/nba/awards';

describe('NBA awards trophy case', () => {
  it('includes championship rings and real NBA award categories', () => {
    const keys = NBA_AWARD_CATEGORIES.map(category => category.key);

    expect(keys).toContain('championship_rings');
    expect(keys).toContain('nba_cup');
    expect(keys).toContain('finals_mvp');
    expect(keys).toContain('mvp');
    expect(keys).toContain('defensive_player');
    expect(keys).toContain('rookie');
    expect(keys).toContain('sixth_man');
    expect(keys).toContain('most_improved');
    expect(keys).toContain('coach');
    expect(keys).toContain('all_nba');
    expect(keys).toContain('all_defense');
  });

  it('normalizes stored league award records for display', () => {
    const records = recordsForAward({
      awards: {
        mvp: [{ season: '2025-26', playerName: 'Chris Paul', teamAbbr: 'NOH' }],
      },
    }, 'mvp');

    expect(records).toEqual([
      { season: '2025-26', winnerName: 'Chris Paul', teamName: null, teamAbbr: 'NOH', note: null },
    ]);
  });

  it('derives an NBA Cup trophy record from the season schedule champion', () => {
    const records = recordsForAward({}, 'nba_cup', {
      schedule: {
        nbaCup: {
          championTeamId: 'NOP',
          championTeamName: 'New Orleans Hornets',
        },
        participants: [
          { scheduleTeamId: 'NOP', abbreviation: 'NOH', name: 'New Orleans Hornets' },
        ],
      },
      currentYear: 2025,
    });

    expect(records).toEqual([
      {
        season: 2025,
        winnerName: 'New Orleans Hornets',
        teamName: 'New Orleans Hornets',
        teamAbbr: 'NOH',
        note: 'NBA Cup Champion',
      },
    ]);
  });

  it('derives championship and runner-up records from a completed playoff final', () => {
    const schedule = {
      playoffs: {
        rounds: [
          {
            name: 'final',
            series: [
              {
                homeTeamId: 'BOS',
                awayTeamId: 'LAL',
                homeTeamName: 'Boston Celtics',
                awayTeamName: 'Los Angeles Lakers',
                winnerTeamId: 'BOS',
              },
            ],
          },
        ],
      },
    };

    expect(recordsForAward({}, 'championship_rings', { schedule, currentYear: 2027 })).toEqual([
      {
        season: 2027,
        winnerName: 'Boston Celtics',
        teamName: 'Boston Celtics',
        teamAbbr: 'BOS',
        note: 'NBA Champion',
      },
    ]);
    expect(recordsForAward({}, 'finals_runner_up', { schedule, currentYear: 2027 })).toEqual([
      {
        season: 2027,
        winnerName: 'Los Angeles Lakers',
        teamName: 'Los Angeles Lakers',
        teamAbbr: 'LAL',
        note: 'Finals Runner-Up',
      },
    ]);
  });

  it('projects season award records from team player stats', () => {
    const teams = [
      {
        id: 'NOH',
        abbreviation: 'NOH',
        name: 'New Orleans Hornets',
        players: [
          {
            id: 'cp3',
            full_name: 'Chris Paul',
            seasonStats: { games: 10, points: 260, assists: 120, rebounds: 45, steals: 28 },
            playerLabel: 'SUPERSTAR',
          },
          {
            id: 'west',
            full_name: 'David West',
            seasonStats: { games: 10, points: 220, rebounds: 90, assists: 20, blocks: 11 },
          },
        ],
      },
      {
        id: 'CHI',
        abbreviation: 'CHI',
        name: 'Chicago Bulls',
        players: [
          {
            id: 'rookie',
            full_name: 'Rookie Guard',
            rookie: true,
            seasonStats: { games: 10, points: 180, assists: 55, rebounds: 30, steals: 12 },
          },
          {
            id: 'stopper',
            full_name: 'Defensive Stopper',
            seasonStats: { games: 10, points: 80, rebounds: 80, assists: 10, steals: 35, blocks: 24 },
          },
          {
            id: 'sixth',
            full_name: 'Bench Scorer',
            starter: false,
            seasonStats: { games: 10, points: 190, assists: 40, rebounds: 35 },
          },
        ],
      },
    ];

    expect(recordsForAward({}, 'mvp', { teams, currentYear: 2026 })[0]).toMatchObject({
      season: 2026,
      winnerName: 'Chris Paul',
      teamName: 'New Orleans Hornets',
      teamAbbr: 'NOH',
      note: 'Projected MVP',
    });
    expect(recordsForAward({}, 'defensive_player', { teams, currentYear: 2026 })[0]).toMatchObject({
      winnerName: 'Defensive Stopper',
      note: 'Projected DPOY',
    });
    expect(recordsForAward({}, 'rookie', { teams, currentYear: 2026 })[0]).toMatchObject({
      winnerName: 'Rookie Guard',
      note: 'Projected ROY',
    });
    expect(recordsForAward({}, 'sixth_man', { teams, currentYear: 2026 })[0]).toMatchObject({
      winnerName: 'Bench Scorer',
      note: 'Projected Sixth Man',
    });
    expect(recordsForAward({}, 'all_nba', { teams, currentYear: 2026 })).toHaveLength(5);
    expect(recordsForAward({}, 'mvp', { teams, currentYear: 2026, includeProjected: false })).toEqual([]);
  });

  it('cleans era schedule ids from stored and projected award team labels', () => {
    const schedule = {
      participants: [
        { scheduleTeamId: 'SAS_2011', abbreviation: 'SAS', name: 'San Antonio Spurs' },
        { scheduleTeamId: 'CHI', abbreviation: 'CHI', name: 'Chicago Bulls' },
      ],
    };

    expect(recordsForAward({
      seasonAwards: {
        mvp: [{ season: 2026, winnerName: 'Tim Duncan', teamName: 'SAS_2011', teamAbbr: 'SAS_2011' }],
      },
    }, 'mvp', { schedule, currentYear: 2026, includeProjected: false })[0]).toMatchObject({
      winnerName: 'Tim Duncan',
      teamName: 'San Antonio Spurs',
      teamAbbr: 'SAS',
    });

    expect(recordsForAward({}, 'mvp', {
      schedule,
      currentYear: 2026,
      teams: [
        {
          id: 'SAS_2011',
          teamId: 'SAS_2011',
          abbreviation: 'SAS_2011',
          players: [
            { full_name: 'Tim Duncan', seasonStats: { games: 10, points: 260, rebounds: 120, assists: 30 } },
          ],
        },
      ],
    })[0]).toMatchObject({
      winnerName: 'Tim Duncan',
      teamName: 'San Antonio Spurs',
      teamAbbr: 'SAS',
    });
  });
});
