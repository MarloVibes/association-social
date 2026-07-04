import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

import { gradeRank } from '@/domain/nba/scoutingGrades';

const require = createRequire(import.meta.url);
const { mergeBaselineRatingProfile } = require('../../functions/franchise/baselineResolver.js');
const { baselineProfiles } = require('../../functions/franchise/baselineProfiles.generated.js');

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

  it('keeps generated server baselines aligned with card tier and archetype identity', () => {
    const missingIdentity = baselineProfiles.filter((profile: any) => (
      !profile.visibleIdentity?.tier
      || !Array.isArray(profile.visibleIdentity?.archetypes)
      || profile.visibleIdentity.archetypes.length === 0
      || !profile.visibleIdentity?.developmentOutlook
      || !profile.visibleIdentity?.potentialLabel
    ));
    const korver2017 = baselineProfiles.find((profile: any) => (
      profile.full_name === 'Kyle Korver'
      && profile.team === 'CLE'
      && profile.season === 2017
    ));

    expect(missingIdentity).toEqual([]);
    expect(korver2017?.visibleIdentity?.tier).toBe('Valuable Rotation Player');
    expect(korver2017?.visibleIdentity?.archetypes).toContain('Catch-and-Shoot Specialist');
  });
});
