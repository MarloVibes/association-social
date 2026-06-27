import type { NbaGrade } from './identity';
import { gradeFromScore } from './evaluation';

export type PublicStatLine = {
  player_id: string;
  full_name: string;
  team: string;
  position: string;
  age?: number;
  games?: number;
  minutesPerGame?: number;
  pointsPerGame?: number;
  reboundsPerGame?: number;
  assistsPerGame?: number;
  stealsPerGame?: number;
  blocksPerGame?: number;
  fieldGoalPct?: number;
  threePointPct?: number;
  threePointAttemptsPerGame?: number;
  freeThrowPct?: number;
  freeThrowAttemptsPerGame?: number;
  usagePct?: number;
  assistPct?: number;
  turnoverPct?: number;
  defensiveWinShares?: number;
  winShares?: number;
  draftPick?: number;
};

export type LeagueContext = {
  season: number;
  pace: number;
  leagueThreePointPct: number;
  leagueFreeThrowPct: number;
};

export type AttributeModel = {
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
  steals: number;
  defenseIq: number;
  helpDefense: number;
  speed: number;
  acceleration: number;
  strength: number;
  rebounding: number;
  postOffense: number;
  stamina: number;
  potential: number;
};

export const ATTRIBUTE_KEYS: Array<keyof AttributeModel> = [
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
  'rebounding',
  'postOffense',
  'stamina',
  'potential',
];

export type AttributeUpgradeCategory =
  | 'Finishing'
  | 'Shooting'
  | 'Playmaking'
  | 'Defense'
  | 'Rebounding'
  | 'Athleticism'
  | 'Post'
  | 'Intangibles'
  | 'Development';

export const ATTRIBUTE_UPGRADE_CATEGORIES: Record<AttributeUpgradeCategory, Array<keyof AttributeModel>> = {
  Finishing: ['closeShot', 'dunking'],
  Shooting: ['midRange', 'threePoint', 'freeThrow', 'shotIq'],
  Playmaking: ['passing', 'ballHandle', 'offenseIq'],
  Defense: ['perimeterDefense', 'postDefense', 'blocking', 'steals', 'defenseIq', 'helpDefense'],
  Rebounding: ['rebounding'],
  Athleticism: ['speed', 'acceleration', 'strength', 'stamina'],
  Post: ['postOffense'],
  Intangibles: ['clutch'],
  Development: ['potential'],
};

function clamp(value: number, min = 40, max = 99) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function numberFrom(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function position(source: PublicStatLine) {
  return String(source.position || '').toUpperCase();
}

function isGuard(source: PublicStatLine) {
  return ['PG', 'SG', 'G'].some(pos => position(source).includes(pos));
}

function isWing(source: PublicStatLine) {
  return ['SG', 'SF', 'F'].some(pos => position(source).includes(pos));
}

function isBig(source: PublicStatLine) {
  return ['PF', 'C'].some(pos => position(source).includes(pos));
}

function pct(value: unknown, fallback: number) {
  const numeric = numberFrom(value, fallback);
  if (numeric > 1) return numeric / 100;
  return numeric;
}

function draftSignal(source: PublicStatLine) {
  const pick = numberFrom(source.draftPick, 60);
  if (pick <= 1) return 10;
  if (pick <= 5) return 8;
  if (pick <= 14) return 5;
  if (pick <= 30) return 2;
  return 0;
}

function workload(source: PublicStatLine) {
  return clamp(56 + numberFrom(source.minutesPerGame) * 0.78 + numberFrom(source.games) * 0.08, 45, 96);
}

function usage(source: PublicStatLine) {
  return numberFrom(source.usagePct, 18);
}

function roundModel(model: AttributeModel): AttributeModel {
  return ATTRIBUTE_KEYS.reduce((acc, key) => {
    acc[key] = Math.round(clamp(model[key]));
    return acc;
  }, {} as AttributeModel);
}

export function gradeFromAttribute(value: unknown): NbaGrade {
  return gradeFromScore(value);
}

export function skillGradesFromAttributes(attributes: Partial<AttributeModel>): Partial<Record<keyof AttributeModel, NbaGrade>> {
  return ATTRIBUTE_KEYS.reduce<Partial<Record<keyof AttributeModel, NbaGrade>>>((grades, key) => {
    const value = attributes[key];
    if (typeof value === 'number') grades[key] = gradeFromAttribute(value);
    return grades;
  }, {});
}

export function validateSkillGrades(
  attributes: Partial<AttributeModel>,
  requested: Partial<Record<keyof AttributeModel, NbaGrade>>,
) {
  const allowed = skillGradesFromAttributes(attributes);
  return Object.entries(requested).flatMap(([key, requestedGrade]) => {
    const typedKey = key as keyof AttributeModel;
    const actualGrade = allowed[typedKey];
    if (!requestedGrade || !actualGrade || requestedGrade === actualGrade) return [];
    const requestedRank = gradeRank(requestedGrade);
    const actualRank = gradeRank(actualGrade);
    if (requestedRank <= actualRank) return [];
    return [`${key} requested ${requestedGrade} but hidden value ${Math.round(numberFrom(attributes[typedKey]))} only allows ${actualGrade}`];
  });
}

const GRADE_RANKS: NbaGrade[] = ['F', 'D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+', 'S'];

function gradeRank(grade: NbaGrade) {
  return GRADE_RANKS.indexOf(grade);
}

export function buildAttributeModel({
  source,
  leagueContext,
}: {
  source: PublicStatLine;
  leagueContext: LeagueContext;
}): AttributeModel {
  const ppg = numberFrom(source.pointsPerGame);
  const rpg = numberFrom(source.reboundsPerGame);
  const apg = numberFrom(source.assistsPerGame);
  const spg = numberFrom(source.stealsPerGame);
  const bpg = numberFrom(source.blocksPerGame);
  const mpg = numberFrom(source.minutesPerGame);
  const games = numberFrom(source.games);
  const fg = pct(source.fieldGoalPct, 0.45);
  const threePct = pct(source.threePointPct, leagueContext.leagueThreePointPct);
  const threeAttempts = numberFrom(source.threePointAttemptsPerGame);
  const ft = pct(source.freeThrowPct, leagueContext.leagueFreeThrowPct);
  const fta = numberFrom(source.freeThrowAttemptsPerGame);
  const astPct = numberFrom(source.assistPct, apg * 6);
  const tovPct = numberFrom(source.turnoverPct, 13);
  const dws = numberFrom(source.defensiveWinShares);
  const wins = numberFrom(source.winShares);
  const age = numberFrom(source.age, 25);
  const work = workload(source);
  const paceFactor = clamp(numberFrom(leagueContext.pace, 100) / 100, 0.9, 1.1);
  const big = isBig(source);
  const guard = isGuard(source);
  const wing = isWing(source);
  const scoringVolume = ppg / paceFactor;
  const availability = clamp(60 + games * 0.35 + mpg * 0.15, 45, 96);

  return roundModel({
    closeShot: 58 + scoringVolume * 0.85 + fg * 28 + fta * 1.2 + (big ? 6 : 0),
    midRange: 56 + scoringVolume * 0.65 + ft * 18 + usage(source) * 0.45 + (guard || wing ? 3 : 0),
    threePoint: 54 + (threePct - leagueContext.leagueThreePointPct) * 135 + threeAttempts * 2.7 + ft * 10 + scoringVolume * 0.22,
    freeThrow: 44 + ft * 58 + fta * 0.6,
    dunking: 52 + fta * 2.4 + fg * 20 + (big ? 8 : wing ? 4 : 0) + Math.max(0, 28 - age) * 0.6,
    shotIq: 58 + scoringVolume * 0.45 + fg * 16 + ft * 12 + Math.max(0, 15 - tovPct) * 0.7 + wins * 0.7,
    passing: 52 + apg * 3.4 + astPct * 0.65 - Math.max(0, tovPct - 12) * 0.6 + (guard ? 5 : 0),
    ballHandle: 56 + apg * 1.6 + usage(source) * 0.75 + (guard ? 7 : wing ? 4 : -3) - Math.max(0, tovPct - 14) * 0.7,
    offenseIq: 58 + astPct * 0.28 + scoringVolume * 0.42 + wins * 1.1 + Math.max(0, 14 - tovPct) * 0.8 + mpg * 0.35,
    clutch: 58 + scoringVolume * 0.55 + usage(source) * 0.55 + wins * 1.1 + Math.max(0, mpg - 30) * 0.7,
    perimeterDefense: 56 + spg * 8 + dws * 4.2 + mpg * 0.45 + (guard || wing ? 5 : -4),
    postDefense: 54 + bpg * 5.5 + rpg * 1.4 + dws * 4 + (big ? 8 : 0),
    blocking: 50 + bpg * 13 + dws * 2.7 + (big ? 8 : wing ? 3 : 0),
    steals: 54 + spg * 12 + dws * 2.4 + (guard || wing ? 4 : 0),
    defenseIq: 56 + dws * 5 + spg * 3.4 + bpg * 2.5 + mpg * 0.45 + wins * 0.5,
    helpDefense: 56 + dws * 4.6 + rpg * 0.9 + bpg * 3.8 + mpg * 0.35,
    speed: 62 + (guard ? 10 : wing ? 6 : 0) - Math.max(0, age - 29) * 1.1 + Math.max(0, 30 - mpg) * 0.1,
    acceleration: 62 + (guard ? 10 : wing ? 6 : 0) - Math.max(0, age - 29) * 1.15 + usage(source) * 0.15,
    strength: 56 + (big ? 13 : wing ? 6 : 0) + rpg * 1.1 + Math.max(0, age - 22) * 0.35,
    rebounding: 52 + rpg * 3.2 + (big ? 9 : wing ? 3 : 0) + mpg * 0.25,
    postOffense: 50 + (big ? 9 : 0) + fg * 21 + rpg * 0.8 + fta * 1.1 + scoringVolume * 0.35,
    stamina: availability * 0.72 + work * 0.28,
    potential: 58 + Math.max(0, 27 - age) * 2.2 + draftSignal(source) + Math.max(0, scoringVolume - 12) * 0.45 + astPct * 0.08 + wins * 0.35,
  });
}
