import type { OffseasonStage } from './types';

const NBA_STAGES: readonly OffseasonStage[] = Object.freeze([
  'season_end',
  'lottery_and_draft_order',
  'player_progression',
  'team_options',
  're_signing',
  'free_agency',
  'draft_class_review',
  'live_draft',
  'expansion',
  'roster_cuts',
  'ready_for_season',
  'regular_season',
]);

const MLB_NFL_STAGES: readonly OffseasonStage[] = Object.freeze([
  'season_end',
  're_signing',
  'free_agency',
  'draft_class_review',
  'live_draft',
  'roster_cuts',
  'ready_for_season',
  'regular_season',
]);

function usesMlbNflSequence(sport?: string | null): boolean {
  return sport === 'mlb' || sport === 'madden' || sport === 'nfl';
}

export function getOffseasonStageSequence(
  sport?: string | null,
  expansionEnabled = false,
): readonly OffseasonStage[] {
  if (usesMlbNflSequence(sport)) {
    return MLB_NFL_STAGES;
  }

  return expansionEnabled
    ? NBA_STAGES
    : NBA_STAGES.filter(stage => stage !== 'expansion');
}

export function nextOffseasonStage(
  sport: string | null | undefined,
  currentStage: OffseasonStage,
  expansionEnabled = false,
): OffseasonStage {
  if (currentStage === 'regular_season') {
    return 'regular_season';
  }

  if (currentStage === 'expansion' && !expansionEnabled) {
    return 'roster_cuts';
  }

  const stages = getOffseasonStageSequence(sport, expansionEnabled);
  const currentIndex = stages.indexOf(currentStage);

  return stages[currentIndex + 1] ?? currentStage;
}
