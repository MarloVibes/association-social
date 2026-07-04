import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  buildOffseasonStageNotification,
  createAdvanceOffseasonHandler,
  isOffseasonStageDue,
  hasPlayoffChampion,
  initializeOffseason,
  transitionForCallable,
  validateAdvanceInput,
} = require('../../functions/franchise/offseasonCallable.js');

class FakeHttpsError extends Error {
  code: string;
  details: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

describe('offseason callable helpers', () => {
  it('recognizes due timed stages and builds member notification payloads', () => {
    expect(isOffseasonStageDue({
      stage: 'awards_recap',
      stageEndsAt: new Date('2026-06-27T20:00:00.000Z'),
      stageDurationSeconds: 600,
    }, Date.parse('2026-06-27T20:00:01.000Z'))).toBe(true);
    expect(isOffseasonStageDue({
      stage: 'awards_recap',
      stageEndsAt: new Date('2026-06-27T20:00:00.000Z'),
      stageDurationSeconds: 600,
    }, Date.parse('2026-06-27T19:59:59.000Z'))).toBe(false);

    expect(buildOffseasonStageNotification({
      leagueId: 'league-1',
      leagueName: 'NBA Test',
      offseason: { stage: 'lottery_and_draft_order', seasonYear: 2031, version: 2 },
    })).toMatchObject({
      type: 'offseason_stage',
      leagueId: 'league-1',
      stage: 'lottery_and_draft_order',
      seasonYear: 2031,
      message: 'NBA Test moved to Lottery & Draft Order.',
      read: false,
    });
  });

  it('strictly validates callable input', () => {
    expect(validateAdvanceInput({
      leagueId: ' league-1 ',
      expectedStage: ' season_end ',
      expectedVersion: 0,
    })).toEqual({
      leagueId: 'league-1',
      expectedStage: 'season_end',
      expectedVersion: 0,
    });

    for (const data of [
      {},
      { leagueId: 1, expectedStage: 'season_end', expectedVersion: 0 },
      { leagueId: 'league-1', expectedStage: '', expectedVersion: 0 },
      { leagueId: 'league-1', expectedStage: 'broken_stage', expectedVersion: 0 },
      { leagueId: 'league-1', expectedStage: 'season_end', expectedVersion: '0' },
      { leagueId: 'league-1', expectedStage: 'season_end', expectedVersion: -1 },
      { leagueId: 'league-1', expectedStage: 'season_end', expectedVersion: 1.5 },
    ]) {
      expect(() => validateAdvanceInput(data)).toThrow(expect.objectContaining({
        code: 'invalid-argument',
      }));
    }
  });

  it('initializes only the first season_end transition with sport defaults', () => {
    expect(initializeOffseason(
      { sport: 'mlb', draftTimerSeconds: 90 },
      'season_end',
      0,
    )).toEqual({
      stage: 'season_end',
      seasonYear: 2026,
      stageStartedAt: null,
      completedTeamIds: [],
      draftTimerSeconds: 90,
      draftStatus: 'none',
      version: 0,
    });
    expect(initializeOffseason(
      { sport: 'nba', currentYear: 2030 },
      'awards_recap',
      0,
    )).toEqual(expect.objectContaining({
      stage: 'awards_recap',
      seasonYear: 2030,
      draftTimerSeconds: 120,
      stageDurationSeconds: 600,
    }));
    expect(() => initializeOffseason({}, 're_signing', 0)).toThrow(expect.objectContaining({
      code: 'aborted',
    }));
  });

  it('allows passive stages but enforces completed claimed teams for action stages', () => {
    const teams = [{ id: 'a', gmId: 'gm-a' }];
    const base = {
      sport: 'mlb',
      commissionerId: 'comm',
      offseason: {
        stage: 'season_end',
        seasonYear: 2026,
        stageStartedAt: null,
        completedTeamIds: [],
        draftTimerSeconds: 120,
        draftStatus: 'none',
        version: 0,
      },
    };
    expect(transitionForCallable({
      uid: 'comm',
      league: base,
      teams,
      expectedStage: 'season_end',
      expectedVersion: 0,
      stageStartedAt: 'now',
    }).stage).toBe('re_signing');

    expect(() => transitionForCallable({
      uid: 'comm',
      league: {
        ...base,
        offseason: { ...base.offseason, stage: 're_signing', version: 1 },
      },
      teams,
      expectedStage: 're_signing',
      expectedVersion: 1,
      stageStartedAt: 'now',
    })).toThrow(expect.objectContaining({ code: 'failed-precondition' }));
  });

  it('accepts the irreversible warning timestamp when NBA timed offseason starts', () => {
    const started = initializeOffseason(
      { sport: 'nba', currentYear: 2031 },
      'awards_recap',
      0,
      'accepted-warning',
      'deadline',
    );
    expect(started).toEqual(expect.objectContaining({
      stage: 'awards_recap',
      stageDurationSeconds: 600,
      warningAcceptedAt: 'accepted-warning',
      stageEndsAt: 'deadline',
    }));
  });

  it('detects a crowned playoff champion before NBA offseason starts', () => {
    expect(hasPlayoffChampion({ playoffs: { rounds: [] } })).toBe(false);
    expect(hasPlayoffChampion({
      playoffs: {
        rounds: [{
          name: 'final',
          series: [{ winnerTeamId: 'CHI' }],
        }],
      },
    })).toBe(true);
  });

  it('requires all contract rounds and pending offers to resolve before advancing', () => {
    const league = {
      sport: 'mlb',
      commissionerId: 'comm',
      offseason: {
        stage: 'free_agency',
        seasonYear: 2027,
        completedTeamIds: [],
        draftStatus: 'none',
        version: 3,
        contractRoundsComplete: false,
      },
    };
    expect(() => transitionForCallable({
      uid: 'comm',
      league,
      teams: [],
      expectedStage: 'free_agency',
      expectedVersion: 3,
      pendingContractOfferCount: 0,
      stageStartedAt: 'now',
    })).toThrow(expect.objectContaining({ code: 'failed-precondition' }));
    expect(() => transitionForCallable({
      uid: 'comm',
      league: {
        ...league,
        offseason: { ...league.offseason, contractRoundsComplete: true },
      },
      teams: [],
      expectedStage: 'free_agency',
      expectedVersion: 3,
      pendingContractOfferCount: 1,
      stageStartedAt: 'now',
    })).toThrow(expect.objectContaining({ code: 'failed-precondition' }));
    expect(transitionForCallable({
      uid: 'comm',
      league: {
        ...league,
        offseason: { ...league.offseason, contractRoundsComplete: true },
      },
      teams: [],
      expectedStage: 'free_agency',
      expectedVersion: 3,
      pendingContractOfferCount: 0,
      stageStartedAt: 'now',
    }).stage).toBe('draft_class_review');
  });

  it('requires NBA draft lottery completion before leaving lottery stage', () => {
    const league = {
      sport: 'nba',
      commissionerId: 'comm',
      offseason: {
        stage: 'lottery_and_draft_order',
        seasonYear: 2032,
        completedTeamIds: [],
        draftStatus: 'none',
        version: 2,
      },
    };
    expect(() => transitionForCallable({
      uid: 'comm',
      league,
      teams: [],
      expectedStage: 'lottery_and_draft_order',
      expectedVersion: 2,
      stageStartedAt: 'now',
    })).toThrow(expect.objectContaining({ code: 'failed-precondition' }));
    expect(transitionForCallable({
      uid: 'comm',
      league: {
        ...league,
        offseason: { ...league.offseason, lotteryComplete: true },
      },
      teams: [],
      expectedStage: 'lottery_and_draft_order',
      expectedVersion: 2,
      stageStartedAt: 'now',
    }).stage).toBe('player_progression');
  });

  it('requires a published draft class before entering the live draft', () => {
    const league = {
      sport: 'mlb',
      commissionerId: 'comm',
      offseason: {
        stage: 'draft_class_review',
        seasonYear: 2027,
        stageStartedAt: null,
        completedTeamIds: [],
        draftTimerSeconds: 120,
        draftStatus: 'review',
        version: 4,
      },
    };
    expect(() => transitionForCallable({
      uid: 'comm',
      league,
      teams: [],
      expectedStage: 'draft_class_review',
      expectedVersion: 4,
      draftClassPublished: false,
      stageStartedAt: 'now',
    })).toThrow(expect.objectContaining({ code: 'failed-precondition' }));
    expect(transitionForCallable({
      uid: 'comm',
      league: {
        ...league,
        offseason: { ...league.offseason, draftStatus: 'published' },
      },
      teams: [],
      expectedStage: 'draft_class_review',
      expectedVersion: 4,
      draftClassPublished: true,
      stageStartedAt: 'now',
    }).stage).toBe('live_draft');
  });

  it('requires the season draft session to complete before leaving live draft', () => {
    const league = {
      sport: 'madden',
      commissionerId: 'comm',
      offseason: {
        stage: 'live_draft',
        seasonYear: 2027,
        stageStartedAt: null,
        completedTeamIds: [],
        draftTimerSeconds: 120,
        draftStatus: 'live',
        version: 5,
      },
    };
    expect(() => transitionForCallable({
      uid: 'comm',
      league,
      teams: [],
      expectedStage: 'live_draft',
      expectedVersion: 5,
      liveDraftComplete: false,
      stageStartedAt: 'now',
    })).toThrow(expect.objectContaining({ code: 'failed-precondition' }));
    expect(transitionForCallable({
      uid: 'comm',
      league: {
        ...league,
        offseason: { ...league.offseason, draftStatus: 'complete' },
      },
      teams: [],
      expectedStage: 'live_draft',
      expectedVersion: 5,
      liveDraftComplete: true,
      stageStartedAt: 'now',
    }).stage).toBe('roster_cuts');
  });

  it('validates NBA expansion proposals before leaving expansion stage', () => {
    const league = {
      sport: 'nba',
      commissionerId: 'comm',
      expansionProposal: {
        enabled: true,
        teams: [{ city: 'Seattle', name: 'Sonics', abbreviation: 'SEA' }],
      },
      offseason: {
        stage: 'expansion',
        seasonYear: 2028,
        completedTeamIds: [],
        draftStatus: 'complete',
        version: 7,
      },
    };

    expect(() => transitionForCallable({
      uid: 'comm',
      league,
      teams: Array.from({ length: 36 }, (_, index) => ({ id: `T${index}`, abbreviation: `T${index}` })),
      expectedStage: 'expansion',
      expectedVersion: 7,
      stageStartedAt: 'now',
    })).toThrow(expect.objectContaining({ code: 'failed-precondition' }));

    expect(transitionForCallable({
      uid: 'comm',
      league,
      teams: Array.from({ length: 30 }, (_, index) => ({ id: `T${index}`, abbreviation: `T${index}` })),
      expectedStage: 'expansion',
      expectedVersion: 7,
      stageStartedAt: 'now',
    }).stage).toBe('free_agency');
  });

  it('routes ready-for-season advancement through the sport-aware season callable', () => {
    expect(() => transitionForCallable({
      uid: 'comm',
      league: {
        sport: 'mlb',
        commissionerId: 'comm',
        offseason: {
          stage: 'ready_for_season',
          seasonYear: 2027,
          completedTeamIds: [],
          draftStatus: 'complete',
          version: 7,
        },
      },
      teams: [],
      expectedStage: 'ready_for_season',
      expectedVersion: 7,
      stageStartedAt: 'now',
    })).toThrow(expect.objectContaining({ code: 'failed-precondition' }));
  });

  it('runs one transaction, reads league and teams before updating offseason', async () => {
    const operations: string[] = [];
    const leagueRef = {
      collection: () => ({ kind: 'teams-query' }),
    };
    const leagueSnap = {
      exists: true,
      data: () => ({ sport: 'madden', commissionerId: 'comm' }),
    };
    const teamsSnap = {
      docs: [{ id: 'a', data: () => ({ gmId: 'gm-a' }) }],
    };
    const tx = {
      get: vi.fn(async (ref) => {
        operations.push(ref === leagueRef ? 'read-league' : 'read-teams');
        return ref === leagueRef ? leagueSnap : teamsSnap;
      }),
      update: vi.fn((_ref, update) => {
        operations.push('write');
        expect(update.offseason).toEqual(expect.objectContaining({
          stage: 're_signing',
          seasonYear: 2025,
          version: 1,
          stageStartedAt: 'server-time',
        }));
      }),
    };
    const db = {
      collection: () => ({ doc: () => leagueRef }),
      runTransaction: vi.fn(async (callback) => callback(tx)),
    };
    const handler = createAdvanceOffseasonHandler({
      getFirestore: () => db,
      serverTimestamp: () => 'server-time',
      HttpsError: FakeHttpsError,
    });

    await expect(handler({
      auth: { uid: 'comm' },
      data: { leagueId: 'league-1', expectedStage: 'season_end', expectedVersion: 0 },
    })).resolves.toEqual({
      offseason: expect.objectContaining({ stage: 're_signing', version: 1 }),
    });
    expect(operations).toEqual(['read-league', 'read-teams', 'write']);
  });

  it('starts NBA offseason at awards recap only after a champion is crowned', async () => {
    const leagueRef = {
      collection: (name: string) => ({
        doc: (id: string) => ({ kind: name, id }),
        kind: name,
      }),
    };
    const leagueSnap = {
      exists: true,
      data: () => ({ sport: 'nba', commissionerId: 'comm', currentYear: 2031 }),
    };
    const teamsSnap = { docs: [] };
    const scheduleSnap = {
      exists: true,
      data: () => ({
        playoffs: {
          rounds: [{ name: 'final', series: [{ winnerTeamId: 'CHI' }] }],
        },
      }),
    };
    const writes: any[] = [];
    const tx = {
      get: vi.fn(async (ref) => {
        if (ref === leagueRef) return leagueSnap;
        if (ref.kind === 'teams') return teamsSnap;
        return scheduleSnap;
      }),
      update: vi.fn((_ref, update) => writes.push(update)),
    };
    const db = {
      collection: () => ({ doc: () => leagueRef }),
      runTransaction: vi.fn(async (callback) => callback(tx)),
    };
    const handler = createAdvanceOffseasonHandler({
      getFirestore: () => db,
      serverTimestamp: () => 'server-time',
      HttpsError: FakeHttpsError,
    });

    await expect(handler({
      auth: { uid: 'comm' },
      data: { leagueId: 'league-1', expectedStage: 'awards_recap', expectedVersion: 0 },
    })).resolves.toEqual({
      offseason: expect.objectContaining({
        stage: 'awards_recap',
        stageDurationSeconds: 600,
        warningAcceptedAt: 'server-time',
      }),
    });
    expect(writes[0].offseason.stage).toBe('awards_recap');
  });

  it('blocks NBA offseason start before the playoff champion is crowned', async () => {
    const leagueRef = {
      collection: (name: string) => ({
        doc: (id: string) => ({ kind: name, id }),
        kind: name,
      }),
    };
    const leagueSnap = {
      exists: true,
      data: () => ({ sport: 'nba', commissionerId: 'comm', currentYear: 2031 }),
    };
    const teamsSnap = { docs: [] };
    const scheduleSnap = {
      exists: true,
      data: () => ({ playoffs: { rounds: [{ name: 'final', series: [{ winnerTeamId: null }] }] } }),
    };
    const tx = {
      get: vi.fn(async (ref) => {
        if (ref === leagueRef) return leagueSnap;
        if (ref.kind === 'teams') return teamsSnap;
        return scheduleSnap;
      }),
      update: vi.fn(),
    };
    const db = {
      collection: () => ({ doc: () => leagueRef }),
      runTransaction: vi.fn(async (callback) => callback(tx)),
    };
    const handler = createAdvanceOffseasonHandler({
      getFirestore: () => db,
      serverTimestamp: () => 'server-time',
      HttpsError: FakeHttpsError,
    });

    await expect(handler({
      auth: { uid: 'comm' },
      data: { leagueId: 'league-1', expectedStage: 'awards_recap', expectedVersion: 0 },
    })).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('writes expansion teams before advancing out of expansion', async () => {
    const teamsCollection = {
      kind: 'teams-query',
      doc: (id: string) => ({ kind: 'team-doc', id }),
    };
    const leagueRef = {
      collection: (name: string) => (name === 'teams' ? teamsCollection : { kind: name }),
    };
    const leagueSnap = {
      exists: true,
      data: () => ({
        sport: 'nba',
        commissionerId: 'comm',
        expansionProposal: {
          enabled: true,
          teams: [{ city: 'Seattle', name: 'Sonics', abbreviation: 'SEA' }],
        },
        offseason: {
          stage: 'expansion',
          seasonYear: 2028,
          completedTeamIds: [],
          draftStatus: 'complete',
          version: 7,
        },
      }),
    };
    const teamsSnap = {
      docs: Array.from({ length: 30 }, (_, index) => ({
        id: `T${index}`,
        data: () => ({ abbreviation: `T${index}` }),
      })),
    };
    const writes: any[] = [];
    const tx = {
      get: vi.fn(async (ref) => (ref === leagueRef ? leagueSnap : teamsSnap)),
      set: vi.fn((ref, data) => writes.push({ ref, data })),
      update: vi.fn((_ref, update) => {
        expect(update.offseason.stage).toBe('free_agency');
      }),
    };
    const db = {
      collection: () => ({ doc: () => leagueRef }),
      runTransaction: vi.fn(async (callback) => callback(tx)),
    };
    const handler = createAdvanceOffseasonHandler({
      getFirestore: () => db,
      serverTimestamp: () => 'server-time',
      HttpsError: FakeHttpsError,
    });

    await handler({
      auth: { uid: 'comm' },
      data: { leagueId: 'league-1', expectedStage: 'expansion', expectedVersion: 7 },
    });

    expect(writes).toEqual([{
      ref: { kind: 'team-doc', id: 'EXP_SEA' },
      data: expect.objectContaining({
        teamId: 'EXP_SEA',
        abbreviation: 'SEA',
        name: 'Seattle Sonics',
        players: [],
        isExpansionTeam: true,
      }),
    }]);
  });

  it('creates a free agency pool when advancing into free agency', async () => {
    const teamsCollection = {
      kind: 'teams-query',
      doc: (id: string) => ({ kind: 'team-doc', id }),
    };
    const freeAgentsCollection = {
      doc: (id: string) => ({ kind: 'free-agents-doc', id }),
    };
    const draftSessionsCollection = {
      doc: (id: string) => ({ kind: 'draft-session-doc', id }),
    };
    const leagueRef = {
      collection: (name: string) => {
        if (name === 'teams') return teamsCollection;
        if (name === 'draft_sessions') return draftSessionsCollection;
        return freeAgentsCollection;
      },
    };
    const leagueSnap = {
      exists: true,
      data: () => ({
        sport: 'nba',
        commissionerId: 'comm',
        offseason: {
          stage: 'live_draft',
          seasonYear: 2028,
          completedTeamIds: [],
          draftStatus: 'complete',
          version: 7,
        },
      }),
    };
    const teamsSnap = {
      docs: Array.from({ length: 30 }, (_, index) => ({
        id: `T${index}`,
        data: () => ({
          abbreviation: `T${index}`,
          players: index === 0
            ? [
              { player_id: 'keep', full_name: 'Kept Player', contractYears: 2 },
              { player_id: 'free', full_name: 'Free Player', contractYears: 0, contractExpired: true },
            ]
            : [],
        }),
      })),
    };
    const writes: any[] = [];
    const updates: any[] = [];
    const tx = {
      get: vi.fn(async (ref) => {
        if (ref === leagueRef) return leagueSnap;
        if (ref.kind === 'teams-query') return teamsSnap;
        if (ref.kind === 'draft-session-doc') return { exists: true, data: () => ({ status: 'complete' }) };
        return { exists: false, data: () => ({}) };
      }),
      set: vi.fn((ref, data) => writes.push({ ref, data })),
      update: vi.fn((ref, update) => updates.push({ ref, update })),
    };
    const db = {
      collection: () => ({ doc: () => leagueRef }),
      runTransaction: vi.fn(async (callback) => callback(tx)),
    };
    const handler = createAdvanceOffseasonHandler({
      getFirestore: () => db,
      serverTimestamp: () => 'server-time',
      HttpsError: FakeHttpsError,
    });

    await handler({
      auth: { uid: 'comm' },
      data: { leagueId: 'league-1', expectedStage: 'live_draft', expectedVersion: 7 },
    });

    expect(updates).toContainEqual({
      ref: { kind: 'team-doc', id: 'T0' },
      update: {
        players: [expect.objectContaining({ player_id: 'keep' })],
      },
    });
    expect(writes).toContainEqual({
      ref: { kind: 'free-agents-doc', id: 'contracts_2028' },
      data: expect.objectContaining({
        seasonYear: 2028,
        players: [expect.objectContaining({ player_id: 'free', previousTeamId: 'T0' })],
      }),
    });
  });

  it('includes seeded sport free agents when MLB advances into free agency', async () => {
    const teamsCollection = {
      kind: 'teams-query',
      doc: (id: string) => ({ kind: 'team-doc', id }),
    };
    const freeAgentsCollection = {
      doc: (id: string) => ({ kind: 'free-agents-doc', id }),
    };
    const contractOffersCollection = { kind: 'contract-offers-query' };
    const leagueRef = {
      collection: (name: string) => {
        if (name === 'teams') return teamsCollection;
        if (name === 'free_agents') return freeAgentsCollection;
        if (name === 'contract_offers') return contractOffersCollection;
        return { kind: name };
      },
    };
    const faPoolRef = { kind: 'era-player-pool', id: 'mlb_fa' };
    const leagueSnap = {
      exists: true,
      data: () => ({
        sport: 'mlb',
        commissionerId: 'comm',
        offseason: {
          stage: 're_signing',
          seasonYear: 2028,
          completedTeamIds: Array.from({ length: 30 }, (_, index) => `T${index}`),
          draftStatus: 'none',
          contractRoundsComplete: true,
          version: 2,
        },
      }),
    };
    const teamsSnap = {
      docs: Array.from({ length: 30 }, (_, index) => ({
        id: `T${index}`,
        data: () => ({
          abbreviation: `T${index}`,
          gmId: `gm-${index}`,
          players: index === 0
            ? [
              { player_id: 'expired-sp', full_name: 'Expired Starter', position: 'SP', contractYears: 0, contractExpired: true },
              { player_id: 'kept-ss', full_name: 'Kept Shortstop', position: 'SS', contractYears: 2 },
            ]
            : [],
        }),
      })),
    };
    const writes: any[] = [];
    const tx = {
      get: vi.fn(async (ref) => {
        if (ref === leagueRef) return leagueSnap;
        if (ref.kind === 'teams-query') return teamsSnap;
        if (ref.kind === 'contract-offers-query') return { docs: [] };
        if (ref.kind === 'free-agents-doc') return { exists: false, data: () => ({}) };
        if (ref.kind === 'era-player-pool') {
          return {
            exists: true,
            data: () => ({
              players: [
                { player_id: 'seeded-mlb-fa', full_name: 'Seeded MLB Free Agent', position: 'CF', team: 'FA' },
              ],
            }),
          };
        }
        return { exists: false, data: () => ({}) };
      }),
      set: vi.fn((ref, data) => writes.push({ ref, data })),
      update: vi.fn(),
    };
    const db = {
      collection: (name: string) => {
        if (name === 'era_player_pools') return { doc: () => faPoolRef };
        return { doc: () => leagueRef };
      },
      runTransaction: vi.fn(async (callback) => callback(tx)),
    };
    const handler = createAdvanceOffseasonHandler({
      getFirestore: () => db,
      serverTimestamp: () => 'server-time',
      HttpsError: FakeHttpsError,
    });

    await handler({
      auth: { uid: 'comm' },
      data: { leagueId: 'league-1', expectedStage: 're_signing', expectedVersion: 2 },
    });

    expect(writes).toContainEqual({
      ref: { kind: 'free-agents-doc', id: 'contracts_2028' },
      data: expect.objectContaining({
        players: expect.arrayContaining([
          expect.objectContaining({ player_id: 'expired-sp', previousTeamId: 'T0' }),
          expect.objectContaining({
            player_id: 'seeded-mlb-fa',
            freeAgent: true,
            freeAgentSource: 'seeded_sport_pool',
            freeAgencySeason: 2028,
          }),
        ]),
      }),
    });
  });

  it('requires authentication and maps transition errors to HttpsError', async () => {
    const handler = createAdvanceOffseasonHandler({
      getFirestore: () => ({}),
      serverTimestamp: () => 'server-time',
      HttpsError: FakeHttpsError,
    });
    await expect(handler({ data: {} })).rejects.toMatchObject({ code: 'unauthenticated' });
  });
});
