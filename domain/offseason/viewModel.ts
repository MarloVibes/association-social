import { getSportRules } from '@/domain/sports/rules';
import type { OffseasonStage, OffseasonState } from './types';

type LeagueSeed = {
  sport?: string | null;
  currentYear?: number | null;
  draftTimerSeconds?: number | null;
};

type TeamSummary = {
  id: string;
  name?: string | null;
  abbreviation?: string | null;
  gmId?: string | null;
};

const TEAM_ACTION_STAGES = new Set<OffseasonStage>([
  'team_options',
  're_signing',
  'free_agency',
  'roster_cuts',
  'ready_for_season',
]);

const STAGE_LABELS: Record<OffseasonStage, string> = {
  season_end: 'Season Complete',
  lottery_and_draft_order: 'Lottery & Draft Order',
  player_progression: 'Player Progression',
  team_options: 'Team Options',
  re_signing: 'Re-Signing',
  free_agency: 'Free Agency',
  draft_class_review: 'Draft Class Review',
  live_draft: 'Live Draft',
  expansion: 'Expansion',
  roster_cuts: 'Roster Cuts',
  ready_for_season: 'Ready for Season',
  regular_season: 'Regular Season',
};

export function buildInitialOffseasonState(league: LeagueSeed): OffseasonState {
  const rules = getSportRules(league.sport || 'nba');
  return {
    stage: 'season_end',
    seasonYear: typeof league.currentYear === 'number'
      ? league.currentYear
      : rules.initialSeasonYear,
    stageStartedAt: null,
    completedTeamIds: [],
    draftTimerSeconds: typeof league.draftTimerSeconds === 'number'
      ? league.draftTimerSeconds
      : rules.defaultDraftTimerSeconds,
    draftStatus: 'none',
    version: 0,
  };
}

export function getOffseasonStageLabel(stage: OffseasonStage): string {
  return STAGE_LABELS[stage];
}

export function isOffseasonTeamActionStage(stage: OffseasonStage): boolean {
  return TEAM_ACTION_STAGES.has(stage);
}

export function getUnresolvedOffseasonTeams(
  teams: TeamSummary[],
  completedTeamIds: string[],
): { id: string; label: string }[] {
  const completed = new Set(completedTeamIds.map(String));
  return teams
    .filter(team => team.gmId && !completed.has(String(team.id)))
    .map(team => ({
      id: String(team.id),
      label: team.name || team.abbreviation || 'Claimed team',
    }));
}
