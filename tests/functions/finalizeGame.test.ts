import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  applyInjuryAction,
  finalizeGame,
} = require('../../functions/franchise/finalizeGame.js');

function scheduledGame(overrides: Record<string, unknown> = {}) {
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

describe('NBA game finalization', () => {
  it('rejects duplicate game finalization', () => {
    const game = scheduledGame({
      status: 'final',
      homeScore: 101,
      awayScore: 99,
      finalAtMs: 1_000,
      completionMarkerId: 'game-1:final',
    });

    expect(() => finalizeGame({
      game,
      uid: 'home-gm',
      nowMs: 2_000,
      homeScore: 102,
      awayScore: 98,
      source: 'manual',
    })).toThrow(expect.objectContaining({ code: 'already-exists' }));
  });

  it('stamps one completion marker and advances both team fatigue sequences', () => {
    const result = finalizeGame({
      game: scheduledGame(),
      uid: 'home-gm',
      nowMs: 9_000,
      homeScore: 104,
      awayScore: 101,
      source: 'manual',
      teamStates: {
        home: { fatigue: 2, fatigueSequence: 3, minorInjuryCount: 6, severeInjuryCount: 0 },
        away: { fatigue: 8, fatigueSequence: 7, minorInjuryCount: 0, severeInjuryCount: 0 },
      },
    });

    expect(result.completionMarkerId).toBe('game-1:final');
    expect(result.game).toMatchObject({
      status: 'final',
      winnerTeamId: 'home',
      loserTeamId: 'away',
      completionMarkerId: 'game-1:final',
      finalScoreSubmittedByUid: 'home-gm',
    });
    expect(result.teamStates.home.fatigueSequence).toBe(4);
    expect(result.teamStates.away.fatigueSequence).toBe(8);
    expect(result.game.fatigue.home.sequence).toBe(4);
    expect(result.game.fatigue.away.sequence).toBe(8);
    expect(result.game.injuries.home).toEqual([]);
  });

  it('applies commissioner injury actions to team injury lists', () => {
    const added = applyInjuryAction({
      injuries: [],
      action: {
        type: 'add',
        injury: {
          id: 'manual-1',
          playerId: 'cp3',
          playerName: 'Chris Paul',
          severity: 'minor',
          gamesRemaining: 2,
          label: 'Ankle soreness',
          recoveryTag: 'day-to-day',
        },
      },
    });
    const updated = applyInjuryAction({
      injuries: added,
      action: { type: 'update', injuryId: 'manual-1', patch: { gamesRemaining: 1 } },
    });
    const removed = applyInjuryAction({
      injuries: updated,
      action: { type: 'remove', injuryId: 'manual-1' },
    });

    expect(updated[0].gamesRemaining).toBe(1);
    expect(removed).toEqual([]);
  });
});
