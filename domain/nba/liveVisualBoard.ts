import { buildLiveCourtState, type LiveCourtPlayer } from './liveCourt';
import type { LiveTimelineEvent } from './liveTimeline';
import { normalizeScheduleKey } from './scheduleView';

export type LiveVisualScorePop = {
  id: string;
  value: '+2' | '+3';
  x: number;
  y: number;
  side: 'home' | 'away';
};

export type BasketballMotionCue = {
  id: string;
  kind: 'flow' | 'three' | 'deep_three' | 'rim_finish' | 'rebound' | 'block' | 'turnover' | 'free_throw' | 'final';
  side: 'home' | 'away' | 'neutral';
  shotValue?: 1 | 2 | 3;
  x?: number;
  y?: number;
};

export type LiveVisualBoardState = {
  players: LiveCourtPlayer[];
  ball: {
    x: number;
    y: number;
    side: 'home' | 'away' | 'neutral';
  };
  scorePop: LiveVisualScorePop | null;
  eventLabel: string;
  coaching: {
    home: string;
    away: string;
  };
  motionCue: BasketballMotionCue;
  fixedBasketLabels: [];
};

export type BasketballMotionFrame = {
  players: LiveCourtPlayer[];
  ball: {
    x: number;
    y: number;
    side: 'home' | 'away' | 'neutral';
    detached?: boolean;
  };
  direction: 'right' | 'left';
  cueKind: BasketballMotionCue['kind'];
  rimAction?: 'block' | 'rebound' | 'finish';
  frozen?: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeProgress(value: number) {
  const progress = Number.isFinite(value) ? value : 0;
  return ((progress % 1) + 1) % 1;
}

function lerp(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}

function smoothStep(value: number) {
  return value * value * (3 - 2 * value);
}

function motionPlayer({
  id,
  label,
  side,
  x,
  y,
  active = false,
}: {
  id: string;
  label: string;
  side: 'home' | 'away';
  x: number;
  y: number;
  active?: boolean;
}): LiveCourtPlayer {
  return {
    id,
    label,
    side,
    x: clamp(x, 5, 95),
    y: clamp(y, 8, 92),
    active,
  };
}

function basketXForOffense(side: 'home' | 'away') {
  return side === 'home' ? 86.85 : 7.15;
}

function basketXForDefense(side: 'home' | 'away') {
  return side === 'home' ? 7.15 : 86.85;
}

function directionForOffense(side: 'home' | 'away'): 'right' | 'left' {
  return side === 'home' ? 'right' : 'left';
}

function genericMotionFrame(progress: number): BasketballMotionFrame {
  const cycleProgress = normalizeProgress(progress);
  const possessionSide: 'home' | 'away' = cycleProgress < 0.5 ? 'home' : 'away';
  const defenseSide: 'home' | 'away' = possessionSide === 'home' ? 'away' : 'home';
  const direction: 'right' | 'left' = possessionSide === 'home' ? 'right' : 'left';
  const directionScalar = direction === 'right' ? 1 : -1;
  const legProgress = cycleProgress < 0.5 ? cycleProgress * 2 : (cycleProgress - 0.5) * 2;
  const eased = smoothStep(legProgress);
  const ballX = direction === 'right' ? lerp(16, 86, eased) : lerp(86, 16, eased);
  const ballY = clamp(50 + Math.sin(legProgress * Math.PI * 2) * 9, 10, 90);
  const sideDrift = Math.sin(legProgress * Math.PI) * 5;
  const offensePrefix = possessionSide === 'home' ? 'H' : 'A';
  const defensePrefix = defenseSide === 'home' ? 'H' : 'A';

  const offense = [
    motionPlayer({ id: `${possessionSide}-handler`, label: `${offensePrefix}1`, side: possessionSide, x: ballX - 3 * directionScalar, y: ballY, active: true }),
    motionPlayer({ id: `${possessionSide}-wing-top`, label: `${offensePrefix}2`, side: possessionSide, x: ballX - 13 * directionScalar, y: 30 + sideDrift }),
    motionPlayer({ id: `${possessionSide}-slot`, label: `${offensePrefix}3`, side: possessionSide, x: ballX - 8 * directionScalar, y: 69 - sideDrift }),
    motionPlayer({ id: `${possessionSide}-corner`, label: `${offensePrefix}4`, side: possessionSide, x: ballX + 10 * directionScalar, y: 18 + sideDrift * 0.45 }),
    motionPlayer({ id: `${possessionSide}-big`, label: `${offensePrefix}5`, side: possessionSide, x: ballX + 9 * directionScalar, y: 78 - sideDrift * 0.35 }),
  ];

  const defense = offense.map((player, index) => motionPlayer({
    id: `${defenseSide}-def-${index + 1}`,
    label: `${defensePrefix}${index + 1}`,
    side: defenseSide,
    x: player.x + 4 * directionScalar,
    y: player.y + (index % 2 === 0 ? -3 : 3),
  }));

  return {
    players: [...offense, ...defense],
    ball: {
      x: clamp(ballX, 8, 92),
      y: ballY,
      side: possessionSide,
    },
    direction,
    cueKind: 'flow',
  };
}

function eventMotionFrame(progress: number, cue: BasketballMotionCue): BasketballMotionFrame {
  if (cue.kind === 'final') {
    return {
      ...genericMotionFrame(0.48),
      cueKind: 'final',
      frozen: true,
    };
  }
  if (cue.side === 'neutral') return genericMotionFrame(progress);

  const phase = smoothStep(normalizeProgress(progress));
  const direction = directionForOffense(cue.side);
  const scalar = direction === 'right' ? 1 : -1;
  const rimX = cue.kind === 'block' || cue.kind === 'rebound'
    ? basketXForDefense(cue.side)
    : basketXForOffense(cue.side);
  const rimY = 50;

  if (cue.kind === 'block' || cue.kind === 'rebound') {
    const ballX = cue.kind === 'block'
      ? rimX - scalar * Math.sin(phase * Math.PI) * 7
      : rimX - scalar * (6 - phase * 4);
    const ballY = cue.kind === 'block'
      ? rimY - 8 + phase * 8
      : rimY + Math.sin(phase * Math.PI) * 7;
    const offenseSide: 'home' | 'away' = cue.side === 'home' ? 'away' : 'home';
    const defensePrefix = cue.side === 'home' ? 'H' : 'A';
    const offensePrefix = offenseSide === 'home' ? 'H' : 'A';
    const players = [
      motionPlayer({ id: `${cue.side}-rim-def`, label: `${defensePrefix}5`, side: cue.side, x: rimX + scalar * 2, y: 49, active: cue.kind === 'block' }),
      motionPlayer({ id: `${cue.side}-glass`, label: `${defensePrefix}4`, side: cue.side, x: rimX + scalar * 7, y: 61, active: cue.kind === 'rebound' }),
      motionPlayer({ id: `${cue.side}-help`, label: `${defensePrefix}3`, side: cue.side, x: rimX + scalar * 13, y: 34 }),
      motionPlayer({ id: `${cue.side}-guard`, label: `${defensePrefix}1`, side: cue.side, x: rimX + scalar * 23, y: 23 }),
      motionPlayer({ id: `${cue.side}-wing`, label: `${defensePrefix}2`, side: cue.side, x: rimX + scalar * 24, y: 76 }),
      motionPlayer({ id: `${offenseSide}-driver`, label: `${offensePrefix}1`, side: offenseSide, x: rimX - scalar * 4, y: 50, active: cue.kind !== 'block' }),
      motionPlayer({ id: `${offenseSide}-corner`, label: `${offensePrefix}2`, side: offenseSide, x: rimX - scalar * 19, y: 18 }),
      motionPlayer({ id: `${offenseSide}-slot`, label: `${offensePrefix}3`, side: offenseSide, x: rimX - scalar * 18, y: 78 }),
      motionPlayer({ id: `${offenseSide}-trail`, label: `${offensePrefix}4`, side: offenseSide, x: rimX - scalar * 29, y: 38 }),
      motionPlayer({ id: `${offenseSide}-crash`, label: `${offensePrefix}5`, side: offenseSide, x: rimX - scalar * 8, y: 62 }),
    ];
    return {
      players,
      ball: {
        x: clamp(ballX, 8, 92),
        y: clamp(ballY, 10, 90),
        side: cue.side,
        detached: true,
      },
      direction,
      cueKind: cue.kind,
      rimAction: cue.kind,
    };
  }

  if (cue.kind === 'three' || cue.kind === 'deep_three' || cue.kind === 'rim_finish' || cue.kind === 'free_throw') {
    const deep = cue.kind === 'deep_three';
    const rimFinish = cue.kind === 'rim_finish';
    const startX = rimFinish ? rimX - scalar * 18 : rimX - scalar * (deep ? 39 : 31);
    const startY = cue.y ? clamp(cue.y, 19, 81) : rimFinish ? 58 : 34;
    const releasePhase = rimFinish ? clamp((phase - 0.18) / 0.72, 0, 1) : clamp((phase - 0.08) / 0.82, 0, 1);
    const ballX = lerp(startX, rimX, releasePhase);
    const arcLift = Math.sin(releasePhase * Math.PI) * (rimFinish ? 5 : deep ? 13 : 10);
    const ballY = lerp(startY, rimY, releasePhase) - arcLift;
    const defenseSide: 'home' | 'away' = cue.side === 'home' ? 'away' : 'home';
    const offensePrefix = cue.side === 'home' ? 'H' : 'A';
    const defensePrefix = defenseSide === 'home' ? 'H' : 'A';
    const players = [
      motionPlayer({ id: `${cue.side}-shooter`, label: `${offensePrefix}${deep ? '3' : rimFinish ? '1' : '2'}`, side: cue.side, x: startX, y: startY, active: true }),
      motionPlayer({ id: `${cue.side}-corner`, label: `${offensePrefix}2`, side: cue.side, x: rimX - scalar * 15, y: 19 }),
      motionPlayer({ id: `${cue.side}-slot`, label: `${offensePrefix}3`, side: cue.side, x: rimX - scalar * 19, y: 78 }),
      motionPlayer({ id: `${cue.side}-big`, label: `${offensePrefix}5`, side: cue.side, x: rimX - scalar * 7, y: 58 }),
      motionPlayer({ id: `${cue.side}-trail`, label: `${offensePrefix}4`, side: cue.side, x: rimX - scalar * 29, y: 50 }),
      motionPlayer({ id: `${defenseSide}-contest`, label: `${defensePrefix}1`, side: defenseSide, x: startX + scalar * 4, y: startY + 2 }),
      motionPlayer({ id: `${defenseSide}-rim`, label: `${defensePrefix}5`, side: defenseSide, x: rimX - scalar * 3, y: 50 }),
      motionPlayer({ id: `${defenseSide}-help`, label: `${defensePrefix}4`, side: defenseSide, x: rimX - scalar * 12, y: 64 }),
      motionPlayer({ id: `${defenseSide}-wing`, label: `${defensePrefix}3`, side: defenseSide, x: rimX - scalar * 21, y: 25 }),
      motionPlayer({ id: `${defenseSide}-low`, label: `${defensePrefix}2`, side: defenseSide, x: rimX - scalar * 22, y: 80 }),
    ];
    return {
      players,
      ball: {
        x: clamp(ballX, 8, 92),
        y: clamp(ballY, 10, 90),
        side: cue.side,
        detached: releasePhase > 0.08,
      },
      direction,
      cueKind: cue.kind,
      rimAction: rimFinish ? 'finish' : undefined,
    };
  }

  return genericMotionFrame(progress);
}

export function buildBasketballMotionFrame({ progress, cue }: { progress: number; cue?: BasketballMotionCue | null }): BasketballMotionFrame {
  return cue && cue.kind !== 'flow' ? eventMotionFrame(progress, cue) : genericMotionFrame(progress);
}

function sideForTeam(teamId: string | null | undefined, homeTeamId: string, awayTeamId: string): 'home' | 'away' | null {
  const key = normalizeScheduleKey(teamId || '');
  if (!key) return null;
  if (key === normalizeScheduleKey(homeTeamId)) return 'home';
  if (key === normalizeScheduleKey(awayTeamId)) return 'away';
  return null;
}

function motionCueForEvent(event: LiveTimelineEvent | null | undefined, homeTeamId: string, awayTeamId: string): BasketballMotionCue {
  if (!event) return { id: 'loading', kind: 'flow', side: 'neutral' };
  if (event.eventType === 'final_buzzer') return { id: event.id, kind: 'final', side: 'neutral' };
  const text = String(event.text || '').toLowerCase();
  const side = sideForTeam(event.actingTeamId, homeTeamId, awayTeamId) || 'neutral';
  const points = Number(event.points || event.statDelta?.points || 0);
  const hasThreeText = /\b(3pt|3-point|3 pointer|three|3-pointer)\b/.test(text);
  const isDeep = /\b(deep|logo|curry|range)\b/.test(text);
  const isRimFinish = /\b(dunk|poster|layup|driving|at the rim)\b/.test(text);
  if (event.eventType === 'block' || text.includes('block')) {
    return { id: event.id, kind: 'block', side, x: event.x, y: event.y };
  }
  if (text.includes('rebound') || event.statDelta?.rebounds) {
    return { id: event.id, kind: 'rebound', side, x: event.x, y: event.y };
  }
  if (event.eventType === 'free_throw_trip') {
    return { id: event.id, kind: 'free_throw', side, shotValue: 1, x: event.x, y: event.y };
  }
  if (event.eventType === 'score' || event.eventType === 'miss') {
    if (points === 3 || hasThreeText) {
      return { id: event.id, kind: isDeep ? 'deep_three' : 'three', side, shotValue: 3, x: event.x, y: event.y };
    }
    if (isRimFinish) {
      return { id: event.id, kind: 'rim_finish', side, shotValue: 2, x: event.x, y: event.y };
    }
    return { id: event.id, kind: 'rim_finish', side, shotValue: points === 1 ? 1 : 2, x: event.x, y: event.y };
  }
  if (event.eventType === 'turnover') {
    return { id: event.id, kind: 'turnover', side, x: event.x, y: event.y };
  }
  return { id: event.id, kind: 'flow', side, x: event.x, y: event.y };
}

function scorePopForEvent(event: LiveTimelineEvent | null | undefined, homeTeamId: string, awayTeamId: string): LiveVisualScorePop | null {
  if (!event || event.eventType !== 'score') return null;
  const points = Number(event.points || event.statDelta?.points || 0);
  if (points !== 2 && points !== 3) return null;
  const side = sideForTeam(event.actingTeamId, homeTeamId, awayTeamId);
  if (!side) return null;
  return {
    id: event.id,
    value: points === 3 ? '+3' : '+2',
    x: clamp(Number(event.x || 50), 5, 95),
    y: clamp(Number(event.y || 50), 8, 92),
    side,
  };
}

export function buildLiveVisualBoardState({
  event,
  homeTeamId,
  awayTeamId,
  homeAbbr,
  awayAbbr,
  homeCoachingLabel = 'Balanced',
  awayCoachingLabel = 'Balanced',
}: {
  event?: LiveTimelineEvent | null;
  homeTeamId: string;
  awayTeamId: string;
  homeAbbr: string;
  awayAbbr: string;
  homeCoachingLabel?: string;
  awayCoachingLabel?: string;
}): LiveVisualBoardState {
  const court = buildLiveCourtState({ event, homeTeamId, awayTeamId, homeAbbr, awayAbbr });
  return {
    ...court,
    scorePop: scorePopForEvent(event, homeTeamId, awayTeamId),
    eventLabel: event?.text || 'Live timeline is loading.',
    coaching: {
      home: homeCoachingLabel,
      away: awayCoachingLabel,
    },
    motionCue: motionCueForEvent(event, homeTeamId, awayTeamId),
    fixedBasketLabels: [],
  };
}
