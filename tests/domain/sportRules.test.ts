import { describe, expect, it } from 'vitest';
import { getSportRules, seasonLabel } from '@/domain/sports/rules';

describe('getSportRules', () => {
  it('returns the complete NBA rules', () => {
    expect(getSportRules('nba')).toEqual({
      key: 'nba',
      teamCount: 30,
      standardRosterLimit: 15,
      twoWayLimit: 3,
      draftRounds: 2,
      initialSeasonYear: 2025,
      financeMode: 'nba_cap',
      defaultDraftTimerSeconds: 120,
    });
  });

  it('returns the complete Madden rules', () => {
    expect(getSportRules('madden')).toEqual({
      key: 'madden',
      teamCount: 32,
      standardRosterLimit: 53,
      twoWayLimit: 0,
      draftRounds: 7,
      initialSeasonYear: 2025,
      financeMode: 'hard_cap',
      defaultDraftTimerSeconds: 120,
    });
  });

  it('returns the complete MLB rules', () => {
    expect(getSportRules('mlb')).toEqual({
      key: 'mlb',
      teamCount: 30,
      standardRosterLimit: 40,
      twoWayLimit: 0,
      draftRounds: 5,
      initialSeasonYear: 2026,
      financeMode: 'team_budget',
      defaultDraftTimerSeconds: 120,
    });
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
