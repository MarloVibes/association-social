import { describe, expect, it } from 'vitest';
import {
  buildLiveTimeline,
  currentTimelineEvent,
  periodLabel,
  type LiveTimelineEvent,
  type LiveTimelineInput,
} from '@/domain/nba/liveTimeline';

const supportedEventTypes: LiveTimelineEvent['eventType'][] = [
  'score',
  'turnover',
  'rebound',
  'foul',
  'run',
  'momentum',
  'period_end',
  'final_buzzer',
];

const baseInput: LiveTimelineInput = {
  gameId: 'game-live-1',
  seed: 'seed-live-1',
  homeTeamId: 'LAL',
  awayTeamId: 'BOS',
  homeScore: 104,
  awayScore: 101,
  quarters: [
    { quarter: 1, home: 25, away: 23 },
    { quarter: 2, home: 26, away: 27 },
    { quarter: 3, home: 24, away: 24 },
    { quarter: 4, home: 29, away: 27 },
  ],
  homePlayers: [
    { playerId: 'h1', name: 'Home Star', points: 34 },
    { playerId: 'h2', name: 'Home Wing', points: 21 },
  ],
  awayPlayers: [
    { playerId: 'a1', name: 'Away Star', points: 31 },
    { playerId: 'a2', name: 'Away Guard', points: 19 },
  ],
};

describe('Live Mode timeline', () => {
  it('generates a deterministic score timeline that ends at the final score', () => {
    const first = buildLiveTimeline(baseInput);
    const second = buildLiveTimeline(baseInput);

    expect(first).toEqual(second);
    expect(first).toMatchObject({ version: 1, revealDurationMs: expect.any(Number) });
    expect(first.revealDurationMs).toBe(first.events.at(-1)?.elapsedMs);
    expect(first.events.length).toBeGreaterThan(20);
    expect(first.events[0]).toMatchObject({ period: 1, homeScore: expect.any(Number), awayScore: expect.any(Number) });
    expect(first.events.at(-1)).toMatchObject({
      homeScore: 104,
      awayScore: 101,
      eventType: 'final_buzzer',
    });
  });

  it('rejects final scores that do not match period scoring totals', () => {
    expect(() =>
      buildLiveTimeline({
        ...baseInput,
        homeScore: 105,
      }),
    ).toThrow('Live timeline score mismatch: quarter totals LAL 104, BOS 101 do not match final score LAL 105, BOS 101');
  });

  it('exposes the planned event API contract', () => {
    const timeline = buildLiveTimeline({
      ...baseInput,
      homePlayers: [
        { playerId: 'h1', name: 'Home Star' },
        { playerId: 'h2', name: 'Home Wing', points: 21 },
      ],
    });
    const scoreEvent = timeline.events.find(event => event.eventType === 'score');

    expect(scoreEvent).toMatchObject({
      actingTeamId: expect.stringMatching(/^(LAL|BOS)$/),
      text: expect.any(String),
      x: expect.any(Number),
      y: expect.any(Number),
      momentum: expect.any(Number),
      tags: expect.any(Array),
    });
    expect(scoreEvent).not.toHaveProperty('teamId');
    expect(scoreEvent?.tags).toContain('score');
    expect(timeline.events.every(event => supportedEventTypes.includes(event.eventType))).toBe(true);
  });

  it('keeps events sorted by period and descending game clock', () => {
    const timeline = buildLiveTimeline(baseInput);
    const keys = timeline.events.map(event => `${String(event.period).padStart(2, '0')}:${String(720 - event.clockSeconds).padStart(3, '0')}`);

    expect(keys).toEqual([...keys].sort());
  });

  it('labels overtime periods clearly', () => {
    expect(periodLabel(1)).toBe('Q1');
    expect(periodLabel(4)).toBe('Q4');
    expect(periodLabel(5)).toBe('OT');
    expect(periodLabel(6)).toBe('2OT');
    expect(periodLabel(7)).toBe('3OT');
  });

  it('creates overtime events when regulation ends tied', () => {
    const timeline = buildLiveTimeline({
      ...baseInput,
      homeScore: 112,
      awayScore: 109,
      quarters: [
        { quarter: 1, home: 25, away: 25 },
        { quarter: 2, home: 28, away: 26 },
        { quarter: 3, home: 24, away: 26 },
        { quarter: 4, home: 24, away: 24 },
        { quarter: 5, home: 11, away: 8 },
      ],
    });

    expect(timeline.events.some(event => event.period === 5)).toBe(true);
    expect(timeline.periods.at(-1)).toMatchObject({ period: 5, label: 'OT', home: 11, away: 8 });
    expect(timeline.events.at(-1)).toMatchObject({ homeScore: 112, awayScore: 109 });
  });

  it('finds the visible event from elapsed reveal time', () => {
    const timeline = buildLiveTimeline(baseInput);
    const visible = currentTimelineEvent(timeline, 45_000);

    expect(visible.event).not.toBeNull();
    if (!visible.event) {
      throw new Error('Expected a visible timeline event');
    }
    expect(visible.event.elapsedMs).toBeLessThanOrEqual(45_000);
    expect(visible.index).toBeGreaterThanOrEqual(0);
  });

  it('returns no visible event for an empty timeline', () => {
    const visible = currentTimelineEvent({
      version: 1,
      gameId: 'empty-game',
      homeTeamId: 'LAL',
      awayTeamId: 'BOS',
      homeScore: 0,
      awayScore: 0,
      revealDurationMs: 0,
      periods: [],
      events: [],
    }, 10_000);

    expect(visible).toEqual({ index: -1, event: null });
  });
});
