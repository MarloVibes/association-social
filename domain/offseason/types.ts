export type OffseasonStage =
  | 'season_end'
  | 'lottery_and_draft_order'
  | 'player_progression'
  | 'team_options'
  | 're_signing'
  | 'free_agency'
  | 'draft_class_review'
  | 'live_draft'
  | 'expansion'
  | 'roster_cuts'
  | 'ready_for_season'
  | 'regular_season';

export type DraftStatus =
  | 'none'
  | 'review'
  | 'published'
  | 'live'
  | 'complete';

export type OffseasonState = {
  stage: OffseasonStage;
  seasonYear: number;
  stageStartedAt: unknown;
  completedTeamIds: string[];
  draftTimerSeconds: number;
  draftStatus: DraftStatus;
  version: number;
};
