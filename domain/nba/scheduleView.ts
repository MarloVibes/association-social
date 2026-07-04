import { getSportTeamName } from '@/constants/sportTeams';

export type ScheduleViewTeam = {
  id?: string | null;
  teamId?: string | null;
  abbreviation?: string | null;
  gmId?: string | null;
  sport?: string | null;
};

type ScheduleLiveEvent = {
  elapsedMs?: number | null;
  homeScore?: number | null;
  awayScore?: number | null;
  periodLabel?: string | null;
  clockSeconds?: number | null;
  eventType?: string | null;
};

export type ScheduleViewGame = {
  homeTeamId: string;
  awayTeamId: string;
  homeGmId?: string | null;
  awayGmId?: string | null;
  status?: string;
  homeScore?: number | null;
  awayScore?: number | null;
  finalAtMs?: number | null;
  simulationStartedAtMs?: number | null;
  liveTimeline?: {
    revealDurationMs?: number | null;
    events?: ScheduleLiveEvent[];
  } | unknown;
  liveMode?: {
    simulationEndsAtMs?: number | null;
    simulationStartedAtMs?: number | null;
  } | null;
};

export type ScheduleViewMode = 'mine' | 'league';

export function normalizeScheduleKey(value?: string | null) {
  return String(value || '').trim().toUpperCase();
}

export function displayScheduleAbbr(value?: string | null) {
  const key = normalizeScheduleKey(value);
  const cpuMatch = key.match(/^CPU[_-]?(.+)$/);
  if (cpuMatch) return displayScheduleAbbr(cpuMatch[1]);
  const currentSuffixMatch = key.match(/^(.+)_CURRENT$/);
  if (currentSuffixMatch) return currentSuffixMatch[1];
  const eraSuffixMatch = key.match(/^(.+)_\d{4}$/);
  return eraSuffixMatch ? eraSuffixMatch[1] : key;
}

export function displayScheduleEventText(value?: string | null) {
  return String(value || '').replace(/\b[A-Z][A-Z0-9_]*_(?:\d{4}|CURRENT)\b/gi, match => displayScheduleAbbr(match));
}

function normalizeSportKey(value?: string | null) {
  const sport = String(value || 'nba').trim().toLowerCase();
  if (sport === 'nfl') return 'madden';
  if (sport === 'madden' || sport === 'mlb') return sport;
  return 'nba';
}

function sportTeamDisplayName(sport?: string | null, value?: string | null) {
  const sportKey = normalizeSportKey(sport);
  if (sportKey === 'nba') return '';
  const abbr = displayScheduleAbbr(value);
  if (!abbr) return '';
  const teamName = getSportTeamName(sportKey, abbr);
  return teamName && teamName !== abbr ? teamName : '';
}

export function displayScheduleTeamLabel(teamName?: string | null, fallbackTeamId?: string | null, sport?: string | null) {
  const name = String(teamName || '').trim();
  const cleanedName = displayScheduleEventText(name);
  const fallbackAbbr = displayScheduleAbbr(fallbackTeamId);
  const nameAbbr = displayScheduleAbbr(cleanedName);
  const sportDisplay = sportTeamDisplayName(sport, nameAbbr || fallbackAbbr);
  const normalizedName = normalizeScheduleKey(cleanedName);
  const looksLikeInternalTeamId = !cleanedName
    || normalizedName === normalizeScheduleKey(fallbackTeamId)
    || normalizedName === fallbackAbbr
    || normalizedName.startsWith('CPU_');
  if (sportDisplay && looksLikeInternalTeamId) return sportDisplay;
  if (cleanedName) return cleanedName;
  return fallbackAbbr;
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
  sport?: string | null;
}) {
  const name = displayScheduleEventText(String(team.name || team.full_name || '').trim());
  const fallback = team.abbreviation || team.abbr || team.scheduleTeamId || team.teamId || team.id;
  const fallbackAbbr = displayScheduleAbbr(fallback);
  const nameAbbr = displayScheduleAbbr(name);
  const sportDisplay = sportTeamDisplayName(team.sport, nameAbbr || fallbackAbbr);
  const normalizedName = normalizeScheduleKey(name);
  const looksLikeInternalTeamId = !name
    || normalizedName === normalizeScheduleKey(fallback)
    || normalizedName === fallbackAbbr
    || normalizedName.startsWith('CPU_');
  if (sportDisplay && looksLikeInternalTeamId) return sportDisplay;
  if (name) return name;
  return fallbackAbbr;
}

export function isLiveResultRevealed(game?: (Partial<ScheduleViewGame> & {
  liveTimeline?: {
    revealDurationMs?: number | null;
  } | unknown;
  liveMode?: {
    simulationEndsAtMs?: number | null;
    simulationStartedAtMs?: number | null;
  } | null;
}) | null, nowMs = Date.now()) {
  if (!game?.liveTimeline) return true;
  const simulationEndsAtMs = Number(game.liveMode?.simulationEndsAtMs || 0);
  if (simulationEndsAtMs > 0) return nowMs >= simulationEndsAtMs;
  const simulationStartedAtMs = Number(
    game.liveMode?.simulationStartedAtMs
    || game.simulationStartedAtMs
    || game.finalAtMs
    || 0,
  );
  const revealDurationMs = Number(
    typeof game.liveTimeline === 'object' && game.liveTimeline
      ? (game.liveTimeline as { revealDurationMs?: number | null }).revealDurationMs || 0
      : 0,
  );
  if (simulationStartedAtMs > 0 && revealDurationMs > 0) {
    return nowMs >= simulationStartedAtMs + revealDurationMs;
  }
  return false;
}

export function liveScheduleScore(game?: Partial<ScheduleViewGame> | null, nowMs = Date.now()) {
  const liveTimeline = game?.liveTimeline;
  const events: ScheduleLiveEvent[] = typeof liveTimeline === 'object' && liveTimeline
    ? ((liveTimeline as { events?: ScheduleLiveEvent[] }).events || [])
    : [];
  if (!events.length || isLiveResultRevealed(game, nowMs)) return null;

  const startedAt = Number(
    game?.liveMode?.simulationStartedAtMs
    || game?.simulationStartedAtMs
    || game?.finalAtMs
    || 0,
  );
  const revealDurationMs = Number(
    typeof liveTimeline === 'object' && liveTimeline
      ? (liveTimeline as { revealDurationMs?: number | null }).revealDurationMs || 0
      : 0,
  );
  const elapsedMs = Math.max(0, Math.min(startedAt > 0 ? nowMs - startedAt : 0, revealDurationMs || Number.MAX_SAFE_INTEGER));
  const currentIndex = events.findLastIndex(event => Number(event.elapsedMs || 0) <= elapsedMs);
  const current = currentIndex >= 0 ? events[currentIndex] : null;
  const awayScore = Number(current?.awayScore || 0);
  const homeScore = Number(current?.homeScore || 0);
  return {
    awayScore,
    homeScore,
    label: `${awayScore}-${homeScore}`,
    periodLabel: current?.periodLabel || 'Live',
    clockSeconds: typeof current?.clockSeconds === 'number' ? current.clockSeconds : null,
  };
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
