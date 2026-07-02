import { describe, expect, it } from 'vitest';
import { getCreateLeagueIntro, shouldShowSportPicker } from '@/domain/createLeague/flow';

describe('create league flow handoff', () => {
  it('skips the sport picker when the main menu already selected a franchise mode', () => {
    expect(shouldShowSportPicker('nba')).toBe(false);
    expect(shouldShowSportPicker('madden')).toBe(false);
    expect(shouldShowSportPicker('mlb')).toBe(false);
  });

  it('keeps the sport picker for generic create league entry points', () => {
    expect(shouldShowSportPicker('')).toBe(true);
    expect(shouldShowSportPicker(undefined)).toBe(true);
  });

  it('uses the selected franchise mode as context without repeating the choice', () => {
    expect(getCreateLeagueIntro('nba')).toEqual({
      title: 'Name Your NBA Franchise',
      subtitle: 'Set the league name, then choose the season setup.',
    });
  });
});
