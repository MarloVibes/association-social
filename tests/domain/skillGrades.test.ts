import { describe, expect, it } from 'vitest';

import { buildSkillGrades } from '../../domain/nba/skillGrades';

describe('weighted skill grades', () => {
  it('does not let one inflated shooting attribute create an elite category grade', () => {
    const grades = buildSkillGrades({
      threePoint: 92,
      shotIq: 76,
      shotConsistency: 72,
      offenseIq: 78,
      midRange: 76,
      freeThrow: 82,
    });

    expect(grades.threePoint.rating).toBeLessThan(85);
    expect(grades.threePoint.grade).toBe('B');
  });

  it('allows a real specialist to grade high in one skill without becoming elite everywhere', () => {
    const grades = buildSkillGrades({
      threePoint: 91,
      shotIq: 88,
      shotConsistency: 87,
      offenseIq: 82,
      midRange: 74,
      freeThrow: 82,
    }, { shotVolumeModifier: 88 });

    expect(['A-', 'B+']).toContain(grades.threePoint.grade);
    expect(grades.threePoint.grade).not.toBe('A+');
    expect(grades.finishing.grade).not.toMatch(/^A/);
  });

  it('separates basketball IQ from raw scoring categories', () => {
    const grades = buildSkillGrades({
      shotIq: 92,
      offenseIq: 94,
      defenseIq: 91,
      passIq: 90,
      helpDefense: 88,
      threePoint: 72,
      drivingLayup: 70,
    });

    expect(grades.basketballIq.grade).toMatch(/^A/);
    expect(grades.threePoint.grade).not.toMatch(/^A/);
  });
});
