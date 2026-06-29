import type { NbaScheduleGame } from './schedule';
import type { PlayoffFormat } from './playoffs';
import type { StandingsRow, StandingsTeam } from './standings';

export type SeasonCompletion = {
  totalGames: number;
  finalGames: number;
  remainingGames: number;
  complete: boolean;
};

export type PlayoffPictureSeed = StandingsRow & {
  seed: number;
  zone: 'playoff' | 'play_in' | 'bubble';
};

export type PlayoffPicture = {
  format: PlayoffFormat;
  label: 'Projected Playoffs' | 'Final Seeds';
  completion: SeasonCompletion;
  playoffSeeds: PlayoffPictureSeed[];
  playInSeeds: PlayoffPictureSeed[];
  bubble: PlayoffPictureSeed[];
  readyToStartPostseason: boolean;
  bracketLocked: boolean;
};

export type ConferencePlayoffPicture = {
  label: 'Eastern Conference' | 'Western Conference' | 'League';
  picture: PlayoffPicture;
};

export type ConferencePlayoffPictureResult = {
  format: PlayoffFormat;
  label: 'Projected Playoffs' | 'Final Seeds';
  completion: SeasonCompletion;
  conferences: ConferencePlayoffPicture[];
  readyToStartPostseason: boolean;
  bracketLocked: boolean;
};

const FORMAT_LIMITS: Record<PlayoffFormat, { playoff: number; playInStart: number; playInEnd: number; bubbleCount: number }> = {
  short_8: { playoff: 8, playInStart: 0, playInEnd: 0, bubbleCount: 4 },
  traditional_16: { playoff: 16, playInStart: 0, playInEnd: 0, bubbleCount: 4 },
  play_in_16: { playoff: 12, playInStart: 13, playInEnd: 20, bubbleCount: 4 },
};

const EAST_TEAMS = new Set(['ATL', 'BOS', 'BKN', 'CHA', 'CHI', 'CLE', 'DET', 'IND', 'MIA', 'MIL', 'NJN', 'NYK', 'ORL', 'PHI', 'TOR', 'WAS']);
const WEST_TEAMS = new Set(['DAL', 'DEN', 'GSW', 'HOU', 'LAC', 'LAL', 'MEM', 'MIN', 'NOH', 'NOK', 'NOP', 'OKC', 'PHX', 'POR', 'SAC', 'SAS', 'SEA', 'UTA', 'VAN']);

export function regularSeasonCompletion(games: NbaScheduleGame[]): SeasonCompletion {
  const regularGames = games.filter(game => game.stage !== 'playoffs');
  const totalGames = regularGames.length;
  const finalGames = regularGames.filter(game => game.status === 'final').length;
  const remainingGames = Math.max(0, totalGames - finalGames);

  return {
    totalGames,
    finalGames,
    remainingGames,
    complete: totalGames > 0 && remainingGames === 0,
  };
}

function seededRows(standings: StandingsRow[]): PlayoffPictureSeed[] {
  return standings.map((row, index) => ({
    ...row,
    seed: index + 1,
    zone: 'bubble',
  }));
}

function normalized(value?: string | null) {
  return String(value || '').trim().toUpperCase();
}

function normalizedConference(value?: string | null): 'East' | 'West' | null {
  const next = normalized(value);
  if (next === 'EAST' || next === 'EASTERN') return 'East';
  if (next === 'WEST' || next === 'WESTERN') return 'West';
  return null;
}

function teamKeys(team: StandingsTeam) {
  return [team.id, team.teamId, team.abbreviation, team.abbr, team.name, team.full_name]
    .map(normalized)
    .filter(Boolean);
}

function conferenceForRow(row: StandingsRow, teams: StandingsTeam[]): 'East' | 'West' | 'League' {
  const rowKeys = [row.teamId, row.abbreviation, row.name].map(normalized).filter(Boolean);
  const matchedTeam = teams.find(team => teamKeys(team).some(key => rowKeys.includes(key)));
  const explicit = normalizedConference((matchedTeam as StandingsTeam & { conference?: string | null })?.conference);
  if (explicit) return explicit;
  const abbr = normalized(row.abbreviation || row.teamId);
  if (EAST_TEAMS.has(abbr)) return 'East';
  if (WEST_TEAMS.has(abbr)) return 'West';
  return 'League';
}

export function buildPlayoffPicture({
  standings,
  format,
  completion,
  bracketExists = false,
}: {
  standings: StandingsRow[];
  format: PlayoffFormat;
  completion: SeasonCompletion;
  bracketExists?: boolean;
}): PlayoffPicture {
  const limits = FORMAT_LIMITS[format];
  const seeds = seededRows(standings);
  const playoffSeeds = seeds.slice(0, limits.playoff).map(seed => ({ ...seed, zone: 'playoff' as const }));
  const playInSeeds = limits.playInStart > 0
    ? seeds.slice(limits.playInStart - 1, limits.playInEnd).map(seed => ({ ...seed, zone: 'play_in' as const }))
    : [];
  const consumed = limits.playInEnd || limits.playoff;
  const bubble = seeds.slice(consumed, consumed + limits.bubbleCount).map(seed => ({ ...seed, zone: 'bubble' as const }));

  return {
    format,
    label: completion.complete ? 'Final Seeds' : 'Projected Playoffs',
    completion,
    playoffSeeds,
    playInSeeds,
    bubble,
    readyToStartPostseason: completion.complete && !bracketExists,
    bracketLocked: bracketExists,
  };
}

export function buildConferencePlayoffPicture({
  standings,
  teams = [],
  format,
  completion,
  bracketExists = false,
}: {
  standings: StandingsRow[];
  teams?: StandingsTeam[];
  format: PlayoffFormat;
  completion: SeasonCompletion;
  bracketExists?: boolean;
}): ConferencePlayoffPictureResult {
  const grouped: Record<'East' | 'West' | 'League', StandingsRow[]> = {
    East: [],
    West: [],
    League: [],
  };
  standings.forEach(row => grouped[conferenceForRow(row, teams)].push(row));

  const source: Array<['Eastern Conference' | 'Western Conference' | 'League', StandingsRow[]]> = [
    ['Eastern Conference', grouped.East],
    ['Western Conference', grouped.West],
    ['League', grouped.League],
  ];
  const conferences = source
    .filter(([, rows]) => rows.length > 0)
    .map(([label, rows]) => ({
      label,
      picture: buildPlayoffPicture({
        standings: rows,
        format,
        completion,
        bracketExists,
      }),
    }));

  return {
    format,
    label: completion.complete ? 'Final Seeds' : 'Projected Playoffs',
    completion,
    conferences,
    readyToStartPostseason: completion.complete && !bracketExists,
    bracketLocked: bracketExists,
  };
}
