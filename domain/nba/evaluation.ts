import type { NbaGrade } from './identity';
import { GRADE_ORDER, gradeFromNumeric } from './gradeScale';

export type GradeTier = 'Legend' | 'Elite' | 'Pro' | 'Contributor' | 'Prospect' | 'Development';

export type VisibleEvaluationGrade = {
  grade: NbaGrade;
  tier: GradeTier;
};

export type EvaluationLayers = {
  overallTalent: VisibleEvaluationGrade;
  currentForm: VisibleEvaluationGrade;
  potential: VisibleEvaluationGrade;
  confidence: { state: 'Low' | 'Shaky' | 'Steady' | 'High' };
  chemistry: { state: 'Cold' | 'Neutral' | 'Connected' | 'Locked In' };
  health: { state: 'Healthy' | 'Limited' | 'Injured' };
  fatigue: { state: 'Fresh' | 'Normal' | 'Tired' | 'Gassed' };
};

export type SimEvaluationSkills = {
  closeShot: number;
  midRange: number;
  threePoint: number;
  freeThrow: number;
  dunking: number;
  shotIq: number;
  passing: number;
  ballHandle: number;
  offenseIq: number;
  clutch: number;
  perimeterDefense: number;
  postDefense: number;
  blocking: number;
  stealsSkill: number;
  defenseIq: number;
  helpDefense: number;
  speed: number;
  acceleration: number;
  strength: number;
  rebounding: number;
  postOffense: number;
  stamina: number;
  offensiveImpact: number;
  defensiveImpact: number;
  formMultiplier: number;
  confidenceMultiplier: number;
  chemistryMultiplier: number;
  fatigueMultiplier: number;
};

const DEFAULT_SCORE = 74;

export const GRADE_LADDER: NbaGrade[] = GRADE_ORDER;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function numberFrom(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function sourceObject(player: Record<string, any>, profile: Record<string, any> | null | undefined, key: string) {
  const candidates = [
    player?.[key],
    player?.visible?.[key],
    player?.identity?.[key],
    player?.visibleIdentity?.[key],
    profile?.[key],
    profile?.visible?.[key],
    profile?.identity?.[key],
    profile?.visibleIdentity?.[key],
  ];
  return candidates.find(value => value && typeof value === 'object') || {};
}

function hiddenValue(player: Record<string, any>, profile: Record<string, any> | null | undefined, key: string, fallback = DEFAULT_SCORE) {
  const hidden = {
    ...sourceObject(profile || {}, null, 'hidden'),
    ...sourceObject(player, profile, 'hidden'),
  };
  const direct = player?.[key] ?? profile?.[key];
  return clamp(numberFrom(hidden[key] ?? direct, fallback), 0, 100);
}

function optionalHiddenValue(player: Record<string, any>, profile: Record<string, any> | null | undefined, key: string) {
  const hidden = {
    ...sourceObject(profile || {}, null, 'hidden'),
    ...sourceObject(player, profile, 'hidden'),
  };
  const direct = player?.[key] ?? profile?.[key];
  const numeric = numberFrom(hidden[key] ?? direct, Number.NaN);
  return Number.isFinite(numeric) ? clamp(numeric, 0, 100) : null;
}

function statValue(player: Record<string, any>, key: string, fallback = 0) {
  return numberFrom(player?.seasonStats?.[key] ?? player?.[key], fallback);
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

export function gradeFromScore(score: unknown): NbaGrade {
  return gradeFromNumeric(score);
}

export function gradeTier(grade: NbaGrade): GradeTier {
  if (grade === 'S') return 'Legend';
  if (grade.startsWith('A')) return 'Elite';
  if (grade.startsWith('B')) return 'Pro';
  if (grade.startsWith('C')) return 'Contributor';
  if (grade.startsWith('D')) return 'Prospect';
  return 'Development';
}

export function gradeSummary(score: unknown): VisibleEvaluationGrade {
  const grade = gradeFromScore(score);
  return { grade, tier: gradeTier(grade) };
}

function overallTalentScore(player: Record<string, any>, profile?: Record<string, any> | null) {
  const knownValues = [
    optionalHiddenValue(player, profile, 'shooting'),
    optionalHiddenValue(player, profile, 'playmaking'),
    optionalHiddenValue(player, profile, 'defense'),
    optionalHiddenValue(player, profile, 'rebounding'),
    optionalHiddenValue(player, profile, 'athleticism'),
    optionalHiddenValue(player, profile, 'basketballIq'),
  ].filter((value): value is number => value !== null);
  if (knownValues.length === 0) return DEFAULT_SCORE;
  const base = average(knownValues);
  const highEnd = Math.max(...knownValues);
  return base + Math.max(0, highEnd - base) * 0.18;
}

function currentFormScore(player: Record<string, any>, profile?: Record<string, any> | null) {
  const games = Math.max(1, statValue(player, 'games', statValue(player, 'gp', 1)));
  const ppg = statValue(player, 'points') || statValue(player, 'pts') || statValue(player, 'ppg');
  const rpg = statValue(player, 'rebounds') || statValue(player, 'reb') || statValue(player, 'rpg');
  const apg = statValue(player, 'assists') || statValue(player, 'ast') || statValue(player, 'apg');
  const stocks = (statValue(player, 'steals') || statValue(player, 'stl') || statValue(player, 'spg')) + (statValue(player, 'blocks') || statValue(player, 'blk') || statValue(player, 'bpg'));
  const production = clamp(62 + ppg * 0.85 + rpg * 0.8 + apg * 1.1 + stocks * 3 + Math.min(5, games * 0.2), 50, 96);
  const base = overallTalentScore(player, profile);
  return base * 0.62 + production * 0.38;
}

function confidenceState(score: number): EvaluationLayers['confidence']['state'] {
  if (score >= 86) return 'High';
  if (score >= 70) return 'Steady';
  if (score >= 55) return 'Shaky';
  return 'Low';
}

function chemistryState(score: number): EvaluationLayers['chemistry']['state'] {
  if (score >= 88) return 'Locked In';
  if (score >= 74) return 'Connected';
  if (score >= 58) return 'Neutral';
  return 'Cold';
}

function fatigueState(score: number): EvaluationLayers['fatigue']['state'] {
  if (score >= 80) return 'Fresh';
  if (score >= 62) return 'Normal';
  if (score >= 42) return 'Tired';
  return 'Gassed';
}

export function buildEvaluationLayers(player: Record<string, any>, profile?: Record<string, any> | null): EvaluationLayers {
  const confidence = hiddenValue(player, profile, 'confidence', 72);
  const chemistry = hiddenValue(player, profile, 'chemistry', 70);
  const fatigue = 100 - clamp(numberFrom(player?.fatigue ?? player?.teamFatigue, 12), 0, 100);
  const injured = Boolean(player?.injury || player?.injured || player?.health === 'Injured');
  const limited = Boolean(player?.health === 'Limited' || player?.injury?.severity === 'minor');

  return {
    overallTalent: gradeSummary(overallTalentScore(player, profile)),
    currentForm: gradeSummary(currentFormScore(player, profile)),
    potential: gradeSummary(hiddenValue(player, profile, 'potential', overallTalentScore(player, profile))),
    confidence: { state: confidenceState(confidence) },
    chemistry: { state: chemistryState(chemistry) },
    health: { state: injured ? 'Injured' : limited ? 'Limited' : 'Healthy' },
    fatigue: { state: fatigueState(fatigue) },
  };
}

function detailedSkill(player: Record<string, any>, profile: Record<string, any> | null | undefined, key: string, fallbacks: string[]) {
  for (const candidate of [key, ...fallbacks]) {
    const value = hiddenValue(player, profile, candidate, Number.NaN);
    if (Number.isFinite(value)) return value;
  }
  return DEFAULT_SCORE;
}

export function simSkillsFromEvaluation(player: Record<string, any>, profile?: Record<string, any> | null): SimEvaluationSkills {
  const confidence = hiddenValue(player, profile, 'confidence', 72);
  const chemistry = hiddenValue(player, profile, 'chemistry', 70);
  const form = currentFormScore(player, profile);
  const fatigue = 100 - clamp(numberFrom(player?.fatigue ?? player?.teamFatigue, 12), 0, 100);
  const closeShot = detailedSkill(player, profile, 'closeShot', ['insideScoring', 'shooting']);
  const midRange = detailedSkill(player, profile, 'midRange', ['midRangeShot', 'shooting']);
  const threePoint = detailedSkill(player, profile, 'threePoint', ['threePointShot', 'shooting']);
  const freeThrow = detailedSkill(player, profile, 'freeThrow', ['freeThrowShot', 'shooting']);
  const dunking = detailedSkill(player, profile, 'dunking', ['athleticism']);
  const shotIq = detailedSkill(player, profile, 'shotIq', ['basketballIq', 'consistency']);
  const passing = detailedSkill(player, profile, 'passing', ['playmaking']);
  const ballHandle = detailedSkill(player, profile, 'ballHandle', ['handles', 'playmaking']);
  const offenseIq = detailedSkill(player, profile, 'offenseIq', ['basketballIq', 'playmaking']);
  const clutch = detailedSkill(player, profile, 'clutch', ['consistency', 'basketballIq']);
  const perimeterDefense = detailedSkill(player, profile, 'perimeterDefense', ['defense', 'defenseIq']);
  const postDefense = detailedSkill(player, profile, 'postDefense', ['interiorDefense', 'defense', 'defenseIq', 'strength']);
  const blocking = detailedSkill(player, profile, 'blocking', ['blocks', 'defense', 'defenseIq']);
  const stealsSkill = detailedSkill(player, profile, 'steals', ['perimeterDefense', 'defense', 'defenseIq']);
  const defenseIq = detailedSkill(player, profile, 'defenseIq', ['basketballIq', 'defense']);
  const helpDefense = detailedSkill(player, profile, 'helpDefense', ['defenseIq', 'defense']);
  const speed = detailedSkill(player, profile, 'speed', ['athleticism']);
  const acceleration = detailedSkill(player, profile, 'acceleration', ['athleticism']);
  const strength = detailedSkill(player, profile, 'strength', ['athleticism']);
  const rebounding = detailedSkill(player, profile, 'rebounding', []);
  const postOffense = detailedSkill(player, profile, 'postOffense', ['insideScoring', 'closeShot', 'shooting']);
  const stamina = detailedSkill(player, profile, 'stamina', ['consistency']);

  return {
    closeShot,
    midRange,
    threePoint,
    freeThrow,
    dunking,
    shotIq,
    passing,
    ballHandle,
    offenseIq,
    clutch,
    perimeterDefense,
    postDefense,
    blocking,
    stealsSkill,
    defenseIq,
    helpDefense,
    speed,
    acceleration,
    strength,
    rebounding,
    postOffense,
    stamina,
    offensiveImpact: average([closeShot, midRange, threePoint, dunking, postOffense, shotIq, passing, offenseIq]),
    defensiveImpact: average([perimeterDefense, postDefense, blocking, stealsSkill, defenseIq, helpDefense, defenseIq]),
    formMultiplier: clamp(0.86 + form / 500, 0.88, 1.08),
    confidenceMultiplier: clamp(0.9 + confidence / 650, 0.9, 1.06),
    chemistryMultiplier: clamp(0.92 + chemistry / 700, 0.92, 1.05),
    fatigueMultiplier: clamp(0.82 + fatigue / 520, 0.82, 1.04),
  };
}
