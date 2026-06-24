import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  applyDraftClassMutation,
  assertDraftClassEditable,
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
    const nfl = generateServerDraftClass('madden', 32, 'seed');
    const mlb = generateServerDraftClass('mlb', 30, 'seed');
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
