import { describe, expect, it } from 'vitest';
import { MLB_TEAMS } from '@/constants/mlbTeams';
import { NFL_TEAMS } from '@/constants/nflTeams';
import { getSportTeamName } from '@/constants/sportTeams';
import { TEAM_COLORS } from '@/constants/teamColors';
import { NBA_TEAM_IDS } from '@/domain/nba/scheduleSetup';
import {
  displayScheduleAbbr,
  displayScheduleEventText,
  displayScheduleName,
  displayScheduleTeamLabel,
  gameMatchesMyTeam,
  liveScheduleScore,
  isLiveResultRevealed,
  normalizeScheduleKey,
  scheduleKeyAliases,
  teamScheduleKeys,
  visibleScheduleGames,
} from '@/domain/nba/scheduleView';

describe('NBA schedule view helpers', () => {
  const NBA_ERA_SUFFIXES = ['CURRENT', '1984', '1992', '2003', '2011', '2017'];

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
    expect(scheduleKeyAliases('MIL_CURRENT')).toContain('MIL');
    expect(displayScheduleAbbr('SAS_2011')).toBe('SAS');
    expect(displayScheduleAbbr('MIL_CURRENT')).toBe('MIL');
    expect(displayScheduleName({ scheduleTeamId: 'SAS_2011', abbreviation: 'SAS_2011' })).toBe('SAS');
    expect(displayScheduleName({ scheduleTeamId: 'MIL_CURRENT', abbreviation: 'MIL_CURRENT' })).toBe('MIL');
    expect(displayScheduleName({ scheduleTeamId: 'SAS_2011', abbreviation: 'SAS_2011', name: 'San Antonio Spurs' })).toBe('San Antonio Spurs');
    expect(displayScheduleName({ scheduleTeamId: 'SAS_2011', name: 'SAS_2011' })).toBe('SAS');
    expect(displayScheduleName({ scheduleTeamId: 'MIL_CURRENT', name: 'MIL_CURRENT' })).toBe('MIL');
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

  it('shows the current live score without exposing the final result early', () => {
    const game = {
      status: 'final',
      awayScore: 101,
      homeScore: 104,
      liveMode: { simulationStartedAtMs: 10_000, simulationEndsAtMs: 70_000 },
      liveTimeline: {
        revealDurationMs: 60_000,
        events: [
          { elapsedMs: 5_000, awayScore: 2, homeScore: 0, periodLabel: 'Q1', clockSeconds: 690 },
          { elapsedMs: 35_000, awayScore: 40, homeScore: 38, periodLabel: 'Q2', clockSeconds: 420 },
          { elapsedMs: 60_000, awayScore: 101, homeScore: 104, periodLabel: 'Q4', clockSeconds: 0, eventType: 'final_buzzer' },
        ],
      },
    };

    expect(liveScheduleScore(game, 45_000)).toMatchObject({
      awayScore: 40,
      homeScore: 38,
      label: '40-38',
      periodLabel: 'Q2',
    });
    expect(liveScheduleScore(game, 70_000)).toBeNull();
  });

  it('cleans raw era schedule ids from live event text', () => {
    expect(displayScheduleEventText('Final: MIN_2003 90 - LAL 101')).toBe('Final: MIN 90 - LAL 101');
    expect(displayScheduleEventText('End of Q1: SAS_2011 33 - BOS_1986 31')).toBe('End of Q1: SAS 33 - BOS 31');
    expect(displayScheduleEventText('Final: nola_2003 90 - lal_2003 101')).toBe('Final: NOLA 90 - LAL 101');
    expect(displayScheduleEventText('Final: MIL_CURRENT 90 - LAL_CURRENT 101')).toBe('Final: MIL 90 - LAL 101');
  });

  it('prefers real team names but replaces raw era ids in team labels', () => {
    expect(displayScheduleTeamLabel('Los Angeles Lakers', 'LAL_2003')).toBe('Los Angeles Lakers');
    expect(displayScheduleTeamLabel('MIN_2003', 'MIN_2003')).toBe('MIN');
    expect(displayScheduleTeamLabel('MIL_CURRENT', 'MIL_CURRENT')).toBe('MIL');
    expect(displayScheduleTeamLabel('', 'SAS_2011')).toBe('SAS');
    expect(displayScheduleTeamLabel('', 'CHA_CURRENT')).toBe('CHA');
    expect(displayScheduleTeamLabel('Final: MIN_2003 90 - LAL 101')).toBe('Final: MIN 90 - LAL 101');
  });

  it('strips current-era schedule suffixes for every NBA schedule team', () => {
    expect(NBA_TEAM_IDS).toHaveLength(30);
    NBA_TEAM_IDS.forEach(abbr => {
      const currentId = `${abbr}_CURRENT`;
      expect(scheduleKeyAliases(currentId)).toContain(abbr);
      expect(displayScheduleAbbr(currentId)).toBe(abbr);
      expect(displayScheduleName({ scheduleTeamId: currentId, abbreviation: currentId })).toBe(abbr);
      expect(displayScheduleName({ scheduleTeamId: currentId, name: currentId })).toBe(abbr);
      expect(displayScheduleTeamLabel(currentId, currentId)).toBe(abbr);
      expect(displayScheduleTeamLabel('', currentId)).toBe(abbr);
      expect(displayScheduleEventText(`Final: ${currentId} 90 - LAL_CURRENT 101`)).toBe(`Final: ${abbr} 90 - LAL 101`);
    });
  });

  it('strips every supported NBA era suffix for every NBA team code', () => {
    const nbaCodes = [...new Set([...NBA_TEAM_IDS, ...Object.keys(TEAM_COLORS).map(code => code.toUpperCase())])];
    expect(nbaCodes).toContain('SEA');
    expect(nbaCodes).toContain('NJN');
    expect(nbaCodes).toContain('CHA_OLD');
    NBA_ERA_SUFFIXES.forEach(suffix => {
      nbaCodes.forEach(abbr => {
        const scheduleId = `${abbr}_${suffix}`;
        expect(scheduleKeyAliases(scheduleId)).toContain(abbr);
        expect(displayScheduleAbbr(scheduleId)).toBe(abbr);
        expect(displayScheduleName({ scheduleTeamId: scheduleId, abbreviation: scheduleId })).toBe(abbr);
        expect(displayScheduleName({ scheduleTeamId: scheduleId, name: scheduleId })).toBe(abbr);
        expect(displayScheduleTeamLabel(scheduleId, scheduleId)).toBe(abbr);
        expect(displayScheduleTeamLabel('', scheduleId)).toBe(abbr);
        expect(displayScheduleEventText(`Final: ${scheduleId} 90 - LAL_${suffix} 101`)).toBe(`Final: ${abbr} 90 - LAL 101`);
      });
    });
  });

  it('uses real NFL and MLB names for vacant CPU team fallbacks', () => {
    expect(displayScheduleTeamLabel('', 'cpu_KC', 'madden')).toBe('Kansas City Chiefs');
    expect(displayScheduleTeamLabel('KC', 'KC', 'madden')).toBe('Kansas City Chiefs');
    expect(displayScheduleTeamLabel('cpu_LAD', 'cpu_LAD', 'mlb')).toBe('Los Angeles Dodgers');
    expect(displayScheduleTeamLabel('ATH', 'cpu_ATH', 'mlb')).toBe('Athletics');
  });

  it('renders every NFL and MLB static team without internal CPU labels', () => {
    const rows = [
      ...Object.keys(NFL_TEAMS).map(abbr => ({ sport: 'madden', abbr })),
      ...Object.keys(MLB_TEAMS).map(abbr => ({ sport: 'mlb', abbr })),
    ];

    expect(Object.keys(NFL_TEAMS)).toHaveLength(32);
    expect(Object.keys(MLB_TEAMS)).toHaveLength(30);
    rows.forEach(({ sport, abbr }) => {
      const expectedName = getSportTeamName(sport, abbr);
      const fromCpuId = displayScheduleTeamLabel('', `cpu_${abbr}`, sport);
      const fromAbbr = displayScheduleTeamLabel(abbr, abbr, sport);
      const words = expectedName.toLowerCase().split(/\s+/);
      expect(expectedName).toBeTruthy();
      expect(fromCpuId).toBe(expectedName);
      expect(fromAbbr).toBe(expectedName);
      expect(fromCpuId).not.toMatch(/^cpu_/i);
      expect(words.some((word, index) => index > 0 && word === words[index - 1])).toBe(false);
    });
  });

  it('strips CPU prefixes for every NBA team color code fallback', () => {
    Object.keys(TEAM_COLORS).forEach(abbr => {
      expect(displayScheduleTeamLabel('', `cpu_${abbr}`, 'nba')).toBe(displayScheduleAbbr(abbr));
    });
  });
});
