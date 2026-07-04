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
  passingYards?: number;
  passingTouchdowns?: number;
  interceptions?: number;
  rushingYards?: number;
  rushingTouchdowns?: number;
  receivingYards?: number;
  receivingTouchdowns?: number;
  sacks?: number;
  tackles?: number;
  atBats?: number;
  hits?: number;
  runs?: number;
  rbi?: number;
  homeRuns?: number;
  stolenBases?: number;
  inningsPitched?: number;
  strikeouts?: number;
  earnedRuns?: number;
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
  passingYards?: number | null;
  passingTouchdowns?: number | null;
  interceptions?: number | null;
  rushingYards?: number | null;
  rushingTouchdowns?: number | null;
  receivingYards?: number | null;
  receivingTouchdowns?: number | null;
  sacks?: number | null;
  tackles?: number | null;
  atBats?: number | null;
  hits?: number | null;
  runs?: number | null;
  rbi?: number | null;
  homeRuns?: number | null;
  stolenBases?: number | null;
  inningsPitched?: number | null;
  strikeouts?: number | null;
  earnedRuns?: number | null;
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
  return (players || []).map((player) => {
    const line: NbaScoutingPerformer = {
      playerId: playerId(player),
      name: playerName(player),
      teamSide,
      minutes: numberFrom(player.minutes),
      points: numberFrom(player.points),
      rebounds: numberFrom(player.rebounds),
      assists: numberFrom(player.assists),
    };
    ([
      'passingYards',
      'passingTouchdowns',
      'interceptions',
      'rushingYards',
      'rushingTouchdowns',
      'receivingYards',
      'receivingTouchdowns',
      'sacks',
      'tackles',
      'atBats',
      'hits',
      'runs',
      'rbi',
      'homeRuns',
      'stolenBases',
      'inningsPitched',
      'strikeouts',
      'earnedRuns',
    ] as const).forEach((key) => {
      if (player[key] != null) line[key] = numberFrom(player[key]);
    });
    return line;
  }).filter(player => player.playerId);
}

function performerScore(player: NbaScoutingPerformer, sport: 'nba' | 'madden' | 'mlb') {
  if (sport === 'madden') {
    return numberFrom(player.passingYards)
      + numberFrom(player.rushingYards) * 1.15
      + numberFrom(player.receivingYards) * 1.15
      + numberFrom(player.passingTouchdowns) * 45
      + numberFrom(player.rushingTouchdowns) * 45
      + numberFrom(player.receivingTouchdowns) * 45
      + numberFrom(player.sacks) * 35
      + numberFrom(player.interceptions) * 35
      + numberFrom(player.tackles) * 3;
  }
  if (sport === 'mlb') {
    return numberFrom(player.hits) * 12
      + numberFrom(player.rbi) * 10
      + numberFrom(player.homeRuns) * 25
      + numberFrom(player.stolenBases) * 8
      + numberFrom(player.inningsPitched) * 8
      + numberFrom(player.strikeouts) * 5
      - numberFrom(player.earnedRuns) * 5;
  }
  return numberFrom(player.points) * 2
    + numberFrom(player.rebounds) * 1.15
    + numberFrom(player.assists) * 1.35;
}

function normalizeSport(sport?: string | null): 'nba' | 'madden' | 'mlb' {
  if (sport === 'nfl' || sport === 'madden') return 'madden';
  if (sport === 'mlb') return 'mlb';
  return 'nba';
}

function scoutingBoxDetails(game: ScoutingGame, isHome: boolean, sport: 'nba' | 'madden' | 'mlb') {
  const teamPlayers = isHome ? game.boxScore?.home?.players : game.boxScore?.away?.players;
  const opponentPlayers = isHome ? game.boxScore?.away?.players : game.boxScore?.home?.players;
  const lines = [
    ...playerLines(teamPlayers, 'team'),
    ...playerLines(opponentPlayers, 'opponent'),
  ];
  return {
    topPerformers: [...lines]
      .sort((left, right) => (
        performerScore(right, sport) - performerScore(left, sport)
        || numberFrom(right.points) - numberFrom(left.points)
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
  sport: sportInput = 'nba',
  teamId,
  games,
}: {
  sport?: string | null;
  teamId: string;
  games: ScoutingGame[];
}): NbaScoutingReport {
  const sport = normalizeSport(sportInput);
  const reportGames = games
    .filter(game => isFinalWithScore(game) && (game.homeTeamId === teamId || game.awayTeamId === teamId))
    .sort((a, b) => b.sequence - a.sequence)
    .map((game): NbaScoutingGame => {
      const isHome = game.homeTeamId === teamId;
      const teamScore = isHome ? game.homeScore as number : game.awayScore as number;
      const opponentScore = isHome ? game.awayScore as number : game.homeScore as number;
      const boxDetails = scoutingBoxDetails(game, isHome, sport);
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
