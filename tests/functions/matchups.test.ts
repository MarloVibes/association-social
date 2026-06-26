import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  acceptMatchupRequest,
  expireMatchupRequest,
  finalScoreGame,
  finalScoreGameResult,
  gameWithCoachingSnapshots,
  gamesForCompetition,
  requestMatchup,
  resetScheduledGame,
  scheduleCompetition,
  simulateScheduledGame,
  simulateScheduledGameResult,
  teamPersistencePayload,
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

describe('matchup request state helpers', () => {
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
    const result = simulateScheduledGame({ game, uid: game.homeGmId, nowMs: 5_000 });

    expect(result).toMatchObject({
      status: 'final',
      simulationStartedByUid: game.homeGmId,
      finalAtMs: 5_000,
    });
    expect(result.homeScore).not.toBe(result.awayScore);
    expect([game.homeTeamId, game.awayTeamId]).toContain(result.winnerTeamId);
  });

  it('permits immediate CPU matchup simulation', () => {
    const game = seedAvailableGame({
      awayGmId: null,
      awayTeamId: 'cpu-away',
    });
    const result = simulateScheduledGame({ game, uid: game.homeGmId, nowMs: 5_000 });

    expect(result.status).toBe('final');
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
    expect(result.story).toContain(game.homeTeamId);
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
      homeSnapshot: { name: 'Pace and Space', offense: 'pace_and_space', defense: 'switch_heavy' },
      awaySnapshot: { name: 'Grit and Grind', offense: 'post_heavy', defense: 'protect_paint' },
    });

    expect(result).toMatchObject({
      homeCoachingStyle: 'pace_and_space',
      awayCoachingStyle: 'post_heavy',
      homeDefensiveStyle: 'switch_heavy',
      awayDefensiveStyle: 'protect_paint',
      homeCoachingPresetName: 'Pace and Space',
      awayCoachingPresetName: 'Grit and Grind',
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
});
