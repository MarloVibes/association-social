export type RotationStatus = 'active' | 'inactive' | 'rest';

export type RotationSlot = {
  playerId: string;
  minutes: number;
  starter?: boolean;
  benchOrder?: number;
  role?: 'primary' | 'secondary' | 'starter' | 'sixth_man' | 'bench' | 'reserve';
  status?: RotationStatus;
  closing?: boolean;
};

export type RotationValidation = {
  valid: boolean;
  errors: string[];
  totalMinutes: number;
  activeCount: number;
};

export type CpuRotationPlayer = {
  playerId?: string;
  player_id?: string;
  id?: string;
  bref_id?: string;
  full_name?: string;
  name?: string;
  value?: number;
  rating?: number;
  overall?: number;
  position?: string;
  minutes?: number;
  rotationMinutes?: number;
  minutesPerGame?: number;
  mpg?: number;
  ppg?: number;
  apg?: number;
  rpg?: number;
  spg?: number;
  bpg?: number;
  playerLabel?: string;
  tierLabel?: string;
  reputation?: string;
  role?: string;
  hidden?: Record<string, unknown>;
  grades?: Record<string, unknown>;
  skill_grades?: Record<string, unknown>;
  visible?: {
    grades?: Record<string, unknown>;
    reputation?: string;
  };
  visibleIdentity?: {
    reputation?: string;
  };
};

const CPU_MINUTES = Object.freeze([38, 36, 34, 32, 30, 24, 18, 14, 10, 4]);
const GRADE_VALUE: Record<string, number> = {
  S: 99,
  'A+': 97,
  A: 93,
  'A-': 90,
  'B+': 87,
  B: 82,
  'B-': 77,
  'C+': 72,
  C: 67,
  'C-': 62,
  D: 55,
  F: 45,
};

const ERROR_MESSAGES: Record<string, string> = {
  player_required: 'Every rotation slot needs a player.',
  duplicate_player: 'A player is listed more than once.',
  invalid_minutes: 'Minutes must be between 0 and 48.',
  inactive_minutes: 'Resting or inactive players cannot have minutes.',
  minutes_total: 'Active minutes must add up to 240.',
  starters_required: 'Choose exactly 5 starters.',
  closing_lineup_required: 'Choose exactly 5 active closing players.',
};

function playerKey(player: CpuRotationPlayer): string {
  return String(player.playerId || player.player_id || player.id || player.bref_id || player.full_name || player.name || '');
}

function normalizedPosition(player: CpuRotationPlayer): string {
  const value = String(player.position || '').toUpperCase();
  if (value.includes('PG')) return 'PG';
  if (value.includes('SG')) return 'SG';
  if (value.includes('SF')) return 'SF';
  if (value.includes('PF')) return 'PF';
  if (value.includes('C')) return 'C';
  if (value === 'G') return 'PG';
  if (value === 'F') return 'SF';
  return '';
}

function playerValue(player: CpuRotationPlayer): number {
  for (const value of [player.value, player.rating, player.overall]) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return rotationValue(player);
}

function numberFrom(player: CpuRotationPlayer, keys: string[], fallback = 0): number {
  for (const key of keys) {
    const direct = (player as Record<string, unknown>)[key];
    if (typeof direct === 'number' && Number.isFinite(direct)) return direct;
    if (typeof direct === 'string' && direct.trim() !== '' && Number.isFinite(Number(direct))) return Number(direct);
    const hidden = player.hidden?.[key];
    if (typeof hidden === 'number' && Number.isFinite(hidden)) return hidden;
    if (typeof hidden === 'string' && hidden.trim() !== '' && Number.isFinite(Number(hidden))) return Number(hidden);
  }
  return fallback;
}

function gradeFrom(player: CpuRotationPlayer, keys: string[], fallback = 0): number {
  const sources = [player.grades, player.skill_grades, player.visible?.grades];
  for (const source of sources) {
    if (!source) continue;
    for (const key of keys) {
      const raw = String(source[key] || '').trim().toUpperCase();
      if (GRADE_VALUE[raw] !== undefined) return GRADE_VALUE[raw];
    }
  }
  return fallback;
}

function skillValue(player: CpuRotationPlayer, keys: string[], fallback = 65): number {
  const numeric = numberFrom(player, keys, NaN);
  if (Number.isFinite(numeric)) return numeric;
  const graded = gradeFrom(player, keys, NaN);
  return Number.isFinite(graded) ? graded : fallback;
}

function tierBoost(player: CpuRotationPlayer): number {
  const raw = String(
    player.playerLabel
    || player.tierLabel
    || player.reputation
    || player.visible?.reputation
    || player.visibleIdentity?.reputation
    || player.role
    || '',
  ).toUpperCase();
  if (raw.includes('LEGEND')) return 12;
  if (raw.includes('SUPERSTAR')) return 10;
  if (raw.includes('STAR')) return 7;
  if (raw.includes('STARTER')) return 4;
  if (raw.includes('PROSPECT')) return -3;
  return 0;
}

function rotationValue(player: CpuRotationPlayer): number {
  const scoring = skillValue(player, ['scoring', 'shooting', 'threePoint', 'midRange', 'closeShot', 'finishing'], 65);
  const creation = skillValue(player, ['playmaking', 'passing', 'ballHandle', 'offenseIq'], 62);
  const defense = skillValue(player, ['defense', 'perimeterDefense', 'postDefense', 'interiorDefense', 'defenseIq'], 62);
  const rebounding = skillValue(player, ['rebounding', 'offensiveRebound', 'defensiveRebound'], 58);
  const iq = skillValue(player, ['basketballIq', 'offenseIq', 'defenseIq', 'shotIq'], 64);
  const stamina = skillValue(player, ['stamina', 'durability'], 70);
  const production = numberFrom(player, ['ppg'], 0) * 0.8
    + numberFrom(player, ['apg'], 0) * 1.1
    + numberFrom(player, ['rpg'], 0) * 0.75
    + numberFrom(player, ['spg'], 0) * 1.8
    + numberFrom(player, ['bpg'], 0) * 1.6;
  const realMinutes = numberFrom(player, ['minutes', 'rotationMinutes', 'minutesPerGame', 'mpg'], 0);
  return scoring * 0.28
    + creation * 0.2
    + defense * 0.22
    + rebounding * 0.12
    + iq * 0.1
    + stamina * 0.08
    + Math.min(12, production)
    + Math.min(8, realMinutes * 0.2)
    + tierBoost(player);
}

function minuteCap(player: CpuRotationPlayer): number {
  const explicitMinutes = numberFrom(player, ['minutes', 'rotationMinutes', 'minutesPerGame', 'mpg'], 0);
  if (explicitMinutes >= 34) return 40;
  if (explicitMinutes >= 30) return 38;
  if (explicitMinutes >= 24) return 34;
  if (tierBoost(player) >= 10) return 40;
  if (tierBoost(player) >= 7) return 36;

  const scoring = skillValue(player, ['scoring', 'shooting', 'threePoint', 'midRange', 'closeShot', 'finishing'], 65);
  const creation = skillValue(player, ['playmaking', 'passing', 'ballHandle', 'offenseIq'], 62);
  const defense = skillValue(player, ['defense', 'perimeterDefense', 'postDefense', 'interiorDefense', 'defenseIq'], 62);
  const rebounding = skillValue(player, ['rebounding', 'offensiveRebound', 'defensiveRebound'], 58);
  const production = numberFrom(player, ['ppg'], 0) + numberFrom(player, ['apg'], 0) + numberFrom(player, ['rpg'], 0);
  const offensiveRole = scoring * 0.58 + creation * 0.42;

  if (offensiveRole < 55 && production < 12) return defense >= 80 || rebounding >= 80 ? 18 : 12;
  if (offensiveRole < 62 && production < 16) return defense >= 78 || rebounding >= 78 ? 24 : 18;
  if (offensiveRole >= 82 || production >= 24) return 38;
  if (offensiveRole >= 74 || production >= 18) return 34;
  return 30;
}

function rotationMinutesFor(players: CpuRotationPlayer[]): number[] {
  const activeCount = Math.min(10, players.length);
  const minutes = players.map((player, index) => (
    index < activeCount ? Math.min(CPU_MINUTES[index] || 0, minuteCap(player)) : 0
  ));
  let diff = 240 - minutes.reduce((total, value) => total + value, 0);
  let guard = 0;

  while (diff > 0 && guard < 500) {
    const cursor = guard % activeCount;
    const cap = minuteCap(players[cursor]);
    if (minutes[cursor] < Math.min(40, cap)) {
      minutes[cursor] += 1;
      diff -= 1;
    }
    guard += 1;
  }

  guard = 0;
  while (diff > 0 && guard < 500) {
    const cursor = guard % activeCount;
    if (minutes[cursor] < 48) {
      minutes[cursor] += 1;
      diff -= 1;
    }
    guard += 1;
  }

  guard = 0;
  while (diff < 0 && guard < 500) {
    const cursor = activeCount - 1 - (guard % activeCount);
    if (minutes[cursor] > 0) {
      minutes[cursor] -= 1;
      diff += 1;
    }
    guard += 1;
  }

  return minutes;
}

function orderForLineup(players: CpuRotationPlayer[]): CpuRotationPlayer[] {
  const remaining = [...players];
  const starters: CpuRotationPlayer[] = [];

  for (const position of ['PG', 'SG', 'SF', 'PF', 'C']) {
    let index = remaining.findIndex(player => normalizedPosition(player) === position);
    if (index < 0 && position === 'SG') index = remaining.findIndex(player => normalizedPosition(player) === 'PG');
    if (index < 0 && position === 'SF') index = remaining.findIndex(player => ['SG', 'PF'].includes(normalizedPosition(player)));
    if (index < 0 && position === 'PF') index = remaining.findIndex(player => ['SF', 'C'].includes(normalizedPosition(player)));
    if (index < 0) index = 0;
    const [player] = remaining.splice(index, 1);
    if (player) starters.push(player);
  }

  return [...starters, ...remaining];
}

function roleForIndex(index: number): RotationSlot['role'] {
  if (index < 2) return 'primary';
  if (index < 5) return 'starter';
  if (index === 5) return 'sixth_man';
  if (index < 10) return 'bench';
  return 'reserve';
}

function isActive(slot: RotationSlot): boolean {
  return (slot.status || 'active') === 'active';
}

export function validateRotation(rotation: RotationSlot[]): RotationValidation {
  const errors: string[] = [];
  const activeSlots = rotation.filter(isActive);
  const totalMinutes = activeSlots.reduce((total, slot) => total + Number(slot.minutes || 0), 0);
  const seen = new Set<string>();

  for (const slot of rotation) {
    if (!slot.playerId) {
      if (!errors.includes('player_required')) errors.push('player_required');
      continue;
    }
    if (seen.has(slot.playerId) && !errors.includes('duplicate_player')) errors.push('duplicate_player');
    seen.add(slot.playerId);
    if (!Number.isFinite(slot.minutes) || slot.minutes < 0 || slot.minutes > 48) {
      if (!errors.includes('invalid_minutes')) errors.push('invalid_minutes');
    }
    if (!isActive(slot) && Number(slot.minutes || 0) > 0 && !errors.includes('inactive_minutes')) {
      errors.push('inactive_minutes');
    }
  }

  if (totalMinutes !== 240 && !errors.includes('inactive_minutes')) errors.push('minutes_total');

  const activePlayerIds = new Set(activeSlots.map(slot => slot.playerId));
  const managesStarters = rotation.some(slot => slot.starter !== undefined);
  if (managesStarters && activeSlots.filter(slot => slot.starter).length !== 5) errors.push('starters_required');

  const managesClosingLineup = rotation.some(slot => slot.closing !== undefined);
  const closing = activeSlots.filter(slot => slot.closing);
  if (managesClosingLineup && (closing.length !== 5 || closing.some(slot => !activePlayerIds.has(slot.playerId)))) {
    errors.push('closing_lineup_required');
  }

  return {
    valid: errors.length === 0,
    errors,
    totalMinutes,
    activeCount: activeSlots.length,
  };
}

export function rotationValidationMessages(validation: RotationValidation): string[] {
  if (validation.valid) return ['Legal rotation'];
  return validation.errors.map(error => ERROR_MESSAGES[error] || error);
}

export function buildCpuRotation(players: CpuRotationPlayer[]): RotationSlot[] {
  const ordered = [...players]
    .filter(player => playerKey(player))
    .sort((left, right) => playerValue(right) - playerValue(left) || playerKey(left).localeCompare(playerKey(right)));
  const selected = orderForLineup(ordered.slice(0, Math.max(10, Math.min(ordered.length, 15))));
  const minutes = rotationMinutesFor(selected);

  return selected.map((player, index): RotationSlot => ({
    playerId: playerKey(player),
    minutes: minutes[index] || 0,
    starter: index < 5,
    benchOrder: index >= 5 ? index - 4 : undefined,
    role: roleForIndex(index),
    status: index < 10 ? 'active' : 'inactive',
    closing: index < 5,
  }));
}
