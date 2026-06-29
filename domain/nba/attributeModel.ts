import type { NbaGrade } from './identity';
import { gradeFromNumeric } from './gradeScale';

export type PublicStatLine = {
  player_id: string;
  full_name: string;
  team: string;
  position: string;
  age?: number;
  birthDate?: string;
  birth_date?: string;
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
  offensiveReboundPct?: number;
  defensiveReboundPct?: number;
  trueShootingPct?: number;
  effectiveFieldGoalPct?: number;
  rimAttemptRate?: number;
  dunkRate?: number;
  midRangeAttemptRate?: number;
  threePointAttemptRate?: number;
  catchAndShootRate?: number;
  pullUpRate?: number;
  driveRate?: number;
  transitionRate?: number;
  postTouchRate?: number;
  playoffMinutesPerGame?: number;
  awardWeight?: number;
  scoutingTags?: string[];
};

export type LeagueContext = {
  season: number;
  leagueDate?: string | Date | null;
  pace: number;
  leagueThreePointPct: number;
  leagueFreeThrowPct: number;
};

export type AttributeModel = {
  closeShot: number;
  drivingLayup: number;
  drivingDunk: number;
  standingDunk: number;
  drawFoul: number;
  hands: number;
  midRange: number;
  threePoint: number;
  freeThrow: number;
  dunking: number;
  shotIq: number;
  shotConsistency: number;
  passing: number;
  passIq: number;
  passVision: number;
  ballHandle: number;
  speedWithBall: number;
  offenseIq: number;
  clutch: number;
  perimeterDefense: number;
  lateralQuickness: number;
  postDefense: number;
  blocking: number;
  steals: number;
  defenseIq: number;
  helpDefense: number;
  speed: number;
  acceleration: number;
  vertical: number;
  agility: number;
  strength: number;
  rebounding: number;
  offensiveRebound: number;
  defensiveRebound: number;
  postOffense: number;
  stamina: number;
  hustle: number;
  durability: number;
  potential: number;
};

export const ATTRIBUTE_KEYS: Array<keyof AttributeModel> = [
  'closeShot',
  'drivingLayup',
  'drivingDunk',
  'standingDunk',
  'drawFoul',
  'hands',
  'midRange',
  'threePoint',
  'freeThrow',
  'dunking',
  'shotIq',
  'shotConsistency',
  'passing',
  'passIq',
  'passVision',
  'ballHandle',
  'speedWithBall',
  'offenseIq',
  'clutch',
  'perimeterDefense',
  'lateralQuickness',
  'postDefense',
  'blocking',
  'steals',
  'defenseIq',
  'helpDefense',
  'speed',
  'acceleration',
  'vertical',
  'agility',
  'strength',
  'rebounding',
  'offensiveRebound',
  'defensiveRebound',
  'postOffense',
  'stamina',
  'hustle',
  'durability',
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
  Finishing: ['closeShot', 'drivingLayup', 'drivingDunk', 'standingDunk', 'drawFoul', 'hands', 'dunking'],
  Shooting: ['midRange', 'threePoint', 'freeThrow', 'shotIq', 'shotConsistency'],
  Playmaking: ['passing', 'passIq', 'passVision', 'ballHandle', 'speedWithBall', 'offenseIq'],
  Defense: ['perimeterDefense', 'lateralQuickness', 'postDefense', 'blocking', 'steals', 'defenseIq', 'helpDefense'],
  Rebounding: ['rebounding', 'offensiveRebound', 'defensiveRebound'],
  Athleticism: ['speed', 'acceleration', 'vertical', 'agility', 'strength', 'stamina', 'hustle', 'durability'],
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

function rate(value: unknown, fallback = 0) {
  const numeric = pct(value, fallback);
  return clamp(numeric, 0, 1);
}

function hasTag(source: PublicStatLine, tag: string) {
  return (source.scoutingTags || []).some(value => String(value).toLowerCase() === tag.toLowerCase());
}

function tagBonus(source: PublicStatLine, tag: string, bonus: number) {
  return hasTag(source, tag) ? bonus : 0;
}

function roundModel(model: AttributeModel): AttributeModel {
  return ATTRIBUTE_KEYS.reduce((acc, key) => {
    acc[key] = Math.round(clamp(model[key]));
    return acc;
  }, {} as AttributeModel);
}

export function gradeFromAttribute(value: unknown): NbaGrade {
  return gradeFromNumeric(value);
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
  const ts = pct(source.trueShootingPct, fg + 0.08);
  const efg = pct(source.effectiveFieldGoalPct, fg);
  const threePct = pct(source.threePointPct, leagueContext.leagueThreePointPct);
  const threeAttempts = numberFrom(source.threePointAttemptsPerGame);
  const ft = pct(source.freeThrowPct, leagueContext.leagueFreeThrowPct);
  const fta = numberFrom(source.freeThrowAttemptsPerGame);
  const astPct = numberFrom(source.assistPct, apg * 6);
  const tovPct = numberFrom(source.turnoverPct, 13);
  const dws = numberFrom(source.defensiveWinShares);
  const wins = numberFrom(source.winShares);
  const age = numberFrom(source.age, 25);
  const big = isBig(source);
  const guard = isGuard(source);
  const wing = isWing(source);
  const rimRate = rate(source.rimAttemptRate, big ? 0.32 : guard ? 0.28 : 0.24);
  const dunkRate = rate(source.dunkRate, big ? 0.1 : wing ? 0.07 : 0.03);
  const driveRate = rate(source.driveRate, guard ? 0.28 : wing ? 0.22 : 0.12);
  const transitionRate = rate(source.transitionRate, guard || wing ? 0.16 : 0.09);
  const orebPct = numberFrom(source.offensiveReboundPct, big ? 8 : wing ? 4 : 2);
  const drebPct = numberFrom(source.defensiveReboundPct, big ? 18 : wing ? 12 : 8);
  const awardWeight = numberFrom(source.awardWeight);
  const work = workload(source);
  const paceFactor = clamp(numberFrom(leagueContext.pace, 100) / 100, 0.9, 1.1);
  const scoringVolume = ppg / paceFactor;
  const efficiencySignal = (ts - 0.54) * 90 + (efg - 0.5) * 70;
  const availability = clamp(60 + games * 0.35 + mpg * 0.15, 45, 96);
  const burstBonus = tagBonus(source, 'elite_burst', 8);
  const rimPressureBonus = tagBonus(source, 'elite_rim_pressure', 8);
  const highUsageBonus = tagBonus(source, 'high_usage_creator', 4);
  const mvpBonus = tagBonus(source, 'mvp', 5);
  const allStarBonus = tagBonus(source, 'all_star', 3);
  const floorGeneralBonus = tagBonus(source, 'floor_general', 7);
  const elitePasserBonus = tagBonus(source, 'elite_passer', 6);
  const eliteShooterBonus = tagBonus(source, 'elite_shooter', 7);
  const eliteMidRangeBonus = tagBonus(source, 'elite_midrange', 6) + tagBonus(source, 'midrange_big', 4);
  const defensiveWingBonus = tagBonus(source, 'defensive_wing_assignment', 7);
  const pointAttackDefenseBonus = tagBonus(source, 'point_of_attack_defender', 5);
  const defensiveAnchorBonus = tagBonus(source, 'defensive_anchor', 8);
  const rimProtectorBonus = tagBonus(source, 'rim_protector', 7);
  const rebounderBonus = tagBonus(source, 'elite_rebounder', 7);
  const postScorerBonus = tagBonus(source, 'post_scorer', 7);
  const connectorBigBonus = tagBonus(source, 'connector_big', 4);
  const highMotorBonus = tagBonus(source, 'high_motor', 4);
  const killerInstinctBonus = tagBonus(source, 'killer_instinct', 4);

  return roundModel({
    closeShot: 58 + scoringVolume * 0.85 + fg * 22 + ts * 8 + fta * 1.2 + (big ? 6 : 0),
    drivingLayup: 58 + scoringVolume * 0.65 + fg * 15 + ts * 8 + fta * 1.4 + driveRate * 30 + rimRate * 24 + (guard || wing ? 4 : 0) + rimPressureBonus,
    drivingDunk: 48 + dunkRate * 125 + rimRate * 25 + fta * 1.1 + (big ? 8 : wing ? 5 : 0) + burstBonus * 0.5,
    standingDunk: 45 + dunkRate * 90 + (big ? 18 : wing ? 6 : -5) + rpg * 0.7,
    drawFoul: 50 + fta * 4.8 + rimRate * 22 + driveRate * 18 + usage(source) * 0.25,
    hands: 58 + fg * 22 + rpg * 1.4 + Math.max(0, 14 - tovPct) * 0.9 + (big ? 4 : 0),
    midRange: 56 + scoringVolume * 0.65 + ft * 15 + efg * 9 + usage(source) * 0.45 + (guard || wing ? 3 : 0) + eliteMidRangeBonus,
    threePoint: 54 + (threePct - leagueContext.leagueThreePointPct) * 125 + threeAttempts * 2.7 + ft * 8 + efg * 12 + scoringVolume * 0.22 + eliteShooterBonus,
    freeThrow: 44 + ft * 58 + fta * 0.6,
    dunking: 52 + fta * 2.4 + fg * 20 + (big ? 8 : wing ? 4 : 0) + Math.max(0, 28 - age) * 0.6,
    shotIq: 58 + scoringVolume * 0.45 + fg * 10 + ts * 12 + efg * 10 + Math.max(0, 15 - tovPct) * 0.7 + wins * 0.7 + efficiencySignal * 0.08 + eliteShooterBonus * 0.35 + eliteMidRangeBonus * 0.35,
    shotConsistency: 55 + fg * 10 + ts * 13 + efg * 11 + ft * 8 + wins * 0.9 + Math.max(0, mpg - 20) * 0.5 + Math.max(0, scoringVolume - 10) * 0.25 + efficiencySignal * 0.08 + eliteShooterBonus * 0.35 + eliteMidRangeBonus * 0.3,
    passing: 52 + apg * 3.4 + astPct * 0.65 - Math.max(0, tovPct - 12) * 0.6 + (guard ? 5 : 0) + floorGeneralBonus + elitePasserBonus + connectorBigBonus,
    passIq: 54 + apg * 2.8 + astPct * 0.55 + Math.max(0, 15 - tovPct) * 0.9 + wins * 0.6 + (guard ? 5 : 0) + floorGeneralBonus + elitePasserBonus + connectorBigBonus,
    passVision: 52 + apg * 3.1 + astPct * 0.7 + usage(source) * 0.25 + (guard ? 6 : wing ? 3 : 0) + floorGeneralBonus + elitePasserBonus + connectorBigBonus,
    ballHandle: 56 + apg * 1.6 + usage(source) * 0.75 + (guard ? 7 : wing ? 4 : -3) - Math.max(0, tovPct - 14) * 0.7 + floorGeneralBonus * 0.45 + burstBonus * 0.25,
    speedWithBall: 58 + apg * 0.9 + usage(source) * 0.65 + driveRate * 32 + transitionRate * 18 + (guard ? 7 : wing ? 3 : -5) + burstBonus,
    offenseIq: 58 + astPct * 0.28 + scoringVolume * 0.42 + wins * 1.1 + Math.max(0, 14 - tovPct) * 0.8 + mpg * 0.35 + efficiencySignal * 0.06 + floorGeneralBonus * 0.5 + connectorBigBonus + allStarBonus,
    clutch: 58 + scoringVolume * 0.55 + usage(source) * 0.55 + wins * 1.1 + Math.max(0, mpg - 30) * 0.7 + killerInstinctBonus + mvpBonus * 0.4,
    perimeterDefense: 56 + spg * 8 + dws * 4.2 + mpg * 0.45 + (guard || wing ? 5 : -4) + defensiveWingBonus + pointAttackDefenseBonus,
    lateralQuickness: 58 + spg * 4.5 + dws * 2.7 + (guard ? 8 : wing ? 5 : -3) - Math.max(0, age - 31) * 0.9 + burstBonus * 0.35 + defensiveWingBonus * 0.5 + pointAttackDefenseBonus,
    postDefense: 54 + bpg * 5.5 + rpg * 1.4 + dws * 4 + (big ? 8 : 0) + defensiveAnchorBonus + rimProtectorBonus * 0.45,
    blocking: 50 + bpg * 13 + dws * 2.7 + (big ? 8 : wing ? 3 : 0) + rimProtectorBonus + defensiveAnchorBonus * 0.4,
    steals: 54 + spg * 12 + dws * 2.4 + (guard || wing ? 4 : 0) + defensiveWingBonus * 0.35 + pointAttackDefenseBonus,
    defenseIq: 56 + dws * 5 + spg * 3.4 + bpg * 2.5 + mpg * 0.45 + wins * 0.5 + defensiveAnchorBonus + defensiveWingBonus + pointAttackDefenseBonus * 0.4,
    helpDefense: 56 + dws * 4.6 + rpg * 0.9 + bpg * 3.8 + mpg * 0.35 + defensiveAnchorBonus + defensiveWingBonus * 0.6 + connectorBigBonus,
    speed: 62 + (guard ? 10 : wing ? 6 : 0) - Math.max(0, age - 29) * 1.1 + Math.max(0, 30 - mpg) * 0.1,
    acceleration: 62 + (guard ? 10 : wing ? 6 : 0) - Math.max(0, age - 29) * 1.15 + usage(source) * 0.15,
    vertical: 55 + dunkRate * 90 + rimRate * 12 + (guard || wing ? 6 : big ? 4 : 0) - Math.max(0, age - 29) * 0.7 + burstBonus * 0.45,
    agility: 58 + (guard ? 9 : wing ? 6 : 0) + driveRate * 18 + transitionRate * 12 - Math.max(0, age - 30) * 0.9 + burstBonus * 0.45,
    strength: 56 + (big ? 13 : wing ? 6 : 0) + rpg * 1.1 + Math.max(0, age - 22) * 0.35 + rebounderBonus * 0.25 + postScorerBonus * 0.25,
    rebounding: 52 + rpg * 3.2 + (big ? 9 : wing ? 3 : 0) + mpg * 0.25 + rebounderBonus,
    offensiveRebound: 48 + rpg * 1.3 + orebPct * 1.6 + (big ? 8 : wing ? 3 : -2) + rebounderBonus * 0.65,
    defensiveRebound: 50 + rpg * 2 + drebPct * 1.2 + (big ? 7 : wing ? 3 : -2) + rebounderBonus,
    postOffense: 50 + (big ? 9 : 0) + fg * 21 + rpg * 0.8 + fta * 1.1 + scoringVolume * 0.35 + postScorerBonus + eliteMidRangeBonus * 0.25,
    stamina: availability * 0.72 + work * 0.28,
    hustle: 56 + mpg * 0.45 + dws * 1.8 + rpg * 0.8 + spg * 2.4 + bpg * 1.5 + highMotorBonus,
    durability: availability,
    potential: 58 + Math.max(0, 27 - age) * 2.2 + draftSignal(source) + Math.max(0, scoringVolume - 12) * 0.45 + astPct * 0.08 + wins * 0.35 + awardWeight * 1.2 + highUsageBonus + mvpBonus + allStarBonus,
  });
}
