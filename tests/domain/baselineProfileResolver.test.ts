import { describe, expect, it } from 'vitest';

import { resolveBaselineRatingProfile } from '@/domain/nba/baselineProfileResolver';
import { buildEvaluationLayers } from '@/domain/nba/evaluation';
import { buildScoutingGrades, getPotentialScoutingSummary, gradeRank } from '@/domain/nba/scoutingGrades';

describe('baseline rating profile resolver', () => {
  it('resolves 2011 LeBron from an older roster snapshot and keeps him elite', () => {
    const rosterSnapshot = {
      full_name: 'LeBron James',
      team: 'MIA',
      position: 'Small Forward, Power Forward, Point Guard, Center,',
      birth_date: '1984-12-30',
    };

    const profile = resolveBaselineRatingProfile(rosterSnapshot, { era: 'lebron' });
    const grades = buildScoutingGrades(rosterSnapshot, profile);
    const evaluation = buildEvaluationLayers(rosterSnapshot, profile);

    expect(profile?.player_id).toBe('lebron-james-2011');
    expect(profile?.age).toBe(26);
    expect(gradeRank(evaluation.overallTalent.grade)).toBeGreaterThanOrEqual(gradeRank('A'));
    expect(gradeRank(grades.overall)).toBeGreaterThanOrEqual(gradeRank('A'));
    expect(gradeRank(grades.role)).toBeGreaterThanOrEqual(gradeRank('A'));
    expect(gradeRank(grades.impact)).toBeGreaterThanOrEqual(gradeRank('A'));
    expect(gradeRank(grades.potential)).toBeGreaterThanOrEqual(gradeRank('A'));
    expect(gradeRank(grades.passing)).toBeGreaterThanOrEqual(gradeRank('A-'));
    expect(gradeRank(grades.perimeterDefense)).toBeGreaterThanOrEqual(gradeRank('B+'));
    expect(grades.threePoint).toMatch(/^B/);
  });

  it('uses the live league date for birthday-aware display age', () => {
    const openingNight = resolveBaselineRatingProfile(
      { full_name: 'LeBron James', team: 'MIA', birth_date: '1984-12-30' },
      { era: 'lebron', leagueDate: '2010-10-26' },
    );
    const afterBirthday = resolveBaselineRatingProfile(
      { full_name: 'LeBron James', team: 'MIA', birth_date: '1984-12-30' },
      { era: 'lebron', leagueDate: '2011-01-15' },
    );

    expect(openingNight?.season_age).toBe(26);
    expect(openingNight?.display_age).toBe(25);
    expect(openingNight?.exact_age).toBe(25);
    expect(openingNight?.age).toBe(25);
    expect(afterBirthday?.season_age).toBe(26);
    expect(afterBirthday?.display_age).toBe(26);
    expect(afterBirthday?.exact_age).toBe(26);
    expect(afterBirthday?.age).toBe(26);
  });

  it('resolves 2026 LeBron as a legacy star with lower future-growth potential', () => {
    const profile = resolveBaselineRatingProfile({ full_name: 'LeBron James', team: 'LAL' }, { era: 'current' });
    const grades = buildScoutingGrades({ full_name: 'LeBron James', team: 'LAL' }, profile);
    const summary = getPotentialScoutingSummary({ full_name: 'LeBron James', team: 'LAL' }, profile);

    expect(profile?.player_id).toBe('lebron-james-2026');
    expect(profile?.age).toBe(41);
    expect(gradeRank(grades.overall)).toBeGreaterThanOrEqual(gradeRank('A-'));
    expect(gradeRank(grades.potential)).toBeLessThanOrEqual(gradeRank('B'));
    expect(gradeRank(grades.offenseIq)).toBeGreaterThanOrEqual(gradeRank('A'));
    expect(summary.label).toBe('Near Peak');
  });
});
