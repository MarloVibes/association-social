import { buildBaselineRatingProfiles } from './ratingSeeds';
import type { PlayerRatingProfile } from './ratingProfile';

type ResolveContext = {
  era?: string | null;
  currentYear?: number | string | null;
  leagueDate?: string | Date | null;
};

const baselineProfiles = buildBaselineRatingProfiles(1);

const ERA_TO_SEASON: Record<string, number> = {
  magic_bird: 1984,
  jordan: 1992,
  kobe: 2003,
  lebron: 2011,
  steph: 2017,
  current: 2026,
};

function normalizeName(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeTeam(value: unknown): string {
  return String(value || '').toUpperCase().trim();
}

function seasonFromContext(context: ResolveContext): number | null {
  const currentYear = Number(context.currentYear);
  if (Number.isFinite(currentYear) && currentYear > 1900) {
    return currentYear < 2100 ? currentYear + 1 : currentYear;
  }
  const era = String(context.era || '').toLowerCase();
  return ERA_TO_SEASON[era] || null;
}

export function resolveBaselineRatingProfile(
  player: Record<string, any> | null | undefined,
  context: ResolveContext = {},
): PlayerRatingProfile | null {
  const name = normalizeName(player?.full_name || player?.name);
  if (!name) return null;
  const team = normalizeTeam(player?.team || player?.teamAbbr || player?.abbreviation);
  const targetSeason = seasonFromContext(context);
  const profilePool = context.leagueDate
    ? buildBaselineRatingProfiles(1, { leagueDate: context.leagueDate })
    : baselineProfiles;
  const candidates = profilePool.filter(profile => normalizeName(profile.full_name) === name);
  if (candidates.length === 0) return null;

  const seasonMatches = targetSeason
    ? candidates.filter(profile => profile.season === targetSeason)
    : candidates;
  const pool = seasonMatches.length > 0 ? seasonMatches : candidates;

  return (
    pool.find(profile => team && normalizeTeam(profile.team) === team)
    || pool[0]
    || null
  );
}

export function mergeBaselineRatingProfile<T extends Record<string, any>>(
  player: T,
  context: ResolveContext = {},
): T {
  const profile = resolveBaselineRatingProfile(player, context);
  if (!profile) return player;
  return {
    ...player,
    baselineRatingProfile: profile,
    category_skill_grades: player.category_skill_grades || profile.category_skill_grades,
    era_adjusted_profiles: player.era_adjusted_profiles || profile.era_adjusted_profiles,
    attribute_model: player.attribute_model || profile.attribute_model,
    development_curve: player.development_curve || profile.development_curve,
    tendencies: player.tendencies || profile.tendencies,
  };
}
