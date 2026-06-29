import { gradeFromNumeric } from './gradeScale';
import type { NbaGrade } from './identity';

export type DevelopmentPhase =
  | 'High Upside'
  | 'Breakout Candidate'
  | 'Rising Star'
  | 'Prime Star'
  | 'Near Peak'
  | 'Stable Veteran'
  | 'Legacy Star'
  | 'Declining'
  | 'Sharp Decline Risk';

export type DevelopmentCurveInput = {
  age?: number;
  currentImpactRating?: number;
  awardWeight?: number;
  draftPick?: number;
  hiddenDevelopmentRating?: number;
  injuryRisk?: number;
  minutesOpportunity?: number;
  performanceTrend?: number;
  scoutingTags?: string[];
};

export type DevelopmentCurve = {
  potentialRating: number;
  potentialGrade: NbaGrade;
  phase: DevelopmentPhase;
  peakStartAge: number;
  peakEndAge: number;
  agingResistance: number;
  growthScore: number;
  declineRisk: number;
};

function numberFrom(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function hasTag(input: DevelopmentCurveInput, tag: string): boolean {
  return (input.scoutingTags || []).some(value => String(value).toLowerCase() === tag.toLowerCase());
}

function draftBonus(pick: number): number {
  if (pick <= 1) return 8;
  if (pick <= 5) return 6;
  if (pick <= 14) return 4;
  if (pick <= 30) return 2;
  return 0;
}

function agingResistance(input: DevelopmentCurveInput): number {
  let value = 0;
  if (hasTag(input, 'generational')) value += 2;
  if (hasTag(input, 'aging_resistant')) value += 2;
  if (hasTag(input, 'legacy_star')) value += 1;
  if (numberFrom(input.awardWeight) >= 8) value += 1;
  if (numberFrom(input.hiddenDevelopmentRating, 60) >= 90) value += 1;
  return Math.round(clamp(value, 0, 6));
}

function phaseFor({
  age,
  currentImpact,
  growthScore,
  declineRisk,
  resistance,
  input,
}: {
  age: number;
  currentImpact: number;
  growthScore: number;
  declineRisk: number;
  resistance: number;
  input: DevelopmentCurveInput;
}): DevelopmentPhase {
  if (hasTag(input, 'legacy_star') || (age >= 36 && currentImpact >= 84 && resistance >= 4)) return 'Legacy Star';
  if (declineRisk >= 72 && currentImpact < 78) return 'Sharp Decline Risk';
  if (age >= 34 && declineRisk >= 55) return 'Declining';
  if (age <= 23 && currentImpact >= 88) return 'Rising Star';
  if (age <= 23 && growthScore >= 82) return 'High Upside';
  if (age <= 26 && growthScore >= 76) return 'Breakout Candidate';
  if (age <= 30 && currentImpact >= 86) return 'Prime Star';
  if (age <= 32 && growthScore < 65) return 'Near Peak';
  return 'Stable Veteran';
}

export function buildDevelopmentCurve(input: DevelopmentCurveInput): DevelopmentCurve {
  const age = numberFrom(input.age, 25);
  const currentImpact = numberFrom(input.currentImpactRating, 70);
  const dev = numberFrom(input.hiddenDevelopmentRating, 62);
  const injuryRisk = numberFrom(input.injuryRisk, 20);
  const minutes = numberFrom(input.minutesOpportunity, 60);
  const trend = numberFrom(input.performanceTrend);
  const awards = numberFrom(input.awardWeight);
  const pick = numberFrom(input.draftPick, 60);
  const resistance = agingResistance(input);
  const youthBoost = clamp(28 - age, 0, 9) * 2.1;
  const oldAgePenalty = Math.max(0, age - 31) * (2.7 - resistance * 0.28);
  const growthScore = clamp(
    44
    + dev * 0.24
    + currentImpact * 0.22
    + youthBoost
    + draftBonus(pick)
    + minutes * 0.08
    + trend * 0.8
    + awards * 0.65
    - injuryRisk * 0.16
    + (hasTag(input, 'mvp') ? 4 : 0)
    + (hasTag(input, 'high_usage_creator') ? 2 : 0),
  );
  const declineRisk = clamp(20 + Math.max(0, age - 30) * 6 + injuryRisk * 0.85 - resistance * 7 - trend * 1.5);
  const rawPotential = age >= 35
    ? 60 + resistance * 2 + currentImpact * 0.08 - injuryRisk * 0.05 - Math.max(0, age - 38) * 0.5
    : currentImpact * 0.38
      + growthScore * 0.58
      - oldAgePenalty
      + resistance * 1.2
      + (hasTag(input, 'mvp') ? 3 : 0);
  const potentialRating = Math.round(clamp(rawPotential, 40, hasTag(input, 's_potential') ? 99 : 98));
  const phase = phaseFor({
    age,
    currentImpact,
    growthScore,
    declineRisk,
    resistance,
    input,
  });

  return {
    potentialRating,
    potentialGrade: gradeFromNumeric(potentialRating),
    phase,
    peakStartAge: age <= 23 ? 25 : age <= 28 ? age + 1 : age,
    peakEndAge: resistance >= 4 ? 36 : resistance >= 2 ? 34 : 32,
    agingResistance: resistance,
    growthScore: Math.round(growthScore),
    declineRisk: Math.round(declineRisk),
  };
}
