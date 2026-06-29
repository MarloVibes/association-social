import { describe, expect, it } from 'vitest';
import { applyEraAdjustment, type EraAdjustmentContext } from '@/domain/nba/eraAdjustedProfiles';
import { ATTRIBUTE_KEYS, type AttributeModel, type PublicStatLine } from '@/domain/nba/attributeModel';

const context2011: EraAdjustmentContext = {
  season: 2011,
  era: 'lebron',
  pace: 92,
  leaguePace: 92,
  leagueThreePointPct: 0.358,
  positionMinutesBaseline: 31,
};

const baseSource: PublicStatLine = {
  player_id: 'wing-1',
  full_name: 'Two Way Wing',
  team: 'CHI',
  position: 'SF',
  age: 25,
  games: 82,
  minutesPerGame: 39,
  pointsPerGame: 17.4,
  reboundsPerGame: 5.8,
  assistsPerGame: 2.8,
  stealsPerGame: 1,
  blocksPerGame: 0.6,
  fieldGoalPct: 0.46,
  threePointPct: 0.35,
  threePointAttemptsPerGame: 3.1,
  freeThrowPct: 0.75,
  freeThrowAttemptsPerGame: 4.5,
  usagePct: 22,
  assistPct: 13,
  turnoverPct: 11,
  defensiveWinShares: 4.1,
  winShares: 9,
};

const baseModel: AttributeModel = {
  ...Object.fromEntries(ATTRIBUTE_KEYS.map(key => [key, 74])) as AttributeModel,
  closeShot: 78,
  midRange: 77,
  threePoint: 75,
  freeThrow: 74,
  dunking: 76,
  shotIq: 79,
  passing: 73,
  ballHandle: 74,
  offenseIq: 78,
  clutch: 76,
  perimeterDefense: 82,
  postDefense: 75,
  blocking: 70,
  steals: 76,
  defenseIq: 80,
  helpDefense: 79,
  speed: 80,
  acceleration: 79,
  strength: 76,
  rebounding: 76,
  postOffense: 72,
  stamina: 84,
  potential: 82,
};

describe('era adjusted rating profiles', () => {
  it('protects high-minute two-way wings from generic average labels', () => {
    const result = applyEraAdjustment({
      source: baseSource,
      attribute_model: baseModel,
      context: context2011,
    });

    expect(result.era_adjusted_profiles.perimeterDefense).toBeGreaterThan(baseModel.perimeterDefense);
    expect(result.era_adjusted_profiles.defenseIq).toBeGreaterThan(baseModel.defenseIq);
    expect(result.era_adjusted_profiles.stamina).toBeGreaterThan(baseModel.stamina);
    expect(result.era_notes).toContain('protected heavy-minute defensive role');
  });

  it('rewards shooting only when accuracy and role volume both support it', () => {
    const specialist = applyEraAdjustment({
      source: { ...baseSource, threePointPct: 0.42, threePointAttemptsPerGame: 7, pointsPerGame: 19 },
      attribute_model: { ...baseModel, threePoint: 85 },
      context: { ...context2011, season: 2027, era: 'current', leagueThreePointPct: 0.36 },
    });
    const lowVolume = applyEraAdjustment({
      source: { ...baseSource, threePointPct: 0.42, threePointAttemptsPerGame: 1.1 },
      attribute_model: { ...baseModel, threePoint: 85 },
      context: { ...context2011, season: 2027, era: 'current', leagueThreePointPct: 0.36 },
    });

    expect(specialist.era_adjusted_profiles.threePoint).toBeGreaterThan(lowVolume.era_adjusted_profiles.threePoint);
    expect(specialist.era_notes).toContain('boosted proven shooting role');
  });

  it('keeps adjustments bounded and hidden-number based', () => {
    const result = applyEraAdjustment({
      source: { ...baseSource, minutesPerGame: 44, defensiveWinShares: 8, pointsPerGame: 31 },
      attribute_model: Object.fromEntries(
        Object.entries(baseModel).map(([key]) => [key, 98]),
      ) as AttributeModel,
      context: context2011,
    });

    expect(Math.max(...Object.values(result.era_adjusted_profiles))).toBeLessThanOrEqual(99);
    expect(Math.min(...Object.values(result.era_adjusted_profiles))).toBeGreaterThanOrEqual(40);
  });
});
