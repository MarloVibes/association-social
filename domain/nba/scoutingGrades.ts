import type { NbaGrade } from './identity';
import { gradeFromNumeric, gradeRank as rankGrade } from './gradeScale';
import { abilityGradesFromStats } from './upgradePoints';

export type ScoutingGradeKey =
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
  | 'rebounding'
  | 'postOffense'
  | 'stamina'
  | 'potential'
  | 'role'
  | 'impact'
  | 'overall'
  | 'tradeValue';

export type ScoutingGradeMap = Record<ScoutingGradeKey, NbaGrade>;

export type ScoutingGradeItem = {
  key: ScoutingGradeKey;
  label: string;
  grade: NbaGrade;
  colors: GradeColorStyle;
};

export type ScoutingGradeSection = {
  title: string;
  items: ScoutingGradeItem[];
};

export type GradeColorStyle = {
  textColor: string;
  backgroundColor: string;
  borderColor: string;
};

export type CompareGradeRow = {
  key: ScoutingGradeKey;
  label: string;
  left: NbaGrade;
  right: NbaGrade;
  winner: 'left' | 'right' | 'tie';
};

export type PotentialScoutingSummary = {
  label: 'High Upside' | 'Starter Upside' | 'Star Upside' | 'Near Peak' | 'Declining' | 'Limited Growth';
  description: string;
};

const VALID_GRADES = new Set<string>(['F', 'D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+', 'S']);
const META_GRADE_KEYS = ['role', 'impact', 'overall', 'tradeValue'] as const;

export const SCOUTING_GRADE_GROUPS: { title: string; items: { key: ScoutingGradeKey; label: string }[] }[] = [
  {
    title: 'Scoring',
    items: [
      { key: 'closeShot', label: 'Close Shot' },
      { key: 'midRange', label: 'Mid Range' },
      { key: 'threePoint', label: '3PT Shot' },
      { key: 'freeThrow', label: 'Free Throw' },
      { key: 'dunking', label: 'Dunking' },
      { key: 'shotIq', label: 'Shot IQ' },
    ],
  },
  {
    title: 'Playmaking / IQ',
    items: [
      { key: 'passing', label: 'Passing' },
      { key: 'ballHandle', label: 'Ball Handle' },
      { key: 'offenseIq', label: 'Offense IQ' },
      { key: 'clutch', label: 'Clutch' },
    ],
  },
  {
    title: 'Defense',
    items: [
      { key: 'perimeterDefense', label: 'Perimeter D' },
      { key: 'postDefense', label: 'Post Defense' },
      { key: 'blocking', label: 'Blocking' },
      { key: 'steals', label: 'Steals' },
      { key: 'defenseIq', label: 'Defense IQ' },
      { key: 'helpDefense', label: 'Help Defense' },
    ],
  },
  {
    title: 'Physical / Interior',
    items: [
      { key: 'speed', label: 'Speed' },
      { key: 'acceleration', label: 'Acceleration' },
      { key: 'strength', label: 'Strength' },
      { key: 'rebounding', label: 'Rebounding' },
      { key: 'postOffense', label: 'Post Offense' },
      { key: 'stamina', label: 'Stamina' },
    ],
  },
  {
    title: 'Growth',
    items: [
      { key: 'potential', label: 'Potential' },
    ],
  },
];

const SCOUTING_KEYS = SCOUTING_GRADE_GROUPS.flatMap(group => group.items.map(item => item.key));
const ALL_GRADE_KEYS: ScoutingGradeKey[] = [...SCOUTING_KEYS, ...META_GRADE_KEYS];

function numberFrom(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function clamp(value: number, min = 0, max = 100) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function normalizedGrade(value: unknown): NbaGrade | null {
  const normalized = String(value || '').trim().toUpperCase();
  return VALID_GRADES.has(normalized) ? normalized as NbaGrade : null;
}

function gradeFromRating(value: unknown): NbaGrade | null {
  const numeric = numberFrom(value);
  if (numeric === null) return null;
  return gradeFromNumeric(numeric);
}

function firstGrade(...values: unknown[]): NbaGrade | null {
  for (const value of values) {
    const grade = normalizedGrade(value) || gradeFromRating(value);
    if (grade) return grade;
  }
  return null;
}

function sourceObject(player: Record<string, any>, profile: Record<string, any> | null | undefined, key: string) {
  const candidates = [
    profile?.[key],
    profile?.visible?.[key],
    profile?.identity?.[key],
    profile?.visibleIdentity?.[key],
    player?.[key],
    player?.visible?.[key],
    player?.identity?.[key],
    player?.visibleIdentity?.[key],
  ];
  return candidates.find(value => value && typeof value === 'object') || {};
}

function ratingObjects(player: Record<string, any>, profile: Record<string, any> | null | undefined) {
  return [
    sourceObject(player, profile, 'era_adjusted_profiles'),
    sourceObject(player, profile, 'attribute_model'),
    sourceObject(player, profile, 'numericAttributes'),
    sourceObject(player, profile, 'attributes'),
    sourceObject(player, profile, 'ratings'),
    sourceObject(player, profile, 'hidden'),
  ];
}

function directNumber(player: Record<string, any>, profile: Record<string, any> | null | undefined, key: string) {
  const values = [
    ...ratingObjects(player, profile).map(source => source[key]),
    player?.[key],
    profile?.[key],
  ];
  for (const value of values) {
    const numeric = numberFrom(value);
    if (numeric !== null) return clamp(numeric);
  }
  return null;
}

function firstNumber(player: Record<string, any>, profile: Record<string, any> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = directNumber(player, profile, key);
    if (value !== null) return value;
  }
  return null;
}

function statNumber(player: Record<string, any>, profile: Record<string, any> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = player?.[key]
      ?? player?.seasonStats?.[key]
      ?? profile?.[key]
      ?? profile?.source_stat_line?.[key]
      ?? profile?.careerStats?.[key];
    const numeric = numberFrom(value);
    if (numeric !== null) return numeric;
  }
  return null;
}

function hasSourceTag(player: Record<string, any>, profile: Record<string, any> | null | undefined, tag: string) {
  const target = tag.toLowerCase();
  const tags = [
    ...(profile?.source_stat_line?.scoutingTags || []),
    ...(profile?.scoutingTags || []),
    ...(player?.source_stat_line?.scoutingTags || []),
    ...(player?.scoutingTags || []),
  ];
  return tags.some(value => String(value).toLowerCase() === target);
}

function suspiciousThreePointSample(player: Record<string, any>, profile: Record<string, any> | null | undefined) {
  const pct = statNumber(player, profile, ['threePointPct', 'fg3_pct', 'three_pct']);
  const attempts = statNumber(player, profile, ['threePointAttemptsPerGame', 'fg3a_per_game', 'three_attempts', 'threePointAttempts', 'fg3a']);
  return pct !== null
    && attempts !== null
    && pct >= 0.9
    && attempts >= 2
    && !hasSourceTag(player, profile, 'verified_shooting_data');
}

function volumeModifier(player: Record<string, any>, profile: Record<string, any> | null | undefined) {
  const attempts = statNumber(player, profile, ['threePointAttemptsPerGame', 'fg3a_per_game', 'three_attempts', 'threePointAttempts', 'fg3a']);
  if (attempts === null) return null;
  if (suspiciousThreePointSample(player, profile)) return 55;
  return clamp(58 + attempts * 6, 50, 96);
}

function weightedRating(
  player: Record<string, any>,
  profile: Record<string, any> | null | undefined,
  weights: { keys: string[]; weight: number; fallback?: number | null }[],
) {
  let total = 0;
  let weightTotal = 0;
  for (const item of weights) {
    const value = firstNumber(player, profile, item.keys) ?? item.fallback ?? null;
    if (value === null) continue;
    total += value * item.weight;
    weightTotal += item.weight;
  }
  return weightTotal > 0 ? total / weightTotal : null;
}

function statRatingForKey(player: Record<string, any>, profile: Record<string, any> | null | undefined, key: ScoutingGradeKey) {
  const ppg = statNumber(player, profile, ['pointsPerGame', 'ppg', 'points']) ?? 0;
  const apg = statNumber(player, profile, ['assistsPerGame', 'apg', 'assists']) ?? 0;
  const rpg = statNumber(player, profile, ['reboundsPerGame', 'rpg', 'rebounds']) ?? 0;
  const spg = statNumber(player, profile, ['stealsPerGame', 'spg', 'stl', 'steals']) ?? 0;
  const bpg = statNumber(player, profile, ['blocksPerGame', 'bpg', 'blk', 'blocks']) ?? 0;
  const fg = statNumber(player, profile, ['fieldGoalPct', 'fg_pct', 'fgp']);
  const threePct = statNumber(player, profile, ['threePointPct', 'fg3_pct', 'three_pct']);
  const ft = statNumber(player, profile, ['freeThrowPct', 'ft_pct', 'ftp']);
  const minutes = statNumber(player, profile, ['minutesPerGame', 'mp_per_game', 'mpg']) ?? 0;
  const games = statNumber(player, profile, ['games', 'gp']) ?? 0;
  const pct = (value: number | null) => value === null ? null : value > 1 ? value / 100 : value;
  if (key === 'threePoint' && threePct !== null) {
    const pctScore = clamp(48 + pct(threePct)! * 105, 45, 96);
    const volume = volumeModifier(player, profile) ?? 72;
    return pctScore * 0.78 + volume * 0.22;
  }
  if (key === 'closeShot' && (fg !== null || ppg > 0)) return clamp(58 + ppg * 0.9 + (pct(fg) || 0.45) * 26, 45, 95);
  if (key === 'freeThrow' && ft !== null) return clamp(42 + pct(ft)! * 60, 45, 98);
  if (key === 'passing' && apg > 0) return clamp(54 + apg * 4.6, 45, 96);
  if (key === 'rebounding' && rpg > 0) return clamp(50 + rpg * 3.8, 45, 96);
  if ((key === 'perimeterDefense' || key === 'defenseIq' || key === 'steals') && (spg > 0 || bpg > 0)) return clamp(58 + spg * 9 + bpg * 5, 45, 94);
  if ((key === 'blocking' || key === 'postDefense') && bpg > 0) return clamp(54 + bpg * 13 + rpg * 0.8, 45, 96);
  if (key === 'stamina' && (minutes > 0 || games > 0)) return clamp(55 + minutes * 0.7 + games * 0.1, 45, 96);
  return null;
}

function roleRating(player: Record<string, any>, profile: Record<string, any> | null | undefined) {
  const minutes = firstNumber(player, profile, ['minutes']) ?? statNumber(player, profile, ['minutesPerGame', 'mp_per_game', 'mpg']) ?? 0;
  const usage = firstNumber(player, profile, ['usage']) ?? statNumber(player, profile, ['usagePct', 'usage_pct']) ?? 0;
  const minutesRating = clamp(48 + minutes * 1.25, 45, 96);
  const usageRating = clamp(50 + usage * 1.35, 45, 96);
  return minutesRating * 0.6 + usageRating * 0.4;
}

function numericRatingForKey(player: Record<string, any>, profile: Record<string, any> | null | undefined, key: ScoutingGradeKey): number | null {
  switch (key) {
    case 'threePoint':
      {
        const rating = weightedRating(player, profile, [
        { keys: ['threePoint', 'threePointShot'], weight: 70 },
        { keys: ['shotIq'], weight: 10 },
        { keys: ['consistency', 'shotConsistency'], weight: 10 },
        { keys: ['offenseIq', 'offensiveAwareness'], weight: 5 },
        { keys: ['shotVolumeModifier'], weight: 5, fallback: volumeModifier(player, profile) },
        ]) ?? statRatingForKey(player, profile, key);
        if (rating === null) return null;
        if (suspiciousThreePointSample(player, profile)) return Math.min(rating, 69.4);
        const attempts = statNumber(player, profile, ['threePointAttemptsPerGame', 'fg3a_per_game', 'three_attempts', 'threePointAttempts', 'fg3a']);
        if (attempts !== null && attempts < 1 && !hasSourceTag(player, profile, 'elite_shooter')) return Math.min(rating, 59.4);
        return rating;
      }
    case 'closeShot':
      return weightedRating(player, profile, [
        { keys: ['closeShot', 'insideScoring', 'drivingLayup'], weight: 70 },
        { keys: ['shotIq'], weight: 10 },
        { keys: ['offenseIq', 'offensiveAwareness'], weight: 10 },
        { keys: ['hands', 'drawFoul', 'strength'], weight: 10 },
      ]) ?? statRatingForKey(player, profile, key);
    case 'dunking':
      return weightedRating(player, profile, [
        { keys: ['dunking', 'drivingDunk', 'standingDunk'], weight: 70 },
        { keys: ['vertical', 'athleticism'], weight: 10 },
        { keys: ['speed', 'acceleration'], weight: 10 },
        { keys: ['strength', 'hands'], weight: 10 },
      ]);
    case 'passing':
      return weightedRating(player, profile, [
        { keys: ['passing', 'passAccuracy'], weight: 60 },
        { keys: ['passIq', 'offenseIq'], weight: 20 },
        { keys: ['passVision', 'basketballIq'], weight: 15 },
        { keys: ['turnoverControl', 'consistency'], weight: 5 },
      ]) ?? statRatingForKey(player, profile, key);
    case 'ballHandle':
      return weightedRating(player, profile, [
        { keys: ['ballHandle', 'handles'], weight: 80 },
        { keys: ['speedWithBall', 'speed', 'acceleration'], weight: 10 },
        { keys: ['passing', 'passIq'], weight: 5 },
        { keys: ['offenseIq'], weight: 5 },
      ]);
    case 'perimeterDefense':
      return weightedRating(player, profile, [
        { keys: ['perimeterDefense'], weight: 55 },
        { keys: ['lateralQuickness', 'speed', 'acceleration'], weight: 15 },
        { keys: ['steals', 'steal'], weight: 15 },
        { keys: ['defenseIq', 'defensiveIq'], weight: 15 },
      ]) ?? statRatingForKey(player, profile, key);
    case 'postDefense':
      return weightedRating(player, profile, [
        { keys: ['postDefense', 'interiorDefense'], weight: 50 },
        { keys: ['blocking', 'block'], weight: 15 },
        { keys: ['strength'], weight: 20 },
        { keys: ['defenseIq'], weight: 15 },
      ]) ?? statRatingForKey(player, profile, key);
    case 'rebounding':
      return weightedRating(player, profile, [
        { keys: ['rebounding'], weight: 55 },
        { keys: ['offensiveRebound'], weight: 12 },
        { keys: ['defensiveRebound'], weight: 18 },
        { keys: ['vertical'], weight: 5 },
        { keys: ['strength'], weight: 10 },
      ]) ?? statRatingForKey(player, profile, key);
    case 'offenseIq':
      return weightedRating(player, profile, [
        { keys: ['offenseIq', 'offensiveAwareness'], weight: 55 },
        { keys: ['shotIq'], weight: 25 },
        { keys: ['passIq', 'passing'], weight: 20 },
      ]);
    case 'defenseIq':
      return weightedRating(player, profile, [
        { keys: ['defenseIq', 'defensiveIq'], weight: 60 },
        { keys: ['helpDefense', 'helpDefenseIq'], weight: 25 },
        { keys: ['perimeterDefense', 'postDefense'], weight: 15 },
      ]) ?? statRatingForKey(player, profile, key);
    case 'speed':
      return weightedRating(player, profile, [
        { keys: ['speed'], weight: 70 },
        { keys: ['acceleration'], weight: 15 },
        { keys: ['stamina', 'hustle'], weight: 15 },
      ]);
    case 'acceleration':
      return weightedRating(player, profile, [
        { keys: ['acceleration'], weight: 75 },
        { keys: ['speed'], weight: 15 },
        { keys: ['agility', 'vertical'], weight: 10 },
      ]);
    case 'potential':
      {
        const curvePotential = numberFrom(
          player?.development_curve?.potential
          ?? profile?.development_curve?.potential
          ?? player?.baselineRatingProfile?.development_curve?.potential,
        );
        if (curvePotential !== null) return curvePotential;
      }
      return potentialRating(player, profile);
    case 'role':
      return roleRating(player, profile);
    case 'impact':
      return impactRating(player, profile);
    case 'overall':
      return overallRating(player, profile);
    case 'tradeValue':
      return firstNumber(player, profile, ['tradeValue']) ?? tradeValueRating(player, profile);
    default:
      return firstNumber(player, profile, [key]) ?? statRatingForKey(player, profile, key);
  }
}

function impactRating(player: Record<string, any>, profile: Record<string, any> | null | undefined) {
  const skillValues = ['threePoint', 'closeShot', 'passing', 'ballHandle', 'perimeterDefense', 'defenseIq', 'speed']
    .map(key => numericRatingForKey(player, profile, key as ScoutingGradeKey))
    .filter((value): value is number => value !== null);
  const bestSkill = skillValues.length > 0 ? Math.max(...skillValues) : 74;
  const role = roleRating(player, profile);
  const consistency = firstNumber(player, profile, ['consistency']) ?? 74;
  return bestSkill * 0.35 + role * 0.45 + consistency * 0.2;
}

function overallRating(player: Record<string, any>, profile: Record<string, any> | null | undefined) {
  const impact = impactRating(player, profile);
  const role = roleRating(player, profile);
  const durability = firstNumber(player, profile, ['durability', 'stamina']) ?? 74;
  return impact * 0.62 + role * 0.18 + durability * 0.2;
}

function potentialRating(player: Record<string, any>, profile: Record<string, any> | null | undefined) {
  const overall = overallRating(player, profile);
  const storedPotential = firstNumber(player, profile, ['potential']);
  const age = Number(player?.age ?? profile?.age ?? 27);
  const developmentRate = firstNumber(player, profile, ['developmentRate', 'development']) ?? 74;
  const workEthic = firstNumber(player, profile, ['workEthic']) ?? 74;
  const injuryPenalty = Math.min(8, Number(player?.injuryHistory ?? profile?.injuryHistory ?? 0) * 2);
  const minutesOpportunity = roleRating(player, profile);
  const trend = firstNumber(player, profile, ['performanceTrend']) ?? 74;
  const hiddenDevelopment = firstNumber(player, profile, ['hiddenDevelopment', 'developmentRating']) ?? developmentRate;
  const identityText = `${player?.visibleIdentity?.reputation || player?.identity?.reputation || profile?.visibleIdentity?.reputation || profile?.identity?.reputation || ''}`.toLowerCase();
  const isStarLevel = identityText.includes('superstar') || identityText.includes('legend') || overall >= 89;
  const ageCurve = age <= 24 ? 6 : age <= 28 ? 3 : age <= 31 ? 0 : age <= 34 ? -4 : -9;
  const growthContext = (
    developmentRate * 0.24
    + workEthic * 0.22
    + minutesOpportunity * 0.14
    + trend * 0.16
    + hiddenDevelopment * 0.24
  );
  const contextPotential = overall * 0.55 + growthContext * 0.35 + ageCurve - injuryPenalty;
  const storedBlend = storedPotential === null ? contextPotential : Math.max(storedPotential, contextPotential * 0.88);
  const starFloor = isStarLevel && age <= 30 ? Math.max(storedBlend, overall - 4, 85) : storedBlend;
  return clamp(starFloor, 40, 99);
}

function tradeValueRating(player: Record<string, any>, profile: Record<string, any> | null | undefined) {
  const overall = overallRating(player, profile);
  const potential = firstNumber(player, profile, ['potential']) ?? overall;
  const age = Number(player?.age ?? profile?.age ?? 27);
  const ageBonus = age <= 24 ? 4 : age >= 33 ? -5 : 0;
  return clamp(overall * 0.72 + potential * 0.28 + ageBonus, 40, 99);
}

function gradeFromExplicit(player: Record<string, any>, profile: Record<string, any> | null | undefined, key: ScoutingGradeKey) {
  const expanded = sourceObject(player, profile, 'scoutingGrades');
  return normalizedGrade(expanded[key]);
}

function gradeFromLegacy(player: Record<string, any>, profile: Record<string, any> | null | undefined, key: ScoutingGradeKey) {
  const legacy = {
    ...sourceObject(profile || {}, null, 'abilityGrades'),
    ...sourceObject(profile || {}, null, 'grades'),
    ...sourceObject(player, profile, 'abilityGrades'),
    ...sourceObject(player, profile, 'grades'),
  };
  const grade = (legacyKey: string) => normalizedGrade(legacy[legacyKey]);
  switch (key) {
    case 'closeShot':
    case 'midRange':
    case 'threePoint':
    case 'freeThrow':
    case 'shotIq':
      return grade('shooting');
    case 'passing':
    case 'ballHandle':
    case 'offenseIq':
    case 'clutch':
      return grade('playmaking') || grade('basketballIq');
    case 'perimeterDefense':
    case 'postDefense':
    case 'blocking':
    case 'steals':
    case 'defenseIq':
    case 'helpDefense':
      return grade('defense');
    case 'rebounding':
      return grade('rebounding');
    case 'speed':
    case 'acceleration':
    case 'strength':
    case 'dunking':
    case 'stamina':
      return grade('athleticism');
    case 'postOffense':
      return grade('rebounding') || grade('shooting');
    case 'potential':
      return grade('potential');
    case 'role':
    case 'impact':
    case 'overall':
    case 'tradeValue':
      return grade(key);
    default:
      return null;
  }
}

function gradeFromHidden(player: Record<string, any>, profile: Record<string, any> | null | undefined, key: ScoutingGradeKey) {
  const hidden = {
    ...sourceObject(profile || {}, null, 'hidden'),
    ...sourceObject(player, profile, 'hidden'),
  };
  const value = (...keys: string[]) => firstGrade(...keys.map(candidate => hidden[candidate]));
  switch (key) {
    case 'closeShot': return value('closeShot', 'insideScoring', 'shooting');
    case 'midRange': return value('midRange', 'midRangeShot', 'shooting');
    case 'threePoint': return value('threePoint', 'threePointShot');
    case 'freeThrow': return value('freeThrow', 'freeThrowShot', 'shooting');
    case 'dunking': return value('dunking', 'athleticism');
    case 'shotIq': return value('shotIq', 'basketballIq', 'consistency');
    case 'passing': return value('passing', 'playmaking');
    case 'ballHandle': return value('ballHandle', 'handles', 'playmaking');
    case 'offenseIq': return value('offenseIq', 'basketballIq', 'playmaking');
    case 'clutch': return value('clutch', 'consistency', 'basketballIq');
    case 'perimeterDefense': return value('perimeterDefense', 'defense');
    case 'postDefense': return value('postDefense', 'interiorDefense', 'defense', 'strength');
    case 'blocking': return value('blocking', 'blocks', 'defense');
    case 'steals': return value('steals', 'perimeterDefense', 'defense');
    case 'defenseIq': return value('defenseIq', 'basketballIq', 'defense');
    case 'helpDefense': return value('helpDefense', 'defenseIq', 'defense');
    case 'speed': return value('speed', 'athleticism');
    case 'acceleration': return value('acceleration', 'athleticism');
    case 'strength': return value('strength', 'athleticism');
    case 'rebounding': return value('rebounding');
    case 'postOffense': return value('postOffense', 'insideScoring', 'closeShot', 'shooting');
    case 'stamina': return value('stamina', 'consistency');
    case 'potential': return value('potential');
    case 'role':
    case 'impact':
    case 'overall':
    case 'tradeValue':
      return value(key);
    default: return null;
  }
}

function gradeFromStats(player: Record<string, any>, profile: Record<string, any> | null | undefined, key: ScoutingGradeKey): NbaGrade | null {
  const broad = abilityGradesFromStats({
    ...(profile?.careerStats || {}),
    ...(profile?.seasons?.[0] || {}),
    ...player,
  });
  const legacyPlayer = { grades: broad };
  return gradeFromLegacy(legacyPlayer, null, key);
}

export function buildScoutingGrades(player: Record<string, any>, profile?: Record<string, any> | null): ScoutingGradeMap {
  return ALL_GRADE_KEYS.reduce((grades, key) => {
    const numeric = numericRatingForKey(player, profile, key);
    grades[key] = (
      (numeric !== null ? gradeFromNumeric(numeric) : null)
      || gradeFromExplicit(player, profile, key)
      || gradeFromHidden(player, profile, key)
      || gradeFromLegacy(player, profile, key)
      || gradeFromStats(player, profile, key)
      || 'C'
    );
    return grades;
  }, {} as ScoutingGradeMap);
}

export function gradeRank(grade: NbaGrade): number {
  return rankGrade(grade);
}

export function gradeColors(grade: NbaGrade): GradeColorStyle {
  if (grade === 'S') return { textColor: '#f5c451', backgroundColor: '#261f0c', borderColor: '#f5c451' };
  if (grade.startsWith('A')) return { textColor: '#00ff87', backgroundColor: '#062416', borderColor: '#00ff87' };
  if (grade.startsWith('B')) return { textColor: '#54a3ff', backgroundColor: '#071a2e', borderColor: '#2477d8' };
  if (grade.startsWith('C')) return { textColor: '#f7d154', backgroundColor: '#241f08', borderColor: '#c99c20' };
  if (grade.startsWith('D')) return { textColor: '#ff9f43', backgroundColor: '#2a1605', borderColor: '#cc7420' };
  return { textColor: '#ff4d5e', backgroundColor: '#2d080d', borderColor: '#bf2636' };
}

export function getScoutingGradeSections(player: Record<string, any>, profile?: Record<string, any> | null): ScoutingGradeSection[] {
  const grades = buildScoutingGrades(player, profile);
  return SCOUTING_GRADE_GROUPS.map(group => ({
    title: group.title,
    items: group.items.map(item => ({
      ...item,
      grade: grades[item.key],
      colors: gradeColors(grades[item.key]),
    })),
  }));
}

export function compareScoutingGrades(left: ScoutingGradeMap, right: ScoutingGradeMap): CompareGradeRow[] {
  return SCOUTING_GRADE_GROUPS.flatMap(group => group.items.map(item => {
    const leftGrade = left[item.key];
    const rightGrade = right[item.key];
    const leftRank = gradeRank(leftGrade);
    const rightRank = gradeRank(rightGrade);
    return {
      key: item.key,
      label: item.label,
      left: leftGrade,
      right: rightGrade,
      winner: leftRank === rightRank ? 'tie' : leftRank > rightRank ? 'left' : 'right',
    };
  }));
}

export function getCompareRowModel({
  leftName,
  rightName,
  row,
}: {
  leftName: string;
  rightName: string;
  row: CompareGradeRow;
}) {
  return {
    left: { name: leftName, grade: row.left },
    centerLabel: row.label,
    right: { grade: row.right, name: rightName },
    winner: row.winner,
    accessibilityLabel: `${leftName} ${row.left} ${row.label} ${row.right} ${rightName}`,
  };
}

export function getPotentialScoutingSummary(player: Record<string, any>, profile?: Record<string, any> | null): PotentialScoutingSummary {
  const age = Number(player?.age ?? profile?.age ?? profile?.source_stat_line?.age ?? 27);
  const grades = buildScoutingGrades(player, profile);
  const potential = gradeRank(grades.potential);
  const overall = gradeRank(grades.overall);

  if (age >= 34 && overall >= gradeRank('A-') && potential <= gradeRank('B-')) {
    return {
      label: 'Near Peak',
      description: 'A proven player already close to his ceiling, with growth limited by age and career stage.',
    };
  }
  if (age >= 34 && potential <= gradeRank('C+')) {
    return {
      label: 'Near Peak',
      description: 'A proven player already close to his ceiling, with growth limited by age and career stage.',
    };
  }
  if (age >= 32 && potential <= gradeRank('B-')) {
    return {
      label: 'Declining',
      description: 'Still useful now, but future growth is limited and regression risk is rising.',
    };
  }
  if (potential >= gradeRank('A-') || (overall >= gradeRank('A-') && age <= 28)) {
    return {
      label: 'Star Upside',
      description: 'Profile supports real star-level growth if minutes, health, and role stay aligned.',
    };
  }
  if (potential >= gradeRank('B')) {
    return {
      label: 'Starter Upside',
      description: 'Enough growth runway to become or remain a reliable starter-level piece.',
    };
  }
  if (age <= 24 && potential >= gradeRank('C+')) {
    return {
      label: 'High Upside',
      description: 'Young enough to outperform the current grade if development breaks right.',
    };
  }
  return {
    label: 'Limited Growth',
    description: 'Future growth looks modest unless role, health, or production trend changes.',
  };
}
