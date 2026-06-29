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

export type LiveStatKey =
  | 'points'
  | 'rebounds'
  | 'assists'
  | 'steals'
  | 'blocks'
  | 'turnovers'
  | 'fouls'
  | 'fieldGoalsMade'
  | 'fieldGoalsAttempted'
  | 'threePointersMade'
  | 'threePointersAttempted'
  | 'freeThrowsMade'
  | 'freeThrowsAttempted'
  | 'offensiveRebounds'
  | 'defensiveRebounds';

export type LiveStatDelta = {
  playerId: string;
  playerName: string;
  teamId: string;
  position?: string;
  minutes?: number;
  starter?: boolean;
  stats: Partial<Record<LiveStatKey, number>>;
};

export type LiveTimelineMatchupPlayer = {
  playerId: string;
  name: string;
  teamId: string;
  position?: string;
  skillChips?: string[];
};

export type LiveTimelineStarterMatchup = {
  position: string;
  awayPlayer: LiveTimelineMatchupPlayer;
  homePlayer: LiveTimelineMatchupPlayer;
};

export type LiveTimelineEvent = {
  id: string;
  period: number;
  periodLabel: string;
  clockSeconds: number;
  elapsedMs: number;
  homeScore: number;
  awayScore: number;
  eventType: 'score' | 'miss' | 'block' | 'turnover' | 'foul' | 'free_throw_trip' | 'timeout' | 'run' | 'momentum' | 'period_end' | 'final_buzzer';
  actingTeamId: string | null;
  text: string;
  x: number;
  y: number;
  momentum: number;
  tags: string[];
  playerId?: string;
  playerName?: string;
  points?: number;
  statDelta?: Partial<Record<LiveStatKey, number>>;
  statDeltas?: LiveStatDelta[];
  currentLineups?: {
    home?: string[];
    away?: string[];
  };
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
  version: 1 | 2;
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  revealDurationMs: number;
  speedMultiplier?: number;
  periods: LiveTimelinePeriod[];
  events: LiveTimelineEvent[];
  starterMatchups?: LiveTimelineStarterMatchup[];
  benchPreview?: {
    home?: LiveTimelineMatchupPlayer[];
    away?: LiveTimelineMatchupPlayer[];
  };
};

type ScoringSide = 'home' | 'away';

type PendingScore = {
  side: ScoringSide;
  points: number;
  order: number;
  player?: LiveTimelinePlayer;
};

type StatQueueItem = {
  player: LiveTimelinePlayer;
  period: number;
  order: number;
};

type LegacyStatBankKey = 'rebounds' | 'assists' | 'steals' | 'blocks' | 'turnovers' | 'fouls';
type StatBank = Record<ScoringSide, Record<LegacyStatBankKey, StatQueueItem[]>>;

const REGULATION_PERIOD_SECONDS = 720;
const OVERTIME_PERIOD_SECONDS = 300;
const LIVE_MODE_SPEED_MULTIPLIER = 3;

export function periodLabel(period: number): string {
  if (period <= 4) return `Q${period}`;
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
  const periodIds = periods.map(period => period.period);
  const statBank = buildStatBank(input, periodIds);
  const scoreQueues = {
    home: buildScoreQueue(input.homePlayers, input.homeScore, `${input.seed}:home-score`),
    away: buildScoreQueue(input.awayPlayers, input.awayScore, `${input.seed}:away-score`),
  };

  periods.forEach((period, periodIndex) => {
    const periodSeconds = period.period > 4 ? OVERTIME_PERIOD_SECONDS : REGULATION_PERIOD_SECONDS;
    const scores = buildPeriodScores(input, period, scoreQueues);
    const actions = buildPossessionActionsForPeriod(input, period, statBank, periodIndex === periods.length - 1);
    const periodEvents = [
      ...scores.map((score, index) => ({ kind: 'score' as const, item: score, order: index * 2 })),
      ...actions.map((action, index) => ({ kind: 'action' as const, item: action, order: index * 2 + 1 })),
    ].sort((left, right) => left.order - right.order);

    periodEvents.forEach((pending, index) => {
      const clockSeconds = clockForScore(periodSeconds, periodEvents.length + 1, index);
      if (pending.kind === 'score') {
        const score = pending.item;
        const sidePlayers = score.side === 'home' ? input.homePlayers : input.awayPlayers;
        const player = score.player || selectPlayer(sidePlayers, score.order);
        const actingTeamId = score.side === 'home' ? input.homeTeamId : input.awayTeamId;
        if (score.side === 'home') homeScore += score.points;
        else awayScore += score.points;

        const deltas: LiveStatDelta[] = player ? [deltaFor(player, actingTeamId, { points: score.points })] : [];
        const assister = score.points > 1 ? consumeStat(statBank, score.side, 'assists', period.period, player?.playerId) : null;
        if (assister) deltas.push(deltaFor(assister.player, actingTeamId, { assists: 1 }));

        events.push(eventFrom({
          input,
          period,
          index,
          clockSeconds,
          elapsedIndex: events.length,
          homeScore,
          awayScore,
          eventType: 'score',
          actingTeamId,
          text: scoreText(player, actingTeamId, score.points, assister?.player),
          player,
          points: score.points,
          statDeltas: deltas,
          tags: ['score', period.label.toLowerCase()],
        }));
      } else {
        const action = pending.item;
        events.push(eventFrom({
          input,
          period,
          index,
          clockSeconds,
          elapsedIndex: events.length,
          homeScore,
          awayScore,
          ...action,
          tags: [action.eventType, period.label.toLowerCase()],
        }));
      }
    });

    events.push(eventFrom({
      input,
      period,
      index: periodEvents.length,
      clockSeconds: 0,
      elapsedIndex: events.length,
      homeScore,
      awayScore,
      eventType: 'period_end',
      actingTeamId: null,
      text: `End of ${period.label}: ${input.awayTeamId} ${awayScore} - ${input.homeTeamId} ${homeScore}`,
      tags: ['period_end', period.label.toLowerCase()],
    }));
  });

  const finalPeriod = periods.at(-1) || { period: 4, label: 'Q4', home: 0, away: 0 };
  events.push(eventFrom({
    input,
    period: finalPeriod,
    index: 99,
    clockSeconds: 0,
    elapsedIndex: events.length,
    homeScore: input.homeScore,
    awayScore: input.awayScore,
    eventType: 'final_buzzer',
    actingTeamId: input.homeScore === input.awayScore ? null : input.homeScore > input.awayScore ? input.homeTeamId : input.awayTeamId,
    text: `Final: ${input.awayTeamId} ${input.awayScore} - ${input.homeTeamId} ${input.homeScore}`,
    tags: ['final'],
    x: 50,
    y: 50,
  }));

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
    fieldGoalsMade: number;
    fieldGoalsAttempted: number;
    threePointersMade: number;
    threePointersAttempted: number;
    freeThrowsMade: number;
    freeThrowsAttempted: number;
    offensiveRebounds: number;
    defensiveRebounds: number;
  }>();

  timeline.events
    .filter(event => event.elapsedMs <= elapsedMs)
    .forEach((event) => {
      const deltas = event.statDeltas || (event.playerId && event.playerName && event.statDelta
        ? [{ playerId: event.playerId, playerName: event.playerName, teamId: event.actingTeamId || '', stats: event.statDelta }]
        : []);
      deltas.forEach((delta) => {
        const row = players.get(delta.playerId) || {
          playerId: delta.playerId,
          name: delta.playerName,
          teamId: delta.teamId,
          points: 0,
          rebounds: 0,
          assists: 0,
          steals: 0,
          blocks: 0,
          turnovers: 0,
          fouls: 0,
          fieldGoalsMade: 0,
          fieldGoalsAttempted: 0,
          threePointersMade: 0,
          threePointersAttempted: 0,
          freeThrowsMade: 0,
          freeThrowsAttempted: 0,
          offensiveRebounds: 0,
          defensiveRebounds: 0,
        };
        Object.entries(delta.stats || {}).forEach(([key, value]) => {
          const statKey = key as LiveStatKey;
          row[statKey] += Number(value || 0);
        });
        players.set(delta.playerId, row);
      });
    });

  return [...players.values()].sort((left, right) => (
    right.points - left.points
    || right.assists - left.assists
    || right.rebounds - left.rebounds
    || left.name.localeCompare(right.name)
  ));
}

export function starterMatchupsForTimeline(timeline: LiveTimeline | null | undefined): LiveTimelineStarterMatchup[] {
  return Array.isArray(timeline?.starterMatchups) ? timeline.starterMatchups : [];
}

export function currentTimelineEvent(
  timeline: LiveTimeline,
  elapsedMs: number,
): { event: LiveTimelineEvent; index: number } | { event: null; index: -1 } {
  if (timeline.events.length === 0) return { event: null, index: -1 };
  const index = Math.max(0, timeline.events.findLastIndex(event => event.elapsedMs <= elapsedMs));
  return { event: timeline.events[index], index };
}

function validateFinalScore(input: LiveTimelineInput, periods: LiveTimelinePeriod[]): void {
  const totals = periods.reduce(
    (acc, period) => ({ home: acc.home + period.home, away: acc.away + period.away }),
    { home: 0, away: 0 },
  );

  if (totals.home !== input.homeScore || totals.away !== input.awayScore) {
    throw new Error(
      `Live timeline score mismatch: quarter totals ${input.homeTeamId} ${totals.home}, ${input.awayTeamId} ${totals.away} do not match final score ${input.homeTeamId} ${input.homeScore}, ${input.awayTeamId} ${input.awayScore}`,
    );
  }
}

function buildPeriodScores(input: LiveTimelineInput, period: LiveTimelinePeriod, queues: Record<ScoringSide, PendingScore[]>): PendingScore[] {
  const homeScores = consumeScoreQueue(queues.home, period.home, 'home');
  const awayScores = consumeScoreQueue(queues.away, period.away, 'away');
  const seedOffset = hashString(`${input.seed}:${input.gameId}:${period.period}`) % 2;
  return [...homeScores, ...awayScores].sort((a, b) => (
    a.order - b.order || (a.side === b.side ? 0 : ((a.side === 'home' ? 0 : 1) === seedOffset ? -1 : 1))
  ));
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
  if (remaining > 0) consumed.push(...scoringChunks(remaining).map((points, index) => ({ side, points, order: consumed.length + index })));
  return consumed;
}

function buildStatBank(input: LiveTimelineInput, periods: number[]): StatBank {
  const empty = () => ({ rebounds: [], assists: [], steals: [], blocks: [], turnovers: [], fouls: [] });
  const bank: StatBank = { home: empty(), away: empty() };
  ([
    { side: 'home' as const, players: input.homePlayers },
    { side: 'away' as const, players: input.awayPlayers },
  ]).forEach(({ side, players }) => {
    players.forEach((player) => {
      (['rebounds', 'assists', 'steals', 'blocks', 'turnovers', 'fouls'] as const).forEach((stat) => {
        const count = Math.max(0, Math.floor(numberFrom(player[stat])));
        for (let index = 0; index < count; index += 1) {
          bank[side][stat].push({
            player,
            period: periods[hashString(`${input.seed}:${player.playerId}:${stat}:${index}`) % Math.max(1, periods.length)] || 1,
            order: hashString(`${input.seed}:${stat}:${player.playerId}:${index}`),
          });
        }
      });
    });
  });
  Object.values(bank).forEach(sideBank => Object.values(sideBank).forEach(queue => queue.sort((a, b) => a.period - b.period || a.order - b.order)));
  return bank;
}

function buildPossessionActionsForPeriod(input: LiveTimelineInput, period: LiveTimelinePeriod, bank: StatBank, finalPeriod: boolean) {
  const actions: Array<{
    eventType: LiveTimelineEvent['eventType'];
    actingTeamId: string | null;
    text: string;
    player?: LiveTimelinePlayer;
    statDeltas?: LiveStatDelta[];
  }> = [];
  const sides: ScoringSide[] = hashString(`${input.seed}:${period.period}:side-order`) % 2 === 0 ? ['home', 'away'] : ['away', 'home'];

  sides.forEach((defenseSide) => {
    const offenseSide = opposite(defenseSide);
    const defenseTeamId = teamIdForSide(input, defenseSide);
    const offenseTeamId = teamIdForSide(input, offenseSide);

    consumeStatsForPeriod(bank, defenseSide, 'steals', period.period, finalPeriod).forEach((steal) => {
      const turnover = consumeStat(bank, offenseSide, 'turnovers', period.period) || fallbackPlayer(input, offenseSide, steal.player.playerId);
      actions.push({
        eventType: 'turnover',
        actingTeamId: defenseTeamId,
        text: `${turnover.player.name} lost ball turnover. Steal: ${steal.player.name}.`,
        player: steal.player,
        statDeltas: [
          deltaFor(turnover.player, offenseTeamId, { turnovers: 1 }),
          deltaFor(steal.player, defenseTeamId, { steals: 1 }),
        ],
      });
    });

    consumeStatsForPeriod(bank, offenseSide, 'turnovers', period.period, finalPeriod).forEach((turnover) => {
      actions.push({
        eventType: 'turnover',
        actingTeamId: defenseTeamId,
        text: `${turnover.player.name} commits a turnover.`,
        player: turnover.player,
        statDeltas: [deltaFor(turnover.player, offenseTeamId, { turnovers: 1 })],
      });
    });

    consumeStatsForPeriod(bank, defenseSide, 'blocks', period.period, finalPeriod).forEach((block) => {
      const shooter = fallbackPlayer(input, offenseSide, block.player.playerId);
      const rebound = consumeStat(bank, defenseSide, 'rebounds', period.period) || block;
      actions.push({
        eventType: 'block',
        actingTeamId: defenseTeamId,
        text: `${shooter.player.name} missed layup. ${block.player.name} blocks the shot. Rebound: ${rebound.player.name}.`,
        player: block.player,
        statDeltas: [
          deltaFor(block.player, defenseTeamId, { blocks: 1 }),
          deltaFor(rebound.player, defenseTeamId, { rebounds: 1 }),
        ],
      });
    });

    consumeStatsForPeriod(bank, defenseSide, 'rebounds', period.period, finalPeriod).forEach((rebound) => {
      const shooter = fallbackPlayer(input, offenseSide, rebound.player.playerId);
      actions.push({
        eventType: 'miss',
        actingTeamId: defenseTeamId,
        text: `${shooter.player.name} missed jumper. Rebound: ${rebound.player.name}.`,
        player: rebound.player,
        statDeltas: [deltaFor(rebound.player, defenseTeamId, { rebounds: 1 })],
      });
    });

    consumeStatsForPeriod(bank, defenseSide, 'fouls', period.period, finalPeriod).forEach((foul) => {
      const shooter = fallbackPlayer(input, offenseSide, foul.player.playerId);
      actions.push({
        eventType: 'foul',
        actingTeamId: offenseTeamId,
        text: `${foul.player.name} shooting foul on ${shooter.player.name}.`,
        player: foul.player,
        statDeltas: [deltaFor(foul.player, defenseTeamId, { fouls: 1 })],
      });
    });
  });

  if (period.period <= 4 && actions.length > 6) {
    actions.splice(6, 0, {
      eventType: 'timeout',
      actingTeamId: null,
      text: `${period.label} timeout.`,
    });
  }

  return actions;
}

function consumeStatsForPeriod(bank: StatBank, side: ScoringSide, stat: LegacyStatBankKey, period: number, finalPeriod: boolean) {
  const consumed: StatQueueItem[] = [];
  let next = consumeStat(bank, side, stat, period);
  while (next) {
    consumed.push(next);
    next = consumeStat(bank, side, stat, period);
  }
  if (finalPeriod) {
    next = consumeStat(bank, side, stat);
    while (next) {
      consumed.push(next);
      next = consumeStat(bank, side, stat);
    }
  }
  return consumed;
}

function consumeStat(
  bank: StatBank,
  side: ScoringSide,
  stat: LegacyStatBankKey,
  period?: number,
  excludePlayerId?: string,
): StatQueueItem | null {
  const queue = bank[side][stat];
  const index = queue.findIndex(item => (period === undefined || item.period === period) && item.player.playerId !== excludePlayerId);
  if (index < 0) return null;
  return queue.splice(index, 1)[0];
}

function fallbackPlayer(input: LiveTimelineInput, side: ScoringSide, excludePlayerId?: string): StatQueueItem {
  const players = side === 'home' ? input.homePlayers : input.awayPlayers;
  const player = players.find(item => item.playerId !== excludePlayerId) || players[0] || { playerId: `${side}-team`, name: teamIdForSide(input, side) };
  return { player, period: 1, order: 0 };
}

function deltaFor(player: LiveTimelinePlayer, teamId: string, stats: Partial<Record<LiveStatKey, number>>): LiveStatDelta {
  return {
    playerId: player.playerId,
    playerName: player.name,
    teamId,
    stats,
  };
}

function eventFrom({
  input,
  period,
  index,
  clockSeconds,
  elapsedIndex,
  homeScore,
  awayScore,
  eventType,
  actingTeamId,
  text,
  player,
  points,
  statDeltas,
  tags,
  x,
  y,
}: {
  input: LiveTimelineInput;
  period: LiveTimelinePeriod;
  index: number;
  clockSeconds: number;
  elapsedIndex: number;
  homeScore: number;
  awayScore: number;
  eventType: LiveTimelineEvent['eventType'];
  actingTeamId: string | null;
  text: string;
  player?: LiveTimelinePlayer;
  points?: number;
  statDeltas?: LiveStatDelta[];
  tags: string[];
  x?: number;
  y?: number;
}): LiveTimelineEvent {
  const primaryDelta = statDeltas?.find(delta => delta.playerId === player?.playerId)?.stats;
  return withoutUndefined({
    id: eventType === 'final_buzzer' ? `${input.gameId}-final` : `${input.gameId}-${period.period}-${elapsedIndex}`,
    period: period.period,
    periodLabel: period.label,
    clockSeconds,
    elapsedMs: acceleratedElapsedMs(period.period, clockSeconds),
    homeScore,
    awayScore,
    eventType,
    actingTeamId,
    text,
    x: x ?? eventCoordinate(input, period.period, index, 'x'),
    y: y ?? eventCoordinate(input, period.period, index, 'y'),
    momentum: homeScore - awayScore,
    tags,
    playerId: player?.playerId,
    playerName: player?.name,
    points,
    statDelta: primaryDelta,
    statDeltas,
  }) as LiveTimelineEvent;
}

function withoutUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutUndefined);
  if (!value || typeof value !== 'object') return value;
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, item]) => {
    if (item === undefined) return acc;
    acc[key] = withoutUndefined(item);
    return acc;
  }, {});
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

function clockForScore(periodSeconds: number, eventCount: number, index: number): number {
  const step = periodSeconds / (eventCount + 1);
  return Math.max(0, Math.round(periodSeconds - step * (index + 1)));
}

function acceleratedElapsedMs(period: number, clockSeconds: number): number {
  const periodSeconds = period > 4 ? OVERTIME_PERIOD_SECONDS : REGULATION_PERIOD_SECONDS;
  const priorSeconds = period <= 4
    ? (period - 1) * REGULATION_PERIOD_SECONDS
    : 4 * REGULATION_PERIOD_SECONDS + (period - 5) * OVERTIME_PERIOD_SECONDS;
  return Math.round(((priorSeconds + (periodSeconds - clockSeconds)) / LIVE_MODE_SPEED_MULTIPLIER) * 1000);
}

function selectPlayer(players: LiveTimelinePlayer[], order: number): LiveTimelinePlayer | undefined {
  if (players.length === 0) return undefined;
  return [...players].sort((a, b) => (b.points ?? 0) - (a.points ?? 0) || a.name.localeCompare(b.name))[order % players.length];
}

function numberFrom(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function scoreText(player: LiveTimelinePlayer | undefined, actingTeamId: string, points: number, assister?: LiveTimelinePlayer): string {
  const scorer = player?.name ?? actingTeamId;
  const shot = points === 3 ? '3PT jumper' : points === 1 ? 'free throw' : 'driving layup';
  return `${scorer} made ${shot}${assister ? `. Assist: ${assister.name}.` : '.'}`;
}

function opposite(side: ScoringSide): ScoringSide {
  return side === 'home' ? 'away' : 'home';
}

function teamIdForSide(input: LiveTimelineInput, side: ScoringSide) {
  return side === 'home' ? input.homeTeamId : input.awayTeamId;
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
