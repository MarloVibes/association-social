import { buildVisibleIdentity, type HiddenIdentityValues, type VisibleNbaIdentity } from './identity';

export type ProgressionPlayer = {
  id: string;
  hidden: HiddenIdentityValues;
};

export type ProgressionSeason = {
  minutes?: number;
  points?: number;
  assists?: number;
  rebounds?: number;
  awards?: string[];
  injuryGamesMissed?: number;
};

export type ProgressedPlayer = ProgressionPlayer & {
  visible: VisibleNbaIdentity;
  progression: {
    seasonDelta: Partial<Record<keyof HiddenIdentityValues, number>>;
  };
};

type SkillKey =
  | 'shooting'
  | 'playmaking'
  | 'defense'
  | 'rebounding'
  | 'athleticism'
  | 'basketballIq'
  | 'consistency'
  | 'chemistry';

const SKILL_KEYS: SkillKey[] = [
  'shooting',
  'playmaking',
  'defense',
  'rebounding',
  'athleticism',
  'basketballIq',
  'consistency',
  'chemistry',
];

function hash(value: string): number {
  let h = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function ageCurve(age: number) {
  if (age <= 23) return 3;
  if (age <= 26) return 2;
  if (age <= 29) return 1;
  if (age <= 32) return 0;
  if (age <= 34) return -2;
  return -4;
}

function roleBonus(minutes: number) {
  if (minutes >= 2400) return 2;
  if (minutes >= 1600) return 1;
  if (minutes < 700) return -1;
  return 0;
}

function productionBonus(key: SkillKey, season: ProgressionSeason) {
  if (key === 'shooting' && Number(season.points || 0) >= 900) return 1;
  if (key === 'playmaking' && Number(season.assists || 0) >= 250) return 1;
  if (key === 'rebounding' && Number(season.rebounds || 0) >= 300) return 1;
  if (key === 'basketballIq' && Number(season.minutes || 0) >= 1800) return 1;
  return 0;
}

export function progressPlayer(player: ProgressionPlayer, season: ProgressionSeason, seed: string): ProgressedPlayer {
  const hidden = { ...player.hidden };
  const age = Number(hidden.age || 19);
  const base = ageCurve(age) + roleBonus(Number(season.minutes || 0));
  const awardBonus = (season.awards || []).length > 0 ? 1 : 0;
  const injuryPenalty = Math.min(3, Math.floor(Number(season.injuryGamesMissed || 0) / 10));
  const deltas: Partial<Record<keyof HiddenIdentityValues, number>> = {};

  SKILL_KEYS.forEach((key) => {
    const current = Number(hidden[key] || 60);
    const variance = (hash(`${seed}:${player.id}:${key}`) % 5) - 2;
    let delta = base + awardBonus + productionBonus(key, season) - injuryPenalty + variance;
    if (age >= 33 && (key === 'athleticism' || key === 'defense')) {
      delta = Math.min(delta, -1);
    }
    delta = clamp(delta, -8, 8);
    hidden[key] = clamp(Math.round(current + delta), 25, 99);
    deltas[key] = (hidden[key] as number) - current;
  });

  hidden.age = age + 1;
  hidden.seasonsPlayed = Number(hidden.seasonsPlayed || 0) + 1;

  return {
    ...player,
    hidden,
    visible: buildVisibleIdentity(hidden),
    progression: {
      seasonDelta: deltas,
    },
  };
}
