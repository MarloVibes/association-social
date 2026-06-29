import { describe, expect, it } from 'vitest';
import { nextSalaryCap, projectCapHistory } from '@/domain/nba/cap';

describe('NBA cap growth', () => {
  it('grows the cap five percent by default', () => {
    expect(nextSalaryCap(154_647_000)).toBe(162_379_350);
  });

  it('records derived cap history values for the next season', () => {
    expect(projectCapHistory({
      currentYear: 2025,
      currentSalaryCap: 154_647_000,
      existingHistory: [],
      growthRate: 0.05,
    })).toEqual([{
      seasonYear: 2026,
      salaryCap: 162_379_350,
      minimumSalary: 1_623_794,
      rookieScaleBase: 8_118_968,
    }]);
  });
});
