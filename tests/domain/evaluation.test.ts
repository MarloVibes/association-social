import { describe, expect, it } from 'vitest';
import {
  buildEvaluationLayers,
  gradeFromScore,
  gradeTier,
  simSkillsFromEvaluation,
} from '@/domain/nba/evaluation';

describe('NBA evaluation v2', () => {
  it('uses the tighter hidden-score grade ladder without exposing scores', () => {
    expect(gradeFromScore(100)).toBe('S');
    expect(gradeFromScore(98)).toBe('A+');
    expect(gradeFromScore(91)).toBe('A-');
    expect(gradeFromScore(88)).toBe('B+');
    expect(gradeFromScore(79)).toBe('C+');
    expect(gradeFromScore(70)).toBe('D+');
    expect(gradeFromScore(64)).toBe('D-');
    expect(gradeTier('B+')).toBe('Pro');
  });

  it('builds visible potential while keeping numeric layers hidden', () => {
    const layers = buildEvaluationLayers({
      hidden: {
        shooting: 82,
        playmaking: 74,
        defense: 87,
        basketballIq: 85,
        potential: 91,
        confidence: 79,
      },
      seasonStats: { points: 16, assists: 3, rebounds: 6, steals: 1.2, games: 8 },
    });

    expect(layers.overallTalent.grade).toBe('B');
    expect(layers.currentForm.grade).toBe('B');
    expect(layers.potential.grade).toBe('A-');
    expect(layers.potential.tier).toBe('Elite');
    expect((layers as Record<string, unknown>).potentialScore).toBeUndefined();
    expect((layers.confidence as Record<string, unknown>).score).toBeUndefined();
    expect(layers.confidence.state).toBe('Steady');
  });

  it('converts detailed grades and hidden layers into sim-ready skills', () => {
    const skills = simSkillsFromEvaluation({
      hidden: {
        threePoint: 95,
        midRange: 89,
        passing: 78,
        defenseIq: 90,
        confidence: 88,
        stamina: 80,
      },
    });

    expect(skills.threePoint).toBeGreaterThan(skills.midRange);
    expect(skills.defensiveImpact).toBeGreaterThanOrEqual(85);
    expect(skills.formMultiplier).toBeGreaterThan(0.95);
  });
});
