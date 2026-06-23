import { describe, expect, it } from 'vitest';
import { getSportRules, seasonLabel } from '@/domain/sports/rules';

describe('getSportRules', () => {
  it('returns NBA roster rules', () => {
    const rules = getSportRules('nba');

    expect(rules.teamCount).toBe(30);
    expect(rules.standardRosterLimit).toBe(15);
    expect(rules.twoWayLimit).toBe(3);
  });

  it('returns Madden roster and finance rules', () => {
    const rules = getSportRules('madden');

    expect(rules.teamCount).toBe(32);
    expect(rules.standardRosterLimit).toBe(53);
    expect(rules.financeMode).toBe('hard_cap');
  });

  it('returns MLB roster and finance rules', () => {
    const rules = getSportRules('mlb');

    expect(rules.teamCount).toBe(30);
    expect(rules.standardRosterLimit).toBe(40);
    expect(rules.financeMode).toBe('team_budget');
  });

  it('normalizes the NFL alias to Madden', () => {
    expect(getSportRules('nfl')).toEqual(getSportRules('madden'));
  });

  it.each([undefined, null, 'unknown'])(
    'falls back safely to NBA for %s',
    (sport) => {
      expect(getSportRules(sport)).toEqual(getSportRules('nba'));
    },
  );

  it('does not expose mutable shared configuration', () => {
    const rules = getSportRules('nba');

    expect(() => {
      (rules as { teamCount: number }).teamCount = 99;
    }).toThrow(TypeError);
    expect(getSportRules('nba').teamCount).toBe(30);
  });
});

describe('seasonLabel', () => {
  it('formats NBA seasons across two calendar years', () => {
    expect(seasonLabel('nba', 2026)).toBe('2026-27');
  });

  it('formats Madden seasons as a single year', () => {
    expect(seasonLabel('madden', 2026)).toBe('2026');
  });

  it('formats MLB seasons as a single year', () => {
    expect(seasonLabel('mlb', 2027)).toBe('2027');
  });
});
