import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  boxScoreFromPossessionTimeline,
  buildPossessionTimeline,
  totalsFromPossessionEvents,
} = require('../../functions/franchise/possessionTimeline.js');

function team(teamId: string, skill: number) {
  return {
    teamId,
    name: teamId,
    players: Array.from({ length: 9 }, (_, index) => ({
      player_id: `${teamId}-${index}`,
      full_name: `${teamId} Player ${index + 1}`,
      position: ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F', 'F', 'C'][index],
      minutes: index < 5 ? 30 : 15,
      hidden: {
        shooting: skill + (index === 1 ? 8 : 0),
        threePoint: skill + (index === 1 ? 12 : -4),
        midRange: skill + (index === 2 ? 5 : 0),
        closeShot: skill + (index === 4 ? 8 : 0),
        dunking: skill + (index === 3 ? 8 : -2),
        playmaking: skill + (index === 0 ? 8 : 0),
        passing: skill + (index === 0 ? 9 : 0),
        defense: skill + (index === 2 ? 8 : 0),
        perimeterDefense: skill + (index === 2 ? 8 : 0),
        blocking: skill + (index === 4 ? 8 : -8),
        rebounding: skill + (index === 4 ? 10 : 0),
        basketballIq: skill,
      },
    })),
  };
}

function undefinedPaths(value: unknown, path = 'timeline'): string[] {
  if (value === undefined) return [path];
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap((item, index) => undefinedPaths(item, `${path}.${index}`));
  return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => undefinedPaths(item, `${path}.${key}`));
}

describe('possession timeline engine', () => {
  it('generates a Firestore-safe version 2 timeline from basketball possessions', () => {
    const timeline = buildPossessionTimeline({
      gameId: 'game-1',
      seed: 'seed-1',
      homeTeamId: 'CHI',
      awayTeamId: 'PHI',
      homeTeam: team('CHI', 82),
      awayTeam: team('PHI', 78),
      nowMs: 10_000,
    });

    expect(timeline.version).toBe(2);
    expect(timeline.events.length).toBeGreaterThan(120);
    expect(timeline.starterMatchups).toHaveLength(5);
    expect(undefinedPaths(timeline)).toEqual([]);
    expect(timeline.events.at(-1)).toMatchObject({ eventType: 'final_buzzer', clockSeconds: 0 });
    expect(timeline.revealDurationMs).toBe(Math.round((48 * 60 / 3) * 1000));
    expect(timeline.homeScore).not.toBe(timeline.awayScore);
  });

  it('keeps assists, rebounds, and steals attached to valid possession actions', () => {
    const timeline = buildPossessionTimeline({
      gameId: 'game-2',
      seed: 'seed-2',
      homeTeamId: 'CHI',
      awayTeamId: 'PHI',
      homeTeam: team('CHI', 82),
      awayTeam: team('PHI', 78),
      nowMs: 10_000,
    });

    const statEvents = timeline.events.filter((event: any) => !['period_end', 'final_buzzer'].includes(event.eventType));
    expect(statEvents.some((event: any) => event.text.includes('Assist:'))).toBe(true);
    expect(statEvents.some((event: any) => event.text.includes('Rebound:'))).toBe(true);
    expect(statEvents.some((event: any) => event.text.includes('Steal:'))).toBe(true);
    expect(statEvents.every((event: any) => !['assist', 'rebound', 'steal'].includes(event.eventType))).toBe(true);

    statEvents.forEach((event: any) => {
      const merged = Object.assign({}, ...(event.statDeltas || []).map((delta: any) => delta.stats));
      if (merged.assists) expect(event.eventType).toBe('score');
      if (merged.rebounds) expect(['miss', 'free_throw_trip'].includes(event.eventType)).toBe(true);
      if (merged.steals) expect(event.eventType).toBe('turnover');
    });
  });

  it('derives final score and player box score from the possession events', () => {
    const timeline = buildPossessionTimeline({
      gameId: 'game-3',
      seed: 'seed-3',
      homeTeamId: 'CHI',
      awayTeamId: 'PHI',
      homeTeam: team('CHI', 82),
      awayTeam: team('PHI', 78),
      nowMs: 10_000,
    });
    const totals = totalsFromPossessionEvents(timeline);
    const boxScore = boxScoreFromPossessionTimeline(timeline);

    expect(totals.homeScore).toBe(timeline.homeScore);
    expect(totals.awayScore).toBe(timeline.awayScore);
    expect(totals.players.length).toBeGreaterThanOrEqual(10);
    expect(totals.players.reduce((sum: number, player: any) => sum + player.points, 0)).toBe(timeline.homeScore + timeline.awayScore);
    expect(boxScore.home.points).toBe(timeline.homeScore);
    expect(boxScore.away.points).toBe(timeline.awayScore);
    expect(boxScore.home.players.reduce((sum: number, player: any) => sum + player.points, 0)).toBe(timeline.homeScore);
  });

  it('biases a chosen winner through the simulated possessions', () => {
    const timeline = buildPossessionTimeline({
      gameId: 'game-4',
      seed: 'seed-4',
      homeTeamId: 'CHI',
      awayTeamId: 'PHI',
      homeTeam: team('CHI', 73),
      awayTeam: team('PHI', 86),
      preferredWinnerTeamId: 'CHI',
      nowMs: 10_000,
    });

    expect(timeline.homeScore).toBeGreaterThan(timeline.awayScore);
    expect(totalsFromPossessionEvents(timeline).homeScore).toBe(timeline.homeScore);
  });
});
