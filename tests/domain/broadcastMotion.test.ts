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
  it('uses side-view possession travel toward a basket instead of vertical board travel', () => {
    const early = buildBroadcastMotionFrame({ actors, scene: flowScene, tick: 8 });
    const late = buildBroadcastMotionFrame({ actors, scene: flowScene, tick: 52 });
    const earlyHandler = early.players.find(player => player.role === 'handler');
    const lateHandler = late.players.find(player => player.role === 'handler');

    expect(early.players).toHaveLength(10);
    expect(earlyHandler?.side).toBe('home');
    expect(lateHandler?.side).toBe('home');
    expect(Math.abs((lateHandler?.x || 0) - (earlyHandler?.x || 0))).toBeGreaterThan(24);
    expect(Math.abs((lateHandler?.y || 0) - (earlyHandler?.y || 0))).toBeLessThan(14);
    expect(late.ball.x).toBeGreaterThan(early.ball.x);
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

  it('puts blocks and rebounds near the active rim for broadcast-readable moments', () => {
    const blockScene: BroadcastScene = {
      ...flowScene,
      id: 'block',
      type: 'block',
      side: 'away',
      jumbotronCue: 'BLOCK',
      crowdEnergy: 'swell',
      x: 73,
      y: 47,
    };
    const reboundScene: BroadcastScene = {
      ...flowScene,
      id: 'rebound',
      type: 'rebound',
      side: 'away',
      jumbotronCue: 'REBOUND',
      crowdEnergy: 'swell',
      x: 73,
      y: 47,
    };

    const blockFrame = buildBroadcastMotionFrame({ actors, scene: blockScene, tick: 48 });
    const reboundFrame = buildBroadcastMotionFrame({ actors, scene: reboundScene, tick: 48 });
    const shotBlocker = blockFrame.players.find(player => player.action === 'block');
    const rebounder = reboundFrame.players.find(player => player.action === 'rebound');

    expect(shotBlocker?.side).toBe('home');
    expect(shotBlocker?.x).toBeLessThan(32);
    expect(rebounder?.x).toBeLessThan(32);
    expect(Math.abs((shotBlocker?.y || 0) - (rebounder?.y || 0))).toBeLessThan(16);
  });

  it('turns ankle-breaker events into a defender fall animation state', () => {
    const ankleBreakerScene: BroadcastScene = {
      ...flowScene,
      id: 'ankle-breaker',
      type: 'ankle_breaker',
      side: 'home',
      jumbotronCue: 'ANKLE BREAKER',
      crowdEnergy: 'eruption',
      x: 62,
      y: 48,
    };

    const frame = buildBroadcastMotionFrame({ actors, scene: ankleBreakerScene, tick: 44 });
    const ballHandler = frame.players.find(player => player.side === 'home' && player.slot === 0);
    const fallenDefender = frame.players.find(player => player.side === 'away' && player.action === 'fall');

    expect(ballHandler?.action).toBe('run');
    expect(ballHandler?.riveState).toBe('dribble_attack');
    expect(ballHandler?.moment).toBe('ankle_breaker');
    expect(fallenDefender?.slot).toBe(0);
    expect(fallenDefender?.riveState).toBe('stumble_fall');
    expect(fallenDefender?.moment).toBe('ankle_breaker');
    expect(fallenDefender?.intensity).toBe('highlight');
    expect(Math.abs((fallenDefender?.x || 0) - (ballHandler?.x || 0))).toBeLessThan(16);
  });

  it('turns steals into a live-ball runout for the stealing team', () => {
    const stealScene: BroadcastScene = {
      ...flowScene,
      id: 'steal',
      type: 'steal',
      side: 'home',
      jumbotronCue: 'STEAL',
      crowdEnergy: 'swell',
      x: 61,
      y: 49,
    };

    const frame = buildBroadcastMotionFrame({ actors, scene: stealScene, tick: 46 });
    const thief = frame.players.find(player => player.side === 'home' && player.action === 'run');

    expect(thief?.slot).toBe(0);
    expect(thief?.riveState).toBe('runout_dribble');
    expect(thief?.moment).toBe('steal');
    expect(frame.ball.detached).toBe(false);
    expect(Math.abs(frame.ball.x - (thief?.x || 0))).toBeLessThan(6);
    expect(thief?.x).toBeGreaterThan(45);
  });

  it('turns turnovers into a loose ball instead of keeping it glued to the handler', () => {
    const turnoverScene: BroadcastScene = {
      ...flowScene,
      id: 'turnover',
      type: 'turnover',
      side: 'home',
      jumbotronCue: 'TURNOVER',
      crowdEnergy: 'dip',
      x: 59,
      y: 48,
    };

    const frame = buildBroadcastMotionFrame({ actors, scene: turnoverScene, tick: 36 });
    const handler = frame.players.find(player => player.side === 'home' && player.slot === 0);

    expect(frame.ball.detached).toBe(true);
    expect(handler?.riveState).toBe('turnover_react');
    expect(handler?.moment).toBe('turnover');
    expect(Math.abs(frame.ball.x - (handler?.x || 0))).toBeGreaterThan(7);
  });

  it('exposes a stable Rive-ready animation contract for every player', () => {
    const frame = buildBroadcastMotionFrame({ actors, scene: { ...flowScene, type: 'dunk', side: 'home', jumbotronCue: 'POSTER', crowdEnergy: 'eruption' }, tick: 52 });

    expect(frame.players).toHaveLength(10);
    frame.players.forEach(player => {
      expect(player.riveState).toMatch(/^[a-z0-9_]+$/);
      expect(player.moment).toMatch(/^[a-z0-9_]+$/);
      expect(['ambient', 'normal', 'highlight']).toContain(player.intensity);
    });
    expect(frame.players.some(player => player.riveState === 'poster_fall')).toBe(true);
    expect(frame.players.some(player => player.riveState === 'dunk_finish')).toBe(true);
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
