import { describe, expect, it } from 'vitest';
import {
  buildLiveTimeline,
  commandInsightsForTimeline,
  currentTimelineEvent,
  livePlayerStatsAt,
  playableLiveTimeline,
  periodLabel,
  starterMatchupsForTimeline,
  type LiveTimelineEvent,
  type LiveTimelineInput,
} from '@/domain/nba/liveTimeline';

const supportedEventTypes: LiveTimelineEvent['eventType'][] = [
  'score',
  'block',
  'miss',
  'turnover',
  'foul',
  'free_throw_trip',
  'timeout',
  'run',
  'momentum',
  'drive',
  'inning',
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
    { playerId: 'h1', name: 'Home Star', points: 34, rebounds: 8, assists: 6, steals: 2, blocks: 1, turnovers: 3, fouls: 2 },
    { playerId: 'h2', name: 'Home Wing', points: 21, rebounds: 5, assists: 2, steals: 1, blocks: 0, turnovers: 1, fouls: 3 },
    { playerId: 'h3', name: 'Home Bench', points: 49, rebounds: 4, assists: 3, steals: 0, blocks: 1, turnovers: 2, fouls: 2 },
  ],
  awayPlayers: [
    { playerId: 'a1', name: 'Away Star', points: 31, rebounds: 7, assists: 5, steals: 1, blocks: 2, turnovers: 4, fouls: 2 },
    { playerId: 'a2', name: 'Away Guard', points: 19, rebounds: 3, assists: 7, steals: 2, blocks: 0, turnovers: 2, fouls: 1 },
    { playerId: 'a3', name: 'Away Bench', points: 51, rebounds: 6, assists: 4, steals: 1, blocks: 0, turnovers: 1, fouls: 3 },
  ],
};

describe('Live Mode timeline', () => {
  it('generates a deterministic score timeline that ends at the final score', () => {
    const first = buildLiveTimeline(baseInput);
    const second = buildLiveTimeline(baseInput);

    expect(first).toEqual(second);
    expect(first).toMatchObject({ version: 1, revealDurationMs: expect.any(Number) });
    expect(first.revealDurationMs).toBe(first.events.at(-1)?.elapsedMs);
    expect(first.revealDurationMs).toBe(16 * 60 * 1000);
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

  it('accepts sport-specific live event types used by NFL and MLB timelines', () => {
    const eventTypes: LiveTimelineEvent['eventType'][] = ['drive', 'inning'];

    expect(eventTypes.every(type => supportedEventTypes.includes(type))).toBe(true);
  });

  it('prefers the separately stored replay timeline over the compact schedule marker', () => {
    const scheduleTimeline = {
      version: 2,
      gameId: 'game-live-1',
      homeTeamId: 'LAL',
      awayTeamId: 'BOS',
      homeScore: 104,
      awayScore: 101,
      revealDurationMs: 900_000,
      periods: [{ period: 1, label: 'Q1', home: 25, away: 23 }],
    } as any;
    const storedTimeline = buildLiveTimeline(baseInput);

    expect(playableLiveTimeline({ scheduleTimeline, storedTimeline })).toBe(storedTimeline);
    expect(playableLiveTimeline({ scheduleTimeline, storedTimeline: null })).toBeNull();
  });

  it('treats compact timeline markers without events as not yet playable', () => {
    const compactTimeline = {
      version: 2,
      gameId: 'game-live-compact',
      homeTeamId: 'LAL',
      awayTeamId: 'BOS',
      homeScore: 104,
      awayScore: 101,
      revealDurationMs: 900_000,
      periods: [{ period: 1, label: 'Q1', home: 25, away: 23 }],
      storage: 'liveTimelines',
    } as any;

    expect(playableLiveTimeline({ scheduleTimeline: compactTimeline, storedTimeline: null })).toBeNull();
    expect(currentTimelineEvent(compactTimeline, 1_000)).toEqual({ event: null, index: -1 });
    expect(livePlayerStatsAt(compactTimeline, 1_000)).toEqual([]);
    expect(commandInsightsForTimeline(compactTimeline, 1_000)).toEqual([]);
  });

  it('adds non-scoring play actions and live player stat deltas', () => {
    const timeline = buildLiveTimeline(baseInput);
    const types = new Set(timeline.events.map(event => event.eventType));

    expect(types.has('turnover')).toBe(true);
    expect(types.has('block')).toBe(true);
    expect(types.has('miss')).toBe(true);
    expect(types.has('foul')).toBe(true);

    const steal = timeline.events.find(event => event.text.includes('Steal:'));
    expect(steal).toMatchObject({
      playerName: expect.any(String),
      text: expect.stringContaining('Steal:'),
    });
    expect(steal?.statDeltas?.some(delta => delta.stats.steals === 1)).toBe(true);
  });

  it('builds possession-based events instead of standalone stat noise', () => {
    const timeline = buildLiveTimeline(baseInput);
    const visible = timeline.events.filter(event => event.eventType !== 'final_buzzer' && event.eventType !== 'period_end');

    expect(visible.some(event => event.text.includes('Assist:'))).toBe(true);
    expect(visible.some(event => event.text.includes('Rebound:'))).toBe(true);
    expect(visible.some(event => event.text.includes('Steal:'))).toBe(true);
    expect(visible.every(event => !['assist', 'rebound', 'steal'].includes(String(event.eventType)))).toBe(true);

    visible.forEach((event) => {
      if (event.statDelta?.assists) {
        expect(event.statDelta.points).toBeGreaterThan(0);
        expect(event.text).toContain('made');
      }
      if (event.statDelta?.rebounds) {
        expect(event.text).toMatch(/missed|free throw/i);
      }
      const merged = Object.assign({}, ...(event.statDeltas || []).map(delta => delta.stats));
      if (merged.steals) {
        expect(merged.turnovers).toBe(1);
        expect(event.text).toContain('turnover');
      }
    });
  });

  it('calculates live player stat leaders from revealed events', () => {
    const timeline = buildLiveTimeline(baseInput);
    const leaders = livePlayerStatsAt(timeline, timeline.revealDurationMs);

    expect(leaders.find(player => player.playerId === 'h1')).toMatchObject({
      name: 'Home Star',
      teamId: 'LAL',
      points: 34,
      rebounds: 8,
      assists: 6,
      steals: 2,
      blocks: 1,
    });
    expect(leaders[0].points).toBeGreaterThanOrEqual(leaders[1].points);
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

  it('keeps raw era team ids out of generated period and final event text', () => {
    const timeline = buildLiveTimeline({
      ...baseInput,
      homeTeamId: 'LAL',
      awayTeamId: 'MIN_2003',
    });

    const eventText = timeline.events.map(event => event.text).join('\n');
    expect(eventText).not.toContain('MIN_2003');
    expect(timeline.events.find(event => event.eventType === 'period_end')?.text).toContain('MIN ');
    expect(timeline.events.at(-1)?.text).toContain('Final: MIN 101 - LAL 104');
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
    expect(timeline.revealDurationMs).toBe(Math.round(((48 * 60 + 5 * 60) / 3) * 1000));
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

  it('reads starter matchup rows from version 2 timelines', () => {
    const timeline = {
      version: 2,
      gameId: 'game-1',
      homeTeamId: 'CHI',
      awayTeamId: 'PHI',
      homeScore: 100,
      awayScore: 98,
      revealDurationMs: 960000,
      periods: [],
      starterMatchups: [
        { position: 'PG', awayPlayer: { playerId: 'a1', name: 'Away PG', teamId: 'PHI' }, homePlayer: { playerId: 'h1', name: 'Home PG', teamId: 'CHI' } },
        { position: 'SG', awayPlayer: { playerId: 'a2', name: 'Away SG', teamId: 'PHI' }, homePlayer: { playerId: 'h2', name: 'Home SG', teamId: 'CHI' } },
        { position: 'SF', awayPlayer: { playerId: 'a3', name: 'Away SF', teamId: 'PHI' }, homePlayer: { playerId: 'h3', name: 'Home SF', teamId: 'CHI' } },
        { position: 'PF', awayPlayer: { playerId: 'a4', name: 'Away PF', teamId: 'PHI' }, homePlayer: { playerId: 'h4', name: 'Home PF', teamId: 'CHI' } },
        { position: 'C', awayPlayer: { playerId: 'a5', name: 'Away C', teamId: 'PHI' }, homePlayer: { playerId: 'h5', name: 'Home C', teamId: 'CHI' } },
      ],
      events: [],
    } as any;

    expect(starterMatchupsForTimeline(timeline)).toHaveLength(5);
    expect(starterMatchupsForTimeline(null)).toEqual([]);
  });

  it('surfaces command insights only from revealed enriched events', () => {
    const timeline = {
      version: 2,
      gameId: 'command-game',
      homeTeamId: 'LAL',
      awayTeamId: 'BOS',
      homeScore: 100,
      awayScore: 96,
      revealDurationMs: 90_000,
      periods: [],
      events: [
        {
          id: 'opening-score',
          period: 1,
          periodLabel: 'Q1',
          clockSeconds: 690,
          elapsedMs: 10_000,
          homeScore: 2,
          awayScore: 0,
          eventType: 'score',
          actingTeamId: 'LAL',
          text: 'Home Star made a layup.',
          x: 58,
          y: 42,
          momentum: 1,
          tags: ['score'],
          importance: 2,
          spotlight: 'score',
          why: 'The early post touch punished a smaller defender.',
        },
        {
          id: 'future-final',
          period: 4,
          periodLabel: 'Q4',
          clockSeconds: 0,
          elapsedMs: 90_000,
          homeScore: 100,
          awayScore: 96,
          eventType: 'final_buzzer',
          actingTeamId: 'LAL',
          text: 'Final: BOS 96 - LAL 100',
          x: 50,
          y: 50,
          momentum: 4,
          tags: ['final'],
          importance: 3,
          spotlight: 'clutch',
          why: 'LAL closed the game at the line.',
        },
      ],
    } as any;

    expect(commandInsightsForTimeline(timeline, 20_000)).toEqual([
      expect.objectContaining({
        id: 'opening-score',
        title: 'Score',
        text: 'The early post touch punished a smaller defender.',
      }),
    ]);
    expect(commandInsightsForTimeline(timeline, 20_000).map(item => item.id)).not.toContain('future-final');
    expect(commandInsightsForTimeline(timeline, 90_000).map(item => item.id)).toContain('future-final');
  });
});
