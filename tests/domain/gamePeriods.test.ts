import { describe, expect, it } from 'vitest';
import { periodLabelForSport, scorePeriodsForSport } from '@/domain/sports/gamePeriods';

describe('sport game period labels', () => {
  it('labels NBA regulation and overtime periods', () => {
    expect(periodLabelForSport('nba', { quarter: 1 })).toBe('Q1');
    expect(periodLabelForSport('nba', { quarter: 5 })).toBe('OT');
    expect(periodLabelForSport('nba', { quarter: 6 })).toBe('2OT');
  });

  it('labels NFL games as quarters', () => {
    expect(periodLabelForSport('madden', { period: 3 })).toBe('Q3');
  });

  it('labels MLB games as innings instead of quarters', () => {
    expect(periodLabelForSport('mlb', { inning: 1 })).toBe('1st');
    expect(periodLabelForSport('mlb', { period: 2 })).toBe('2nd');
    expect(periodLabelForSport('mlb', { period: 9 })).toBe('9th');
  });

  it('normalizes raw inning rows for score tables', () => {
    expect(scorePeriodsForSport('mlb', {
      innings: [
        { inning: 1, home: 0, away: 1 },
        { inning: 2, home: 2, away: 0 },
      ],
    })).toEqual([
      { period: 1, label: '1st', home: 0, away: 1 },
      { period: 2, label: '2nd', home: 2, away: 0 },
    ]);
  });
});
