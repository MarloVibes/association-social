import type { NbaScheduleGame } from './schedule';

type ScoutingGame = NbaScheduleGame & {
  homeCoachingStyle?: string | null;
  awayCoachingStyle?: string | null;
  boxScore?: {
    home?: { players?: ScoutingBoxPlayer[] };
    away?: { players?: ScoutingBoxPlayer[] };
  } | null;
};

export type NbaScoutingPerformer = {
  playerId: string;
  name: string;
  teamSide: 'team' | 'opponent';
  minutes: number;
  points?: number;
  rebounds?: number;
  assists?: number;
};

type ScoutingBoxPlayer = {
  playerId?: string | null;
  player_id?: string | null;
  id?: string | null;
  name?: string | null;
  full_name?: string | null;
  minutes?: number | null;
  points?: number | null;
  rebounds?: number | null;
  assists?: number | null;
};

export type NbaScoutingGame = {
  gameId: string;
  opponentTeamId: string;
  teamScore: number;
  opponentScore: number;
  result: 'W' | 'L';
  coachingStyle: string | null;
  opponentCoachingStyle: string | null;
  topPerformers: NbaScoutingPerformer[];
  minuteLeaders: Array<Pick<NbaScoutingPerformer, 'playerId' | 'name' | 'teamSide' | 'minutes'>>;
};

export type NbaScoutingReport = {
  teamId: string;
  games: NbaScoutingGame[];
};

function isFinalWithScore(game: ScoutingGame) {
  return game.status === 'final'
    && typeof game.homeScore === 'number'
    && typeof game.awayScore === 'number';
}

function numberFrom(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function playerId(player: ScoutingBoxPlayer) {
  return String(player.playerId || player.player_id || player.id || player.name || player.full_name || '');
}

function playerName(player: ScoutingBoxPlayer) {
  return String(player.name || player.full_name || playerId(player));
}

function playerLines(players: ScoutingBoxPlayer[] | undefined, teamSide: 'team' | 'opponent'): NbaScoutingPerformer[] {
  return (players || []).map(player => ({
    playerId: playerId(player),
    name: playerName(player),
    teamSide,
    minutes: numberFrom(player.minutes),
    points: numberFrom(player.points),
    rebounds: numberFrom(player.rebounds),
    assists: numberFrom(player.assists),
  })).filter(player => player.playerId);
}

function scoutingBoxDetails(game: ScoutingGame, isHome: boolean) {
  const teamPlayers = isHome ? game.boxScore?.home?.players : game.boxScore?.away?.players;
  const opponentPlayers = isHome ? game.boxScore?.away?.players : game.boxScore?.home?.players;
  const lines = [
    ...playerLines(teamPlayers, 'team'),
    ...playerLines(opponentPlayers, 'opponent'),
  ];
  return {
    topPerformers: [...lines]
      .sort((left, right) => (
        numberFrom(right.points) - numberFrom(left.points)
        || numberFrom(right.rebounds) - numberFrom(left.rebounds)
        || numberFrom(right.assists) - numberFrom(left.assists)
        || right.minutes - left.minutes
        || left.name.localeCompare(right.name)
      ))
      .slice(0, 3),
    minuteLeaders: [...lines]
      .sort((left, right) => right.minutes - left.minutes || left.name.localeCompare(right.name))
      .slice(0, 3)
      .map(({ playerId, name, teamSide, minutes }) => ({ playerId, name, teamSide, minutes })),
  };
}

export function buildNbaScoutingReport({
  teamId,
  games,
}: {
  teamId: string;
  games: ScoutingGame[];
}): NbaScoutingReport {
  const reportGames = games
    .filter(game => isFinalWithScore(game) && (game.homeTeamId === teamId || game.awayTeamId === teamId))
    .sort((a, b) => b.sequence - a.sequence)
    .map((game): NbaScoutingGame => {
      const isHome = game.homeTeamId === teamId;
      const teamScore = isHome ? game.homeScore as number : game.awayScore as number;
      const opponentScore = isHome ? game.awayScore as number : game.homeScore as number;
      const boxDetails = scoutingBoxDetails(game, isHome);
      return {
        gameId: game.id,
        opponentTeamId: isHome ? game.awayTeamId : game.homeTeamId,
        teamScore,
        opponentScore,
        result: teamScore > opponentScore ? 'W' : 'L',
        coachingStyle: isHome ? game.homeCoachingStyle || null : game.awayCoachingStyle || null,
        opponentCoachingStyle: isHome ? game.awayCoachingStyle || null : game.homeCoachingStyle || null,
        ...boxDetails,
      };
    });

  return {
    teamId,
    games: reportGames,
  };
}
