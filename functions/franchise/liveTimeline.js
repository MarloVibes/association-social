'use strict';

const REGULATION_PERIOD_SECONDS = 720;
const OVERTIME_PERIOD_SECONDS = 300;
const REVEAL_INTERVAL_MS = 2000;

function periodLabel(period) {
  if (period <= 4) {
    return `Q${period}`;
  }

  const overtimeNumber = period - 4;
  return overtimeNumber === 1 ? 'OT' : `${overtimeNumber}OT`;
}

function buildLiveTimeline(input) {
  const periods = (Array.isArray(input.quarters) ? input.quarters : [])
    .map(period => ({
      period: period.quarter,
      label: periodLabel(period.quarter),
      home: period.home,
      away: period.away,
    }))
    .sort((a, b) => a.period - b.period);

  validateFinalScore(input, periods);

  const events = [];
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
        playerId: player && player.playerId,
        playerName: player && player.name,
        points: score.points,
      });
    });
  });

  const finalPeriod = periods.length > 0 ? periods[periods.length - 1] : { period: 4, label: 'Q4' };

  events.push({
    id: `${input.gameId}-final`,
    period: finalPeriod.period,
    periodLabel: finalPeriod.label,
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
    revealDurationMs: events.length > 0 ? events[events.length - 1].elapsedMs : 0,
    periods,
    events,
  };
}

function currentTimelineEvent(timeline, elapsedMs) {
  const events = Array.isArray(timeline && timeline.events) ? timeline.events : [];

  if (events.length === 0) {
    return {
      event: null,
      index: -1,
    };
  }

  let index = -1;
  for (let eventIndex = events.length - 1; eventIndex >= 0; eventIndex -= 1) {
    if (events[eventIndex].elapsedMs <= elapsedMs) {
      index = eventIndex;
      break;
    }
  }

  const visibleIndex = Math.max(0, index);

  return {
    event: events[visibleIndex],
    index: visibleIndex,
  };
}

function validateFinalScore(input, periods) {
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

function buildPeriodScores(input, period) {
  const homeScores = scoringChunks(period.home).map((points, index) => ({
    side: 'home',
    points,
    order: index,
  }));
  const awayScores = scoringChunks(period.away).map((points, index) => ({
    side: 'away',
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

function scoringChunks(total) {
  const chunks = [];
  let remaining = Math.max(0, total);

  while (remaining > 0) {
    const points = remaining >= 3 && remaining % 2 === 1 ? 3 : Math.min(2, remaining);
    chunks.push(points);
    remaining -= points;
  }

  return chunks;
}

function clockForScore(periodSeconds, scoreCount, index) {
  const step = periodSeconds / (scoreCount + 1);
  return Math.max(1, Math.round(periodSeconds - step * (index + 1)));
}

function selectPlayer(players, order) {
  if (!Array.isArray(players) || players.length === 0) {
    return undefined;
  }

  return [...players].sort((a, b) => (b.points || 0) - (a.points || 0) || String(a.name).localeCompare(String(b.name)))[order % players.length];
}

function scoreText(player, actingTeamId, points) {
  const scorer = player && player.name ? player.name : actingTeamId;
  return `${scorer} scores ${points}`;
}

function eventCoordinate(input, period, index, axis) {
  const hash = hashString(`${input.seed}:${input.gameId}:${period}:${index}:${axis}`);
  return hash % 101;
}

function hashString(value) {
  let hash = 0;

  for (let index = 0; index < String(value).length; index += 1) {
    hash = (hash * 31 + String(value).charCodeAt(index)) >>> 0;
  }

  return hash;
}

module.exports = {
  buildLiveTimeline,
  currentTimelineEvent,
  periodLabel,
};
