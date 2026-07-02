import type { AttributeModel, PublicStatLine } from './attributeModel';
import { ATTRIBUTE_KEYS, passingProductionCap } from './attributeModel';

export type EraAdjustmentContext = {
  season: number;
  era: string;
  pace: number;
  leaguePace: number;
  leagueThreePointPct: number;
  positionMinutesBaseline: number;
};

export type EraAdjustedProfileResult = {
  era_adjusted_profiles: AttributeModel;
  era_notes: string[];
};

function numberFrom(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value: number, min = 40, max = 99) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function pct(value: unknown, fallback: number) {
  const numeric = numberFrom(value, fallback);
  return numeric > 1 ? numeric / 100 : numeric;
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

function hasTag(source: PublicStatLine, tag: string) {
  return (source.scoutingTags || []).some(value => String(value).toLowerCase() === tag.toLowerCase());
}

function hasIndividualDefenseProof(source: PublicStatLine) {
  return hasTag(source, 'defensive_wing_assignment')
    || hasTag(source, 'point_of_attack_defender')
    || hasTag(source, 'all_defense')
    || hasTag(source, 'defensive_anchor')
    || hasTag(source, 'rim_protector');
}

function add(profile: AttributeModel, key: keyof AttributeModel, value: number) {
  profile[key] = clamp(profile[key] + value);
}

function rounded(profile: AttributeModel): AttributeModel {
  return ATTRIBUTE_KEYS.reduce((acc, key) => {
    acc[key] = Math.round(clamp(profile[key]));
    return acc;
  }, {} as AttributeModel);
}

export function applyEraAdjustment({
  source,
  attribute_model,
  context,
}: {
  source: PublicStatLine;
  attribute_model: AttributeModel;
  context: EraAdjustmentContext;
}): EraAdjustedProfileResult {
  const profile = { ...attribute_model };
  const notes: string[] = [];
  const minutes = numberFrom(source.minutesPerGame);
  const baselineMinutes = Math.max(1, numberFrom(context.positionMinutesBaseline, 30));
  const workloadBonus = clamp((minutes - baselineMinutes) * 0.75, -4, 7);
  const dws = numberFrom(source.defensiveWinShares);
  const stocks = numberFrom(source.stealsPerGame) + numberFrom(source.blocksPerGame);
  const wins = numberFrom(source.winShares);
  const ppg = numberFrom(source.pointsPerGame);
  const apg = numberFrom(source.assistsPerGame);
  const rpg = numberFrom(source.reboundsPerGame);
  const threePct = pct(source.threePointPct, context.leagueThreePointPct);
  const threeAttempts = numberFrom(source.threePointAttemptsPerGame);
  const leagueThree = pct(context.leagueThreePointPct, 0.36);
  const paceRatio = numberFrom(context.leaguePace || context.pace, 100) / 100;

  if (minutes >= baselineMinutes + 4 && dws >= 3 && hasIndividualDefenseProof(source) && (isWing(source) || isGuard(source))) {
    add(profile, 'perimeterDefense', 3 + workloadBonus * 0.35);
    add(profile, 'defenseIq', 3 + dws * 0.35);
    add(profile, 'helpDefense', 2 + stocks);
    add(profile, 'stamina', 2 + workloadBonus * 0.4);
    notes.push('protected heavy-minute defensive role');
  }

  if (threePct >= leagueThree + 0.035 && threeAttempts >= 4.5) {
    add(profile, 'threePoint', 2 + threeAttempts * 0.25);
    add(profile, 'shotIq', 1.5);
    notes.push('boosted proven shooting role');
  } else if (threePct >= leagueThree + 0.035 && threeAttempts < 2) {
    add(profile, 'threePoint', -2);
    notes.push('limited low-volume shooting proof');
  }

  if (ppg >= 20 && minutes >= baselineMinutes) {
    add(profile, 'closeShot', 1.5);
    add(profile, 'midRange', 1.5);
    add(profile, 'offenseIq', 1 + wins * 0.12);
    notes.push('recognized primary scoring workload');
  }

  if (apg >= 6 && isGuard(source)) {
    add(profile, 'passing', 2 + apg * 0.18);
    add(profile, 'ballHandle', 1.5);
    add(profile, 'offenseIq', 1.5);
    notes.push('recognized creator workload');
  }

  if (isBig(source) && (rpg >= 9 || numberFrom(source.blocksPerGame) >= 1.5)) {
    add(profile, 'rebounding', 2 + rpg * 0.15);
    add(profile, 'postDefense', 2 + numberFrom(source.blocksPerGame) * 0.55);
    add(profile, 'blocking', 1.5 + numberFrom(source.blocksPerGame) * 0.75);
    notes.push('recognized interior role');
  }

  if (paceRatio < 0.96 && minutes >= baselineMinutes) {
    add(profile, 'stamina', 1.5);
    add(profile, 'clutch', 1);
    notes.push('adjusted for slower era workload');
  }

  if (wins >= 8 && minutes >= baselineMinutes) {
    add(profile, 'offenseIq', 1.5);
    add(profile, 'defenseIq', 1.5);
    notes.push('recognized winning rotation impact');
  }

  const finalPassingCap = passingProductionCap(source);
  if (profile.passing > finalPassingCap) {
    profile.passing = finalPassingCap;
    notes.push('capped pure passing to assist-production proof');
  }

  if ((isGuard(source) || isWing(source))
    && !hasIndividualDefenseProof(source)
    && numberFrom(source.stealsPerGame) < 1.4
    && numberFrom(source.blocksPerGame) < 0.9) {
    const preserveVeteranIq = hasTag(source, 'generational') || hasTag(source, 'legacy_star') || hasTag(source, 'aging_resistant');
    profile.perimeterDefense = Math.min(profile.perimeterDefense, 74.4);
    profile.lateralQuickness = Math.min(profile.lateralQuickness, 74.4);
    profile.defenseIq = Math.min(profile.defenseIq, preserveVeteranIq ? 88.4 : 74.4);
    profile.helpDefense = Math.min(profile.helpDefense, preserveVeteranIq ? 88.4 : 74.4);
    notes.push('capped guard defense to individual-stopper proof');
  }

  if (!hasTag(source, 'elite_shooter') && profile.threePoint > 94.4) {
    profile.threePoint = 94.4;
    notes.push('capped shooting below elite tier without elite-shooter proof');
  }

  return {
    era_adjusted_profiles: rounded(profile),
    era_notes: notes.length > 0 ? notes : ['no major era adjustment'],
  };
}
