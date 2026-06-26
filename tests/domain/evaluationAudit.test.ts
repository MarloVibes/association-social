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
    expect(report).not.toContain('setDoc');
  });
});
