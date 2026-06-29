import { describe, expect, it } from 'vitest';
import { buildPlayerRatingProfile, type RatingPatch } from '@/domain/nba/ratingProfile';
import type { PublicStatLine } from '@/domain/nba/attributeModel';

const source: PublicStatLine = {
  player_id: 'p-current-1',
  full_name: 'Test Creator',
  team: 'OLD',
  position: 'PG',
  age: 23,
  games: 72,
  minutesPerGame: 35,
  pointsPerGame: 23,
  reboundsPerGame: 4,
  assistsPerGame: 9,
  stealsPerGame: 1.6,
  blocksPerGame: 0.2,
  fieldGoalPct: 0.48,
  threePointPct: 0.4,
  threePointAttemptsPerGame: 7,
  freeThrowPct: 0.88,
  freeThrowAttemptsPerGame: 5,
  usagePct: 29,
  assistPct: 43,
  turnoverPct: 11,
  defensiveWinShares: 3,
  winShares: 10,
  draftPick: 2,
};

const leagueContext = {
  season: 2027,
  pace: 100,
  leagueThreePointPct: 0.36,
  leagueFreeThrowPct: 0.78,
};

const eraContext = {
  season: 2027,
  era: 'current',
  pace: 100,
  leaguePace: 100,
  leagueThreePointPct: 0.36,
  positionMinutesBaseline: 31,
};

describe('neutral player rating profile', () => {
  it('builds hidden attributes, visible grades, archetypes, traits, and development curve', () => {
    const profile = buildPlayerRatingProfile({
      source,
      source_snapshot_id: 'snapshot-1',
      leagueContext,
      eraContext,
      generated_at_ms: 500,
    });

    expect(profile).toMatchObject({
      player_id: 'p-current-1',
      full_name: 'Test Creator',
      season: 2027,
      collection: 'player_ratings',
      source_snapshot_id: 'snapshot-1',
      model_version: 'original-attribute-model-v1',
      generated_at_ms: 500,
    });
    expect(profile.attribute_model.passing).toBeGreaterThan(80);
    expect(profile.era_adjusted_profiles.threePoint).toBeGreaterThanOrEqual(profile.attribute_model.threePoint);
    expect(profile.skill_grades.passing).toBeTruthy();
    expect(profile.category_skill_grades.threePoint.grade).toMatch(/A|B/);
    expect(profile.category_skill_grades.playmaking.rating).toBeGreaterThan(80);
    expect(profile.tendencies.pickAndRollBallHandler).toBeGreaterThan(70);
    expect(profile.tendencies.threePointFrequency).toBeGreaterThan(70);
    expect(profile.development_curve.phase).toBeTruthy();
    expect(profile.development_curve.potential_grade).toBeTruthy();
    expect(profile.archetypes.length).toBeGreaterThan(0);
    expect(profile.archetypes.join(' ')).not.toContain('Contributor');
    expect(profile.traits.length).toBeGreaterThan(0);
    expect(profile.development_curve.potential).toBeGreaterThanOrEqual(profile.era_adjusted_profiles.potential);
  });

  it('applies manual source facts but does not allow manual elite grade overrides', () => {
    const patch: RatingPatch = {
      team: 'NEW',
      jersey_number: '4',
      roster_status: 'active',
      skill_grades: {
        threePoint: 'S',
      },
    };

    const profile = buildPlayerRatingProfile({
      source: { ...source, threePointPct: 0.35, threePointAttemptsPerGame: 2 },
      source_snapshot_id: 'snapshot-2',
      patch,
      leagueContext,
      eraContext,
      generated_at_ms: 700,
    });

    expect(profile.team).toBe('NEW');
    expect(profile.jersey_number).toBe('4');
    expect(profile.roster_status).toBe('active');
    expect(profile.skill_grades.threePoint).not.toBe('S');
    expect(profile.validation_warnings[0]).toContain('requested S');
  });
});
