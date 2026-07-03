import { describe, expect, it } from 'vitest';
import { buildBroadcastScene, buildPostgameStage, spacingForCoachingStyle } from '@/domain/nba/broadcastDirector';
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

describe('broadcast director', () => {
  it('maps signature basketball events to broadcast scenes and arena reactions', () => {
    expect(buildBroadcastScene({ event: event({ points: 3, text: 'Stephen Curry made deep 3PT jumper' }), homeTeamId: 'NYK', awayTeamId: 'BOS' })).toMatchObject({
      type: 'deep_three',
      jumbotronCue: 'DEEP THREE',
      crowdEnergy: 'swell',
    });
    expect(buildBroadcastScene({ event: event({ points: 2, text: 'Anthony Edwards throws down a poster dunk' }), homeTeamId: 'NYK', awayTeamId: 'BOS' })).toMatchObject({
      type: 'dunk',
      jumbotronCue: 'POSTER',
      crowdEnergy: 'eruption',
    });
    expect(buildBroadcastScene({ event: event({ eventType: 'block', points: undefined, text: 'Rudy Gobert blocks the shot' }), homeTeamId: 'NYK', awayTeamId: 'BOS' })).toMatchObject({
      type: 'block',
      jumbotronCue: 'BLOCK',
    });
  });

  it('uses coaching style to change spacing hints without creating mid-game controls', () => {
    expect(spacingForCoachingStyle('Pace and Space')).toMatchObject({ width: 'wide', tempo: 'fast', paintTouch: 'low' });
    expect(spacingForCoachingStyle('Grit and Grind')).toMatchObject({ width: 'tight', tempo: 'slow', paintTouch: 'high' });
    expect(spacingForCoachingStyle('Blitz Pressure')).toMatchObject({ defenseDepth: 'high' });
  });

  it('builds a postgame sequence instead of freezing at final', () => {
    expect(buildPostgameStage({ elapsedAfterFinalMs: 800 })).toBe('buzzer');
    expect(buildPostgameStage({ elapsedAfterFinalMs: 3_200 })).toBe('celebration');
    expect(buildPostgameStage({ elapsedAfterFinalMs: 8_200 })).toBe('sportsmanship');
    expect(buildPostgameStage({ elapsedAfterFinalMs: 13_400 })).toBe('locker_exit');
    expect(buildPostgameStage({ elapsedAfterFinalMs: 20_000 })).toBe('settled');
  });

  it('marks final scenes as postgame with final-score jumbotron state', () => {
    const scene = buildBroadcastScene({
      event: event({ id: 'final', eventType: 'final_buzzer', points: undefined, text: 'Final buzzer.' }),
      homeTeamId: 'NYK',
      awayTeamId: 'BOS',
      elapsedAfterFinalMs: 4_000,
    });

    expect(scene).toMatchObject({
      type: 'postgame',
      postgameStage: 'celebration',
      jumbotronCue: 'FINAL',
    });
  });
});
