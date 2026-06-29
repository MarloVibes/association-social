import { describe, expect, it } from 'vitest';
import { buildLiveCourtState } from '@/domain/nba/liveCourt';

describe('Live Mode court state', () => {
  it('renders a full five-on-five possession around the ball', () => {
    const state = buildLiveCourtState({
      event: {
        x: 64,
        y: 38,
        actingTeamId: 'CHI',
      },
      homeTeamId: 'SAS_2011',
      awayTeamId: 'CHI',
      homeAbbr: 'SAS',
      awayAbbr: 'CHI',
    });

    expect(state.players).toHaveLength(10);
    expect(state.players.filter(player => player.side === 'home')).toHaveLength(5);
    expect(state.players.filter(player => player.side === 'away')).toHaveLength(5);
    expect(state.players.filter(player => player.active)).toHaveLength(1);
    expect(state.ball).toMatchObject({ x: 64, y: 38, side: 'away' });
  });

  it('keeps court tokens inside the visible floor', () => {
    const state = buildLiveCourtState({
      event: {
        x: 2,
        y: 98,
        actingTeamId: 'SAS_2011',
      },
      homeTeamId: 'SAS_2011',
      awayTeamId: 'CHI',
      homeAbbr: 'SAS',
      awayAbbr: 'CHI',
    });

    expect(state.players.every(player => player.x >= 5 && player.x <= 95 && player.y >= 8 && player.y <= 92)).toBe(true);
    expect(state.ball.x).toBeGreaterThanOrEqual(5);
    expect(state.ball.y).toBeLessThanOrEqual(92);
  });
});
