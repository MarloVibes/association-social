export type InjurySeverity = 'minor' | 'severe';

export type InjuryEvent = {
  severity: InjurySeverity;
  gamesRemaining: number;
  label: string;
  recoveryTag: string;
};

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
