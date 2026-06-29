import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  getOffseasonStageSequence,
  nextOffseasonStage,
} from '../../domain/offseason/stateMachine';
import type { OffseasonState } from '../../domain/offseason/types';

describe('offseason state machine', () => {
  it('uses the MLB and NFL stage order', () => {
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
    expect(nextOffseasonStage('madden', 'season_end', false)).toBe('re_signing');
    expect(nextOffseasonStage('mlb', 'live_draft', false)).toBe('roster_cuts');
  });

  it('includes NBA expansion only when enabled', () => {
    expect(nextOffseasonStage('nba', 'live_draft', true)).toBe('expansion');
    expect(nextOffseasonStage('nba', 'live_draft', false)).toBe('free_agency');
    expect(nextOffseasonStage('nba', 'expansion', false)).toBe('free_agency');
  });

  it('uses the timed NBA stage order with draft review before offseason', () => {
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
    expect(getOffseasonStageSequence('nba', true)).toEqual([
      'awards_recap',
      'lottery_and_draft_order',
      'player_progression',
      'team_options',
      're_signing',
      'live_draft',
      'expansion',
      'free_agency',
      'ready_for_season',
      'regular_season',
    ]);
    expect(nextOffseasonStage('nba', 'awards_recap', false)).toBe('lottery_and_draft_order');
    expect(nextOffseasonStage('nba', 're_signing', false)).toBe('live_draft');
  });

  it('falls back to the NBA sequence for unknown sports', () => {
    expect(nextOffseasonStage('soccer', 'awards_recap', false)).toBe(
      'lottery_and_draft_order',
    );
  });

  it('keeps the terminal stage terminal', () => {
    expect(nextOffseasonStage('nba', 'regular_season', true)).toBe(
      'regular_season',
    );
    expect(nextOffseasonStage('mlb', 'regular_season', false)).toBe(
      'regular_season',
    );
  });

  it('defines the persisted offseason state fields', () => {
    expectTypeOf<OffseasonState>().toEqualTypeOf<{
      stage:
        | 'awards_recap'
        | 'season_end'
        | 'lottery_and_draft_order'
        | 'player_progression'
        | 'team_options'
        | 're_signing'
        | 'free_agency'
        | 'draft_class_review'
        | 'live_draft'
        | 'expansion'
        | 'roster_cuts'
        | 'ready_for_season'
        | 'regular_season';
      seasonYear: number;
      stageStartedAt: unknown;
      completedTeamIds: string[];
      draftTimerSeconds: number;
      draftStatus: 'none' | 'review' | 'published' | 'live' | 'complete';
      stageDurationSeconds?: number;
      stageEndsAt?: unknown;
      warningAcceptedAt?: unknown;
      contractRoundsComplete?: boolean;
      version: number;
    }>();
  });
});
