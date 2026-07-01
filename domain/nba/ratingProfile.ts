import {
  buildAttributeModel,
  skillGradesFromAttributes,
  validateSkillGrades,
  type AttributeModel,
  type LeagueContext,
  type PublicStatLine,
} from './attributeModel';
import type { NbaGrade } from './identity';
import { applyEraAdjustment, type EraAdjustmentContext } from './eraAdjustedProfiles';
import { buildSkillGrades, type SkillGrades } from './skillGrades';
import { buildPlayerTendencies, type PlayerTendencies } from './tendencies';
import { buildDevelopmentCurve, type DevelopmentPhase } from './development';

export type RatingPatch = Partial<Pick<
  PublicStatLine,
  | 'team'
  | 'position'
  | 'age'
  | 'games'
  | 'minutesPerGame'
  | 'pointsPerGame'
  | 'reboundsPerGame'
  | 'assistsPerGame'
  | 'stealsPerGame'
  | 'blocksPerGame'
  | 'fieldGoalPct'
  | 'threePointPct'
  | 'threePointAttemptsPerGame'
  | 'freeThrowPct'
  | 'freeThrowAttemptsPerGame'
  | 'usagePct'
  | 'assistPct'
  | 'turnoverPct'
  | 'defensiveWinShares'
  | 'winShares'
  | 'draftPick'
>> & {
  current_team?: string;
  jersey_number?: string;
  injury_state?: string;
  roster_status?: string;
  scouting_notes?: string;
  skill_grades?: Partial<Record<keyof AttributeModel, NbaGrade>>;
};

export type PlayerRatingProfile = {
  collection: 'player_ratings';
  player_id: string;
  full_name: string;
  season: number;
  team: string;
  position: string;
  age?: number;
  season_age?: number;
  display_age?: number;
  exact_age?: number;
  birth_date?: string;
  jersey_number?: string;
  injury_state?: string;
  roster_status?: string;
  source_snapshot_id: string;
  attribute_model: AttributeModel;
  era_adjusted_profiles: AttributeModel;
  skill_grades: Partial<Record<keyof AttributeModel, NbaGrade>>;
  category_skill_grades: SkillGrades;
  tendencies: PlayerTendencies;
  archetypes: string[];
  traits: string[];
  source_stat_line: PublicStatLine;
  development_curve: {
    potential: number;
    potential_grade: NbaGrade;
    phase: DevelopmentPhase;
    peak_start_age: number;
    peak_end_age: number;
    aging_resistance: number;
    growth_score: number;
    decline_risk: number;
  };
  era_notes: string[];
  validation_warnings: string[];
  model_version: string;
  generated_at_ms: number;
};

function patchedSource(source: PublicStatLine, patch?: RatingPatch): PublicStatLine {
  if (!patch) return source;
  const { current_team, jersey_number: _jersey, injury_state: _injury, roster_status: _status, scouting_notes: _notes, skill_grades: _grades, ...statPatch } = patch;
  return {
    ...source,
    ...statPatch,
    team: current_team || patch.team || source.team,
  };
}

function archetypesFor(model: AttributeModel, source: PublicStatLine) {
  const archetypes: string[] = [];
  if (model.passing >= 88 && model.offenseIq >= 84) archetypes.push('Floor General');
  if (model.perimeterDefense >= 86 && model.offenseIq >= 80) archetypes.push('Two-Way Wing');
  if (model.threePoint >= 89 && model.stamina >= 80) archetypes.push('Movement Shooter');
  if (model.blocking >= 86 && model.rebounding >= 83) archetypes.push('Rim Protector');
  if (model.postOffense >= 84 && model.rebounding >= 82) archetypes.push('Post Scorer');
  if (model.dunking >= 86 && model.speed >= 80) archetypes.push('Slashing Creator');
  if (archetypes.length === 0) archetypes.push(String(source.position || '').includes('C') ? 'Interior Anchor' : 'Balanced Connector');
  return archetypes.slice(0, 3);
}

function traitsFor(model: AttributeModel) {
  const traits: string[] = [];
  if (model.stamina >= 86) traits.push('high motor');
  if (model.threePoint >= 86) traits.push('reliable shooter');
  if (model.defenseIq >= 84) traits.push('defensive communicator');
  if (model.speed >= 84) traits.push('transition threat');
  if (model.freeThrow >= 84 && model.closeShot >= 80) traits.push('foul pressure');
  if (model.offenseIq >= 84 && model.passing >= 84) traits.push('low mistake rate');
  if (model.clutch >= 84) traits.push('late-game poise');
  return traits.length > 0 ? traits.slice(0, 5) : ['steady role fit'];
}

function developmentCurve(model: AttributeModel, source: PublicStatLine) {
  const age = Number(source.age || 25);
  const curve = buildDevelopmentCurve({
    age,
    currentImpactRating: Math.round((model.offenseIq + model.defenseIq + model.stamina + model.potential) / 4),
    awardWeight: source.awardWeight,
    draftPick: source.draftPick,
    hiddenDevelopmentRating: model.potential,
    injuryRisk: Math.max(5, 100 - model.durability),
    minutesOpportunity: model.stamina,
    performanceTrend: Number(source.winShares || 0) >= 8 ? 4 : 0,
    scoutingTags: source.scoutingTags,
  });
  return {
    potential: curve.potentialRating,
    potential_grade: curve.potentialGrade,
    phase: curve.phase,
    peak_start_age: curve.peakStartAge,
    peak_end_age: curve.peakEndAge,
    aging_resistance: curve.agingResistance,
    growth_score: curve.growthScore,
    decline_risk: curve.declineRisk,
  };
}

function shotVolumeModifier(source: PublicStatLine) {
  const attempts = Number(source.threePointAttemptsPerGame || 0);
  if (!Number.isFinite(attempts)) return 60;
  const pct = Number(source.threePointPct || 0);
  const suspiciousSample = pct >= 0.9
    && attempts >= 2
    && !(source.scoutingTags || []).some(tag => String(tag).toLowerCase() === 'verified_shooting_data');
  if (suspiciousSample) return 55;
  return Math.max(50, Math.min(96, 58 + attempts * 5));
}

function parseBirthDate(value: unknown): { year: number; month: number; day: number } | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate(),
    };
  }

  const raw = String(value || '').trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) return { year, month, day };
  }

  const parsed = new Date(`${raw} UTC`);
  if (!Number.isNaN(parsed.getTime())) {
    return {
      year: parsed.getUTCFullYear(),
      month: parsed.getUTCMonth() + 1,
      day: parsed.getUTCDate(),
    };
  }

  return null;
}

function parseLeagueDate(value: unknown): { year: number; month: number; day: number } | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate(),
    };
  }

  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    const fallback = new Date(`${raw} UTC`);
    if (Number.isNaN(fallback.getTime())) return null;
    return {
      year: fallback.getUTCFullYear(),
      month: fallback.getUTCMonth() + 1,
      day: fallback.getUTCDate(),
    };
  }
  return {
    year: parsed.getUTCFullYear(),
    month: parsed.getUTCMonth() + 1,
    day: parsed.getUTCDate(),
  };
}

export function calculatePlayerAgeForDate(
  birthDate: unknown,
  _seasonStartYear: number,
  leagueDate: unknown,
): number | null {
  const birth = parseBirthDate(birthDate);
  const date = parseLeagueDate(leagueDate);
  if (!birth || !date) return null;
  let age = date.year - birth.year;
  const birthdayPassed = date.month > birth.month || (date.month === birth.month && date.day >= birth.day);
  if (!birthdayPassed) age -= 1;
  return age >= 0 && age < 80 ? age : null;
}

function seasonAgeFromSource(source: PublicStatLine, season: number, birthDate: unknown): number | undefined {
  const listedAge = Number(source.age);
  if (Number.isFinite(listedAge) && listedAge > 0) return listedAge;
  const calculated = calculatePlayerAgeForDate(birthDate, season - 1, `${season}-02-01`);
  return calculated ?? undefined;
}

export function playerProfileWithLeagueDateAge(
  profile: PlayerRatingProfile | null | undefined,
  leagueDate: string | Date | null | undefined,
): PlayerRatingProfile | null {
  if (!profile) return null;
  if (!leagueDate || !profile.birth_date) return profile;
  const exactAge = calculatePlayerAgeForDate(profile.birth_date, profile.season - 1, leagueDate);
  if (!exactAge) return profile;
  return {
    ...profile,
    age: exactAge,
    display_age: exactAge,
    exact_age: exactAge,
    season_age: profile.season_age ?? profile.age,
    source_stat_line: {
      ...profile.source_stat_line,
      age: exactAge,
    },
  };
}

export function buildPlayerRatingProfile({
  source,
  source_snapshot_id,
  patch,
  leagueContext,
  eraContext,
  generated_at_ms = Date.now(),
}: {
  source: PublicStatLine;
  source_snapshot_id: string;
  patch?: RatingPatch;
  leagueContext: LeagueContext;
  eraContext: EraAdjustmentContext;
  generated_at_ms?: number;
}): PlayerRatingProfile {
  const resolvedSource = patchedSource(source, patch);
  const birthDate = resolvedSource.birthDate || resolvedSource.birth_date;
  const season_age = seasonAgeFromSource(resolvedSource, leagueContext.season, birthDate);
  const exact_age = birthDate && leagueContext.leagueDate
    ? calculatePlayerAgeForDate(birthDate, leagueContext.season - 1, leagueContext.leagueDate) ?? season_age
    : season_age;
  const display_age = exact_age ?? season_age;
  const sourceWithAge = display_age && display_age !== resolvedSource.age
    ? { ...resolvedSource, age: display_age }
    : resolvedSource;
  const attribute_model = buildAttributeModel({ source: sourceWithAge, leagueContext });
  const era = applyEraAdjustment({ source: sourceWithAge, attribute_model, context: eraContext });
  const development_curve = developmentCurve(era.era_adjusted_profiles, sourceWithAge);
  const era_adjusted_profiles = {
    ...era.era_adjusted_profiles,
    potential: development_curve.potential,
  };
  const validation_warnings = patch?.skill_grades
    ? validateSkillGrades(era_adjusted_profiles, patch.skill_grades)
    : [];
  const skill_grades = skillGradesFromAttributes(era_adjusted_profiles);
  const category_skill_grades = buildSkillGrades(era_adjusted_profiles, {
    shotVolumeModifier: shotVolumeModifier(resolvedSource),
    eliteShooterProof: (resolvedSource.scoutingTags || []).some(tag => String(tag).toLowerCase() === 'elite_shooter'),
  });
  const tendencies = buildPlayerTendencies(sourceWithAge);

  return {
    collection: 'player_ratings',
    player_id: resolvedSource.player_id,
    full_name: resolvedSource.full_name,
    season: leagueContext.season,
    team: resolvedSource.team,
    position: resolvedSource.position,
    age: display_age,
    season_age,
    display_age,
    exact_age,
    birth_date: birthDate ? String(birthDate) : undefined,
    jersey_number: patch?.jersey_number,
    injury_state: patch?.injury_state,
    roster_status: patch?.roster_status,
    source_snapshot_id,
    attribute_model,
    era_adjusted_profiles,
    skill_grades,
    category_skill_grades,
    tendencies,
    archetypes: archetypesFor(era_adjusted_profiles, sourceWithAge),
    traits: traitsFor(era_adjusted_profiles),
    source_stat_line: sourceWithAge,
    development_curve,
    era_notes: era.era_notes,
    validation_warnings,
    model_version: 'original-attribute-model-v1',
    generated_at_ms,
  };
}
