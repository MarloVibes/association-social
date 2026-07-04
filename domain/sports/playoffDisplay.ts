import type { PlayoffFormat } from '@/domain/nba/playoffs';
import type { OffseasonStage } from '@/domain/offseason/types';

type Sport = 'nba' | 'madden' | 'mlb';

export type PlayoffFormatOption = {
  value: PlayoffFormat;
  label: string;
};

const NBA_OPTIONS: PlayoffFormatOption[] = [
  { value: 'short_8', label: '8 Teams' },
  { value: 'traditional_16', label: '16 Teams' },
  { value: 'play_in_16', label: 'Play-In' },
];

const SPORT_OPTIONS: PlayoffFormatOption[] = [
  { value: 'short_8', label: '8 Teams' },
  { value: 'traditional_16', label: '16 Teams' },
];

function normalizeSport(sport?: string | null): Sport {
  if (sport === 'nfl' || sport === 'madden') return 'madden';
  if (sport === 'mlb') return 'mlb';
  return 'nba';
}

export function playoffFormatOptionsForSport(sportInput?: string | null): PlayoffFormatOption[] {
  return normalizeSport(sportInput) === 'nba' ? NBA_OPTIONS : SPORT_OPTIONS;
}

export function postseasonOffseasonWarning(sportInput?: string | null) {
  const sport = normalizeSport(sportInput);
  if (sport === 'madden') {
    return 'Starting offseason opens timed stages for recap, roster cuts, contracts, draft, free agency, and ready period. There is no going back.';
  }
  if (sport === 'mlb') {
    return 'Starting offseason opens timed stages for recap, contracts, draft, free agency, roster decisions, and ready period. There is no going back.';
  }
  return 'Starting offseason opens 10-minute stages for awards, lottery, progression, contracts, draft, free agency, and ready period. There is no going back.';
}

export function offseasonStartStageForSport(sportInput?: string | null): OffseasonStage {
  return normalizeSport(sportInput) === 'nba' ? 'awards_recap' : 'season_end';
}
