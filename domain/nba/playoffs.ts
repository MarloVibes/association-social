import type { NbaScheduleGame } from './schedule';
import type { StandingsRow } from './standings';

export type PlayoffFormat = 'short_8' | 'traditional_16' | 'play_in_16';
export type PlayoffRoundName = 'play_in' | 'quarterfinal' | 'semifinal' | 'final' | 'first_round' | 'second_round' | 'conference_final';

export type PlayoffGame = NbaScheduleGame & {
  stage: 'playoffs';
  round: PlayoffRoundName;
  seriesId: string;
  playoffGame: number;
};

export type PlayoffSeries = {
  id: string;
  round: PlayoffRoundName;
  roundIndex: number;
  seriesIndex: number;
  homeSeed: number;
  awaySeed: number;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  winnerTeamId?: string | null;
  games: PlayoffGame[];
};

export type PlayoffRound = {
  name: PlayoffRoundName;
  label: string;
  roundIndex: number;
  series: PlayoffSeries[];
};

export type PlayoffBracket = {
  format: PlayoffFormat;
  seasonYear: number;
  bestOf: 7;
  seed: string;
  seeds: StandingsRow[];
  rounds: PlayoffRound[];
};

const ROUND_LABELS: Record<PlayoffRoundName, string> = {
  play_in: 'Play-In',
  quarterfinal: 'Quarterfinals',
  semifinal: 'Semifinals',
  final: 'Finals',
  first_round: 'First Round',
  second_round: 'Second Round',
  conference_final: 'Conference Finals',
};

const ROUND_NAMES: Record<PlayoffFormat, PlayoffRoundName[]> = {
  short_8: ['quarterfinal', 'semifinal', 'final'],
  traditional_16: ['first_round', 'second_round', 'conference_final', 'final'],
  play_in_16: ['play_in', 'first_round', 'second_round', 'conference_final', 'final'],
};

const FIRST_ROUND_PAIRINGS: Record<PlayoffFormat, Array<[number, number]>> = {
  short_8: [[1, 8], [4, 5], [3, 6], [2, 7]],
  traditional_16: [[1, 16], [8, 9], [5, 12], [4, 13], [3, 14], [6, 11], [7, 10], [2, 15]],
  play_in_16: [[13, 20], [14, 19], [15, 18], [16, 17]],
};

const FIRST_ROUND_16_PAIRINGS: Array<[number, number]> = [[1, 16], [8, 9], [5, 12], [4, 13], [3, 14], [6, 11], [7, 10], [2, 15]];

function gameId(seed: string, seriesId: string, playoffGame: number) {
  return `nba_playoff_${seed}_${seriesId}_${playoffGame}`.replace(/[^a-zA-Z0-9_]/g, '_');
}

function sortedSeeds(standings: StandingsRow[]) {
  return [...standings].sort((a, b) => (
    b.pct - a.pct
    || b.wins - a.wins
    || b.pointDiff - a.pointDiff
    || a.abbreviation.localeCompare(b.abbreviation)
  ));
}

function roundLabel(name: PlayoffRoundName) {
  return ROUND_LABELS[name];
}

function buildSeries({
  seed,
  round,
  roundIndex,
  seriesIndex,
  homeSeed,
  awaySeed,
  home,
  away,
}: {
  seed: string;
  round: PlayoffRoundName;
  roundIndex: number;
  seriesIndex: number;
  homeSeed: number;
  awaySeed: number;
  home: StandingsRow;
  away: StandingsRow;
}): PlayoffSeries {
  const seriesId = `${round}_${seriesIndex + 1}`;
  const games = Array.from({ length: 7 }, (_, index): PlayoffGame => {
    const playoffGame = index + 1;
    const homeHosts = [1, 2, 5, 7].includes(playoffGame);
    const homeTeam = homeHosts ? home : away;
    const awayTeam = homeHosts ? away : home;
    return {
      id: gameId(seed, seriesId, playoffGame),
      stage: 'playoffs',
      round,
      seriesId,
      playoffGame,
      week: 100 + roundIndex,
      sequence: roundIndex * 100 + seriesIndex * 10 + playoffGame,
      homeTeamId: homeTeam.teamId,
      awayTeamId: awayTeam.teamId,
      homeGmId: homeTeam.gmId,
      awayGmId: awayTeam.gmId,
      status: 'scheduled',
    };
  });

  return {
    id: seriesId,
    round,
    roundIndex,
    seriesIndex,
    homeSeed,
    awaySeed,
    homeTeamId: home.teamId,
    awayTeamId: away.teamId,
    homeTeamName: home.name,
    awayTeamName: away.name,
    winnerTeamId: null,
    games,
  };
}

function buildRoundFromPairings({
  format,
  seed,
  seasonYear,
  standings,
  roundIndex = 0,
  roundName,
  pairings,
}: {
  format: PlayoffFormat;
  seed: string;
  seasonYear: number;
  standings: StandingsRow[];
  roundIndex?: number;
  roundName?: PlayoffRoundName;
  pairings?: Array<[number, number]>;
}): PlayoffRound {
  const seeded = sortedSeeds(standings);
  const selectedPairings = pairings || FIRST_ROUND_PAIRINGS[format];
  const required = Math.max(...selectedPairings.flat());
  if (seeded.length < required) {
    throw new Error(`Playoff format ${format} requires at least ${required} teams.`);
  }
  const round = roundName || ROUND_NAMES[format][roundIndex];
  return {
    name: round,
    label: roundLabel(round),
    roundIndex,
    series: selectedPairings.map(([homeSeed, awaySeed], index) => buildSeries({
      seed: `${seed}:${seasonYear}`,
      round,
      roundIndex,
      seriesIndex: index,
      homeSeed,
      awaySeed,
      home: seeded[homeSeed - 1],
      away: seeded[awaySeed - 1],
    })),
  };
}

export function buildPlayoffBracket({
  standings,
  format,
  seasonYear,
  seed,
}: {
  standings: StandingsRow[];
  format: PlayoffFormat;
  seasonYear: number;
  seed: string;
}): PlayoffBracket {
  return {
    format,
    seasonYear,
    bestOf: 7,
    seed,
    seeds: sortedSeeds(standings),
    rounds: [buildRoundFromPairings({ format, seed, seasonYear, standings })],
  };
}

function winnerRowsForRound(round: PlayoffRound): StandingsRow[] {
  return round.series.map((series) => {
    const winnerTeamId = series.winnerTeamId;
    if (!winnerTeamId) throw new Error('Every series in the current round needs a winner.');
    const isHome = winnerTeamId === series.homeTeamId;
    return {
      teamId: winnerTeamId,
      abbreviation: winnerTeamId,
      name: isHome ? series.homeTeamName : series.awayTeamName,
      gmId: null,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDiff: 0,
      pct: 0,
    };
  });
}

function nextRoundPairings(count: number): Array<[number, number]> {
  return Array.from({ length: count / 2 }, (_, index) => [index * 2, index * 2 + 1]);
}

function appendNextRound(bracket: PlayoffBracket): PlayoffBracket {
  const currentRound = bracket.rounds[bracket.rounds.length - 1];
  const roundNames = ROUND_NAMES[bracket.format];
  const nextRoundName = roundNames[currentRound.roundIndex + 1];
  if (!nextRoundName) return bracket;
  if (currentRound.series.some(series => !series.winnerTeamId)) return bracket;

  if (bracket.format === 'play_in_16' && currentRound.name === 'play_in') {
    const seededRows = new Map<number, StandingsRow>(
      bracket.seeds.map((row, index) => [index + 1, row]),
    );
    currentRound.series.forEach((series) => {
      if (series.winnerTeamId) {
        const isHome = series.winnerTeamId === series.homeTeamId;
        seededRows.set(series.homeSeed, {
          teamId: series.winnerTeamId,
          abbreviation: series.winnerTeamId,
          name: isHome ? series.homeTeamName : series.awayTeamName,
          gmId: null,
          wins: 0,
          losses: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          pointDiff: 0,
          pct: 0,
        });
      }
    });
    const nextRound: PlayoffRound = {
      name: 'first_round',
      label: roundLabel('first_round'),
      roundIndex: 1,
      series: FIRST_ROUND_16_PAIRINGS.map(([homeSeed, awaySeed], index) => buildSeries({
        seed: `${bracket.seed}:${bracket.seasonYear}`,
        round: 'first_round',
        roundIndex: 1,
        seriesIndex: index,
        homeSeed,
        awaySeed,
        home: seededRows.get(homeSeed) as StandingsRow,
        away: seededRows.get(awaySeed) as StandingsRow,
      })),
    };
    return { ...bracket, rounds: [...bracket.rounds, nextRound] };
  }

  const winners = winnerRowsForRound(currentRound);
  const nextRound: PlayoffRound = {
    name: nextRoundName,
    label: roundLabel(nextRoundName),
    roundIndex: currentRound.roundIndex + 1,
    series: nextRoundPairings(winners.length).map(([homeIndex, awayIndex], index) => buildSeries({
      seed: `${bracket.seed}:${bracket.seasonYear}`,
      round: nextRoundName,
      roundIndex: currentRound.roundIndex + 1,
      seriesIndex: index,
      homeSeed: currentRound.series[homeIndex].homeSeed,
      awaySeed: currentRound.series[awayIndex].homeSeed,
      home: winners[homeIndex],
      away: winners[awayIndex],
    })),
  };
  return { ...bracket, rounds: [...bracket.rounds, nextRound] };
}

export function advancePlayoffSeries({
  bracket,
  seriesId,
  winnerTeamId,
}: {
  bracket: PlayoffBracket;
  seriesId: string;
  winnerTeamId: string;
}): PlayoffBracket {
  const targetSeries = bracket.rounds
    .flatMap(round => round.series)
    .find(series => series.id === seriesId);
  if (!targetSeries) throw new Error('Playoff series not found.');
  if (![targetSeries.homeTeamId, targetSeries.awayTeamId].includes(winnerTeamId)) {
    throw new Error('Winner must be one of the teams in the series.');
  }
  const rounds = bracket.rounds.map(round => ({
    ...round,
    series: round.series.map(series => (
      series.id === seriesId ? { ...series, winnerTeamId } : series
    )),
  }));
  return appendNextRound({ ...bracket, rounds });
}

export function syncPlayoffSeriesFromGames({
  bracket,
  games,
}: {
  bracket: PlayoffBracket;
  games: Array<Partial<PlayoffGame> & { id?: string; winnerTeamId?: string | null; status?: string }>;
}): PlayoffBracket {
  const gameById = new Map((games || []).map(game => [game.id, game]));
  const rounds = bracket.rounds.map(round => ({
    ...round,
    series: round.series.map((series) => {
      if (series.winnerTeamId) return series;
      const wins = new Map<string, number>();
      series.games.forEach((game) => {
        const source = gameById.get(game.id) || game;
        if (source.status !== 'final' || !source.winnerTeamId) return;
        wins.set(source.winnerTeamId, (wins.get(source.winnerTeamId) || 0) + 1);
      });
      const winningEntry = [...wins.entries()].find(([, winCount]) => winCount >= 4);
      return winningEntry ? { ...series, winnerTeamId: winningEntry[0] } : series;
    }),
  }));
  return appendNextRound({ ...bracket, rounds });
}
