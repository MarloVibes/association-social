import { describe, expect, it } from 'vitest';
import { simulateGame } from '@/domain/nba/simulateGame';

const fixture = {
  home: {
    teamId: 'BOS',
    players: Array.from({ length: 10 }, (_, index) => ({
      playerId: `h${index}`,
      name: `Home ${index}`,
      minutes: index < 5 ? 30 : 18,
      shooting: 85 - index,
      playmaking: 80 - index,
      defense: 78 - index,
    })),
  },
  away: {
    teamId: 'LAL',
    players: Array.from({ length: 10 }, (_, index) => ({
      playerId: `a${index}`,
      name: `Away ${index}`,
      minutes: index < 5 ? 30 : 18,
      shooting: 82 - index,
      playmaking: 78 - index,
      defense: 76 - index,
    })),
  },
};

describe('NBA game simulation', () => {
  it('returns a stable legal full box score', () => {
    const first = simulateGame(fixture, 'game-seed');
    const second = simulateGame(fixture, 'game-seed');

    expect(second).toEqual(first);
    expect(first.home.players.reduce((total, player) => total + player.minutes, 0)).toBe(240);
    expect(first.away.players.reduce((total, player) => total + player.minutes, 0)).toBe(240);
    expect(first.home.points).toBe(first.home.players.reduce((total, player) => total + player.points, 0));
    expect(first.away.points).toBe(first.away.players.reduce((total, player) => total + player.points, 0));
    expect(first.home.points).not.toBe(first.away.points);
    expect(first.quarters).toHaveLength(4);
    expect(first.story.length).toBeGreaterThan(0);
    expect(first.home.players[0]).toMatchObject({
      fieldGoalsMade: expect.any(Number),
      fieldGoalsAttempted: expect.any(Number),
      threePointersMade: expect.any(Number),
      threePointersAttempted: expect.any(Number),
      freeThrowsMade: expect.any(Number),
      freeThrowsAttempted: expect.any(Number),
      offensiveRebounds: expect.any(Number),
      defensiveRebounds: expect.any(Number),
      fouls: expect.any(Number),
      plusMinus: expect.any(Number),
      starter: true,
    });
  });
});
