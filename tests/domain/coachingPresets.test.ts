import { describe, expect, it } from 'vitest';
import {
  defaultPresetsForSport,
  presetsForPrepSlot,
  isPresetAllowedForPrepSlot,
} from '@/domain/sports/coachingPresets';

describe('sport coaching prep presets', () => {
  it('separates NBA offense and defense prep choices', () => {
    const presets = defaultPresetsForSport('nba');

    expect(presetsForPrepSlot('nba', presets, 'offense').map(preset => preset.id)).toEqual([
      'five_out',
      'pick_and_roll',
      'motion_offense',
      'star_isolation',
      'post_inside',
      'transition_pace',
    ]);
    expect(presetsForPrepSlot('nba', presets, 'defense').map(preset => preset.id)).toEqual([
      'zone_23',
      'zone_32',
      'switch_everything',
      'double_star',
      'half_court_press',
      'protect_paint',
    ]);
    expect(isPresetAllowedForPrepSlot('nba', 'five_out', 'offense')).toBe(true);
    expect(isPresetAllowedForPrepSlot('nba', 'five_out', 'defense')).toBe(false);
    expect(isPresetAllowedForPrepSlot('nba', 'protect_paint', 'defense')).toBe(true);
    expect(isPresetAllowedForPrepSlot('nba', 'protect_paint', 'offense')).toBe(false);
  });

  it('keeps non-NBA prep choices unrestricted', () => {
    const nflPresets = defaultPresetsForSport('madden');

    expect(presetsForPrepSlot('madden', nflPresets, 'offense')).toEqual(nflPresets);
    expect(presetsForPrepSlot('madden', nflPresets, 'defense')).toEqual(nflPresets);
    expect(isPresetAllowedForPrepSlot('madden', 'air_raid', 'defense')).toBe(true);
  });
});
