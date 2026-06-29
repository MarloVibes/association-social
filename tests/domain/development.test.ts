import { describe, expect, it } from 'vitest';

import { buildDevelopmentCurve } from '../../domain/nba/development';

describe('development curve', () => {
  it('gives young MVP-level players elite potential', () => {
    const rose = buildDevelopmentCurve({
      age: 22,
      currentImpactRating: 94,
      awardWeight: 7,
      draftPick: 1,
      hiddenDevelopmentRating: 92,
      injuryRisk: 10,
      minutesOpportunity: 92,
      performanceTrend: 8,
      scoutingTags: ['mvp', 'elite_burst', 'high_usage_creator'],
    });

    expect(rose.potentialRating).toBeGreaterThanOrEqual(95);
    expect(rose.potentialGrade).toBe('A+');
    expect(['High Upside', 'Rising Star', 'Prime Star']).toContain(rose.phase);
  });

  it('keeps generational veterans valuable without pretending they have high future growth', () => {
    const lebron2026 = buildDevelopmentCurve({
      age: 41,
      currentImpactRating: 90,
      awardWeight: 10,
      draftPick: 1,
      hiddenDevelopmentRating: 96,
      injuryRisk: 22,
      minutesOpportunity: 78,
      performanceTrend: -2,
      scoutingTags: ['generational', 'legacy_star', 'aging_resistant'],
    });

    expect(lebron2026.potentialGrade).toBe('B-');
    expect(lebron2026.phase).toBe('Legacy Star');
    expect(lebron2026.agingResistance).toBeGreaterThanOrEqual(4);
  });

  it('flags older non-generational players as declining more aggressively', () => {
    const veteran = buildDevelopmentCurve({
      age: 36,
      currentImpactRating: 72,
      awardWeight: 0,
      draftPick: 24,
      hiddenDevelopmentRating: 58,
      injuryRisk: 35,
      minutesOpportunity: 48,
      performanceTrend: -8,
      scoutingTags: [],
    });

    expect(['Declining', 'Sharp Decline Risk']).toContain(veteran.phase);
    expect(veteran.potentialGrade).not.toMatch(/^A/);
    expect(veteran.agingResistance).toBeLessThan(3);
  });
});
