import { describe, expect, it } from 'vitest';

import { ATTRIBUTE_KEYS, ATTRIBUTE_UPGRADE_CATEGORIES, buildAttributeModel } from '../../domain/nba/attributeModel';

const leagueContext = {
  season: 2011,
  pace: 92,
  leagueThreePointPct: 0.358,
  leagueFreeThrowPct: 0.763,
};

describe('expanded attribute model', () => {
  it('includes flexible hidden attributes for every upgradeable skill', () => {
    expect(ATTRIBUTE_KEYS).toEqual(expect.arrayContaining([
      'drivingLayup',
      'drivingDunk',
      'standingDunk',
      'drawFoul',
      'hands',
      'shotConsistency',
      'passIq',
      'passVision',
      'speedWithBall',
      'lateralQuickness',
      'vertical',
      'agility',
      'hustle',
      'offensiveRebound',
      'defensiveRebound',
      'durability',
    ]));
  });

  it('assigns every hidden attribute to at least one upgrade category', () => {
    const covered = new Set(Object.values(ATTRIBUTE_UPGRADE_CATEGORIES).flat());
    for (const key of ATTRIBUTE_KEYS) {
      expect(covered.has(key)).toBe(true);
    }
  });

  it('keeps 2011 Derrick Rose elite in rim pressure and development without inflating three point shooting', () => {
    const rose = buildAttributeModel({
      source: {
        player_id: 'rose-2011',
        full_name: 'Derrick Rose',
        team: 'CHI',
        position: 'PG',
        age: 22,
        games: 81,
        minutesPerGame: 37.4,
        pointsPerGame: 25,
        reboundsPerGame: 4.1,
        assistsPerGame: 7.7,
        stealsPerGame: 1,
        blocksPerGame: 0.6,
        fieldGoalPct: 0.445,
        threePointPct: 0.332,
        threePointAttemptsPerGame: 4.8,
        freeThrowPct: 0.858,
        freeThrowAttemptsPerGame: 6.9,
        usagePct: 32.2,
        assistPct: 38.7,
        turnoverPct: 13.1,
        winShares: 13.1,
        defensiveWinShares: 4.8,
        draftPick: 1,
        rimAttemptRate: 0.38,
        driveRate: 0.42,
        transitionRate: 0.24,
        awardWeight: 7,
        scoutingTags: ['mvp', 'elite_rim_pressure', 'elite_burst', 'high_usage_creator'],
      },
      leagueContext,
    });

    expect(rose.drivingLayup).toBeGreaterThanOrEqual(92);
    expect(rose.speedWithBall).toBeGreaterThanOrEqual(95);
    expect(rose.potential).toBeGreaterThanOrEqual(95);
    expect(rose.threePoint).toBeLessThan(85);
    expect(rose.perimeterDefense).toBeLessThanOrEqual(74);
    expect(rose.defenseIq).toBeLessThanOrEqual(74);
  });

  it('does not turn low-volume non-shooting centers into good three point shooters', () => {
    const center = buildAttributeModel({
      source: {
        player_id: 'no-three-center',
        full_name: 'No Three Center',
        team: 'SIM',
        position: 'C',
        age: 27,
        games: 75,
        minutesPerGame: 32,
        pointsPerGame: 13,
        reboundsPerGame: 12,
        assistsPerGame: 1.5,
        stealsPerGame: 0.7,
        blocksPerGame: 2.2,
        fieldGoalPct: 0.66,
        threePointPct: 0.36,
        threePointAttemptsPerGame: 0.2,
        freeThrowPct: 0.62,
        freeThrowAttemptsPerGame: 5,
        usagePct: 17,
        assistPct: 8,
        turnoverPct: 14,
        defensiveWinShares: 4.5,
        winShares: 10,
        scoutingTags: ['defensive_anchor', 'rim_protector', 'elite_rebounder'],
      },
      leagueContext,
    });

    expect(center.threePoint).toBeLessThan(60);
    expect(center.postDefense).toBeGreaterThanOrEqual(89);
    expect(center.rebounding).toBeGreaterThanOrEqual(89);
  });

  it('does not treat team defensive win shares as individual guard stopper proof', () => {
    const guard = buildAttributeModel({
      source: {
        player_id: 'team-defense-guard',
        full_name: 'Team Defense Guard',
        team: 'SIM',
        position: 'PG',
        age: 24,
        games: 80,
        minutesPerGame: 38,
        pointsPerGame: 23,
        reboundsPerGame: 4,
        assistsPerGame: 8,
        stealsPerGame: 1,
        blocksPerGame: 0.4,
        fieldGoalPct: 0.45,
        threePointPct: 0.33,
        threePointAttemptsPerGame: 4,
        freeThrowPct: 0.84,
        freeThrowAttemptsPerGame: 6,
        usagePct: 31,
        assistPct: 38,
        turnoverPct: 13,
        defensiveWinShares: 5,
        winShares: 12,
        scoutingTags: ['high_usage_creator', 'elite_rim_pressure'],
      },
      leagueContext,
    });

    expect(guard.perimeterDefense).toBeLessThanOrEqual(74);
    expect(guard.defenseIq).toBeLessThanOrEqual(74);
  });

  it('rewards actual rim pressure and dunk frequency instead of only generic efficiency', () => {
    const rimPressure = buildAttributeModel({
      source: {
        player_id: 'explosive-wing',
        full_name: 'Explosive Wing',
        team: 'SIM',
        position: 'SF',
        age: 24,
        games: 75,
        minutesPerGame: 36,
        pointsPerGame: 25,
        reboundsPerGame: 6,
        assistsPerGame: 5,
        stealsPerGame: 1.3,
        blocksPerGame: 0.6,
        fieldGoalPct: 0.49,
        trueShootingPct: 0.59,
        effectiveFieldGoalPct: 0.54,
        threePointPct: 0.35,
        threePointAttemptsPerGame: 5,
        freeThrowPct: 0.78,
        freeThrowAttemptsPerGame: 7,
        usagePct: 31,
        assistPct: 24,
        turnoverPct: 12,
        defensiveWinShares: 2.4,
        winShares: 11,
        rimAttemptRate: 0.43,
        dunkRate: 0.14,
        driveRate: 0.42,
        transitionRate: 0.25,
        scoutingTags: ['elite_rim_pressure', 'elite_burst', 'high_usage_creator'],
      },
      leagueContext,
    });

    expect(rimPressure.dunking).toBeGreaterThanOrEqual(89);
    expect(rimPressure.drivingDunk).toBeGreaterThanOrEqual(89);
  });

  it('uses true shooting and effective field goal data to separate efficient scorers', () => {
    const common = {
      player_id: 'wing-scorer',
      full_name: 'Wing Scorer',
      team: 'SIM',
      position: 'SF',
      age: 25,
      games: 72,
      minutesPerGame: 34,
      pointsPerGame: 21,
      reboundsPerGame: 6,
      assistsPerGame: 3,
      stealsPerGame: 1,
      blocksPerGame: 0.5,
      fieldGoalPct: 0.45,
      threePointPct: 0.36,
      threePointAttemptsPerGame: 5,
      freeThrowPct: 0.78,
      freeThrowAttemptsPerGame: 4,
      usagePct: 26,
      assistPct: 16,
      turnoverPct: 12,
      defensiveWinShares: 2,
      winShares: 8,
      draftPick: 8,
    };

    const efficient = buildAttributeModel({
      source: {
        ...common,
        player_id: 'efficient-wing',
        trueShootingPct: 0.61,
        effectiveFieldGoalPct: 0.56,
      },
      leagueContext,
    });
    const inefficient = buildAttributeModel({
      source: {
        ...common,
        player_id: 'inefficient-wing',
        trueShootingPct: 0.51,
        effectiveFieldGoalPct: 0.47,
      },
      leagueContext,
    });

    expect(efficient.shotIq).toBeGreaterThan(inefficient.shotIq);
    expect(efficient.shotConsistency).toBeGreaterThan(inefficient.shotConsistency);
    expect(efficient.offenseIq).toBeGreaterThan(inefficient.offenseIq);
  });
});
