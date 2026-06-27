import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  applyDraftClassMutation,
  assertDraftClassEditable,
  createMutateDraftClassHandler,
  draftClassDocumentId,
  generateServerDraftClass,
  normalizeProspectForSport,
  publishDraftClassState,
} = require('../../functions/franchise/draftClass.js');

const league = {
  sport: 'madden',
  commissionerId: 'comm',
  offseason: {
    stage: 'draft_class_review',
    seasonYear: 2027,
    draftStatus: 'review',
    version: 4,
  },
};

class FakeHttpsError extends Error {
  code: string;
  details: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

describe('draft class orchestration', () => {
  it('uses a stable season-scoped document id', () => {
    expect(draftClassDocumentId(2027)).toBe('2027');
  });

  it('allows commissioners to edit only during an unpublished review stage', () => {
    expect(() => assertDraftClassEditable({
      uid: 'comm',
      league,
      expectedVersion: 4,
      draftClass: { published: false },
    })).not.toThrow();
    expect(() => assertDraftClassEditable({
      uid: 'outsider',
      league,
      expectedVersion: 4,
      draftClass: { published: false },
    })).toThrow(expect.objectContaining({ code: 'permission-denied' }));
    expect(() => assertDraftClassEditable({
      uid: 'comm',
      league: { ...league, offseason: { ...league.offseason, stage: 'live_draft' } },
      expectedVersion: 4,
      draftClass: { published: false },
    })).toThrow(expect.objectContaining({ code: 'failed-precondition' }));
    expect(() => assertDraftClassEditable({
      uid: 'comm',
      league,
      expectedVersion: 4,
      draftClass: { published: true },
    })).toThrow(expect.objectContaining({ code: 'failed-precondition' }));
    expect(() => assertDraftClassEditable({
      uid: 'comm',
      league: { sport: 'nba', commissionerId: 'comm', currentYear: 2031 },
      expectedVersion: 0,
      draftClass: { published: false },
    })).not.toThrow();
  });

  it('adds, edits, removes, and regenerates prospects without duplicate ids', () => {
    const first = {
      id: 'p1',
      full_name: 'First Prospect',
      position: 'QB',
      projectedRound: 1,
    };
    const second = {
      id: 'p2',
      full_name: 'Second Prospect',
      position: 'WR',
      projectedRound: 2,
    };

    expect(applyDraftClassMutation([], { action: 'add', prospect: first })).toEqual([first]);
    expect(() => applyDraftClassMutation([first], { action: 'add', prospect: first }))
      .toThrow(expect.objectContaining({ code: 'already-exists' }));
    expect(applyDraftClassMutation([first], {
      action: 'edit',
      prospectId: 'p1',
      patch: { id: 'forged', player_id: 'forged', projectedRound: 3 },
    })[0]).toMatchObject({ id: 'p1', player_id: 'p1', projectedRound: 3 });
    expect(applyDraftClassMutation([first], {
      action: 'remove',
      prospectId: 'p1',
    })).toEqual([]);
    expect(applyDraftClassMutation([first], {
      action: 'regenerate',
      generatedPlayers: [second],
    })).toEqual([second]);
  });

  it('publishes once and locks the stored class', () => {
    const published = publishDraftClassState({
      players: [{ id: 'p1' }],
      published: false,
      version: 2,
    }, 'now');

    expect(published).toEqual({
      players: [{ id: 'p1' }],
      published: true,
      publishedAt: 'now',
      version: 3,
    });
    expect(() => publishDraftClassState(published, 'later'))
      .toThrow(expect.objectContaining({ code: 'failed-precondition' }));
  });

  it('regenerates deterministic sport-sized server classes', () => {
    const nba = generateServerDraftClass('nba', 30, 'seed');
    const nfl = generateServerDraftClass('madden', 32, 'seed');
    const mlb = generateServerDraftClass('mlb', 30, 'seed');
    expect(nba).toHaveLength(60);
    expect(nfl).toHaveLength(224);
    expect(mlb).toHaveLength(150);
    expect(generateServerDraftClass('mlb', 3, 'seed')).toEqual(
      generateServerDraftClass('mlb', 3, 'seed'),
    );
    expect(nfl.every((prospect: any) => (
      prospect.height
      && prospect.heightInches >= 66
      && prospect.heightInches <= 81
      && prospect.weight >= 165
      && prospect.weight <= 380
      && Object.keys(prospect.ratings).length >= 4
      && ['normal', 'star', 'superstar', 'x_factor'].includes(prospect.developmentTrait)
    ))).toBe(true);
    expect(mlb.every((prospect: any) => (
      ['R', 'L', 'S'].includes(prospect.handedness)
      && Object.keys(prospect.ratings).length >= 5
      && prospect.potential >= 55
      && prospect.potential <= 99
    ))).toBe(true);
  });

  it('generates NBA server prospects with hidden identity and visible grades', () => {
    const [prospect] = generateServerDraftClass('nba', 30, 'server-nba');

    expect(prospect.sport).toBe('nba');
    expect(['PG', 'SG', 'SF', 'PF', 'C']).toContain(prospect.position);
    expect(prospect.hidden).toBeTruthy();
    expect(prospect.visible.grades.shooting).toBeTruthy();
    expect(prospect.overall).toBeUndefined();
  });

  it('regenerates server classes using the live league team count', async () => {
    const classWrites: any[] = [];
    const classRef = { kind: 'draft-class' };
    const teamsRef = { kind: 'teams-query' };
    const leagueRef = {
      collection: (name: string) => ({
        doc: () => classRef,
        kind: name === 'teams' ? teamsRef.kind : name,
      }),
    };
    const tx = {
      get: vi.fn(async (ref) => {
        if (ref === leagueRef) {
          return {
            exists: true,
            data: () => ({
              sport: 'nba',
              commissionerId: 'comm',
              offseason: { stage: 'draft_class_review', seasonYear: 2028, version: 4 },
            }),
          };
        }
        if (ref.kind === 'teams-query') {
          return {
            docs: Array.from({ length: 32 }, (_, index) => ({ id: `T${index}`, data: () => ({}) })),
          };
        }
        return {
          exists: false,
          data: () => ({}),
        };
      }),
      set: vi.fn((_ref, data) => classWrites.push(data)),
    };
    const db = {
      collection: () => ({ doc: () => leagueRef }),
      runTransaction: vi.fn(async (callback) => callback(tx)),
    };
    const handler = createMutateDraftClassHandler({
      getFirestore: () => db,
      serverTimestamp: () => 'now',
      HttpsError: FakeHttpsError,
    });

    await handler({
      auth: { uid: 'comm' },
      data: { leagueId: 'league-1', action: 'regenerate', expectedVersion: 4, seed: 'x' },
    });

    expect(classWrites[0].players).toHaveLength(64);
  });

  it('regenerates a pre-offseason NBA draft class for the upcoming year', async () => {
    const classRefs: any[] = [];
    const classWrites: any[] = [];
    const teamsRef = { kind: 'teams-query' };
    const leagueRef = {
      collection: (name: string) => ({
        doc: (id: string) => {
          if (name === 'draft_classes') classRefs.push(id);
          return { kind: name, id };
        },
        kind: name === 'teams' ? teamsRef.kind : name,
      }),
    };
    const tx = {
      get: vi.fn(async (ref) => {
        if (ref === leagueRef) {
          return {
            exists: true,
            data: () => ({
              sport: 'nba',
              commissionerId: 'comm',
              currentYear: 2031,
            }),
          };
        }
        if (ref.kind === 'teams-query') {
          return {
            docs: Array.from({ length: 30 }, (_, index) => ({ id: `T${index}`, data: () => ({}) })),
          };
        }
        return { exists: false, data: () => ({}) };
      }),
      set: vi.fn((_ref, data) => classWrites.push(data)),
    };
    const db = {
      collection: () => ({ doc: () => leagueRef }),
      runTransaction: vi.fn(async (callback) => callback(tx)),
    };
    const handler = createMutateDraftClassHandler({
      getFirestore: () => db,
      serverTimestamp: () => 'now',
      HttpsError: FakeHttpsError,
    });

    await handler({
      auth: { uid: 'comm' },
      data: { leagueId: 'league-1', action: 'regenerate', expectedVersion: 0, seed: 'pre' },
    });

    expect(classRefs).toContain('2032');
    expect(classWrites[0]).toMatchObject({
      seasonYear: 2032,
      sport: 'nba',
      published: false,
    });
  });

  it('normalizes commissioner-created prospects to the selected sport', () => {
    expect(normalizeProspectForSport({
      id: 'custom',
      full_name: 'Custom Quarterback',
      position: 'QB',
      projectedRound: 2,
    }, 'madden')).toMatchObject({
      id: 'custom',
      player_id: 'custom',
      sport: 'madden',
      position: 'QB',
      projectedRound: 2,
      developmentTrait: 'normal',
    });
    expect(normalizeProspectForSport({
      id: 'custom',
      full_name: 'Custom Shortstop',
      position: 'SS',
      projectedRound: 3,
    }, 'mlb')).toMatchObject({
      sport: 'mlb',
      handedness: 'R',
      potential: 70,
    });
    expect(() => normalizeProspectForSport({
      id: 'bad',
      full_name: 'Wrong Sport',
      position: 'QB',
      projectedRound: 1,
    }, 'mlb')).toThrow(expect.objectContaining({ code: 'invalid-argument' }));
  });
});
