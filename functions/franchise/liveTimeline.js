'use strict';

const REGULATION_PERIOD_SECONDS = 720;
const OVERTIME_PERIOD_SECONDS = 300;
const LIVE_MODE_SPEED_MULTIPLIER = 3;

function periodLabel(period) {
  if (period <= 4) return `Q${period}`;
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
  const periodIds = periods.map(period => period.period);
  const statBank = buildStatBank(input, periodIds);
  const scoreQueues = {
    home: buildScoreQueue(input.homePlayers || [], input.homeScore, `${input.seed}:home-score`),
    away: buildScoreQueue(input.awayPlayers || [], input.awayScore, `${input.seed}:away-score`),
  };

  periods.forEach((period, periodIndex) => {
    const periodSeconds = period.period > 4 ? OVERTIME_PERIOD_SECONDS : REGULATION_PERIOD_SECONDS;
    const scores = buildPeriodScores(input, period, scoreQueues);
    const actions = buildPossessionActionsForPeriod(input, period, statBank, periodIndex === periods.length - 1);
    const periodEvents = [
      ...scores.map((score, index) => ({ kind: 'score', item: score, order: index * 2 })),
      ...actions.map((action, index) => ({ kind: 'action', item: action, order: index * 2 + 1 })),
    ].sort((left, right) => left.order - right.order);

    periodEvents.forEach((pending, index) => {
      const clockSeconds = clockForScore(periodSeconds, periodEvents.length + 1, index);
      if (pending.kind === 'score') {
        const score = pending.item;
        const sidePlayers = score.side === 'home' ? input.homePlayers || [] : input.awayPlayers || [];
        const player = score.player || selectPlayer(sidePlayers, score.order);
        const actingTeamId = score.side === 'home' ? input.homeTeamId : input.awayTeamId;
        if (score.side === 'home') homeScore += score.points;
        else awayScore += score.points;

        const deltas = player ? [deltaFor(player, actingTeamId, { points: score.points })] : [];
        const assister = score.points > 1 ? consumeStat(statBank, score.side, 'assists', period.period, player && player.playerId) : null;
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
          text: scoreText(player, actingTeamId, score.points, assister && assister.player),
          player,
          points: score.points,
          statDeltas: deltas,
          tags: ['score', String(period.label).toLowerCase()],
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
          tags: [action.eventType, String(period.label).toLowerCase()],
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
      tags: ['period_end', String(period.label).toLowerCase()],
    }));
  });

  const finalPeriod = periods.length > 0 ? periods[periods.length - 1] : { period: 4, label: 'Q4' };
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
    revealDurationMs: events.length > 0 ? events[events.length - 1].elapsedMs : 0,
    periods,
    events,
  };
}

function currentTimelineEvent(timeline, elapsedMs) {
  const events = Array.isArray(timeline && timeline.events) ? timeline.events : [];
  if (events.length === 0) return { event: null, index: -1 };
  let index = -1;
  for (let eventIndex = events.length - 1; eventIndex >= 0; eventIndex -= 1) {
    if (events[eventIndex].elapsedMs <= elapsedMs) {
      index = eventIndex;
      break;
    }
  }
  const visibleIndex = Math.max(0, index);
  return { event: events[visibleIndex], index: visibleIndex };
}

function livePlayerStatsAt(timeline, elapsedMs) {
  const players = new Map();
  (Array.isArray(timeline && timeline.events) ? timeline.events : [])
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
        };
        Object.entries(delta.stats || {}).forEach(([key, value]) => {
          row[key] = Number(row[key] || 0) + Number(value || 0);
        });
        players.set(delta.playerId, row);
      });
    });

  return [...players.values()].sort((left, right) => (
    right.points - left.points
    || right.assists - left.assists
    || right.rebounds - left.rebounds
    || String(left.name).localeCompare(String(right.name))
  ));
}

function validateFinalScore(input, periods) {
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

function buildPeriodScores(input, period, queues) {
  const homeScores = consumeScoreQueue(queues.home, period.home, 'home');
  const awayScores = consumeScoreQueue(queues.away, period.away, 'away');
  const seedOffset = hashString(`${input.seed}:${input.gameId}:${period.period}`) % 2;
  return [...homeScores, ...awayScores].sort((a, b) => (
    a.order - b.order || (a.side === b.side ? 0 : ((a.side === 'home' ? 0 : 1) === seedOffset ? -1 : 1))
  ));
}

function buildScoreQueue(players, teamScore, seed) {
  const chunks = (Array.isArray(players) ? players : [])
    .flatMap((player, playerIndex) => (
      scoringChunks(numberFrom(player && player.points)).map((points, scoreIndex) => ({
        side: 'home',
        points,
        order: scoreIndex * 100 + playerIndex + (hashString(`${seed}:${player.playerId}:${scoreIndex}`) % 17),
        player,
      }))
    ))
    .sort((left, right) => left.order - right.order);

  const total = chunks.reduce((sum, item) => sum + item.points, 0);
  if (chunks.length === 0 || total !== teamScore) {
    return scoringChunks(teamScore).map((points, index) => ({ side: 'home', points, order: index }));
  }
  return chunks;
}

function consumeScoreQueue(queue, targetTotal, side) {
  const consumed = [];
  let remaining = targetTotal;
  while (remaining > 0 && queue.length > 0) {
    const next = queue.shift();
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

function buildStatBank(input, periods) {
  const empty = () => ({ rebounds: [], assists: [], steals: [], blocks: [], turnovers: [], fouls: [] });
  const bank = { home: empty(), away: empty() };
  [
    { side: 'home', players: input.homePlayers || [] },
    { side: 'away', players: input.awayPlayers || [] },
  ].forEach(({ side, players }) => {
    players.forEach((player) => {
      ['rebounds', 'assists', 'steals', 'blocks', 'turnovers', 'fouls'].forEach((stat) => {
        const count = Math.max(0, Math.floor(numberFrom(player && player[stat])));
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

function buildPossessionActionsForPeriod(input, period, bank, finalPeriod) {
  const actions = [];
  const sides = hashString(`${input.seed}:${period.period}:side-order`) % 2 === 0 ? ['home', 'away'] : ['away', 'home'];

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

function consumeStatsForPeriod(bank, side, stat, period, finalPeriod) {
  const consumed = [];
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

function consumeStat(bank, side, stat, period, excludePlayerId) {
  const queue = bank[side][stat];
  const index = queue.findIndex(item => (period === undefined || item.period === period) && item.player.playerId !== excludePlayerId);
  if (index < 0) return null;
  return queue.splice(index, 1)[0];
}

function fallbackPlayer(input, side, excludePlayerId) {
  const players = side === 'home' ? input.homePlayers || [] : input.awayPlayers || [];
  const player = players.find(item => item.playerId !== excludePlayerId) || players[0] || { playerId: `${side}-team`, name: teamIdForSide(input, side) };
  return { player, period: 1, order: 0 };
}

function deltaFor(player, teamId, stats) {
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
}) {
  const primaryDelta = statDeltas && player ? (statDeltas.find(delta => delta.playerId === player.playerId) || {}).stats : undefined;
  return {
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
    x: x !== undefined ? x : eventCoordinate(input, period.period, index, 'x'),
    y: y !== undefined ? y : eventCoordinate(input, period.period, index, 'y'),
    momentum: homeScore - awayScore,
    tags,
    playerId: player && player.playerId,
    playerName: player && player.name,
    points,
    statDelta: primaryDelta,
    statDeltas,
  };
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

function clockForScore(periodSeconds, eventCount, index) {
  const step = periodSeconds / (eventCount + 1);
  return Math.max(0, Math.round(periodSeconds - step * (index + 1)));
}

function acceleratedElapsedMs(period, clockSeconds) {
  const periodSeconds = period > 4 ? OVERTIME_PERIOD_SECONDS : REGULATION_PERIOD_SECONDS;
  const priorSeconds = period <= 4
    ? (period - 1) * REGULATION_PERIOD_SECONDS
    : 4 * REGULATION_PERIOD_SECONDS + (period - 5) * OVERTIME_PERIOD_SECONDS;
  return Math.round(((priorSeconds + (periodSeconds - clockSeconds)) / LIVE_MODE_SPEED_MULTIPLIER) * 1000);
}

function selectPlayer(players, order) {
  if (!Array.isArray(players) || players.length === 0) return undefined;
  return [...players].sort((a, b) => (b.points || 0) - (a.points || 0) || String(a.name).localeCompare(String(b.name)))[order % players.length];
}

function numberFrom(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function scoreText(player, actingTeamId, points, assister) {
  const scorer = player && player.name ? player.name : actingTeamId;
  const shot = points === 3 ? '3PT jumper' : points === 1 ? 'free throw' : 'driving layup';
  return `${scorer} made ${shot}${assister ? `. Assist: ${assister.name}.` : '.'}`;
}

function opposite(side) {
  return side === 'home' ? 'away' : 'home';
}

function teamIdForSide(input, side) {
  return side === 'home' ? input.homeTeamId : input.awayTeamId;
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
  livePlayerStatsAt,
  periodLabel,
};
