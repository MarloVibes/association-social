import { generateSchedule, type NbaScheduleGame } from './schedule';
import { buildNbaCupGroupStandings } from './standings';
import { scheduleKeyAliases } from './scheduleView';

export const NBA_TEAM_IDS = Object.freeze([
  'ATL', 'BOS', 'BKN', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GSW',
  'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NOP', 'NYK',
  'OKC', 'ORL', 'PHI', 'PHX', 'POR', 'SAC', 'SAS', 'TOR', 'UTA', 'WAS',
]);

export type NbaScheduleParticipant = {
  scheduleTeamId: string;
  sourceTeamDocId: string | null;
  gmId: string | null;
  abbreviation: string;
  name: string;
};

export type NbaCupGame = NbaScheduleGame & {
  stage: 'group' | 'quarterfinal' | 'semifinal' | 'final';
  groupId?: string;
  competition: 'nbaCup';
};

export type NbaCupSchedule = {
  enabled: true;
  name: 'NBA Cup';
  seasonYear: number;
  groupSize: number;
  groups: Array<{
    id: string;
    teamIds: string[];
  }>;
  games: NbaCupGame[];
  championTeamId?: string | null;
  championTeamName?: string | null;
  championTeamAbbr?: string | null;
};

type ClaimedTeam = {
  id: string;
  teamId?: string | null;
  abbreviation?: string | null;
  abbr?: string | null;
  gmId?: string | null;
  name?: string | null;
  full_name?: string | null;
};

function normalizeTeamId(value?: string | null) {
  return String(value || '').trim().toUpperCase();
}

function hash(value: string): number {
  let h = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function supportsNbaCupSchedule({ era, currentYear }: { era?: string | null; currentYear: number }) {
  return String(era || 'current') === 'current' && Number(currentYear) >= 2023;
}

export function buildNbaCupSchedule({
  scheduleTeamIds,
  currentYear,
  seed,
}: {
  scheduleTeamIds: readonly string[];
  currentYear: number;
  seed: string;
}): NbaCupSchedule | null {
  if (scheduleTeamIds.length < 30) return null;
  const groupSize = scheduleTeamIds.length % 5 === 0 ? 5 : 6;
  const teams = [...scheduleTeamIds].sort((a, b) => hash(`${seed}:cup:${a}`) - hash(`${seed}:cup:${b}`) || a.localeCompare(b));
  const groups = Array.from({ length: Math.ceil(teams.length / groupSize) }, (_, index) => ({
    id: `Group ${String.fromCharCode(65 + index)}`,
    teamIds: teams.slice(index * groupSize, index * groupSize + groupSize),
  })).filter(group => group.teamIds.length > 1);
  const games: NbaCupGame[] = [];

  groups.forEach((group, groupIndex) => {
    const homeCounts = new Map(group.teamIds.map(teamId => [teamId, 0]));
    for (let leftIndex = 0; leftIndex < group.teamIds.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < group.teamIds.length; rightIndex += 1) {
        const left = group.teamIds[leftIndex];
        const right = group.teamIds[rightIndex];
        const leftHome = homeCounts.get(left) || 0;
        const rightHome = homeCounts.get(right) || 0;
        const homeTeamId = leftHome < rightHome
          ? left
          : rightHome < leftHome
            ? right
            : hash(`${seed}:cup-home:${group.id}:${left}:${right}`) % 2 === 0 ? left : right;
        const awayTeamId = homeTeamId === left ? right : left;
        homeCounts.set(homeTeamId, (homeCounts.get(homeTeamId) || 0) + 1);
        const sequence = games.length + 1;
        games.push({
          id: `nba_cup_${hash(`${seed}:${sequence}:${awayTeamId}:${homeTeamId}`).toString(36)}`,
          stage: 'group',
          groupId: group.id,
          competition: 'nbaCup',
          week: groupIndex + 1,
          sequence,
          homeTeamId,
          awayTeamId,
          status: 'scheduled',
        });
      }
    }
  });

  return {
    enabled: true,
    name: 'NBA Cup',
    seasonYear: currentYear,
    groupSize,
    groups,
    games,
  };
}

function cupPairKey(game: Pick<NbaScheduleGame, 'homeTeamId' | 'awayTeamId'>) {
  return [game.homeTeamId, game.awayTeamId].sort().join('__');
}

export function integrateNbaCupGamesIntoRegularSchedule(
  games: NbaScheduleGame[],
  nbaCup: NbaCupSchedule | null,
): { games: NbaScheduleGame[]; nbaCup: NbaCupSchedule | null } {
  if (!nbaCup || !Array.isArray(nbaCup.games) || nbaCup.games.length === 0) {
    return { games, nbaCup };
  }

  const availableByPair = new Map<string, NbaScheduleGame[]>();
  games.forEach((game) => {
    const key = cupPairKey(game);
    const current = availableByPair.get(key) || [];
    current.push(game);
    availableByPair.set(key, current);
  });

  const replacements = new Map<string, { scheduleGame: NbaScheduleGame; cupGame: NbaCupGame }>();
  const nextCupGames = nbaCup.games.map((cupGame) => {
    if (cupGame.stage !== 'group') return cupGame;
    const candidates = availableByPair.get(cupPairKey(cupGame)) || [];
    const regularGame = candidates.shift();
    if (!regularGame) return cupGame;

    const sharedId = cupGame.id;
    const scheduleGame: NbaScheduleGame = {
      ...regularGame,
      id: sharedId,
      competition: 'nbaCup',
      stage: 'group',
      groupId: cupGame.groupId,
      cupSequence: cupGame.sequence,
      homeTeamId: cupGame.homeTeamId,
      awayTeamId: cupGame.awayTeamId,
      homeGmId: cupGame.homeGmId ?? regularGame.homeGmId ?? null,
      awayGmId: cupGame.awayGmId ?? regularGame.awayGmId ?? null,
      countsForRegularSeason: true,
    };
    const mirroredCupGame: NbaCupGame = {
      ...scheduleGame,
      sequence: cupGame.sequence,
      week: cupGame.week,
      competition: 'nbaCup',
      stage: 'group',
    };
    replacements.set(regularGame.id, { scheduleGame, cupGame: mirroredCupGame });
    return mirroredCupGame;
  });

  return {
    games: games.map(game => replacements.get(game.id)?.scheduleGame || game),
    nbaCup: { ...nbaCup, games: nextCupGames },
  };
}

export function buildNbaScheduleParticipants(
  teams: ClaimedTeam[],
  scheduleTeamIds: readonly string[] = NBA_TEAM_IDS,
): NbaScheduleParticipant[] {
  const claimedByTeam = new Map<string, NbaScheduleParticipant>();
  teams.forEach((team) => {
    const scheduleTeamId = normalizeTeamId(team.teamId || team.abbreviation || team.abbr || team.id);
    if (!scheduleTeamId || claimedByTeam.has(scheduleTeamId)) return;
    const participant = {
      scheduleTeamId,
      sourceTeamDocId: team.id,
      gmId: team.gmId || null,
      abbreviation: normalizeTeamId(team.abbreviation || team.abbr || scheduleTeamId),
      name: team.name || team.full_name || '',
    };
    [team.teamId, team.abbreviation, team.abbr, team.id]
      .flatMap(scheduleKeyAliases)
      .forEach(key => {
        if (!claimedByTeam.has(key)) claimedByTeam.set(key, participant);
      });
  });

  return scheduleTeamIds.map((rawScheduleTeamId) => {
    const scheduleTeamId = normalizeTeamId(rawScheduleTeamId);
    const claimed = scheduleKeyAliases(scheduleTeamId)
      .map(key => claimedByTeam.get(key))
      .find(Boolean);
    return claimed ? { ...claimed, scheduleTeamId } : {
      scheduleTeamId,
      sourceTeamDocId: null,
      gmId: null,
      abbreviation: scheduleTeamId,
      name: '',
    };
  });
}

export function decorateScheduleGames(
  games: NbaScheduleGame[],
  participants: NbaScheduleParticipant[],
): NbaScheduleGame[] {
  const byTeamId = new Map(participants.map(team => [team.scheduleTeamId, team]));
  return games.map((game) => {
    const home = byTeamId.get(game.homeTeamId);
    const away = byTeamId.get(game.awayTeamId);
    return {
      ...game,
      homeGmId: home?.gmId || null,
      awayGmId: away?.gmId || null,
    };
  });
}

function finalWinnerTeamId(game: NbaCupGame) {
  if (game.status !== 'final') return '';
  if (game.winnerTeamId) return game.winnerTeamId;
  if (typeof game.homeScore !== 'number' || typeof game.awayScore !== 'number') return '';
  return game.homeScore > game.awayScore ? game.homeTeamId : game.awayTeamId;
}

function stageComplete(games: NbaCupGame[]) {
  return games.length > 0 && games.every(game => Boolean(finalWinnerTeamId(game)));
}

function participantForTeam(participants: NbaScheduleParticipant[], teamId: string) {
  const aliases = new Set(scheduleKeyAliases(teamId));
  return participants.find(participant => scheduleKeyAliases(participant.scheduleTeamId).some(key => aliases.has(key)));
}

function cupStageGame({
  seed,
  sequence,
  stage,
  awayTeamId,
  homeTeamId,
}: {
  seed: string;
  sequence: number;
  stage: NbaCupGame['stage'];
  awayTeamId: string;
  homeTeamId: string;
}): NbaCupGame {
  const stageWeeks: Record<NbaCupGame['stage'], number> = {
    group: 1,
    quarterfinal: 7,
    semifinal: 8,
    final: 9,
  };
  return {
    id: `nba_cup_${stage}_${hash(`${seed}:${stage}:${sequence}:${awayTeamId}:${homeTeamId}`).toString(36)}`,
    stage,
    competition: 'nbaCup',
    week: stageWeeks[stage],
    sequence,
    homeTeamId,
    awayTeamId,
    status: 'scheduled',
  };
}

function seededCupTeams(nbaCup: NbaCupSchedule, participants: NbaScheduleParticipant[]) {
  const groupTables = buildNbaCupGroupStandings({
    games: nbaCup.games,
    groups: nbaCup.groups,
    participants,
  });
  const groupWinners = groupTables.map(group => group.rows[0]).filter(Boolean);
  const winnerIds = new Set(groupWinners.map(row => row.teamId));
  const wildcards = groupTables
    .flatMap(group => group.rows.slice(1))
    .filter(row => !winnerIds.has(row.teamId))
    .sort((a, b) => (
      b.pct - a.pct
      || b.wins - a.wins
      || b.pointDiff - a.pointDiff
      || b.pointsFor - a.pointsFor
      || a.abbreviation.localeCompare(b.abbreviation)
    ))
    .slice(0, Math.max(0, 8 - groupWinners.length));
  return [...groupWinners, ...wildcards]
    .sort((a, b) => (
      b.pct - a.pct
      || b.wins - a.wins
      || b.pointDiff - a.pointDiff
      || b.pointsFor - a.pointsFor
      || a.abbreviation.localeCompare(b.abbreviation)
    ))
    .map(row => row.teamId)
    .slice(0, 8);
}

function appendStageGames({
  nbaCup,
  stage,
  pairings,
  participants,
  seed,
}: {
  nbaCup: NbaCupSchedule;
  stage: NbaCupGame['stage'];
  pairings: Array<[string, string]>;
  participants: NbaScheduleParticipant[];
  seed: string;
}) {
  const nextSequence = nbaCup.games.length + 1;
  const games = pairings.map(([homeTeamId, awayTeamId], index) => cupStageGame({
    seed,
    sequence: nextSequence + index,
    stage,
    homeTeamId,
    awayTeamId,
  }));
  return {
    ...nbaCup,
    games: [
      ...nbaCup.games,
      ...(decorateScheduleGames(games, participants) as NbaCupGame[]),
    ],
  };
}

export function advanceNbaCupStage({
  nbaCup,
  participants,
  seed,
}: {
  nbaCup: NbaCupSchedule;
  participants: NbaScheduleParticipant[];
  seed: string;
}): NbaCupSchedule {
  const groupGames = nbaCup.games.filter(game => game.stage === 'group');
  const quarterfinals = nbaCup.games.filter(game => game.stage === 'quarterfinal');
  const semifinals = nbaCup.games.filter(game => game.stage === 'semifinal');
  const finals = nbaCup.games.filter(game => game.stage === 'final');

  if (quarterfinals.length === 0) {
    if (!stageComplete(groupGames)) return nbaCup;
    const seededTeams = seededCupTeams(nbaCup, participants);
    if (seededTeams.length < 8) return nbaCup;
    return appendStageGames({
      nbaCup,
      participants,
      seed,
      stage: 'quarterfinal',
      pairings: [
        [seededTeams[0], seededTeams[7]],
        [seededTeams[3], seededTeams[4]],
        [seededTeams[2], seededTeams[5]],
        [seededTeams[1], seededTeams[6]],
      ],
    });
  }

  if (semifinals.length === 0) {
    if (!stageComplete(quarterfinals)) return nbaCup;
    const winners = quarterfinals.map(finalWinnerTeamId);
    return appendStageGames({
      nbaCup,
      participants,
      seed,
      stage: 'semifinal',
      pairings: [[winners[0], winners[1]], [winners[2], winners[3]]],
    });
  }

  if (finals.length === 0) {
    if (!stageComplete(semifinals)) return nbaCup;
    const winners = semifinals.map(finalWinnerTeamId);
    return appendStageGames({
      nbaCup,
      participants,
      seed,
      stage: 'final',
      pairings: [[winners[0], winners[1]]],
    });
  }

  if (!nbaCup.championTeamId && stageComplete(finals)) {
    const championTeamId = finalWinnerTeamId(finals[0]);
    const champion = participantForTeam(participants, championTeamId);
    return {
      ...nbaCup,
      championTeamId,
      championTeamName: champion?.name || champion?.abbreviation || championTeamId,
      championTeamAbbr: champion?.abbreviation || championTeamId,
    };
  }

  return nbaCup;
}

export function buildNbaSchedulePayload({
  leagueId,
  sport = 'nba',
  currentYear,
  era,
  gamesPerTeam,
  teams,
  scheduleTeamIds,
}: {
  leagueId: string;
  sport?: string | null;
  currentYear: number;
  era?: string | null;
  gamesPerTeam: number;
  teams: ClaimedTeam[];
  scheduleTeamIds?: readonly string[];
}) {
  const participants = buildNbaScheduleParticipants(teams, scheduleTeamIds);
  const scheduleTeams = participants.map(team => team.scheduleTeamId);
  const seed = `${leagueId}:${currentYear || 2025}:${gamesPerTeam}`;
  const baseGames = decorateScheduleGames(
    generateSchedule({ teams: scheduleTeams, gamesPerTeam, seed }),
    participants,
  );
  const rawNbaCup = sport === 'nba' && supportsNbaCupSchedule({ era, currentYear })
    ? buildNbaCupSchedule({ scheduleTeamIds: scheduleTeams, currentYear, seed })
    : null;
  const nbaCup = rawNbaCup
    ? { ...rawNbaCup, games: decorateScheduleGames(rawNbaCup.games, participants) as NbaCupGame[] }
    : null;
  const integratedSchedule = integrateNbaCupGamesIntoRegularSchedule(baseGames, nbaCup);

  return {
    games: integratedSchedule.games,
    gamesPerTeam,
    teamCount: scheduleTeams.length,
    participants,
    nbaCup: integratedSchedule.nbaCup,
    seed,
    locked: true,
  };
}
