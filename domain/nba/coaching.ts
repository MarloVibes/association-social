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
  description?: string;
  boostSummary?: string;
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

export type CoachingGradeAdjustments = Record<string, number>;

type PlayerLike = {
  position?: string;
  labels?: string[];
  archetype?: string;
  playStyle?: string;
  playstyle?: string;
  hidden?: Record<string, unknown>;
  grades?: Record<string, unknown>;
  visible?: { grades?: Record<string, unknown> };
  [key: string]: unknown;
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
    description: 'A neutral game plan that keeps the roster close to its natural identity.',
    boostSummary: 'No major fit boost or penalty. Best when you do not want the coach changing player tendencies.',
    offense: 'balanced',
    defense: 'drop',
    modifiers: { pace: 0, threePointRate: 0, rimPressure: 0, midrangeRate: 0, turnovers: 0, fouls: 0, rebounding: 0, fatigue: 0 },
    counters: ['pressure'],
  },
  {
    id: 'pace_and_space',
    name: 'Pace and Space',
    description: 'Opens the floor, speeds up possessions, and rewards shooting plus guard creation.',
    boostSummary: 'Boosts 3PT, speed, playmaking, and stamina for shooters or quick creators. Poor fits can lose post offense and stamina.',
    offense: 'pace_and_space',
    defense: 'switch_heavy',
    modifiers: { pace: 8, threePointRate: 10, rimPressure: 3, midrangeRate: -5, turnovers: 2, fouls: 1, rebounding: -2, fatigue: 6 },
    counters: ['drop', 'protect_paint'],
  },
  {
    id: 'grit_and_grind',
    name: 'Grit and Grind',
    description: 'Slows the game down and leans into defense, rebounding, contact, and half-court pressure.',
    boostSummary: 'Boosts defense, defense IQ, rebounding, and strength for physical defenders. Weak defensive fits can lose defense and stamina.',
    offense: 'post_heavy',
    defense: 'protect_paint',
    modifiers: { pace: -7, threePointRate: -4, rimPressure: 6, midrangeRate: 4, turnovers: -2, fouls: 3, rebounding: 8, fatigue: 2 },
    counters: ['switch_heavy', 'zone'],
  },
  {
    id: 'blitz_pressure',
    name: 'Blitz Pressure',
    description: 'Aggressive guards and wings attack ball handlers, force turnovers, and live with extra fouls.',
    boostSummary: 'Boosts steals, perimeter defense, speed, and defense IQ for quick defenders. Bad fits can lose defense IQ and stamina.',
    offense: 'pick_and_roll',
    defense: 'pressure',
    modifiers: { pace: 5, threePointRate: 2, rimPressure: 5, midrangeRate: -2, turnovers: 5, fouls: 6, rebounding: -3, fatigue: 7 },
    counters: ['drop', 'zone'],
  },
  {
    id: 'seven_seconds',
    name: 'Seven Seconds',
    description: 'A run-first attack built for quick decisions, early shots, and constant transition pressure.',
    boostSummary: 'Boosts speed, 3PT, playmaking, and stamina for shooters or fast creators. Slow poor fits can lose post offense and stamina.',
    offense: 'pace_and_space',
    defense: 'switch_heavy',
    modifiers: { pace: 10, threePointRate: 7, rimPressure: 5, midrangeRate: -4, turnovers: 4, fouls: 2, rebounding: -3, fatigue: 8 },
    counters: ['drop', 'protect_paint'],
  },
  {
    id: 'triangle_control',
    name: 'Triangle Control',
    description: 'A patient read-and-react offense for smart passers, post hubs, and midrange decision makers.',
    boostSummary: 'Boosts basketball IQ, passing, midrange, and post offense for high-IQ players. Poor fits can lose ball handling.',
    offense: 'balanced',
    defense: 'drop',
    modifiers: { pace: -3, threePointRate: -1, rimPressure: 2, midrangeRate: 7, turnovers: -5, fouls: -1, rebounding: 2, fatigue: -2 },
    counters: ['pressure', 'zone'],
  },
  {
    id: 'lob_city',
    name: 'Lob City',
    description: 'Pick-and-roll pressure built around vertical spacing, rim running, and highlight finishes.',
    boostSummary: 'Boosts dunking, athleticism, close shot, and guard playmaking for explosive finishers. Poor fits can lose midrange and stamina.',
    offense: 'pick_and_roll',
    defense: 'drop',
    modifiers: { pace: 6, threePointRate: 1, rimPressure: 10, midrangeRate: -5, turnovers: 2, fouls: 2, rebounding: 3, fatigue: 5 },
    counters: ['drop', 'protect_paint'],
  },
  {
    id: 'midrange_clinic',
    name: 'Midrange Clinic',
    description: 'Creates deliberate shot quality for scorers who live in pull-ups, elbows, and late-clock control.',
    boostSummary: 'Boosts midrange, shot IQ, free throw, clutch, and shooting for polished scorers. Poor fits can lose 3PT rhythm.',
    offense: 'isolation',
    defense: 'drop',
    modifiers: { pace: -4, threePointRate: -6, rimPressure: -1, midrangeRate: 10, turnovers: -3, fouls: -2, rebounding: 0, fatigue: -1 },
    counters: ['switch_heavy', 'pressure'],
  },
  {
    id: 'bully_ball',
    name: 'Bully Ball',
    description: 'A physical style that wins with strength, post touches, paint control, and punishing matchups.',
    boostSummary: 'Boosts strength, post offense, post defense, rebounding, and defense for strong players. Poor fits can lose speed and stamina.',
    offense: 'post_heavy',
    defense: 'protect_paint',
    modifiers: { pace: -6, threePointRate: -5, rimPressure: 8, midrangeRate: 2, turnovers: -2, fouls: 5, rebounding: 8, fatigue: 4 },
    counters: ['switch_heavy', 'drop'],
  },
  {
    id: 'zone_trap',
    name: 'Zone Trap',
    description: 'A disruptive zone look that baits passes, crowds lanes, and creates live-ball turnovers.',
    boostSummary: 'Boosts steals, perimeter defense, speed, and defense IQ for alert defenders. Poor fits can lose defense IQ and stamina.',
    offense: 'balanced',
    defense: 'zone',
    modifiers: { pace: 3, threePointRate: 2, rimPressure: 1, midrangeRate: 1, turnovers: 8, fouls: 1, rebounding: 1, fatigue: 6 },
    counters: ['protect_paint', 'drop'],
  },
  {
    id: 'small_ball_switch',
    name: 'Small Ball Switch',
    description: 'A spacing-heavy lineup that switches, runs, and turns versatile wings into matchup problems.',
    boostSummary: 'Boosts speed, perimeter defense, 3PT, and help defense for switchable players. Poor fits can lose rebounding and post defense.',
    offense: 'pace_and_space',
    defense: 'switch_heavy',
    modifiers: { pace: 8, threePointRate: 8, rimPressure: 2, midrangeRate: -3, turnovers: 1, fouls: 3, rebounding: -5, fatigue: 7 },
    counters: ['drop', 'zone'],
  },
  {
    id: 'twin_towers',
    name: 'Twin Towers',
    description: 'A size-first setup that protects the paint, owns the glass, and lets bigs decide possessions.',
    boostSummary: 'Boosts blocking, post defense, rebounding, and strength for true bigs. Poor fits can lose speed and 3PT spacing.',
    offense: 'post_heavy',
    defense: 'protect_paint',
    modifiers: { pace: -8, threePointRate: -7, rimPressure: 6, midrangeRate: 1, turnovers: 1, fouls: 4, rebounding: 10, fatigue: 3 },
    counters: ['drop', 'switch_heavy'],
  },
];

export function coachingPresetInfoText(preset: Pick<CoachingPreset, 'name'> & Partial<Pick<CoachingPreset, 'description' | 'boostSummary'>>): string {
  const description = preset.description || `${preset.name} uses your saved offensive and defensive modifier settings.`;
  const boostSummary = preset.boostSummary || 'Custom game plans use your modifier tuning, while built-in presets also include roster-fit grade boosts.';
  return `${description}\n\nBoost fit: ${boostSummary}`;
}

const GRADE_VALUES: Record<string, number> = {
  S: 99,
  'A+': 97,
  A: 92,
  'A-': 87,
  'B+': 82,
  B: 77,
  'B-': 72,
  'C+': 68,
  C: 63,
  'C-': 57,
  'D+': 55,
  D: 52,
  'D-': 47,
  F: 42,
};

function gradeValue(value: unknown): number | null {
  const key = String(value || '').trim().toUpperCase();
  return GRADE_VALUES[key] || null;
}

function clampGrade(value: number): number {
  return Math.max(25, Math.min(99, Math.round(value)));
}

function skill(player: PlayerLike, key: string, fallback = 60): number {
  const hidden = player && player.hidden && typeof player.hidden === 'object' ? player.hidden : {};
  const hiddenValue = Number(hidden[key]);
  if (Number.isFinite(hiddenValue)) return hiddenValue;
  const directValue = Number(player && player[key]);
  if (Number.isFinite(directValue)) return directValue;
  const directGrade = gradeValue(player && player.grades && player.grades[key]);
  if (directGrade) return directGrade;
  const visibleGrade = gradeValue(player && player.visible && player.visible.grades && player.visible.grades[key]);
  if (visibleGrade) return visibleGrade;
  return fallback;
}

function positionText(player: PlayerLike): string {
  return String(player && player.position || '').toUpperCase();
}

function identityText(player: PlayerLike): string {
  const labels: string[] = [];
  const playerLabels = player && player.labels;
  if (Array.isArray(playerLabels)) {
    labels.push(...playerLabels);
  }
  return [
    ...labels,
    player && player.archetype,
    player && player.playStyle,
    player && player.playstyle,
  ].filter(Boolean).join(' ').toLowerCase();
}

function isBig(player: PlayerLike): boolean {
  const position = positionText(player);
  return position.includes('PF') || position.includes('C') || position.includes('F-C');
}

function isGuardOrWing(player: PlayerLike): boolean {
  const position = positionText(player);
  return position.includes('PG') || position.includes('SG') || position.includes('SF') || position === 'G' || position === 'F';
}

function add(adjustments: CoachingGradeAdjustments, key: string, value: number) {
  if (!value) return;
  adjustments[key] = Math.max(-2, Math.min(2, (adjustments[key] || 0) + value));
}

export function getCoachingGradeAdjustments(presetId: string | null | undefined, player: PlayerLike): CoachingGradeAdjustments {
  const id = String(presetId || 'balanced');
  const text = identityText(player);
  const adjustments: CoachingGradeAdjustments = {};
  if (id === 'balanced') return adjustments;

  if (id === 'pace_and_space' || id === 'seven_seconds') {
    const fits = skill(player, 'threePoint') >= 75 || skill(player, 'speed') >= 78 || skill(player, 'playmaking') >= 78;
    if (fits) {
      add(adjustments, 'threePoint', 1);
      add(adjustments, 'speed', id === 'seven_seconds' ? 2 : 1);
      add(adjustments, 'playmaking', 1);
      add(adjustments, 'stamina', 1);
    } else {
      add(adjustments, 'postOffense', -1);
      add(adjustments, 'stamina', -1);
    }
  }

  if (id === 'grit_and_grind') {
    const fits = skill(player, 'defense') >= 74 || skill(player, 'rebounding') >= 76 || skill(player, 'strength') >= 76 || text.includes('defen');
    if (fits) {
      add(adjustments, 'defense', 2);
      add(adjustments, 'defenseIq', 1);
      add(adjustments, 'rebounding', 1);
      add(adjustments, 'strength', 1);
    } else {
      add(adjustments, 'defense', -1);
      add(adjustments, 'stamina', -1);
    }
  }

  if (id === 'blitz_pressure' || id === 'zone_trap') {
    const fits = skill(player, 'steals') >= 74 || skill(player, 'speed') >= 76 || skill(player, 'perimeterDefense') >= 76 || text.includes('defen');
    if (fits) {
      add(adjustments, 'steals', 2);
      add(adjustments, 'perimeterDefense', 1);
      add(adjustments, 'speed', 1);
      add(adjustments, 'defenseIq', id === 'zone_trap' ? 2 : 1);
    } else {
      add(adjustments, 'defenseIq', -1);
      add(adjustments, 'stamina', -1);
    }
  }

  if (id === 'triangle_control') {
    const fits = skill(player, 'basketballIq') >= 76 || skill(player, 'passing') >= 76 || skill(player, 'postOffense') >= 76 || skill(player, 'midRange') >= 76;
    if (fits) {
      add(adjustments, 'basketballIq', 2);
      add(adjustments, 'passing', 1);
      add(adjustments, 'midRange', 1);
      add(adjustments, 'postOffense', 1);
    } else {
      add(adjustments, 'ballHandle', -1);
    }
  }

  if (id === 'lob_city') {
    const fits = skill(player, 'dunking') >= 78 || skill(player, 'athleticism') >= 80 || (isBig(player) && skill(player, 'closeShot') >= 75);
    if (fits) {
      add(adjustments, 'dunking', 2);
      add(adjustments, 'athleticism', 2);
      add(adjustments, 'closeShot', 1);
      add(adjustments, 'playmaking', isGuardOrWing(player) ? 1 : 0);
    } else {
      add(adjustments, 'midRange', -1);
      add(adjustments, 'stamina', -1);
    }
  }

  if (id === 'midrange_clinic') {
    const fits = skill(player, 'midRange') >= 76 || skill(player, 'shotIq') >= 76 || skill(player, 'freeThrow') >= 78;
    if (fits) {
      add(adjustments, 'midRange', 2);
      add(adjustments, 'shotIq', 1);
      add(adjustments, 'freeThrow', 1);
      add(adjustments, 'clutch', 1);
    } else {
      add(adjustments, 'threePoint', -1);
    }
  }

  if (id === 'bully_ball') {
    const fits = skill(player, 'strength') >= 76 || skill(player, 'postOffense') >= 76 || skill(player, 'postDefense') >= 76 || text.includes('defen');
    if (fits) {
      add(adjustments, 'strength', 2);
      add(adjustments, 'postOffense', 1);
      add(adjustments, 'postDefense', 2);
      add(adjustments, 'rebounding', 1);
      add(adjustments, 'defense', 1);
    } else {
      add(adjustments, 'speed', -1);
      add(adjustments, 'stamina', -1);
    }
  }

  if (id === 'small_ball_switch') {
    const fits = skill(player, 'speed') >= 76 || skill(player, 'perimeterDefense') >= 76 || skill(player, 'threePoint') >= 76;
    if (fits) {
      add(adjustments, 'speed', 2);
      add(adjustments, 'perimeterDefense', 2);
      add(adjustments, 'threePoint', 1);
      add(adjustments, 'helpDefense', 1);
    } else {
      add(adjustments, 'rebounding', -1);
      add(adjustments, 'postDefense', -1);
    }
  }

  if (id === 'twin_towers') {
    const fits = isBig(player) && (skill(player, 'blocking') >= 74 || skill(player, 'rebounding') >= 76 || skill(player, 'postDefense') >= 76);
    if (fits) {
      add(adjustments, 'blocking', 2);
      add(adjustments, 'postDefense', 2);
      add(adjustments, 'rebounding', 2);
      add(adjustments, 'strength', 1);
    } else {
      add(adjustments, 'speed', -1);
      add(adjustments, 'threePoint', -1);
    }
  }

  return adjustments;
}

export function applyCoachingGradeAdjustments<T extends PlayerLike>(player: T, presetId: string | null | undefined): T & { coachingGradeAdjustments?: CoachingGradeAdjustments } {
  const adjustments = getCoachingGradeAdjustments(presetId, player);
  const hidden = { ...(player.hidden || {}) } as Record<string, unknown>;
  Object.entries(adjustments).forEach(([key, delta]) => {
    hidden[key] = clampGrade(skill({ ...player, hidden }, key) + delta);
  });
  return {
    ...player,
    hidden,
    ...(Object.keys(adjustments).length > 0 ? { coachingGradeAdjustments: adjustments } : {}),
  };
}

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
