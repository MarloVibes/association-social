import { describe, expect, it } from 'vitest';
import { generateSchedule } from '@/domain/nba/schedule';

describe('NBA schedule generation', () => {
  for (const games of [14, 29, 58, 82] as const) {
    it(`creates ${games} games per team`, () => {
      const teams = Array.from({ length: 30 }, (_, i) => `t${i}`);
      const schedule = generateSchedule({ teams, gamesPerTeam: games, seed: `s-${games}` });
      for (const team of teams) {
        expect(schedule.filter(game => game.homeTeamId === team || game.awayTeamId === team)).toHaveLength(games);
      }
    });
  }

  it('is deterministic with stable game IDs and balanced home games', () => {
    const teams = Array.from({ length: 32 }, (_, i) => `x${i}`);
    const first = generateSchedule({ teams, gamesPerTeam: 29, seed: 'stable' });
    const second = generateSchedule({ teams, gamesPerTeam: 29, seed: 'stable' });
    const ids = new Set(first.map(game => game.id));

    expect(second).toEqual(first);
    expect(ids.size).toBe(first.length);
    for (const team of teams) {
      const home = first.filter(game => game.homeTeamId === team).length;
      const away = first.filter(game => game.awayTeamId === team).length;
      expect(Math.abs(home - away)).toBeLessThanOrEqual(1);
    }
  });

  it('supports expansion leagues up to 36 teams', () => {
    const teams = Array.from({ length: 36 }, (_, i) => `e${i}`);
    const schedule = generateSchedule({ teams, gamesPerTeam: 14, seed: 'expansion' });

    expect(schedule).toHaveLength((36 * 14) / 2);
    expect(schedule.every(game => game.status === 'scheduled')).toBe(true);
  });
});
