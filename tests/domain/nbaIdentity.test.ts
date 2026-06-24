import { describe, expect, it } from 'vitest';
import {
  buildVisibleIdentity,
  gradeFromHiddenValue,
  reputationFromInputs,
} from '@/domain/nba/identity';

describe('NBA player identity', () => {
  it('maps hidden values to exact grades without exposing overall', () => {
    expect(gradeFromHiddenValue(98)).toBe('A+');
    expect(gradeFromHiddenValue(91)).toBe('A');
    expect(gradeFromHiddenValue(78)).toBe('B');
    expect(gradeFromHiddenValue(65)).toBe('C');
    expect(gradeFromHiddenValue(42)).toBe('F');

    const identity = buildVisibleIdentity({
      shooting: 91,
      playmaking: 78,
      defense: 65,
    });

    expect(identity).not.toHaveProperty('overall');
    expect(identity.grades.shooting).toBe('A');
    expect(identity.grades.playmaking).toBe('B');
    expect(identity.grades.defense).toBe('C');
  });

  it('derives roles, traits, strengths, weaknesses, and reputation from hidden values', () => {
    const identity = buildVisibleIdentity({
      shooting: 88,
      playmaking: 84,
      defense: 52,
      rebounding: 58,
      athleticism: 72,
      basketballIq: 81,
      consistency: 79,
      chemistry: 69,
      age: 22,
      accolades: { all_star: 1, championship: 1 },
    });

    expect(identity.primaryRole).toBe('Shot Creator');
    expect(identity.secondaryRole).toBe('Floor General');
    expect(identity.strengths).toEqual(['Shooting', 'Playmaking', 'Basketball IQ']);
    expect(identity.weaknesses).toEqual(['Defense', 'Rebounding']);
    expect(identity.developmentTrait).toBe('Rising');
    expect(identity.reputation).toBe('Star');
    expect((identity as Record<string, unknown>).hidden).toBeUndefined();
  });

  it('normalizes reputation inputs deterministically', () => {
    expect(reputationFromInputs({ accolades: { mvp: 1 }, seasonsPlayed: 9 })).toBe('Legend');
    expect(reputationFromInputs({ accolades: { all_nba_1st: 1 }, seasonsPlayed: 4 })).toBe('Star');
    expect(reputationFromInputs({ accolades: {}, seasonsPlayed: 1 })).toBe('Prospect');
  });
});
