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
