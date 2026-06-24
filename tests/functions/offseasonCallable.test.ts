import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  createAdvanceOffseasonHandler,
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
      'season_end',
      0,
    )).toEqual(expect.objectContaining({ seasonYear: 2030, draftTimerSeconds: 120 }));
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

  it('requires authentication and maps transition errors to HttpsError', async () => {
    const handler = createAdvanceOffseasonHandler({
      getFirestore: () => ({}),
      serverTimestamp: () => 'server-time',
      HttpsError: FakeHttpsError,
    });
    await expect(handler({ data: {} })).rejects.toMatchObject({ code: 'unauthenticated' });
  });
});
