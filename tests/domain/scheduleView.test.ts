import { describe, expect, it } from 'vitest';
import { gameMatchesMyTeam, normalizeScheduleKey, scheduleKeyAliases, teamScheduleKeys, visibleScheduleGames } from '@/domain/nba/scheduleView';

describe('NBA schedule view helpers', () => {
  it('normalizes team keys so lowercase era ids match schedule abbreviations', () => {
    expect(normalizeScheduleKey(' bos ')).toBe('BOS');
    expect([...teamScheduleKeys({ id: 'league_user', teamId: 'bos', abbreviation: 'BOS' })]).toEqual([
      'LEAGUE_USER',
      'BOS',
    ]);
  });

  it('matches historical teams against modern schedule slots', () => {
    expect(scheduleKeyAliases('NOH')).toEqual(['NOH', 'NOP', 'NOK']);
    expect(gameMatchesMyTeam(
      { homeTeamId: 'NOP', awayTeamId: 'LAL' },
      { teamId: 'NOH', abbreviation: 'NOH' },
      'gm',
    )).toBe(true);
  });

  it('matches my games by normalized team id or stored GM id', () => {
    const game = {
      id: 'g1',
      week: 1,
      sequence: 1,
      homeTeamId: 'BOS',
      awayTeamId: 'LAL',
      status: 'scheduled' as const,
    };

    expect(gameMatchesMyTeam(game, { id: 'league_user', teamId: 'bos', gmId: 'gm' }, 'gm')).toBe(true);
    expect(gameMatchesMyTeam({ ...game, homeTeamId: 'NYK', homeGmId: 'gm' }, { id: 'other' }, 'gm')).toBe(true);
    expect(gameMatchesMyTeam(game, { id: 'league_user', teamId: 'nyk' }, 'gm')).toBe(false);
  });

  it('can switch between my games and the full league schedule', () => {
    const games = [
      { id: 'late', sequence: 2, homeTeamId: 'NYK', awayTeamId: 'LAL' },
      { id: 'mine', sequence: 1, homeTeamId: 'BOS', awayTeamId: 'MIA' },
    ];

    expect(visibleScheduleGames(games, 'mine', { teamId: 'bos' }, 'gm').map(game => game.id)).toEqual(['mine']);
    expect(visibleScheduleGames(games, 'league', { teamId: 'bos' }, 'gm').map(game => game.id)).toEqual(['mine', 'late']);
  });
});
