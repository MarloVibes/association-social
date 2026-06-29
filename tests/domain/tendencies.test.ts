import { describe, expect, it } from 'vitest';

import { buildPlayerTendencies } from '../../domain/nba/tendencies';

describe('player tendencies', () => {
  it('recognizes a high-usage rim-pressure guard', () => {
    const tendencies = buildPlayerTendencies({
      position: 'PG',
      pointsPerGame: 25,
      assistsPerGame: 7.7,
      reboundsPerGame: 4.1,
      stealsPerGame: 1,
      blocksPerGame: 0.6,
      freeThrowAttemptsPerGame: 6.9,
      threePointAttemptsPerGame: 4.8,
      usagePct: 32.2,
      assistPct: 38.7,
      turnoverPct: 13.1,
      rimAttemptRate: 0.38,
      driveRate: 0.42,
      transitionRate: 0.24,
      dunkRate: 0.08,
      scoutingTags: ['elite_rim_pressure', 'elite_burst', 'high_usage_creator'],
    });

    expect(tendencies.paintAttack).toBeGreaterThanOrEqual(90);
    expect(tendencies.rimFinishFrequency).toBeGreaterThanOrEqual(85);
    expect(tendencies.transitionFrequency).toBeGreaterThanOrEqual(80);
    expect(tendencies.pickAndRollBallHandler).toBeGreaterThanOrEqual(85);
    expect(tendencies.postTouchFrequency).toBeLessThan(55);
  });

  it('separates a spot-up shooter from a paint attacker', () => {
    const tendencies = buildPlayerTendencies({
      position: 'SG',
      pointsPerGame: 12,
      assistsPerGame: 1.5,
      reboundsPerGame: 3,
      stealsPerGame: 0.7,
      blocksPerGame: 0.1,
      freeThrowAttemptsPerGame: 1.2,
      threePointAttemptsPerGame: 6.5,
      usagePct: 16,
      assistPct: 8,
      turnoverPct: 8,
      threePointAttemptRate: 0.68,
      catchAndShootRate: 0.74,
      driveRate: 0.08,
      rimAttemptRate: 0.11,
      scoutingTags: ['spot_up_shooter'],
    });

    expect(tendencies.catchAndShootFrequency).toBeGreaterThanOrEqual(90);
    expect(tendencies.threePointFrequency).toBeGreaterThanOrEqual(85);
    expect(tendencies.paintAttack).toBeLessThan(60);
    expect(tendencies.passFirst).toBeLessThan(55);
  });

  it('recognizes rebounding and post tendencies for true bigs', () => {
    const tendencies = buildPlayerTendencies({
      position: 'C',
      pointsPerGame: 14,
      reboundsPerGame: 12,
      assistsPerGame: 2,
      stealsPerGame: 0.8,
      blocksPerGame: 2.2,
      freeThrowAttemptsPerGame: 5,
      usagePct: 22,
      offensiveReboundPct: 13,
      defensiveReboundPct: 27,
      postTouchRate: 0.34,
      rimAttemptRate: 0.46,
      scoutingTags: ['interior_anchor'],
    });

    expect(tendencies.postTouchFrequency).toBeGreaterThanOrEqual(75);
    expect(tendencies.reboundCrash).toBeGreaterThanOrEqual(90);
    expect(tendencies.pickAndRollRollMan).toBeGreaterThanOrEqual(75);
    expect(tendencies.defensivePlaymaking).toBeGreaterThanOrEqual(80);
  });
});
