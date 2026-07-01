import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  boxScoreFromPossessionTimeline,
  buildPossessionTimeline,
  totalsFromPossessionEvents,
} = require('../../functions/franchise/possessionTimeline.js');

type BoxScorePlayer = {
  name: string;
  threePointersAttempted: number;
  freeThrowsAttempted: number;
};

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
    expect(timeline.starterMatchups.flatMap((row: any) => [
      ...(row.awayPlayer.skillChips || []),
      ...(row.homePlayer.skillChips || []),
    ])).toEqual([]);
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

  it('uses category skill grades and tendencies for live shot profile', () => {
    const timeline = buildPossessionTimeline({
      gameId: 'game-engine-profile',
      seed: 'engine-profile-seed',
      homeTeamId: 'ENGINE',
      awayTeamId: 'CPU',
      homeTeam: {
        teamId: 'ENGINE',
        players: [
          {
            player_id: 'category-shooter',
            full_name: 'Category Shooter',
            position: 'SG',
            minutes: 36,
            hidden: { shooting: 70, playmaking: 66, defense: 68 },
            category_skill_grades: {
              threePoint: { rating: 96, grade: 'A+' },
              finishing: { rating: 62, grade: 'C-' },
              playmaking: { rating: 72, grade: 'C+' },
            },
            tendencies: {
              threePointFrequency: 96,
              catchAndShootFrequency: 94,
              paintAttack: 42,
              rimFinishFrequency: 45,
            },
          },
          {
            player_id: 'category-driver',
            full_name: 'Category Driver',
            position: 'SF',
            minutes: 36,
            hidden: { shooting: 70, playmaking: 66, defense: 68 },
            category_skill_grades: {
              threePoint: { rating: 66, grade: 'C' },
              finishing: { rating: 94, grade: 'A' },
              playmaking: { rating: 74, grade: 'C+' },
            },
            tendencies: {
              threePointFrequency: 34,
              catchAndShootFrequency: 38,
              paintAttack: 94,
              rimFinishFrequency: 92,
            },
          },
          { player_id: 'engine-pg', full_name: 'Engine PG', position: 'PG', minutes: 32, hidden: { shooting: 76, playmaking: 84, defense: 72 } },
          { player_id: 'engine-pf', full_name: 'Engine PF', position: 'PF', minutes: 30, hidden: { shooting: 72, playmaking: 60, defense: 78, rebounding: 82 } },
          { player_id: 'engine-c', full_name: 'Engine C', position: 'C', minutes: 28, hidden: { shooting: 68, playmaking: 54, defense: 82, rebounding: 88 } },
        ],
      },
      awayTeam: team('CPU', 72),
      nowMs: 10_000,
    });

    const boxScore = boxScoreFromPossessionTimeline(timeline);
    const lines = new Map<string, BoxScorePlayer>(boxScore.home.players.map((player: BoxScorePlayer) => [player.name, player]));
    const shooter = lines.get('Category Shooter');
    const driver = lines.get('Category Driver');
    expect(shooter).toBeDefined();
    expect(driver).toBeDefined();
    expect(shooter!.threePointersAttempted).toBeGreaterThan(driver!.threePointersAttempted);
    expect(driver!.freeThrowsAttempted).toBeGreaterThanOrEqual(shooter!.freeThrowsAttempted);
  });

  it('lets live possessions create rare star eruptions and specialist bench scoring without boosting generic reserves', () => {
    const homeTeam = {
      teamId: 'VAR',
      players: [
        {
          player_id: 'elite-wing',
          full_name: 'Elite Wing',
          position: 'SF',
          minutes: 38,
          hidden: { shooting: 95, playmaking: 88, defense: 84, shotIq: 94, offenseIq: 92 },
          category_skill_grades: {
            overallOffense: { rating: 97, grade: 'A+' },
            finishing: { rating: 96, grade: 'A+' },
            threePoint: { rating: 91, grade: 'A-' },
            midRange: { rating: 94, grade: 'A' },
            playmaking: { rating: 88, grade: 'B+' },
          },
          tendencies: {
            paintAttack: 94,
            midRangeFrequency: 88,
            threePointFrequency: 76,
            isolationFrequency: 92,
            drawFoulPressure: 92,
          },
        },
        {
          player_id: 'bench-flamethrower',
          full_name: 'Bench Flamethrower',
          position: 'SG',
          minutes: 19,
          hidden: { shooting: 86, playmaking: 54, defense: 58, shotIq: 90 },
          category_skill_grades: {
            threePoint: { rating: 94, grade: 'A' },
            finishing: { rating: 58, grade: 'D+' },
            playmaking: { rating: 54, grade: 'D+' },
          },
          tendencies: {
            threePointFrequency: 98,
            catchAndShootFrequency: 96,
            paintAttack: 24,
          },
        },
        { player_id: 'generic-bench', full_name: 'Generic Bench', position: 'SG', minutes: 19, hidden: { shooting: 66, playmaking: 58, defense: 60 } },
        { player_id: 'starter-pg', full_name: 'Starter PG', position: 'PG', minutes: 33, hidden: { shooting: 77, playmaking: 84, defense: 72 } },
        { player_id: 'starter-pf', full_name: 'Starter PF', position: 'PF', minutes: 32, hidden: { shooting: 74, playmaking: 60, rebounding: 82, defense: 78 } },
        { player_id: 'starter-c', full_name: 'Starter C', position: 'C', minutes: 30, hidden: { shooting: 70, playmaking: 52, rebounding: 88, defense: 84 } },
        { player_id: 'reserve-f', full_name: 'Reserve F', position: 'SF', minutes: 14, hidden: { shooting: 68, playmaking: 55, defense: 70 } },
      ],
    };
    const seeds = Array.from({ length: 90 }, (_, index) => `live-variance-${index}`);
    const lines = seeds.map((seed) => {
      const timeline = buildPossessionTimeline({
        gameId: `live-${seed}`,
        seed,
        homeTeamId: 'VAR',
        awayTeamId: 'CPU',
        homeTeam,
        awayTeam: team('CPU', 75),
        nowMs: 10_000,
      });
      return new Map(boxScoreFromPossessionTimeline(timeline).home.players.map((player: any) => [player.name, player.points]));
    });

    const elitePoints = lines.map(line => Number(line.get('Elite Wing') || 0));
    const specialistPoints = lines.map(line => Number(line.get('Bench Flamethrower') || 0));
    const genericBenchPoints = lines.map(line => Number(line.get('Generic Bench') || 0));

    expect(Math.max(...elitePoints)).toBeGreaterThanOrEqual(38);
    expect(Math.max(...specialistPoints)).toBeGreaterThanOrEqual(25);
    expect(Math.max(...genericBenchPoints)).toBeLessThan(22);
  });

  it('lets creators and rebounders spike while preserving long-run stat identity', () => {
    const homeTeam = {
      teamId: 'VAR',
      players: [
        {
          player_id: 'elite-creator',
          full_name: 'Elite Creator',
          position: 'PG',
          minutes: 38,
          hidden: { shooting: 83, playmaking: 96, passing: 97, rebounding: 46, defense: 74, basketballIq: 94 },
          category_skill_grades: {
            playmaking: { rating: 96, grade: 'A+' },
            basketballIq: { rating: 94, grade: 'A' },
          },
          tendencies: {
            passFirst: 94,
            pickAndRollBallHandler: 96,
          },
          baselineRatingProfile: {
            source_stat_line: {
              assistsPerGame: 10.4,
              assistPct: 44,
              reboundsPerGame: 3.5,
            },
          },
        },
        {
          player_id: 'elite-glass',
          full_name: 'Elite Glass',
          position: 'C',
          minutes: 34,
          hidden: { shooting: 66, playmaking: 48, rebounding: 97, defense: 92, vertical: 86, strength: 94 },
          category_skill_grades: {
            rebounding: { rating: 97, grade: 'A+' },
            interiorDefense: { rating: 92, grade: 'A' },
          },
          tendencies: {
            reboundCrash: 98,
          },
          baselineRatingProfile: {
            source_stat_line: {
              assistsPerGame: 1.2,
              reboundsPerGame: 14.2,
            },
          },
        },
        { player_id: 'generic-guard', full_name: 'Generic Guard', position: 'PG', minutes: 30, hidden: { shooting: 76, playmaking: 72, passing: 72, rebounding: 45, defense: 70 } },
        { player_id: 'generic-big', full_name: 'Generic Big', position: 'C', minutes: 28, hidden: { shooting: 66, playmaking: 45, rebounding: 74, defense: 76 } },
        { player_id: 'wing', full_name: 'Wing', position: 'SF', minutes: 30, hidden: { shooting: 78, playmaking: 65, rebounding: 60, defense: 76 } },
        { player_id: 'forward', full_name: 'Forward', position: 'PF', minutes: 28, hidden: { shooting: 74, playmaking: 58, rebounding: 72, defense: 78 } },
        { player_id: 'reserve', full_name: 'Reserve', position: 'SG', minutes: 16, hidden: { shooting: 69, playmaking: 55, rebounding: 46, defense: 62 } },
      ],
    };
    const seeds = Array.from({ length: 90 }, (_, index) => `stat-variance-${index}`);
    const totals = new Map<string, { games: number; assists: number; rebounds: number; maxAssists: number; maxRebounds: number }>();

    seeds.forEach((seed) => {
      const timeline = buildPossessionTimeline({
        gameId: `live-${seed}`,
        seed,
        homeTeamId: 'VAR',
        awayTeamId: 'CPU',
        homeTeam,
        awayTeam: team('CPU', 75),
        nowMs: 10_000,
      });
      boxScoreFromPossessionTimeline(timeline).home.players.forEach((player: any) => {
        const row = totals.get(player.name) || { games: 0, assists: 0, rebounds: 0, maxAssists: 0, maxRebounds: 0 };
        row.games += 1;
        row.assists += Number(player.assists || 0);
        row.rebounds += Number(player.rebounds || 0);
        row.maxAssists = Math.max(row.maxAssists, Number(player.assists || 0));
        row.maxRebounds = Math.max(row.maxRebounds, Number(player.rebounds || 0));
        totals.set(player.name, row);
      });
    });

    const average = (name: string, key: 'assists' | 'rebounds') => {
      const row = totals.get(name);
      return Number(row && row.games ? row[key] / row.games : 0);
    };
    const max = (name: string, key: 'maxAssists' | 'maxRebounds') => Number(totals.get(name)?.[key] || 0);

    expect(max('Elite Creator', 'maxAssists')).toBeGreaterThanOrEqual(14);
    expect(max('Elite Glass', 'maxRebounds')).toBeGreaterThanOrEqual(18);
    expect(average('Elite Creator', 'assists')).toBeGreaterThan(average('Generic Guard', 'assists') + 3);
    expect(average('Elite Glass', 'rebounds')).toBeGreaterThan(average('Generic Big', 'rebounds') + 4);
    expect(average('Elite Creator', 'assists')).toBeLessThanOrEqual(13);
    expect(average('Elite Glass', 'rebounds')).toBeLessThanOrEqual(18);
  });
});
