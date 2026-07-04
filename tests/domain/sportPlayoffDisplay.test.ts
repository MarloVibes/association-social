import { describe, expect, it } from 'vitest';
import { offseasonStartStageForSport, playoffFormatOptionsForSport, postseasonOffseasonWarning } from '@/domain/sports/playoffDisplay';

describe('sport playoff display', () => {
  it('keeps NBA play-in available', () => {
    expect(playoffFormatOptionsForSport('nba').map(option => option.value)).toEqual(['short_8', 'traditional_16', 'play_in_16']);
  });

  it('hides NBA play-in for NFL and MLB leagues', () => {
    expect(playoffFormatOptionsForSport('madden').map(option => option.value)).toEqual(['short_8', 'traditional_16']);
    expect(playoffFormatOptionsForSport('mlb').map(option => option.value)).toEqual(['short_8', 'traditional_16']);
  });

  it('uses sport-specific offseason warning text', () => {
    expect(postseasonOffseasonWarning('nba')).toContain('lottery');
    expect(postseasonOffseasonWarning('madden')).toContain('roster cuts');
    expect(postseasonOffseasonWarning('madden')).not.toContain('lottery');
    expect(postseasonOffseasonWarning('mlb')).toContain('free agency');
    expect(postseasonOffseasonWarning('mlb')).not.toContain('lottery');
  });

  it('starts each sport at the correct offseason entry stage', () => {
    expect(offseasonStartStageForSport('nba')).toBe('awards_recap');
    expect(offseasonStartStageForSport('madden')).toBe('season_end');
    expect(offseasonStartStageForSport('mlb')).toBe('season_end');
  });
});
