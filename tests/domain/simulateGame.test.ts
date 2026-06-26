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

  it('keeps player production tied to skill profiles and realistic team totals', () => {
    const result = simulateGame({
      home: {
        teamId: 'SAS',
        players: [
          { playerId: 'duncan', name: 'Tim Duncan', position: 'PF', minutes: 34, shooting: 84, playmaking: 62, rebounding: 94, defense: 96 },
          { playerId: 'parker', name: 'Tony Parker', position: 'PG', minutes: 34, shooting: 88, playmaking: 91, rebounding: 45, defense: 72 },
          { playerId: 'ginobili', name: 'Manu Ginobili', position: 'SG', minutes: 30, shooting: 89, playmaking: 86, rebounding: 58, defense: 78 },
          { playerId: 'splitter', name: 'Tiago Splitter', position: 'C', minutes: 24, shooting: 66, playmaking: 45, rebounding: 82, defense: 80 },
          { playerId: 'green', name: 'Danny Green', position: 'SG', minutes: 22, shooting: 80, playmaking: 52, rebounding: 55, defense: 82 },
        ],
      },
      away: {
        teamId: 'CHI',
        players: [
          { playerId: 'rose', name: 'Derrick Rose', position: 'PG', minutes: 38, shooting: 92, playmaking: 92, rebounding: 52, defense: 70 },
          { playerId: 'boozer', name: 'Carlos Boozer', position: 'PF', minutes: 32, shooting: 80, playmaking: 50, rebounding: 88, defense: 62 },
          { playerId: 'noah', name: 'Joakim Noah', position: 'C', minutes: 30, shooting: 62, playmaking: 70, rebounding: 90, defense: 90 },
          { playerId: 'korver', name: 'Kyle Korver', position: 'SG', minutes: 22, shooting: 89, playmaking: 48, rebounding: 42, defense: 55 },
          { playerId: 'asik', name: 'Omer Asik', position: 'C', minutes: 14, shooting: 45, playmaking: 34, rebounding: 84, defense: 82 },
        ],
      },
    }, 'profile-seed');

    expect(result.home.rebounds).toBeLessThanOrEqual(58);
    expect(result.away.rebounds).toBeLessThanOrEqual(58);
    expect(result.home.assists).toBeLessThanOrEqual(34);
    expect(result.away.assists).toBeLessThanOrEqual(34);
    const home = new Map(result.home.players.map(player => [player.name, player]));
    const away = new Map(result.away.players.map(player => [player.name, player]));
    expect(home.get('Tim Duncan')!.rebounds).toBeGreaterThan(home.get('Tony Parker')!.rebounds);
    expect(home.get('Tony Parker')!.assists).toBeGreaterThan(home.get('Tim Duncan')!.assists);
    expect(away.get('Derrick Rose')!.rebounds).toBeLessThanOrEqual(8);
    expect(away.get('Omer Asik')!.assists).toBeLessThanOrEqual(2);
  });
});
