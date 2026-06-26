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
    expect(report).toContain('Priority');
    expect(report).not.toContain('setDoc');
  });
});
