import { COACHING_PRESETS, type CoachingPreset } from '@/domain/nba/coaching';

export type FranchiseSport = 'nba' | 'madden' | 'mlb';
export type CoachingPrepSlot = 'offense' | 'defense';

export const NBA_OFFENSE_PRESET_IDS = [
  'five_out',
  'pick_and_roll',
  'motion_offense',
  'star_isolation',
  'post_inside',
  'transition_pace',
];

export const NBA_DEFENSE_PRESET_IDS = [
  'zone_23',
  'zone_32',
  'switch_everything',
  'double_star',
  'half_court_press',
  'protect_paint',
];

export function normalizeSport(value: unknown): FranchiseSport {
  const sport = String(value || 'nba').trim().toLowerCase();
  if (sport === 'nfl' || sport === 'madden') return 'madden';
  if (sport === 'mlb') return 'mlb';
  return 'nba';
}

export const NFL_GAME_PRESETS: CoachingPreset[] = [
  {
    id: 'balanced',
    name: 'Balanced Script',
    description: 'A steady plan that keeps the offense flexible and avoids overcommitting the defense.',
    boostSummary: 'Keeps risk neutral and lets roster strength decide the game.',
    offense: 'balanced',
    defense: 'drop',
    modifiers: { pace: 0, threePointRate: 0, rimPressure: 0, midrangeRate: 0, turnovers: 0, fouls: 0, rebounding: 0, fatigue: 0 },
    counters: ['pressure'],
  },
  {
    id: 'air_raid',
    name: 'Air Raid',
    description: 'Pushes passing volume and tempo, hunting chunk plays through the air.',
    boostSummary: 'More explosive offense, with a little more turnover and fatigue risk.',
    offense: 'pace_and_space',
    defense: 'drop',
    modifiers: { pace: 4, threePointRate: 0, rimPressure: 0, midrangeRate: 0, turnovers: 2, fouls: 0, rebounding: 0, fatigue: 2 },
    counters: ['zone'],
  },
  {
    id: 'ground_and_pound',
    name: 'Ground and Pound',
    description: 'Controls pace, leans on rushing, and tries to win field position.',
    boostSummary: 'Improves physical control and ball security, but slows the scoring pace.',
    offense: 'post_heavy',
    defense: 'protect_paint',
    modifiers: { pace: -3, threePointRate: 0, rimPressure: 4, midrangeRate: 0, turnovers: -1, fouls: 1, rebounding: 3, fatigue: 1 },
    counters: ['pressure'],
  },
  {
    id: 'blitz_pressure',
    name: 'Blitz Pressure',
    description: 'Attacks protection, forces quick decisions, and accepts more risk.',
    boostSummary: 'Creates disruptive swings, with higher foul and fatigue pressure.',
    offense: 'balanced',
    defense: 'pressure',
    modifiers: { pace: 2, threePointRate: 0, rimPressure: 0, midrangeRate: 0, turnovers: 4, fouls: 3, rebounding: -1, fatigue: 3 },
    counters: ['drop'],
  },
  {
    id: 'zone_disguise',
    name: 'Zone Disguise',
    description: 'Mixes coverage looks and tries to bait mistakes without constant blitzing.',
    boostSummary: 'Adds turnover pressure without the full fatigue cost of blitz-heavy play.',
    offense: 'balanced',
    defense: 'zone',
    modifiers: { pace: 0, threePointRate: 0, rimPressure: 0, midrangeRate: 0, turnovers: 2, fouls: -1, rebounding: 1, fatigue: 0 },
    counters: ['pressure'],
  },
];

export const MLB_GAME_PRESETS: CoachingPreset[] = [
  {
    id: 'balanced',
    name: 'Balanced Card',
    description: 'A neutral lineup and pitching plan that lets talent carry the matchup.',
    boostSummary: 'Keeps the team close to its natural production profile.',
    offense: 'balanced',
    defense: 'drop',
    modifiers: { pace: 0, threePointRate: 0, rimPressure: 0, midrangeRate: 0, turnovers: 0, fouls: 0, rebounding: 0, fatigue: 0 },
    counters: ['pressure'],
  },
  {
    id: 'power_lineup',
    name: 'Power Lineup',
    description: 'Chases extra-base damage and run spikes with a heavier power approach.',
    boostSummary: 'Raises scoring punch, with a little more swing-and-miss volatility.',
    offense: 'isolation',
    defense: 'drop',
    modifiers: { pace: -1, threePointRate: 0, rimPressure: 3, midrangeRate: 0, turnovers: 1, fouls: 0, rebounding: 0, fatigue: 1 },
    counters: ['zone'],
  },
  {
    id: 'small_ball',
    name: 'Small Ball',
    description: 'Uses contact, speed, and pressure to manufacture innings.',
    boostSummary: 'Improves pressure and ball-in-play outcomes, but sacrifices some power.',
    offense: 'pick_and_roll',
    defense: 'switch_heavy',
    modifiers: { pace: 3, threePointRate: 0, rimPressure: 2, midrangeRate: 0, turnovers: -1, fouls: 0, rebounding: -1, fatigue: 1 },
    counters: ['drop'],
  },
  {
    id: 'bullpen_aggressive',
    name: 'Aggressive Bullpen',
    description: 'Shortens pitching windows and attacks leverage spots earlier.',
    boostSummary: 'Adds late-game control and strikeout pressure, with more fatigue risk.',
    offense: 'balanced',
    defense: 'pressure',
    modifiers: { pace: 1, threePointRate: 0, rimPressure: 0, midrangeRate: 0, turnovers: 2, fouls: 1, rebounding: 0, fatigue: 2 },
    counters: ['protect_paint'],
  },
  {
    id: 'ace_day',
    name: 'Ace Day',
    description: 'Lets the top starter control the rhythm and suppress run creation.',
    boostSummary: 'Improves pitching control and run prevention without chasing pace.',
    offense: 'balanced',
    defense: 'protect_paint',
    modifiers: { pace: -2, threePointRate: 0, rimPressure: 0, midrangeRate: 0, turnovers: 2, fouls: -1, rebounding: 1, fatigue: 1 },
    counters: ['pressure'],
  },
];

export function defaultPresetsForSport(sportInput: unknown): CoachingPreset[] {
  const sport = normalizeSport(sportInput);
  if (sport === 'madden') return NFL_GAME_PRESETS;
  if (sport === 'mlb') return MLB_GAME_PRESETS;
  return COACHING_PRESETS;
}

export function isPresetAllowedForPrepSlot(sportInput: unknown, presetId: string, slot: CoachingPrepSlot): boolean {
  const sport = normalizeSport(sportInput);
  if (sport !== 'nba') return true;
  const ids = slot === 'offense' ? NBA_OFFENSE_PRESET_IDS : NBA_DEFENSE_PRESET_IDS;
  return ids.includes(presetId);
}

export function presetsForPrepSlot(sportInput: unknown, presets: CoachingPreset[], slot: CoachingPrepSlot): CoachingPreset[] {
  const sport = normalizeSport(sportInput);
  if (sport !== 'nba') return presets;
  const ids = slot === 'offense' ? NBA_OFFENSE_PRESET_IDS : NBA_DEFENSE_PRESET_IDS;
  return ids
    .map(id => presets.find(preset => preset.id === id))
    .filter((preset): preset is CoachingPreset => Boolean(preset));
}
