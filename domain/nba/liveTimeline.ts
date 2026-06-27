export type LiveTimelinePlayer = {
  playerId: string;
  name: string;
  points?: number;
  rebounds?: number;
  assists?: number;
  steals?: number;
  blocks?: number;
  turnovers?: number;
  fouls?: number;
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
  eventType: 'score' | 'assist' | 'steal' | 'block' | 'turnover' | 'rebound' | 'foul' | 'run' | 'momentum' | 'period_end' | 'final_buzzer';
  actingTeamId: string | null;
  text: string;
  x: number;
  y: number;
  momentum: number;
  tags: string[];
  playerId?: string;
  playerName?: string;
  points?: number;
  statDelta?: Partial<Record<'points' | 'rebounds' | 'assists' | 'steals' | 'blocks' | 'turnovers' | 'fouls', number>>;
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
  player?: LiveTimelinePlayer;
};

type PendingAction = {
  side: ScoringSide;
  eventType: Exclude<LiveTimelineEvent['eventType'], 'score' | 'run' | 'momentum' | 'period_end' | 'final_buzzer'>;
  player: LiveTimelinePlayer;
  statKey: keyof NonNullable<LiveTimelineEvent['statDelta']>;
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
  const scoreQueues = {
    home: buildScoreQueue(input.homePlayers, input.homeScore, `${input.seed}:home-score`),
    away: buildScoreQueue(input.awayPlayers, input.awayScore, `${input.seed}:away-score`),
  };
  const actionsByPeriod = buildActionsByPeriod(input, periods);

  periods.forEach(period => {
    const periodSeconds = period.period > 4 ? OVERTIME_PERIOD_SECONDS : REGULATION_PERIOD_SECONDS;
    const scores = buildPeriodScores(input, period, scoreQueues);
    const actions = actionsByPeriod.get(period.period) || [];
    const periodEvents = [
      ...scores.map((score, index) => ({ kind: 'score' as const, item: score, order: index })),
      ...actions.map((action, index) => ({ kind: 'action' as const, item: action, order: scores.length + index })),
    ].sort((left, right) => left.order - right.order);

    periodEvents.forEach((pending, index) => {
      const clockSeconds = clockForScore(periodSeconds, periodEvents.length, index);
      if (pending.kind === 'score') {
        const score = pending.item;
        if (score.side === 'home') {
          homeScore += score.points;
        } else {
          awayScore += score.points;
        }

        const player = score.player || selectPlayer(score.side === 'home' ? input.homePlayers : input.awayPlayers, score.order);
        const actingTeamId = score.side === 'home' ? input.homeTeamId : input.awayTeamId;

        events.push({
          id: `${input.gameId}-${period.period}-${index}`,
          period: period.period,
          periodLabel: period.label,
          clockSeconds,
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
          statDelta: { points: score.points },
        });
      } else {
        const action = pending.item;
        const actingTeamId = action.side === 'home' ? input.homeTeamId : input.awayTeamId;
        events.push({
          id: `${input.gameId}-${period.period}-${index}`,
          period: period.period,
          periodLabel: period.label,
          clockSeconds,
          elapsedMs: events.length * REVEAL_INTERVAL_MS,
          homeScore,
          awayScore,
          eventType: action.eventType,
          actingTeamId,
          text: actionText(action),
          x: eventCoordinate(input, period.period, index, 'x'),
          y: eventCoordinate(input, period.period, index, 'y'),
          momentum: homeScore - awayScore,
          tags: [action.eventType, period.label.toLowerCase()],
          playerId: action.player.playerId,
          playerName: action.player.name,
          statDelta: { [action.statKey]: 1 },
        });
      }
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

export function livePlayerStatsAt(timeline: LiveTimeline, elapsedMs: number) {
  const players = new Map<string, {
    playerId: string;
    name: string;
    teamId: string;
    points: number;
    rebounds: number;
    assists: number;
    steals: number;
    blocks: number;
    turnovers: number;
    fouls: number;
  }>();

  timeline.events
    .filter(event => event.elapsedMs <= elapsedMs && event.playerId && event.playerName && event.statDelta)
    .forEach((event) => {
      const playerId = event.playerId as string;
      const row = players.get(playerId) || {
        playerId,
        name: event.playerName as string,
        teamId: event.actingTeamId || '',
        points: 0,
        rebounds: 0,
        assists: 0,
        steals: 0,
        blocks: 0,
        turnovers: 0,
        fouls: 0,
      };
      Object.entries(event.statDelta || {}).forEach(([key, value]) => {
        const statKey = key as keyof NonNullable<LiveTimelineEvent['statDelta']>;
        row[statKey] += Number(value || 0);
      });
      players.set(playerId, row);
    });

  return [...players.values()].sort((left, right) => (
    right.points - left.points
    || right.assists - left.assists
    || right.rebounds - left.rebounds
    || left.name.localeCompare(right.name)
  ));
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

function buildPeriodScores(
  input: LiveTimelineInput,
  period: LiveTimelinePeriod,
  queues: Record<ScoringSide, PendingScore[]>,
): PendingScore[] {
  const homeScores = consumeScoreQueue(queues.home, period.home, 'home');
  const awayScores = consumeScoreQueue(queues.away, period.away, 'away');
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

function buildScoreQueue(players: LiveTimelinePlayer[], teamScore: number, seed: string): PendingScore[] {
  const chunks = players.flatMap((player, playerIndex) => (
    scoringChunks(numberFrom(player.points)).map((points, scoreIndex) => ({
      side: 'home' as ScoringSide,
      points,
      order: scoreIndex * 100 + playerIndex + (hashString(`${seed}:${player.playerId}:${scoreIndex}`) % 17),
      player,
    }))
  )).sort((left, right) => left.order - right.order);

  const total = chunks.reduce((sum, item) => sum + item.points, 0);
  if (chunks.length === 0 || total !== teamScore) {
    return scoringChunks(teamScore).map((points, index) => ({ side: 'home' as ScoringSide, points, order: index }));
  }
  return chunks;
}

function consumeScoreQueue(queue: PendingScore[], targetTotal: number, side: ScoringSide): PendingScore[] {
  const consumed: PendingScore[] = [];
  let remaining = targetTotal;
  while (remaining > 0 && queue.length > 0) {
    const next = queue.shift() as PendingScore;
    if (next.points <= remaining) {
      consumed.push({ ...next, side });
      remaining -= next.points;
    } else {
      consumed.push({ ...next, side, points: remaining });
      queue.unshift({ ...next, points: next.points - remaining });
      remaining = 0;
    }
  }
  if (remaining > 0) {
    consumed.push(...scoringChunks(remaining).map((points, index) => ({ side, points, order: consumed.length + index })));
  }
  return consumed;
}

function buildActionsByPeriod(input: LiveTimelineInput, periods: LiveTimelinePeriod[]) {
  const actions = new Map<number, PendingAction[]>();
  const specs = [
    { stat: 'assists', eventType: 'assist', statKey: 'assists' },
    { stat: 'steals', eventType: 'steal', statKey: 'steals' },
    { stat: 'blocks', eventType: 'block', statKey: 'blocks' },
    { stat: 'rebounds', eventType: 'rebound', statKey: 'rebounds' },
    { stat: 'turnovers', eventType: 'turnover', statKey: 'turnovers' },
    { stat: 'fouls', eventType: 'foul', statKey: 'fouls' },
  ] as const;
  const periodIds = periods.map(period => period.period);
  if (periodIds.length === 0) return actions;

  ([
    { side: 'home' as const, players: input.homePlayers },
    { side: 'away' as const, players: input.awayPlayers },
  ]).forEach(({ side, players }) => {
    players.forEach((player) => {
      specs.forEach((spec) => {
        const count = Math.max(0, Math.floor(numberFrom(player[spec.stat])));
        for (let index = 0; index < count; index += 1) {
          const period = periodIds[hashString(`${input.seed}:${player.playerId}:${spec.stat}:${index}`) % periodIds.length];
          const rows = actions.get(period) || [];
          rows.push({
            side,
            eventType: spec.eventType,
            player,
            statKey: spec.statKey,
            order: hashString(`${input.seed}:${period}:${player.playerId}:${spec.stat}:${index}`),
          });
          actions.set(period, rows);
        }
      });
    });
  });

  actions.forEach((rows, period) => {
    actions.set(period, rows.sort((left, right) => left.order - right.order));
  });
  return actions;
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

function numberFrom(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function scoreText(player: LiveTimelinePlayer | undefined, actingTeamId: string, points: number): string {
  const scorer = player?.name ?? actingTeamId;
  return `${scorer} scores ${points}`;
}

function actionText(action: PendingAction): string {
  switch (action.eventType) {
    case 'assist': return `${action.player.name} records an assist`;
    case 'steal': return `${action.player.name} steals it`;
    case 'block': return `${action.player.name} blocks the shot`;
    case 'rebound': return `${action.player.name} grabs a rebound`;
    case 'turnover': return `${action.player.name} turns it over`;
    case 'foul': return `${action.player.name} commits a foul`;
    default: return `${action.player.name} makes a play`;
  }
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
