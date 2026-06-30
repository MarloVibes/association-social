import { describe, expect, it } from 'vitest';
import {
  NBA_CAP_HISTORY,
  averageCapGrowthRate,
  nextSalaryCap,
  projectCapHistory,
} from '@/domain/nba/cap';

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

  it('uses real NBA salary cap data for historical era seasons', () => {
    expect(projectCapHistory({
      currentYear: 2010,
      currentSalaryCap: 58_044_000,
      existingHistory: [],
    })).toEqual([NBA_CAP_HISTORY[2011]]);
  });

  it('uses the reported 2026-27 NBA cap table instead of projecting from 2025-26', () => {
    expect(projectCapHistory({
      currentYear: 2025,
      currentSalaryCap: NBA_CAP_HISTORY[2025].salaryCap,
      existingHistory: [],
    })).toEqual([NBA_CAP_HISTORY[2026]]);
  });

  it('projects beyond known caps using the recent average growth rate', () => {
    const growthRate = averageCapGrowthRate();
    expect(projectCapHistory({
      currentYear: 2026,
      currentSalaryCap: NBA_CAP_HISTORY[2026].salaryCap,
      existingHistory: [],
    })).toEqual([{
      seasonYear: 2027,
      salaryCap: Math.round(NBA_CAP_HISTORY[2026].salaryCap * (1 + growthRate)),
      minimumSalary: Math.round(Math.round(NBA_CAP_HISTORY[2026].salaryCap * (1 + growthRate)) * 0.01),
      rookieScaleBase: Math.round(Math.round(NBA_CAP_HISTORY[2026].salaryCap * (1 + growthRate)) * 0.05),
    }]);
  });
});
