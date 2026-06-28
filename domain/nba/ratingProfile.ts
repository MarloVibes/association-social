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
  jersey_number?: string;
  injury_state?: string;
  roster_status?: string;
  source_snapshot_id: string;
  attribute_model: AttributeModel;
  era_adjusted_profiles: AttributeModel;
  skill_grades: Partial<Record<keyof AttributeModel, NbaGrade>>;
  archetypes: string[];
  traits: string[];
  development_curve: {
    potential: number;
    peak_start_age: number;
    peak_end_age: number;
    aging_resistance: number;
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
  const aging_resistance = model.stamina >= 88 && model.offenseIq >= 84
    ? 3
    : model.potential >= 89
      ? 2
      : model.potential >= 82
        ? 1
        : 0;
  return {
    potential: model.potential,
    peak_start_age: age <= 23 ? 25 : age <= 28 ? age + 1 : age,
    peak_end_age: aging_resistance >= 2 ? 34 : 32,
    aging_resistance,
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
  const attribute_model = buildAttributeModel({ source: resolvedSource, leagueContext });
  const era = applyEraAdjustment({ source: resolvedSource, attribute_model, context: eraContext });
  const validation_warnings = patch?.skill_grades
    ? validateSkillGrades(era.era_adjusted_profiles, patch.skill_grades)
    : [];
  const skill_grades = skillGradesFromAttributes(era.era_adjusted_profiles);

  return {
    collection: 'player_ratings',
    player_id: resolvedSource.player_id,
    full_name: resolvedSource.full_name,
    season: leagueContext.season,
    team: resolvedSource.team,
    position: resolvedSource.position,
    jersey_number: patch?.jersey_number,
    injury_state: patch?.injury_state,
    roster_status: patch?.roster_status,
    source_snapshot_id,
    attribute_model,
    era_adjusted_profiles: era.era_adjusted_profiles,
    skill_grades,
    archetypes: archetypesFor(era.era_adjusted_profiles, resolvedSource),
    traits: traitsFor(era.era_adjusted_profiles),
    development_curve: developmentCurve(era.era_adjusted_profiles, resolvedSource),
    era_notes: era.era_notes,
    validation_warnings,
    model_version: 'original-attribute-model-v1',
    generated_at_ms,
  };
}
