import { describe, expect, it } from 'vitest';
import {
  displayScheduleAbbr,
  displayScheduleName,
  gameMatchesMyTeam,
  isLiveResultRevealed,
  normalizeScheduleKey,
  scheduleKeyAliases,
  teamScheduleKeys,
  visibleScheduleGames,
} from '@/domain/nba/scheduleView';

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

  it('normalizes era schedule ids for display and matching', () => {
    expect(scheduleKeyAliases('SAS_2011')).toContain('SAS');
    expect(displayScheduleAbbr('SAS_2011')).toBe('SAS');
    expect(displayScheduleName({ scheduleTeamId: 'SAS_2011', abbreviation: 'SAS_2011' })).toBe('SAS');
    expect(displayScheduleName({ scheduleTeamId: 'SAS_2011', abbreviation: 'SAS_2011', name: 'San Antonio Spurs' })).toBe('San Antonio Spurs');
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

  it('hides live simulation results until the reveal window finishes', () => {
    const game = {
      status: 'final',
      liveTimeline: { version: 1 },
      liveMode: { simulationEndsAtMs: 20_000 },
    };

    expect(isLiveResultRevealed(game, 19_999)).toBe(false);
    expect(isLiveResultRevealed(game, 20_000)).toBe(true);
    expect(isLiveResultRevealed({ status: 'final' }, 10_000)).toBe(true);
  });

  it('does not reveal a live result immediately when the end timestamp is missing', () => {
    expect(isLiveResultRevealed({
      status: 'final',
      liveTimeline: { version: 1, revealDurationMs: 30_000 },
    }, 60_000)).toBe(false);

    expect(isLiveResultRevealed({
      status: 'final',
      finalAtMs: 10_000,
      liveTimeline: { version: 1, revealDurationMs: 30_000 },
    }, 39_999)).toBe(false);

    expect(isLiveResultRevealed({
      status: 'final',
      finalAtMs: 10_000,
      liveTimeline: { version: 1, revealDurationMs: 30_000 },
    }, 40_000)).toBe(true);
  });
});
