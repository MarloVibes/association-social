export type RotationStatus = 'active' | 'inactive' | 'rest';

export type RotationSlot = {
  playerId: string;
  minutes: number;
  starter?: boolean;
  benchOrder?: number;
  role?: 'primary' | 'secondary' | 'starter' | 'bench' | 'reserve';
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
  id?: string;
  bref_id?: string;
  full_name?: string;
  value?: number;
  rating?: number;
  overall?: number;
};

const CPU_MINUTES = Object.freeze([36, 34, 32, 30, 28, 24, 20, 16, 12, 8]);

function playerKey(player: CpuRotationPlayer): string {
  return String(player.playerId || player.id || player.bref_id || player.full_name || '');
}

function playerValue(player: CpuRotationPlayer): number {
  for (const value of [player.value, player.rating, player.overall]) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return 0;
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

export function buildCpuRotation(players: CpuRotationPlayer[]): RotationSlot[] {
  const ordered = [...players]
    .filter(player => playerKey(player))
    .sort((left, right) => playerValue(right) - playerValue(left) || playerKey(left).localeCompare(playerKey(right)));

  return ordered.slice(0, Math.max(10, Math.min(ordered.length, 15))).map((player, index): RotationSlot => ({
    playerId: playerKey(player),
    minutes: CPU_MINUTES[index] || 0,
    starter: index < 5,
    benchOrder: index >= 5 ? index - 4 : undefined,
    role: index < 2 ? 'primary' : index < 5 ? 'starter' : index < 10 ? 'bench' : 'reserve',
    status: index < 10 ? 'active' : 'inactive',
    closing: index < 5,
  }));
}
