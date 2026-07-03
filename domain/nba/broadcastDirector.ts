import type { LiveTimelineEvent } from './liveTimeline';
import { normalizeScheduleKey } from './scheduleView';

export type BroadcastSceneType = 'flow' | 'three' | 'deep_three' | 'dunk' | 'rim_finish' | 'miss' | 'rebound' | 'block' | 'steal' | 'turnover' | 'free_throw' | 'postgame';
export type CrowdEnergy = 'idle' | 'swell' | 'eruption' | 'dip' | 'quiet';
export type PostgameStage = 'none' | 'buzzer' | 'celebration' | 'sportsmanship' | 'locker_exit' | 'settled';

export type CoachingSpacingHint = {
  width: 'tight' | 'balanced' | 'wide';
  tempo: 'slow' | 'balanced' | 'fast';
  paintTouch: 'low' | 'balanced' | 'high';
  defenseDepth: 'normal' | 'high';
};

export type BroadcastScene = {
  id: string;
  type: BroadcastSceneType;
  side: 'home' | 'away' | 'neutral';
  shotValue?: 1 | 2 | 3;
  jumbotronCue: string;
  crowdEnergy: CrowdEnergy;
  postgameStage: PostgameStage;
  caption: string;
  x: number;
  y: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function sideForTeam(teamId: string | null | undefined, homeTeamId: string, awayTeamId: string): 'home' | 'away' | 'neutral' {
  const key = normalizeScheduleKey(teamId || '');
  if (key && key === normalizeScheduleKey(homeTeamId)) return 'home';
  if (key && key === normalizeScheduleKey(awayTeamId)) return 'away';
  return 'neutral';
}

export function spacingForCoachingStyle(label: string | null | undefined): CoachingSpacingHint {
  const value = String(label || '').toLowerCase();
  if (value.includes('pace') || value.includes('seven') || value.includes('shoot')) {
    return { width: 'wide', tempo: 'fast', paintTouch: 'low', defenseDepth: 'normal' };
  }
  if (value.includes('grit') || value.includes('post') || value.includes('paint') || value.includes('triangle')) {
    return { width: 'tight', tempo: 'slow', paintTouch: 'high', defenseDepth: 'normal' };
  }
  if (value.includes('blitz') || value.includes('pressure') || value.includes('zone') || value.includes('man')) {
    return { width: 'balanced', tempo: 'balanced', paintTouch: 'balanced', defenseDepth: 'high' };
  }
  return { width: 'balanced', tempo: 'balanced', paintTouch: 'balanced', defenseDepth: 'normal' };
}

export function buildPostgameStage({ elapsedAfterFinalMs }: { elapsedAfterFinalMs: number }): PostgameStage {
  const elapsed = Math.max(0, elapsedAfterFinalMs);
  if (elapsed < 2_000) return 'buzzer';
  if (elapsed < 7_000) return 'celebration';
  if (elapsed < 11_000) return 'sportsmanship';
  if (elapsed < 17_000) return 'locker_exit';
  return 'settled';
}

function sceneTypeFor(event: LiveTimelineEvent | null | undefined): Pick<BroadcastScene, 'type' | 'jumbotronCue' | 'crowdEnergy' | 'shotValue'> {
  if (!event) return { type: 'flow', jumbotronCue: 'LIVE', crowdEnergy: 'idle' };
  if (event.eventType === 'final_buzzer') return { type: 'postgame', jumbotronCue: 'FINAL', crowdEnergy: 'swell' };
  const text = String(event.text || '').toLowerCase();
  const points = Number(event.points || event.statDelta?.points || 0);
  if (event.eventType === 'block' || text.includes('block')) return { type: 'block', jumbotronCue: 'BLOCK', crowdEnergy: 'swell' };
  if (event.eventType === 'steal' || text.includes('steal')) return { type: 'steal', jumbotronCue: 'STEAL', crowdEnergy: 'swell' };
  if (event.eventType === 'turnover' || text.includes('turnover')) return { type: 'turnover', jumbotronCue: 'TURNOVER', crowdEnergy: 'dip' };
  if (event.eventType === 'free_throw_trip' || text.includes('free throw')) return { type: 'free_throw', jumbotronCue: 'AT THE LINE', crowdEnergy: 'idle', shotValue: 1 };
  if (text.includes('rebound') || event.statDelta?.rebounds) return { type: 'rebound', jumbotronCue: 'REBOUND', crowdEnergy: 'swell' };
  if (event.eventType === 'miss') return { type: 'miss', jumbotronCue: 'MISS', crowdEnergy: 'quiet' };
  if (points === 3 || /\b(3pt|3-point|3 pointer|three|3-pointer)\b/.test(text)) {
    const deep = /\b(deep|logo|curry|range)\b/.test(text);
    return { type: deep ? 'deep_three' : 'three', jumbotronCue: deep ? 'DEEP THREE' : 'THREE', crowdEnergy: 'swell', shotValue: 3 };
  }
  if (text.includes('dunk') || text.includes('poster')) return { type: 'dunk', jumbotronCue: 'POSTER', crowdEnergy: 'eruption', shotValue: 2 };
  if (event.eventType === 'score') return { type: 'rim_finish', jumbotronCue: 'BUCKET', crowdEnergy: 'swell', shotValue: points === 1 ? 1 : 2 };
  return { type: 'flow', jumbotronCue: 'LIVE', crowdEnergy: 'idle' };
}

export function buildBroadcastScene({
  event,
  homeTeamId,
  awayTeamId,
  elapsedAfterFinalMs = 0,
}: {
  event?: LiveTimelineEvent | null;
  homeTeamId: string;
  awayTeamId: string;
  elapsedAfterFinalMs?: number;
}): BroadcastScene {
  const type = sceneTypeFor(event);
  return {
    id: event?.id || 'loading',
    ...type,
    side: sideForTeam(event?.actingTeamId, homeTeamId, awayTeamId),
    postgameStage: type.type === 'postgame' ? buildPostgameStage({ elapsedAfterFinalMs }) : 'none',
    caption: event?.text || 'Live replay is loading.',
    x: clamp(Number(event?.x ?? 50), 5, 95),
    y: clamp(Number(event?.y ?? 50), 8, 92),
  };
}
