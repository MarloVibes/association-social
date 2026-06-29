import { describe, expect, it } from 'vitest';
import {
  buildInitialOffseasonState,
  getFreeAgentAction,
  getOffseasonStageLabel,
  getUnresolvedOffseasonTeams,
  isOffseasonTeamActionStage,
} from '@/domain/offseason/viewModel';

describe('offseason view model', () => {
  it('builds the first offseason state from sport defaults', () => {
    expect(buildInitialOffseasonState({ sport: 'mlb' })).toMatchObject({
      stage: 'season_end',
      seasonYear: 2026,
      version: 0,
      draftTimerSeconds: 80,
    });
    expect(buildInitialOffseasonState({
      sport: 'madden',
      currentYear: 2031,
      draftTimerSeconds: 90,
    })).toMatchObject({
      seasonYear: 2031,
      draftTimerSeconds: 90,
    });
    expect(buildInitialOffseasonState({ sport: 'nba', currentYear: 2032 })).toMatchObject({
      stage: 'awards_recap',
      seasonYear: 2032,
      stageDurationSeconds: 600,
    });
  });

  it('uses readable stage labels and identifies stages that require team action', () => {
    expect(getOffseasonStageLabel('draft_class_review')).toBe('Draft Class Review');
    expect(getOffseasonStageLabel('awards_recap')).toBe('Awards Recap');
    expect(isOffseasonTeamActionStage('re_signing')).toBe(true);
    expect(isOffseasonTeamActionStage('awards_recap')).toBe(false);
  });

  it('lists only claimed teams that have not completed the current action', () => {
    const teams = [
      { id: 'a', name: 'Aces', gmId: 'gm-a' },
      { id: 'b', abbreviation: 'BOS', gmId: 'gm-b' },
      { id: 'c', name: 'Vacant Club' },
    ];

    expect(getUnresolvedOffseasonTeams(teams, ['a'])).toEqual([
      { id: 'b', label: 'BOS' },
    ]);
  });

  it('routes free-agent acquisition through offers only during free agency', () => {
    expect(getFreeAgentAction('free_agency')).toBe('offer');
    expect(getFreeAgentAction('re_signing')).toBe('closed');
    expect(getFreeAgentAction('regular_season')).toBe('sign');
    expect(getFreeAgentAction(undefined)).toBe('sign');
  });
});
