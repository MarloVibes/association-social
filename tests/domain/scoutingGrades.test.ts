import { describe, expect, it } from 'vitest';
import {
  buildScoutingGrades,
  compareScoutingGrades,
  getCompareRowModel,
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
    expect(hiddenGrades.dunking).toBe('F');
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
});
