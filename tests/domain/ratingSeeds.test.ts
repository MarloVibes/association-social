import { describe, expect, it } from 'vitest';

import { buildBaselineRatingProfiles } from '../../domain/nba/ratingSeeds';

describe('rating seed baselines', () => {
  it('keeps 2011 LeBron and 2011 Rose as elite potential franchise anchors', () => {
    const profiles = buildBaselineRatingProfiles();
    const lebron2011 = profiles.find(profile => profile.player_id === 'lebron-james-2011');
    const rose2011 = profiles.find(profile => profile.player_id === 'derrick-rose-2011');

    expect(lebron2011?.development_curve.potential_grade).toBe('A+');
    expect(rose2011?.development_curve.potential_grade).toBe('A+');
    expect(lebron2011?.age).toBe(26);
    expect(rose2011?.age).toBe(22);
    expect(lebron2011?.category_skill_grades.finishing.grade).toMatch(/^A/);
    expect(lebron2011?.category_skill_grades.playmaking.grade).toMatch(/^A/);
    expect(rose2011?.category_skill_grades.playmaking.grade).toMatch(/^A|S/);
  });

  it('does not inflate 2011 Derrick Rose into an elite three point shooter', () => {
    const rose2011 = buildBaselineRatingProfiles().find(profile => profile.player_id === 'derrick-rose-2011');

    expect(rose2011?.attribute_model.threePoint).toBeLessThan(85);
    expect(rose2011?.category_skill_grades.threePoint.grade).toMatch(/B|B-|C\+/);
  });

  it('labels 2026 LeBron as a legacy star with lower future-growth potential', () => {
    const lebron2026 = buildBaselineRatingProfiles().find(profile => profile.player_id === 'lebron-james-2026');

    expect(lebron2026?.development_curve.phase).toBe('Legacy Star');
    expect(lebron2026?.development_curve.potential_grade).toBe('B-');
    expect(lebron2026?.category_skill_grades.basketballIq.grade).toMatch(/^A|S/);
    expect(lebron2026?.category_skill_grades.finishing.grade).toMatch(/^A|B/);
  });
});
