import { describe, expect, it } from 'vitest';
import { buildBroadcastActorsForLineup } from '@/domain/nba/broadcastActors';
import { buildBroadcastMotionFrame } from '@/domain/nba/broadcastMotion';
import type { BroadcastScene } from '@/domain/nba/broadcastDirector';

const actors = buildBroadcastActorsForLineup({
  homeTeam: { teamId: 'NYK', abbreviation: 'NYK', primaryColor: '#006BB6', secondaryColor: '#F58426' },
  awayTeam: { teamId: 'MIN', abbreviation: 'MIN', primaryColor: '#0C2340', secondaryColor: '#78BE20' },
  homePlayers: [],
  awayPlayers: [],
});

const flowScene: BroadcastScene = {
  id: 'loading',
  type: 'flow',
  side: 'neutral',
  jumbotronCue: 'LIVE',
  crowdEnergy: 'idle',
  postgameStage: 'none',
  caption: 'Live replay is loading.',
  x: 50,
  y: 50,
};

describe('broadcast motion', () => {
  it('uses full-court possession travel instead of left-right head bobbing', () => {
    const early = buildBroadcastMotionFrame({ actors, scene: flowScene, tick: 8 });
    const late = buildBroadcastMotionFrame({ actors, scene: flowScene, tick: 52 });
    const earlyHandler = early.players.find(player => player.role === 'handler');
    const lateHandler = late.players.find(player => player.role === 'handler');

    expect(early.players).toHaveLength(10);
    expect(earlyHandler?.side).toBe('home');
    expect(lateHandler?.side).toBe('home');
    expect(Math.abs((lateHandler?.y || 0) - (earlyHandler?.y || 0))).toBeGreaterThan(18);
    expect(Math.abs((lateHandler?.x || 0) - (earlyHandler?.x || 0))).toBeLessThan(12);
    expect(late.ball.y).toBeLessThan(early.ball.y);
  });

  it('detaches the ball on shot scenes instead of pinning it to the player hip', () => {
    const scene: BroadcastScene = {
      ...flowScene,
      id: 'deep-three',
      type: 'deep_three',
      side: 'home',
      shotValue: 3,
      jumbotronCue: 'DEEP THREE',
      crowdEnergy: 'swell',
      x: 32,
      y: 38,
    };
    const frame = buildBroadcastMotionFrame({ actors, scene, tick: 36 });
    const shooter = frame.players.find(player => player.role === 'handler');

    expect(frame.ball.detached).toBe(true);
    expect(Math.abs(frame.ball.x - (shooter?.x || 0))).toBeGreaterThan(5);
    expect(frame.ball.y).toBeLessThan(shooter?.y || 100);
  });

  it('moves players through postgame celebration, sportsmanship, and locker exit beats', () => {
    const celebration = buildBroadcastMotionFrame({ actors, scene: { ...flowScene, type: 'postgame', side: 'home', postgameStage: 'celebration' }, tick: 5 });
    const sportsmanship = buildBroadcastMotionFrame({ actors, scene: { ...flowScene, type: 'postgame', side: 'home', postgameStage: 'sportsmanship' }, tick: 5 });
    const exit = buildBroadcastMotionFrame({ actors, scene: { ...flowScene, type: 'postgame', side: 'home', postgameStage: 'locker_exit' }, tick: 5 });

    expect(celebration.players.some(player => player.action === 'celebrate')).toBe(true);
    expect(sportsmanship.players.every(player => player.action === 'sportsmanship')).toBe(true);
    expect(exit.players.every(player => player.action === 'exit')).toBe(true);
  });
});
