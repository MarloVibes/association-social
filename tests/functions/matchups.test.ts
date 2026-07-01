import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  acceptMatchupRequest,
  applyCoachingGradeAdjustmentsForSimulation,
  applyCoachingToTeamForSimulation,
  canonicalizeTeamForSimulation,
  coachingGradeAdjustmentsForPlayer,
  createResetScheduledGameHandler,
  expireMatchupRequest,
  finalScoreGame,
  finalScoreGameResult,
  gameStoryFromResult,
  gameWithCoachingSnapshots,
  gamesForCompetition,
  requestMatchup,
  resetScheduledGame,
  scheduleAliases,
  scheduleCompetition,
  selectSimBatch,
  simulateScheduledGame,
  simulateScheduledGameResult,
  teamPersistencePayload,
  teamFromParticipantFallback,
  teamResetPayload,
  teamStateUpdatePayload,
  updatePayloadForCompetition,
} = require('../../functions/franchise/matchups.js');

function seedAvailableGame(overrides: Record<string, unknown> = {}) {
  return {
    id: 'game-1',
    status: 'scheduled',
    homeTeamId: 'home',
    awayTeamId: 'away',
    homeGmId: 'home-gm',
    awayGmId: 'away-gm',
    ...overrides,
  };
}

function seedRequestedGame(overrides: Record<string, unknown> = {}) {
  const game = seedAvailableGame({
    status: 'requested',
    requestedByUid: 'home-gm',
    requestedAtMs: 0,
    responseDeadlineMs: 3_600_000,
    ...overrides,
  });
  return { ...game, gameId: game.id };
}

function seedRoster(prefix: string, skill = 78) {
  return {
    players: Array.from({ length: 8 }, (_, index) => ({
      player_id: `${prefix}-${index}`,
      full_name: `${prefix} Player ${index + 1}`,
      position: index === 0 ? 'PG' : index === 4 ? 'C' : 'G',
      minutes: index < 5 ? 30 : 18,
      hidden: {
        shooting: skill,
        playmaking: skill - 2,
        defense: skill - 4,
        rebounding: index === 4 ? skill + 8 : skill - 8,
        basketballIq: skill,
      },
    })),
  };
}

describe('matchup request state helpers', () => {
  it('selects the next cancellable regular-season sim batch', () => {
    const batch = selectSimBatch({
      competition: 'regular',
      batchSize: 2,
      games: [
        seedAvailableGame({ id: 'g1', sequence: 3 }),
        seedAvailableGame({ id: 'g2', sequence: 1, status: 'final' }),
        seedAvailableGame({ id: 'g3', sequence: 2, status: 'preparing' }),
        seedAvailableGame({ id: 'g4', sequence: 4 }),
      ],
    });

    expect(batch.map((game: any) => game.id)).toEqual(['g3', 'g1']);
  });

  it('selects only the current unfinished playoff round when simming one round', () => {
    const batch = selectSimBatch({
      competition: 'playoffs',
      scope: 'round',
      batchSize: 10,
      games: [
        seedAvailableGame({ id: 'r1-g1', round: 'first_round', sequence: 1 }),
        seedAvailableGame({ id: 'r1-g2', round: 'first_round', sequence: 2, status: 'final' }),
        seedAvailableGame({ id: 'r2-g1', round: 'second_round', sequence: 100 }),
      ],
    });

    expect(batch.map((game: any) => game.id)).toEqual(['r1-g1']);
  });

  it('aliases era-suffixed schedule ids back to their team abbreviation', () => {
    expect(scheduleAliases('SAS_2011')).toEqual(['SAS_2011', 'SAS']);
    expect(scheduleAliases('NOH_2011')).toEqual(['NOH_2011', 'NOH', 'NOK', 'NOP']);
  });

  it('expires an unaccepted request after one hour', () => {
    const request = seedRequestedGame({ requestedAtMs: 0 });
    const result = expireMatchupRequest({ game: request, nowMs: 3_600_001 });

    expect(result.status).toBe('expired');
  });

  it('prevents duplicate active requests', () => {
    const game = seedAvailableGame();
    const requested = requestMatchup({ game, uid: game.homeGmId, nowMs: 1_000 });

    expect(() => requestMatchup({ game: requested, uid: game.awayGmId, nowMs: 2_000 })).toThrow(
      expect.objectContaining({ code: 'already-exists' }),
    );
  });

  it('starts five-minute preparation after acceptance', () => {
    const request = seedRequestedGame({ requestedAtMs: 1_000 });
    const result = acceptMatchupRequest({ game: request, uid: request.awayGmId, nowMs: 2_000 });

    expect(result).toMatchObject({ status: 'preparing', preparationDeadlineMs: 302_000 });
  });

  it('permits immediate simulation by either participating GM', () => {
    const game = seedAvailableGame();
    const result = simulateScheduledGame({
      game,
      uid: game.homeGmId,
      nowMs: 5_000,
      homeTeam: seedRoster('Home', 82),
      awayTeam: seedRoster('Away', 72),
    });

    expect(result).toMatchObject({
      status: 'final',
      simulationStartedByUid: game.homeGmId,
      finalAtMs: 5_000,
    });
    expect(result.homeScore).not.toBe(result.awayScore);
    expect([game.homeTeamId, game.awayTeamId]).toContain(result.winnerTeamId);
  });

  it('refuses to simulate when a team roster cannot be resolved', () => {
    const game = seedAvailableGame();

    expect(() => simulateScheduledGame({
      game,
      uid: game.homeGmId,
      nowMs: 5_000,
      homeTeam: {},
      awayTeam: seedRoster('Away', 72),
    })).toThrow(expect.objectContaining({
      code: 'failed-precondition',
      message: expect.stringContaining('roster'),
    }));
  });

  it('stores live mode replay metadata for simulated games', () => {
    const game = seedAvailableGame({
      homeTeamId: 'LAL',
      awayTeamId: 'BOS',
    });
    const result = simulateScheduledGame({
      game,
      uid: game.homeGmId,
      nowMs: 5_000,
      homeTeam: {
        players: Array.from({ length: 8 }, (_, index) => ({
          player_id: `home-${index}`,
          full_name: `Home ${index}`,
          hidden: { shooting: 92, playmaking: 88, defense: 84 },
        })),
      },
      awayTeam: {
        players: Array.from({ length: 8 }, (_, index) => ({
          player_id: `away-${index}`,
          full_name: `Away ${index}`,
          hidden: { shooting: 55, playmaking: 54, defense: 53 },
        })),
      },
    });

    expect(result.status).toBe('final');
    expect(result.liveTimeline).toMatchObject({
      version: 2,
      gameId: game.id,
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
    });
    expect(result.liveTimeline.periods).toEqual(
      result.quarters.map((quarter: { quarter: number; home: number; away: number }) => ({
        period: quarter.quarter,
        label: `Q${quarter.quarter}`,
        home: quarter.home,
        away: quarter.away,
      })),
    );
    expect(result.liveTimeline.starterMatchups).toHaveLength(5);
    expect(result.liveTimeline.events.length).toBeGreaterThan(0);
    expect(result.liveTimeline.events.some((event: { eventType: string }) => event.eventType === 'miss')).toBe(true);
    expect(result.liveTimeline.events.some((event: { eventType: string }) => event.eventType === 'free_throw_trip')).toBe(true);
    expect(result.liveTimeline.events.some((event: { statDeltas?: { stats?: { rebounds?: number } }[] }) => event.statDeltas?.some(delta => delta.stats?.rebounds === 1))).toBe(true);
    expect(result.liveTimeline.events.at(-1)).toMatchObject({
      eventType: 'final_buzzer',
      homeScore: result.homeScore,
      awayScore: result.awayScore,
    });
    expect(result.liveMode).toMatchObject({
      status: 'ready',
      simulationStartedAtMs: 5_000,
      simulationEndsAtMs: 5_000 + result.liveTimeline.revealDurationMs,
      arenaTheme: expect.objectContaining({
        homeAbbr: 'LAL',
        centerText: 'LAL',
      }),
    });
  });

  it('permits immediate CPU matchup simulation with live mode replay metadata', () => {
    const game = seedAvailableGame({
      awayGmId: null,
      awayTeamId: 'cpu-away',
    });
    const result = simulateScheduledGame({
      game,
      uid: game.homeGmId,
      nowMs: 5_000,
      homeTeam: seedRoster('Home', 82),
      awayTeam: seedRoster('CPU', 74),
    });

    expect(result.status).toBe('final');
    expect(result.quarters).toHaveLength(4);
    expect(result.liveTimeline).toMatchObject({
      version: 2,
      gameId: game.id,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
    });
    expect(result.liveTimeline.starterMatchups).toHaveLength(5);
    expect(result.liveTimeline.periods).toEqual(
      result.quarters.map((quarter: { quarter: number; home: number; away: number }) => ({
        period: quarter.quarter,
        label: `Q${quarter.quarter}`,
        home: quarter.home,
        away: quarter.away,
      })),
    );
    expect(result.liveMode).toMatchObject({
      status: 'ready',
      simulationStartedAtMs: 5_000,
      simulationEndsAtMs: 5_000 + result.liveTimeline.revealDurationMs,
      arenaTheme: expect.objectContaining({ centerText: expect.any(String) }),
    });
  });

  it('does not invent fallback CPU box score players when era pool data is missing', () => {
    const game = seedAvailableGame({
      homeTeamId: 'SAS_2011',
      awayTeamId: 'CHI',
      awayGmId: null,
    });

    expect(() => simulateScheduledGame({
      game,
      uid: game.homeGmId,
      nowMs: 5_000,
      homeTeam: {},
      awayTeam: seedRoster('Chicago', 77),
    })).toThrow(expect.objectContaining({ code: 'failed-precondition' }));
  });

  it('sanitizes stale big-man shooting values before simulation without hurting real stretch profiles', () => {
    const team = canonicalizeTeamForSimulation({
      players: [
        {
          player_id: 'stale-center',
          full_name: 'Defensive Center',
          position: 'C',
          hidden: { shooting: 99, threePoint: 99, defense: 92, rebounding: 94 },
        },
        {
          player_id: 'stretch-big',
          full_name: 'Stretch Big',
          position: 'C',
          hidden: { shooting: 70, threePoint: 70 },
          attribute_model: { shooting: 84, threePoint: 88 },
        },
      ],
    });

    expect(team.players[0].hidden.threePoint).toBeLessThanOrEqual(49);
    expect(team.players[0].hidden.shooting).toBeLessThanOrEqual(65);
    expect(team.players[1].hidden.threePoint).toBe(88);
    expect(team.players[1].hidden.shooting).toBe(84);
  });

  it('does not treat stale big-man category grades as shooting proof by themselves', () => {
    const team = canonicalizeTeamForSimulation({
      players: [
        {
          player_id: 'stale-category-center',
          full_name: 'Stale Category Center',
          position: 'C',
          hidden: { shooting: 99, threePoint: 99, defense: 92, rebounding: 94 },
          category_skill_grades: {
            threePoint: { rating: 99, grade: 'S' },
          },
          tendencies: {
            threePointFrequency: 99,
            catchAndShootFrequency: 99,
          },
        },
      ],
    });

    expect(team.players[0].hidden.threePoint).toBeLessThanOrEqual(49);
    expect(team.players[0].hidden.shooting).toBeLessThanOrEqual(65);
    expect(team.players[0].tendencies.threePointFrequency).toBeLessThanOrEqual(35);
    expect(team.players[0].tendencies.catchAndShootFrequency).toBeLessThanOrEqual(35);
  });

  it('lets baseline category grades override stale saved categories before live simulation', () => {
    const team = canonicalizeTeamForSimulation({
      players: [
        {
          player_id: 'baseline-center',
          full_name: 'Baseline Center',
          position: 'C',
          hidden: { shooting: 99, threePoint: 99, defense: 92, rebounding: 94 },
          category_skill_grades: {
            threePoint: { rating: 99, grade: 'S' },
            finishing: { rating: 99, grade: 'S' },
          },
          baselineRatingProfile: {
            attribute_model: { shooting: 48, threePoint: 38, closeShot: 82, dunking: 74 },
            category_skill_grades: {
              threePoint: { rating: 42, grade: 'F' },
              finishing: { rating: 78, grade: 'B' },
            },
          },
        },
      ],
    });

    expect(team.players[0].hidden.threePoint).toBe(38);
    expect(team.players[0].hidden.shooting).toBe(48);
    expect(team.players[0].category_skill_grades.threePoint).toEqual({ rating: 42, grade: 'F' });
    expect(team.players[0].category_skill_grades.finishing).toEqual({ rating: 78, grade: 'B' });
  });

  it('repairs recognizable old roster snapshots with the canonical baseline before simulation', () => {
    const team = canonicalizeTeamForSimulation({
      players: [
        {
          player_id: 'old-lebron',
          full_name: 'LeBron James',
          team: 'MIA',
          position: 'SF',
          hidden: {
            shooting: 58,
            closeShot: 58,
            dunking: 58,
            playmaking: 58,
            defense: 58,
          },
        },
      ],
    });

    expect(team.players[0].baselineRatingProfile).toMatchObject({
      full_name: 'LeBron James',
      season: 2011,
      team: 'MIA',
    });
    expect(team.players[0].hidden.closeShot).toBeGreaterThanOrEqual(89);
    expect(team.players[0].hidden.dunking).toBeGreaterThanOrEqual(89);
    expect(team.players[0].category_skill_grades.finishing.rating).toBeGreaterThanOrEqual(89);
  });

  it('respects explicit profile seasons when repairing function-side roster snapshots', () => {
    const team = canonicalizeTeamForSimulation({
      players: [
        {
          player_id: 'explicit-lebron',
          full_name: 'LeBron James',
          team: 'MIA',
          season: 2011,
          hidden: { closeShot: 55 },
        },
      ],
    });

    expect(team.players[0].baselineRatingProfile?.season).toBe(2011);
    expect(team.players[0].baselineRatingProfile?.team).toBe('MIA');
  });

  it('keeps stale center shooting from leaking into scheduled game box scores', () => {
    const game = seedAvailableGame({ homeTeamId: 'AUDIT', awayTeamId: 'CPU' });
    const result = simulateScheduledGame({
      game,
      uid: game.homeGmId,
      nowMs: 5_000,
      homeTeam: {
        players: [
          {
            player_id: 'stale-center',
            full_name: 'Stale Center',
            position: 'C',
            minutes: 32,
            hidden: { shooting: 99, threePoint: 99, shotIq: 99, defense: 92, rebounding: 94 },
            category_skill_grades: {
              threePoint: { rating: 99, grade: 'S' },
              finishing: { rating: 92, grade: 'A' },
            },
            baselineRatingProfile: {
              attribute_model: { shooting: 48, threePoint: 38, shotIq: 62, closeShot: 82, dunking: 74 },
              source_stat_line: { threePointAttemptsPerGame: 0.1 },
              category_skill_grades: {
                threePoint: { rating: 42, grade: 'F' },
                finishing: { rating: 78, grade: 'B' },
              },
            },
          },
          {
            player_id: 'real-shooter',
            full_name: 'Real Shooter',
            position: 'SG',
            minutes: 30,
            hidden: { shooting: 82, threePoint: 86, shotIq: 84, playmaking: 68, defense: 66 },
            category_skill_grades: {
              threePoint: { rating: 86, grade: 'B+' },
            },
            tendencies: {
              threePointFrequency: 88,
            },
          },
          { player_id: 'audit-pg', full_name: 'Audit PG', position: 'PG', minutes: 32, hidden: { shooting: 76, playmaking: 84, defense: 72 } },
          { player_id: 'audit-pf', full_name: 'Audit PF', position: 'PF', minutes: 30, hidden: { shooting: 72, playmaking: 60, defense: 78, rebounding: 82 } },
          { player_id: 'audit-sf', full_name: 'Audit SF', position: 'SF', minutes: 28, hidden: { shooting: 70, playmaking: 58, defense: 76 } },
        ],
      },
      awayTeam: {
        players: Array.from({ length: 5 }, (_, index) => ({
          player_id: `plain-${index}`,
          full_name: `Plain ${index}`,
          minutes: 30,
          hidden: { shooting: 70, playmaking: 68, defense: 68 },
        })),
      },
    });

    const lines = new Map<string, any>(result.boxScore.home.players.map((player: any) => [player.name, player]));
    expect(lines.get('Stale Center').threePointersAttempted).toBeLessThan(lines.get('Real Shooter').threePointersAttempted);
    expect(lines.get('Stale Center').threePointersAttempted).toBeLessThanOrEqual(1);
    expect(lines.get('Stale Center').threePointersMade).toBe(0);
  });

  it('uses source efficiency signals in live matchup box score distribution', () => {
    const game = seedAvailableGame({ homeTeamId: 'EFF', awayTeamId: 'CPU' });
    const result = simulateScheduledGame({
      game,
      uid: game.homeGmId,
      nowMs: 5_000,
      homeTeam: {
        players: [
          {
            player_id: 'efficient-primary',
            full_name: 'Efficient Primary',
            position: 'SF',
            minutes: 38,
            hidden: { shooting: 88, playmaking: 82, defense: 76, shotIq: 84, freeThrow: 84 },
            baselineRatingProfile: {
              source_stat_line: {
                trueShootingPct: 0.635,
                effectiveFieldGoalPct: 0.585,
                turnoverPct: 9.5,
                freeThrowAttemptsPerGame: 7.2,
              },
            },
          },
          {
            player_id: 'inefficient-primary',
            full_name: 'Inefficient Primary',
            position: 'SF',
            minutes: 38,
            hidden: { shooting: 88, playmaking: 82, defense: 76, shotIq: 84, freeThrow: 84 },
            baselineRatingProfile: {
              source_stat_line: {
                trueShootingPct: 0.505,
                effectiveFieldGoalPct: 0.455,
                turnoverPct: 15.8,
                freeThrowAttemptsPerGame: 3.1,
              },
            },
          },
          { player_id: 'eff-pg', full_name: 'Efficiency PG', position: 'PG', minutes: 34, hidden: { shooting: 76, playmaking: 84, defense: 72 } },
          { player_id: 'eff-pf', full_name: 'Efficiency PF', position: 'PF', minutes: 30, hidden: { shooting: 72, playmaking: 60, defense: 78, rebounding: 82 } },
          { player_id: 'eff-c', full_name: 'Efficiency C', position: 'C', minutes: 28, hidden: { shooting: 68, playmaking: 54, defense: 82, rebounding: 88 } },
        ],
      },
      awayTeam: {
        players: Array.from({ length: 5 }, (_, index) => ({
          player_id: `plain-eff-${index}`,
          full_name: `Plain Efficiency ${index}`,
          minutes: 30,
          hidden: { shooting: 70, playmaking: 68, defense: 68 },
        })),
      },
    });

    const lines = new Map<string, any>(result.boxScore.home.players.map((player: any) => [player.name, player]));
    const efficient = lines.get('Efficient Primary');
    const inefficient = lines.get('Inefficient Primary');
    const efficientTrueAttempts = efficient.fieldGoalsAttempted + 0.44 * efficient.freeThrowsAttempted;
    const inefficientTrueAttempts = inefficient.fieldGoalsAttempted + 0.44 * inefficient.freeThrowsAttempted;

    expect(efficient.points).toBeGreaterThanOrEqual(inefficient.points);
    expect(efficient.points / efficientTrueAttempts).toBeGreaterThan(inefficient.points / inefficientTrueAttempts);
    expect(efficient.turnovers).toBeLessThanOrEqual(inefficient.turnovers);
  });

  it('uses source production signals in scheduled game box score distribution', () => {
    const game = seedAvailableGame({ homeTeamId: 'ROLE', awayTeamId: 'CPU' });
    const result = simulateScheduledGame({
      game,
      uid: game.homeGmId,
      nowMs: 5_000,
      homeTeam: {
        players: [
          {
            player_id: 'primary-creator',
            full_name: 'Primary Creator',
            position: 'PG',
            minutes: 32,
            hidden: { shooting: 72, playmaking: 82, rebounding: 55, defense: 72 },
            baselineRatingProfile: {
              source_stat_line: {
                pointsPerGame: 25,
                assistsPerGame: 8.2,
                reboundsPerGame: 4.1,
                usagePct: 32,
                assistPct: 40,
              },
            },
          },
          {
            player_id: 'secondary-creator',
            full_name: 'Secondary Creator',
            position: 'SG',
            minutes: 38,
            hidden: { shooting: 91, playmaking: 88, rebounding: 55, defense: 72 },
            baselineRatingProfile: {
              source_stat_line: {
                pointsPerGame: 12,
                assistsPerGame: 3,
                reboundsPerGame: 3.8,
                usagePct: 18,
                assistPct: 16,
              },
            },
          },
          {
            player_id: 'glass-center',
            full_name: 'Glass Center',
            position: 'C',
            minutes: 32,
            hidden: { shooting: 70, playmaking: 54, rebounding: 86, defense: 82 },
            baselineRatingProfile: {
              source_stat_line: {
                pointsPerGame: 8,
                assistsPerGame: 1.2,
                reboundsPerGame: 12.4,
              },
            },
          },
          { player_id: 'role-pf', full_name: 'Role PF', position: 'PF', minutes: 30, hidden: { shooting: 72, playmaking: 60, rebounding: 78, defense: 78 } },
          { player_id: 'role-sf', full_name: 'Role SF', position: 'SF', minutes: 28, hidden: { shooting: 72, playmaking: 62, rebounding: 62, defense: 78 } },
        ],
      },
      awayTeam: {
        players: Array.from({ length: 5 }, (_, index) => ({
          player_id: `plain-role-${index}`,
          full_name: `Plain Role ${index}`,
          minutes: 30,
          hidden: { shooting: 70, playmaking: 68, defense: 68 },
        })),
      },
    });

    const lines = new Map<string, any>(result.boxScore.home.players.map((player: any) => [player.name, player]));
    expect(lines.get('Primary Creator').points).toBeGreaterThanOrEqual(lines.get('Secondary Creator').points);
    expect(lines.get('Primary Creator').assists).toBeGreaterThan(lines.get('Secondary Creator').assists);
    expect(lines.get('Glass Center').rebounds).toBeGreaterThan(lines.get('Primary Creator').rebounds);
  });

  it('uses roster hidden values and stores a box score for simulated games', () => {
    const game = seedAvailableGame();
    const result = simulateScheduledGame({
      game,
      uid: game.homeGmId,
      nowMs: 5_000,
      homeTeam: {
        players: Array.from({ length: 8 }, (_, index) => ({
          player_id: `home-${index}`,
          full_name: `Home ${index}`,
          hidden: { shooting: 92, playmaking: 88, defense: 84 },
        })),
      },
      awayTeam: {
        players: Array.from({ length: 8 }, (_, index) => ({
          player_id: `away-${index}`,
          full_name: `Away ${index}`,
          hidden: { shooting: 55, playmaking: 54, defense: 53 },
        })),
      },
    });

    expect(result.winnerTeamId).toBe(game.homeTeamId);
    expect(result.boxScore.home.players).toHaveLength(8);
    expect(result.boxScore.home.points).toBe(result.homeScore);
    expect(result.boxScore.away.points).toBe(result.awayScore);
    expect(result.boxScore.home.players[0]).toMatchObject({
      fieldGoalsMade: expect.any(Number),
      fieldGoalsAttempted: expect.any(Number),
      threePointersMade: expect.any(Number),
      threePointersAttempted: expect.any(Number),
      freeThrowsMade: expect.any(Number),
      freeThrowsAttempted: expect.any(Number),
      offensiveRebounds: expect.any(Number),
      defensiveRebounds: expect.any(Number),
      fouls: expect.any(Number),
      plusMinus: expect.any(Number),
      starter: true,
    });
    expect(result.quarters).toHaveLength(4);
    expect(result.story).not.toContain('_2011');
  });

  it('writes a richer postgame story from box score hooks', () => {
    const story = gameStoryFromResult({
      homeTeamId: 'MIA',
      awayTeamId: 'CHI',
      homeScore: 104,
      awayScore: 102,
      winnerTeamId: 'MIA',
      quarters: [
        { quarter: 1, home: 24, away: 31 },
        { quarter: 2, home: 25, away: 22 },
        { quarter: 3, home: 29, away: 24 },
        { quarter: 4, home: 26, away: 25 },
      ],
      boxScore: {
        home: {
          players: [
            { name: 'LeBron James', starter: true, points: 38, rebounds: 12, assists: 9, steals: 2, blocks: 1, turnovers: 3 },
            { name: 'Mario Chalmers', starter: true, points: 8, rebounds: 2, assists: 7, steals: 1, blocks: 0, turnovers: 1 },
            { name: 'Shane Battier', starter: false, points: 17, rebounds: 4, assists: 2, steals: 1, blocks: 0, turnovers: 0 },
          ],
        },
        away: {
          players: [
            { name: 'Derrick Rose', starter: true, points: 34, rebounds: 4, assists: 8, steals: 1, blocks: 0, turnovers: 3 },
            { name: 'Luol Deng', starter: true, points: 18, rebounds: 6, assists: 3, steals: 1, blocks: 1, turnovers: 1 },
          ],
        },
      },
    });

    expect(story).toContain('survived a one-possession finish');
    expect(story).toContain('LeBron James powered the win');
    expect(story).toContain('double-double');
    expect(story).toContain('Shane Battier gave MIA a bench spark');
    expect(story).toContain('Derrick Rose answered');
    expect(story).toContain('third quarter');
  });

  it('uses grade-based player profiles without inflating assists and rebounds', () => {
    const game = seedAvailableGame({
      homeTeamId: 'SAS_2011',
      awayTeamId: 'CHI',
      awayGmId: null,
    });
    const result = simulateScheduledGame({
      game,
      uid: game.homeGmId,
      nowMs: 5_000,
      homeTeam: {
        players: [
          { player_id: 'duncan', full_name: 'Tim Duncan', position: 'PF', minutes: 34, hidden: { shooting: 84, playmaking: 62, rebounding: 94, defense: 96, basketballIq: 95 } },
          { player_id: 'parker', full_name: 'Tony Parker', position: 'PG', minutes: 34, hidden: { shooting: 88, playmaking: 91, rebounding: 45, defense: 72, basketballIq: 88 } },
          { player_id: 'ginobili', full_name: 'Manu Ginobili', position: 'SG', minutes: 30, hidden: { shooting: 89, playmaking: 86, rebounding: 58, defense: 78, basketballIq: 90 } },
          { player_id: 'leonard', full_name: 'Kawhi Leonard', position: 'SF', minutes: 24, hidden: { shooting: 74, playmaking: 58, rebounding: 73, defense: 90, basketballIq: 78 } },
          { player_id: 'splitter', full_name: 'Tiago Splitter', position: 'C', minutes: 24, hidden: { shooting: 66, playmaking: 45, rebounding: 82, defense: 80, basketballIq: 72 } },
          { player_id: 'green', full_name: 'Danny Green', position: 'SG', minutes: 22, hidden: { shooting: 80, playmaking: 52, rebounding: 55, defense: 82, basketballIq: 76 } },
          { player_id: 'neal', full_name: 'Gary Neal', position: 'G', minutes: 18, hidden: { shooting: 78, playmaking: 50, rebounding: 42, defense: 55, basketballIq: 68 } },
          { player_id: 'diaw', full_name: 'Boris Diaw', position: 'F', minutes: 20, hidden: { shooting: 72, playmaking: 78, rebounding: 66, defense: 70, basketballIq: 88 } },
        ],
      },
      awayTeam: {
        players: [
          { player_id: 'rose', full_name: 'Derrick Rose', position: 'PG', minutes: 38, hidden: { shooting: 92, playmaking: 92, rebounding: 52, defense: 70, basketballIq: 88 } },
          { player_id: 'boozer', full_name: 'Carlos Boozer', position: 'PF', minutes: 32, hidden: { shooting: 80, playmaking: 50, rebounding: 88, defense: 62, basketballIq: 75 } },
          { player_id: 'deng', full_name: 'Luol Deng', position: 'SF', minutes: 36, hidden: { shooting: 78, playmaking: 60, rebounding: 74, defense: 84, basketballIq: 80 } },
          { player_id: 'noah', full_name: 'Joakim Noah', position: 'C', minutes: 30, hidden: { shooting: 62, playmaking: 70, rebounding: 90, defense: 90, basketballIq: 82 } },
          { player_id: 'korver', full_name: 'Kyle Korver', position: 'SG', minutes: 22, hidden: { shooting: 89, playmaking: 48, rebounding: 42, defense: 55, basketballIq: 76 } },
          { player_id: 'asik', full_name: 'Omer Asik', position: 'C', minutes: 14, hidden: { shooting: 45, playmaking: 34, rebounding: 84, defense: 82, basketballIq: 62 } },
          { player_id: 'watson', full_name: 'C.J. Watson', position: 'PG', minutes: 18, hidden: { shooting: 72, playmaking: 72, rebounding: 40, defense: 58, basketballIq: 72 } },
          { player_id: 'brewer', full_name: 'Ronnie Brewer', position: 'SG', minutes: 18, hidden: { shooting: 65, playmaking: 48, rebounding: 55, defense: 80, basketballIq: 70 } },
        ],
      },
    });

    expect(result.boxScore.home.rebounds).toBeLessThanOrEqual(58);
    expect(result.boxScore.away.rebounds).toBeLessThanOrEqual(58);
    expect(result.boxScore.home.assists).toBeLessThanOrEqual(34);
    expect(result.boxScore.away.assists).toBeLessThanOrEqual(34);

    const homeLines = new Map<string, any>(result.boxScore.home.players.map((player: any) => [player.name, player]));
    const awayLines = new Map<string, any>(result.boxScore.away.players.map((player: any) => [player.name, player]));
    expect(homeLines.get('Tim Duncan').rebounds).toBeGreaterThan(homeLines.get('Tony Parker').rebounds);
    expect(homeLines.get('Tony Parker').assists).toBeGreaterThan(homeLines.get('Tim Duncan').assists);
    expect(awayLines.get('Derrick Rose').rebounds).toBeLessThanOrEqual(8);
    expect(awayLines.get('Omer Asik').assists).toBeLessThanOrEqual(2);
  });

  it('keeps possession sim star scoring explosive without breaking rotation balance', () => {
    const player = (full_name: string, team: string, position: string, minutes: number, player_id: string) => ({
      player_id,
      full_name,
      team,
      position,
      minutes,
      season: 2011,
    });
    const homeTeam = {
      players: [
        player('LeBron James', 'MIA', 'SF', 39, 'lebron'),
        player('Dwyane Wade', 'MIA', 'SG', 37, 'wade'),
        player('Chris Bosh', 'MIA', 'PF', 36, 'bosh'),
        player('Mario Chalmers', 'MIA', 'PG', 29, 'chalmers'),
        player('Joel Anthony', 'MIA', 'C', 22, 'anthony'),
        player('Mike Miller', 'MIA', 'SF', 22, 'miller'),
        player('Udonis Haslem', 'MIA', 'PF', 23, 'haslem'),
        player('James Jones', 'MIA', 'SG', 16, 'jones'),
      ],
    };
    const awayTeam = {
      players: [
        player('Derrick Rose', 'CHI', 'PG', 38, 'rose'),
        player('Luol Deng', 'CHI', 'SF', 39, 'deng'),
        player('Carlos Boozer', 'CHI', 'PF', 32, 'boozer'),
        player('Joakim Noah', 'CHI', 'C', 32, 'noah'),
        player('Keith Bogans', 'CHI', 'SG', 18, 'bogans'),
        player('Kyle Korver', 'CHI', 'SG', 20, 'korver'),
        player('Taj Gibson', 'CHI', 'PF', 21, 'gibson'),
        player('Omer Asik', 'CHI', 'C', 14, 'asik'),
      ],
    };

    let unsupportedBigThreeAttempts = 0;
    let boshThreeAttempts = 0;
    [1, 2, 3, 4, 5].forEach((seed) => {
      const game = seedAvailableGame({ homeTeamId: 'MIA', awayTeamId: 'CHI', awayGmId: null });
      game.id = `sample-${seed}`;
      const result = simulateScheduledGame({
        game,
        uid: game.homeGmId,
        nowMs: 10_000 + seed,
        homeTeam,
        awayTeam,
      });
      const allPlayers = [...result.boxScore.home.players, ...result.boxScore.away.players];
      const maxScorer = Math.max(...allPlayers.map((boxPlayer: any) => boxPlayer.points));
      const doubleDigitScorers = allPlayers.filter((boxPlayer: any) => boxPlayer.points >= 10).length;
      unsupportedBigThreeAttempts += allPlayers
        .filter((boxPlayer: any) => ['Omer Asik', 'Joel Anthony', 'Taj Gibson'].includes(boxPlayer.name))
        .reduce((total: number, boxPlayer: any) => total + Number(boxPlayer.threePointersAttempted || 0), 0);
      boshThreeAttempts += Number(allPlayers.find((boxPlayer: any) => boxPlayer.name === 'Chris Bosh')?.threePointersAttempted || 0);

      expect(maxScorer).toBeLessThanOrEqual(58);
      expect(doubleDigitScorers).toBeGreaterThanOrEqual(4);
    });
    expect(unsupportedBigThreeAttempts).toBe(0);
    expect(boshThreeAttempts).toBeGreaterThan(0);
  });

  it('uses detailed player grades for server-side shot profiles', () => {
    const game = seedAvailableGame({ homeTeamId: 'SKILL', awayTeamId: 'CPU' });
    const result = simulateScheduledGame({
      game,
      uid: game.homeGmId,
      nowMs: 5_000,
      homeTeam: {
        players: [
          { player_id: 'shooter', full_name: 'Pure Shooter', position: 'SG', minutes: 38, hidden: { shooting: 82, playmaking: 70, defense: 72, threePoint: 97, midRange: 84, closeShot: 62, dunking: 42, shotIq: 91 } },
          { player_id: 'driver', full_name: 'Paint Driver', position: 'SF', minutes: 38, hidden: { shooting: 82, playmaking: 70, defense: 72, threePoint: 55, midRange: 72, closeShot: 94, dunking: 92, postOffense: 82, shotIq: 80 } },
          { player_id: 'guard', full_name: 'Table Guard', position: 'PG', minutes: 32, hidden: { shooting: 74, playmaking: 88, passing: 91, basketballIq: 86, defense: 70 } },
          { player_id: 'big', full_name: 'Glass Big', position: 'C', minutes: 30, hidden: { shooting: 62, rebounding: 94, defense: 86, postDefense: 88, blocking: 90 } },
          { player_id: 'wing', full_name: 'Wing Stopper', position: 'SF', minutes: 28, hidden: { shooting: 70, playmaking: 62, defense: 90, perimeterDefense: 94, defenseIq: 92 } },
        ],
      },
      awayTeam: {
        players: Array.from({ length: 5 }, (_, index) => ({
          player_id: `plain-${index}`,
          full_name: `Plain ${index}`,
          minutes: 30,
          hidden: { shooting: 70, playmaking: 68, defense: 68 },
        })),
      },
    });

    const lines = new Map<string, any>(result.boxScore.home.players.map((player: any) => [player.name, player]));
    expect(lines.get('Pure Shooter').threePointersAttempted).toBeGreaterThan(lines.get('Paint Driver').threePointersAttempted);
    expect(lines.get('Paint Driver').freeThrowsAttempted).toBeGreaterThanOrEqual(lines.get('Pure Shooter').freeThrowsAttempted);
  });

  it('fills vacant era schedule teams from the era player pool before using placeholders', () => {
    const team = teamFromParticipantFallback({
      teamId: 'SAS_2011',
      participant: {
        scheduleTeamId: 'SAS_2011',
        abbreviation: 'SAS_2011',
        name: 'San Antonio Spurs',
      },
      poolPlayers: [
        { player_id: 'duncan', full_name: 'Tim Duncan', team: 'SAS', hidden: { rebounding: 94 } },
        { player_id: 'parker', full_name: 'Tony Parker', team: 'SAS', hidden: { playmaking: 91 } },
        { player_id: 'rose', full_name: 'Derrick Rose', team: 'CHI', hidden: { shooting: 92 } },
      ],
    });

    expect(team).toMatchObject({
      teamId: 'SAS_2011',
      abbreviation: 'SAS_2011',
      name: 'San Antonio Spurs',
    });
    expect(team.players.map((player: any) => player.full_name)).toEqual(['Tim Duncan', 'Tony Parker']);
  });

  it('returns persistent team condition after simulated games', () => {
    const game = seedAvailableGame();
    const result = simulateScheduledGameResult({
      game,
      uid: game.homeGmId,
      nowMs: 5_000,
      homeTeam: {
        fatigue: 3,
        fatigueSequence: 4,
        minorInjuryCount: 1,
        severeInjuryCount: 0,
        injuries: [{ id: 'old-home-injury', gamesRemaining: 1 }],
        players: Array.from({ length: 8 }, (_, index) => ({
          player_id: `home-${index}`,
          hidden: { shooting: 92, playmaking: 88, defense: 84 },
        })),
      },
      awayTeam: {
        fatigue: 7,
        fatigueSequence: 2,
        players: Array.from({ length: 8 }, (_, index) => ({
          player_id: `away-${index}`,
          hidden: { shooting: 55, playmaking: 54, defense: 53 },
        })),
      },
    });

    expect(result.game.status).toBe('final');
    expect(result.teamStates.home.fatigueSequence).toBe(5);
    expect(result.teamStates.away.fatigueSequence).toBe(3);
    expect(teamStateUpdatePayload(result.teamStates.home)).toMatchObject({
      fatigueSequence: 5,
      minorInjuryCount: 1,
      severeInjuryCount: 0,
    });
    expect(teamStateUpdatePayload(result.teamStates.home).injuries).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'old-home-injury' })]),
    );
  });

  it('resets matchup workflow fields while keeping teams and GM ownership', () => {
    const game = seedAvailableGame({
      status: 'simulating',
      requestedByUid: 'home-gm',
      requestedAtMs: 1_000,
      responseDeadlineMs: 2_000,
      acceptedByUid: 'away-gm',
      acceptedAtMs: 3_000,
      preparationDeadlineMs: 4_000,
      expiredAtMs: 5_000,
      simulationStartedByUid: 'home-gm',
      simulationStartedAtMs: 6_000,
      homeScore: 100,
      awayScore: 98,
      winnerTeamId: 'home',
      loserTeamId: 'away',
      finalScoreSubmittedByUid: 'home-gm',
      finalAtMs: 6_000,
      boxScore: { home: { players: [] }, away: { players: [] } },
      quarters: [{ quarter: 1, home: 25, away: 20 }],
      liveTimeline: { version: 1, events: [] },
      liveMode: { status: 'ready' },
      story: 'Old result',
    });

    const result = resetScheduledGame({ game, uid: 'commissioner', nowMs: 7_000 });

    expect(result).toMatchObject({
      id: game.id,
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      homeGmId: game.homeGmId,
      awayGmId: game.awayGmId,
      status: 'scheduled',
      resetByUid: 'commissioner',
      resetAtMs: 7_000,
    });
    expect(result.requestedByUid).toBeUndefined();
    expect(result.preparationDeadlineMs).toBeUndefined();
    expect(result.simulationStartedAtMs).toBeUndefined();
    expect(result.homeScore).toBeUndefined();
    expect(result.finalAtMs).toBeUndefined();
    expect(result.boxScore).toBeUndefined();
    expect(result.quarters).toBeUndefined();
    expect(result.liveTimeline).toBeUndefined();
    expect(result.liveMode).toBeUndefined();
    expect(result.story).toBeUndefined();
  });

  it('submits a played final score without allowing ties', () => {
    const game = seedAvailableGame();
    const result = finalScoreGame({
      game,
      uid: game.homeGmId,
      nowMs: 9_000,
      homeScore: 104,
      awayScore: 101,
    });

    expect(result).toMatchObject({
      status: 'final',
      homeScore: 104,
      awayScore: 101,
      winnerTeamId: 'home',
      finalScoreSubmittedByUid: game.homeGmId,
    });
    expect(() => finalScoreGame({ game, uid: game.homeGmId, nowMs: 9_000, homeScore: 100, awayScore: 100 })).toThrow(
      expect.objectContaining({ code: 'invalid-argument' }),
    );
  });

  it('returns persistent team condition after reported final scores', () => {
    const game = seedAvailableGame();
    const result = finalScoreGameResult({
      game,
      uid: game.homeGmId,
      nowMs: 9_000,
      homeScore: 104,
      awayScore: 101,
      homeTeam: { fatigue: 4, fatigueSequence: 9, injuries: [] },
      awayTeam: { fatigue: 5, fatigueSequence: 11, injuries: [] },
    });

    expect(result.game).toMatchObject({
      status: 'final',
      winnerTeamId: 'home',
      resultSource: 'manual',
    });
    expect(teamStateUpdatePayload(result.teamStates.home)).toMatchObject({ fatigueSequence: 10 });
    expect(teamStateUpdatePayload(result.teamStates.away)).toMatchObject({ fatigueSequence: 12 });
  });

  it('generates a simulated box score when a GM reports only the winner outcome', () => {
    const game = seedAvailableGame();
    const result = finalScoreGameResult({
      game,
      uid: game.homeGmId,
      nowMs: 9_000,
      winnerTeamId: game.awayTeamId,
      homeTeam: seedRoster('Home', 76),
      awayTeam: seedRoster('Away', 84),
    });

    expect(result.game).toMatchObject({
      status: 'final',
      winnerTeamId: game.awayTeamId,
      resultSource: 'manual_winner',
      finalScoreSubmittedByUid: game.homeGmId,
    });
    expect(result.game.awayScore).toBeGreaterThan(result.game.homeScore);
    expect(result.game.boxScore.away.points).toBe(result.game.awayScore);
    expect(result.game.boxScore.home.points).toBe(result.game.homeScore);
    expect(result.game.liveTimeline.events.length).toBeGreaterThan(0);
  });

  it('adds simulated box score production to roster season stats', () => {
    const payload = teamPersistencePayload({
      state: {
        fatigue: 2,
        fatigueSequence: 4,
        minorInjuryCount: 0,
        severeInjuryCount: 0,
        injuries: [],
      },
      team: {
        players: [
          {
            player_id: 'p1',
            full_name: 'Starter One',
            seasonStats: { games: 1, minutes: 30, points: 12, rebounds: 4, assists: 3 },
          },
          {
            player_id: 'p2',
            full_name: 'Starter Two',
            seasonStats: { games: 0 },
          },
        ],
      },
      teamBoxScore: {
        players: [
          { playerId: 'p1', minutes: 34, points: 22, rebounds: 8, assists: 5, steals: 2, blocks: 1, turnovers: 3 },
          { playerId: 'p2', minutes: 20, points: 9, rebounds: 3, assists: 2, steals: 1, blocks: 0, turnovers: 1 },
        ],
      },
    });

    expect(payload.players[0].seasonStats).toMatchObject({
      games: 2,
      minutes: 64,
      points: 34,
      rebounds: 12,
      assists: 8,
      steals: 2,
      blocks: 1,
      turnovers: 3,
    });
    expect(payload.players[1].seasonStats).toMatchObject({
      games: 1,
      points: 9,
    });
  });

  it('records coaching snapshots as postgame scouting history', () => {
    const game = seedAvailableGame();
    const result = gameWithCoachingSnapshots({
      game,
      homeSnapshot: { name: 'Pace and Space', offense: 'pace_and_space', defense: 'switch_heavy', presetId: 'pace_and_space' },
      homeSecondHalfSnapshot: { name: 'Lob City', offense: 'pick_and_roll', defense: 'drop', presetId: 'lob_city' },
      awaySnapshot: { name: 'Grit and Grind', offense: 'post_heavy', defense: 'protect_paint', presetId: 'grit_and_grind' },
      awaySecondHalfSnapshot: { name: 'Zone Trap', offense: 'balanced', defense: 'zone', presetId: 'zone_trap' },
    });

    expect(result).toMatchObject({
      homeCoachingStyle: 'pace_and_space',
      awayCoachingStyle: 'post_heavy',
      homeDefensiveStyle: 'switch_heavy',
      awayDefensiveStyle: 'protect_paint',
      homeCoachingPresetName: 'Pace and Space',
      awayCoachingPresetName: 'Grit and Grind',
      homeFirstHalfCoachingPresetId: 'pace_and_space',
      homeSecondHalfCoachingPresetId: 'lob_city',
      awayFirstHalfCoachingPresetId: 'grit_and_grind',
      awaySecondHalfCoachingPresetId: 'zone_trap',
    });
  });

  it('tracks first-half and second-half coaching impact for simulated games', () => {
    const game = gameWithCoachingSnapshots({
      game: seedAvailableGame(),
      homeSnapshot: { name: 'Lob City', offense: 'pick_and_roll', defense: 'drop', presetId: 'lob_city' },
      homeSecondHalfSnapshot: { name: 'Grit and Grind', offense: 'post_heavy', defense: 'protect_paint', presetId: 'grit_and_grind' },
      awaySnapshot: { name: 'Pace and Space', offense: 'pace_and_space', defense: 'switch_heavy', presetId: 'pace_and_space' },
      awaySecondHalfSnapshot: { name: 'Twin Towers', offense: 'post_heavy', defense: 'protect_paint', presetId: 'twin_towers' },
    });

    const result = simulateScheduledGame({
      game,
      uid: game.homeGmId,
      nowMs: 5_000,
      homeTeam: seedRoster('Home', 82),
      awayTeam: seedRoster('Away', 72),
    });

    expect(result.coachingImpact).toMatchObject({
      homeFirstHalfPresetId: 'lob_city',
      homeSecondHalfPresetId: 'grit_and_grind',
      awayFirstHalfPresetId: 'pace_and_space',
      awaySecondHalfPresetId: 'twin_towers',
    });
  });

  it('applies coaching fit boosts to simulated player grades only', () => {
    const blakeLikeFinisher = {
      player_id: 'blake-like',
      full_name: 'Explosive Finisher',
      position: 'PF',
      hidden: {
        dunking: 93,
        athleticism: 91,
        closeShot: 87,
        shooting: 78,
      },
    };

    const adjustments = coachingGradeAdjustmentsForPlayer('lob_city', blakeLikeFinisher);
    const coached = applyCoachingGradeAdjustmentsForSimulation(blakeLikeFinisher, 'lob_city');

    expect(adjustments).toMatchObject({
      dunking: 2,
      athleticism: 2,
      closeShot: 1,
    });
    expect(coached.hidden).toMatchObject({
      dunking: 95,
      athleticism: 93,
      closeShot: 88,
    });
    expect(blakeLikeFinisher.hidden.dunking).toBe(93);
  });

  it('applies selected coaching presets to the roster used by simulation', () => {
    const roster = {
      players: [
        {
          player_id: 'athletic-finisher',
          full_name: 'Athletic Finisher',
          position: 'PF',
          hidden: {
            dunking: 92,
            athleticism: 90,
            closeShot: 84,
            shooting: 76,
          },
        },
      ],
    };

    const coached = applyCoachingToTeamForSimulation(roster, ['lob_city', 'lob_city']);

    expect(coached.players[0].hidden).toMatchObject({
      dunking: 94,
      athleticism: 92,
      closeShot: 85,
      shooting: 77,
    });
    expect(roster.players[0].hidden).toMatchObject({
      dunking: 92,
      athleticism: 90,
      closeShot: 84,
      shooting: 76,
    });
  });

  it('builds rollback payloads when commissioners reset finalized games', () => {
    const game = seedAvailableGame({
      status: 'final',
      fatigue: { home: { before: 3, after: 7, sequence: 6 } },
      injuries: { home: [{ id: 'injury-game-1', severity: 'minor' }] },
      boxScore: {
        home: {
          players: [
            { playerId: 'p1', minutes: 34, points: 22, rebounds: 8, assists: 5, steals: 2, blocks: 1, turnovers: 3, plusMinus: 5 },
          ],
        },
      },
    });

    const payload = teamResetPayload({
      game,
      side: 'home',
      team: {
        fatigue: 7,
        fatigueSequence: 6,
        minorInjuryCount: 2,
        severeInjuryCount: 0,
        injuries: [
          { id: 'injury-game-1', severity: 'minor' },
          { id: 'old-injury', severity: 'minor' },
        ],
        players: [
          {
            player_id: 'p1',
            seasonStats: { games: 2, minutes: 64, points: 34, rebounds: 12, assists: 8, steals: 2, blocks: 1, turnovers: 3, plusMinus: -3 },
          },
        ],
      },
    });

    expect(payload).toMatchObject({
      fatigue: 3,
      fatigueSequence: 5,
      minorInjuryCount: 1,
      severeInjuryCount: 0,
    });
    expect(payload.injuries).toEqual([{ id: 'old-injury', severity: 'minor' }]);
    expect(payload.players[0].seasonStats).toMatchObject({
      games: 1,
      minutes: 30,
      points: 12,
      rebounds: 4,
      assists: 3,
      steals: 0,
      blocks: 0,
      turnovers: 0,
      plusMinus: -8,
    });
  });

  it('rolls team player stats back when the reset callable clears a final game', async () => {
    const finalGame = seedAvailableGame({
      status: 'final',
      homeScore: 100,
      awayScore: 91,
      winnerTeamId: 'home',
      fatigue: {
        home: { before: 2, after: 5, sequence: 3 },
        away: { before: 1, after: 4, sequence: 2 },
      },
      boxScore: {
        home: { players: [{ playerId: 'home-1', minutes: 34, points: 20, rebounds: 5, assists: 4, steals: 1, blocks: 0, turnovers: 2 }] },
        away: { players: [{ playerId: 'away-1', minutes: 31, points: 15, rebounds: 6, assists: 2, steals: 0, blocks: 1, turnovers: 3 }] },
      },
    });
    const schedule = { games: [finalGame] };
    const leagueRef = { collection: vi.fn() };
    const scheduleRef = {};
    const homeRef = {};
    const awayRef = {};
    const tx = {
      get: vi.fn(async ref => {
        if (ref === leagueRef) return { exists: true, data: () => ({ commissionerId: 'commissioner', scheduleId: '2026' }) };
        if (ref === scheduleRef) return { exists: true, data: () => schedule };
        if (ref === homeRef) return {
          exists: true,
          id: 'home',
          data: () => ({
            players: [{ player_id: 'home-1', seasonStats: { games: 2, minutes: 50, points: 30, rebounds: 8, assists: 5, steals: 1, turnovers: 2 } }],
            fatigue: 5,
            fatigueSequence: 3,
          }),
        };
        if (ref === awayRef) return {
          exists: true,
          id: 'away',
          data: () => ({
            players: [{ player_id: 'away-1', seasonStats: { games: 2, minutes: 45, points: 25, rebounds: 9, assists: 4, blocks: 1, turnovers: 3 } }],
            fatigue: 4,
            fatigueSequence: 2,
          }),
        };
        return { exists: false, data: () => ({}) };
      }),
      update: vi.fn(),
    };
    leagueRef.collection = vi.fn((name: string) => {
      if (name === 'schedules') return { doc: vi.fn(() => scheduleRef) };
      if (name === 'teams') return { doc: vi.fn((id: string) => (id === 'home' ? homeRef : awayRef)) };
      return { doc: vi.fn() };
    });
    const db = {
      collection: vi.fn(() => ({ doc: vi.fn(() => leagueRef) })),
      runTransaction: vi.fn(async callback => callback(tx)),
    };
    class TestHttpsError extends Error {
      code: string;

      constructor(code: string, message: string) {
        super(message);
        this.code = code;
      }
    }
    const handler = createResetScheduledGameHandler({
      getFirestore: () => db,
      now: () => 7_000,
      HttpsError: TestHttpsError,
    });

    const result = await handler({
      auth: { uid: 'commissioner' },
      data: { leagueId: 'league-1', gameId: finalGame.id },
    });

    expect(result).toMatchObject({ status: 'scheduled', resetByUid: 'commissioner' });
    expect(tx.update).toHaveBeenCalledWith(scheduleRef, { games: [expect.objectContaining({ status: 'scheduled' })] });
    expect(tx.update).toHaveBeenCalledWith(homeRef, expect.objectContaining({
      fatigue: 2,
      players: [expect.objectContaining({ seasonStats: expect.objectContaining({ games: 1, points: 10 }) })],
    }));
    expect(tx.update).toHaveBeenCalledWith(awayRef, expect.objectContaining({
      fatigue: 1,
      players: [expect.objectContaining({ seasonStats: expect.objectContaining({ games: 1, points: 10 }) })],
    }));
  });

  it('rolls stats back for claimed teams when older schedules are missing participant doc ids', async () => {
    const finalGame = seedAvailableGame({
      status: 'final',
      homeScore: 101,
      awayScore: 99,
      winnerTeamId: 'SAS_2011',
      homeTeamId: 'SAS_2011',
      awayTeamId: 'CHI',
      homeGmId: 'gm-sas',
      awayGmId: 'gm-chi',
      fatigue: {
        home: { before: 2, after: 5, sequence: 3 },
        away: { before: 1, after: 4, sequence: 2 },
      },
      boxScore: {
        home: { players: [{ playerId: 'sas-rose', minutes: 34, points: 24, rebounds: 4, assists: 7 }] },
        away: { players: [{ playerId: 'chi-deng', minutes: 35, points: 18, rebounds: 6, assists: 3 }] },
      },
    });
    const schedule = { games: [finalGame] };
    const leagueRef = { collection: vi.fn() };
    const scheduleRef = {};
    const directMissingRef = {};
    const homeRef = {};
    const awayRef = {};
    const homeQuery = {};
    const awayQuery = {};
    const teamsCollection = {
      doc: vi.fn(() => directMissingRef),
      where: vi.fn((field: string, op: string, value: string) => (value === 'gm-sas' ? homeQuery : awayQuery)),
    };
    const tx = {
      get: vi.fn(async ref => {
        if (ref === leagueRef) return { exists: true, data: () => ({ commissionerId: 'commissioner', scheduleId: '2011' }) };
        if (ref === scheduleRef) return { exists: true, data: () => schedule };
        if (ref === directMissingRef) return { exists: false, data: () => ({}) };
        if (ref === homeQuery) return {
          empty: false,
          docs: [{
            id: 'league_gm_sas',
            ref: homeRef,
            data: () => ({
              teamId: 'SAS_2011',
              abbreviation: 'SAS',
              gmId: 'gm-sas',
              players: [{ player_id: 'sas-rose', seasonStats: { games: 2, minutes: 70, points: 44, rebounds: 10, assists: 12 } }],
              fatigue: 5,
              fatigueSequence: 3,
            }),
          }],
        };
        if (ref === awayQuery) return {
          empty: false,
          docs: [{
            id: 'league_gm_chi',
            ref: awayRef,
            data: () => ({
              teamId: 'CHI',
              abbreviation: 'CHI',
              gmId: 'gm-chi',
              players: [{ player_id: 'chi-deng', seasonStats: { games: 2, minutes: 73, points: 33, rebounds: 11, assists: 5 } }],
              fatigue: 4,
              fatigueSequence: 2,
            }),
          }],
        };
        return { exists: false, data: () => ({}) };
      }),
      update: vi.fn(),
    };
    leagueRef.collection = vi.fn((name: string) => {
      if (name === 'schedules') return { doc: vi.fn(() => scheduleRef) };
      if (name === 'teams') return teamsCollection;
      return { doc: vi.fn() };
    });
    const db = {
      collection: vi.fn(() => ({ doc: vi.fn(() => leagueRef) })),
      runTransaction: vi.fn(async callback => callback(tx)),
    };
    class TestHttpsError extends Error {
      code: string;

      constructor(code: string, message: string) {
        super(message);
        this.code = code;
      }
    }
    const handler = createResetScheduledGameHandler({
      getFirestore: () => db,
      now: () => 7_000,
      HttpsError: TestHttpsError,
    });

    await handler({
      auth: { uid: 'commissioner' },
      data: { leagueId: 'league-1', gameId: finalGame.id },
    });

    expect(teamsCollection.where).toHaveBeenCalledWith('gmId', '==', 'gm-sas');
    expect(tx.update).toHaveBeenCalledWith(homeRef, expect.objectContaining({
      fatigue: 2,
      players: [expect.objectContaining({ seasonStats: expect.objectContaining({ games: 1, points: 20, assists: 5 }) })],
    }));
    expect(tx.update).toHaveBeenCalledWith(awayRef, expect.objectContaining({
      fatigue: 1,
      players: [expect.objectContaining({ seasonStats: expect.objectContaining({ games: 1, points: 15, rebounds: 5 }) })],
    }));
  });

  it('selects and updates NBA Cup games separately from regular season games', () => {
    const regularGame = seedAvailableGame({ id: 'regular-1' });
    const cupGame = seedAvailableGame({ id: 'cup-1', competition: 'nbaCup', groupId: 'Group A' });
    const schedule = {
      games: [regularGame],
      nbaCup: { games: [cupGame] },
    };

    expect(scheduleCompetition({ competition: 'nbaCup' })).toBe('nbaCup');
    expect(scheduleCompetition({ competition: 'regular' })).toBe('regular');
    expect(gamesForCompetition(schedule, 'nbaCup')).toEqual([cupGame]);
    expect(gamesForCompetition(schedule, 'regular')).toEqual([regularGame]);
    expect(updatePayloadForCompetition('nbaCup', [cupGame])).toEqual({ 'nbaCup.games': [cupGame] });
    expect(updatePayloadForCompetition('regular', [regularGame])).toEqual({ games: [regularGame] });
  });

  it('selects and updates playoff games inside the playoff bracket', () => {
    const playoffGame = seedAvailableGame({ id: 'po-1' });
    const finalGame = { ...playoffGame, status: 'final', winnerTeamId: playoffGame.homeTeamId };
    const schedule = {
      games: [],
      playoffs: {
        rounds: [{
          series: [{
            id: 'series-1',
            homeTeamId: playoffGame.homeTeamId,
            awayTeamId: playoffGame.awayTeamId,
            games: [playoffGame, seedAvailableGame({ id: 'po-2' })],
          }],
        }],
      },
    };

    expect(gamesForCompetition(schedule, 'playoffs')).toHaveLength(2);
    expect(updatePayloadForCompetition('playoffs', [finalGame], schedule).playoffs.rounds[0].series[0].games[0]).toMatchObject({
      id: 'po-1',
      status: 'final',
      winnerTeamId: playoffGame.homeTeamId,
    });
  });

  it('advances playoff rounds when every series has four completed wins', () => {
    const seriesAHomeGames = Array.from({ length: 4 }, (_, index) => seedAvailableGame({
      id: `po-a-${index + 1}`,
      homeTeamId: 'team-1',
      awayTeamId: 'team-8',
      homeGmId: 'gm-1',
      awayGmId: 'gm-8',
      status: 'final',
      winnerTeamId: 'team-1',
    }));
    const seriesBHomeGames = Array.from({ length: 4 }, (_, index) => seedAvailableGame({
      id: `po-b-${index + 1}`,
      homeTeamId: 'team-4',
      awayTeamId: 'team-5',
      homeGmId: 'gm-4',
      awayGmId: 'gm-5',
      status: 'final',
      winnerTeamId: 'team-4',
    }));
    const schedule = {
      playoffs: {
        format: 'short_8',
        seasonYear: 2026,
        seed: 'league-2026',
        rounds: [{
          name: 'quarterfinal',
          label: 'Quarterfinals',
          roundIndex: 0,
          series: [
            {
              id: 'quarterfinal_1',
              round: 'quarterfinal',
              roundIndex: 0,
              seriesIndex: 0,
              homeSeed: 1,
              awaySeed: 8,
              homeTeamId: 'team-1',
              awayTeamId: 'team-8',
              homeTeamName: 'Team 1',
              awayTeamName: 'Team 8',
              games: seriesAHomeGames,
            },
            {
              id: 'quarterfinal_2',
              round: 'quarterfinal',
              roundIndex: 0,
              seriesIndex: 1,
              homeSeed: 4,
              awaySeed: 5,
              homeTeamId: 'team-4',
              awayTeamId: 'team-5',
              homeTeamName: 'Team 4',
              awayTeamName: 'Team 5',
              games: seriesBHomeGames,
            },
          ],
        }],
      },
    };

    const playoffs = updatePayloadForCompetition('playoffs', [...seriesAHomeGames, ...seriesBHomeGames], schedule).playoffs;

    expect(playoffs.rounds[0].series[0].winnerTeamId).toBe('team-1');
    expect(playoffs.rounds[0].series[1].winnerTeamId).toBe('team-4');
    expect(playoffs.rounds[1]).toMatchObject({
      name: 'semifinal',
      roundIndex: 1,
    });
    expect(playoffs.rounds[1].series[0]).toMatchObject({
      homeTeamId: 'team-1',
      awayTeamId: 'team-4',
    });
    expect(playoffs.rounds[1].series[0].games).toHaveLength(7);
    expect(playoffs.rounds[1].series[0].games[0]).toMatchObject({
      homeGmId: 'gm-1',
      awayGmId: 'gm-4',
      status: 'scheduled',
    });
  });
});
