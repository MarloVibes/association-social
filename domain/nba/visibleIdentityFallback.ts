import type { NbaGrade, VisibleNbaIdentity } from './identity';
import { buildVisibleIdentity, normalizeNbaTierLabel } from './identity';
import { buildScoutingGrades } from './scoutingGrades';

export function validVisibleNbaIdentity(value: any): VisibleNbaIdentity | null {
  if (!value || typeof value !== 'object' || value.overall !== undefined) return null;
  if (!value.grades || typeof value.grades !== 'object') return null;
  if (!value.tier || !Array.isArray(value.archetypes)) return null;
  const normalizedTier = normalizeNbaTierLabel(value.tier);
  if (!normalizedTier) return null;
  return { ...value, tier: normalizedTier } as VisibleNbaIdentity;
}

export function visibleNbaIdentityFromSources(player: any, profile: any): VisibleNbaIdentity | null {
  const identities = [profile?.visibleIdentity, player?.visibleIdentity, profile?.identity, player?.identity];
  for (const identity of identities) {
    const visible = validVisibleNbaIdentity(identity);
    if (visible) return visible;
  }
  return null;
}

function gradeValue(grade: NbaGrade | undefined): number {
  if (grade === 'S') return 99;
  if (grade === 'A+') return 96;
  if (grade === 'A') return 93;
  if (grade === 'A-') return 90;
  if (grade === 'B+') return 86;
  if (grade === 'B') return 82;
  if (grade === 'B-') return 77;
  if (grade === 'C+') return 72;
  if (grade === 'C') return 67;
  if (grade === 'C-') return 62;
  if (grade === 'D+') return 58;
  if (grade === 'D') return 55;
  if (grade === 'D-') return 51;
  return 45;
}

function averageGradeValue(...grades: (NbaGrade | undefined)[]) {
  const values = grades.filter(Boolean).map(grade => gradeValue(grade));
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function firstNumber(...values: any[]) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return 0;
}

export function buildFallbackVisibleNbaIdentity(player: any, profile: any): VisibleNbaIdentity {
  const source = {
    ...(profile?.source || {}),
    ...(profile?.source_stat_line || {}),
    ...(profile?.hidden || {}),
    ...(profile?.attribute_model || {}),
    ...(profile?.numericAttributes || {}),
    ...(profile?.attributes || {}),
    ...(profile?.ratings || {}),
    ...(profile || {}),
    ...(player || {}),
  };
  const grades = buildScoutingGrades(player || {}, profile || null);

  return buildVisibleIdentity({
    ...source,
    position: source.position,
    age: firstNumber(source.age),
    seasonsPlayed: firstNumber(source.seasonsPlayed, source.experience, source.yearsPro),
    shooting: firstNumber(source.shooting, averageGradeValue(grades.threePoint, grades.midRange, grades.closeShot)),
    threePoint: firstNumber(source.threePoint, source.threePointShot, averageGradeValue(grades.threePoint)),
    defense: firstNumber(source.defense, averageGradeValue(grades.perimeterDefense, grades.postDefense, grades.defenseIq)),
    perimeterDefense: firstNumber(source.perimeterDefense, averageGradeValue(grades.perimeterDefense)),
    blocking: firstNumber(source.blocking, source.block, averageGradeValue(grades.blocking)),
    steals: firstNumber(source.steals, source.steal, averageGradeValue(grades.steals)),
    rebounding: firstNumber(source.rebounding, averageGradeValue(grades.rebounding)),
    playmaking: firstNumber(source.playmaking, averageGradeValue(grades.passing, grades.ballHandle, grades.offenseIq)),
    passing: firstNumber(source.passing, averageGradeValue(grades.passing)),
    ballHandle: firstNumber(source.ballHandle, source.handles, averageGradeValue(grades.ballHandle)),
    athleticism: firstNumber(source.athleticism, averageGradeValue(grades.dunking, grades.speed, grades.acceleration)),
    basketballIq: firstNumber(source.basketballIq, averageGradeValue(grades.offenseIq, grades.defenseIq)),
    offenseIq: firstNumber(source.offenseIq, averageGradeValue(grades.offenseIq)),
    defenseIq: firstNumber(source.defenseIq, averageGradeValue(grades.defenseIq)),
    consistency: firstNumber(source.consistency),
    chemistry: firstNumber(source.chemistry),
    potential: firstNumber(source.potential, source.development_curve?.potential, averageGradeValue(grades.potential)),
    pointsPerGame: firstNumber(source.pointsPerGame, source.ppg, source.points),
    reboundsPerGame: firstNumber(source.reboundsPerGame, source.rpg, source.rebounds),
    assistsPerGame: firstNumber(source.assistsPerGame, source.apg, source.assists),
    minutesPerGame: firstNumber(source.minutesPerGame, source.mpg, source.minutes),
    winShares: firstNumber(source.winShares, source.ws),
    usagePct: firstNumber(source.usagePct, source.usage, source.usage_pct),
    accolades: source.accolades || {},
  });
}
