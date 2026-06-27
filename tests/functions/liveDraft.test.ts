import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  applyDraftPick,
  assertLeagueDraftIsLive,
  authorizeAutoPick,
  buildDraftedPlayer,
  buildDraftOrder,
  chooseBoardAutoPick,
  createSaveDraftBoardHandler,
  createDraftSession,
  draftRoundsForSport,
  buildDraftFranchises,
  DEFAULT_DRAFT_PICK_SECONDS,
  validateManualDraftPick,
} = require('../../functions/franchise/liveDraft.js');

class FakeHttpsError extends Error {
  code: string;
  details: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

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

  it('materializes NBA draft franchises and keeps expansion teams in the order', () => {
    const nba = buildDraftFranchises('nba', [
      {
        id: 'league_hornets',
        teamId: 'NOH',
        abbreviation: 'NOH',
        gmId: 'gm-noh',
        name: 'New Orleans Hornets',
      },
      {
        id: 'league_vegas',
        teamId: 'LV',
        abbreviation: 'LV',
        gmId: 'gm-lv',
        name: 'Las Vegas Neon',
      },
    ], [
      { player_id: 'noh-player', team: 'NOH' },
      { player_id: 'lv-player', team: 'LV' },
    ]);

    expect(nba.length).toBeGreaterThanOrEqual(30);
    expect(nba.find((team: any) => team.teamId === 'NOH')).toMatchObject({
      id: 'league_hornets',
      gmId: 'gm-noh',
      virtual: false,
    });
    expect(nba.find((team: any) => team.teamId === 'LV')).toMatchObject({
      id: 'league_vegas',
      gmId: 'gm-lv',
      virtual: false,
    });
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
    expect(DEFAULT_DRAFT_PICK_SECONDS).toBe(80);
    expect(draftRoundsForSport('nba')).toBe(2);
    expect(draftRoundsForSport('madden')).toBe(7);
    expect(draftRoundsForSport('mlb')).toBe(5);
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

  it('uses the pre-draft board before fallback auto-pick logic', () => {
    expect(chooseBoardAutoPick({
      prospects,
      selectedIds: ['p2'],
      draftBoard: ['missing', 'p2', 'p4', 'p1'],
      needs: { QB: 1 },
    })).toMatchObject({ id: 'p4' });
    expect(chooseBoardAutoPick({
      prospects,
      selectedIds: ['p2', 'p4'],
      draftBoard: ['p2', 'p4'],
      needs: { QB: 1 },
    })).toMatchObject({ id: 'p1' });
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

  it('adds sport-specific rookie contract data to drafted players', () => {
    const prospect = { id: 'ace', full_name: 'Draft Ace', position: 'PG', talent: 95 };
    const nbaLotteryPick = buildDraftedPlayer({
      prospect,
      session: { sport: 'nba', seasonYear: 2027, currentOverallPick: 3, round: 1 },
      league: { salaryCap: 160_000_000, rookieScaleBase: 8_000_000, minimumSalary: 1_200_000 },
    });
    expect(nbaLotteryPick).toMatchObject({
      rookie: true,
      contractType: 'rookie_scale',
      contractYears: 4,
      draftedSeason: 2027,
      draftedOverall: 3,
      draftedRound: 1,
    });
    expect(nbaLotteryPick.salary).toBeGreaterThan(1_200_000);

    expect(buildDraftedPlayer({
      prospect,
      session: { sport: 'nba', seasonYear: 2027, currentOverallPick: 45, round: 2 },
      league: { minimumSalary: 1_200_000 },
    })).toMatchObject({
      rookie: true,
      contractType: 'minimum_rookie',
      contractYears: 2,
      salary: 1_200_000,
    });

    expect(buildDraftedPlayer({
      prospect,
      session: { sport: 'madden', seasonYear: 2027, currentOverallPick: 1, round: 1 },
      league: {},
    })).toMatchObject({
      rookie: true,
      contractType: 'rookie',
      contractYears: 4,
      salary: 5_000_000,
    });

    expect(buildDraftedPlayer({
      prospect,
      session: { sport: 'mlb', seasonYear: 2027, currentOverallPick: 20, round: 1 },
      league: {},
    })).toMatchObject({
      rookie: true,
      contractType: 'pre_arbitration',
      contractYears: 3,
      salary: 760_000,
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

  it('lets a GM save an ordered pre-draft board on their team', async () => {
    const teamRef = { kind: 'team' };
    const teamsQuery = { kind: 'teams-query' };
    const leagueRef = {
      collection: (name: string) => (name === 'teams' ? teamsQuery : { kind: name }),
    };
    const leagueSnap = {
      exists: true,
      data: () => ({ members: ['gm-a'], commissionerId: 'comm' }),
    };
    const teamsSnap = {
      docs: [
        { id: 'a', ref: teamRef, data: () => ({ gmId: 'gm-a' }) },
        { id: 'b', ref: { kind: 'other' }, data: () => ({ gmId: 'gm-b' }) },
      ],
    };
    const updates: any[] = [];
    const tx = {
      get: async (ref: any) => (ref === leagueRef ? leagueSnap : teamsSnap),
      update: (_ref: any, patch: any) => updates.push(patch),
    };
    const db = {
      collection: () => ({ doc: () => leagueRef }),
      runTransaction: async (callback: any) => callback(tx),
    };
    const handler = createSaveDraftBoardHandler({
      getFirestore: () => db,
      serverTimestamp: () => 'now',
      HttpsError: FakeHttpsError,
    });

    await expect(handler({
      auth: { uid: 'gm-a' },
      data: { leagueId: 'league-1', prospectIds: ['p1', 'p2', 'p1', '', 'p3'] },
    })).resolves.toEqual({ draftBoard: ['p1', 'p2', 'p3'] });
    expect(updates).toEqual([{
      draftBoard: ['p1', 'p2', 'p3'],
      preDraftList: ['p1', 'p2', 'p3'],
      draftBoardUpdatedAt: 'now',
    }]);
  });
});
