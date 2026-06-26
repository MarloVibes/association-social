import { describe, expect, it } from 'vitest';
import { buildNbaCupGroupStandings, buildNbaStandings } from '@/domain/nba/standings';

describe('NBA standings', () => {
  it('builds standings from final schedule games', () => {
    const standings = buildNbaStandings({
      participants: [
        { scheduleTeamId: 'BOS', abbreviation: 'BOS' },
        { scheduleTeamId: 'LAL', abbreviation: 'LAL' },
        { scheduleTeamId: 'NOP', abbreviation: 'NOP' },
      ],
      teams: [
        { id: 'team_noh', teamId: 'NOH', abbreviation: 'NOH', name: 'New Orleans Hornets', gmId: 'gm-noh' },
      ],
      games: [
        { id: 'g1', week: 1, sequence: 1, homeTeamId: 'BOS', awayTeamId: 'LAL', homeScore: 100, awayScore: 90, status: 'final' },
        { id: 'g2', week: 1, sequence: 2, homeTeamId: 'NOP', awayTeamId: 'BOS', homeScore: 101, awayScore: 99, status: 'final' },
        { id: 'g3', week: 1, sequence: 3, homeTeamId: 'LAL', awayTeamId: 'NOP', status: 'scheduled' },
      ],
    });

    expect(standings.map(row => [row.abbreviation, row.wins, row.losses])).toEqual([
      ['NOH', 1, 0],
      ['BOS', 1, 1],
      ['LAL', 0, 1],
    ]);
    expect(standings[0].gmId).toBe('gm-noh');
  });

  it('builds NBA Cup standings by group', () => {
    const groups = buildNbaCupGroupStandings({
      groups: [
        { id: 'Group A', teamIds: ['BOS', 'LAL'] },
        { id: 'Group B', teamIds: ['NOP', 'NYK'] },
      ],
      participants: [
        { scheduleTeamId: 'BOS', abbreviation: 'BOS' },
        { scheduleTeamId: 'LAL', abbreviation: 'LAL' },
        { scheduleTeamId: 'NOP', abbreviation: 'NOP' },
        { scheduleTeamId: 'NYK', abbreviation: 'NYK' },
      ],
      games: [
        { id: 'cup-a', groupId: 'Group A', week: 1, sequence: 1, homeTeamId: 'BOS', awayTeamId: 'LAL', homeScore: 110, awayScore: 104, status: 'final' },
        { id: 'cup-b', groupId: 'Group B', week: 1, sequence: 2, homeTeamId: 'NOP', awayTeamId: 'NYK', homeScore: 95, awayScore: 99, status: 'final' },
      ],
    });

    expect(groups.map(group => [group.id, group.rows.map(row => [row.abbreviation, row.wins, row.losses])])).toEqual([
      ['Group A', [['BOS', 1, 0], ['LAL', 0, 1]]],
      ['Group B', [['NYK', 1, 0], ['NOP', 0, 1]]],
    ]);
  });
});
