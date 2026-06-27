import type { NbaScheduleGame } from './schedule';
import type { PlayoffFormat } from './playoffs';
import type { StandingsRow } from './standings';

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

const FORMAT_LIMITS: Record<PlayoffFormat, { playoff: number; playInStart: number; playInEnd: number; bubbleCount: number }> = {
  short_8: { playoff: 8, playInStart: 0, playInEnd: 0, bubbleCount: 4 },
  traditional_16: { playoff: 16, playInStart: 0, playInEnd: 0, bubbleCount: 4 },
  play_in_16: { playoff: 12, playInStart: 13, playInEnd: 20, bubbleCount: 4 },
};

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
