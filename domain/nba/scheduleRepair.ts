import type { NbaScheduleGame } from './schedule';
import { scheduleKeyAliases } from './scheduleView';

export type NbaScheduleRepairTeam = {
  id?: string | null;
  teamId?: string | null;
  abbreviation?: string | null;
  abbr?: string | null;
  gmId?: string | null;
  name?: string | null;
  full_name?: string | null;
};

export type NbaScheduleRepairParticipant = {
  scheduleTeamId?: string | null;
  sourceTeamDocId?: string | null;
  gmId?: string | null;
  abbreviation?: string | null;
  name?: string | null;
};

type ClaimedTeamEntry = {
  team: NbaScheduleRepairTeam;
  keys: Set<string>;
};

function normalize(value?: string | null) {
  return String(value || '').trim().toUpperCase();
}

function teamKeys(team: NbaScheduleRepairTeam) {
  return new Set(
    [team.teamId, team.abbreviation, team.abbr, team.id]
      .flatMap(scheduleKeyAliases)
      .filter(Boolean),
  );
}

function buildClaimedEntries(teams: NbaScheduleRepairTeam[]) {
  return teams
    .filter(team => team.gmId)
    .map(team => ({ team, keys: teamKeys(team) }))
    .filter(entry => entry.keys.size > 0);
}

function findClaimedTeam(entries: ClaimedTeamEntry[], scheduleTeamId?: string | null) {
  const keys = scheduleKeyAliases(scheduleTeamId);
  return entries.find(entry => keys.some(key => entry.keys.has(key)))?.team || null;
}

function participantForClaim(
  participant: NbaScheduleRepairParticipant,
  claimed: NbaScheduleRepairTeam,
): NbaScheduleRepairParticipant {
  return {
    ...participant,
    sourceTeamDocId: claimed.id || participant.sourceTeamDocId || null,
    gmId: claimed.gmId || participant.gmId || null,
    abbreviation: normalize(claimed.abbreviation || claimed.abbr || participant.abbreviation || participant.scheduleTeamId),
    name: claimed.name || claimed.full_name || participant.name || '',
  };
}

export function repairScheduleOwnership<T extends NbaScheduleGame>({
  games,
  participants = [],
  teams,
}: {
  games: T[];
  participants?: NbaScheduleRepairParticipant[];
  teams: NbaScheduleRepairTeam[];
}) {
  const claimedEntries = buildClaimedEntries(teams);
  let changed = false;
  let repairedGames = 0;

  const nextGames = games.map((game) => {
    const home = findClaimedTeam(claimedEntries, game.homeTeamId);
    const away = findClaimedTeam(claimedEntries, game.awayTeamId);
    const nextHomeGmId = home?.gmId || game.homeGmId;
    const nextAwayGmId = away?.gmId || game.awayGmId;
    if (nextHomeGmId === game.homeGmId && nextAwayGmId === game.awayGmId) return game;
    changed = true;
    repairedGames += 1;
    return {
      ...game,
      homeGmId: nextHomeGmId,
      awayGmId: nextAwayGmId,
    };
  });

  const nextParticipants = participants.map((participant) => {
    const claimed = findClaimedTeam(
      claimedEntries,
      participant.scheduleTeamId || participant.abbreviation,
    );
    if (!claimed) return participant;
    const nextParticipant = participantForClaim(participant, claimed);
    if (
      nextParticipant.sourceTeamDocId === participant.sourceTeamDocId
      && nextParticipant.gmId === participant.gmId
      && nextParticipant.abbreviation === participant.abbreviation
      && nextParticipant.name === participant.name
    ) {
      return participant;
    }
    changed = true;
    return nextParticipant;
  });

  return {
    games: nextGames,
    participants: nextParticipants,
    changed,
    repairedGames,
  };
}
