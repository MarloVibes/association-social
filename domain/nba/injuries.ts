export type InjurySeverity = 'minor' | 'severe';

export type InjuryEvent = {
  id?: string;
  teamId?: string;
  playerId?: string;
  playerName?: string;
  severity: InjurySeverity;
  gamesRemaining: number;
  label: string;
  recoveryTag: string;
};

export type InjuryAction =
  | { type: 'add'; injury: InjuryEvent }
  | { type: 'update'; injuryId: string; patch: Partial<InjuryEvent> }
  | { type: 'remove'; injuryId: string };

export type GenerateInjuryEventInput = {
  minorCount: number;
  severeCount: number;
  seed: string;
  force?: InjurySeverity | null;
};

export type UpdateTeamFatigueInput = {
  current: number;
  minutesPlayed: number;
  recoveryDays: number;
};

const MAX_MINOR_EVENTS = 6;
const MAX_SEVERE_EVENTS = 2;

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededInt(seed: string, min: number, max: number): number {
  const range = max - min + 1;
  return min + (hashSeed(seed) % range);
}

export function generateInjuryEvent(input: GenerateInjuryEventInput): InjuryEvent | null {
  const severity = input.force ?? pickSeverity(input.seed);
  if (!severity) {
    return null;
  }

  if (severity === 'minor') {
    if (input.minorCount >= MAX_MINOR_EVENTS) {
      return null;
    }

    return {
      severity,
      gamesRemaining: seededInt(`${input.seed}:minor`, 1, 2),
      label: 'Minor injury',
      recoveryTag: 'day-to-day',
    };
  }

  if (input.severeCount >= MAX_SEVERE_EVENTS) {
    return null;
  }

  return {
    severity,
    gamesRemaining: seededInt(`${input.seed}:severe`, 6, 15),
    label: 'Severe injury',
    recoveryTag: 'out',
  };
}

export function updateTeamFatigue(input: UpdateTeamFatigueInput): number {
  const gameLoad = input.minutesPlayed / 60;
  const recovery = input.recoveryDays * 3;
  const next = input.current + gameLoad - recovery;
  return Math.max(0, Math.min(20, Math.round(next * 10) / 10));
}

function normalizedInjury(injury: InjuryEvent): InjuryEvent {
  const gamesRemaining = Number(injury.gamesRemaining);
  if (!Number.isInteger(gamesRemaining) || gamesRemaining < 0 || gamesRemaining > 82) {
    throw new Error('Enter a valid games remaining value.');
  }
  if (injury.severity !== 'minor' && injury.severity !== 'severe') {
    throw new Error('Choose a valid injury severity.');
  }
  return {
    ...injury,
    id: String(injury.id || `${injury.playerId || 'manual'}-${Date.now()}`),
    label: String(injury.label || (injury.severity === 'minor' ? 'Minor injury' : 'Severe injury')),
    recoveryTag: String(injury.recoveryTag || (injury.severity === 'minor' ? 'day-to-day' : 'out')),
    gamesRemaining,
  };
}

export function applyInjuryAction({ injuries, action }: { injuries: InjuryEvent[]; action: InjuryAction }): InjuryEvent[] {
  const current = Array.isArray(injuries) ? injuries : [];
  if (action.type === 'add') {
    const next = normalizedInjury(action.injury);
    return [...current.filter(injury => injury.id !== next.id), next];
  }
  if (action.type === 'remove') {
    return current.filter(injury => injury.id !== action.injuryId);
  }
  return current.map((injury) => {
    if (injury.id !== action.injuryId) return injury;
    return normalizedInjury({ ...injury, ...action.patch });
  });
}

function pickSeverity(seed: string): InjurySeverity | null {
  const roll = hashSeed(seed) % 100;
  if (roll < 1) {
    return 'severe';
  }
  if (roll < 9) {
    return 'minor';
  }
  return null;
}
