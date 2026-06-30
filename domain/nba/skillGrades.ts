import type { AttributeModel } from './attributeModel';
import { gradeFromNumeric } from './gradeScale';
import type { NbaGrade } from './identity';

export type SkillGradeKey =
  | 'finishing'
  | 'midRange'
  | 'threePoint'
  | 'playmaking'
  | 'perimeterDefense'
  | 'interiorDefense'
  | 'athleticism'
  | 'rebounding'
  | 'basketballIq'
  | 'postOffense'
  | 'durability'
  | 'potential';

export type SkillGradeValue = {
  rating: number;
  grade: NbaGrade;
};

export type SkillGrades = Record<SkillGradeKey, SkillGradeValue>;

export type SkillGradeContext = {
  shotVolumeModifier?: number;
};

type AttributeWeights = Partial<Record<keyof AttributeModel | 'shotVolumeModifier', number>>;

function clamp(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function numeric(value: unknown, fallback = 60): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function weightedRating(
  attributes: Partial<AttributeModel>,
  weights: AttributeWeights,
  context: SkillGradeContext = {},
): number {
  let total = 0;
  let weightTotal = 0;

  for (const [key, weight] of Object.entries(weights)) {
    if (!weight || weight <= 0) continue;
    const value = key === 'shotVolumeModifier'
      ? numeric(context.shotVolumeModifier, 60)
      : numeric(attributes[key as keyof AttributeModel], 60);
    total += clamp(value) * weight;
    weightTotal += weight;
  }

  if (weightTotal <= 0) return 60;
  return Math.round((total / weightTotal) * 10) / 10;
}

function skill(
  attributes: Partial<AttributeModel>,
  weights: AttributeWeights,
  context?: SkillGradeContext,
): SkillGradeValue {
  const rating = weightedRating(attributes, weights, context);
  return {
    rating,
    grade: gradeFromNumeric(rating),
  };
}

function threePointSkill(attributes: Partial<AttributeModel>, context: SkillGradeContext): SkillGradeValue {
  const raw = weightedRating(attributes, {
    threePoint: 0.7,
    shotIq: 0.1,
    shotConsistency: 0.1,
    offenseIq: 0.05,
    shotVolumeModifier: 0.05,
  }, context);
  const volume = Number(context.shotVolumeModifier);
  if (Number.isFinite(volume) && volume <= 65) {
    const capped = Math.min(raw, 59.4);
    return {
      rating: Math.round(capped * 10) / 10,
      grade: gradeFromNumeric(capped),
    };
  }
  const support = weightedRating(attributes, {
    shotIq: 0.4,
    shotConsistency: 0.4,
    offenseIq: 0.2,
  }, context);
  const hasVolumeProof = Number.isFinite(Number(context.shotVolumeModifier)) && Number(context.shotVolumeModifier) >= 82;
  const supportCapped = !hasVolumeProof && support < 80 ? Math.min(raw, 84.4) : raw;
  const hasEliteVolumeProof = Number.isFinite(Number(context.shotVolumeModifier)) && Number(context.shotVolumeModifier) >= 95;
  const capped = support < 95 || !hasEliteVolumeProof ? Math.min(supportCapped, 98.4) : supportCapped;

  return {
    rating: Math.round(capped * 10) / 10,
    grade: gradeFromNumeric(capped),
  };
}

export function buildSkillGrades(
  attributes: Partial<AttributeModel>,
  context: SkillGradeContext = {},
): SkillGrades {
  return {
    finishing: skill(attributes, {
      closeShot: 0.16,
      drivingLayup: 0.24,
      drivingDunk: 0.16,
      standingDunk: 0.1,
      drawFoul: 0.18,
      hands: 0.16,
    }, context),
    midRange: skill(attributes, {
      midRange: 0.72,
      shotIq: 0.12,
      shotConsistency: 0.1,
      offenseIq: 0.06,
    }, context),
    threePoint: threePointSkill(attributes, context),
    playmaking: skill(attributes, {
      ballHandle: 0.22,
      speedWithBall: 0.14,
      passing: 0.24,
      passIq: 0.18,
      passVision: 0.16,
      offenseIq: 0.06,
    }, context),
    perimeterDefense: skill(attributes, {
      perimeterDefense: 0.42,
      lateralQuickness: 0.22,
      steals: 0.18,
      defenseIq: 0.18,
    }, context),
    interiorDefense: skill(attributes, {
      postDefense: 0.34,
      blocking: 0.22,
      strength: 0.14,
      defenseIq: 0.18,
      helpDefense: 0.12,
    }, context),
    athleticism: skill(attributes, {
      speed: 0.18,
      acceleration: 0.16,
      vertical: 0.14,
      agility: 0.14,
      strength: 0.12,
      stamina: 0.13,
      hustle: 0.08,
      durability: 0.05,
    }, context),
    rebounding: skill(attributes, {
      rebounding: 0.28,
      offensiveRebound: 0.22,
      defensiveRebound: 0.28,
      vertical: 0.08,
      strength: 0.08,
      hustle: 0.06,
    }, context),
    basketballIq: skill(attributes, {
      offenseIq: 0.28,
      defenseIq: 0.24,
      shotIq: 0.18,
      passIq: 0.18,
      helpDefense: 0.12,
    }, context),
    postOffense: skill(attributes, {
      postOffense: 0.7,
      closeShot: 0.16,
      strength: 0.08,
      offenseIq: 0.06,
    }, context),
    durability: skill(attributes, {
      durability: 0.64,
      stamina: 0.24,
      strength: 0.12,
    }, context),
    potential: skill(attributes, {
      potential: 1,
    }, context),
  };
}
