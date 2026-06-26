export type LiveTimelinePlayer = {
  playerId: string;
  name: string;
  points?: number;
};

export type LiveTimelinePeriod = {
  period: number;
  label: string;
  home: number;
  away: number;
};

export type LiveTimelineEvent = {
  id: string;
  period: number;
  periodLabel: string;
  clockSeconds: number;
  elapsedMs: number;
  homeScore: number;
  awayScore: number;
  eventType: 'score' | 'turnover' | 'rebound' | 'foul' | 'run' | 'momentum' | 'period_end' | 'final_buzzer';
  actingTeamId: string | null;
  text: string;
  x: number;
  y: number;
  momentum: number;
  tags: string[];
  playerId?: string;
  playerName?: string;
  points?: number;
};

export type LiveTimelineInput = {
  gameId: string;
  seed: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  quarters: Array<{
    quarter: number;
    home: number;
    away: number;
  }>;
  homePlayers: LiveTimelinePlayer[];
  awayPlayers: LiveTimelinePlayer[];
};

export type LiveTimeline = {
  version: 1;
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  revealDurationMs: number;
  periods: LiveTimelinePeriod[];
  events: LiveTimelineEvent[];
};

type ScoringSide = 'home' | 'away';

type PendingScore = {
  side: ScoringSide;
  points: number;
  order: number;
};

const REGULATION_PERIOD_SECONDS = 720;
const OVERTIME_PERIOD_SECONDS = 300;
const REVEAL_INTERVAL_MS = 2_000;

export function periodLabel(period: number): string {
  if (period <= 4) {
    return `Q${period}`;
  }

  const overtimeNumber = period - 4;
  return overtimeNumber === 1 ? 'OT' : `${overtimeNumber}OT`;
}

export function buildLiveTimeline(input: LiveTimelineInput): LiveTimeline {
  const periods = input.quarters
    .map(period => ({
      period: period.quarter,
      label: periodLabel(period.quarter),
      home: period.home,
      away: period.away,
    }))
    .sort((a, b) => a.period - b.period);

  validateFinalScore(input, periods);

  const events: LiveTimelineEvent[] = [];
  let homeScore = 0;
  let awayScore = 0;

  periods.forEach(period => {
    const periodSeconds = period.period > 4 ? OVERTIME_PERIOD_SECONDS : REGULATION_PERIOD_SECONDS;
    const scores = buildPeriodScores(input, period);

    scores.forEach((score, index) => {
      if (score.side === 'home') {
        homeScore += score.points;
      } else {
        awayScore += score.points;
      }

      const players = score.side === 'home' ? input.homePlayers : input.awayPlayers;
      const player = selectPlayer(players, score.order);
      const actingTeamId = score.side === 'home' ? input.homeTeamId : input.awayTeamId;

      events.push({
        id: `${input.gameId}-${period.period}-${index}`,
        period: period.period,
        periodLabel: period.label,
        clockSeconds: clockForScore(periodSeconds, scores.length, index),
        elapsedMs: events.length * REVEAL_INTERVAL_MS,
        homeScore,
        awayScore,
        eventType: 'score',
        actingTeamId,
        text: scoreText(player, actingTeamId, score.points),
        x: eventCoordinate(input, period.period, index, 'x'),
        y: eventCoordinate(input, period.period, index, 'y'),
        momentum: homeScore - awayScore,
        tags: ['score', period.label.toLowerCase()],
        playerId: player?.playerId,
        playerName: player?.name,
        points: score.points,
      });
    });
  });

  events.push({
    id: `${input.gameId}-final`,
    period: periods.at(-1)?.period ?? 4,
    periodLabel: periods.at(-1)?.label ?? 'Q4',
    clockSeconds: 0,
    elapsedMs: events.length * REVEAL_INTERVAL_MS,
    homeScore: input.homeScore,
    awayScore: input.awayScore,
    eventType: 'final_buzzer',
    actingTeamId: input.homeScore === input.awayScore ? null : input.homeScore > input.awayScore ? input.homeTeamId : input.awayTeamId,
    text: `Final: ${input.awayTeamId} ${input.awayScore}, ${input.homeTeamId} ${input.homeScore}`,
    x: 50,
    y: 50,
    momentum: input.homeScore - input.awayScore,
    tags: ['final'],
  });

  return {
    version: 1,
    gameId: input.gameId,
    homeTeamId: input.homeTeamId,
    awayTeamId: input.awayTeamId,
    homeScore: input.homeScore,
    awayScore: input.awayScore,
    revealDurationMs: events.at(-1)?.elapsedMs ?? 0,
    periods,
    events,
  };
}

export function currentTimelineEvent(
  timeline: LiveTimeline,
  elapsedMs: number,
): { event: LiveTimelineEvent; index: number } | { event: null; index: -1 } {
  if (timeline.events.length === 0) {
    return {
      event: null,
      index: -1,
    };
  }

  const index = Math.max(0, timeline.events.findLastIndex(event => event.elapsedMs <= elapsedMs));

  return {
    event: timeline.events[index],
    index,
  };
}

function validateFinalScore(input: LiveTimelineInput, periods: LiveTimelinePeriod[]): void {
  const totals = periods.reduce(
    (acc, period) => ({
      home: acc.home + period.home,
      away: acc.away + period.away,
    }),
    { home: 0, away: 0 },
  );

  if (totals.home !== input.homeScore || totals.away !== input.awayScore) {
    throw new Error(
      `Live timeline score mismatch: quarter totals ${input.homeTeamId} ${totals.home}, ${input.awayTeamId} ${totals.away} do not match final score ${input.homeTeamId} ${input.homeScore}, ${input.awayTeamId} ${input.awayScore}`,
    );
  }
}

function buildPeriodScores(input: LiveTimelineInput, period: LiveTimelinePeriod): PendingScore[] {
  const homeScores = scoringChunks(period.home).map((points, index) => ({
    side: 'home' as const,
    points,
    order: index,
  }));
  const awayScores = scoringChunks(period.away).map((points, index) => ({
    side: 'away' as const,
    points,
    order: index,
  }));
  const seedOffset = hashString(`${input.seed}:${input.gameId}:${period.period}`) % 2;

  return [...homeScores, ...awayScores].sort((a, b) => {
    const orderDiff = a.order - b.order;
    if (orderDiff !== 0) {
      return orderDiff;
    }

    if (a.side === b.side) {
      return 0;
    }

    return (a.side === 'home' ? 0 : 1) === seedOffset ? -1 : 1;
  });
}

function scoringChunks(total: number): number[] {
  const chunks: number[] = [];
  let remaining = Math.max(0, total);

  while (remaining > 0) {
    const points = remaining >= 3 && remaining % 2 === 1 ? 3 : Math.min(2, remaining);
    chunks.push(points);
    remaining -= points;
  }

  return chunks;
}

function clockForScore(periodSeconds: number, scoreCount: number, index: number): number {
  const step = periodSeconds / (scoreCount + 1);
  return Math.max(1, Math.round(periodSeconds - step * (index + 1)));
}

function selectPlayer(players: LiveTimelinePlayer[], order: number): LiveTimelinePlayer | undefined {
  if (players.length === 0) {
    return undefined;
  }

  return [...players].sort((a, b) => (b.points ?? 0) - (a.points ?? 0) || a.name.localeCompare(b.name))[order % players.length];
}

function scoreText(player: LiveTimelinePlayer | undefined, actingTeamId: string, points: number): string {
  const scorer = player?.name ?? actingTeamId;
  return `${scorer} scores ${points}`;
}

function eventCoordinate(input: LiveTimelineInput, period: number, index: number, axis: 'x' | 'y'): number {
  const hash = hashString(`${input.seed}:${input.gameId}:${period}:${index}:${axis}`);
  return hash % 101;
}

function hashString(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}
