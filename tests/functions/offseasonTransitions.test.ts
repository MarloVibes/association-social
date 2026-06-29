import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  authorizeOffseasonAdvance,
  getOffseasonStageSequence,
  nextOffseasonStage,
  transitionOffseasonState,
  unresolvedClaimedTeamIds,
} = require('../../functions/franchise/offseason.js');

const state = (overrides = {}) => ({
  stage: 'season_end',
  seasonYear: 2026,
  stageStartedAt: 'old',
  completedTeamIds: [],
  draftTimerSeconds: 120,
  draftStatus: 'none',
  version: 0,
  ...overrides,
});

const league = (overrides = {}) => ({
  sport: 'mlb',
  commissionerId: 'comm',
  coCommissioners: ['co'],
  offseason: state(),
  ...overrides,
});

describe('offseason transitions', () => {
  it('authorizes only an active original commissioner or co-commissioner', () => {
    expect(authorizeOffseasonAdvance('comm', league())).toBe(true);
    expect(authorizeOffseasonAdvance('co', league())).toBe(true);
    expect(authorizeOffseasonAdvance('member', league())).toBe(false);
    expect(authorizeOffseasonAdvance('comm', league({ paused: true }))).toBe(false);
    expect(authorizeOffseasonAdvance('co', league({ status: 'archived' }))).toBe(false);
  });

  it('rejects stale stage or version with the current state', () => {
    expect(() => transitionOffseasonState({
      uid: 'comm',
      league: league({ offseason: state({ stage: 'free_agency', version: 4 }) }),
      teams: [],
      expectedStage: 're_signing',
      expectedVersion: 3,
      stageStartedAt: 'now',
    })).toThrow(expect.objectContaining({
      code: 'aborted',
      details: { currentStage: 'free_agency', currentVersion: 4 },
    }));
  });

  it('blocks unresolved claimed teams while allowing vacant teams', () => {
    const teams = [
      { id: 'claimed-done', gmId: 'gm-a' },
      { id: 'claimed-open', gmId: 'gm-b' },
      { id: 'vacant', gmId: null },
    ];
    expect(unresolvedClaimedTeamIds(teams, ['claimed-done'])).toEqual(['claimed-open']);
    expect(() => transitionOffseasonState({
      uid: 'comm',
      league: league({ offseason: state({ completedTeamIds: ['claimed-done'] }) }),
      teams,
      expectedStage: 'season_end',
      expectedVersion: 0,
      stageStartedAt: 'now',
    })).toThrow(expect.objectContaining({
      code: 'failed-precondition',
      details: { unresolvedTeamIds: ['claimed-open'] },
    }));
  });

  it('increments exactly once, clears completions, and updates draft status', () => {
    const review = transitionOffseasonState({
      uid: 'co',
      league: league({ offseason: state({
        stage: 'free_agency',
        version: 7,
        completedTeamIds: ['team-a'],
      }) }),
      teams: [{ id: 'team-a', gmId: 'gm-a' }],
      expectedStage: 'free_agency',
      expectedVersion: 7,
      stageStartedAt: 'now',
    });
    expect(review).toEqual(state({
      stage: 'draft_class_review',
      version: 8,
      completedTeamIds: [],
      stageStartedAt: 'now',
      draftStatus: 'review',
      stageEndsAt: undefined,
    }));

    const live = transitionOffseasonState({
      uid: 'comm',
      league: league({ offseason: review }),
      teams: [],
      expectedStage: 'draft_class_review',
      expectedVersion: 8,
      stageStartedAt: 'later',
    });
    expect(live).toEqual(expect.objectContaining({
      stage: 'live_draft',
      version: 9,
      draftStatus: 'live',
    }));

    const complete = transitionOffseasonState({
      uid: 'comm',
      league: league({ offseason: live }),
      teams: [],
      expectedStage: 'live_draft',
      expectedVersion: 9,
      stageStartedAt: 'latest',
    });
    expect(complete).toEqual(expect.objectContaining({
      stage: 'roster_cuts',
      version: 10,
      draftStatus: 'complete',
    }));
  });

  it('mirrors MLB and NFL stage order', () => {
    const expected = [
      'season_end',
      're_signing',
      'free_agency',
      'draft_class_review',
      'live_draft',
      'roster_cuts',
      'ready_for_season',
      'regular_season',
    ];
    expect(getOffseasonStageSequence('mlb', false)).toEqual(expected);
    expect(getOffseasonStageSequence('madden', true)).toEqual(expected);
    expect(getOffseasonStageSequence('nfl', true)).toEqual(expected);
    expect(nextOffseasonStage('mlb', 'live_draft', false)).toBe('roster_cuts');
  });

  it('gates NBA expansion on an enabled proposal', () => {
    expect(nextOffseasonStage('nba', 'live_draft', false)).toBe('free_agency');
    expect(nextOffseasonStage('nba', 'live_draft', true)).toBe('expansion');

    const next = transitionOffseasonState({
      uid: 'comm',
      league: league({
        sport: 'nba',
        expansionProposal: { enabled: true },
        offseason: state({ stage: 'live_draft', draftStatus: 'live' }),
      }),
      teams: [],
      expectedStage: 'live_draft',
      expectedVersion: 0,
      stageStartedAt: 'now',
    });
    expect(next.stage).toBe('expansion');
    expect(next.draftStatus).toBe('complete');
  });

  it('uses timed NBA stages starting with awards recap', () => {
    expect(getOffseasonStageSequence('nba', false)).toEqual([
      'awards_recap',
      'lottery_and_draft_order',
      'player_progression',
      'team_options',
      're_signing',
      'live_draft',
      'free_agency',
      'ready_for_season',
      'regular_season',
    ]);
    const next = transitionOffseasonState({
      uid: 'comm',
      league: league({
        sport: 'nba',
        offseason: state({
          stage: 'awards_recap',
          stageDurationSeconds: 600,
        }),
      }),
      teams: [],
      expectedStage: 'awards_recap',
      expectedVersion: 0,
      stageStartedAt: 'now',
      stageEndsAt: 'ten-minutes',
    });
    expect(next).toEqual(expect.objectContaining({
      stage: 'lottery_and_draft_order',
      stageDurationSeconds: 600,
      stageStartedAt: 'now',
      stageEndsAt: 'ten-minutes',
    }));
  });

  it('lets one call win and rejects a stale second call', () => {
    const original = league();
    const first = transitionOffseasonState({
      uid: 'comm',
      league: original,
      teams: [],
      expectedStage: 'season_end',
      expectedVersion: 0,
      stageStartedAt: 'now',
    });
    expect(first.version).toBe(1);

    expect(() => transitionOffseasonState({
      uid: 'co',
      league: { ...original, offseason: first },
      teams: [],
      expectedStage: 'season_end',
      expectedVersion: 0,
      stageStartedAt: 'later',
    })).toThrow(expect.objectContaining({
      code: 'aborted',
      details: { currentStage: 're_signing', currentVersion: 1 },
    }));
  });
});
