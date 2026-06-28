import { describe, expect, it } from 'vitest';

import {
  derivePlayerContractPreferences,
  expectedAnnualSalary,
  scoreContractOffer,
  selectContractCandidates,
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

  it('derives NBA player preferences from salary, longevity, age, and team movement history', () => {
    const loyalVeteran = derivePlayerContractPreferences({
      player: {
        player_id: 'veteran',
        age: 34,
        salary: 16_000_000,
        contractYears: 4,
        team: 'SAS',
        teamHistory: ['SAS', 'SAS', 'SAS', 'SAS'],
        playoffAppearances: 9,
      },
      eraSalaryBaseline: { median: 8_000_000, p75: 14_000_000, p90: 22_000_000 },
    });
    const journeymanScorer = derivePlayerContractPreferences({
      player: {
        player_id: 'scorer',
        age: 27,
        salary: 7_000_000,
        contractYears: 1,
        teamHistory: ['NYK', 'DEN', 'DAL', 'PHX'],
        label: 'Starter',
      },
      eraSalaryBaseline: { median: 8_000_000, p75: 14_000_000, p90: 22_000_000 },
    });

    expect(loyalVeteran.loyalty).toBeGreaterThan(journeymanScorer.loyalty);
    expect(loyalVeteran.winning).toBeGreaterThan(journeymanScorer.winning);
    expect(journeymanScorer.money).toBeGreaterThan(loyalVeteran.money);
    expect(journeymanScorer.role).toBeGreaterThan(loyalVeteran.role);
  });

  it('uses era salary baselines to estimate asking price from existing contracts', () => {
    const rose2011 = expectedAnnualSalary({
      player: {
        player_id: 'rose-2011',
        age: 22,
        salary: 5_546_160,
        label: 'Superstar',
        overall: 92,
      },
      role: 'franchise',
      eraSalaryBaseline: { median: 3_500_000, p75: 7_500_000, p90: 14_000_000 },
    });
    const sameSalaryModern = expectedAnnualSalary({
      player: {
        player_id: 'modern-role-player',
        age: 29,
        salary: 5_546_160,
        label: 'Role Player',
        overall: 74,
      },
      role: 'rotation',
      eraSalaryBaseline: { median: 9_000_000, p75: 18_000_000, p90: 36_000_000 },
    });

    expect(rose2011).toBeGreaterThan(sameSalaryModern);
    expect(rose2011).toBeGreaterThan(5_546_160);
  });

  it('lets player preferences change which NBA offer wins', () => {
    const moneyFirst = scoreContractOffer({
      ...baseOffer,
      salary: 24_000_000,
      years: 2,
      contender: 0.35,
      role: 'starter',
      playerPreferences: { money: 0.55, loyalty: 0.05, winning: 0.1, role: 0.2, market: 0.05, security: 0.05 },
    });
    const winningOffer = scoreContractOffer({
      ...baseOffer,
      salary: 18_000_000,
      years: 2,
      contender: 0.95,
      role: 'starter',
      playerPreferences: { money: 0.55, loyalty: 0.05, winning: 0.1, role: 0.2, market: 0.05, security: 0.05 },
    });
    const ringChaserMoney = scoreContractOffer({
      ...baseOffer,
      salary: 24_000_000,
      years: 2,
      contender: 0.35,
      role: 'starter',
      playerPreferences: { money: 0.15, loyalty: 0.1, winning: 0.45, role: 0.1, market: 0.05, security: 0.15 },
    });
    const ringChaserWinner = scoreContractOffer({
      ...baseOffer,
      salary: 18_000_000,
      years: 2,
      contender: 0.95,
      role: 'starter',
      playerPreferences: { money: 0.15, loyalty: 0.1, winning: 0.45, role: 0.1, market: 0.05, security: 0.15 },
    });

    expect(moneyFirst).toBeGreaterThan(winningOffer);
    expect(ringChaserWinner).toBeGreaterThan(ringChaserMoney);
  });
});

describe('contract candidate selection', () => {
  it('uses the free agent pool first and falls back to expired roster contracts', () => {
    const teams: any[] = [
      {
        id: 'CHI',
        players: [
          { player_id: 'rose', full_name: 'Derrick Rose', contractYears: 2 },
          { player_id: 'deng', full_name: 'Luol Deng', contractYears: 0, contractExpired: true },
        ],
      },
    ];

    expect(selectContractCandidates({
      stage: 'free_agency',
      teams,
      freeAgents: [{ player_id: 'pool', full_name: 'Pool Player' }],
    }).map(player => player.player_id)).toEqual(['pool']);

    expect(selectContractCandidates({
      stage: 'free_agency',
      teams,
      freeAgents: [] as any[],
    }).map(player => player.player_id)).toEqual(['deng']);
  });

  it('selects only the controlled team expiring players for re-signing', () => {
    expect(selectContractCandidates({
      stage: 're_signing',
      myTeamId: 'CHI',
      teams: [
        { id: 'CHI', players: [{ player_id: 'deng', contractYears: 1 }, { player_id: 'rose', contractYears: 3 }] },
        { id: 'SAS', players: [{ player_id: 'duncan', contractYears: 1 }] },
      ],
      freeAgents: [],
    }).map(player => player.player_id)).toEqual(['deng']);
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
