export type OffensiveStyle = 'balanced' | 'pace_and_space' | 'post_heavy' | 'pick_and_roll' | 'isolation';
export type DefensiveStyle = 'drop' | 'switch_heavy' | 'zone' | 'pressure' | 'protect_paint';

export type CoachingModifiers = {
  pace: number;
  threePointRate: number;
  rimPressure: number;
  midrangeRate: number;
  turnovers: number;
  fouls: number;
  rebounding: number;
  fatigue: number;
};

export type CoachingPreset = {
  id: string;
  name: string;
  offense: OffensiveStyle;
  defense: DefensiveStyle;
  modifiers: CoachingModifiers;
  counters: DefensiveStyle[];
};

export type CoachingSnapshot = CoachingPreset & {
  teamId: string;
  gameId: string;
  presetId: string;
  snapshotAt: string;
};

export type CoachingValidation = {
  valid: boolean;
  errors: string[];
};

const OFFENSES = new Set<OffensiveStyle>(['balanced', 'pace_and_space', 'post_heavy', 'pick_and_roll', 'isolation']);
const DEFENSES = new Set<DefensiveStyle>(['drop', 'switch_heavy', 'zone', 'pressure', 'protect_paint']);
const MODIFIER_KEYS: (keyof CoachingModifiers)[] = [
  'pace',
  'threePointRate',
  'rimPressure',
  'midrangeRate',
  'turnovers',
  'fouls',
  'rebounding',
  'fatigue',
];

export const COACHING_PRESETS: CoachingPreset[] = [
  {
    id: 'balanced',
    name: 'Balanced',
    offense: 'balanced',
    defense: 'drop',
    modifiers: { pace: 0, threePointRate: 0, rimPressure: 0, midrangeRate: 0, turnovers: 0, fouls: 0, rebounding: 0, fatigue: 0 },
    counters: ['pressure'],
  },
  {
    id: 'pace_and_space',
    name: 'Pace and Space',
    offense: 'pace_and_space',
    defense: 'switch_heavy',
    modifiers: { pace: 8, threePointRate: 10, rimPressure: 3, midrangeRate: -5, turnovers: 2, fouls: 1, rebounding: -2, fatigue: 6 },
    counters: ['drop', 'protect_paint'],
  },
  {
    id: 'grit_and_grind',
    name: 'Grit and Grind',
    offense: 'post_heavy',
    defense: 'protect_paint',
    modifiers: { pace: -7, threePointRate: -4, rimPressure: 6, midrangeRate: 4, turnovers: -2, fouls: 3, rebounding: 8, fatigue: 2 },
    counters: ['switch_heavy', 'zone'],
  },
  {
    id: 'blitz_pressure',
    name: 'Blitz Pressure',
    offense: 'pick_and_roll',
    defense: 'pressure',
    modifiers: { pace: 5, threePointRate: 2, rimPressure: 5, midrangeRate: -2, turnovers: 5, fouls: 6, rebounding: -3, fatigue: 7 },
    counters: ['drop', 'zone'],
  },
];

export function getCoachingPreset(id: string): CoachingPreset {
  const preset = COACHING_PRESETS.find(candidate => candidate.id === id) || COACHING_PRESETS[0];
  return {
    ...preset,
    modifiers: { ...preset.modifiers },
    counters: [...preset.counters],
  };
}

export function validateCoachingPreset(preset: CoachingPreset): CoachingValidation {
  const errors: string[] = [];
  if (!preset.id) errors.push('id_required');
  if (!preset.name) errors.push('name_required');
  if (!OFFENSES.has(preset.offense)) errors.push('invalid_offense');
  if (!DEFENSES.has(preset.defense)) errors.push('invalid_defense');
  if (
    !preset.modifiers
    || MODIFIER_KEYS.some(key => (
      typeof preset.modifiers[key] !== 'number'
      || !Number.isFinite(preset.modifiers[key])
      || preset.modifiers[key] < -10
      || preset.modifiers[key] > 10
    ))
  ) {
    errors.push('invalid_modifier');
  }
  if ((preset.counters || []).some(counter => !DEFENSES.has(counter))) errors.push('invalid_counter');
  return { valid: errors.length === 0, errors };
}

export function buildCoachingSnapshot(preset: CoachingPreset, teamId: string, gameId: string): CoachingSnapshot {
  return {
    ...preset,
    presetId: preset.id,
    teamId,
    gameId,
    modifiers: { ...preset.modifiers },
    counters: [...preset.counters],
    snapshotAt: new Date(0).toISOString(),
  };
}
