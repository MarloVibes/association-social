export type ScheduleViewTeam = {
  id?: string | null;
  teamId?: string | null;
  abbreviation?: string | null;
  gmId?: string | null;
};

export type ScheduleViewGame = {
  homeTeamId: string;
  awayTeamId: string;
  homeGmId?: string | null;
  awayGmId?: string | null;
  status?: string;
  liveTimeline?: unknown;
  liveMode?: {
    simulationEndsAtMs?: number | null;
  } | null;
};

export type ScheduleViewMode = 'mine' | 'league';

export function normalizeScheduleKey(value?: string | null) {
  return String(value || '').trim().toUpperCase();
}

export function displayScheduleAbbr(value?: string | null) {
  const key = normalizeScheduleKey(value);
  const eraSuffixMatch = key.match(/^([A-Z]{2,3})_\d{4}$/);
  return eraSuffixMatch ? eraSuffixMatch[1] : key;
}

const TEAM_ALIASES: Record<string, string[]> = {
  NOH: ['NOP', 'NOK'],
  NOK: ['NOH', 'NOP'],
  NOP: ['NOH', 'NOK'],
  NJN: ['BKN'],
  BKN: ['NJN'],
  SEA: ['OKC'],
  OKC: ['SEA'],
  VAN: ['MEM'],
  MEM: ['VAN'],
  KCK: ['SAC'],
  SAC: ['KCK'],
};

export function scheduleKeyAliases(value?: string | null) {
  const key = normalizeScheduleKey(value);
  if (!key) return [];
  const displayKey = displayScheduleAbbr(key);
  return [...new Set([key, displayKey, ...(TEAM_ALIASES[key] || []), ...(TEAM_ALIASES[displayKey] || [])])];
}

export function displayScheduleName(team: {
  name?: string | null;
  full_name?: string | null;
  abbreviation?: string | null;
  abbr?: string | null;
  scheduleTeamId?: string | null;
  teamId?: string | null;
  id?: string | null;
}) {
  const name = String(team.name || team.full_name || '').trim();
  if (name) return name;
  return displayScheduleAbbr(team.abbreviation || team.abbr || team.scheduleTeamId || team.teamId || team.id);
}

export function isLiveResultRevealed(game?: (Partial<ScheduleViewGame> & {
  liveTimeline?: unknown;
  liveMode?: {
    simulationEndsAtMs?: number | null;
  } | null;
}) | null, nowMs = Date.now()) {
  if (!game?.liveTimeline) return true;
  const simulationEndsAtMs = Number(game.liveMode?.simulationEndsAtMs || 0);
  return simulationEndsAtMs <= 0 || nowMs >= simulationEndsAtMs;
}

export function teamScheduleKeys(team?: ScheduleViewTeam | null) {
  return new Set(
    [team?.id, team?.teamId, team?.abbreviation]
      .flatMap(scheduleKeyAliases)
      .filter(Boolean),
  );
}

export function gameBelongsToTeam(game: ScheduleViewGame, team?: ScheduleViewTeam | null) {
  const keys = teamScheduleKeys(team);
  return keys.has(normalizeScheduleKey(game.homeTeamId)) || keys.has(normalizeScheduleKey(game.awayTeamId));
}

export function gameBelongsToUser(game: ScheduleViewGame, uid?: string | null) {
  return Boolean(uid && (game.homeGmId === uid || game.awayGmId === uid));
}

export function gameMatchesMyTeam(game: ScheduleViewGame, team?: ScheduleViewTeam | null, uid?: string | null) {
  return gameBelongsToUser(game, uid) || gameBelongsToTeam(game, team);
}

export function visibleScheduleGames<T extends ScheduleViewGame>(
  games: T[],
  mode: ScheduleViewMode,
  team?: ScheduleViewTeam | null,
  uid?: string | null,
) {
  const sorted = [...games].sort((a: any, b: any) => Number(a.sequence || 0) - Number(b.sequence || 0));
  if (mode === 'league' || !team) return sorted;
  return sorted.filter(game => gameMatchesMyTeam(game, team, uid));
}
