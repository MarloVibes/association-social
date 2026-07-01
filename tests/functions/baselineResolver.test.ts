import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

import { gradeRank } from '@/domain/nba/scoutingGrades';

const require = createRequire(import.meta.url);
const { mergeBaselineRatingProfile } = require('../../functions/franchise/baselineResolver.js');

describe('server baseline rating resolver', () => {
  it('repairs direct skill grades from the canonical baseline for simulation paths', () => {
    const merged = mergeBaselineRatingProfile({
      full_name: 'Rudy Gobert',
      team: 'MIN',
      era: 'current',
      skill_grades: {
        threePoint: 'A+',
        dunking: 'D',
      },
      category_skill_grades: {
        threePoint: { grade: 'A+', rating: 96 },
        finishing: { grade: 'C', rating: 66 },
      },
    });

    expect(merged.baselineRatingProfile?.player_id).toBe('rudy-gobert-2026');
    expect(gradeRank(merged.skill_grades.threePoint)).toBeLessThanOrEqual(gradeRank('D+'));
    expect(gradeRank(merged.skill_grades.dunking)).toBeGreaterThanOrEqual(gradeRank('B+'));
    expect(merged.category_skill_grades.threePoint.grade).toBe('D');
    expect(merged.category_skill_grades.finishing.grade).toBe('A');
  });
});
