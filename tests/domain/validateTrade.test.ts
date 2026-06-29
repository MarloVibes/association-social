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
      messages: [],
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

  it('applies NBA salary matching and roster limits without treating salaryCap as a hard cap', () => {
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
    expect(result.errors).not.toContain('financial_limit');
    expect(result.errors).toContain('nba_matching');
  });

  it('explains NBA salary matching and roster failures in plain language', () => {
    const teamA = {
      players: [
        { player_id: 'tor-0', salary: 18_000_000 },
        ...team('tor', 14, 132_000_000).players.map((player, index) => ({ ...player, player_id: `tor-${index + 1}` })),
      ],
    };
    const teamB = {
      players: [
        { player_id: 'mia-0', salary: 5_000_000 },
        { player_id: 'mia-1', salary: 0 },
        ...team('mia', 13, 145_000_000).players.map((player, index) => ({ ...player, player_id: `mia-${index + 2}` })),
      ],
    };

    const result = validateTrade({
      sport: 'nba',
      teamA,
      teamB,
      teamALabel: 'Toronto',
      teamBLabel: 'Miami',
      offerA: [{ player_id: 'tor-0' }],
      offerB: [{ player_id: 'mia-0' }, { player_id: 'mia-1' }],
      nbaMatchingTolerance: 1.25,
      nbaMatchingBuffer: 0,
    });

    expect(result.valid).toBe(false);
    expect(result.messages).toEqual(expect.arrayContaining([
      'Miami needs to add about $9.4M more outgoing salary for NBA matching.',
      'Toronto will exceed the 15-player roster limit with 16 players after this trade.',
    ]));
  });

  it('keeps server and app trade explanations equivalent', () => {
    const teamA = {
      players: [
        { player_id: 'a-0', salary: 18_000_000 },
        ...team('a', 14, 132_000_000).players.map((player, index) => ({ ...player, player_id: `a-${index + 1}` })),
      ],
    };
    const teamB = {
      players: [
        { player_id: 'b-0', salary: 5_000_000 },
        ...team('b', 14, 145_000_000).players.map((player, index) => ({ ...player, player_id: `b-${index + 1}` })),
      ],
    };
    const input = {
      sport: 'nba',
      teamA,
      teamB,
      teamALabel: 'Atlanta',
      teamBLabel: 'Boston',
      offerA: [{ player_id: 'a-0' }],
      offerB: [{ player_id: 'b-0' }],
      nbaMatchingTolerance: 1.25,
      nbaMatchingBuffer: 0,
    };

    expect(validateTradeJs(input).messages).toEqual(validateTrade(input).messages);
  });

  it('rejects duplicate player and pick keys as ownership errors', () => {
    const teamA = team('a', 5, 50, ['a-pick']);
    const teamB = team('b', 5, 50, ['b-pick']);

    for (const validate of [validateTrade, validateTradeJs]) {
      const duplicatePlayers = validate({
        sport: 'mlb',
        teamA,
        teamB,
        offerA: [teamA.players[0], teamA.players[0]],
        teamABudget: 100,
        teamBBudget: 100,
        commissionerOverride: true,
      });
      const duplicatePicks = validate({
        sport: 'mlb',
        teamA,
        teamB,
        pickOfferA: [{ id: 'a-pick' }, { id: 'a-pick' }],
        teamABudget: 100,
        teamBBudget: 100,
        commissionerOverride: true,
      });

      expect(duplicatePlayers.errors).toContain('ownership');
      expect(duplicatePicks.errors).toContain('ownership');
    }
  });

  it('normalizes nfl to Madden and unknown or malformed sports to NBA', () => {
    const teamA = team('a', 15, 150);
    const teamB = team('b', 15, 300);

    for (const validate of [validateTrade, validateTradeJs]) {
      const nfl = validate({
        sport: 'nfl',
        teamA,
        teamB,
        teamACap: 1_000,
        teamBCap: 1_000,
      });
      expect(nfl.errors).not.toContain('roster_limit');

      for (const sport of ['soccer', '', null, 42]) {
        const result = validate({
          sport,
          teamA,
          teamB,
          offerA: [teamA.players[0]],
          offerB: [teamB.players[0]],
          teamACap: 1,
          teamBCap: 1,
          nbaMatchingTolerance: 1.25,
          nbaMatchingBuffer: 0,
        } as Parameters<typeof validateTrade>[0]);

        expect(result.errors).toContain('nba_matching');
        expect(result.errors).not.toContain('financial_limit');
      }
    }
  });

  it('never lets commissioner override remove invalid authoritative salary errors', () => {
    for (const invalidSalary of [-1, Number.NaN, Number.POSITIVE_INFINITY, '10', undefined]) {
      const teamA = {
        players: [{ player_id: 'a-0', salary: invalidSalary }],
        picks: [],
      };
      const teamB = team('b', 1, 10);

      for (const validate of [validateTrade, validateTradeJs]) {
        const result = validate({
          sport: 'mlb',
          teamA,
          teamB,
          offerA: [{ player_id: 'a-0', salary: 999 }],
          teamABudget: 100,
          teamBBudget: 100,
          commissionerOverride: true,
        } as Parameters<typeof validateTrade>[0]);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('invalid_salary');
        expect(result.errors).not.toContain('financial_limit');
      }
    }
  });

  it('requires finite caps for NFL and finite budgets for MLB', () => {
    const teamA = team('a', 5, 50);
    const teamB = team('b', 5, 50);

    for (const validate of [validateTrade, validateTradeJs]) {
      for (const teamACap of [undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(validate({
          sport: 'nfl',
          teamA,
          teamB,
          teamACap,
          teamBCap: 100,
        }).errors).toContain('financial_limit');
      }

      for (const teamABudget of [undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(validate({
          sport: 'mlb',
          teamA,
          teamB,
          teamABudget,
          teamBBudget: 100,
        }).errors).toContain('financial_limit');
      }
    }
  });

  it('does not let commissioner override remove duplicate ownership or roster errors', () => {
    const teamA = team('a', 53, 100);
    const teamB = team('b', 53, 100);

    for (const validate of [validateTrade, validateTradeJs]) {
      const result = validate({
        sport: 'madden',
        teamA,
        teamB,
        offerA: [teamA.players[0], teamA.players[0]],
        offerB: [teamB.players[0], teamB.players[1], teamB.players[2]],
        teamACap: Number.NaN,
        teamBCap: Number.NaN,
        commissionerOverride: true,
      });

      expect(result.errors).toContain('ownership');
      expect(result.errors).toContain('roster_limit');
      expect(result.errors).not.toContain('financial_limit');
    }
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
