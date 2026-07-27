import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  acceptMatchupRequest,
  applyCoachingGradeAdjustmentsForSimulation,
  applyCoachingToTeamForSimulation,
  assertCompleteResultPackage,
  canonicalizeTeamForSimulation,
  cleanFirestoreData,
  coachingGradeAdjustmentsForPlayer,
  createGetGameResultDetailsHandler,
  createResetScheduledGameHandler,
  createSimScheduleBatchHandler,
  canUserSimulateVsCpu,
  createSimulateScheduledGameHandler,
  expireMatchupRequest,
  finalScoreGame,
  finalScoreGameResult,
  gameStoryFromResult,
  gameWithCoachingSnapshots,
  gamesForCompetition,
  postgameStoryFromResult,
  liveGameReadyNotifications,
  writeLiveGameReadyNotifications,
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
const { simulateSportGame } = require('../../functions/franchise/sportSimulation.js');

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

function seedNflRoster(prefix: string, skill = 78) {
  const players = [
    { position: 'QB', passing_yards: 4200, passing_tds: 31 },
    { position: 'HB', rushing_yards: 1120, receiving_yards: 280 },
    { position: 'WR', receiving_yards: 1320 },
    { position: 'WR', receiving_yards: 870 },
    { position: 'TE', receiving_yards: 640 },
    { position: 'LT' },
    { position: 'LG' },
    { position: 'C' },
    { position: 'RG' },
    { position: 'RT' },
    { position: 'EDGE', sacks: 13 },
    { position: 'DT', sacks: 5 },
    { position: 'LB', sacks: 4 },
    { position: 'CB' },
    { position: 'S' },
  ];
  return {
    players: players.map((player, index) => ({
      player_id: `${prefix}-nfl-${index}`,
      full_name: `${prefix} NFL ${index + 1}`,
      hidden: { footballIq: skill, defense: skill - 2, speed: skill - 4 },
      ...player,
    })),
  };
}

function seedMlbRoster(prefix: string, skill = 78) {
  const players = [
    { position: 'SP', era: '3.12', so: 189 },
    { position: 'RP', era: '3.46', so: 64 },
    { position: 'CP', era: '2.31', saves: 34, so: 78 },
    { position: 'C', hr: 18, avg: '.251' },
    { position: '1B', hr: 32, avg: '.274' },
    { position: '2B', hr: 13, avg: '.268', sb: 18 },
    { position: '3B', hr: 25, avg: '.263' },
    { position: 'SS', hr: 21, avg: '.279', sb: 24 },
    { position: 'LF', hr: 20, avg: '.260' },
    { position: 'CF', hr: 16, avg: '.271', sb: 31 },
    { position: 'RF', hr: 27, avg: '.266' },
  ];
  return {
    players: players.map((player, index) => ({
      player_id: `${prefix}-mlb-${index}`,
      full_name: `${prefix} MLB ${index + 1}`,
      hidden: { baseballIq: skill, power: skill - 1, contact: skill - 3, fielding: skill - 4 },
      ...player,
    })),
  };
}

function undefinedPaths(value: unknown, path = 'value'): string[] {
  if (value === undefined) return [path];
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => undefinedPaths(item, `${path}[${index}]`));
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => undefinedPaths(item, `${path}.${key}`));
}

function directNestedArrayPaths(value: unknown, path = 'value'): string[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => {
      const itemPath = `${path}[${index}]`;
      return [
        ...(Array.isArray(item) ? [itemPath] : []),
        ...directNestedArrayPaths(item, itemPath),
      ];
    });
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => directNestedArrayPaths(item, `${path}.${key}`));
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

  it('caps oversized season sim batches to a safe fast-forward batch in week sequence order', () => {
    const batch = selectSimBatch({
      competition: 'regular',
      batchSize: 35,
      games: Array.from({ length: 20 }, (_, index) => seedAvailableGame({
        id: `g${index + 1}`,
        sequence: index + 1,
      })),
    });

    expect(batch.map((game: any) => game.id)).toEqual([
      'g1',
      'g2',
      'g3',
      'g4',
      'g5',
      'g6',
      'g7',
      'g8',
      'g9',
      'g10',
      'g11',
      'g12',
      'g13',
      'g14',
      'g15',
    ]);
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
    expect(scheduleAliases('MEM_CURRENT')).toEqual(['MEM_CURRENT', 'MEM', 'VAN']);
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
    const game = seedAvailableGame({
      homeCoachingPresetId: 'five_out',
      awayCoachingPresetId: 'zone_23',
    });
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
    expect(result.coachingImpact.gameplan.homePresetId).toBe('five_out');
    expect(result.coachingImpact.gameplan.homeSummary).toContain('corners');
  });

  it('simulates NFL franchise games with football scoring and football box scores', () => {
    const game = seedAvailableGame({
      sport: 'madden',
      homeTeamId: 'KC',
      awayTeamId: 'LV',
    });
    const result = simulateScheduledGame({
      game,
      uid: game.homeGmId,
      nowMs: 12_000,
      homeTeam: seedNflRoster('Home', 86),
      awayTeam: seedNflRoster('Away', 74),
    });

    expect(result.status).toBe('final');
    expect(result.sport).toBe('madden');
    expect(result.homeScore).toBeGreaterThanOrEqual(6);
    expect(result.homeScore).toBeLessThanOrEqual(49);
    expect(result.awayScore).toBeGreaterThanOrEqual(6);
    expect(result.awayScore).toBeLessThanOrEqual(49);
    expect(result.quarters).toHaveLength(4);
    expect(result.liveTimeline).toMatchObject({ sport: 'madden', version: 3 });
    expect(result.liveTimeline.periods.map((period: { label: string }) => period.label)).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
    expect(result.liveMode).toMatchObject({
      status: 'ready',
      simulationStartedAtMs: 12_000,
      simulationEndsAtMs: 12_000 + result.liveTimeline.revealDurationMs,
    });
    expect(result.boxScore.home.players.some((player: any) => player.passingYards > 0 || player.rushingYards > 0 || player.receivingYards > 0)).toBe(true);
    expect(result.boxScore.home.players.some((player: any) => player.points || player.rebounds || player.assists)).toBe(false);
    expect(result.story).toMatch(/KC|LV/);
    expect(result.postgameStory).toMatchObject({
      headline: expect.stringContaining(result.winnerTeamId),
      summary: expect.stringContaining('beat'),
      turningPoint: expect.any(String),
      topPerformers: expect.any(Array),
    });
  });

  it('uses sport ratings as simulation inputs for NFL and MLB prospects', () => {
    const footballGame = seedAvailableGame({ sport: 'madden', homeTeamId: 'KC', awayTeamId: 'LV' });
    const footballHigh = {
      players: ['QB', 'HB', 'WR', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT', 'EDGE', 'DT', 'LB', 'CB', 'S'].map((position, index) => ({
        player_id: `high-football-${index}`,
        full_name: `High Football ${index}`,
        position,
        ratings: { awareness: 94, speed: 92, strength: 90, technique: 91 },
      })),
    };
    const footballLow = {
      players: ['QB', 'HB', 'WR', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT', 'EDGE', 'DT', 'LB', 'CB', 'S'].map((position, index) => ({
        player_id: `low-football-${index}`,
        full_name: `Low Football ${index}`,
        position,
        ratings: { awareness: 48, speed: 47, strength: 49, technique: 46 },
      })),
    };
    const football = simulateSportGame({
      sport: 'madden',
      game: footballGame,
      homeTeam: footballHigh,
      awayTeam: footballLow,
      seed: 'ratings-football',
    });
    const footballLowHome = simulateSportGame({
      sport: 'madden',
      game: footballGame,
      homeTeam: footballLow,
      awayTeam: footballHigh,
      seed: 'ratings-football',
    });

    const baseballGame = seedAvailableGame({ sport: 'mlb', homeTeamId: 'LAD', awayTeamId: 'SF' });
    const baseballHigh = {
      players: ['SP', 'RP', 'CP', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'].map((position, index) => ({
        player_id: `high-baseball-${index}`,
        full_name: `High Baseball ${index}`,
        position,
        ratings: { contact: 92, power: 91, command: 90 },
      })),
    };
    const baseballLow = {
      players: ['SP', 'RP', 'CP', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'].map((position, index) => ({
        player_id: `low-baseball-${index}`,
        full_name: `Low Baseball ${index}`,
        position,
        ratings: { contact: 45, power: 44, command: 46 },
      })),
    };
    const baseball = simulateSportGame({
      sport: 'mlb',
      game: baseballGame,
      homeTeam: baseballHigh,
      awayTeam: baseballLow,
      seed: 'ratings-baseball',
    });
    const baseballLowHome = simulateSportGame({
      sport: 'mlb',
      game: baseballGame,
      homeTeam: baseballLow,
      awayTeam: baseballHigh,
      seed: 'ratings-baseball',
    });

    expect(football.homeScore).toBeGreaterThan(footballLowHome.homeScore);
    expect(baseball.homeScore).toBeGreaterThanOrEqual(baseballLowHome.homeScore);
  });

  it('lets NFL and MLB game prep influence sport simulations', () => {
    const nflGame = seedAvailableGame({
      sport: 'madden',
      homeTeamId: 'KC',
      awayTeamId: 'LV',
      homeFirstHalfCoachingPresetId: 'air_raid',
      homeSecondHalfCoachingPresetId: 'air_raid',
      awayFirstHalfCoachingPresetId: 'balanced',
      awaySecondHalfCoachingPresetId: 'balanced',
    });
    const neutralNflGame = {
      ...nflGame,
      homeFirstHalfCoachingPresetId: 'balanced',
      homeSecondHalfCoachingPresetId: 'balanced',
    };
    const nflArgs = {
      uid: nflGame.homeGmId,
      nowMs: 12_100,
      homeTeam: seedNflRoster('Home', 80),
      awayTeam: seedNflRoster('Away', 80),
    };

    expect(simulateScheduledGame({ game: nflGame, ...nflArgs }).homeScore)
      .toBeGreaterThan(simulateScheduledGame({ game: neutralNflGame, ...nflArgs }).homeScore);

    const mlbGame = seedAvailableGame({
      sport: 'mlb',
      homeTeamId: 'LAD',
      awayTeamId: 'SF',
      homeFirstHalfCoachingPresetId: 'power_lineup',
      homeSecondHalfCoachingPresetId: 'bullpen_aggressive',
      awayFirstHalfCoachingPresetId: 'balanced',
      awaySecondHalfCoachingPresetId: 'balanced',
    });
    const neutralMlbGame = {
      ...mlbGame,
      homeFirstHalfCoachingPresetId: 'balanced',
      homeSecondHalfCoachingPresetId: 'balanced',
    };
    const mlbArgs = {
      uid: mlbGame.homeGmId,
      nowMs: 12_200,
      homeTeam: seedMlbRoster('Home', 78),
      awayTeam: seedMlbRoster('Away', 78),
    };

    expect(simulateScheduledGame({ game: mlbGame, ...mlbArgs }).homeScore)
      .toBeGreaterThan(simulateScheduledGame({ game: neutralMlbGame, ...mlbArgs }).homeScore);
  });

  it('simulates MLB franchise games with inning scoring and baseball box scores', () => {
    const game = seedAvailableGame({
      sport: 'mlb',
      homeTeamId: 'LAD',
      awayTeamId: 'SF',
    });
    const result = simulateScheduledGame({
      game,
      uid: game.homeGmId,
      nowMs: 13_000,
      homeTeam: seedMlbRoster('Home', 84),
      awayTeam: seedMlbRoster('Away', 76),
    });

    expect(result.status).toBe('final');
    expect(result.sport).toBe('mlb');
    expect(result.homeScore).toBeGreaterThanOrEqual(0);
    expect(result.homeScore).toBeLessThanOrEqual(14);
    expect(result.awayScore).toBeGreaterThanOrEqual(0);
    expect(result.awayScore).toBeLessThanOrEqual(14);
    expect(result.innings).toHaveLength(9);
    expect(result.liveTimeline).toMatchObject({ sport: 'mlb', version: 3 });
    expect(result.liveTimeline.periods.map((period: { label: string }) => period.label)).toEqual(['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th']);
    expect(result.liveMode).toMatchObject({
      status: 'ready',
      simulationStartedAtMs: 13_000,
      simulationEndsAtMs: 13_000 + result.liveTimeline.revealDurationMs,
    });
    expect(result.boxScore.home.players.some((player: any) => player.hits > 0 || player.homeRuns > 0 || player.rbi > 0)).toBe(true);
    expect(result.boxScore.home.players.some((player: any) => player.inningsPitched > 0 || player.strikeouts > 0)).toBe(true);
    expect(result.boxScore.home.players.some((player: any) => player.points || player.rebounds || player.assists)).toBe(false);
    expect(result.story).toMatch(/LAD|SF/);
    expect(result.postgameStory).toMatchObject({
      headline: expect.stringContaining(result.winnerTeamId),
      summary: expect.stringContaining('beat'),
      turningPoint: expect.any(String),
      topPerformers: expect.any(Array),
    });
  });

  it('lets commissioners control whether GMs can sim against vacant CPU teams', () => {
    const cpuGame = seedAvailableGame({ awayGmId: null });

    expect(canUserSimulateVsCpu({
      game: cpuGame,
      uid: 'home-gm',
      league: { commissionerId: 'comm', allowCpuGameSimulation: false },
    })).toEqual({ allowed: false, reason: 'cpu_sim_disabled' });
    expect(canUserSimulateVsCpu({
      game: cpuGame,
      uid: 'home-gm',
      league: { commissionerId: 'comm', allowCpuGameSimulation: true },
    })).toEqual({ allowed: true });
    expect(canUserSimulateVsCpu({
      game: cpuGame,
      uid: 'comm',
      league: { commissionerId: 'comm', allowCpuGameSimulation: false },
    })).toEqual({ allowed: true });
    expect(canUserSimulateVsCpu({
      game: cpuGame,
      uid: 'outsider',
      league: { commissionerId: 'comm', allowCpuGameSimulation: true },
    })).toEqual({ allowed: false, reason: 'not_participant' });
  });

  it('uses a CPU fallback when a team roster cannot be resolved', () => {
    const game = seedAvailableGame();

    const result = simulateScheduledGame({
      game,
      uid: game.homeGmId,
      nowMs: 5_000,
      homeTeam: {},
      awayTeam: seedRoster('Away', 72),
    });

    expect(result.status).toBe('final');
    expect(result.boxScore.home.players).toHaveLength(8);
    expect(result.boxScore.away.players).toHaveLength(8);
    expect(result.boxScore.home.players[0].name).toContain('CPU');
    expect(result.boxScore.home.points).toBe(result.homeScore);
    expect(result.boxScore.away.points).toBe(result.awayScore);
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
    expect(result.postgameStory).toMatchObject({
      headline: expect.any(String),
      summary: expect.stringContaining('points'),
      turningPoint: expect.any(String),
      topPerformers: expect.any(Array),
    });
  });

  it('rejects completed NBA result packages that do not include both player box scores', () => {
    expect(() => assertCompleteResultPackage({
      id: 'broken-final',
      status: 'final',
      sport: 'nba',
      homeTeamId: 'HOME',
      awayTeamId: 'AWAY',
      homeScore: 100,
      awayScore: 91,
    })).toThrow(expect.objectContaining({
      code: 'internal',
      message: expect.stringContaining('missing player box scores'),
    }));

    expect(() => assertCompleteResultPackage({
      id: 'complete-final',
      status: 'final',
      sport: 'nba',
      homeTeamId: 'HOME',
      awayTeamId: 'AWAY',
      homeScore: 100,
      awayScore: 91,
      boxScore: {
        home: { players: [{ name: 'Home Player', points: 20 }] },
        away: { players: [{ name: 'Away Player', points: 18 }] },
      },
    })).not.toThrow();
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

  it('generates fallback CPU box score players when roster data is missing', () => {
    const game = seedAvailableGame({
      homeTeamId: 'SAS_2011',
      awayTeamId: 'CHI',
      awayGmId: null,
    });

    const result = simulateScheduledGame({
      game,
      uid: game.homeGmId,
      nowMs: 5_000,
      homeTeam: {},
      awayTeam: undefined,
    });

    expect(result.status).toBe('final');
    expect(result.boxScore.home.players).toHaveLength(8);
    expect(result.boxScore.away.players).toHaveLength(8);
    expect(result.boxScore.home.points).toBe(result.homeScore);
    expect(result.boxScore.away.points).toBe(result.awayScore);
    expect(result.boxScore.home.players[0].name).toContain('SAS');
    expect(result.boxScore.away.players[0].name).toContain('CHI');
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

  it('builds a structured postgame recap for result screens and history', () => {
    const recap = postgameStoryFromResult({
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
            { name: 'Shane Battier', starter: false, points: 17, rebounds: 4, assists: 2, steals: 1, blocks: 0, turnovers: 0 },
          ],
        },
        away: {
          players: [
            { name: 'Derrick Rose', starter: true, points: 34, rebounds: 4, assists: 8, steals: 1, blocks: 0, turnovers: 3 },
          ],
        },
      },
      coachingImpact: {
        homeFirstHalfPresetId: 'pace_and_space',
        homeSecondHalfPresetId: 'grit_and_grind',
      },
    });

    expect(recap).toMatchObject({
      headline: 'MIA 104, CHI 102',
      summary: expect.stringContaining('LeBron James powered the win'),
      turningPoint: expect.stringContaining('third quarter'),
      coachingImpact: expect.stringContaining('5-Out'),
    });
    expect(recap.coachingImpact).not.toContain('pace_and_space');
    expect(recap.topPerformers).toEqual(['LeBron James', 'Derrick Rose', 'Shane Battier']);
  });

  it('builds spoiler-safe live game ready notifications for both GMs', () => {
    const notifications = liveGameReadyNotifications({
      leagueId: 'league-1',
      leagueName: 'Launch League',
      competition: 'regular',
      game: {
        id: 'game-live',
        sport: 'nba',
        homeTeamId: 'LAL',
        awayTeamId: 'BOS',
        homeGmId: 'home-gm',
        awayGmId: 'away-gm',
        liveTimeline: { version: 2 },
      },
      createdAt: '2026-07-02T19:00:00.000Z',
    });

    expect(notifications).toEqual([
      {
        uid: 'home-gm',
        notification: expect.objectContaining({
          id: 'game-ready:league-1:game-live:home-gm',
          type: 'game_ready',
          leagueId: 'league-1',
          gameId: 'game-live',
          competition: 'regular',
          liveTimeline: true,
          message: 'Launch League is live. Watch the game unfold now.',
        }),
      },
      {
        uid: 'away-gm',
        notification: expect.objectContaining({
          id: 'game-ready:league-1:game-live:away-gm',
          type: 'game_ready',
          liveTimeline: true,
        }),
      },
    ]);
    expect(JSON.stringify(notifications)).not.toContain('homeScore');
    expect(JSON.stringify(notifications)).not.toContain('awayScore');
  });

  it('writes live game ready notifications through the provided FieldValue dependency', () => {
    const writes: any[] = [];
    const userCollection = {
      doc: vi.fn((uid: string) => ({ uid })),
    };
    const db = {
      collection: vi.fn((name: string) => (name === 'users' ? userCollection : { doc: vi.fn() })),
    };
    const FieldValue = {
      arrayUnion: vi.fn((notification: any) => ({ arrayUnion: notification })),
    };
    const tx = {
      set: vi.fn((ref: any, payload: any, options: any) => writes.push({ ref, payload, options })),
    };

    writeLiveGameReadyNotifications({
      tx,
      db,
      FieldValue,
      leagueId: 'league-1',
      leagueName: 'Launch League',
      competition: 'regular',
      game: {
        id: 'game-live',
        sport: 'nba',
        homeGmId: 'home-gm',
        awayGmId: 'away-gm',
        liveTimeline: { version: 2 },
      },
      createdAt: '2026-07-02T19:00:00.000Z',
    });

    expect(tx.set).toHaveBeenCalledTimes(2);
    expect(writes[0]).toMatchObject({
      ref: { uid: 'home-gm' },
      payload: {
        notifications: {
          arrayUnion: expect.objectContaining({
            type: 'game_ready',
            liveTimeline: true,
          }),
        },
      },
      options: { merge: true },
    });
  });

  it('keeps full live timelines out of schedule update payloads', () => {
    const heavyEvents = Array.from({ length: 120 }, (_, index) => ({
      id: `event-${index}`,
      elapsedMs: index * 1000,
      period: 1,
      periodLabel: 'Q1',
      clockSeconds: 720 - index,
      homeScore: index,
      awayScore: index - 1,
      eventType: 'score',
      actingTeamId: 'home',
      text: `Detailed visual play event ${index} with shot context, stats, lineups, motion cues, and matchup notes.`,
      x: 50,
      y: 50,
      momentum: 1,
      tags: ['live', 'visual'],
      statDeltas: [{
        playerId: `player-${index}`,
        playerName: `Player ${index}`,
        teamId: 'home',
        stats: { points: 2 },
      }],
      currentLineups: {
        home: ['h1', 'h2', 'h3', 'h4', 'h5'],
        away: ['a1', 'a2', 'a3', 'a4', 'a5'],
      },
    }));
    const game = seedAvailableGame({
      status: 'preparing',
      homeScore: 110,
      awayScore: 104,
      liveTimeline: {
        version: 2,
        gameId: 'heavy-live-game',
        sport: 'nba',
        homeTeamId: 'home',
        awayTeamId: 'away',
        homeScore: 110,
        awayScore: 104,
        revealDurationMs: 900_000,
        periods: [{ period: 1, label: 'Q1', home: 30, away: 25 }],
        events: heavyEvents,
        starterMatchups: [{ position: 'PG', homePlayer: { playerId: 'h1', name: 'Home PG', teamId: 'home' }, awayPlayer: { playerId: 'a1', name: 'Away PG', teamId: 'away' } }],
      },
      liveMode: { status: 'ready', simulationStartedAtMs: 1_000, simulationEndsAtMs: 901_000 },
    });

    const payload = updatePayloadForCompetition('regular', [game]);
    const writtenGame = payload.games[0] as any;

    expect(writtenGame.liveTimeline).toMatchObject({
      version: 2,
      gameId: 'heavy-live-game',
      homeTeamId: 'home',
      awayTeamId: 'away',
      revealDurationMs: 900_000,
      storage: 'liveTimelines',
    });
    expect(writtenGame.liveTimeline.events).toBeUndefined();
    expect(writtenGame.liveTimeline.starterMatchups).toBeUndefined();
    expect(writtenGame.boxScore).toBeUndefined();
    expect(JSON.stringify(payload).length).toBeLessThan(8_000);
  });

  it('keeps completed schedule games light enough for season-long simulation writes', () => {
    const finalGames = Array.from({ length: 1230 }, (_, index) => seedAvailableGame({
      id: `g${index + 1}`,
      sequence: index + 1,
      status: 'final',
      homeScore: 100 + (index % 25),
      awayScore: 90 + (index % 22),
      winnerTeamId: index % 2 === 0 ? 'home' : 'away',
      quarters: [
        { quarter: 1, home: 25, away: 22 },
        { quarter: 2, home: 24, away: 21 },
        { quarter: 3, home: 26, away: 23 },
        { quarter: 4, home: 25, away: 24 },
      ],
      boxScore: {
        home: {
          players: Array.from({ length: 10 }, (_, playerIndex) => ({
            playerId: `h${index}-${playerIndex}`,
            name: `Home Player ${playerIndex}`,
            points: 10 + playerIndex,
            rebounds: playerIndex,
            assists: playerIndex % 5,
          })),
        },
        away: {
          players: Array.from({ length: 10 }, (_, playerIndex) => ({
            playerId: `a${index}-${playerIndex}`,
            name: `Away Player ${playerIndex}`,
            points: 8 + playerIndex,
            rebounds: playerIndex,
            assists: playerIndex % 4,
          })),
        },
      },
      postgameStory: {
        headline: 'Final',
        summary: 'A completed regular season game.',
        turningPoint: 'The third quarter swing decided it.',
        topPerformers: ['Home Player 1', 'Away Player 1'],
      },
    }));

    const payload = updatePayloadForCompetition('regular', finalGames);
    const writtenGame = payload.games[0] as any;

    expect(writtenGame.boxScore).toBeUndefined();
    expect(writtenGame.resultDetailsStorage).toBe('gameResults');
    expect(Buffer.byteLength(JSON.stringify(payload), 'utf8')).toBeLessThan(950_000);
  });

  it('uses grade-based player profiles without inflating average assists and rebounds', () => {
    const homeTeam = {
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
    };
    const awayTeam = {
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
    };
    const totals = new Map<string, any>();
    const teamTotals = { homeRebounds: 0, awayRebounds: 0, homeAssists: 0, awayAssists: 0, games: 0 };
    for (let seed = 1; seed <= 20; seed += 1) {
      const game = seedAvailableGame({
        homeTeamId: 'SAS_2011',
        awayTeamId: 'CHI',
        awayGmId: null,
      });
      game.id = `profile-sample-${seed}`;
      const result = simulateScheduledGame({
        game,
        uid: game.homeGmId,
        nowMs: 5_000 + seed,
        homeTeam,
        awayTeam,
      });

      teamTotals.homeRebounds += Number(result.boxScore.home.rebounds || 0);
      teamTotals.awayRebounds += Number(result.boxScore.away.rebounds || 0);
      teamTotals.homeAssists += Number(result.boxScore.home.assists || 0);
      teamTotals.awayAssists += Number(result.boxScore.away.assists || 0);
      teamTotals.games += 1;

      [...result.boxScore.home.players, ...result.boxScore.away.players].forEach((player: any) => {
        const row = totals.get(player.name) || { games: 0, rebounds: 0, assists: 0 };
        row.games += 1;
        row.rebounds += Number(player.rebounds || 0);
        row.assists += Number(player.assists || 0);
        totals.set(player.name, row);
      });
    }

    const average = (name: string, key: 'rebounds' | 'assists') => {
      const row = totals.get(name);
      return Number(row && row.games ? row[key] / row.games : 0);
    };
    expect(average('Tim Duncan', 'rebounds')).toBeGreaterThan(average('Tony Parker', 'rebounds'));
    expect(average('Tony Parker', 'assists')).toBeGreaterThan(average('Tim Duncan', 'assists'));
    expect(average('Derrick Rose', 'rebounds')).toBeLessThanOrEqual(8);
    expect(average('Omer Asik', 'assists')).toBeLessThanOrEqual(2);
    expect(teamTotals.homeRebounds / teamTotals.games).toBeLessThanOrEqual(58);
    expect(teamTotals.awayRebounds / teamTotals.games).toBeLessThanOrEqual(58);
    expect(teamTotals.homeAssists / teamTotals.games).toBeLessThanOrEqual(34);
    expect(teamTotals.awayAssists / teamTotals.games).toBeLessThanOrEqual(34);
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

  it('allows commissioners to simulate other teams and tops up under-linked claimed rosters', async () => {
    const game = seedAvailableGame({
      id: 'nba_3dhh2u',
      homeTeamId: 'CHA',
      awayTeamId: 'LAL',
      homeGmId: 'gm-cha',
      awayGmId: 'gm-lal',
    });
    const schedule = {
      participants: [
        { scheduleTeamId: 'CHA', abbreviation: 'CHA', gmId: 'gm-cha' },
        { scheduleTeamId: 'LAL', abbreviation: 'LAL', gmId: 'gm-lal' },
      ],
      games: [game],
    };
    const leagueRef = { collection: vi.fn() };
    const scheduleRef = { collection: vi.fn() };
    const chaRef = {};
    const lalRef = {};
    const poolRef = {};
    const prepRef = {};
    const usersCollection = { doc: vi.fn((uid: string) => ({ uid })) };
    const teamsCollection = {
      doc: vi.fn((id: string) => (id === 'CHA' ? chaRef : lalRef)),
      where: vi.fn(),
    };
    const schedulesCollection = { doc: vi.fn(() => scheduleRef) };
    const poolCollection = { doc: vi.fn(() => poolRef) };
    const liveTimelineRef = { id: 'nba_3dhh2u-live-timeline' };
    scheduleRef.collection = vi.fn((name: string) => {
      if (name === 'liveTimelines') return { doc: vi.fn(() => liveTimelineRef) };
      return { doc: vi.fn(() => prepRef) };
    });
    leagueRef.collection = vi.fn((name: string) => {
      if (name === 'schedules') return schedulesCollection;
      if (name === 'teams') return teamsCollection;
      return { doc: vi.fn() };
    });
    const poolPlayers = [
      ...Array.from({ length: 7 }, (_, index) => ({
        player_id: `cha-pool-${index}`,
        full_name: `Charlotte Pool ${index + 1}`,
        team: 'CHA',
        hidden: { shooting: 78 + index, playmaking: 76, defense: 74 },
      })),
      ...Array.from({ length: 7 }, (_, index) => ({
        player_id: `lal-pool-${index}`,
        full_name: `Lakers Pool ${index + 1}`,
        team: 'LAL',
        hidden: { shooting: 82, playmaking: 80, defense: 78 },
      })),
    ];
    const tx = {
      get: vi.fn(async ref => {
        if (ref === leagueRef) return { exists: true, data: () => ({ commissionerId: 'commissioner', scheduleId: '2026', era: 'current', sport: 'nba', name: 'NBA League' }) };
        if (ref === scheduleRef) return { exists: true, data: () => schedule };
        if (ref === chaRef) return {
          exists: true,
          data: () => ({
            teamId: 'CHA',
            abbreviation: 'CHA',
            gmId: 'gm-cha',
            players: [{ player_id: 'cha-linked-1', full_name: 'One Linked Hornet', team: 'CHA', hidden: { shooting: 80, playmaking: 77, defense: 75 } }],
          }),
        };
        if (ref === lalRef) return {
          exists: true,
          data: () => ({
            teamId: 'LAL',
            abbreviation: 'LAL',
            gmId: 'gm-lal',
            players: poolPlayers.filter((player: any) => player.team === 'LAL'),
          }),
        };
        if (ref === poolRef) return { exists: true, data: () => ({ players: poolPlayers }) };
        if (ref === prepRef) return { exists: false, data: () => ({}) };
        return { exists: false, data: () => ({}) };
      }),
      update: vi.fn(),
      set: vi.fn(),
    };
    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'leagues') return { doc: vi.fn(() => leagueRef) };
        if (name === 'era_player_pools') return poolCollection;
        if (name === 'users') return usersCollection;
        return { doc: vi.fn() };
      }),
      runTransaction: vi.fn(async callback => callback(tx)),
    };
    class TestHttpsError extends Error {
      code: string;

      constructor(code: string, message: string) {
        super(message);
        this.code = code;
      }
    }
    const handler = createSimulateScheduledGameHandler({
      getFirestore: () => db,
      FieldValue: { arrayUnion: (value: any) => value },
      now: () => 12_000,
      HttpsError: TestHttpsError,
    });

    const result = await handler({
      auth: { uid: 'commissioner' },
      data: { leagueId: 'league-1', gameId: 'nba_3dhh2u', competition: 'regular' },
    });

    expect(result.status).toBe('final');
    expect(result.boxScore.home.players.length).toBeGreaterThanOrEqual(5);
    expect(tx.update).toHaveBeenCalledWith(scheduleRef, expect.objectContaining({
      games: [expect.objectContaining({ id: 'nba_3dhh2u', status: 'final' })],
    }));
    expect(tx.set).toHaveBeenCalledWith(liveTimelineRef, expect.objectContaining({
      gameId: 'nba_3dhh2u',
      liveTimeline: expect.objectContaining({
        events: expect.arrayContaining([expect.objectContaining({ eventType: expect.any(String) })]),
      }),
    }), { merge: true });
    const scheduleUpdate = tx.update.mock.calls.find(([ref]: any[]) => ref === scheduleRef)?.[1];
    expect(scheduleUpdate.games[0].liveTimeline).toBeUndefined();
    expect(scheduleUpdate.games[0].boxScore).toBeUndefined();
    expect(scheduleUpdate.games[0].resultDetailsStorage).toBe('gameResults');
    expect(tx.set).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      gameId: 'nba_3dhh2u',
      game: expect.objectContaining({
        id: 'nba_3dhh2u',
        boxScore: expect.objectContaining({
          home: expect.objectContaining({ players: expect.any(Array) }),
        }),
      }),
    }), { merge: true });
  });

  it('stores non-empty box scores for games completed by season batch simulation', async () => {
    const game = seedAvailableGame({
      id: 'batch-game-1',
      sequence: 1,
      week: 1,
      homeTeamId: 'HOME',
      awayTeamId: 'AWAY',
      homeGmId: null,
      awayGmId: null,
    });
    const schedule = { games: [game] };
    const leagueRef: any = { id: 'league-1' };
    const scheduleRef: any = { id: '2025' };
    const homeRef: any = { id: 'HOME' };
    const awayRef: any = { id: 'AWAY' };
    const gameResultRef: any = { id: 'batch-game-1-result' };
    const liveTimelineRef: any = { id: 'batch-game-1-live' };
    scheduleRef.collection = vi.fn((name: string) => {
      if (name === 'gameResults') return { doc: vi.fn(() => gameResultRef) };
      if (name === 'liveTimelines') return { doc: vi.fn(() => liveTimelineRef) };
      return { doc: vi.fn() };
    });
    leagueRef.collection = vi.fn((name: string) => {
      if (name === 'schedules') return { doc: vi.fn(() => scheduleRef) };
      if (name === 'teams') return { doc: vi.fn((id: string) => (id === 'HOME' ? homeRef : awayRef)) };
      return { doc: vi.fn() };
    });
    const tx = {
      get: vi.fn(async (ref: any) => {
        if (ref === leagueRef) return {
          exists: true,
          data: () => ({ commissionerId: 'commissioner', scheduleId: '2025', sport: 'nba' }),
        };
        if (ref === scheduleRef) return { exists: true, data: () => schedule };
        if (ref === homeRef) return {
          exists: true,
          id: 'HOME',
          data: () => ({
            teamId: 'HOME',
            abbreviation: 'HOM',
            players: seedRoster('Home', 84).players,
          }),
        };
        if (ref === awayRef) return {
          exists: true,
          id: 'AWAY',
          data: () => ({
            teamId: 'AWAY',
            abbreviation: 'AWY',
            players: seedRoster('Away', 78).players,
          }),
        };
        return { exists: false, data: () => ({}) };
      }),
      update: vi.fn(),
      set: vi.fn(),
    };
    const db = {
      collection: vi.fn((name: string) => (name === 'leagues' ? { doc: vi.fn(() => leagueRef) } : { doc: vi.fn() })),
      runTransaction: vi.fn(async callback => callback(tx)),
    };
    class TestHttpsError extends Error {
      code: string;

      constructor(code: string, message: string) {
        super(message);
        this.code = code;
      }
    }
    const handler = createSimScheduleBatchHandler({
      getFirestore: () => db,
      now: () => 15_000,
      HttpsError: TestHttpsError,
    });

    const control = await handler({
      auth: { uid: 'commissioner' },
      data: { leagueId: 'league-1', action: 'start', competition: 'regular', batchSize: 1 },
    });

    expect(control).toMatchObject({ status: 'complete', lastBatchGameIds: ['batch-game-1'] });
    const scheduleUpdate = tx.update.mock.calls.find(([ref]: any[]) => ref === scheduleRef)?.[1];
    expect(scheduleUpdate.games[0]).toMatchObject({
      id: 'batch-game-1',
      status: 'final',
      resultDetailsStorage: 'gameResults',
    });
    expect(scheduleUpdate.games[0].boxScore).toBeUndefined();
    const gameResultWrite = tx.set.mock.calls.find(([ref]: any[]) => ref === gameResultRef);
    expect(gameResultWrite).toBeTruthy();
    expect(gameResultWrite?.[1]).toMatchObject({
      gameId: 'batch-game-1',
      game: expect.objectContaining({
        id: 'batch-game-1',
        boxScore: expect.objectContaining({
          home: expect.objectContaining({
            players: expect.arrayContaining([
              expect.objectContaining({ name: expect.any(String), points: expect.any(Number) }),
            ]),
          }),
          away: expect.objectContaining({
            players: expect.arrayContaining([
              expect.objectContaining({ name: expect.any(String), points: expect.any(Number) }),
            ]),
          }),
        }),
      }),
    });
  });

  it('repairs and returns box score details for an already-final scheduled game', async () => {
    const finalGame = seedAvailableGame({
      id: 'missing-detail-game',
      sequence: 1,
      week: 1,
      status: 'final',
      homeTeamId: 'WAS',
      awayTeamId: 'SAC',
      homeGmId: null,
      awayGmId: null,
      homeScore: 104,
      awayScore: 109,
      winnerTeamId: 'SAC',
      quarters: [
        { quarter: 1, home: 26, away: 36 },
        { quarter: 2, home: 23, away: 26 },
        { quarter: 3, home: 25, away: 20 },
        { quarter: 4, home: 30, away: 27 },
      ],
    });
    const schedule = {
      games: [finalGame],
      participants: [
        { scheduleTeamId: 'WAS', abbreviation: 'WAS', name: 'Washington' },
        { scheduleTeamId: 'SAC', abbreviation: 'SAC', name: 'Sacramento' },
      ],
    };
    const leagueRef: any = { id: 'league-1' };
    const scheduleRef: any = { id: '2025' };
    const resultRef: any = { id: 'missing-detail-game' };
    const poolRef: any = { id: 'current' };
    const poolPlayers = [
      ...Array.from({ length: 8 }, (_, index) => ({
        player_id: `was-${index}`,
        full_name: `Washington CPU ${index + 1}`,
        team: 'WAS',
        position: index === 0 ? 'PG' : index === 4 ? 'C' : 'G',
        minutes: index < 5 ? 30 : 18,
        hidden: { shooting: 80, playmaking: 75, defense: 74, rebounding: index === 4 ? 84 : 65, basketballIq: 78 },
      })),
      ...Array.from({ length: 8 }, (_, index) => ({
        player_id: `sac-${index}`,
        full_name: `Sacramento CPU ${index + 1}`,
        team: 'SAC',
        position: index === 0 ? 'PG' : index === 4 ? 'C' : 'G',
        minutes: index < 5 ? 30 : 18,
        hidden: { shooting: 83, playmaking: 79, defense: 76, rebounding: index === 4 ? 86 : 67, basketballIq: 81 },
      })),
    ];
    scheduleRef.collection = vi.fn((name: string) => {
      if (name === 'gameResults') return { doc: vi.fn(() => resultRef) };
      if (name === 'liveTimelines') return { doc: vi.fn(() => ({ id: 'missing-detail-game-live' })) };
      return { doc: vi.fn() };
    });
    leagueRef.collection = vi.fn((name: string) => {
      if (name === 'schedules') return { doc: vi.fn(() => scheduleRef) };
      if (name === 'teams') return { doc: vi.fn(() => ({ id: 'missing-team' })) };
      return { doc: vi.fn() };
    });
    const tx = {
      get: vi.fn(async (ref: any) => {
        if (ref === leagueRef) return {
          exists: true,
          data: () => ({ commissionerId: 'commissioner', members: ['member'], scheduleId: '2025', sport: 'nba', era: 'current' }),
        };
        if (ref === scheduleRef) return { exists: true, data: () => schedule };
        if (ref === resultRef) return { exists: false, data: () => ({}) };
        if (ref === poolRef) return { exists: true, data: () => ({ players: poolPlayers }) };
        return { exists: false, data: () => ({}) };
      }),
      set: vi.fn(),
    };
    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'leagues') return { doc: vi.fn(() => leagueRef) };
        if (name === 'era_player_pools') return { doc: vi.fn(() => poolRef) };
        return { doc: vi.fn() };
      }),
      runTransaction: vi.fn(async callback => callback(tx)),
    };
    class TestHttpsError extends Error {
      code: string;

      constructor(code: string, message: string) {
        super(message);
        this.code = code;
      }
    }
    const handler = createGetGameResultDetailsHandler({
      getFirestore: () => db,
      now: () => 20_000,
      HttpsError: TestHttpsError,
    });

    const result = await handler({
      auth: { uid: 'member' },
      data: { leagueId: 'league-1', gameId: 'missing-detail-game', competition: 'regular' },
    });

    expect(result).toMatchObject({ repaired: true });
    expect(result.game.boxScore.home.players.length).toBeGreaterThanOrEqual(5);
    expect(result.game.boxScore.away.players.length).toBeGreaterThanOrEqual(5);
    expect(result.game.boxScore.home.points).toBe(104);
    expect(result.game.boxScore.away.points).toBe(109);
    expect(tx.set).toHaveBeenCalledWith(resultRef, expect.objectContaining({
      gameId: 'missing-detail-game',
      game: expect.objectContaining({
        id: 'missing-detail-game',
        boxScore: expect.objectContaining({
          home: expect.objectContaining({ players: expect.any(Array) }),
          away: expect.objectContaining({ players: expect.any(Array) }),
        }),
      }),
    }), { merge: true });
  });

  it('treats vacant scheduled teams as CPU teams using era pool rosters', async () => {
    const game = seedAvailableGame({
      id: 'cpu-pool-game',
      sequence: 1,
      week: 1,
      homeTeamId: 'LAC_CURRENT',
      awayTeamId: 'ATL_CURRENT',
      homeGmId: null,
      awayGmId: null,
    });
    const schedule = { games: [game] };
    const leagueRef: any = { id: 'league-1' };
    const scheduleRef: any = { id: '2025' };
    const lacRef: any = { id: 'LAC' };
    const atlRef: any = { id: 'ATL' };
    const poolRef: any = { id: 'current' };
    const gameResultRef: any = { id: 'cpu-pool-game-result' };
    const liveTimelineRef: any = { id: 'cpu-pool-game-live' };
    const poolPlayers = [
      ...Array.from({ length: 8 }, (_, index) => ({
        player_id: `lac-cpu-${index}`,
        full_name: `Clippers CPU ${index + 1}`,
        team: 'LAC',
        position: index === 0 ? 'PG' : index === 4 ? 'C' : 'G',
        minutes: index < 5 ? 30 : 18,
        hidden: { shooting: 82, playmaking: 78, defense: 76, rebounding: index === 4 ? 88 : 68, basketballIq: 80 },
      })),
      ...Array.from({ length: 8 }, (_, index) => ({
        player_id: `atl-cpu-${index}`,
        full_name: `Hawks CPU ${index + 1}`,
        team: 'ATL',
        position: index === 0 ? 'PG' : index === 4 ? 'C' : 'G',
        minutes: index < 5 ? 30 : 18,
        hidden: { shooting: 78, playmaking: 76, defense: 74, rebounding: index === 4 ? 84 : 66, basketballIq: 78 },
      })),
    ];
    scheduleRef.collection = vi.fn((name: string) => {
      if (name === 'gameResults') return { doc: vi.fn(() => gameResultRef) };
      if (name === 'liveTimelines') return { doc: vi.fn(() => liveTimelineRef) };
      return { doc: vi.fn() };
    });
    leagueRef.collection = vi.fn((name: string) => {
      if (name === 'schedules') return { doc: vi.fn(() => scheduleRef) };
      if (name === 'teams') return { doc: vi.fn((id: string) => (id === 'LAC_CURRENT' ? lacRef : atlRef)) };
      return { doc: vi.fn() };
    });
    const tx = {
      get: vi.fn(async (ref: any) => {
        if (ref === leagueRef) return {
          exists: true,
          data: () => ({ commissionerId: 'commissioner', scheduleId: '2025', sport: 'nba', era: 'current' }),
        };
        if (ref === scheduleRef) return { exists: true, data: () => schedule };
        if (ref === lacRef || ref === atlRef) return { exists: false, data: () => ({}) };
        if (ref === poolRef) return { exists: true, data: () => ({ players: poolPlayers }) };
        return { exists: false, data: () => ({}) };
      }),
      update: vi.fn(),
      set: vi.fn(),
    };
    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'leagues') return { doc: vi.fn(() => leagueRef) };
        if (name === 'era_player_pools') return { doc: vi.fn(() => poolRef) };
        return { doc: vi.fn() };
      }),
      runTransaction: vi.fn(async callback => callback(tx)),
    };
    class TestHttpsError extends Error {
      code: string;

      constructor(code: string, message: string) {
        super(message);
        this.code = code;
      }
    }
    const handler = createSimScheduleBatchHandler({
      getFirestore: () => db,
      now: () => 16_000,
      HttpsError: TestHttpsError,
    });

    const control = await handler({
      auth: { uid: 'commissioner' },
      data: { leagueId: 'league-1', action: 'start', competition: 'regular', batchSize: 1 },
    });

    expect(control).toMatchObject({ status: 'complete', lastBatchGameIds: ['cpu-pool-game'] });
    const gameResultWrite = tx.set.mock.calls.find(([ref]: any[]) => ref === gameResultRef);
    expect(gameResultWrite).toBeTruthy();
    expect(gameResultWrite?.[1]).toMatchObject({
      gameId: 'cpu-pool-game',
      game: expect.objectContaining({
        id: 'cpu-pool-game',
        boxScore: expect.objectContaining({
          home: expect.objectContaining({
            players: expect.arrayContaining([
              expect.objectContaining({ name: expect.stringContaining('Clippers CPU'), points: expect.any(Number) }),
            ]),
          }),
          away: expect.objectContaining({
            players: expect.arrayContaining([
              expect.objectContaining({ name: expect.stringContaining('Hawks CPU'), points: expect.any(Number) }),
            ]),
          }),
        }),
      }),
    });
  });

  it('falls back to the current era pool for modern NBA leagues before generic CPU names', async () => {
    const game = seedAvailableGame({
      id: 'modern-pool-game',
      sequence: 1,
      week: 1,
      homeTeamId: 'PHI_CURRENT',
      awayTeamId: 'SAS_CURRENT',
      homeGmId: null,
      awayGmId: null,
    });
    const schedule = { games: [game] };
    const leagueRef: any = { id: 'league-1' };
    const scheduleRef: any = { id: '2025' };
    const phiRef: any = { id: 'PHI_CURRENT' };
    const sasRef: any = { id: 'SAS_CURRENT' };
    const modernPoolRef: any = { id: 'modern' };
    const currentPoolRef: any = { id: 'current' };
    const gameResultRef: any = { id: 'modern-pool-game-result' };
    const liveTimelineRef: any = { id: 'modern-pool-game-live' };
    const poolPlayers = [
      ...Array.from({ length: 8 }, (_, index) => ({
        player_id: `phi-current-${index}`,
        full_name: `Sixers Current ${index + 1}`,
        team: 'PHI',
        position: index === 0 ? 'PG' : index === 4 ? 'C' : 'G',
        minutes: index < 5 ? 30 : 18,
        hidden: { shooting: 82, playmaking: 78, defense: 76, rebounding: index === 4 ? 88 : 68, basketballIq: 80 },
      })),
      ...Array.from({ length: 8 }, (_, index) => ({
        player_id: `sas-current-${index}`,
        full_name: `Spurs Current ${index + 1}`,
        team: 'SAS',
        position: index === 0 ? 'PG' : index === 4 ? 'C' : 'G',
        minutes: index < 5 ? 30 : 18,
        hidden: { shooting: 76, playmaking: 74, defense: 76, rebounding: index === 4 ? 86 : 66, basketballIq: 78 },
      })),
    ];
    scheduleRef.collection = vi.fn((name: string) => {
      if (name === 'gameResults') return { doc: vi.fn(() => gameResultRef) };
      if (name === 'liveTimelines') return { doc: vi.fn(() => liveTimelineRef) };
      return { doc: vi.fn() };
    });
    leagueRef.collection = vi.fn((name: string) => {
      if (name === 'schedules') return { doc: vi.fn(() => scheduleRef) };
      if (name === 'teams') return { doc: vi.fn((id: string) => (id === 'PHI_CURRENT' ? phiRef : sasRef)) };
      return { doc: vi.fn() };
    });
    const tx = {
      get: vi.fn(async (ref: any) => {
        if (ref === leagueRef) return {
          exists: true,
          data: () => ({ commissionerId: 'commissioner', scheduleId: '2025', sport: 'nba', era: 'modern' }),
        };
        if (ref === scheduleRef) return { exists: true, data: () => schedule };
        if (ref === phiRef || ref === sasRef) return { exists: false, data: () => ({}) };
        if (ref === modernPoolRef) return { exists: false, data: () => ({}) };
        if (ref === currentPoolRef) return { exists: true, data: () => ({ players: poolPlayers }) };
        return { exists: false, data: () => ({}) };
      }),
      update: vi.fn(),
      set: vi.fn(),
    };
    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'leagues') return { doc: vi.fn(() => leagueRef) };
        if (name === 'era_player_pools') {
          return { doc: vi.fn((id: string) => (id === 'modern' ? modernPoolRef : currentPoolRef)) };
        }
        return { doc: vi.fn() };
      }),
      runTransaction: vi.fn(async callback => callback(tx)),
    };
    class TestHttpsError extends Error {
      code: string;

      constructor(code: string, message: string) {
        super(message);
        this.code = code;
      }
    }
    const handler = createSimScheduleBatchHandler({
      getFirestore: () => db,
      now: () => 16_500,
      HttpsError: TestHttpsError,
    });

    await handler({
      auth: { uid: 'commissioner' },
      data: { leagueId: 'league-1', action: 'start', competition: 'regular', batchSize: 1 },
    });

    const gameResultWrite = tx.set.mock.calls.find(([ref]: any[]) => ref === gameResultRef);
    expect(gameResultWrite?.[1]).toMatchObject({
      game: expect.objectContaining({
        boxScore: expect.objectContaining({
          home: expect.objectContaining({
            players: expect.arrayContaining([
              expect.objectContaining({ name: expect.stringContaining('Sixers Current') }),
            ]),
          }),
          away: expect.objectContaining({
            players: expect.arrayContaining([
              expect.objectContaining({ name: expect.stringContaining('Spurs Current') }),
            ]),
          }),
        }),
      }),
    });
  });

  it('repairs missing box score records for already-final season games', async () => {
    const finalGame = {
      ...seedAvailableGame({
        id: 'final-missing-result',
        sequence: 12,
        week: 2,
        homeTeamId: 'HOME',
        awayTeamId: 'AWAY',
        homeGmId: null,
        awayGmId: null,
      }),
      status: 'final',
      homeScore: 112,
      awayScore: 104,
      winnerTeamId: 'HOME',
      loserTeamId: 'AWAY',
      quarters: [
        { quarter: 1, home: 30, away: 24 },
        { quarter: 2, home: 27, away: 27 },
        { quarter: 3, home: 28, away: 24 },
        { quarter: 4, home: 27, away: 29 },
      ],
    };
    const schedule = { games: [finalGame] };
    const leagueRef: any = { id: 'league-1' };
    const scheduleRef: any = { id: '2025' };
    const homeRef: any = { id: 'HOME' };
    const awayRef: any = { id: 'AWAY' };
    const gameResultRef: any = { id: 'final-missing-result-detail' };
    const liveTimelineRef: any = { id: 'final-missing-result-live' };
    scheduleRef.collection = vi.fn((name: string) => {
      if (name === 'gameResults') return { doc: vi.fn(() => gameResultRef) };
      if (name === 'liveTimelines') return { doc: vi.fn(() => liveTimelineRef) };
      return { doc: vi.fn() };
    });
    leagueRef.collection = vi.fn((name: string) => {
      if (name === 'schedules') return { doc: vi.fn(() => scheduleRef) };
      if (name === 'teams') return { doc: vi.fn((id: string) => (id === 'HOME' ? homeRef : awayRef)) };
      return { doc: vi.fn() };
    });
    const tx = {
      get: vi.fn(async (ref: any) => {
        if (ref === leagueRef) return {
          exists: true,
          data: () => ({ commissionerId: 'commissioner', scheduleId: '2025', sport: 'nba' }),
        };
        if (ref === scheduleRef) return { exists: true, data: () => schedule };
        if (ref === gameResultRef) return { exists: false, data: () => ({}) };
        if (ref === homeRef) return {
          exists: true,
          id: 'HOME',
          data: () => ({
            teamId: 'HOME',
            abbreviation: 'HOM',
            players: seedRoster('Home', 84).players,
          }),
        };
        if (ref === awayRef) return {
          exists: true,
          id: 'AWAY',
          data: () => ({
            teamId: 'AWAY',
            abbreviation: 'AWY',
            players: seedRoster('Away', 78).players,
          }),
        };
        return { exists: false, data: () => ({}) };
      }),
      update: vi.fn(),
      set: vi.fn(),
    };
    const db = {
      collection: vi.fn((name: string) => (name === 'leagues' ? { doc: vi.fn(() => leagueRef) } : { doc: vi.fn() })),
      runTransaction: vi.fn(async callback => callback(tx)),
    };
    class TestHttpsError extends Error {
      code: string;

      constructor(code: string, message: string) {
        super(message);
        this.code = code;
      }
    }
    const handler = createSimScheduleBatchHandler({
      getFirestore: () => db,
      now: () => 20_000,
      HttpsError: TestHttpsError,
    });

    const control = await handler({
      auth: { uid: 'commissioner' },
      data: { leagueId: 'league-1', action: 'repairResults', competition: 'regular', batchSize: 1 },
    });

    expect(control).toMatchObject({
      status: 'running',
      repairedGameIds: ['final-missing-result'],
      repairedGames: 1,
    });
    const scheduleUpdate = tx.update.mock.calls.find(([ref]: any[]) => ref === scheduleRef)?.[1];
    expect(scheduleUpdate.games[0]).toMatchObject({
      id: 'final-missing-result',
      status: 'final',
      resultDetailsStorage: 'gameResults',
    });
    expect(scheduleUpdate.games[0].boxScore).toBeUndefined();
    const gameResultWrite = tx.set.mock.calls.find(([ref]: any[]) => ref === gameResultRef);
    expect(gameResultWrite).toBeTruthy();
    expect(gameResultWrite?.[1]).toMatchObject({
      gameId: 'final-missing-result',
      game: expect.objectContaining({
        id: 'final-missing-result',
        homeScore: 112,
        awayScore: 104,
        boxScore: expect.objectContaining({
          home: expect.objectContaining({
            points: 112,
            players: expect.arrayContaining([
              expect.objectContaining({ name: expect.any(String), points: expect.any(Number) }),
            ]),
          }),
          away: expect.objectContaining({
            points: 104,
            players: expect.arrayContaining([
              expect.objectContaining({ name: expect.any(String), points: expect.any(Number) }),
            ]),
          }),
        }),
      }),
    });
  });

  it('repairs a targeted final result before simming the next scheduled game', async () => {
    const finalGame = {
      ...seedAvailableGame({
        id: 'target-final-missing-box',
        sequence: 4,
        week: 1,
        homeTeamId: 'HOME',
        awayTeamId: 'AWAY',
        homeGmId: null,
        awayGmId: null,
      }),
      status: 'final',
      homeScore: 101,
      awayScore: 88,
      winnerTeamId: 'HOME',
      loserTeamId: 'AWAY',
      quarters: [
        { quarter: 1, home: 29, away: 23 },
        { quarter: 2, home: 22, away: 15 },
        { quarter: 3, home: 26, away: 23 },
        { quarter: 4, home: 24, away: 27 },
      ],
    };
    const nextScheduled = seedAvailableGame({
      id: 'next-scheduled-game',
      sequence: 5,
      week: 1,
      homeTeamId: 'HOME',
      awayTeamId: 'AWAY',
      homeGmId: null,
      awayGmId: null,
    });
    const schedule = { games: [finalGame, nextScheduled] };
    const leagueRef: any = { id: 'league-1' };
    const scheduleRef: any = { id: '2025' };
    const homeRef: any = { id: 'HOME' };
    const awayRef: any = { id: 'AWAY' };
    const gameResultRef: any = { id: 'target-final-missing-box-detail' };
    const liveTimelineRef: any = { id: 'target-final-missing-box-live' };
    scheduleRef.collection = vi.fn((name: string) => {
      if (name === 'gameResults') return { doc: vi.fn(() => gameResultRef) };
      if (name === 'liveTimelines') return { doc: vi.fn(() => liveTimelineRef) };
      return { doc: vi.fn() };
    });
    leagueRef.collection = vi.fn((name: string) => {
      if (name === 'schedules') return { doc: vi.fn(() => scheduleRef) };
      if (name === 'teams') return { doc: vi.fn((id: string) => (id === 'HOME' ? homeRef : awayRef)) };
      return { doc: vi.fn() };
    });
    const tx = {
      get: vi.fn(async (ref: any) => {
        if (ref === leagueRef) return {
          exists: true,
          data: () => ({ commissionerId: 'commissioner', scheduleId: '2025', sport: 'nba' }),
        };
        if (ref === scheduleRef) return { exists: true, data: () => schedule };
        if (ref === gameResultRef) return {
          exists: true,
          data: () => ({
            game: {
              ...finalGame,
              boxScore: { home: { players: [] }, away: { players: [] } },
            },
          }),
        };
        if (ref === homeRef) return {
          exists: true,
          id: 'HOME',
          data: () => ({
            teamId: 'HOME',
            abbreviation: 'HOM',
            players: seedRoster('Home', 84).players,
          }),
        };
        if (ref === awayRef) return {
          exists: true,
          id: 'AWAY',
          data: () => ({
            teamId: 'AWAY',
            abbreviation: 'AWY',
            players: seedRoster('Away', 78).players,
          }),
        };
        return { exists: false, data: () => ({}) };
      }),
      update: vi.fn(),
      set: vi.fn(),
    };
    const db = {
      collection: vi.fn((name: string) => (name === 'leagues' ? { doc: vi.fn(() => leagueRef) } : { doc: vi.fn() })),
      runTransaction: vi.fn(async callback => callback(tx)),
    };
    class TestHttpsError extends Error {
      code: string;

      constructor(code: string, message: string) {
        super(message);
        this.code = code;
      }
    }
    const handler = createSimScheduleBatchHandler({
      getFirestore: () => db,
      now: () => 30_000,
      HttpsError: TestHttpsError,
    });

    const control = await handler({
      auth: { uid: 'commissioner' },
      data: {
        leagueId: 'league-1',
        action: 'repairResults',
        competition: 'regular',
        gameId: 'target-final-missing-box',
        batchSize: 1,
      },
    });

    expect(control).toMatchObject({
      status: 'running',
      repairedGameIds: ['target-final-missing-box'],
      repairedGames: 1,
    });
    const scheduleUpdate = tx.update.mock.calls.find(([ref]: any[]) => ref === scheduleRef)?.[1];
    expect(scheduleUpdate.games[0]).toMatchObject({
      id: 'target-final-missing-box',
      status: 'final',
      resultDetailsStorage: 'gameResults',
    });
    expect(scheduleUpdate.games[1]).toMatchObject({
      id: 'next-scheduled-game',
      status: 'scheduled',
    });
    const gameResultWrite = tx.set.mock.calls.find(([ref]: any[]) => ref === gameResultRef);
    expect(gameResultWrite?.[1]).toMatchObject({
      gameId: 'target-final-missing-box',
      game: expect.objectContaining({
        boxScore: expect.objectContaining({
          home: expect.objectContaining({
            players: expect.arrayContaining([
              expect.objectContaining({ name: expect.any(String), points: expect.any(Number) }),
            ]),
          }),
          away: expect.objectContaining({
            players: expect.arrayContaining([
              expect.objectContaining({ name: expect.any(String), points: expect.any(Number) }),
            ]),
          }),
        }),
      }),
    });
  });

  it('repairs missing final result details before continuing a season sim batch', async () => {
    const finalGame = {
      ...seedAvailableGame({
        id: 'old-final-missing-box',
        sequence: 4,
        week: 1,
        homeTeamId: 'HOME',
        awayTeamId: 'AWAY',
        homeGmId: null,
        awayGmId: null,
      }),
      status: 'final',
      homeScore: 101,
      awayScore: 88,
      winnerTeamId: 'HOME',
      loserTeamId: 'AWAY',
      quarters: [
        { quarter: 1, home: 29, away: 23 },
        { quarter: 2, home: 22, away: 15 },
        { quarter: 3, home: 26, away: 23 },
        { quarter: 4, home: 24, away: 27 },
      ],
    };
    const nextScheduled = seedAvailableGame({
      id: 'next-scheduled-game',
      sequence: 5,
      week: 1,
      homeTeamId: 'HOME',
      awayTeamId: 'AWAY',
      homeGmId: null,
      awayGmId: null,
    });
    const schedule = { games: [finalGame, nextScheduled] };
    const leagueRef: any = { id: 'league-1' };
    const scheduleRef: any = { id: '2025' };
    const homeRef: any = { id: 'HOME' };
    const awayRef: any = { id: 'AWAY' };
    const gameResultRef: any = { id: 'old-final-missing-box-detail' };
    const liveTimelineRef: any = { id: 'old-final-missing-box-live' };
    scheduleRef.collection = vi.fn((name: string) => {
      if (name === 'gameResults') return { doc: vi.fn(() => gameResultRef) };
      if (name === 'liveTimelines') return { doc: vi.fn(() => liveTimelineRef) };
      return { doc: vi.fn() };
    });
    leagueRef.collection = vi.fn((name: string) => {
      if (name === 'schedules') return { doc: vi.fn(() => scheduleRef) };
      if (name === 'teams') return { doc: vi.fn((id: string) => (id === 'HOME' ? homeRef : awayRef)) };
      return { doc: vi.fn() };
    });
    const tx = {
      get: vi.fn(async (ref: any) => {
        if (ref === leagueRef) return {
          exists: true,
          data: () => ({ commissionerId: 'commissioner', scheduleId: '2025', sport: 'nba' }),
        };
        if (ref === scheduleRef) return { exists: true, data: () => schedule };
        if (ref === gameResultRef) return {
          exists: true,
          data: () => ({
            game: {
              ...finalGame,
              boxScore: { home: { players: [] }, away: { players: [] } },
            },
          }),
        };
        if (ref === homeRef) return {
          exists: true,
          id: 'HOME',
          data: () => ({
            teamId: 'HOME',
            abbreviation: 'HOM',
            players: seedRoster('Home', 84).players,
          }),
        };
        if (ref === awayRef) return {
          exists: true,
          id: 'AWAY',
          data: () => ({
            teamId: 'AWAY',
            abbreviation: 'AWY',
            players: seedRoster('Away', 78).players,
          }),
        };
        return { exists: false, data: () => ({}) };
      }),
      update: vi.fn(),
      set: vi.fn(),
    };
    const db = {
      collection: vi.fn((name: string) => (name === 'leagues' ? { doc: vi.fn(() => leagueRef) } : { doc: vi.fn() })),
      runTransaction: vi.fn(async callback => callback(tx)),
    };
    class TestHttpsError extends Error {
      code: string;

      constructor(code: string, message: string) {
        super(message);
        this.code = code;
      }
    }
    const handler = createSimScheduleBatchHandler({
      getFirestore: () => db,
      now: () => 40_000,
      HttpsError: TestHttpsError,
    });

    const control = await handler({
      auth: { uid: 'commissioner' },
      data: {
        leagueId: 'league-1',
        action: 'step',
        competition: 'regular',
        batchSize: 1,
      },
    });

    expect(control).toMatchObject({
      status: 'running',
      repairedGameIds: ['old-final-missing-box'],
      repairedGames: 1,
    });
    expect(control.lastBatchGameIds).toBeUndefined();
    const scheduleUpdate = tx.update.mock.calls.find(([ref]: any[]) => ref === scheduleRef)?.[1];
    expect(scheduleUpdate.games[0]).toMatchObject({
      id: 'old-final-missing-box',
      status: 'final',
      resultDetailsStorage: 'gameResults',
    });
    expect(scheduleUpdate.games[1]).toMatchObject({
      id: 'next-scheduled-game',
      status: 'scheduled',
    });
    const gameResultWrite = tx.set.mock.calls.find(([ref]: any[]) => ref === gameResultRef);
    expect(gameResultWrite?.[1]).toMatchObject({
      gameId: 'old-final-missing-box',
      game: expect.objectContaining({
        boxScore: expect.objectContaining({
          home: expect.objectContaining({
            players: expect.arrayContaining([
              expect.objectContaining({ name: expect.any(String), points: expect.any(Number) }),
            ]),
          }),
          away: expect.objectContaining({
            players: expect.arrayContaining([
              expect.objectContaining({ name: expect.any(String), points: expect.any(Number) }),
            ]),
          }),
        }),
      }),
    });
  });

  it('repairs final result box scores with CPU fallback players when roster docs are missing', async () => {
    const finalGame = {
      ...seedAvailableGame({
        id: 'final-missing-cpu-roster',
        sequence: 9,
        week: 1,
        homeTeamId: 'PHI_CURRENT',
        awayTeamId: 'SAS_CURRENT',
        homeGmId: null,
        awayGmId: null,
      }),
      status: 'final',
      homeScore: 108,
      awayScore: 103,
      winnerTeamId: 'PHI_CURRENT',
      loserTeamId: 'SAS_CURRENT',
    };
    const schedule = { games: [finalGame] };
    const leagueRef: any = { id: 'league-1' };
    const scheduleRef: any = { id: '2025' };
    const phiRef: any = { id: 'PHI_CURRENT' };
    const sasRef: any = { id: 'SAS_CURRENT' };
    const currentPoolRef: any = { id: 'current' };
    const gameResultRef: any = { id: 'final-missing-cpu-roster-detail' };
    const liveTimelineRef: any = { id: 'final-missing-cpu-roster-live' };
    scheduleRef.collection = vi.fn((name: string) => {
      if (name === 'gameResults') return { doc: vi.fn(() => gameResultRef) };
      if (name === 'liveTimelines') return { doc: vi.fn(() => liveTimelineRef) };
      return { doc: vi.fn() };
    });
    leagueRef.collection = vi.fn((name: string) => {
      if (name === 'schedules') return { doc: vi.fn(() => scheduleRef) };
      if (name === 'teams') return { doc: vi.fn((id: string) => (id === 'PHI_CURRENT' ? phiRef : sasRef)) };
      return { doc: vi.fn() };
    });
    const tx = {
      get: vi.fn(async (ref: any) => {
        if (ref === leagueRef) return {
          exists: true,
          data: () => ({ commissionerId: 'commissioner', scheduleId: '2025', sport: 'nba', era: 'modern' }),
        };
        if (ref === scheduleRef) return { exists: true, data: () => schedule };
        if (ref === gameResultRef) return {
          exists: true,
          data: () => ({ game: { ...finalGame, boxScore: { home: { players: [] }, away: { players: [] } } } }),
        };
        if (ref === phiRef || ref === sasRef) return { exists: false, data: () => ({}) };
        if (ref === currentPoolRef) return { exists: false, data: () => ({}) };
        return { exists: false, data: () => ({}) };
      }),
      update: vi.fn(),
      set: vi.fn(),
    };
    const db = {
      collection: vi.fn((name: string) => {
        if (name === 'leagues') return { doc: vi.fn(() => leagueRef) };
        if (name === 'era_player_pools') return { doc: vi.fn(() => currentPoolRef) };
        return { doc: vi.fn() };
      }),
      runTransaction: vi.fn(async callback => callback(tx)),
    };
    class TestHttpsError extends Error {
      code: string;

      constructor(code: string, message: string) {
        super(message);
        this.code = code;
      }
    }
    const handler = createSimScheduleBatchHandler({
      getFirestore: () => db,
      now: () => 35_000,
      HttpsError: TestHttpsError,
    });

    const control = await handler({
      auth: { uid: 'commissioner' },
      data: {
        leagueId: 'league-1',
        action: 'repairResults',
        competition: 'regular',
        gameId: 'final-missing-cpu-roster',
        batchSize: 1,
      },
    });

    expect(control).toMatchObject({
      repairedGameIds: ['final-missing-cpu-roster'],
      repairedGames: 1,
    });
    const gameResultWrite = tx.set.mock.calls.find(([ref]: any[]) => ref === gameResultRef);
    expect(gameResultWrite?.[1]).toMatchObject({
      game: expect.objectContaining({
        boxScore: expect.objectContaining({
          home: expect.objectContaining({
            points: 108,
            players: expect.arrayContaining([
              expect.objectContaining({ name: expect.stringContaining('PHI CPU') }),
            ]),
          }),
          away: expect.objectContaining({
            points: 103,
            players: expect.arrayContaining([
              expect.objectContaining({ name: expect.stringContaining('SAS CPU') }),
            ]),
          }),
        }),
      }),
    });
  });

  it('surfaces unexpected simulate transaction failures with the original message', async () => {
    class TestHttpsError extends Error {
      code: string;

      constructor(code: string, message: string) {
        super(message);
        this.code = code;
      }
    }
    const handler = createSimulateScheduledGameHandler({
      getFirestore: () => ({
        collection: () => ({ doc: () => ({}) }),
        runTransaction: async () => {
          throw new Error('Firestore rejected nested array payload');
        },
      }),
      FieldValue: { arrayUnion: (value: any) => value },
      now: () => 12_000,
      HttpsError: TestHttpsError,
    });

    await expect(handler({
      auth: { uid: 'gm-1' },
      data: { leagueId: 'league-1', gameId: 'game-1', competition: 'regular' },
    })).rejects.toMatchObject({
      code: 'internal',
      message: 'Firestore rejected nested array payload',
    });
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
      postgameStory: { headline: 'Old result', summary: 'Old recap' },
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
    expect(result.postgameStory).toBeUndefined();
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

  it('turns reported exact NBA final scores into full stored result packages', () => {
    const game = seedAvailableGame();
    const result = finalScoreGameResult({
      game,
      uid: game.homeGmId,
      nowMs: 9_000,
      homeScore: 104,
      awayScore: 101,
      homeTeam: seedRoster('Home', 82),
      awayTeam: seedRoster('Away', 76),
    });

    expect(result.game).toMatchObject({
      status: 'final',
      homeScore: 104,
      awayScore: 101,
      winnerTeamId: game.homeTeamId,
      resultSource: 'manual',
      resultDetailsStorage: 'gameResults',
    });
    expect(result.game.boxScore.home.players.length).toBeGreaterThanOrEqual(5);
    expect(result.game.boxScore.away.players.length).toBeGreaterThanOrEqual(5);
    expect(result.game.boxScore.home.points).toBe(104);
    expect(result.game.boxScore.away.points).toBe(101);
    expect(result.game.boxScore.home.players.reduce((sum: number, player: any) => sum + Number(player.points || 0), 0)).toBe(104);
    expect(result.game.boxScore.away.players.reduce((sum: number, player: any) => sum + Number(player.points || 0), 0)).toBe(101);
    expect(result.game.liveTimeline.events.length).toBeGreaterThan(0);
    expect(result.game.postgameStory).toMatchObject({
      headline: expect.any(String),
      summary: expect.any(String),
      topPerformers: expect.any(Array),
    });
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
    expect(result.game.postgameStory).toMatchObject({
      headline: expect.any(String),
      summary: expect.stringContaining('points'),
      topPerformers: expect.any(Array),
    });
  });

  it('generates CPU box score players when a winner outcome has missing roster data', () => {
    const game = seedAvailableGame({
      homeTeamId: 'PHI_CURRENT',
      awayTeamId: 'SAS_CURRENT',
    });

    const result = finalScoreGameResult({
      game,
      uid: game.homeGmId,
      nowMs: 9_500,
      winnerTeamId: game.homeTeamId,
      homeTeam: undefined,
      awayTeam: {},
    });

    expect(result.game).toMatchObject({
      status: 'final',
      winnerTeamId: game.homeTeamId,
      resultSource: 'manual_winner',
    });
    expect(result.game.boxScore.home.players).toHaveLength(8);
    expect(result.game.boxScore.away.players).toHaveLength(8);
    expect(result.game.boxScore.home.points).toBe(result.game.homeScore);
    expect(result.game.boxScore.away.points).toBe(result.game.awayScore);
  });

  it('respects winner-only outcomes for NFL and MLB generated results', () => {
    const nflGame = seedAvailableGame({ sport: 'madden', homeTeamId: 'KC', awayTeamId: 'LV' });
    const nflResult = finalScoreGameResult({
      game: nflGame,
      uid: nflGame.homeGmId,
      nowMs: 9_500,
      winnerTeamId: nflGame.awayTeamId,
      homeTeam: seedNflRoster('Home', 92),
      awayTeam: seedNflRoster('Away', 70),
    });

    expect(nflResult.game.winnerTeamId).toBe(nflGame.awayTeamId);
    expect(nflResult.game.awayScore).toBeGreaterThan(nflResult.game.homeScore);
    expect(nflResult.game.liveTimeline.sport).toBe('madden');

    const mlbGame = seedAvailableGame({ sport: 'mlb', homeTeamId: 'LAD', awayTeamId: 'SF' });
    const mlbResult = finalScoreGameResult({
      game: mlbGame,
      uid: mlbGame.homeGmId,
      nowMs: 9_700,
      winnerTeamId: mlbGame.awayTeamId,
      homeTeam: seedMlbRoster('Home', 90),
      awayTeam: seedMlbRoster('Away', 72),
    });

    expect(mlbResult.game.winnerTeamId).toBe(mlbGame.awayTeamId);
    expect(mlbResult.game.awayScore).toBeGreaterThan(mlbResult.game.homeScore);
    expect(mlbResult.game.liveTimeline.sport).toBe('mlb');
    expect(nflResult.game.liveMode).toMatchObject({ status: 'ready' });
    expect(mlbResult.game.liveMode).toMatchObject({ status: 'ready' });
    expect(nflResult.game.postgameStory).toMatchObject({
      summary: expect.stringContaining('beat'),
      topPerformers: expect.any(Array),
    });
    expect(mlbResult.game.postgameStory).toMatchObject({
      summary: expect.stringContaining('beat'),
      topPerformers: expect.any(Array),
    });
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

  it('adds football and baseball box score production to roster season stats', () => {
    expect(teamPersistencePayload({
      state: {
        fatigue: 1,
        fatigueSequence: 1,
        minorInjuryCount: 0,
        severeInjuryCount: 0,
        injuries: [],
      },
      team: {
        players: [
          { player_id: 'qb-1', full_name: 'QB One', seasonStats: { games: 2, passingYards: 410 } },
        ],
      },
      teamBoxScore: {
        players: [
          { playerId: 'qb-1', name: 'QB One', passingYards: 265, passingTouchdowns: 2, interceptions: 1 },
        ],
      },
    }).players[0].seasonStats).toMatchObject({
      games: 3,
      passingYards: 675,
      passingTouchdowns: 2,
      interceptions: 1,
    });

    expect(teamPersistencePayload({
      state: {
        fatigue: 1,
        fatigueSequence: 1,
        minorInjuryCount: 0,
        severeInjuryCount: 0,
        injuries: [],
      },
      team: {
        players: [
          { player_id: 'bat-1', full_name: 'Bat One', seasonStats: { games: 4, hits: 5 } },
        ],
      },
      teamBoxScore: {
        players: [
          { playerId: 'bat-1', name: 'Bat One', atBats: 4, hits: 2, runs: 1, rbi: 3, homeRuns: 1 },
        ],
      },
    }).players[0].seasonStats).toMatchObject({
      games: 5,
      atBats: 4,
      hits: 7,
      runs: 1,
      rbi: 3,
      homeRuns: 1,
    });
  });

  it('does not emit undefined fields in simulated game payloads written to Firestore', () => {
    const cases = [
      {
        game: seedAvailableGame({ sport: 'nba', homeTeamId: 'NYK', awayTeamId: 'MEM' }),
        homeTeam: seedRoster('knicks'),
        awayTeam: seedRoster('grizzlies'),
      },
      {
        game: seedAvailableGame({ sport: 'madden', homeTeamId: 'NYG', awayTeamId: 'DAL' }),
        homeTeam: seedNflRoster('giants'),
        awayTeam: seedNflRoster('cowboys'),
      },
      {
        game: seedAvailableGame({ sport: 'mlb', homeTeamId: 'NYY', awayTeamId: 'BOS' }),
        homeTeam: seedMlbRoster('yankees'),
        awayTeam: seedMlbRoster('red-sox'),
      },
    ];

    cases.forEach(({ game, homeTeam, awayTeam }, index) => {
      const result = simulateScheduledGameResult({
        game,
        uid: game.homeGmId,
        nowMs: 20_000 + index,
        homeTeam,
        awayTeam,
      });

      expect(undefinedPaths(result.game, 'game')).toEqual([]);
      expect(undefinedPaths(result.teamStates, 'teamStates')).toEqual([]);
    });
  });

  it('removes undefined fields from roster persistence payloads before Firestore writes', () => {
    const payload = teamPersistencePayload({
      state: {
        fatigue: undefined,
        fatigueSequence: 2,
        minorInjuryCount: undefined,
        severeInjuryCount: 0,
        injuries: [{ id: 'injury-1', note: undefined }],
      },
      team: {
        players: [
          {
            player_id: 'nyk-1',
            full_name: 'Dirty Player',
            nickname: undefined,
            hidden: { shooting: 80, defense: undefined },
            seasonStats: { games: 4, points: undefined },
          },
        ],
      },
      teamBoxScore: {
        players: [
          { playerId: 'nyk-1', name: 'Dirty Player', points: 18, rebounds: 7, assists: 3 },
        ],
      },
    });

    expect(undefinedPaths(payload, 'payload')).toEqual([]);
    expect(payload.players[0]).toMatchObject({
      player_id: 'nyk-1',
      full_name: 'Dirty Player',
      hidden: { shooting: 80 },
      seasonStats: {
        games: 5,
        points: 18,
        rebounds: 7,
        assists: 3,
      },
    });
  });

  it('removes undefined values inside arrays before Firestore writes', () => {
    const cleaned = cleanFirestoreData({
      games: [
        seedAvailableGame({ id: 'clean-game' }),
        undefined,
        { id: 'dirty-game', status: 'scheduled', notes: [undefined, 'ready'] },
      ],
      nested: {
        values: [1, undefined, { keep: true, drop: undefined }],
      },
    });

    expect(undefinedPaths(cleaned, 'cleaned')).toEqual([]);
    expect(cleaned.games).toHaveLength(2);
    expect(cleaned.games[1]).toMatchObject({ id: 'dirty-game', notes: ['ready'] });
    expect(cleaned.nested.values).toEqual([1, { keep: true }]);
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
      homeFirstHalfPresetId: 'pick_and_roll',
      homeSecondHalfPresetId: 'zone_23',
      awayFirstHalfPresetId: 'five_out',
      awaySecondHalfPresetId: 'zone_23',
    });
  });

  it('tracks quarter coaching impact for simulated NBA games', () => {
    const game = gameWithCoachingSnapshots({
      game: seedAvailableGame(),
      homeSnapshot: { name: '5-Out', offense: 'pace_and_space', defense: 'switch_heavy', presetId: 'five_out' },
      homeSecondHalfSnapshot: { name: 'Star Isolation', offense: 'isolation', defense: 'drop', presetId: 'star_isolation' },
      awaySnapshot: { name: 'Motion Offense', offense: 'balanced', defense: 'drop', presetId: 'motion_offense' },
      awaySecondHalfSnapshot: { name: 'Transition Pace', offense: 'pace_and_space', defense: 'switch_heavy', presetId: 'transition_pace' },
      homeQuarterSnapshots: [
        {
          offensePresetSnapshot: { name: '5-Out', offense: 'pace_and_space', defense: 'switch_heavy', presetId: 'five_out' },
          defensePresetSnapshot: { name: 'Protect Paint', offense: 'balanced', defense: 'protect_paint', presetId: 'protect_paint' },
        },
        {
          offensePresetSnapshot: { name: 'Pick and Roll', offense: 'pick_and_roll', defense: 'drop', presetId: 'pick_and_roll' },
          defensePresetSnapshot: { name: '3-2 Zone', offense: 'balanced', defense: 'zone', presetId: 'zone_32' },
        },
        {
          offensePresetSnapshot: { name: 'Motion Offense', offense: 'balanced', defense: 'drop', presetId: 'motion_offense' },
          defensePresetSnapshot: { name: 'Switch Everything', offense: 'balanced', defense: 'switch_heavy', presetId: 'switch_everything' },
        },
        {
          offensePresetSnapshot: { name: 'Star Isolation', offense: 'isolation', defense: 'drop', presetId: 'star_isolation' },
          defensePresetSnapshot: { name: 'Double Star', offense: 'balanced', defense: 'pressure', presetId: 'double_star' },
        },
      ],
      awayQuarterSnapshots: [
        {
          offensePresetSnapshot: { name: 'Motion Offense', offense: 'balanced', defense: 'drop', presetId: 'motion_offense' },
          defensePresetSnapshot: { name: '2-3 Zone', offense: 'balanced', defense: 'zone', presetId: 'zone_23' },
        },
        {
          offensePresetSnapshot: { name: 'Post / Inside', offense: 'post_heavy', defense: 'protect_paint', presetId: 'post_inside' },
          defensePresetSnapshot: { name: 'Protect Paint', offense: 'balanced', defense: 'protect_paint', presetId: 'protect_paint' },
        },
        {
          offensePresetSnapshot: { name: 'Transition Pace', offense: 'pace_and_space', defense: 'switch_heavy', presetId: 'transition_pace' },
          defensePresetSnapshot: { name: 'Half Court Press', offense: 'balanced', defense: 'pressure', presetId: 'half_court_press' },
        },
        {
          offensePresetSnapshot: { name: '5-Out', offense: 'pace_and_space', defense: 'switch_heavy', presetId: 'five_out' },
          defensePresetSnapshot: { name: 'Switch Everything', offense: 'balanced', defense: 'switch_heavy', presetId: 'switch_everything' },
        },
      ],
    });

    const result = simulateScheduledGame({
      game,
      uid: game.homeGmId,
      nowMs: 5_000,
      homeTeam: seedRoster('Home', 82),
      awayTeam: seedRoster('Away', 82),
    });

    expect(result.coachingImpact.homeQuarterPresetIds).toEqual([
      { quarter: 1, offensePresetId: 'five_out', defensePresetId: 'protect_paint' },
      { quarter: 2, offensePresetId: 'pick_and_roll', defensePresetId: 'zone_32' },
      { quarter: 3, offensePresetId: 'motion_offense', defensePresetId: 'switch_everything' },
      { quarter: 4, offensePresetId: 'star_isolation', defensePresetId: 'double_star' },
    ]);
    expect(result.homeQuarterCoachingPresetIds).toEqual([
      { quarter: 1, offensePresetId: 'five_out', defensePresetId: 'protect_paint' },
      { quarter: 2, offensePresetId: 'pick_and_roll', defensePresetId: 'zone_32' },
      { quarter: 3, offensePresetId: 'motion_offense', defensePresetId: 'switch_everything' },
      { quarter: 4, offensePresetId: 'star_isolation', defensePresetId: 'double_star' },
    ]);
    expect(directNestedArrayPaths(cleanFirestoreData(updatePayloadForCompetition('regular', [result])), 'scheduleUpdate')).toEqual([]);
    expect(result.liveTimeline.gameplan.quarters[2]).toMatchObject({
      period: 3,
      homeOffenseId: 'motion_offense',
      homeDefenseId: 'switch_everything',
      awayOffenseId: 'transition_pace',
      awayDefenseId: 'half_court_press',
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

  it('blocks commissioner game reset when the league is pitch demo locked', async () => {
    const finalGame = seedAvailableGame({ status: 'final', homeScore: 101, awayScore: 99 });
    const leagueRef = { collection: vi.fn() };
    const userRef = {};
    const scheduleRef = {};
    const tx = {
      get: vi.fn(async ref => {
        if (ref === leagueRef) {
          return { exists: true, data: () => ({ commissionerId: 'commissioner', scheduleId: '2026', pitchDemoLocked: true }) };
        }
        if (ref === userRef) return { exists: true, data: () => ({}) };
        if (ref === scheduleRef) return { exists: true, data: () => ({ games: [finalGame] }) };
        return { exists: false, data: () => ({}) };
      }),
      update: vi.fn(),
    };
    leagueRef.collection = vi.fn((name: string) => {
      if (name === 'schedules') return { doc: vi.fn(() => scheduleRef) };
      return { doc: vi.fn() };
    });
    const db = {
      collection: vi.fn((name: string) => ({
        doc: vi.fn(() => (name === 'users' ? userRef : leagueRef)),
      })),
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

    await expect(handler({
      auth: { uid: 'commissioner' },
      data: { leagueId: 'league-1', gameId: finalGame.id },
    })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('blocks commissioner game reset for pitch viewer accounts', async () => {
    const finalGame = seedAvailableGame({ status: 'final', homeScore: 101, awayScore: 99 });
    const leagueRef = { collection: vi.fn() };
    const userRef = {};
    const scheduleRef = {};
    const tx = {
      get: vi.fn(async ref => {
        if (ref === leagueRef) return { exists: true, data: () => ({ commissionerId: 'commissioner', scheduleId: '2026' }) };
        if (ref === userRef) return { exists: true, data: () => ({ pitchAccessRole: 'viewer' }) };
        if (ref === scheduleRef) return { exists: true, data: () => ({ games: [finalGame] }) };
        return { exists: false, data: () => ({}) };
      }),
      update: vi.fn(),
    };
    leagueRef.collection = vi.fn((name: string) => {
      if (name === 'schedules') return { doc: vi.fn(() => scheduleRef) };
      return { doc: vi.fn() };
    });
    const db = {
      collection: vi.fn((name: string) => ({
        doc: vi.fn(() => (name === 'users' ? userRef : leagueRef)),
      })),
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

    await expect(handler({
      auth: { uid: 'commissioner' },
      data: { leagueId: 'league-1', gameId: finalGame.id },
    })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('selects NBA Cup games and mirrors regular-season Cup updates into the regular schedule', () => {
    const regularGame = seedAvailableGame({ id: 'regular-1' });
    const cupGame = seedAvailableGame({ id: 'cup-1', competition: 'nbaCup', stage: 'group', groupId: 'Group A', countsForRegularSeason: true });
    const finalCupGame = seedAvailableGame({ id: 'cup-final', competition: 'nbaCup', stage: 'final' });
    const updatedCupGame = { ...cupGame, status: 'final', homeScore: 110, awayScore: 104 };
    const regularUpdatedCupGame = { ...cupGame, status: 'final', homeScore: 114, awayScore: 111 };
    const schedule = {
      games: [regularGame, cupGame],
      nbaCup: { games: [cupGame, finalCupGame] },
    };

    expect(scheduleCompetition({ competition: 'nbaCup' })).toBe('nbaCup');
    expect(scheduleCompetition({ competition: 'regular' })).toBe('regular');
    expect(gamesForCompetition(schedule, 'nbaCup')).toEqual([cupGame, finalCupGame]);
    expect(gamesForCompetition(schedule, 'regular')).toEqual([regularGame, cupGame]);
    expect(updatePayloadForCompetition('nbaCup', [updatedCupGame, finalCupGame], schedule)).toEqual({
      'nbaCup.games': [expect.objectContaining({ ...updatedCupGame, resultDetailsStorage: 'gameResults' }), finalCupGame],
      games: [regularGame, expect.objectContaining({ ...updatedCupGame, resultDetailsStorage: 'gameResults' })],
    });
    expect(updatePayloadForCompetition('regular', [regularGame, regularUpdatedCupGame], schedule)).toEqual({
      games: [regularGame, expect.objectContaining({ ...regularUpdatedCupGame, resultDetailsStorage: 'gameResults' })],
      'nbaCup.games': [expect.objectContaining({ ...regularUpdatedCupGame, resultDetailsStorage: 'gameResults' }), finalCupGame],
    });
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
