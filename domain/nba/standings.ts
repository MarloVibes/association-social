import type { NbaScheduleGame } from './schedule';
import { displayScheduleAbbr, displayScheduleName, scheduleKeyAliases } from './scheduleView';

export type StandingsTeam = {
  id?: string | null;
  teamId?: string | null;
  abbreviation?: string | null;
  abbr?: string | null;
  name?: string | null;
  full_name?: string | null;
  gmId?: string | null;
};

export type StandingsParticipant = {
  scheduleTeamId?: string | null;
  sourceTeamDocId?: string | null;
  gmId?: string | null;
  abbreviation?: string | null;
  name?: string | null;
};

export type StandingsRow = {
  teamId: string;
  abbreviation: string;
  name: string;
  gmId: string | null;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
  pct: number;
};

export type NbaCupStandingsGroup = {
  id: string;
  rows: StandingsRow[];
};

type NbaCupStandingsGame = NbaScheduleGame & {
  groupId?: string | null;
};

type NbaCupGroup = {
  id: string;
  teamIds: string[];
};

function normalize(value?: string | null) {
  return String(value || '').trim().toUpperCase();
}

function displayName(team: StandingsTeam | StandingsParticipant, fallback: string) {
  return displayScheduleName(team) || fallback;
}

function registerTeam(
  rows: Map<string, StandingsRow>,
  aliases: Map<string, string>,
  source: StandingsTeam | StandingsParticipant,
  rawId?: string | null,
) {
  const teamId = normalize(rawId || (source as StandingsParticipant).scheduleTeamId || (source as StandingsTeam).teamId || source.abbreviation || (source as StandingsTeam).abbr || (source as StandingsTeam).id);
  if (!teamId) return;
  const abbreviation = displayScheduleAbbr(source.abbreviation || (source as StandingsTeam).abbr || teamId);
  const sourceAliases = [teamId, abbreviation, (source as StandingsTeam).teamId, (source as StandingsTeam).abbr, (source as StandingsTeam).id]
    .flatMap(scheduleKeyAliases);
  const existingKey = sourceAliases.map(key => aliases.get(key)).find(Boolean);
  if (existingKey && rows.has(existingKey)) {
    const existing = rows.get(existingKey) as StandingsRow;
    rows.set(existingKey, {
      ...existing,
      abbreviation: abbreviation || existing.abbreviation,
      name: displayName(source, existing.name),
      gmId: source.gmId || existing.gmId,
    });
    sourceAliases.forEach(key => aliases.set(key, existingKey));
    return;
  }
  if (rows.has(teamId)) return;
  const row: StandingsRow = {
    teamId,
    abbreviation,
    name: displayName(source, abbreviation || teamId),
    gmId: source.gmId || null,
    wins: 0,
    losses: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    pointDiff: 0,
    pct: 0,
  };
  rows.set(teamId, row);
  sourceAliases.forEach(key => aliases.set(key, teamId));
}

function ensureRow(rows: Map<string, StandingsRow>, aliases: Map<string, string>, teamId: string) {
  const normalized = normalize(teamId);
  const rowKey = aliases.get(normalized) || normalized;
  if (!rows.has(rowKey)) {
    registerTeam(rows, aliases, { scheduleTeamId: rowKey, abbreviation: rowKey }, rowKey);
  }
  return rows.get(rowKey) as StandingsRow;
}

function rowInGroup(row: StandingsRow, group: NbaCupGroup) {
  const groupKeys = new Set(group.teamIds.flatMap(scheduleKeyAliases));
  return scheduleKeyAliases(row.teamId).some(key => groupKeys.has(key))
    || scheduleKeyAliases(row.abbreviation).some(key => groupKeys.has(key));
}

export function buildNbaStandings({
  games,
  participants = [],
  teams = [],
}: {
  games: NbaScheduleGame[];
  participants?: StandingsParticipant[];
  teams?: StandingsTeam[];
}): StandingsRow[] {
  const rows = new Map<string, StandingsRow>();
  const aliases = new Map<string, string>();

  participants.forEach(participant => registerTeam(rows, aliases, participant, participant.scheduleTeamId || participant.abbreviation));
  teams.forEach(team => registerTeam(rows, aliases, team, team.teamId || team.abbreviation || team.abbr || team.id));

  games.filter(game => game.status === 'final' && typeof game.homeScore === 'number' && typeof game.awayScore === 'number').forEach((game) => {
    const home = ensureRow(rows, aliases, game.homeTeamId);
    const away = ensureRow(rows, aliases, game.awayTeamId);
    home.pointsFor += game.homeScore || 0;
    home.pointsAgainst += game.awayScore || 0;
    away.pointsFor += game.awayScore || 0;
    away.pointsAgainst += game.homeScore || 0;
    if ((game.homeScore || 0) > (game.awayScore || 0)) {
      home.wins += 1;
      away.losses += 1;
    } else {
      away.wins += 1;
      home.losses += 1;
    }
  });

  return [...rows.values()]
    .map(row => {
      const gamesPlayed = row.wins + row.losses;
      return {
        ...row,
        pointDiff: row.pointsFor - row.pointsAgainst,
        pct: gamesPlayed > 0 ? row.wins / gamesPlayed : 0,
      };
    })
    .sort((a, b) => (
      b.pct - a.pct
      || b.wins - a.wins
      || b.pointDiff - a.pointDiff
      || a.abbreviation.localeCompare(b.abbreviation)
    ));
}

export function buildNbaCupGroupStandings({
  games,
  groups,
  participants = [],
  teams = [],
}: {
  games: NbaCupStandingsGame[];
  groups: NbaCupGroup[];
  participants?: StandingsParticipant[];
  teams?: StandingsTeam[];
}): NbaCupStandingsGroup[] {
  return groups.map((group) => {
    const groupGames = games.filter(game => game.groupId === group.id);
    const rows = buildNbaStandings({
      games: groupGames,
      participants,
      teams,
    }).filter(row => rowInGroup(row, group));
    return { id: group.id, rows };
  });
}
