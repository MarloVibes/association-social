import { describe, expect, it } from 'vitest';

import { GRADE_ORDER, gradeFromNumeric, gradeRank } from '../../domain/nba/gradeScale';

describe('gradeScale', () => {
  it('uses the approved public grade ladder only', () => {
    expect(GRADE_ORDER).toEqual(['F', 'D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+', 'S']);
  });

  it.each([
    [100, 'S'],
    [99, 'S'],
    [98, 'A+'],
    [95, 'A+'],
    [94, 'A'],
    [92, 'A'],
    [91, 'A-'],
    [89, 'A-'],
    [88, 'B+'],
    [85, 'B+'],
    [84, 'B'],
    [80, 'B'],
    [79, 'B-'],
    [75, 'B-'],
    [74, 'C+'],
    [70, 'C+'],
    [69, 'C'],
    [65, 'C'],
    [64, 'C-'],
    [60, 'C-'],
    [59, 'D+'],
    [57, 'D+'],
    [56, 'D'],
    [53, 'D'],
    [52, 'D-'],
    [50, 'D-'],
    [49, 'F'],
  ] as const)('maps %s to %s', (rating, grade) => {
    expect(gradeFromNumeric(rating)).toBe(grade);
  });

  it('orders higher grades above lower grades', () => {
    expect(gradeRank('S')).toBeGreaterThan(gradeRank('A+'));
    expect(gradeRank('B')).toBeGreaterThan(gradeRank('B-'));
    expect(gradeRank('D')).toBeGreaterThan(gradeRank('F'));
  });
});
