import { describe, expect, it } from 'vitest';

import { buildBaselineRatingProfiles } from '../../domain/nba/ratingSeeds';
import { gradeRank } from '../../domain/nba/gradeScale';

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

  it('generates broad 2011 era roster baselines instead of leaving core teams generic', () => {
    const profiles = buildBaselineRatingProfiles();
    const lebronEraProfiles = profiles.filter(profile => profile.season === 2011);

    const find = (name: string, team: string) => lebronEraProfiles.find(profile => (
      profile.full_name === name && profile.team === team
    ));
    const mustFind = (name: string, team: string) => {
      const profile = find(name, team);
      expect(profile).toBeTruthy();
      return profile!;
    };

    const wade = mustFind('Dwyane Wade', 'MIA');
    const bosh = mustFind('Chris Bosh', 'MIA');
    const deng = mustFind('Luol Deng', 'CHI');
    const noah = mustFind('Joakim Noah', 'CHI');
    const kobe = mustFind('Kobe Bryant', 'LAL');
    const paul = mustFind('Chris Paul', 'NOH');
    const curry = mustFind('Stephen Curry', 'GSW');

    expect(lebronEraProfiles.length).toBeGreaterThanOrEqual(150);
    expect(gradeRank(wade?.category_skill_grades.finishing.grade)).toBeGreaterThanOrEqual(gradeRank('A-'));
    expect(gradeRank(wade?.category_skill_grades.perimeterDefense.grade)).toBeGreaterThanOrEqual(gradeRank('B+'));
    expect(gradeRank(bosh?.category_skill_grades.midRange.grade)).toBeGreaterThanOrEqual(gradeRank('B+'));
    expect(gradeRank(deng?.category_skill_grades.perimeterDefense.grade)).toBeGreaterThanOrEqual(gradeRank('B+'));
    expect(gradeRank(noah?.category_skill_grades.rebounding.grade)).toBeGreaterThanOrEqual(gradeRank('A-'));
    expect(gradeRank(kobe?.category_skill_grades.midRange.grade)).toBeGreaterThanOrEqual(gradeRank('A-'));
    expect(gradeRank(paul?.category_skill_grades.playmaking.grade)).toBeGreaterThanOrEqual(gradeRank('A'));
    expect(gradeRank(curry?.category_skill_grades.threePoint.grade)).toBeGreaterThanOrEqual(gradeRank('A-'));
  });
});
