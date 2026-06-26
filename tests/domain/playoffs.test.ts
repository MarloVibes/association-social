import { describe, expect, it } from 'vitest';
import { advancePlayoffSeries, buildPlayoffBracket, syncPlayoffSeriesFromGames } from '@/domain/nba/playoffs';
import type { StandingsRow } from '@/domain/nba/standings';

function standings(count: number): StandingsRow[] {
  return Array.from({ length: count }, (_, index) => ({
    teamId: `T${index + 1}`,
    abbreviation: `T${index + 1}`,
    name: `Team ${index + 1}`,
    gmId: `gm-${index + 1}`,
    wins: count - index,
    losses: index,
    pointsFor: 1000 - index,
    pointsAgainst: 900 + index,
    pointDiff: 100 - index * 2,
    pct: (count - index) / count,
  }));
}

describe('NBA playoffs', () => {
  it('creates a deterministic shortened 8-team bracket with best-of-seven games', () => {
    const bracket = buildPlayoffBracket({
      standings: standings(12),
      format: 'short_8',
      seasonYear: 2026,
      seed: 'short',
    });

    expect(bracket.format).toBe('short_8');
    expect(bracket.rounds[0].series.map(series => [series.homeSeed, series.awaySeed])).toEqual([
      [1, 8],
      [4, 5],
      [3, 6],
      [2, 7],
    ]);
    expect(bracket.rounds[0].series[0].games).toHaveLength(7);
    expect(bracket.rounds[0].series[0].games[0]).toMatchObject({
      stage: 'playoffs',
      status: 'scheduled',
      homeTeamId: 'T1',
      awayTeamId: 'T8',
    });
  });

  it('creates a traditional 16-team first round', () => {
    const bracket = buildPlayoffBracket({
      standings: standings(20),
      format: 'traditional_16',
      seasonYear: 2026,
      seed: 'traditional',
    });

    expect(bracket.rounds[0].series).toHaveLength(8);
    expect(bracket.rounds[0].series.map(series => [series.homeSeed, series.awaySeed])).toEqual([
      [1, 16],
      [8, 9],
      [5, 12],
      [4, 13],
      [3, 14],
      [6, 11],
      [7, 10],
      [2, 15],
    ]);
  });

  it('creates a play-in round before a 16-team playoff bracket', () => {
    const bracket = buildPlayoffBracket({
      standings: standings(20),
      format: 'play_in_16',
      seasonYear: 2026,
      seed: 'play-in',
    });

    expect(bracket.rounds[0].name).toBe('play_in');
    expect(bracket.rounds[0].series.map(series => [series.homeSeed, series.awaySeed])).toEqual([
      [13, 20],
      [14, 19],
      [15, 18],
      [16, 17],
    ]);

    const withPlayInWinners = bracket.rounds[0].series.reduce((current, series) => (
      advancePlayoffSeries({
        bracket: current,
        seriesId: series.id,
        winnerTeamId: series.homeTeamId,
      })
    ), bracket);

    expect(withPlayInWinners.rounds[1].name).toBe('first_round');
    expect(withPlayInWinners.rounds[1].series.map(series => [series.homeSeed, series.awaySeed])).toEqual([
      [1, 16],
      [8, 9],
      [5, 12],
      [4, 13],
      [3, 14],
      [6, 11],
      [7, 10],
      [2, 15],
    ]);
  });

  it('advances completed series into the next playoff round', () => {
    const bracket = buildPlayoffBracket({
      standings: standings(8),
      format: 'short_8',
      seasonYear: 2026,
      seed: 'advance',
    });
    const withWinners = bracket.rounds[0].series.reduce((current, series) => (
      advancePlayoffSeries({
        bracket: current,
        seriesId: series.id,
        winnerTeamId: series.homeTeamId,
      })
    ), bracket);

    expect(withWinners.rounds[1].series).toHaveLength(2);
    expect(withWinners.rounds[1].series.map(series => [series.homeTeamId, series.awayTeamId])).toEqual([
      ['T1', 'T4'],
      ['T3', 'T2'],
    ]);
    expect(withWinners.rounds[1].series[0].games).toHaveLength(7);
  });

  it('rejects a playoff series winner that is not in the matchup', () => {
    const bracket = buildPlayoffBracket({
      standings: standings(8),
      format: 'short_8',
      seasonYear: 2026,
      seed: 'bad-winner',
    });

    expect(() => advancePlayoffSeries({
      bracket,
      seriesId: bracket.rounds[0].series[0].id,
      winnerTeamId: 'T99',
    })).toThrow('Winner must be one of the teams in the series.');
  });

  it('advances a series from four completed playoff game wins', () => {
    const bracket = buildPlayoffBracket({
      standings: standings(8),
      format: 'short_8',
      seasonYear: 2026,
      seed: 'game-flow',
    });
    const series = bracket.rounds[0].series[0];
    const completedGames = series.games.map((game, index) => ({
      ...game,
      status: index < 4 ? 'final' as const : 'scheduled' as const,
      winnerTeamId: index < 4 ? series.awayTeamId : undefined,
    }));

    const synced = syncPlayoffSeriesFromGames({
      bracket,
      games: completedGames,
    });

    expect(synced.rounds[0].series[0].winnerTeamId).toBe(series.awayTeamId);
  });

  it('does not advance a playoff series before a team reaches four wins', () => {
    const bracket = buildPlayoffBracket({
      standings: standings(8),
      format: 'short_8',
      seasonYear: 2026,
      seed: 'game-flow-pending',
    });
    const series = bracket.rounds[0].series[0];
    const completedGames = series.games.map((game, index) => ({
      ...game,
      status: index < 3 ? 'final' as const : 'scheduled' as const,
      winnerTeamId: index < 3 ? series.homeTeamId : undefined,
    }));

    const synced = syncPlayoffSeriesFromGames({
      bracket,
      games: completedGames,
    });

    expect(synced.rounds[0].series[0].winnerTeamId).toBeNull();
  });
});
