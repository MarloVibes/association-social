import { describe, expect, it } from 'vitest';
import { getSportRules } from '@/domain/sports/rules';

describe('sport rules', () => {
  it('exposes 32 NFL teams', () => {
    expect(getSportRules('madden').teamCount).toBe(32);
  });
});
