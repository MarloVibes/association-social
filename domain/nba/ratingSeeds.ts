import { buildPlayerRatingProfile, type PlayerRatingProfile } from './ratingProfile';
import type { EraAdjustmentContext } from './eraAdjustedProfiles';
import type { LeagueContext, PublicStatLine } from './attributeModel';
import { generatedRatingSeeds } from './generatedRatingSeeds';

export type BaselineSeed = {
  source: PublicStatLine;
  leagueContext: LeagueContext;
  eraContext: EraAdjustmentContext;
  snapshotId: string;
};

const seeds: BaselineSeed[] = [
  {
    snapshotId: 'baseline-2011',
    leagueContext: {
      season: 2011,
      pace: 92,
      leagueThreePointPct: 0.358,
      leagueFreeThrowPct: 0.763,
    },
    eraContext: {
      season: 2011,
      era: '2010s',
      pace: 92,
      leaguePace: 92,
      leagueThreePointPct: 0.358,
      positionMinutesBaseline: 34,
    },
    source: {
      player_id: 'lebron-james-2011',
      full_name: 'LeBron James',
      team: 'MIA',
      position: 'SF',
      age: 26,
      birthDate: '1984-12-30',
      games: 79,
      minutesPerGame: 38.8,
      pointsPerGame: 26.7,
      reboundsPerGame: 7.5,
      assistsPerGame: 7,
      stealsPerGame: 1.6,
      blocksPerGame: 0.6,
      fieldGoalPct: 0.51,
      trueShootingPct: 0.594,
      effectiveFieldGoalPct: 0.541,
      threePointPct: 0.33,
      threePointAttemptsPerGame: 3.5,
      freeThrowPct: 0.759,
      freeThrowAttemptsPerGame: 8.4,
      usagePct: 31.5,
      assistPct: 34,
      turnoverPct: 13.8,
      defensiveWinShares: 4.5,
      winShares: 15.6,
      draftPick: 1,
      rimAttemptRate: 0.38,
      dunkRate: 0.12,
      driveRate: 0.38,
      transitionRate: 0.24,
      awardWeight: 8,
      scoutingTags: ['generational', 'elite_rim_pressure', 'high_usage_creator', 'defensive_wing_assignment'],
    },
  },
  {
    snapshotId: 'baseline-2011',
    leagueContext: {
      season: 2011,
      pace: 92,
      leagueThreePointPct: 0.358,
      leagueFreeThrowPct: 0.763,
    },
    eraContext: {
      season: 2011,
      era: '2010s',
      pace: 92,
      leaguePace: 92,
      leagueThreePointPct: 0.358,
      positionMinutesBaseline: 34,
    },
    source: {
      player_id: 'derrick-rose-2011',
      full_name: 'Derrick Rose',
      team: 'CHI',
      position: 'PG',
      age: 22,
      birthDate: '1988-10-04',
      games: 81,
      minutesPerGame: 37.4,
      pointsPerGame: 25,
      reboundsPerGame: 4.1,
      assistsPerGame: 7.7,
      stealsPerGame: 1,
      blocksPerGame: 0.6,
      fieldGoalPct: 0.445,
      trueShootingPct: 0.55,
      effectiveFieldGoalPct: 0.485,
      threePointPct: 0.332,
      threePointAttemptsPerGame: 4.8,
      freeThrowPct: 0.858,
      freeThrowAttemptsPerGame: 6.9,
      usagePct: 32.2,
      assistPct: 38.7,
      turnoverPct: 13.1,
      defensiveWinShares: 4.8,
      winShares: 13.1,
      draftPick: 1,
      rimAttemptRate: 0.38,
      dunkRate: 0.08,
      driveRate: 0.42,
      transitionRate: 0.24,
      awardWeight: 7,
      scoutingTags: ['mvp', 'elite_rim_pressure', 'elite_burst', 'high_usage_creator'],
    },
  },
  {
    snapshotId: 'baseline-2026',
    leagueContext: {
      season: 2026,
      pace: 99,
      leagueThreePointPct: 0.36,
      leagueFreeThrowPct: 0.78,
    },
    eraContext: {
      season: 2026,
      era: 'modern',
      pace: 99,
      leaguePace: 99,
      leagueThreePointPct: 0.36,
      positionMinutesBaseline: 31,
    },
    source: {
      player_id: 'lebron-james-2026',
      full_name: 'LeBron James',
      team: 'LAL',
      position: 'SF',
      age: 41,
      birthDate: '1984-12-30',
      games: 70,
      minutesPerGame: 34,
      pointsPerGame: 24,
      reboundsPerGame: 7,
      assistsPerGame: 8,
      stealsPerGame: 0.9,
      blocksPerGame: 0.5,
      fieldGoalPct: 0.51,
      trueShootingPct: 0.60,
      effectiveFieldGoalPct: 0.56,
      threePointPct: 0.37,
      threePointAttemptsPerGame: 5.1,
      freeThrowPct: 0.76,
      freeThrowAttemptsPerGame: 5.2,
      usagePct: 28,
      assistPct: 36,
      turnoverPct: 14,
      defensiveWinShares: 2.2,
      winShares: 8.5,
      draftPick: 1,
      rimAttemptRate: 0.28,
      dunkRate: 0.04,
      driveRate: 0.22,
      transitionRate: 0.12,
      awardWeight: 10,
      scoutingTags: ['generational', 'legacy_star', 'aging_resistant', 'high_usage_creator'],
    },
  },
];

export function buildBaselineRatingProfiles(
  generated_at_ms = 1,
  options: { leagueDate?: string | Date | null } = {},
): PlayerRatingProfile[] {
  const manualKeys = new Set(seeds.map(seed => seedKey(seed)));
  const combinedSeeds = [
    ...seeds,
    ...generatedRatingSeeds.filter(seed => !manualKeys.has(seedKey(seed))),
  ];

  return combinedSeeds.map(seed => buildPlayerRatingProfile({
    source: seed.source,
    source_snapshot_id: seed.snapshotId,
    leagueContext: {
      ...seed.leagueContext,
      leagueDate: options.leagueDate ?? seed.leagueContext.leagueDate,
    },
    eraContext: seed.eraContext,
    generated_at_ms,
  }));
}

function seedKey(seed: BaselineSeed) {
  return [
    seed.leagueContext.season,
    String(seed.source.full_name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(),
    String(seed.source.team || '').toUpperCase().trim(),
  ].join('|');
}
