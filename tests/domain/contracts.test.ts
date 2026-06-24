import { describe, expect, it } from 'vitest';

import {
  scoreContractOffer,
  validateContractOfferFinance,
} from '../../domain/offseason/contracts';

const baseOffer = {
  salary: 20_000_000,
  years: 4,
  role: 'starter' as const,
  contender: 0.8,
  need: 0.9,
  loyalty: 0.5,
  reputation: 0.7,
  seed: 'player-team-2027',
};

describe('contract offer scoring', () => {
  it('produces the same preference score for the same seeded offer', () => {
    expect(scoreContractOffer(baseOffer)).toBe(scoreContractOffer(baseOffer));
  });

  it('rewards salary, years, role, contender status, need, loyalty, and reputation', () => {
    const baseline = scoreContractOffer(baseOffer);

    expect(scoreContractOffer({ ...baseOffer, salary: 25_000_000 })).toBeGreaterThan(baseline);
    expect(scoreContractOffer({ ...baseOffer, years: 5 })).toBeGreaterThan(baseline);
    expect(scoreContractOffer({ ...baseOffer, role: 'franchise' })).toBeGreaterThan(baseline);
    expect(scoreContractOffer({ ...baseOffer, contender: 1 })).toBeGreaterThan(baseline);
    expect(scoreContractOffer({ ...baseOffer, need: 1 })).toBeGreaterThan(baseline);
    expect(scoreContractOffer({ ...baseOffer, loyalty: 1 })).toBeGreaterThan(baseline);
    expect(scoreContractOffer({ ...baseOffer, reputation: 1 })).toBeGreaterThan(baseline);
  });

  it('uses a small deterministic variance without overpowering the offer', () => {
    const scores = Array.from({ length: 20 }, (_, index) =>
      scoreContractOffer({ ...baseOffer, seed: `seed-${index}` }),
    );

    expect(new Set(scores).size).toBeGreaterThan(1);
    expect(Math.max(...scores) - Math.min(...scores)).toBeLessThanOrEqual(4);
  });
});

describe('contract finance validation', () => {
  it('enforces the NFL and Madden hard cap', () => {
    expect(validateContractOfferFinance({
      sport: 'nfl',
      currentPayroll: 250_000_000,
      offerSalary: 6_000_000,
      financeLimit: 255_000_000,
    })).toEqual({
      valid: false,
      payrollAfter: 256_000_000,
      errors: ['financial_limit'],
    });

    expect(validateContractOfferFinance({
      sport: 'madden',
      currentPayroll: 250_000_000,
      offerSalary: 5_000_000,
      financeLimit: 255_000_000,
    }).valid).toBe(true);
  });

  it('enforces the MLB team budget', () => {
    const result = validateContractOfferFinance({
      sport: 'mlb',
      currentPayroll: 195_000_000,
      offerSalary: 10_000_000,
      financeLimit: 200_000_000,
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(['financial_limit']);
  });

  it('defers NBA cap exception enforcement to Phase 4', () => {
    expect(validateContractOfferFinance({
      sport: 'nba',
      currentPayroll: 180_000_000,
      offerSalary: 20_000_000,
      financeLimit: 140_000_000,
    })).toEqual({
      valid: true,
      payrollAfter: 200_000_000,
      errors: [],
    });
  });

  it('rejects invalid financial inputs for every sport', () => {
    expect(validateContractOfferFinance({
      sport: 'mlb',
      currentPayroll: 10,
      offerSalary: -1,
      financeLimit: 20,
    }).errors).toContain('invalid_salary');

    expect(validateContractOfferFinance({
      sport: 'madden',
      currentPayroll: Number.NaN,
      offerSalary: 1,
      financeLimit: 20,
    }).errors).toContain('invalid_payroll');
  });
});
