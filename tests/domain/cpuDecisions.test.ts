import { describe, expect, it } from 'vitest';

import {
  buildCpuDecisionId,
  createCpuContractDecisions,
  type CpuContractDecisionInput,
} from '../../domain/offseason/cpu';

function input(
  overrides: Partial<CpuContractDecisionInput> = {},
): CpuContractDecisionInput {
  return {
    leagueId: 'league-1',
    seasonYear: 2027,
    stage: 'free_agency',
    team: {
      id: 'team-1',
      sport: 'madden',
      currentPayroll: 30_000_000,
      financeLimit: 50_000_000,
      currentRosterCount: 2,
      rosterLimit: 4,
      needs: ['WR'],
      contender: 0.7,
      reputation: 0.6,
    },
    candidates: [
      {
        id: 'own-rb',
        incumbentTeamId: 'team-1',
        position: 'RB',
        age: 24,
        value: 88,
        role: 'starter',
        askingSalary: 8_000_000,
        askingYears: 4,
        loyalty: 0.8,
      },
      {
        id: 'free-wr',
        incumbentTeamId: 'team-2',
        position: 'WR',
        age: 27,
        value: 82,
        role: 'starter',
        askingSalary: 6_000_000,
        askingYears: 3,
        loyalty: 0.2,
      },
      {
        id: 'free-qb',
        incumbentTeamId: 'team-3',
        position: 'QB',
        age: 26,
        value: 91,
        role: 'starter',
        askingSalary: 5_000_000,
        askingYears: 3,
        loyalty: 0.1,
      },
    ],
    existingDecisionIds: [],
    ...overrides,
  };
}

describe('CPU contract decisions', () => {
  it('retains valuable young starters and bids externally only for team needs', () => {
    const reSignDecisions = createCpuContractDecisions(input({ stage: 're_signing' }));
    const freeAgentDecisions = createCpuContractDecisions(input());

    expect(reSignDecisions.map(decision => [decision.playerId, decision.kind])).toEqual([
      ['own-rb', 're_sign'],
    ]);
    expect(freeAgentDecisions.map(decision => [decision.playerId, decision.kind])).toEqual([
      ['free-wr', 'free_agent_bid'],
    ]);
    expect(freeAgentDecisions.some(decision => decision.playerId === 'free-qb')).toBe(false);
  });

  it('derives stable decision IDs from league, season, stage, team, and player', () => {
    const expected = 'league-1:2027:free_agency:team-1:free-wr';

    expect(buildCpuDecisionId({
      leagueId: 'league-1',
      seasonYear: 2027,
      stage: 'free_agency',
      teamId: 'team-1',
      playerId: 'free-wr',
    })).toBe(expected);
    expect(createCpuContractDecisions(input())).toEqual(
      createCpuContractDecisions(input()),
    );
  });

  it('does not emit an existing decision or decide twice for a duplicate player', () => {
    const duplicate = input().candidates[1];
    const existingDecisionId = buildCpuDecisionId({
      leagueId: 'league-1',
      seasonYear: 2027,
      stage: 'free_agency',
      teamId: 'team-1',
      playerId: 'own-rb',
    });
    const decisions = createCpuContractDecisions(input({
      candidates: [...input().candidates, duplicate],
      existingDecisionIds: [existingDecisionId],
    }));

    expect(decisions.map(decision => decision.playerId)).toEqual(['free-wr']);
  });

  it('stops before exceeding roster capacity', () => {
    const decisions = createCpuContractDecisions(input({
      team: {
        ...input().team,
        currentRosterCount: 3,
        rosterLimit: 4,
      },
    }));

    expect(decisions.map(decision => decision.playerId)).toEqual(['free-wr']);
    expect(decisions.at(-1)?.rosterCountAfter).toBe(4);
  });

  it('can re-sign an incumbent at the roster limit without adding a roster slot', () => {
    const decisions = createCpuContractDecisions(input({
      stage: 're_signing',
      team: {
        ...input().team,
        currentRosterCount: 4,
        rosterLimit: 4,
      },
      candidates: [{
        ...input().candidates[0],
        currentSalary: 5_000_000,
      }],
    }));

    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({
      kind: 're_sign',
      rosterCountAfter: 4,
      payrollAfter: 33_000_000,
    });
  });

  it('skips offers that would exceed an NFL hard cap or MLB team budget', () => {
    const nflDecisions = createCpuContractDecisions(input({
      team: {
        ...input().team,
        currentPayroll: 45_000_000,
        financeLimit: 50_000_000,
      },
    }));
    const mlbDecisions = createCpuContractDecisions(input({
      team: {
        ...input().team,
        sport: 'mlb',
        currentPayroll: 45_000_000,
        financeLimit: 50_000_000,
      },
    }));

    expect(nflDecisions).toEqual([]);
    expect(mlbDecisions).toEqual([]);
  });

  it('leaves NBA cap handling deferred while still respecting roster capacity', () => {
    const decisions = createCpuContractDecisions(input({
      team: {
        ...input().team,
        sport: 'nba',
        currentPayroll: 200_000_000,
        financeLimit: 100_000_000,
      },
    }));

    expect(decisions.map(decision => decision.playerId)).toEqual(['free-wr']);
  });
});
