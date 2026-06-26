import { normalizeScheduleKey } from './scheduleView';

export type LiveCourtEvent = {
  x?: number | null;
  y?: number | null;
  actingTeamId?: string | null;
};

export type LiveCourtPlayer = {
  id: string;
  side: 'home' | 'away';
  label: string;
  x: number;
  y: number;
  active: boolean;
};

export type LiveCourtState = {
  players: LiveCourtPlayer[];
  ball: {
    x: number;
    y: number;
    side: 'home' | 'away' | 'neutral';
  };
};

const OFFENSE_OFFSETS = [
  { x: 0, y: 0 },
  { x: -18, y: -18 },
  { x: -21, y: 17 },
  { x: 16, y: -16 },
  { x: 19, y: 18 },
];

const DEFENSE_OFFSETS = [
  { x: -6, y: -4 },
  { x: -24, y: -22 },
  { x: -27, y: 22 },
  { x: 18, y: -22 },
  { x: 22, y: 24 },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sideForEvent(event: LiveCourtEvent | null | undefined, homeTeamId: string, awayTeamId: string) {
  const acting = normalizeScheduleKey(event?.actingTeamId || '');
  if (acting && normalizeScheduleKey(homeTeamId) === acting) return 'home' as const;
  if (acting && normalizeScheduleKey(awayTeamId) === acting) return 'away' as const;
  return 'neutral' as const;
}

function playersForSide({
  side,
  label,
  offense,
  eventX,
  eventY,
}: {
  side: 'home' | 'away';
  label: string;
  offense: boolean;
  eventX: number;
  eventY: number;
}) {
  const baseX = offense ? eventX : 100 - eventX;
  const baseY = offense ? eventY : 100 - eventY;
  const offsets = offense ? OFFENSE_OFFSETS : DEFENSE_OFFSETS;

  return offsets.map((offset, index) => ({
    id: `${side}-${index + 1}`,
    side,
    label: `${label}${index + 1}`,
    x: clamp(baseX + offset.x, 5, 95),
    y: clamp(baseY + offset.y, 8, 92),
    active: offense && index === 0,
  }));
}

export function buildLiveCourtState({
  event,
  homeTeamId,
  awayTeamId,
  homeAbbr,
  awayAbbr,
}: {
  event?: LiveCourtEvent | null;
  homeTeamId: string;
  awayTeamId: string;
  homeAbbr: string;
  awayAbbr: string;
}): LiveCourtState {
  const eventX = clamp(Number(event?.x ?? 50), 5, 95);
  const eventY = clamp(Number(event?.y ?? 50), 8, 92);
  const eventSide = sideForEvent(event, homeTeamId, awayTeamId);
  const homeOnBall = eventSide === 'home' || eventSide === 'neutral';
  const awayOnBall = eventSide === 'away';

  return {
    players: [
      ...playersForSide({
        side: 'away',
        label: awayAbbr || 'A',
        offense: awayOnBall,
        eventX,
        eventY,
      }),
      ...playersForSide({
        side: 'home',
        label: homeAbbr || 'H',
        offense: homeOnBall,
        eventX,
        eventY,
      }),
    ],
    ball: {
      x: eventX,
      y: eventY,
      side: eventSide,
    },
  };
}
