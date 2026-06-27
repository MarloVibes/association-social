import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  buildLiveTimeline,
  currentTimelineEvent,
  livePlayerStatsAt,
  periodLabel,
} = require('../../functions/franchise/liveTimeline.js');
const {
  buildArenaTheme,
} = require('../../functions/franchise/arenaTheme.js');

const baseInput = {
  gameId: 'nba-live-ot-1',
  seed: 'nba-live-seed-1',
  homeTeamId: 'LAL',
  awayTeamId: 'BOS',
  homeScore: 112,
  awayScore: 109,
  quarters: [
    { quarter: 1, home: 25, away: 25 },
    { quarter: 2, home: 28, away: 26 },
    { quarter: 3, home: 24, away: 26 },
    { quarter: 4, home: 24, away: 24 },
    { quarter: 5, home: 11, away: 8 },
  ],
  homePlayers: [
    { playerId: 'lal-1', name: 'Home Star', points: 34, rebounds: 8, assists: 6, steals: 2, blocks: 1, turnovers: 3, fouls: 2 },
    { playerId: 'lal-2', name: 'Home Wing', points: 21, rebounds: 5, assists: 2, steals: 1, blocks: 0, turnovers: 1, fouls: 3 },
    { playerId: 'lal-3', name: 'Home Bench', points: 57, rebounds: 4, assists: 3, steals: 0, blocks: 1, turnovers: 2, fouls: 2 },
  ],
  awayPlayers: [
    { playerId: 'bos-1', name: 'Away Star', points: 31, rebounds: 7, assists: 5, steals: 1, blocks: 2, turnovers: 4, fouls: 2 },
    { playerId: 'bos-2', name: 'Away Guard', points: 19, rebounds: 3, assists: 7, steals: 2, blocks: 0, turnovers: 2, fouls: 1 },
    { playerId: 'bos-3', name: 'Away Bench', points: 59, rebounds: 6, assists: 4, steals: 1, blocks: 0, turnovers: 1, fouls: 3 },
  ],
};

const supportedEventTypes = [
  'score',
  'assist',
  'steal',
  'block',
  'turnover',
  'rebound',
  'foul',
  'run',
  'momentum',
  'period_end',
  'final_buzzer',
];

describe('function live timeline mirror', () => {
  it('builds a deterministic overtime timeline that ends at the final score', () => {
    const first = buildLiveTimeline(baseInput);
    const second = buildLiveTimeline(baseInput);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      version: 1,
      gameId: 'nba-live-ot-1',
      homeTeamId: 'LAL',
      awayTeamId: 'BOS',
      homeScore: 112,
      awayScore: 109,
      revealDurationMs: expect.any(Number),
      periods: [
        { period: 1, label: 'Q1', home: 25, away: 25 },
        { period: 2, label: 'Q2', home: 28, away: 26 },
        { period: 3, label: 'Q3', home: 24, away: 26 },
        { period: 4, label: 'Q4', home: 24, away: 24 },
        { period: 5, label: 'OT', home: 11, away: 8 },
      ],
    });
    expect(first.revealDurationMs).toBe(first.events.at(-1)?.elapsedMs);
    expect(first.events.length).toBeGreaterThan(20);
    expect(first.events.every((event: { eventType: string }) => supportedEventTypes.includes(event.eventType))).toBe(true);
    expect(first.events.some((event: { eventType: string }) => event.eventType === 'steal')).toBe(true);
    expect(first.events.some((event: { eventType: string }) => event.eventType === 'block')).toBe(true);
    expect(first.events.find((event: { period: number }) => event.period === 5)).toMatchObject({ periodLabel: 'OT' });
    expect(first.events.at(-1)).toMatchObject({
      id: 'nba-live-ot-1-final',
      period: 5,
      periodLabel: 'OT',
      clockSeconds: 0,
      homeScore: 112,
      awayScore: 109,
      eventType: 'final_buzzer',
      actingTeamId: 'LAL',
      text: 'Final: BOS 109, LAL 112',
      x: 50,
      y: 50,
      momentum: 3,
      tags: ['final'],
    });
  });

  it('calculates live player stats from revealed function timeline events', () => {
    const timeline = buildLiveTimeline(baseInput);
    const leaders = livePlayerStatsAt(timeline, timeline.revealDurationMs);

    expect(leaders.find((player: { playerId: string }) => player.playerId === 'lal-1')).toMatchObject({
      name: 'Home Star',
      teamId: 'LAL',
      points: 34,
      rebounds: 8,
      assists: 6,
      steals: 2,
      blocks: 1,
    });
  });

  it('exposes period labels and current event lookup including empty timelines', () => {
    expect(periodLabel(4)).toBe('Q4');
    expect(periodLabel(5)).toBe('OT');
    expect(periodLabel(6)).toBe('2OT');

    const timeline = buildLiveTimeline(baseInput);
    const visible = currentTimelineEvent(timeline, 45_000);

    expect(visible.index).toBeGreaterThanOrEqual(0);
    expect(visible.event).not.toBeNull();
    expect(visible.event.elapsedMs).toBeLessThanOrEqual(45_000);
    expect(currentTimelineEvent({ ...timeline, events: [] }, 45_000)).toEqual({ index: -1, event: null });
  });

  it('rejects final scores that do not match period totals', () => {
    expect(() => buildLiveTimeline({ ...baseInput, awayScore: 110 })).toThrow(
      'Live timeline score mismatch: quarter totals LAL 112, BOS 109 do not match final score LAL 112, BOS 110',
    );
  });
});

describe('function arena theme mirror', () => {
  it('uses known NBA team colors for Boston metadata', () => {
    expect(buildArenaTheme({ homeAbbr: 'bos', currentYear: 2026 })).toMatchObject({
      homeAbbr: 'BOS',
      primary: '#007A33',
      secondary: '#FFFFFF',
      centerText: 'BOS',
      laneColor: '#007A33',
      scoreboardTint: '#FFFFFF',
    });
  });

  it('uses custom colors for expansion teams and safe fallbacks for unknown teams', () => {
    expect(buildArenaTheme({
      homeAbbr: 'veg',
      primaryColor: '#111111',
      secondaryColor: '#d4af37',
    })).toMatchObject({
      homeAbbr: 'VEG',
      primary: '#111111',
      secondary: '#d4af37',
      centerText: 'VEG',
    });

    const fallback = buildArenaTheme({ homeAbbr: '???' });

    expect(fallback).toMatchObject({
      homeAbbr: 'NBA',
      primary: expect.stringMatching(/^#[0-9a-f]{6}$/i),
      secondary: expect.stringMatching(/^#[0-9a-f]{6}$/i),
      text: expect.stringMatching(/^#[0-9a-f]{6}$/i),
      centerText: 'NBA',
    });
    expect(fallback.laneColor).toBe(fallback.primary);
    expect(fallback.scoreboardTint).toBe(fallback.secondary);
  });
});
