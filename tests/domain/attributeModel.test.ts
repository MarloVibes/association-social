import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_UPGRADE_CATEGORIES,
  buildAttributeModel,
  gradeFromAttribute,
  skillGradesFromAttributes,
  validateSkillGrades,
  type PublicStatLine,
} from '@/domain/nba/attributeModel';

const leagueContext = {
  season: 2027,
  pace: 100,
  leagueThreePointPct: 0.36,
  leagueFreeThrowPct: 0.78,
};

function source(overrides: Partial<PublicStatLine> = {}): PublicStatLine {
  return {
    player_id: 'p1',
    full_name: 'Test Player',
    team: 'TST',
    position: 'SG',
    age: 25,
    games: 72,
    minutesPerGame: 34,
    pointsPerGame: 18,
    reboundsPerGame: 5,
    assistsPerGame: 4,
    stealsPerGame: 1,
    blocksPerGame: 0.4,
    fieldGoalPct: 0.46,
    threePointPct: 0.39,
    threePointAttemptsPerGame: 5,
    freeThrowPct: 0.82,
    freeThrowAttemptsPerGame: 4,
    usagePct: 24,
    assistPct: 24,
    turnoverPct: 12,
    defensiveWinShares: 2,
    winShares: 6,
    draftPick: 18,
    ...overrides,
  };
}

describe('original basketball attribute model', () => {
  it('uses strict visible grade gates from hidden numeric values', () => {
    expect(gradeFromAttribute(99)).toBe('S');
    expect(gradeFromAttribute(98)).toBe('A+');
    expect(gradeFromAttribute(94)).toBe('A');
    expect(gradeFromAttribute(91)).toBe('A-');
    expect(gradeFromAttribute(88)).toBe('B+');
    expect(gradeFromAttribute(59)).toBe('D');

    const grades = skillGradesFromAttributes({ threePoint: 94, defenseIq: 99 });
    expect(grades.threePoint).toBe('A');
    expect(grades.defenseIq).toBe('S');
  });

  it('rejects requested grades that exceed the hidden attribute gate', () => {
    const warnings = validateSkillGrades(
      { threePoint: 94, passing: 86 },
      { threePoint: 'A+', passing: 'B+' },
    );

    expect(warnings).toEqual([
      'threePoint requested A+ but hidden value 94 only allows A',
    ]);
  });

  it('assigns every flexible attribute to one GM upgrade category', () => {
    const covered = new Map<string, string>();

    for (const [category, attributes] of Object.entries(ATTRIBUTE_UPGRADE_CATEGORIES)) {
      expect(attributes.length).toBeGreaterThan(0);
      for (const attribute of attributes) {
        expect(covered.has(attribute)).toBe(false);
        covered.set(attribute, category);
      }
    }

    expect([...covered.keys()].sort()).toEqual([...ATTRIBUTE_KEYS].sort());
    expect(ATTRIBUTE_UPGRADE_CATEGORIES.Shooting).toEqual(expect.arrayContaining(['midRange', 'threePoint', 'freeThrow', 'shotIq']));
    expect(ATTRIBUTE_UPGRADE_CATEGORIES.Development).toContain('potential');
  });

  it('separates shooter, creator, defender, and interior profiles from public stats', () => {
    const shooter = buildAttributeModel({
      source: source({ threePointPct: 0.43, threePointAttemptsPerGame: 9, freeThrowPct: 0.9, pointsPerGame: 27 }),
      leagueContext,
    });
    const nonShooter = buildAttributeModel({
      source: source({ threePointPct: 0.28, threePointAttemptsPerGame: 1, freeThrowPct: 0.62, pointsPerGame: 8 }),
      leagueContext,
    });
    const creator = buildAttributeModel({
      source: source({ position: 'PG', assistsPerGame: 10, assistPct: 45, turnoverPct: 11, usagePct: 28 }),
      leagueContext,
    });
    const stopper = buildAttributeModel({
      source: source({ position: 'SF', stealsPerGame: 2.1, blocksPerGame: 1, defensiveWinShares: 4.5, minutesPerGame: 36 }),
      leagueContext,
    });
    const big = buildAttributeModel({
      source: source({ position: 'C', reboundsPerGame: 12, blocksPerGame: 2.5, fieldGoalPct: 0.6, freeThrowAttemptsPerGame: 7, pointsPerGame: 20 }),
      leagueContext,
    });

    expect(shooter.threePoint).toBeGreaterThan(nonShooter.threePoint + 18);
    expect(creator.passing).toBeGreaterThan(shooter.passing);
    expect(stopper.perimeterDefense).toBeGreaterThan(shooter.perimeterDefense);
    expect(big.rebounding).toBeGreaterThan(shooter.rebounding);
    expect(big.postDefense).toBeGreaterThan(shooter.postDefense);
  });
});
