import { describe, expect, it } from 'vitest';

import {
  derivePlayerContractPreferences,
  contractDeadlinePlan,
  contractDeadlineWarning,
  expectedExtensionAsk,
  extensionInterestScore,
  expectedAnnualSalary,
  selectInSeasonExtensionCandidates,
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

describe('in-season extension interest', () => {
  it('invites happy loyal expiring players and lets unhappy low-loyalty players test free agency', () => {
    const loyalStar = {
      player_id: 'loyal-star',
      full_name: 'Loyal Star',
      contractYears: 1,
      loyalty: 0.9,
      morale: 0.86,
      minutes: 36,
      expectedMinutes: 34,
      overall: 90,
      playoffAppearances: 5,
    };
    const unhappyWing = {
      player_id: 'unhappy-wing',
      full_name: 'Unhappy Wing',
      contractYears: 1,
      loyalty: 0.18,
      morale: 0.28,
      minutes: 18,
      expectedMinutes: 30,
      overall: 82,
    };

    expect(extensionInterestScore({
      player: loyalStar,
      team: { contender: 0.82, reputation: 0.75 },
      seed: 'stable',
    }).interested).toBe(true);
    expect(extensionInterestScore({
      player: unhappyWing,
      team: { contender: 0.35, reputation: 0.45 },
      seed: 'stable',
    }).interested).toBe(false);
  });

  it('selects only one fresh in-season extension candidate per team cycle', () => {
    const candidates = selectInSeasonExtensionCandidates({
      seasonYear: 2027,
      team: {
        id: 'CHI',
        contender: 0.8,
        reputation: 0.7,
        players: [
          { player_id: 'rose', full_name: 'Derrick Rose', contractYears: 1, loyalty: 0.9, morale: 0.9, overall: 92 },
          { player_id: 'deng', full_name: 'Luol Deng', contractYears: 1, loyalty: 0.72, morale: 0.76, overall: 84 },
          { player_id: 'boozer', full_name: 'Carlos Boozer', contractYears: 2, loyalty: 0.9, morale: 0.9, overall: 83 },
        ],
      },
      existingWindowPlayerIds: ['deng'],
      seed: 'league:CHI',
    });

    expect(candidates.map(item => item.player.player_id)).toEqual(['rose']);
  });

  it('builds a player ask that GMs can use as an adjustable preset', () => {
    const ask = expectedExtensionAsk({
      player: {
        player_id: 'rose',
        full_name: 'Derrick Rose',
        age: 22,
        salary: 5_500_000,
        overall: 92,
        label: 'Superstar',
        loyalty: 0.85,
        morale: 0.9,
      },
      team: { contender: 0.88, reputation: 0.8 },
      eraSalaryBaseline: { median: 3_500_000, p75: 7_500_000, p90: 14_000_000 },
    });

    expect(ask.role).toBe('franchise');
    expect(ask.years).toBeGreaterThanOrEqual(4);
    expect(ask.salary).toBeGreaterThan(ask.currentSalary);
    expect(ask.acceptanceFloor).toBeLessThan(ask.salary);
  });
});

describe('contract deadline planning', () => {
  it('scales NBA trade and extension deadlines from real season game counts', () => {
    expect(contractDeadlinePlan({ gamesPerTeam: 82 })).toMatchObject({
      gamesPerTeam: 82,
      tradeDeadlineGame: 55,
      extensionDeadlineGame: 50,
    });
    expect(contractDeadlinePlan({ gamesPerTeam: 29 })).toMatchObject({
      gamesPerTeam: 29,
      tradeDeadlineGame: 19,
      extensionDeadlineGame: 18,
    });
  });

  it('warns GMs at 25 games remaining, 10 games remaining, and the deadline', () => {
    const plan = contractDeadlinePlan({ gamesPerTeam: 82 });

    expect(contractDeadlineWarning({ gamesPlayed: 30, deadlineGame: plan.tradeDeadlineGame }))
      .toBe('25_games_remaining');
    expect(contractDeadlineWarning({ gamesPlayed: 45, deadlineGame: plan.tradeDeadlineGame }))
      .toBe('10_games_remaining');
    expect(contractDeadlineWarning({ gamesPlayed: 55, deadlineGame: plan.tradeDeadlineGame }))
      .toBe('deadline_reached');
    expect(contractDeadlineWarning({ gamesPlayed: 40, deadlineGame: plan.tradeDeadlineGame }))
      .toBe(null);
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
