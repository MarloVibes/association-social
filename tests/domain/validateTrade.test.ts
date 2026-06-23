import { describe, expect, it } from 'vitest';
import { validateTrade } from '@/domain/finance/validateTrade';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { validateTrade: validateTradeJs } = require('../../functions/domain/validateTrade.js');

type Player = {
  player_id: string;
  salary: number;
};

function team(prefix: string, players: number, payroll: number, picks: string[] = []) {
  const salary = players > 0 ? payroll / players : 0;
  return {
    players: Array.from({ length: players }, (_, index): Player => ({
      player_id: `${prefix}-${index}`,
      salary,
    })),
    picks: picks.map(id => ({ id })),
  };
}

describe('validateTrade', () => {
  it('returns post-trade payroll and roster totals', () => {
    const teamA = team('a', 3, 30);
    const teamB = team('b', 2, 40);

    const result = validateTrade({
      sport: 'mlb',
      teamA,
      teamB,
      offerA: [teamA.players[0]],
      offerB: [teamB.players[0]],
      teamABudget: 100,
      teamBBudget: 100,
    });

    expect(result).toEqual({
      valid: true,
      errors: [],
      payrollAfter: { teamA: 40, teamB: 30 },
      rosterAfter: { teamA: 3, teamB: 2 },
    });
  });

  it('does not apply NBA salary matching to MLB', () => {
    const teamA = team('a', 39, 100);
    const teamB = team('b', 39, 100);

    const result = validateTrade({
      sport: 'mlb',
      teamA,
      teamB,
      offerA: [teamA.players[0]],
      offerB: [teamB.players[0]],
      teamABudget: 150,
      teamBBudget: 150,
    });

    expect(result.valid).toBe(true);
    expect(result.errors).not.toContain('nba_matching');
  });

  it('rejects an NFL roster above 53 without applying NBA matching', () => {
    const teamA = team('a', 53, 100);
    const teamB = team('b', 53, 100);

    const result = validateTrade({
      sport: 'nfl',
      teamA,
      teamB,
      offerA: [],
      offerB: [teamB.players[0]],
      teamACap: 200,
      teamBCap: 200,
    });

    expect(result.errors).toContain('roster_limit');
    expect(result.errors).not.toContain('nba_matching');
  });

  it('enforces hard caps for Madden and team budgets for MLB', () => {
    const nflA = team('nfl-a', 52, 190);
    const nflB = team('nfl-b', 52, 100);
    const mlbA = team('mlb-a', 39, 140);
    const mlbB = team('mlb-b', 39, 100);

    expect(validateTrade({
      sport: 'madden',
      teamA: nflA,
      teamB: nflB,
      offerA: [],
      offerB: [nflB.players[0]],
      teamACap: 191,
      teamBCap: 195,
    }).errors).toContain('financial_limit');

    expect(validateTrade({
      sport: 'mlb',
      teamA: mlbA,
      teamB: mlbB,
      offerA: [],
      offerB: [mlbB.players[0]],
      teamABudget: 142,
      teamBBudget: 145,
    }).errors).toContain('financial_limit');
  });

  it('applies NBA salary matching, roster limits, and cap limits', () => {
    const teamA = team('a', 15, 140);
    const teamB = team('b', 15, 120);

    const result = validateTrade({
      sport: 'nba',
      teamA,
      teamB,
      offerA: [teamA.players[0]],
      offerB: [teamB.players[0], teamB.players[1]],
      teamACap: 145,
      teamBCap: 145,
      nbaMatchingTolerance: 1.25,
      nbaMatchingBuffer: 0,
    });

    expect(result.errors).toContain('roster_limit');
    expect(result.errors).toContain('financial_limit');
    expect(result.errors).toContain('nba_matching');
  });

  it('uses authoritative roster salaries instead of offered salary snapshots', () => {
    const teamA = team('a', 15, 150);
    const teamB = team('b', 15, 300);

    const result = validateTrade({
      sport: 'nba',
      teamA,
      teamB,
      offerA: [{ ...teamA.players[0], salary: 1_000 }],
      offerB: [{ ...teamB.players[0], salary: 1_000 }],
      teamACap: 1_000,
      teamBCap: 1_000,
      nbaMatchingTolerance: 1.25,
      nbaMatchingBuffer: 0,
    });

    expect(result.errors).toContain('nba_matching');
    expect(result.payrollAfter.teamA).toBe(160);
    expect(result.payrollAfter.teamB).toBe(290);
  });

  it('rejects players and picks that the sending team does not own', () => {
    const teamA = team('a', 5, 50, ['a-pick']);
    const teamB = team('b', 5, 50, ['b-pick']);

    const result = validateTrade({
      sport: 'mlb',
      teamA,
      teamB,
      offerA: [{ player_id: 'missing-player', salary: 10 }],
      offerB: [],
      pickOfferA: [{ id: 'missing-pick' }],
      pickOfferB: [],
      teamABudget: 100,
      teamBBudget: 100,
    });

    expect(result.errors).toContain('ownership');
  });

  it('allows commissioner override only for financial and NBA matching errors', () => {
    const teamA = team('a', 15, 150);
    const teamB = team('b', 15, 300);

    const financialOnly = validateTrade({
      sport: 'nba',
      teamA,
      teamB,
      offerA: [teamA.players[0]],
      offerB: [teamB.players[0]],
      teamACap: 155,
      teamBCap: 1_000,
      nbaMatchingTolerance: 1.25,
      nbaMatchingBuffer: 0,
      commissionerOverride: true,
    });

    expect(financialOnly.valid).toBe(true);
    expect(financialOnly.errors).toEqual([]);

    const protectedTeamA = team('a', 53, 100);
    const protectedTeamB = team('b', 53, 100);
    const protectedErrors = validateTrade({
      sport: 'madden',
      teamA: protectedTeamA,
      teamB: protectedTeamB,
      offerA: [],
      offerB: [protectedTeamB.players[0]],
      pickOfferA: [{ id: 'missing-pick' }],
      teamACap: 200,
      teamBCap: 200,
      commissionerOverride: true,
    });

    expect(protectedErrors.valid).toBe(false);
    expect(protectedErrors.errors).toContain('ownership');
    expect(protectedErrors.errors).toContain('roster_limit');
  });

  it('keeps the server validator equivalent to the TypeScript validator', () => {
    const teamA = team('a', 40, 140, ['a-pick']);
    const teamB = team('b', 39, 100, ['b-pick']);
    const input = {
      sport: 'mlb',
      teamA,
      teamB,
      offerA: [teamA.players[0]],
      offerB: [],
      pickOfferA: [{ id: 'a-pick' }],
      pickOfferB: [],
      teamABudget: 130,
      teamBBudget: 200,
      commissionerOverride: true,
    };

    expect(validateTradeJs(input)).toEqual(validateTrade(input));
  });
});
