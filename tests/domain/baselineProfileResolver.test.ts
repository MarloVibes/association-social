import { describe, expect, it } from 'vitest';

import { mergeBaselineRatingProfile, resolveBaselineRatingProfile } from '@/domain/nba/baselineProfileResolver';
import type { NbaGrade } from '@/domain/nba/identity';
import { buildEvaluationLayers } from '@/domain/nba/evaluation';
import { buildScoutingGrades, getPotentialScoutingSummary, gradeRank } from '@/domain/nba/scoutingGrades';

function resolvedGrade(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'grade' in value) {
    return String((value as { grade?: unknown }).grade || '');
  }
  return '';
}

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

  it('uses the canonical baseline model over stale saved roster grade fields', () => {
    const staleRosterSnapshot = {
      full_name: 'Rudy Gobert',
      team: 'MIN',
      category_skill_grades: {
        threePoint: 'A+',
        dunking: 'C',
      },
      attribute_model: {
        threePoint: 99,
        dunking: 62,
      },
    };

    const merged = mergeBaselineRatingProfile(staleRosterSnapshot, { era: 'current' });

    expect((merged as Record<string, any>).baselineRatingProfile?.player_id).toBe('rudy-gobert-2026');
    expect(gradeRank(resolvedGrade(merged.category_skill_grades.threePoint) as NbaGrade)).toBeLessThanOrEqual(gradeRank('D+'));
    expect(merged.attribute_model.threePoint).toBeLessThan(50);
    expect(merged.attribute_model.dunking).toBeGreaterThanOrEqual(80);
  });

  it('covers core 2011 era rosters beyond the hand-seeded headline players', () => {
    const dwyaneWade = resolveBaselineRatingProfile({ full_name: 'Dwyane Wade', team: 'MIA' }, { era: 'lebron' });
    const chrisBosh = resolveBaselineRatingProfile({ full_name: 'Chris Bosh', team: 'MIA' }, { era: 'lebron' });
    const luolDeng = resolveBaselineRatingProfile({ full_name: 'Luol Deng', team: 'CHI' }, { era: 'lebron' });
    const joakimNoah = resolveBaselineRatingProfile({ full_name: 'Joakim Noah', team: 'CHI' }, { era: 'lebron' });
    const kobeBryant = resolveBaselineRatingProfile({ full_name: 'Kobe Bryant', team: 'LAL' }, { era: 'lebron' });
    const chrisPaul = resolveBaselineRatingProfile({ full_name: 'Chris Paul', team: 'NOH' }, { era: 'lebron' });

    expect(dwyaneWade?.team).toBe('MIA');
    expect(chrisBosh?.team).toBe('MIA');
    expect(luolDeng?.team).toBe('CHI');
    expect(joakimNoah?.team).toBe('CHI');
    expect(kobeBryant?.team).toBe('LAL');
    expect(chrisPaul?.team).toBe('NOH');

    expect(gradeRank(buildScoutingGrades({ full_name: 'Dwyane Wade', team: 'MIA' }, dwyaneWade).overall)).toBeGreaterThanOrEqual(gradeRank('A-'));
    expect(gradeRank(buildScoutingGrades({ full_name: 'Chris Bosh', team: 'MIA' }, chrisBosh).overall)).toBeGreaterThanOrEqual(gradeRank('B+'));
    expect(gradeRank(buildScoutingGrades({ full_name: 'Luol Deng', team: 'CHI' }, luolDeng).perimeterDefense)).toBeGreaterThanOrEqual(gradeRank('B+'));
    expect(gradeRank(buildScoutingGrades({ full_name: 'Joakim Noah', team: 'CHI' }, joakimNoah).rebounding)).toBeGreaterThanOrEqual(gradeRank('A-'));
    expect(gradeRank(buildScoutingGrades({ full_name: 'Kobe Bryant', team: 'LAL' }, kobeBryant).overall)).toBeGreaterThanOrEqual(gradeRank('A-'));
    expect(gradeRank(buildScoutingGrades({ full_name: 'Chris Paul', team: 'NOH' }, chrisPaul).passing)).toBeGreaterThanOrEqual(gradeRank('A'));
  });

  it('maps every historical era key to its generated baseline season', () => {
    expect(resolveBaselineRatingProfile({ full_name: 'Magic Johnson', team: 'LAL' }, { era: 'magic_bird' })?.season).toBe(1984);
    expect(resolveBaselineRatingProfile({ full_name: 'Michael Jordan', team: 'CHI' }, { era: 'jordan' })?.season).toBe(1992);
    expect(resolveBaselineRatingProfile({ full_name: 'Kobe Bryant', team: 'LAL' }, { era: 'kobe' })?.season).toBe(2003);
    expect(resolveBaselineRatingProfile({ full_name: 'Stephen Curry', team: 'GSW' }, { era: 'steph' })?.season).toBe(2017);
  });
});
