import { buildVisibleIdentity, type HiddenIdentityValues, type VisibleNbaIdentity } from './identity';

export type ProgressionPlayer = {
  id: string;
  playstyle?: string;
  archetype?: string;
  position?: string;
  hidden: HiddenIdentityValues;
};

export type ProgressionSeason = {
  minutes?: number;
  points?: number;
  assists?: number;
  rebounds?: number;
  steals?: number;
  blocks?: number;
  awards?: string[];
  injuryGamesMissed?: number;
};

export type ProgressedPlayer = ProgressionPlayer & {
  visible: VisibleNbaIdentity;
  progression: {
    seasonDelta: Partial<Record<keyof HiddenIdentityValues, number>>;
    focusAreas: string[];
    seasonDeltaTotal: number;
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
  | 'chemistry'
  | 'closeShot'
  | 'midRange'
  | 'threePoint'
  | 'freeThrow'
  | 'dunking'
  | 'shotIq'
  | 'passing'
  | 'ballHandle'
  | 'offenseIq'
  | 'clutch'
  | 'perimeterDefense'
  | 'postDefense'
  | 'blocking'
  | 'steals'
  | 'defenseIq'
  | 'helpDefense'
  | 'speed'
  | 'acceleration'
  | 'strength'
  | 'postOffense'
  | 'stamina';

const SKILL_KEYS: SkillKey[] = [
  'shooting',
  'playmaking',
  'defense',
  'rebounding',
  'athleticism',
  'basketballIq',
  'consistency',
  'chemistry',
  'closeShot',
  'midRange',
  'threePoint',
  'freeThrow',
  'dunking',
  'shotIq',
  'passing',
  'ballHandle',
  'offenseIq',
  'clutch',
  'perimeterDefense',
  'postDefense',
  'blocking',
  'steals',
  'defenseIq',
  'helpDefense',
  'speed',
  'acceleration',
  'strength',
  'postOffense',
  'stamina',
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
  if ((key === 'threePoint' || key === 'midRange' || key === 'closeShot' || key === 'shotIq') && Number(season.points || 0) >= 900) return 1;
  if ((key === 'dunking' || key === 'postOffense') && Number(season.points || 0) >= 900 && Number(season.rebounds || 0) >= 250) return 1;
  if (key === 'playmaking' && Number(season.assists || 0) >= 250) return 1;
  if ((key === 'passing' || key === 'ballHandle' || key === 'offenseIq') && Number(season.assists || 0) >= 250) return 1;
  if (key === 'rebounding' && Number(season.rebounds || 0) >= 300) return 1;
  if ((key === 'strength' || key === 'postDefense') && Number(season.rebounds || 0) >= 300) return 1;
  if ((key === 'defense' || key === 'perimeterDefense' || key === 'helpDefense' || key === 'defenseIq' || key === 'steals') && Number(season.steals || 0) >= 70) return 1;
  if ((key === 'blocking' || key === 'postDefense' || key === 'helpDefense') && Number(season.blocks || 0) >= 45) return 1;
  if (key === 'stamina' && Number(season.minutes || 0) >= 2200) return 2;
  if (key === 'basketballIq' && Number(season.minutes || 0) >= 1800) return 1;
  return 0;
}

function potentialBonus(hidden: HiddenIdentityValues, current: number) {
  const potential = Number(hidden.potential || current);
  if (potential >= 92) return current < potential ? 2 : 1;
  if (potential >= 86) return current < potential ? 1 : 0;
  if (potential <= 68 && current >= potential) return -1;
  return 0;
}

function focusAreasFor(player: ProgressionPlayer, season: ProgressionSeason): SkillKey[] {
  const label = `${player.playstyle || ''} ${player.archetype || ''} ${player.position || ''}`.toLowerCase();
  const focus = new Set<SkillKey>();
  if (label.includes('two-way') || label.includes('wing') || label.includes('lockdown')) {
    ['defense', 'perimeterDefense', 'helpDefense', 'defenseIq', 'stamina', 'shooting', 'threePoint'].forEach(key => focus.add(key as SkillKey));
  }
  if (label.includes('shooter') || label.includes('sharp')) {
    ['shooting', 'threePoint', 'freeThrow', 'shotIq', 'clutch'].forEach(key => focus.add(key as SkillKey));
  }
  if (label.includes('play') || label.includes('point') || label.includes('creator')) {
    ['playmaking', 'passing', 'ballHandle', 'offenseIq', 'clutch'].forEach(key => focus.add(key as SkillKey));
  }
  if (label.includes('post') || label.includes('big') || label.includes('center') || label.includes('pf') || label.includes('c')) {
    ['rebounding', 'postOffense', 'postDefense', 'blocking', 'strength'].forEach(key => focus.add(key as SkillKey));
  }
  if (Number(season.points || 0) >= 1000) ['shooting', 'shotIq', 'clutch'].forEach(key => focus.add(key as SkillKey));
  if (Number(season.assists || 0) >= 250) ['playmaking', 'passing', 'offenseIq'].forEach(key => focus.add(key as SkillKey));
  if (Number(season.rebounds || 0) >= 350) ['rebounding', 'strength'].forEach(key => focus.add(key as SkillKey));
  if (Number(season.steals || 0) >= 70 || Number(season.blocks || 0) >= 45) ['defense', 'helpDefense', 'defenseIq'].forEach(key => focus.add(key as SkillKey));
  if (Number(season.minutes || 0) >= 2200) focus.add('stamina');
  return [...focus];
}

export function progressPlayer(player: ProgressionPlayer, season: ProgressionSeason, seed: string): ProgressedPlayer {
  const hidden = { ...player.hidden };
  const age = Number(hidden.age || 19);
  const base = ageCurve(age) + roleBonus(Number(season.minutes || 0));
  const awardBonus = (season.awards || []).length > 0 ? 1 : 0;
  const injuryPenalty = Math.min(3, Math.floor(Number(season.injuryGamesMissed || 0) / 10));
  const deltas: Partial<Record<keyof HiddenIdentityValues, number>> = {};
  const focusAreas = focusAreasFor(player, season);

  SKILL_KEYS.forEach((key) => {
    const current = Number(hidden[key] || 60);
    const variance = (hash(`${seed}:${player.id}:${key}`) % 5) - 2;
    const focusBonus = focusAreas.includes(key) ? 1 : 0;
    let delta = base + awardBonus + productionBonus(key, season) + potentialBonus(hidden, current) + focusBonus - injuryPenalty + variance;
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
      focusAreas,
      seasonDeltaTotal: Object.values(deltas).reduce((sum, value) => sum + Math.max(0, Number(value || 0)), 0),
    },
  };
}
