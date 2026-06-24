import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  acceptMatchupRequest,
  expireMatchupRequest,
  requestMatchup,
  simulateScheduledGame,
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

    expect(result.status).toBe('simulating');
  });

  it('permits immediate CPU matchup simulation', () => {
    const game = seedAvailableGame({
      awayGmId: null,
      awayTeamId: 'cpu-away',
    });
    const result = simulateScheduledGame({ game, uid: game.homeGmId, nowMs: 5_000 });

    expect(result.status).toBe('simulating');
  });
});
