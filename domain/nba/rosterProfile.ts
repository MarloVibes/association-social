import { resolveBaselineRatingProfile } from './baselineProfileResolver';

type RosterProfileContext = {
  era?: string | null;
  currentYear?: number | string | null;
  leagueDate?: string | Date | null;
};

function normalizePlayerName(player: Record<string, any> | null | undefined): string {
  return String(player?.full_name || player?.name || '').trim();
}

export function selectRosterRatingProfile(
  player: Record<string, any> | null | undefined,
  profilesByName: Record<string, any> = {},
  context: RosterProfileContext = {},
) {
  if (!player) return null;
  const baseline = resolveBaselineRatingProfile(player, context);
  if (baseline) return baseline;

  const name = normalizePlayerName(player);
  return profilesByName[name]
    || profilesByName[player.full_name]
    || profilesByName[player.name]
    || null;
}
