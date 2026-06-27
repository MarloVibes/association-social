import { buildPlayerRatingProfile, type PlayerRatingProfile, type RatingPatch } from './ratingProfile';
import type { LeagueContext, PublicStatLine } from './attributeModel';
import type { EraAdjustmentContext } from './eraAdjustedProfiles';

export type RatingSourceSnapshot = {
  snapshot_id: string;
  leagueContext: LeagueContext;
  eraContext: EraAdjustmentContext;
  players: PublicStatLine[];
};

export type RatingPatchSet = {
  players?: Record<string, RatingPatch>;
};

export type RatingImportPayload = {
  collection: 'player_ratings';
  snapshot_id: string;
  generated_at_ms: number;
  profiles: PlayerRatingProfile[];
};

export function buildRatingImportPayload({
  snapshot,
  patch = {},
  generated_at_ms = Date.now(),
}: {
  snapshot: RatingSourceSnapshot;
  patch?: RatingPatchSet;
  generated_at_ms?: number;
}): RatingImportPayload {
  return {
    collection: 'player_ratings',
    snapshot_id: snapshot.snapshot_id,
    generated_at_ms,
    profiles: (snapshot.players || []).map(player => buildPlayerRatingProfile({
      source: player,
      source_snapshot_id: snapshot.snapshot_id,
      patch: patch.players?.[player.player_id],
      leagueContext: snapshot.leagueContext,
      eraContext: snapshot.eraContext,
      generated_at_ms,
    })),
  };
}
