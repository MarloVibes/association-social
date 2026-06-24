import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  applyDraftPick,
  assertLeagueDraftIsLive,
  authorizeAutoPick,
  buildDraftOrder,
  createDraftSession,
  buildDraftFranchises,
  validateManualDraftPick,
} = require('../../functions/franchise/liveDraft.js');

const teams = [
  { id: 'a', gmId: 'gm-a', needs: { QB: 1 } },
  { id: 'b', gmId: null, needs: { WR: 1 } },
];

const prospects = [
  { id: 'p1', player_id: 'p1', full_name: 'One', position: 'QB', talent: 90 },
  { id: 'p2', player_id: 'p2', full_name: 'Two', position: 'WR', talent: 85 },
  { id: 'p3', player_id: 'p3', full_name: 'Three', position: 'CB', talent: 80 },
  { id: 'p4', player_id: 'p4', full_name: 'Four', position: 'SS', talent: 78 },
];

describe('live draft domain', () => {
  it('materializes every sport franchise while preserving claimed teams', () => {
    const nfl = buildDraftFranchises('madden', [{
      id: 'league_gm',
      teamId: 'BUF',
      abbreviation: 'BUF',
      gmId: 'gm',
      name: 'Buffalo Bills',
    }], [
      { player_id: 'mia-player', team: 'MIA' },
    ]);
    expect(nfl).toHaveLength(32);
    expect(nfl.find((team: any) => team.teamId === 'BUF')).toMatchObject({
      id: 'league_gm',
      gmId: 'gm',
    });
    expect(nfl.find((team: any) => team.teamId === 'MIA')).toMatchObject({
      id: 'cpu_MIA',
      gmId: null,
      virtual: true,
      players: [{ player_id: 'mia-player', team: 'MIA' }],
    });
    expect(buildDraftFranchises('mlb', [])).toHaveLength(30);
  });

  it('rejects picks when the league is not in the active live draft stage', () => {
    expect(() => assertLeagueDraftIsLive({
      offseason: { stage: 'live_draft', draftStatus: 'live', seasonYear: 2027 },
    })).not.toThrow();
    expect(() => assertLeagueDraftIsLive({
      offseason: { stage: 'roster_cuts', draftStatus: 'complete', seasonYear: 2027 },
    })).toThrow(expect.objectContaining({ code: 'failed-precondition' }));
  });

  it('builds a deterministic team order and initializes the first deadline', () => {
    expect(buildDraftOrder(teams, ['b', 'a'])).toEqual(['b', 'a']);
    expect(createDraftSession({
      seasonYear: 2027,
      sport: 'madden',
      teamOrder: ['a', 'b'],
      rounds: 2,
      timerSeconds: 90,
      now: 1_000,
    })).toEqual({
      seasonYear: 2027,
      sport: 'madden',
      status: 'live',
      teamOrder: ['a', 'b'],
      totalPicks: 4,
      currentOverallPick: 1,
      currentTeamId: 'a',
      round: 1,
      deadlineMillis: 91_000,
      selectedIds: [],
      picks: [],
      version: 0,
    });
  });

  it('allows only the current GM, current version, available player, and live clock', () => {
    const session = createDraftSession({
      seasonYear: 2027,
      sport: 'madden',
      teamOrder: ['a', 'b'],
      rounds: 2,
      timerSeconds: 90,
      now: 1_000,
    });
    expect(validateManualDraftPick({
      uid: 'gm-a',
      team: teams[0],
      session,
      prospectId: 'p1',
      expectedPickNumber: 1,
      expectedVersion: 0,
      now: 2_000,
    })).toEqual({ valid: true });
    expect(validateManualDraftPick({
      uid: 'gm-b',
      team: teams[0],
      session,
      prospectId: 'p1',
      expectedPickNumber: 1,
      expectedVersion: 0,
      now: 2_000,
    })).toMatchObject({ valid: false, code: 'permission-denied' });
    expect(validateManualDraftPick({
      uid: 'gm-a',
      team: teams[0],
      session,
      prospectId: 'p1',
      expectedPickNumber: 1,
      expectedVersion: 0,
      now: 100_000,
    })).toMatchObject({ valid: false, reason: 'clock_expired' });
  });

  it('advances exactly one pick and completes after the final selection', () => {
    const session = createDraftSession({
      seasonYear: 2027,
      sport: 'mlb',
      teamOrder: ['a', 'b'],
      rounds: 1,
      timerSeconds: 60,
      now: 1_000,
    });
    const first = applyDraftPick({
      session,
      teamId: 'a',
      prospect: prospects[0],
      selectedBy: 'gm-a',
      selectionType: 'manual',
      now: 2_000,
      timerSeconds: 60,
    });
    expect(first).toMatchObject({
      currentOverallPick: 2,
      currentTeamId: 'b',
      round: 1,
      version: 1,
      selectedIds: ['p1'],
    });
    const final = applyDraftPick({
      session: first,
      teamId: 'b',
      prospect: prospects[1],
      selectedBy: 'system',
      selectionType: 'auto',
      now: 3_000,
      timerSeconds: 60,
    });
    expect(final).toMatchObject({
      status: 'complete',
      currentOverallPick: 3,
      currentTeamId: null,
      deadlineMillis: null,
      version: 2,
    });
  });

  it('permits auto-pick for commissioner, expired clock, or vacant current team', () => {
    const live = createDraftSession({
      seasonYear: 2027,
      sport: 'madden',
      teamOrder: ['a', 'b'],
      rounds: 1,
      timerSeconds: 60,
      now: 1_000,
    });
    expect(authorizeAutoPick({
      uid: 'comm',
      commissionerIds: ['comm'],
      currentTeam: teams[0],
      session: live,
      now: 2_000,
    })).toBe(true);
    expect(authorizeAutoPick({
      uid: 'member',
      commissionerIds: ['comm'],
      currentTeam: teams[0],
      session: live,
      now: 70_000,
    })).toBe(true);
    expect(authorizeAutoPick({
      uid: 'member',
      commissionerIds: ['comm'],
      currentTeam: teams[1],
      session: { ...live, currentTeamId: 'b' },
      now: 2_000,
    })).toBe(true);
    expect(authorizeAutoPick({
      uid: 'member',
      commissionerIds: ['comm'],
      currentTeam: teams[0],
      session: live,
      now: 2_000,
    })).toBe(false);
  });
});
