import { describe, expect, it } from 'vitest';
import {
  awardUpgradePoints,
  abilityGradesFromStats,
  canUpgradePlayerThisSeason,
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

    expect(grades.shooting).toBe('A');
    expect(grades.playmaking).toBe('A-');
    expect(grades.rebounding).toBe('A-');
    expect(grades.defense).toBe('A-');
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
