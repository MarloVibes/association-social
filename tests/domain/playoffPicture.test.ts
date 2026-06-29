import { describe, expect, it } from 'vitest';
import { buildConferencePlayoffPicture, buildPlayoffPicture, regularSeasonCompletion } from '@/domain/nba/playoffPicture';
import type { NbaScheduleGame } from '@/domain/nba/schedule';
import type { StandingsRow } from '@/domain/nba/standings';

function row(seed: number): StandingsRow {
  return {
    teamId: `T${seed}`,
    abbreviation: `T${seed}`,
    name: `Team ${seed}`,
    gmId: `gm-${seed}`,
    wins: 30 - seed,
    losses: seed,
    pointsFor: 1000,
    pointsAgainst: 900 + seed,
    pointDiff: 100 - seed,
    pct: (30 - seed) / 30,
  };
}

function conferenceRow(seed: number, abbreviation: string, name = abbreviation): StandingsRow {
  return {
    ...row(seed),
    teamId: abbreviation,
    abbreviation,
    name,
  };
}

function game(status: NbaScheduleGame['status'], id: string, stage?: NbaScheduleGame['stage']): NbaScheduleGame {
  return {
    id,
    week: 1,
    sequence: Number(id.replace(/\D/g, '')) || 1,
    homeTeamId: 'T1',
    awayTeamId: 'T2',
    status,
    stage,
    homeScore: status === 'final' ? 100 : undefined,
    awayScore: status === 'final' ? 90 : undefined,
  };
}

describe('NBA playoff picture', () => {
  it('tracks regular-season completion without creating playoff games', () => {
    expect(regularSeasonCompletion([game('final', 'g1'), game('scheduled', 'g2')])).toEqual({
      totalGames: 2,
      finalGames: 1,
      remainingGames: 1,
      complete: false,
    });
    expect(regularSeasonCompletion([game('final', 'g1'), game('final', 'g2'), game('scheduled', 'p1', 'playoffs')])).toMatchObject({
      totalGames: 2,
      finalGames: 2,
      remainingGames: 0,
      complete: true,
    });
  });

  it('projects a short eight-team playoff field and bubble from standings', () => {
    const picture = buildPlayoffPicture({
      standings: Array.from({ length: 12 }, (_, index) => row(index + 1)),
      format: 'short_8',
      completion: { totalGames: 82, finalGames: 40, remainingGames: 42, complete: false },
    });

    expect(picture.label).toBe('Projected Playoffs');
    expect(picture.playoffSeeds.map(seed => seed.seed)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(picture.playInSeeds).toEqual([]);
    expect(picture.bubble.map(seed => seed.seed)).toEqual([9, 10, 11, 12]);
    expect(picture.bracketLocked).toBe(false);
  });

  it('projects play-in teams separately and labels final seeds after completion', () => {
    const picture = buildPlayoffPicture({
      standings: Array.from({ length: 22 }, (_, index) => row(index + 1)),
      format: 'play_in_16',
      completion: { totalGames: 1230, finalGames: 1230, remainingGames: 0, complete: true },
    });

    expect(picture.label).toBe('Final Seeds');
    expect(picture.playoffSeeds.map(seed => seed.seed)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(picture.playInSeeds.map(seed => seed.seed)).toEqual([13, 14, 15, 16, 17, 18, 19, 20]);
    expect(picture.bubble.map(seed => seed.seed)).toEqual([21, 22]);
    expect(picture.readyToStartPostseason).toBe(true);
  });

  it('does not allow postseason start when a bracket already exists', () => {
    const picture = buildPlayoffPicture({
      standings: Array.from({ length: 20 }, (_, index) => row(index + 1)),
      format: 'traditional_16',
      completion: { totalGames: 1230, finalGames: 1230, remainingGames: 0, complete: true },
      bracketExists: true,
    });

    expect(picture.readyToStartPostseason).toBe(false);
    expect(picture.bracketLocked).toBe(true);
  });

  it('splits NBA playoff picture into Eastern and Western conferences', () => {
    const picture = buildConferencePlayoffPicture({
      standings: [
        conferenceRow(1, 'MIA', 'Miami Heat'),
        conferenceRow(2, 'BOS', 'Boston Celtics'),
        conferenceRow(3, 'LAL', 'Los Angeles Lakers'),
        conferenceRow(4, 'DEN', 'Denver Nuggets'),
      ],
      teams: [
        { id: 'MIA', abbreviation: 'MIA', conference: 'East' },
        { id: 'BOS', abbreviation: 'BOS', conference: 'East' },
        { id: 'LAL', abbreviation: 'LAL', conference: 'West' },
        { id: 'DEN', abbreviation: 'DEN', conference: 'West' },
      ],
      format: 'short_8',
      completion: { totalGames: 82, finalGames: 2, remainingGames: 80, complete: false },
    });

    expect(picture.conferences.map(group => group.label)).toEqual(['Eastern Conference', 'Western Conference']);
    expect(picture.conferences[0].picture.playoffSeeds.map(seed => seed.abbreviation)).toEqual(['MIA', 'BOS']);
    expect(picture.conferences[1].picture.playoffSeeds.map(seed => seed.abbreviation)).toEqual(['LAL', 'DEN']);
  });
});
