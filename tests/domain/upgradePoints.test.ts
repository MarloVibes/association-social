import { describe, expect, it } from 'vitest';
import {
  awardUpgradePoints,
  abilityGradesFromStats,
  canUpgradePlayerThisSeason,
  detailedUpgradeGradesFromScoutingGrades,
  upgradeGradesFromScoutingGrades,
  UPGRADE_GRADE_OPTIONS,
  seasonUpgradeGrants,
  nextGrade,
  spendUpgradePoint,
  teamLotteryBoostPoints,
} from '@/domain/nba/upgradePoints';

describe('NBA upgrade points', () => {
  it('grants team points from championship results and accolades', () => {
    expect(awardUpgradePoints({
      championships: 1,
      finalsRunnerUp: 1,
      awards: { mvp: 1, dpoy: 1, all_star: 2 },
    })).toBe(12);
  });

  it('gives bottom five teams from each conference lottery boost points', () => {
    const east = Array.from({ length: 15 }, (_, index) => ({ teamId: `E${index}`, conference: 'East', wins: 15 - index }));
    const west = Array.from({ length: 15 }, (_, index) => ({ teamId: `W${index}`, conference: 'West', wins: 15 - index }));
    const boosts = teamLotteryBoostPoints([...east, ...west]);

    expect(boosts.get('E14')).toBe(3);
    expect(boosts.get('E10')).toBe(3);
    expect(boosts.get('E9')).toBeUndefined();
    expect(boosts.get('W14')).toBe(3);
  });

  it('moves exactly one grade per point and reserves S for superstar labels', () => {
    expect(nextGrade('B')).toBe('B+');
    expect(nextGrade('A+', 'STAR')).toBe('A+');
    expect(nextGrade('A+', 'SUPERSTAR')).toBe('S');
    expect(nextGrade('S', 'LEGEND')).toBe('S');
  });

  it('limits star and above players to one upgrade per season', () => {
    expect(canUpgradePlayerThisSeason({ label: 'STAR', upgradesUsedThisSeason: 0 })).toBe(true);
    expect(canUpgradePlayerThisSeason({ label: 'STAR', upgradesUsedThisSeason: 1 })).toBe(false);
    expect(canUpgradePlayerThisSeason({ label: 'ROLE PLAYER', upgradesUsedThisSeason: 3 })).toBe(true);
  });

  it('spends one team point on one eligible grade step', () => {
    const result = spendUpgradePoint({
      teamPoints: 2,
      playerLabel: 'ROLE PLAYER',
      upgradesUsedThisSeason: 0,
      ability: 'shooting',
      grades: { shooting: 'C+' },
    });

    expect(result).toEqual({
      valid: true,
      errors: [],
      teamPoints: 1,
      upgradesUsedThisSeason: 1,
      grades: { shooting: 'B-' },
    });
  });

  it('derives ability grades from existing player stats when no grade sheet exists yet', () => {
    const grades = abilityGradesFromStats({
      ppg: 25,
      apg: 8,
      rpg: 10,
      spg: 2,
      bpg: 1,
      fg3_pct: 0.4,
    });

    expect(grades.shooting).toBe('A+');
    expect(grades.playmaking).toBe('B+');
    expect(grades.rebounding).toBe('B+');
    expect(grades.defense).toBe('B+');
  });

  it('derives upgrade buckets from detailed scouting grades without letting one inflated skill dominate', () => {
    const grades = upgradeGradesFromScoutingGrades({
      closeShot: 'A',
      midRange: 'C',
      threePoint: 'A+',
      freeThrow: 'B',
      dunking: 'C+',
      shotIq: 'C',
      passing: 'C',
      ballHandle: 'C',
      offenseIq: 'C+',
      clutch: 'C',
      perimeterDefense: 'A',
      postDefense: 'B+',
      blocking: 'A-',
      steals: 'B+',
      defenseIq: 'A',
      helpDefense: 'A-',
      speed: 'B',
      acceleration: 'B',
      strength: 'A',
      rebounding: 'A+',
      postOffense: 'C',
      stamina: 'B+',
      potential: 'B',
      role: 'B',
      impact: 'B+',
      overall: 'B',
      tradeValue: 'B',
    });

    expect(grades.shooting).toMatch(/^B/);
    expect(grades.defense).toBe('A-');
    expect(grades.rebounding).toMatch(/^A/);
  });

  it('exposes detailed player-card grades as upgrade options', () => {
    const grades = detailedUpgradeGradesFromScoutingGrades({
      closeShot: 'A',
      midRange: 'B',
      threePoint: 'B-',
      freeThrow: 'B+',
      dunking: 'A+',
      shotIq: 'A-',
      passing: 'B+',
      ballHandle: 'B',
      offenseIq: 'B',
      clutch: 'C+',
      perimeterDefense: 'B-',
      postDefense: 'C',
      blocking: 'D+',
      steals: 'B',
      defenseIq: 'B-',
      helpDefense: 'B',
      speed: 'A',
      acceleration: 'A-',
      strength: 'B+',
      rebounding: 'C+',
      postOffense: 'C',
      stamina: 'B+',
      potential: 'A+',
    });

    expect(Object.keys(grades).slice(0, 6)).toEqual([
      'closeShot',
      'midRange',
      'threePoint',
      'freeThrow',
      'dunking',
      'shotIq',
    ]);
    expect(grades.threePoint).toBe('B-');
    expect(grades.dunking).toBe('A+');
    expect(grades.perimeterDefense).toBe('B-');
    expect(grades.postOffense).toBe('C');
    expect(grades.potential).toBe('A+');
    expect(UPGRADE_GRADE_OPTIONS.find(option => option.key === 'threePoint')).toMatchObject({
      label: '3PT Shot',
      category: 'Scoring',
    });
  });

  it('combines award points and lottery boosts into team grants', () => {
    const standings = [
      ...Array.from({ length: 6 }, (_, index) => ({ teamId: `E${index}`, conference: 'East', wins: 6 - index })),
      ...Array.from({ length: 6 }, (_, index) => ({ teamId: `W${index}`, conference: 'West', wins: 6 - index })),
    ];
    const grants = seasonUpgradeGrants({
      standings,
      awardLedger: {
        E5: { championships: 1, awards: { mvp: 1 } },
        W5: { finalsRunnerUp: 1 },
      },
    });

    expect(grants.find(grant => grant.teamId === 'E5')).toMatchObject({
      awardPoints: 6,
      lotteryBoostPoints: 3,
      totalPoints: 9,
    });
    expect(grants.find(grant => grant.teamId === 'W5')).toMatchObject({
      awardPoints: 3,
      lotteryBoostPoints: 3,
      totalPoints: 6,
    });
    expect(grants.find(grant => grant.teamId === 'E0')).toBeUndefined();
  });
});
