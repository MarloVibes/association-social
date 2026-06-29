import { describe, expect, it } from 'vitest';
import {
  buildScoutingGrades,
  compareScoutingGrades,
  getCompareRowModel,
  getPotentialScoutingSummary,
  getScoutingGradeSections,
  gradeColors,
  gradeRank,
} from '@/domain/nba/scoutingGrades';

describe('NBA scouting grades', () => {
  it('maps grade colors from red through gold', () => {
    expect(gradeColors('S').textColor).toBe('#f5c451');
    expect(gradeColors('A').textColor).toBe('#00ff87');
    expect(gradeColors('B+').textColor).toBe('#54a3ff');
    expect(gradeColors('D').textColor).toBe('#ff9f43');
    expect(gradeColors('F').textColor).toBe('#ff4d5e');
  });

  it('prefers explicit expanded grades and groups them into scouting sections', () => {
    const sections = getScoutingGradeSections({
      scoutingGrades: {
        threePoint: 'S',
        passing: 'A+',
        defenseIq: 'A',
        dunking: 'D',
      },
    });

    const scoring = sections.find(section => section.title === 'Scoring');
    const playmaking = sections.find(section => section.title === 'Playmaking / IQ');
    const defense = sections.find(section => section.title === 'Defense');

    expect(scoring?.items.find(item => item.key === 'threePoint')?.grade).toBe('S');
    expect(scoring?.items.find(item => item.key === 'dunking')?.grade).toBe('D');
    expect(playmaking?.items.find(item => item.key === 'passing')?.grade).toBe('A+');
    expect(defense?.items.find(item => item.key === 'defenseIq')?.grade).toBe('A');
  });

  it('shows Potential as a visible growth grade without exposing hidden scores', () => {
    const growth = getScoutingGradeSections({
      hidden: { potential: 91 },
    }).find(section => section.title === 'Growth');

    expect(growth?.items.find(item => item.key === 'potential')?.grade).toBe('A-');
    expect(growth?.items.find(item => item.key === 'potential')?.colors.textColor).toBe('#00ff87');
  });

  it('derives detailed grades from hidden ratings and legacy broad grades', () => {
    const hiddenGrades = buildScoutingGrades({
      hidden: {
        shooting: 96,
        threePoint: 99,
        dunking: 51,
        basketballIq: 93,
        defense: 88,
      },
    });

    expect(hiddenGrades.threePoint).toBe('S');
    expect(hiddenGrades.dunking).toBe('D-');
    expect(hiddenGrades.defenseIq).toBe('A');
    expect(hiddenGrades.offenseIq).toBe('A');

    const legacyGrades = buildScoutingGrades({
      grades: {
        shooting: 'A',
        playmaking: 'B+',
        defense: 'C',
        athleticism: 'D',
      },
    });

    expect(legacyGrades.midRange).toBe('A');
    expect(legacyGrades.passing).toBe('B+');
    expect(legacyGrades.perimeterDefense).toBe('C');
    expect(legacyGrades.speed).toBe('D');
  });

  it('compares rows with one shared center ability label', () => {
    const rows = compareScoutingGrades(
      buildScoutingGrades({ scoutingGrades: { threePoint: 'S', passing: 'B+' } }),
      buildScoutingGrades({ scoutingGrades: { threePoint: 'A-', passing: 'S' } }),
    );

    const passing = rows.find(row => row.key === 'passing');
    expect(passing?.winner).toBe('right');
    expect(gradeRank('S')).toBeGreaterThan(gradeRank('B+'));

    const compact = getCompareRowModel({
      leftName: 'Curry',
      rightName: 'Paul',
      row: passing!,
    });

    expect(compact.left).toEqual({ name: 'Curry', grade: 'B+' });
    expect(compact.centerLabel).toBe('Passing');
    expect(compact.right).toEqual({ grade: 'S', name: 'Paul' });
    expect(compact.accessibilityLabel).toBe('Curry B+ Passing S Paul');
  });

  it('uses one weighted numeric source for player cards and comparisons', () => {
    const rose2011 = {
      full_name: 'Derrick Rose',
      position: 'PG',
      fg3_pct: 0.332,
      fg3a_per_game: 4.8,
      hidden: {
        shooting: 96,
        threePoint: 78,
        shotIq: 80,
        consistency: 76,
        offenseIq: 90,
        closeShot: 94,
        dunking: 90,
        speed: 98,
        acceleration: 97,
        ballHandle: 96,
        passing: 90,
      },
      scoutingGrades: {
        threePoint: 'A+',
      },
    };
    const cardGrades = buildScoutingGrades(rose2011);
    const compareGrades = buildScoutingGrades(rose2011);

    expect(cardGrades.threePoint).toBe('B-');
    expect(compareGrades.threePoint).toBe(cardGrades.threePoint);
    expect(cardGrades.closeShot).toBe('A');
    expect(cardGrades.speed).toBe('A+');
    expect(cardGrades.acceleration).toBe('A+');
    expect(cardGrades.ballHandle).toBe('A+');
  });

  it('prefers the canonical rating profile over stale roster hidden grades', () => {
    const rosterSnapshot = {
      full_name: 'Era Guard',
      position: 'PG',
      hidden: {
        threePoint: 98,
        shotIq: 90,
        consistency: 90,
        offenseIq: 90,
      },
    };
    const canonicalProfile = {
      attribute_model: {
        threePoint: 78,
        shotIq: 80,
        consistency: 76,
        offenseIq: 88,
      },
    };

    expect(buildScoutingGrades(rosterSnapshot, canonicalProfile).threePoint).toBe('B-');
  });

  it('separates skill, role, impact, overall, and trade value grades', () => {
    const benchShooter = buildScoutingGrades({
      hidden: {
        threePoint: 91,
        shotIq: 88,
        consistency: 84,
        offenseIq: 80,
        minutes: 14,
        usage: 12,
        durability: 72,
        tradeValue: 74,
      },
      minutesPerGame: 14,
      usagePct: 12,
      fg3a_per_game: 4,
    }) as any;

    expect(benchShooter.threePoint).toBe('A-');
    expect(benchShooter.role).toBe('C');
    expect(benchShooter.impact).toBe('B-');
    expect(benchShooter.overall).toBe('C+');
    expect(benchShooter.tradeValue).toBe('C+');
  });

  it('keeps potential labels separate from role labels', () => {
    const primeSuperstar = buildScoutingGrades({
      age: 25,
      hidden: {
        shooting: 94,
        playmaking: 96,
        defense: 84,
        athleticism: 97,
        basketballIq: 94,
        potential: 65,
        developmentRate: 88,
        workEthic: 90,
      },
      visibleIdentity: { reputation: 'Superstar' },
      seasonStats: { games: 70, minutes: 2500, points: 1800, assists: 560, rebounds: 320 },
    });

    expect(gradeRank(primeSuperstar.potential)).toBeGreaterThanOrEqual(gradeRank('B+'));

    const veteranSummary = getPotentialScoutingSummary({
      age: 35,
      hidden: {
        shooting: 95,
        playmaking: 94,
        defense: 82,
        athleticism: 86,
        basketballIq: 98,
        potential: 68,
      },
      visibleIdentity: { reputation: 'Superstar' },
    });

    expect(veteranSummary.label).toBe('Near Peak');
    expect(veteranSummary.label).not.toBe('Contributor');
    expect(veteranSummary.description).toContain('already close to his ceiling');
  });
});
