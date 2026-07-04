import { describe, expect, it } from 'vitest';
import { buildBasketballMotionFrame, buildLiveVisualBoardState } from '@/domain/nba/liveVisualBoard';
import type { LiveTimelineEvent } from '@/domain/nba/liveTimeline';

function event(overrides: Partial<LiveTimelineEvent>): LiveTimelineEvent {
  return {
    id: 'event-1',
    period: 4,
    periodLabel: 'Q4',
    clockSeconds: 161,
    elapsedMs: 120_000,
    homeScore: 84,
    awayScore: 82,
    eventType: 'score',
    actingTeamId: 'NYK',
    text: 'Jalen Brunson made 3-pointer',
    x: 35,
    y: 42,
    momentum: 6,
    tags: ['score'],
    points: 3,
    ...overrides,
  };
}

describe('live visual board state', () => {
  it('creates a +3 scoring pop for made threes near the active scoring location', () => {
    const state = buildLiveVisualBoardState({
      event: event({ points: 3, x: 38, y: 40 }),
      homeTeamId: 'NYK',
      awayTeamId: 'MEM',
      homeAbbr: 'NYK',
      awayAbbr: 'MEM',
      homeCoachingLabel: 'Pace and Space',
      awayCoachingLabel: 'Grit and Grind',
    });

    expect(state.scorePop).toMatchObject({ value: '+3', x: 38, y: 40, side: 'home' });
    expect(state.coaching.home).toBe('Pace and Space');
    expect(state.coaching.away).toBe('Grit and Grind');
  });

  it('creates a +2 scoring pop for made twos and never emits fixed basket-side team names', () => {
    const state = buildLiveVisualBoardState({
      event: event({ id: 'two', points: 2, x: 12, y: 50 }),
      homeTeamId: 'NYK',
      awayTeamId: 'MEM',
      homeAbbr: 'NYK',
      awayAbbr: 'MEM',
    });

    expect(state.scorePop).toMatchObject({ value: '+2', x: 12, y: 50 });
    expect(state.fixedBasketLabels).toEqual([]);
  });

  it('omits score pops for misses and neutral events', () => {
    const state = buildLiveVisualBoardState({
      event: event({ eventType: 'miss', points: undefined, actingTeamId: 'MEM' }),
      homeTeamId: 'NYK',
      awayTeamId: 'MEM',
      homeAbbr: 'NYK',
      awayAbbr: 'MEM',
    });

    expect(state.scorePop).toBeNull();
  });

  it('builds a simple continuous 5v5 basketball motion frame instead of feed-jump positions', () => {
    const early = buildBasketballMotionFrame({ progress: 0.12 });
    const late = buildBasketballMotionFrame({ progress: 0.38 });
    const returning = buildBasketballMotionFrame({ progress: 0.74 });

    expect(early.players).toHaveLength(10);
    expect(early.players.filter(player => player.side === 'home')).toHaveLength(5);
    expect(early.players.filter(player => player.side === 'away')).toHaveLength(5);
    expect(early.ball.side).toBe('home');
    expect(late.ball.x).toBeGreaterThan(early.ball.x);
    expect(returning.ball.side).toBe('away');
    expect(returning.ball.x).toBeLessThan(late.ball.x);
    for (const frame of [early, late, returning]) {
      expect(frame.ball.x).toBeGreaterThanOrEqual(8);
      expect(frame.ball.x).toBeLessThanOrEqual(92);
      expect(frame.ball.y).toBeGreaterThanOrEqual(10);
      expect(frame.ball.y).toBeLessThanOrEqual(90);
      for (const player of frame.players) {
        expect(player.x).toBeGreaterThanOrEqual(5);
        expect(player.x).toBeLessThanOrEqual(95);
        expect(player.y).toBeGreaterThanOrEqual(8);
        expect(player.y).toBeLessThanOrEqual(92);
      }
    }
  });

  it('turns deep threes into detached shot flight instead of keeping the ball on the handler', () => {
    const state = buildLiveVisualBoardState({
      event: event({
        actingTeamId: 'GSW',
        playerName: 'Stephen Curry',
        points: 3,
        text: 'Stephen Curry made deep 3PT jumper.',
        x: 21,
        y: 38,
      }),
      homeTeamId: 'GSW',
      awayTeamId: 'BOS',
      homeAbbr: 'GSW',
      awayAbbr: 'BOS',
    });
    const frame = buildBasketballMotionFrame({ progress: 0.56, cue: state.motionCue });
    const handler = frame.players.find(player => player.active);
    const distanceFromHandler = Math.hypot(frame.ball.x - (handler?.x || 0), frame.ball.y - (handler?.y || 0));

    expect(state.motionCue).toMatchObject({ kind: 'deep_three', side: 'home', shotValue: 3 });
    expect(frame.ball.detached).toBe(true);
    expect(distanceFromHandler).toBeGreaterThan(8);
    expect(frame.ball.x).toBeGreaterThan(handler?.x || 0);
  });

  it('turns blocks and rebounds into rim action cues', () => {
    const blockState = buildLiveVisualBoardState({
      event: event({
        eventType: 'block',
        actingTeamId: 'MEM',
        points: undefined,
        text: 'Jaren Jackson Jr. blocks the shot. Rebound: Memphis.',
      }),
      homeTeamId: 'NYK',
      awayTeamId: 'MEM',
      homeAbbr: 'NYK',
      awayAbbr: 'MEM',
    });
    const reboundState = buildLiveVisualBoardState({
      event: event({
        eventType: 'miss',
        actingTeamId: 'MEM',
        points: undefined,
        text: 'Karl-Anthony Towns missed jumper. Rebound: Zach Edey.',
      }),
      homeTeamId: 'NYK',
      awayTeamId: 'MEM',
      homeAbbr: 'NYK',
      awayAbbr: 'MEM',
    });
    const blockFrame = buildBasketballMotionFrame({ progress: 0.64, cue: blockState.motionCue });
    const reboundFrame = buildBasketballMotionFrame({ progress: 0.82, cue: reboundState.motionCue });

    expect(blockState.motionCue).toMatchObject({ kind: 'block', side: 'away' });
    expect(reboundState.motionCue).toMatchObject({ kind: 'rebound', side: 'away' });
    expect(blockFrame.rimAction).toBe('block');
    expect(reboundFrame.rimAction).toBe('rebound');
    expect(blockFrame.ball.detached).toBe(true);
    expect(reboundFrame.ball.detached).toBe(true);
  });

  it('freezes visual motion for final buzzer events', () => {
    const state = buildLiveVisualBoardState({
      event: event({
        id: 'final',
        eventType: 'final_buzzer',
        actingTeamId: null,
        points: undefined,
        text: 'Final buzzer.',
      }),
      homeTeamId: 'NYK',
      awayTeamId: 'MEM',
      homeAbbr: 'NYK',
      awayAbbr: 'MEM',
    });
    const frame = buildBasketballMotionFrame({ progress: 0.33, cue: state.motionCue });

    expect(state.motionCue.kind).toBe('final');
    expect(frame.frozen).toBe(true);
  });
});
