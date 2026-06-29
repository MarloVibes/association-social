import { describe, expect, it } from 'vitest';
import {
  autoCutRoster,
  rosterCompliance,
  rosterPayroll,
} from '@/domain/offseason/rosterCuts';

describe('roster cut compliance', () => {
  it('enforces NFL and MLB limits', () => {
    expect(rosterCompliance('madden', {
      standard: 54,
      payroll: 100,
      limit: 200,
    }).valid).toBe(false);
    expect(rosterCompliance('mlb', {
      standard: 40,
      payroll: 151,
      limit: 150,
    }).errors).toContain('financial_limit');
  });

  it('rejects missing financial limits and sums valid salaries', () => {
    expect(rosterPayroll([
      { salary: 10 },
      { salary: 20 },
      { salary: Number.NaN },
    ])).toBe(30);
    expect(rosterCompliance('madden', {
      standard: 53,
      payroll: 100,
      limit: undefined,
    }).errors).toContain('invalid_limit');
  });

  it('distinguishes NBA standard contracts from two-way slots', () => {
    expect(rosterCompliance('nba', {
      standard: 15,
      twoWay: 3,
      payroll: 200,
    }).valid).toBe(true);
    expect(rosterCompliance('nba', {
      standard: 16,
      twoWay: 3,
      payroll: 200,
    }).errors).toContain('standard_roster_limit');
    expect(rosterCompliance('nba', {
      standard: 15,
      twoWay: 4,
      payroll: 200,
    }).errors).toContain('two_way_limit');
  });

  it('cuts the lowest-value surplus while preserving positional minimums', () => {
    const players = [
      { id: 'qb1', position: 'QB', value: 90, salary: 30 },
      { id: 'qb2', position: 'QB', value: 60, salary: 10 },
      { id: 'wr1', position: 'WR', value: 80, salary: 20 },
      { id: 'wr2', position: 'WR', value: 50, salary: 10 },
    ];
    const result = autoCutRoster({
      sport: 'madden',
      players,
      rosterLimit: 3,
      financeLimit: 100,
      positionMinimums: { QB: 1, WR: 1 },
    });

    expect(result.kept.map(player => player.id)).toEqual(['qb1', 'qb2', 'wr1']);
    expect(result.cut.map(player => player.id)).toEqual(['wr2']);
    expect(result.compliance.valid).toBe(true);
  });

  it('continues cutting expensive low-value players until finance compliant', () => {
    const result = autoCutRoster({
      sport: 'mlb',
      players: [
        { id: 'star', position: 'SS', value: 95, salary: 70 },
        { id: 'mid', position: 'OF', value: 75, salary: 50 },
        { id: 'fringe', position: 'OF', value: 40, salary: 40 },
      ],
      rosterLimit: 40,
      financeLimit: 130,
      positionMinimums: { SS: 1, OF: 1 },
    });

    expect(result.cut.map(player => player.id)).toEqual(['fringe']);
    expect(result.compliance.payroll).toBe(120);
  });
});
