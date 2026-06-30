import { describe, expect, it } from 'vitest';
import { auditEraPlayer, buildEraAuditReport } from '@/domain/nba/evaluationAudit';

describe('NBA evaluation audit', () => {
  it('flags high-minute defensive core wings as more than generic average role players', () => {
    expect(auditEraPlayer({
      full_name: 'Luol Deng',
      team: 'CHI',
      position: 'SF',
      minutes: 39,
      ppg: 17.4,
      rpg: 5.8,
      apg: 2.8,
      spg: 1,
      hidden: { defense: 86, basketballIq: 84, stamina: 92 },
    })).toMatchObject({
      coreRole: true,
      suggestedArchetype: expect.stringContaining('Two-Way'),
    });
  });

  it('uses salary, workload, and production to catch core players before hidden grades exist', () => {
    const result = auditEraPlayer({
      full_name: 'Luol Deng',
      team: 'CHI',
      position: 'SF',
      minutes: 39,
      ppg: 17.4,
      rpg: 5.8,
      apg: 2.8,
      spg: 1,
      salary: 11345000,
      career_WS: 74,
      career_PER: 15.4,
    });

    expect(result.coreRole).toBe(true);
    expect(result.needsReview).toBe(true);
    expect(result.reviewPriority).toBe('high');
    expect(result.suggestedArchetype).toContain('Two-Way');
    expect(result.reviewReasons).toEqual(expect.arrayContaining([
      'core salary signal',
      'wing defensive workload signal',
      'career win-share/core signal',
    ]));
  });

  it('suggests reviewed letter-grade boosts for core two-way wings without numeric scores', () => {
    const result = auditEraPlayer({
      full_name: 'Luol Deng',
      team: 'CHI',
      position: 'SF',
      minutes: 39,
      ppg: 17.4,
      rpg: 5.8,
      apg: 2.8,
      spg: 1,
      salary: 11345000,
      career_WS: 74,
      career_PER: 15.4,
    });

    expect(result.suggestedGradeUpdates).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'perimeterDefense', suggestedGrade: 'B+' }),
      expect.objectContaining({ key: 'defenseIq', suggestedGrade: 'B' }),
      expect.objectContaining({ key: 'stamina', suggestedGrade: 'A-' }),
      expect.objectContaining({ key: 'offenseIq', suggestedGrade: 'B-' }),
    ]));
    expect(JSON.stringify(result.suggestedGradeUpdates)).not.toMatch(/\b8\d\b|\b9\d\b/);
  });

  it('raises audit suggestions for proven primary creators instead of stopping at B minus', () => {
    const result = auditEraPlayer({
      full_name: 'LeBron James',
      team: 'MIA',
      position: 'SF/PF',
      minutes: 38,
      ppg: 26.7,
      rpg: 7.5,
      apg: 7,
      spg: 1.6,
      salary: 14500000,
      career_WS: 236,
      career_PER: 27,
    });

    expect(result.suggestedGradeUpdates).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'offenseIq', suggestedGrade: 'A' }),
      expect.objectContaining({ key: 'midRange', suggestedGrade: 'A-' }),
    ]));
    expect(result.suggestedGradeUpdates).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'offenseIq', suggestedGrade: 'B-' }),
      expect.objectContaining({ key: 'midRange', suggestedGrade: 'B-' }),
    ]));
  });

  it('recognizes elite table-setting guards even when scoring volume is not superstar-wing level', () => {
    const result = auditEraPlayer({
      full_name: 'Chris Paul',
      team: 'NOH',
      position: 'PG',
      minutes: 36,
      ppg: 18.5,
      rpg: 4.5,
      apg: 9.7,
      spg: 2.4,
      salary: 14940153,
      career_WS: 171.5,
      career_PER: 25.3,
    });

    expect(result.suggestedGradeUpdates).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'offenseIq', suggestedGrade: 'A' }),
    ]));
  });

  it('produces a markdown report without Firestore writes', () => {
    const report = buildEraAuditReport('rose', [
      {
        full_name: 'Luol Deng',
        team: 'CHI',
        position: 'SF',
        minutes: 39,
        ppg: 17.4,
        rpg: 5.8,
        apg: 2.8,
        spg: 1,
        hidden: { defense: 86, basketballIq: 84, stamina: 92 },
      },
    ]);

    expect(report).toContain('# NBA Era Grade Audit');
    expect(report).toContain('rose');
    expect(report).toContain('Luol Deng');
    expect(report).toContain('Two-Way');
    expect(report).toContain('Perimeter D -> B+');
    expect(report).toContain('Priority');
    expect(report).not.toContain('setDoc');
  });
});
