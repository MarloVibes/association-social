'use strict';

const { buildArenaTheme } = require('./arenaTheme');
const { FinalizeGameError, finalizeGame } = require('./finalizeGame');
const { buildLiveTimeline } = require('./liveTimeline');
const {
  boxScoreFromPossessionTimeline,
  buildPossessionTimeline,
} = require('./possessionTimeline');

const REQUEST_WINDOW_MS = 60 * 60 * 1000;
const PREPARATION_WINDOW_MS = 5 * 60 * 1000;

class MatchupError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'MatchupError';
    this.code = code;
    this.details = details;
  }
}

function isActiveRequest(game) {
  return game && (game.status === 'requested' || game.status === 'preparing');
}

function participatingGms(game) {
  return [game.homeGmId, game.awayGmId].filter(Boolean);
}

function assertParticipant(game, uid) {
  if (!participatingGms(game).includes(uid)) {
    throw new MatchupError('permission-denied', 'Only a participating GM can manage this matchup.');
  }
}

function opponentUid(game, uid) {
  if (game.homeGmId === uid) return game.awayGmId || null;
  if (game.awayGmId === uid) return game.homeGmId || null;
  return null;
}

function hash(value) {
  let h = 2166136261;
  for (let i = 0; i < String(value).length; i += 1) {
    h ^= String(value).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function simulatedScore(game, nowMs) {
  const seed = `${game.id}:${game.homeTeamId}:${game.awayTeamId}:${nowMs}`;
  let homeScore = 88 + (hash(`${seed}:home`) % 45);
  let awayScore = 88 + (hash(`${seed}:away`) % 45);
  if (homeScore === awayScore) {
    homeScore += (hash(`${seed}:ot`) % 2) + 1;
  }
  return { homeScore, awayScore };
}

function displayScheduleAbbr(value) {
  const raw = String(value || '').trim();
  const eraMatch = raw.toUpperCase().match(/^([A-Z]{2,3})_\d{4}$/);
  return eraMatch ? eraMatch[1] : raw;
}

function periodLabel(period) {
  const value = Number(period || 0);
  if (value <= 4) return `Q${value}`;
  return value === 5 ? 'OT' : `${value - 4}OT`;
}

function numberFrom(value, fallback = 60) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

const GRADE_VALUES = {
  S: 99,
  'A+': 97,
  A: 92,
  'A-': 87,
  'B+': 82,
  B: 77,
  'B-': 72,
  'C+': 68,
  C: 63,
  'C-': 57,
  'D+': 55,
  D: 52,
  'D-': 47,
  F: 42,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function gradeValue(value) {
  const key = String(value || '').trim().toUpperCase();
  return GRADE_VALUES[key] || null;
}

function playerKey(player) {
  return String(player && (player.player_id || player.playerId || player.id || player.full_name || player.name) || '');
}

function playerSkill(player, key) {
  if (player && player.hidden && typeof player.hidden === 'object' && player.hidden[key] != null) return numberFrom(player.hidden[key], 60);
  if (player && Number.isFinite(player[key])) return numberFrom(player[key], 60);
  const directGrade = gradeValue(player && player.grades && player.grades[key]);
  if (directGrade) return directGrade;
  const visibleGrade = gradeValue(player && player.visible && player.visible.grades && player.visible.grades[key]);
  if (visibleGrade) return visibleGrade;
  if (key === 'shooting') return numberFrom(player && (player.ppg || player.points), 60);
  if (key === 'playmaking') return numberFrom(player && (player.apg || player.assists), 60);
  if (key === 'rebounding') return numberFrom(player && (player.rpg || player.rebounds), 60);
  return 60;
}

function detailedPlayerSkill(player, key, fallbacks = []) {
  if (player && player.hidden && typeof player.hidden === 'object' && player.hidden[key] != null) {
    return numberFrom(player.hidden[key], 60);
  }
  if (player && Number.isFinite(player[key])) return numberFrom(player[key], 60);
  for (const fallback of fallbacks) {
    const value = playerSkill(player, fallback);
    if (Number.isFinite(value)) return value;
  }
  return 60;
}

function coachingIdentityText(player) {
  return [
    ...(Array.isArray(player && player.labels) ? player.labels : []),
    player && player.archetype,
    player && player.playStyle,
    player && player.playstyle,
  ].filter(Boolean).join(' ').toLowerCase();
}

function coachingPositionText(player) {
  return String(player && player.position || '').toUpperCase();
}

function coachingIsBig(player) {
  const position = coachingPositionText(player);
  return position.includes('PF') || position.includes('C') || position.includes('F-C');
}

function coachingIsGuardOrWing(player) {
  const position = coachingPositionText(player);
  return position.includes('PG') || position.includes('SG') || position.includes('SF') || position === 'G' || position === 'F';
}

function addCoachingAdjustment(adjustments, key, value) {
  if (!value) return;
  adjustments[key] = Math.max(-2, Math.min(2, (adjustments[key] || 0) + value));
}

function coachingGradeAdjustmentsForPlayer(presetId, player) {
  const id = String(presetId || 'balanced');
  const text = coachingIdentityText(player);
  const adjustments = {};
  if (id === 'balanced') return adjustments;

  if (id === 'pace_and_space' || id === 'seven_seconds') {
    const fits = detailedPlayerSkill(player, 'threePoint', ['shooting']) >= 75
      || detailedPlayerSkill(player, 'speed', ['athleticism']) >= 78
      || playerSkill(player, 'playmaking') >= 78;
    if (fits) {
      addCoachingAdjustment(adjustments, 'threePoint', 1);
      addCoachingAdjustment(adjustments, 'speed', id === 'seven_seconds' ? 2 : 1);
      addCoachingAdjustment(adjustments, 'playmaking', 1);
      addCoachingAdjustment(adjustments, 'stamina', 1);
    } else {
      addCoachingAdjustment(adjustments, 'postOffense', -1);
      addCoachingAdjustment(adjustments, 'stamina', -1);
    }
  }

  if (id === 'grit_and_grind') {
    const fits = playerSkill(player, 'defense') >= 74
      || playerSkill(player, 'rebounding') >= 76
      || detailedPlayerSkill(player, 'strength', ['athleticism']) >= 76
      || text.includes('defen');
    if (fits) {
      addCoachingAdjustment(adjustments, 'defense', 2);
      addCoachingAdjustment(adjustments, 'defenseIq', 1);
      addCoachingAdjustment(adjustments, 'rebounding', 1);
      addCoachingAdjustment(adjustments, 'strength', 1);
    } else {
      addCoachingAdjustment(adjustments, 'defense', -1);
      addCoachingAdjustment(adjustments, 'stamina', -1);
    }
  }

  if (id === 'blitz_pressure' || id === 'zone_trap') {
    const fits = detailedPlayerSkill(player, 'steals', ['defense']) >= 74
      || detailedPlayerSkill(player, 'speed', ['athleticism']) >= 76
      || detailedPlayerSkill(player, 'perimeterDefense', ['defense']) >= 76
      || text.includes('defen');
    if (fits) {
      addCoachingAdjustment(adjustments, 'steals', 2);
      addCoachingAdjustment(adjustments, 'perimeterDefense', 1);
      addCoachingAdjustment(adjustments, 'speed', 1);
      addCoachingAdjustment(adjustments, 'defenseIq', id === 'zone_trap' ? 2 : 1);
    } else {
      addCoachingAdjustment(adjustments, 'defenseIq', -1);
      addCoachingAdjustment(adjustments, 'stamina', -1);
    }
  }

  if (id === 'triangle_control') {
    const fits = playerSkill(player, 'basketballIq') >= 76
      || detailedPlayerSkill(player, 'passing', ['playmaking']) >= 76
      || detailedPlayerSkill(player, 'postOffense', ['shooting']) >= 76
      || detailedPlayerSkill(player, 'midRange', ['shooting']) >= 76;
    if (fits) {
      addCoachingAdjustment(adjustments, 'basketballIq', 2);
      addCoachingAdjustment(adjustments, 'passing', 1);
      addCoachingAdjustment(adjustments, 'midRange', 1);
      addCoachingAdjustment(adjustments, 'postOffense', 1);
    } else {
      addCoachingAdjustment(adjustments, 'ballHandle', -1);
    }
  }

  if (id === 'lob_city') {
    const fits = detailedPlayerSkill(player, 'dunking', ['athleticism']) >= 78
      || detailedPlayerSkill(player, 'athleticism') >= 80
      || (coachingIsBig(player) && detailedPlayerSkill(player, 'closeShot', ['shooting']) >= 75);
    if (fits) {
      addCoachingAdjustment(adjustments, 'dunking', 2);
      addCoachingAdjustment(adjustments, 'athleticism', 2);
      addCoachingAdjustment(adjustments, 'closeShot', 1);
      addCoachingAdjustment(adjustments, 'shooting', 1);
      addCoachingAdjustment(adjustments, 'playmaking', coachingIsGuardOrWing(player) ? 1 : 0);
    } else {
      addCoachingAdjustment(adjustments, 'midRange', -1);
      addCoachingAdjustment(adjustments, 'stamina', -1);
    }
  }

  if (id === 'midrange_clinic') {
    const fits = detailedPlayerSkill(player, 'midRange', ['shooting']) >= 76
      || detailedPlayerSkill(player, 'shotIq', ['basketballIq']) >= 76
      || detailedPlayerSkill(player, 'freeThrow', ['shooting']) >= 78;
    if (fits) {
      addCoachingAdjustment(adjustments, 'midRange', 2);
      addCoachingAdjustment(adjustments, 'shotIq', 1);
      addCoachingAdjustment(adjustments, 'freeThrow', 1);
      addCoachingAdjustment(adjustments, 'clutch', 1);
      addCoachingAdjustment(adjustments, 'shooting', 1);
    } else {
      addCoachingAdjustment(adjustments, 'threePoint', -1);
    }
  }

  if (id === 'bully_ball') {
    const fits = detailedPlayerSkill(player, 'strength', ['athleticism']) >= 76
      || detailedPlayerSkill(player, 'postOffense', ['shooting']) >= 76
      || detailedPlayerSkill(player, 'postDefense', ['defense']) >= 76
      || text.includes('defen');
    if (fits) {
      addCoachingAdjustment(adjustments, 'strength', 2);
      addCoachingAdjustment(adjustments, 'postOffense', 1);
      addCoachingAdjustment(adjustments, 'postDefense', 2);
      addCoachingAdjustment(adjustments, 'rebounding', 1);
      addCoachingAdjustment(adjustments, 'defense', 1);
    } else {
      addCoachingAdjustment(adjustments, 'speed', -1);
      addCoachingAdjustment(adjustments, 'stamina', -1);
    }
  }

  if (id === 'small_ball_switch') {
    const fits = detailedPlayerSkill(player, 'speed', ['athleticism']) >= 76
      || detailedPlayerSkill(player, 'perimeterDefense', ['defense']) >= 76
      || detailedPlayerSkill(player, 'threePoint', ['shooting']) >= 76;
    if (fits) {
      addCoachingAdjustment(adjustments, 'speed', 2);
      addCoachingAdjustment(adjustments, 'perimeterDefense', 2);
      addCoachingAdjustment(adjustments, 'threePoint', 1);
      addCoachingAdjustment(adjustments, 'helpDefense', 1);
    } else {
      addCoachingAdjustment(adjustments, 'rebounding', -1);
      addCoachingAdjustment(adjustments, 'postDefense', -1);
    }
  }

  if (id === 'twin_towers') {
    const fits = coachingIsBig(player) && (
      detailedPlayerSkill(player, 'blocking', ['defense']) >= 74
      || playerSkill(player, 'rebounding') >= 76
      || detailedPlayerSkill(player, 'postDefense', ['defense']) >= 76
    );
    if (fits) {
      addCoachingAdjustment(adjustments, 'blocking', 2);
      addCoachingAdjustment(adjustments, 'postDefense', 2);
      addCoachingAdjustment(adjustments, 'rebounding', 2);
      addCoachingAdjustment(adjustments, 'strength', 1);
    } else {
      addCoachingAdjustment(adjustments, 'speed', -1);
      addCoachingAdjustment(adjustments, 'threePoint', -1);
    }
  }

  return adjustments;
}

function applyCoachingGradeAdjustmentsForSimulation(player, presetId) {
  const adjustments = coachingGradeAdjustmentsForPlayer(presetId, player);
  const hidden = { ...((player && player.hidden) || {}) };
  Object.entries(adjustments).forEach(([key, delta]) => {
    hidden[key] = clamp(detailedPlayerSkill({ ...player, hidden }, key, [key]) + delta, 25, 99);
  });
  return {
    ...player,
    hidden,
    ...(Object.keys(adjustments).length ? { coachingGradeAdjustments: adjustments } : {}),
  };
}

function blendedCoachingGradeAdjustmentsForPlayer(presetIds, player) {
  const ids = (presetIds || []).filter(Boolean);
  if (ids.length === 0) return {};
  const totals = {};
  ids.forEach((presetId) => {
    const adjustments = coachingGradeAdjustmentsForPlayer(presetId, player);
    Object.entries(adjustments).forEach(([key, delta]) => {
      totals[key] = (totals[key] || 0) + delta;
    });
  });
  return Object.entries(totals).reduce((result, [key, total]) => {
    const blended = total / ids.length;
    const delta = blended > 0 ? Math.ceil(blended) : Math.floor(blended);
    if (delta !== 0) result[key] = Math.max(-2, Math.min(2, delta));
    return result;
  }, {});
}

function applyCoachingPlanToPlayerForSimulation(player, presetIds) {
  const adjustments = blendedCoachingGradeAdjustmentsForPlayer(presetIds, player);
  const hidden = { ...((player && player.hidden) || {}) };
  Object.entries(adjustments).forEach(([key, delta]) => {
    hidden[key] = clamp(detailedPlayerSkill({ ...player, hidden }, key, [key]) + delta, 25, 99);
  });
  return {
    ...player,
    hidden,
    ...(Object.keys(adjustments).length ? { coachingGradeAdjustments: adjustments } : {}),
  };
}

function coachingPresetIdForSide(game, side) {
  const explicit = side === 'home' ? game && game.homeCoachingPresetId : game && game.awayCoachingPresetId;
  if (explicit) return explicit;
  const name = String(side === 'home' ? game && game.homeCoachingPresetName : game && game.awayCoachingPresetName || '').toLowerCase();
  if (name.includes('lob')) return 'lob_city';
  if (name.includes('grit')) return 'grit_and_grind';
  if (name.includes('blitz')) return 'blitz_pressure';
  if (name.includes('seven')) return 'seven_seconds';
  if (name.includes('triangle')) return 'triangle_control';
  if (name.includes('midrange')) return 'midrange_clinic';
  if (name.includes('bully')) return 'bully_ball';
  if (name.includes('zone')) return 'zone_trap';
  if (name.includes('small')) return 'small_ball_switch';
  if (name.includes('tower')) return 'twin_towers';
  if (name.includes('pace')) return 'pace_and_space';
  return 'balanced';
}

function coachingPlanPresetIdsForSide(game, side) {
  const firstHalf = side === 'home'
    ? game && (game.homeFirstHalfCoachingPresetId || game.homeCoachingPresetId)
    : game && (game.awayFirstHalfCoachingPresetId || game.awayCoachingPresetId);
  const secondHalf = side === 'home'
    ? game && (game.homeSecondHalfCoachingPresetId || game.homeCoachingPresetId)
    : game && (game.awaySecondHalfCoachingPresetId || game.awayCoachingPresetId);
  const fallback = coachingPresetIdForSide(game, side);
  return [firstHalf || fallback, secondHalf || firstHalf || fallback].filter(Boolean);
}

function applyCoachingToTeamForSimulation(team, presetIds) {
  if (!team || !Array.isArray(team.players)) return team;
  const ids = (presetIds || []).filter(Boolean);
  if (ids.length === 0 || ids.every(id => id === 'balanced')) return team;
  return {
    ...team,
    players: team.players.map(player => applyCoachingPlanToPlayerForSimulation(player, ids)),
  };
}

function positionFactor(player, kind) {
  const position = String(player && player.position || '').toUpperCase();
  const isGuard = position.includes('PG') || position.includes('SG') || position === 'G';
  const isBig = position.includes('PF') || position.includes('C') || position === 'F-C';
  if (kind === 'assist') {
    if (position.includes('PG')) return 1.45;
    if (isGuard) return 1.18;
    if (isBig) return 0.62;
    return 0.88;
  }
  if (kind === 'rebound') {
    if (position.includes('C')) return 1.45;
    if (position.includes('PF')) return 1.25;
    if (isBig) return 1.08;
    if (isGuard) return 0.68;
    return 0.9;
  }
  return 1;
}

function simPlayerValue(player) {
  return playerSkill(player, 'shooting') * 0.45
    + playerSkill(player, 'playmaking') * 0.25
    + playerSkill(player, 'defense') * 0.2
    + playerSkill(player, 'basketballIq') * 0.1;
}

function simPlayersForTeam(team, teamId) {
  const source = Array.isArray(team && team.players) ? team.players : [];
  return [...source]
    .sort((left, right) => simPlayerValue(right) - simPlayerValue(left) || playerKey(left).localeCompare(playerKey(right)))
    .slice(0, 10);
}

function assertSimulationRoster(team, teamId) {
  if (!team || !Array.isArray(team.players) || team.players.length < 5) {
    throw new MatchupError(
      'failed-precondition',
      `Cannot simulate ${displayScheduleAbbr(teamId) || 'this team'} until its roster is linked to real players.`,
    );
  }
}

function normalizeSimulationMinutes(players) {
  const weights = players.map((player, index) => Math.max(1, Number(player.minutes || player.rotationMinutes || (index < 5 ? 32 : 18))));
  const total = weights.reduce((sum, value) => sum + value, 0) || 1;
  const minutes = weights.map(value => Math.max(1, Math.floor((value / total) * 240)));
  let diff = 240 - minutes.reduce((sum, value) => sum + value, 0);
  let cursor = 0;
  while (diff !== 0 && minutes.length > 0) {
    const direction = diff > 0 ? 1 : -1;
    if (direction > 0 || minutes[cursor] > 1) {
      minutes[cursor] += direction;
      diff -= direction;
    }
    cursor = (cursor + 1) % minutes.length;
  }
  return minutes;
}

function distributeTeamPoints(players, minutes, teamPoints, seed) {
  const weights = players.map((player, index) => (
    Math.max(1, minutes[index] * (playerSkill(player, 'shooting') + playerSkill(player, 'playmaking') * 0.25 + (hash(`${seed}:${playerKey(player)}`) % 8)) / 100)
  ));
  const total = weights.reduce((sum, value) => sum + value, 0) || 1;
  const points = weights.map(weight => Math.floor((weight / total) * teamPoints));
  let diff = teamPoints - points.reduce((sum, value) => sum + value, 0);
  let cursor = 0;
  while (diff > 0 && points.length > 0) {
    points[cursor] += 1;
    diff -= 1;
    cursor = (cursor + 1) % points.length;
  }
  return points;
}

function distributeStatTotal(players, minutes, targetTotal, seed, weightForPlayer) {
  const weights = players.map((player, index) => Math.max(0.01, weightForPlayer(player, minutes[index], index)));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || 1;
  const raw = weights.map(weight => (weight / totalWeight) * targetTotal);
  const values = raw.map(value => Math.floor(value));
  let diff = targetTotal - values.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({
      index,
      remainder: value - Math.floor(value),
      tie: hash(`${seed}:${playerKey(players[index])}:stat-share`),
    }))
    .sort((left, right) => right.remainder - left.remainder || left.tie - right.tie);
  let cursor = 0;
  while (diff > 0 && order.length > 0) {
    values[order[cursor].index] += 1;
    diff -= 1;
    cursor = (cursor + 1) % order.length;
  }
  return values;
}

function weightedTeamSkill(players, minutes, skillForPlayer) {
  const totalMinutes = minutes.reduce((sum, value) => sum + value, 0) || 1;
  return players.reduce((sum, player, index) => sum + skillForPlayer(player) * minutes[index], 0) / totalMinutes;
}

function targetTeamRebounds(players, minutes, seed) {
  const rebounding = weightedTeamSkill(players, minutes, player => (
    playerSkill(player, 'rebounding') * 0.62
    + playerSkill(player, 'defense') * 0.22
    + playerSkill(player, 'athleticism') * 0.16
  ));
  return clamp(Math.round(40 + ((rebounding - 60) / 3.4) + (hash(`${seed}:team-rebounds`) % 5)), 34, 58);
}

function targetTeamAssists(players, minutes, fieldGoalsMade, seed) {
  const creation = weightedTeamSkill(players, minutes, player => (
    playerSkill(player, 'playmaking') * 0.68
    + playerSkill(player, 'basketballIq') * 0.22
    + playerSkill(player, 'shooting') * 0.1
  ));
  const assistedRate = clamp(0.48 + ((creation - 60) / 155) + ((hash(`${seed}:team-assists`) % 7) - 3) / 100, 0.42, 0.76);
  return clamp(Math.round(fieldGoalsMade * assistedRate), 12, Math.min(34, Math.max(12, fieldGoalsMade)));
}

function shootingLine(points, variance, player) {
  const threePoint = detailedPlayerSkill(player, 'threePoint', ['shooting']);
  const midRange = detailedPlayerSkill(player, 'midRange', ['shooting']);
  const closeShot = detailedPlayerSkill(player, 'closeShot', ['shooting']);
  const dunking = detailedPlayerSkill(player, 'dunking', ['athleticism']);
  const postOffense = detailedPlayerSkill(player, 'postOffense', ['shooting']);
  const shotIq = detailedPlayerSkill(player, 'shotIq', ['basketballIq']);
  const freeThrow = detailedPlayerSkill(player, 'freeThrow', ['shooting']);
  const perimeterProfile = threePoint + shotIq * 0.35;
  const interiorProfile = closeShot * 0.45 + dunking * 0.35 + postOffense * 0.2;
  const threeRate = clamp(0.08 + (perimeterProfile - interiorProfile + 40) / 210, 0.05, 0.5);
  const threePointersMade = Math.min(Math.floor(points / 3), Math.floor(points * threeRate / 3));
  let remaining = points - (threePointersMade * 3);
  const rimPressure = clamp((closeShot + dunking + postOffense - threePoint + 70) / 260, 0.08, 0.82);
  let freeThrowsMade = Math.min(remaining, Math.round(((freeThrow + closeShot + dunking) / 240) * ((variance % 5) + rimPressure * 4)));
  if ((remaining - freeThrowsMade) % 2 !== 0 && freeThrowsMade > 0) freeThrowsMade -= 1;
  remaining -= freeThrowsMade;
  const twoPointersMade = Math.max(0, Math.floor(remaining / 2));
  const fieldGoalsMade = twoPointersMade + threePointersMade;
  const shotQuality = clamp((shotIq + midRange + freeThrow) / 300, 0.48, 0.9);
  return {
    fieldGoalsMade,
    fieldGoalsAttempted: fieldGoalsMade + 2 + Math.max(0, Math.round((variance % 7) * (1.04 - shotQuality))),
    threePointersMade,
    threePointersAttempted: threePointersMade + Math.max(1, Math.round(threeRate * 8) + (variance % 3)),
    freeThrowsMade,
    freeThrowsAttempted: freeThrowsMade + Math.max(0, Math.round(rimPressure * 2) + (variance % 2)),
  };
}

function buildSimulationTeamBox({ team, teamId, targetPoints, seed, pointMargin }) {
  const players = simPlayersForTeam(team, teamId);
  const minutes = normalizeSimulationMinutes(players);
  const points = distributeTeamPoints(players, minutes, targetPoints, seed);
  const shootingLines = players.map((player, index) => shootingLine(points[index], hash(`${seed}:${teamId}:${playerKey(player)}:line`), player));
  const fieldGoalsMade = shootingLines.reduce((total, line) => total + line.fieldGoalsMade, 0);
  const teamRebounds = targetTeamRebounds(players, minutes, seed);
  const teamAssists = targetTeamAssists(players, minutes, fieldGoalsMade, seed);
  const rebounds = distributeStatTotal(players, minutes, teamRebounds, `${seed}:rebounds`, (player, playerMinutes, index) => (
    playerMinutes
    * positionFactor(player, 'rebound')
    * (playerSkill(player, 'rebounding') * 0.64 + playerSkill(player, 'defense') * 0.22 + playerSkill(player, 'athleticism') * 0.14)
    * (0.95 + (hash(`${seed}:${index}:rebound-variance`) % 15) / 100)
  ));
  const assists = distributeStatTotal(players, minutes, teamAssists, `${seed}:assists`, (player, playerMinutes, index) => (
    playerMinutes
    * positionFactor(player, 'assist')
    * (playerSkill(player, 'playmaking') * 0.72 + playerSkill(player, 'basketballIq') * 0.2 + playerSkill(player, 'shooting') * 0.08)
    * (0.95 + (hash(`${seed}:${index}:assist-variance`) % 15) / 100)
  ));
  const boxPlayers = players.map((player, index) => {
    const variance = hash(`${seed}:${teamId}:${playerKey(player)}:line`);
    const playerRebounds = rebounds[index];
    const offensiveRebounds = Math.floor(playerRebounds * (20 + (variance % 18)) / 100);
    const line = shootingLines[index];
    return {
      playerId: playerKey(player),
      name: player.full_name || player.name || playerKey(player),
      minutes: minutes[index],
      points: points[index],
      rebounds: playerRebounds,
      assists: assists[index],
      steals: variance % 3,
      blocks: Math.floor((variance / 7) % 3),
      turnovers: Math.floor((variance / 11) % 4),
      ...line,
      offensiveRebounds,
      defensiveRebounds: playerRebounds - offensiveRebounds,
      fouls: 1 + (variance % 5),
      plusMinus: Math.round(pointMargin * (minutes[index] / 240) + ((variance % 7) - 3)),
      starter: index < 5,
    };
  });
  return {
    teamId,
    points: targetPoints,
    rebounds: boxPlayers.reduce((total, player) => total + player.rebounds, 0),
    assists: boxPlayers.reduce((total, player) => total + player.assists, 0),
    turnovers: boxPlayers.reduce((total, player) => total + player.turnovers, 0),
    fieldGoalsMade: boxPlayers.reduce((total, player) => total + player.fieldGoalsMade, 0),
    fieldGoalsAttempted: boxPlayers.reduce((total, player) => total + player.fieldGoalsAttempted, 0),
    threePointersMade: boxPlayers.reduce((total, player) => total + player.threePointersMade, 0),
    threePointersAttempted: boxPlayers.reduce((total, player) => total + player.threePointersAttempted, 0),
    freeThrowsMade: boxPlayers.reduce((total, player) => total + player.freeThrowsMade, 0),
    freeThrowsAttempted: boxPlayers.reduce((total, player) => total + player.freeThrowsAttempted, 0),
    fouls: boxPlayers.reduce((total, player) => total + player.fouls, 0),
    players: boxPlayers,
  };
}

function teamSimulationStrength(team, teamId) {
  const players = simPlayersForTeam(team, teamId);
  const topEight = players.slice(0, 8);
  return topEight.reduce((sum, player) => sum + simPlayerValue(player), 0) / Math.max(1, topEight.length);
}

function quarterScores(homeScore, awayScore, seed) {
  const split = (total, label) => {
    const raw = [0, 1, 2, 3].map(index => 20 + (hash(`${seed}:${label}:${index}`) % 12));
    const rawTotal = raw.reduce((sum, value) => sum + value, 0) || 1;
    const scores = raw.map(value => Math.floor((value / rawTotal) * total));
    let diff = total - scores.reduce((sum, value) => sum + value, 0);
    let cursor = 0;
    while (diff > 0) {
      scores[cursor] += 1;
      diff -= 1;
      cursor = (cursor + 1) % scores.length;
    }
    return scores;
  };
  const home = split(homeScore, 'home');
  const away = split(awayScore, 'away');
  return [0, 1, 2, 3].map(index => ({ quarter: index + 1, home: home[index], away: away[index] }));
}

function teamAbbrForTheme(team, teamId) {
  return displayScheduleAbbr(team && (team.abbreviation || team.abbr || team.teamId || team.id) || teamId);
}

function arenaThemeForHomeTeam({ game, homeTeam }) {
  return buildArenaTheme({
    homeAbbr: teamAbbrForTheme(homeTeam, game.homeTeamId),
    primaryColor: homeTeam && homeTeam.primaryColor,
    secondaryColor: homeTeam && homeTeam.secondaryColor,
    currentYear: game.currentYear || game.seasonYear || game.year,
  });
}

function timelinePlayers(teamBoxScore) {
  if (!teamBoxScore || !Array.isArray(teamBoxScore.players)) return [];
  return teamBoxScore.players.map(player => ({
    playerId: player.playerId,
    name: player.name,
    points: player.points,
    rebounds: player.rebounds,
    assists: player.assists,
    steals: player.steals,
    blocks: player.blocks,
    turnovers: player.turnovers,
    fouls: player.fouls,
  }));
}

function gameWithLiveMode({ game, nowMs, seed, homeTeam }) {
  if (game && game.liveTimeline) {
    return {
      ...game,
      liveMode: {
        status: 'ready',
        simulationStartedAtMs: nowMs,
        simulationEndsAtMs: nowMs + Number(game.liveTimeline.revealDurationMs || 0),
        arenaTheme: arenaThemeForHomeTeam({ game, homeTeam }),
      },
    };
  }
  const homePlayers = timelinePlayers(game.boxScore && game.boxScore.home);
  const awayPlayers = timelinePlayers(game.boxScore && game.boxScore.away);
  const liveTimeline = buildLiveTimeline({
    gameId: game.id,
    seed,
    homeTeamId: game.homeTeamId,
    awayTeamId: game.awayTeamId,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    quarters: game.quarters,
    homePlayers,
    awayPlayers,
  });

  return {
    ...game,
    liveTimeline,
    liveMode: {
      status: 'ready',
      simulationStartedAtMs: nowMs,
      simulationEndsAtMs: nowMs + liveTimeline.revealDurationMs,
      arenaTheme: arenaThemeForHomeTeam({ game, homeTeam }),
    },
  };
}

function adjustScoresForWinner({ homeScore, awayScore, winnerTeamId, game, seed }) {
  if (!winnerTeamId) return { homeScore, awayScore };
  if (winnerTeamId !== game.homeTeamId && winnerTeamId !== game.awayTeamId) {
    throw new MatchupError('invalid-argument', 'Choose one of the matchup teams as the winner.');
  }
  const margin = 1 + (hash(`${seed}:chosen-winner-margin`) % 8);
  if (winnerTeamId === game.homeTeamId && homeScore <= awayScore) {
    return { homeScore: awayScore + margin, awayScore };
  }
  if (winnerTeamId === game.awayTeamId && awayScore <= homeScore) {
    return { homeScore, awayScore: homeScore + margin };
  }
  return { homeScore, awayScore };
}

function simulateRosterGame({ game, homeTeam, awayTeam, nowMs, winnerTeamId }) {
  assertSimulationRoster(homeTeam, game.homeTeamId);
  assertSimulationRoster(awayTeam, game.awayTeamId);
  const homePresetIds = coachingPlanPresetIdsForSide(game, 'home');
  const awayPresetIds = coachingPlanPresetIdsForSide(game, 'away');
  const simulatedHomeTeam = applyCoachingToTeamForSimulation(homeTeam, homePresetIds);
  const simulatedAwayTeam = applyCoachingToTeamForSimulation(awayTeam, awayPresetIds);
  const seed = `${game.id}:${game.homeTeamId}:${game.awayTeamId}:${nowMs}`;
  const liveTimeline = buildPossessionTimeline({
    gameId: game.id,
    seed,
    homeTeamId: game.homeTeamId,
    awayTeamId: game.awayTeamId,
    homeTeam: simulatedHomeTeam,
    awayTeam: simulatedAwayTeam,
    homeCoachingPresetIds: homePresetIds,
    awayCoachingPresetIds: awayPresetIds,
    preferredWinnerTeamId: winnerTeamId,
    nowMs,
  });
  const homeScore = liveTimeline.homeScore;
  const awayScore = liveTimeline.awayScore;
  const { home, away } = boxScoreFromPossessionTimeline(liveTimeline);
  const simulatedWinnerTeamId = homeScore > awayScore ? game.homeTeamId : game.awayTeamId;
  const quarters = liveTimeline.periods.map(period => ({
    quarter: period.period,
    home: period.home,
    away: period.away,
  }));
  const boxScore = { home, away };
  return {
    homeScore,
    awayScore,
    boxScore,
    coachingImpact: {
      homePresetId: homePresetIds[0],
      awayPresetId: awayPresetIds[0],
      homeFirstHalfPresetId: homePresetIds[0],
      homeSecondHalfPresetId: homePresetIds[1],
      awayFirstHalfPresetId: awayPresetIds[0],
      awaySecondHalfPresetId: awayPresetIds[1],
    },
    quarters,
    liveTimeline,
    story: gameStoryFromResult({
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      homeScore,
      awayScore,
      quarters,
      boxScore,
      winnerTeamId: simulatedWinnerTeamId,
    }),
  };
}

function playerImpactScore(player) {
  return Number(player && player.points || 0) * 2
    + Number(player && player.rebounds || 0) * 1.15
    + Number(player && player.assists || 0) * 1.35
    + Number(player && player.steals || 0) * 2
    + Number(player && player.blocks || 0) * 2
    - Number(player && player.turnovers || 0) * 0.8;
}

function gameStoryFromResult({ homeTeamId, awayTeamId, homeScore, awayScore, quarters, boxScore, winnerTeamId }) {
  const homeWon = homeScore > awayScore;
  const winnerId = winnerTeamId || (homeWon ? homeTeamId : awayTeamId);
  const loserId = winnerId === homeTeamId ? awayTeamId : homeTeamId;
  const winnerLabel = displayScheduleAbbr(winnerId);
  const loserLabel = displayScheduleAbbr(loserId);
  const winnerScore = winnerId === homeTeamId ? homeScore : awayScore;
  const loserScore = winnerId === homeTeamId ? awayScore : homeScore;
  const margin = Math.abs(Number(homeScore || 0) - Number(awayScore || 0));
  const opener = (quarters || []).some(period => Number(period.quarter) > 4)
    ? `${winnerLabel} outlasted ${loserLabel} in overtime, ${winnerScore}-${loserScore}.`
    : margin <= 3
      ? `${winnerLabel} survived a one-possession finish against ${loserLabel}, ${winnerScore}-${loserScore}.`
      : margin <= 9
        ? `${winnerLabel} closed a tight game over ${loserLabel}, ${winnerScore}-${loserScore}.`
        : margin >= 20
          ? `${winnerLabel} ran away from ${loserLabel}, ${winnerScore}-${loserScore}.`
          : `${winnerLabel} handled the key stretches against ${loserLabel}, ${winnerScore}-${loserScore}.`;
  const performers = [
    ...((boxScore && boxScore.away && boxScore.away.players) || []).map(player => ({ ...player, side: awayTeamId })),
    ...((boxScore && boxScore.home && boxScore.home.players) || []).map(player => ({ ...player, side: homeTeamId })),
  ].sort((left, right) => playerImpactScore(right) - playerImpactScore(left));
  const leader = performers[0];
  const opponentLeader = leader && performers.find(player => player.side !== leader.side);
  const leaderLine = leader
    ? `${leader.name || 'The top performer'} led the night with ${Number(leader.points || 0)} points, ${Number(leader.rebounds || 0)} rebounds, and ${Number(leader.assists || 0)} assists.`
    : '';
  const responseLine = opponentLeader
    ? `${opponentLeader.name || `${loserLabel}'s top option`} kept it competitive with ${Number(opponentLeader.points || 0)} points.`
    : '';
  const winnerIsHome = winnerId === homeTeamId;
  const swing = (quarters || [])
    .map(period => {
      const diff = Number(period.home || 0) - Number(period.away || 0);
      return { period, winnerDiff: winnerIsHome ? diff : -diff };
    })
    .filter(item => item.winnerDiff > 0)
    .sort((left, right) => right.winnerDiff - left.winnerDiff)[0];
  const swingLine = swing ? `${winnerLabel}'s best stretch came in ${periodLabel(swing.period.quarter)}, winning that period by ${swing.winnerDiff}.` : '';
  return [opener, leaderLine, responseLine, swingLine].filter(Boolean).join(' ');
}

function teamStateForFinalization(team) {
  return {
    fatigue: team && team.fatigue,
    fatigueSequence: team && team.fatigueSequence,
    minorInjuryCount: team && team.minorInjuryCount,
    severeInjuryCount: team && team.severeInjuryCount,
    injuries: team && team.injuries,
  };
}

function teamStateUpdatePayload(state) {
  if (!state) return null;
  return {
    fatigue: Number(state.fatigue) || 0,
    fatigueSequence: Number(state.fatigueSequence) || 0,
    minorInjuryCount: Number(state.minorInjuryCount) || 0,
    severeInjuryCount: Number(state.severeInjuryCount) || 0,
    injuries: Array.isArray(state.injuries) ? state.injuries : [],
  };
}

function playerBoxScoreKey(player) {
  return String(player && (player.playerId || player.player_id || player.id || player.full_name || player.name) || '');
}

function addStat(stats, key, value) {
  const next = { ...(stats || {}) };
  next[key] = Number(next[key] || 0) + Number(value || 0);
  return next;
}

function subtractStat(stats, key, value) {
  const next = { ...(stats || {}) };
  const nextValue = Number(next[key] || 0) - Number(value || 0);
  next[key] = key === 'plusMinus' ? nextValue : Math.max(0, nextValue);
  return next;
}

function applyBoxScoreToRoster(players, teamBoxScore) {
  if (!Array.isArray(players) || !teamBoxScore || !Array.isArray(teamBoxScore.players)) return players;
  const lines = new Map(teamBoxScore.players.map(line => [playerBoxScoreKey(line), line]));
  return players.map((player) => {
    const line = lines.get(playerBoxScoreKey(player));
    if (!line) return player;
    let seasonStats = addStat(player.seasonStats, 'games', 1);
    [
      'minutes',
      'points',
      'rebounds',
      'assists',
      'steals',
      'blocks',
      'turnovers',
      'fieldGoalsMade',
      'fieldGoalsAttempted',
      'threePointersMade',
      'threePointersAttempted',
      'freeThrowsMade',
      'freeThrowsAttempted',
      'offensiveRebounds',
      'defensiveRebounds',
      'fouls',
      'plusMinus',
    ].forEach((key) => {
      seasonStats = addStat(seasonStats, key, line[key]);
    });
    return { ...player, seasonStats };
  });
}

function rollbackBoxScoreFromRoster(players, teamBoxScore) {
  if (!Array.isArray(players) || !teamBoxScore || !Array.isArray(teamBoxScore.players)) return players;
  const lines = new Map(teamBoxScore.players.map(line => [playerBoxScoreKey(line), line]));
  return players.map((player) => {
    const line = lines.get(playerBoxScoreKey(player));
    if (!line) return player;
    let seasonStats = subtractStat(player.seasonStats, 'games', 1);
    [
      'minutes',
      'points',
      'rebounds',
      'assists',
      'steals',
      'blocks',
      'turnovers',
      'fieldGoalsMade',
      'fieldGoalsAttempted',
      'threePointersMade',
      'threePointersAttempted',
      'freeThrowsMade',
      'freeThrowsAttempted',
      'offensiveRebounds',
      'defensiveRebounds',
      'fouls',
      'plusMinus',
    ].forEach((key) => {
      seasonStats = subtractStat(seasonStats, key, line[key]);
    });
    return { ...player, seasonStats };
  });
}

function teamPersistencePayload({ state, team, teamBoxScore }) {
  const payload = teamStateUpdatePayload(state);
  if (!payload) return null;
  if (team && Array.isArray(team.players) && teamBoxScore) {
    payload.players = applyBoxScoreToRoster(team.players, teamBoxScore);
  }
  return payload;
}

function teamResetPayload({ game, side, team }) {
  if (!game || !team || game.status !== 'final') return null;
  const fatigue = game.fatigue && game.fatigue[side];
  const gameInjuries = game.injuries && Array.isArray(game.injuries[side]) ? game.injuries[side] : [];
  const injuryIds = new Set(gameInjuries.map(injury => injury && injury.id).filter(Boolean));
  const remainingInjuries = Array.isArray(team.injuries)
    ? team.injuries.filter(injury => !injuryIds.has(injury && injury.id))
    : [];
  const minorRollback = gameInjuries.filter(injury => injury && injury.severity === 'minor').length;
  const severeRollback = gameInjuries.filter(injury => injury && injury.severity === 'severe').length;
  const payload = {
    fatigue: fatigue ? Number(fatigue.before || 0) : Number(team.fatigue || 0),
    fatigueSequence: fatigue ? Math.max(0, Number(fatigue.sequence || 0) - 1) : Number(team.fatigueSequence || 0),
    minorInjuryCount: Math.max(0, Number(team.minorInjuryCount || 0) - minorRollback),
    severeInjuryCount: Math.max(0, Number(team.severeInjuryCount || 0) - severeRollback),
    injuries: remainingInjuries,
  };
  const teamBoxScore = game.boxScore && game.boxScore[side];
  if (Array.isArray(team.players) && teamBoxScore) {
    payload.players = rollbackBoxScoreFromRoster(team.players, teamBoxScore);
  }
  return payload;
}

function safeCoachingSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const offense = typeof snapshot.offense === 'string' ? snapshot.offense : null;
  const defense = typeof snapshot.defense === 'string' ? snapshot.defense : null;
  if (!offense && !defense) return null;
  return {
    name: typeof snapshot.name === 'string' ? snapshot.name : null,
    offense,
    defense,
    presetId: typeof snapshot.presetId === 'string' ? snapshot.presetId : typeof snapshot.id === 'string' ? snapshot.id : null,
  };
}

function gameWithCoachingSnapshots({ game, homeSnapshot, homeSecondHalfSnapshot, awaySnapshot, awaySecondHalfSnapshot }) {
  const home = safeCoachingSnapshot(homeSnapshot);
  const homeSecondHalf = safeCoachingSnapshot(homeSecondHalfSnapshot) || home;
  const away = safeCoachingSnapshot(awaySnapshot);
  const awaySecondHalf = safeCoachingSnapshot(awaySecondHalfSnapshot) || away;
  return {
    ...game,
    ...(home ? {
      homeCoachingStyle: home.offense,
      homeDefensiveStyle: home.defense,
      homeCoachingPresetName: home.name,
      homeCoachingPresetId: home.presetId,
      homeFirstHalfCoachingStyle: home.offense,
      homeFirstHalfDefensiveStyle: home.defense,
      homeFirstHalfCoachingPresetName: home.name,
      homeFirstHalfCoachingPresetId: home.presetId,
      homeSecondHalfCoachingStyle: homeSecondHalf && homeSecondHalf.offense,
      homeSecondHalfDefensiveStyle: homeSecondHalf && homeSecondHalf.defense,
      homeSecondHalfCoachingPresetName: homeSecondHalf && homeSecondHalf.name,
      homeSecondHalfCoachingPresetId: homeSecondHalf && homeSecondHalf.presetId,
    } : {}),
    ...(away ? {
      awayCoachingStyle: away.offense,
      awayDefensiveStyle: away.defense,
      awayCoachingPresetName: away.name,
      awayCoachingPresetId: away.presetId,
      awayFirstHalfCoachingStyle: away.offense,
      awayFirstHalfDefensiveStyle: away.defense,
      awayFirstHalfCoachingPresetName: away.name,
      awayFirstHalfCoachingPresetId: away.presetId,
      awaySecondHalfCoachingStyle: awaySecondHalf && awaySecondHalf.offense,
      awaySecondHalfDefensiveStyle: awaySecondHalf && awaySecondHalf.defense,
      awaySecondHalfCoachingPresetName: awaySecondHalf && awaySecondHalf.name,
      awaySecondHalfCoachingPresetId: awaySecondHalf && awaySecondHalf.presetId,
    } : {}),
  };
}

function persistTeamStates({ tx, homeTeam, awayTeam, result }) {
  const homePayload = teamPersistencePayload({
    state: result && result.teamStates && result.teamStates[result.game.homeTeamId],
    team: homeTeam,
    teamBoxScore: result && result.game && result.game.boxScore && result.game.boxScore.home,
  });
  const awayPayload = teamPersistencePayload({
    state: result && result.teamStates && result.teamStates[result.game.awayTeamId],
    team: awayTeam,
    teamBoxScore: result && result.game && result.game.boxScore && result.game.boxScore.away,
  });
  if (homeTeam && homeTeam.ref && homePayload) tx.update(homeTeam.ref, homePayload);
  if (awayTeam && awayTeam.ref && awayPayload) tx.update(awayTeam.ref, awayPayload);
}

function applyPayloadToCachedTeam(team, payload) {
  if (!team || !payload) return team;
  return {
    ...team,
    ...payload,
    ref: team.ref,
  };
}

function requestMatchup({ game, uid, nowMs }) {
  if (!game || game.status !== 'scheduled') {
    if (isActiveRequest(game)) throw new MatchupError('already-exists', 'This game already has an active request.');
    throw new MatchupError('failed-precondition', 'Only scheduled games can be requested.');
  }
  assertParticipant(game, uid);
  const opponent = opponentUid(game, uid);
  if (!opponent) {
    return simulateScheduledGame({ game, uid, nowMs });
  }
  return {
    ...game,
    status: 'requested',
    requestedByUid: uid,
    requestedAtMs: nowMs,
    responseDeadlineMs: nowMs + REQUEST_WINDOW_MS,
  };
}

function expireMatchupRequest({ game, nowMs }) {
  if (!game || game.status !== 'requested') {
    throw new MatchupError('failed-precondition', 'Only requested games can expire.');
  }
  if (nowMs <= Number(game.responseDeadlineMs || 0)) {
    throw new MatchupError('failed-precondition', 'Request has not expired yet.');
  }
  return {
    ...game,
    status: 'expired',
    expiredAtMs: nowMs,
  };
}

function acceptMatchupRequest({ game, uid, nowMs }) {
  if (!game || game.status !== 'requested') {
    throw new MatchupError('failed-precondition', 'Only requested games can be accepted.');
  }
  assertParticipant(game, uid);
  if (game.requestedByUid === uid) {
    throw new MatchupError('permission-denied', 'The requesting GM cannot accept their own matchup.');
  }
  if (nowMs > Number(game.responseDeadlineMs || 0)) {
    return expireMatchupRequest({ game, nowMs });
  }
  return {
    ...game,
    status: 'preparing',
    acceptedByUid: uid,
    acceptedAtMs: nowMs,
    preparationDeadlineMs: nowMs + PREPARATION_WINDOW_MS,
  };
}

function simulateScheduledGameResult({ game, uid, nowMs, homeTeam, awayTeam, skipParticipantCheck = false }) {
  if (!game || !['scheduled', 'preparing'].includes(game.status)) {
    throw new MatchupError('failed-precondition', 'This game cannot be simulated yet.');
  }
  if (!skipParticipantCheck) assertParticipant(game, uid);
  const rosterSimulation = homeTeam || awayTeam
    ? simulateRosterGame({ game, homeTeam, awayTeam, nowMs })
    : null;
  const seed = `${game.id}:${game.homeTeamId}:${game.awayTeamId}:${nowMs}`;
  const { homeScore, awayScore } = rosterSimulation || simulatedScore(game, nowMs);
  const result = finalizeGame({
    game,
    uid,
    nowMs,
    homeScore,
    awayScore,
    source: 'simulation',
    teamStates: {
      [game.homeTeamId]: teamStateForFinalization(homeTeam),
      [game.awayTeamId]: teamStateForFinalization(awayTeam),
    },
  });
  const simulatedGame = {
    ...result.game,
    ...(rosterSimulation
      ? {
        boxScore: rosterSimulation.boxScore,
        quarters: rosterSimulation.quarters,
        liveTimeline: rosterSimulation.liveTimeline,
        story: rosterSimulation.story,
        coachingImpact: rosterSimulation.coachingImpact,
      }
      : {
        quarters: quarterScores(homeScore, awayScore, seed),
      }),
  };
  return {
    ...result,
    game: gameWithLiveMode({
      game: simulatedGame,
      nowMs,
      seed,
      homeTeam,
    }),
  };
}

function simulateScheduledGame(args) {
  return simulateScheduledGameResult(args).game;
}

function finalScoreGameResult({
  game,
  uid,
  nowMs,
  homeScore,
  awayScore,
  winnerTeamId,
  skipParticipantCheck = false,
  homeTeam,
  awayTeam,
}) {
  if (!game || !['scheduled', 'preparing', 'simulating'].includes(game.status)) {
    throw new MatchupError('failed-precondition', 'This game cannot be finalized.');
  }
  if (!skipParticipantCheck) assertParticipant(game, uid);
  if (winnerTeamId && (homeScore == null || awayScore == null)) {
    const rosterSimulation = simulateRosterGame({
      game,
      homeTeam,
      awayTeam,
      nowMs,
      winnerTeamId,
    });
    const seed = `${game.id}:${game.homeTeamId}:${game.awayTeamId}:${nowMs}:manual-winner`;
    const result = finalizeGame({
      game,
      uid,
      nowMs,
      homeScore: rosterSimulation.homeScore,
      awayScore: rosterSimulation.awayScore,
      source: 'manual_winner',
      teamStates: {
        [game.homeTeamId]: teamStateForFinalization(homeTeam),
        [game.awayTeamId]: teamStateForFinalization(awayTeam),
      },
    });
    const winnerGame = {
      ...result.game,
      boxScore: rosterSimulation.boxScore,
      quarters: rosterSimulation.quarters,
      liveTimeline: rosterSimulation.liveTimeline,
      story: rosterSimulation.story,
      coachingImpact: rosterSimulation.coachingImpact,
    };
    return {
      ...result,
      game: gameWithLiveMode({
        game: winnerGame,
        nowMs,
        seed,
        homeTeam,
      }),
    };
  }
  const normalizedHomeScore = Number(homeScore);
  const normalizedAwayScore = Number(awayScore);
  if (
    !Number.isInteger(normalizedHomeScore)
    || !Number.isInteger(normalizedAwayScore)
    || normalizedHomeScore < 0
    || normalizedAwayScore < 0
    || normalizedHomeScore === normalizedAwayScore
  ) {
    throw new MatchupError('invalid-argument', 'Enter valid non-tied final scores.');
  }
  return finalizeGame({
    game,
    uid,
    nowMs,
    homeScore: normalizedHomeScore,
    awayScore: normalizedAwayScore,
    source: 'manual',
    teamStates: {
      [game.homeTeamId]: teamStateForFinalization(homeTeam),
      [game.awayTeamId]: teamStateForFinalization(awayTeam),
    },
  });
}

function finalScoreGame(args) {
  return finalScoreGameResult(args).game;
}

function resetScheduledGame({ game, uid, nowMs }) {
  if (!game) {
    throw new MatchupError('not-found', 'Game not found.');
  }
  const {
    requestedByUid,
    requestedAtMs,
    responseDeadlineMs,
    acceptedByUid,
    acceptedAtMs,
    preparationDeadlineMs,
    expiredAtMs,
    simulationStartedByUid,
    simulationStartedAtMs,
    homeScore,
    awayScore,
    winnerTeamId,
    loserTeamId,
    finalScoreSubmittedByUid,
    finalAtMs,
    resultSource,
    completionMarkerId,
    fatigue,
    injuries,
    boxScore,
    quarters,
    liveTimeline,
    liveMode,
    coachingImpact,
    story,
    ...baseGame
  } = game;
  void requestedByUid;
  void requestedAtMs;
  void responseDeadlineMs;
  void acceptedByUid;
  void acceptedAtMs;
  void preparationDeadlineMs;
  void expiredAtMs;
  void simulationStartedByUid;
  void simulationStartedAtMs;
  void homeScore;
  void awayScore;
  void winnerTeamId;
  void loserTeamId;
  void finalScoreSubmittedByUid;
  void finalAtMs;
  void resultSource;
  void completionMarkerId;
  void fatigue;
  void injuries;
  void boxScore;
  void quarters;
  void liveTimeline;
  void liveMode;
  void coachingImpact;
  void story;
  return {
    ...baseGame,
    status: 'scheduled',
    resetByUid: uid,
    resetAtMs: nowMs,
  };
}

function scheduleCompetition(data) {
  if (data && data.competition === 'nbaCup') return 'nbaCup';
  if (data && data.competition === 'playoffs') return 'playoffs';
  return 'regular';
}

function playoffGames(schedule) {
  return schedule && schedule.playoffs && Array.isArray(schedule.playoffs.rounds)
    ? schedule.playoffs.rounds.flatMap(round => (
      (round.series || []).flatMap(series => series.games || [])
    ))
    : [];
}

const PLAYOFF_ROUND_NAMES = {
  short_8: ['quarterfinal', 'semifinal', 'final'],
  traditional_16: ['first_round', 'second_round', 'conference_final', 'final'],
  play_in_16: ['play_in', 'first_round', 'second_round', 'conference_final', 'final'],
};

const PLAYOFF_ROUND_LABELS = {
  play_in: 'Play-In',
  quarterfinal: 'Quarterfinals',
  semifinal: 'Semifinals',
  final: 'Finals',
  first_round: 'First Round',
  second_round: 'Second Round',
  conference_final: 'Conference Finals',
};

const FIRST_ROUND_16_PAIRINGS = [[1, 16], [8, 9], [5, 12], [4, 13], [3, 14], [6, 11], [7, 10], [2, 15]];

function playoffGameId(seed, seriesId, playoffGame) {
  return `nba_playoff_${seed}_${seriesId}_${playoffGame}`.replace(/[^a-zA-Z0-9_]/g, '_');
}

function gmIdForSeriesTeam(series, teamId) {
  const games = Array.isArray(series.games) ? series.games : [];
  for (const game of games) {
    if (game.homeTeamId === teamId) return game.homeGmId || null;
    if (game.awayTeamId === teamId) return game.awayGmId || null;
  }
  return null;
}

function winnerRowForSeries(series) {
  const winnerTeamId = series && series.winnerTeamId;
  if (!winnerTeamId) return null;
  const isHome = winnerTeamId === series.homeTeamId;
  return {
    teamId: winnerTeamId,
    abbreviation: winnerTeamId,
    name: isHome ? series.homeTeamName : series.awayTeamName,
    gmId: gmIdForSeriesTeam(series, winnerTeamId),
    sourceHomeSeed: series.homeSeed,
  };
}

function nextRoundPairings(count) {
  return Array.from({ length: count / 2 }, (_, index) => [index * 2, index * 2 + 1]);
}

function buildPlayoffSeries({ bracket, round, roundIndex, seriesIndex, homeSeed, awaySeed, home, away }) {
  const seriesId = `${round}_${seriesIndex + 1}`;
  const seriesSeed = `${bracket.seed || 'playoffs'}:${bracket.seasonYear || 'season'}`;
  const games = Array.from({ length: 7 }, (_, index) => {
    const playoffGame = index + 1;
    const homeHosts = [1, 2, 5, 7].includes(playoffGame);
    const homeTeam = homeHosts ? home : away;
    const awayTeam = homeHosts ? away : home;
    return {
      id: playoffGameId(seriesSeed, seriesId, playoffGame),
      stage: 'playoffs',
      round,
      seriesId,
      playoffGame,
      week: 100 + roundIndex,
      sequence: roundIndex * 100 + seriesIndex * 10 + playoffGame,
      homeTeamId: homeTeam.teamId,
      awayTeamId: awayTeam.teamId,
      homeGmId: homeTeam.gmId || null,
      awayGmId: awayTeam.gmId || null,
      status: 'scheduled',
    };
  });
  return {
    id: seriesId,
    round,
    roundIndex,
    seriesIndex,
    homeSeed,
    awaySeed,
    homeTeamId: home.teamId,
    awayTeamId: away.teamId,
    homeTeamName: home.name,
    awayTeamName: away.name,
    winnerTeamId: null,
    games,
  };
}

function appendNextPlayoffRound(playoffs) {
  if (!playoffs || !Array.isArray(playoffs.rounds) || playoffs.rounds.length === 0) return playoffs;
  const currentRound = playoffs.rounds[playoffs.rounds.length - 1];
  if (!currentRound || !Array.isArray(currentRound.series) || currentRound.series.some(series => !series.winnerTeamId)) {
    return playoffs;
  }
  const roundNames = PLAYOFF_ROUND_NAMES[playoffs.format] || PLAYOFF_ROUND_NAMES.short_8;
  const nextRoundName = roundNames[(currentRound.roundIndex || 0) + 1];
  if (!nextRoundName) return playoffs;

  if (playoffs.format === 'play_in_16' && currentRound.name === 'play_in') {
    const seededRows = new Map((playoffs.seeds || []).map((row, index) => [index + 1, row]));
    currentRound.series.forEach((series) => {
      const winner = winnerRowForSeries(series);
      if (winner) seededRows.set(series.homeSeed, winner);
    });
    const nextRound = {
      name: 'first_round',
      label: PLAYOFF_ROUND_LABELS.first_round,
      roundIndex: 1,
      series: FIRST_ROUND_16_PAIRINGS.map(([homeSeed, awaySeed], index) => buildPlayoffSeries({
        bracket: playoffs,
        round: 'first_round',
        roundIndex: 1,
        seriesIndex: index,
        homeSeed,
        awaySeed,
        home: seededRows.get(homeSeed),
        away: seededRows.get(awaySeed),
      })),
    };
    return { ...playoffs, rounds: [...playoffs.rounds, nextRound] };
  }

  const winners = currentRound.series.map(winnerRowForSeries).filter(Boolean);
  if (winners.length !== currentRound.series.length || winners.length < 2) return playoffs;
  const nextRound = {
    name: nextRoundName,
    label: PLAYOFF_ROUND_LABELS[nextRoundName] || nextRoundName,
    roundIndex: (currentRound.roundIndex || 0) + 1,
    series: nextRoundPairings(winners.length).map(([homeIndex, awayIndex], index) => buildPlayoffSeries({
      bracket: playoffs,
      round: nextRoundName,
      roundIndex: (currentRound.roundIndex || 0) + 1,
      seriesIndex: index,
      homeSeed: currentRound.series[homeIndex].homeSeed,
      awaySeed: currentRound.series[awayIndex].homeSeed,
      home: winners[homeIndex],
      away: winners[awayIndex],
    })),
  };
  return { ...playoffs, rounds: [...playoffs.rounds, nextRound] };
}

function gamesForCompetition(schedule, competition) {
  if (competition === 'nbaCup') {
    return schedule && schedule.nbaCup && Array.isArray(schedule.nbaCup.games)
      ? schedule.nbaCup.games
      : [];
  }
  if (competition === 'playoffs') return playoffGames(schedule);
  return schedule && Array.isArray(schedule.games) ? schedule.games : [];
}

function syncPlayoffWinners(playoffs) {
  if (!playoffs || !Array.isArray(playoffs.rounds)) return playoffs;
  return appendNextPlayoffRound({
    ...playoffs,
    rounds: playoffs.rounds.map(round => ({
      ...round,
      series: (round.series || []).map((series) => {
        if (series.winnerTeamId) return series;
        const wins = new Map();
        (series.games || []).forEach((game) => {
          if (game.status !== 'final' || !game.winnerTeamId) return;
          wins.set(game.winnerTeamId, (wins.get(game.winnerTeamId) || 0) + 1);
        });
        const winner = [...wins.entries()].find(([, count]) => count >= 4);
        return winner ? { ...series, winnerTeamId: winner[0] } : series;
      }),
    })),
  });
}

function updatePlayoffGames(schedule, games) {
  const gameById = new Map((games || []).map(game => [game.id, game]));
  const playoffs = schedule && schedule.playoffs ? schedule.playoffs : null;
  if (!playoffs || !Array.isArray(playoffs.rounds)) return playoffs;
  return syncPlayoffWinners({
    ...playoffs,
    rounds: playoffs.rounds.map(round => ({
      ...round,
      series: (round.series || []).map(series => ({
        ...series,
        games: (series.games || []).map(game => gameById.get(game.id) || game),
      })),
    })),
  });
}

function updatePayloadForCompetition(competition, games, schedule) {
  if (competition === 'nbaCup') return { 'nbaCup.games': games };
  if (competition === 'playoffs') return { playoffs: updatePlayoffGames(schedule, games) };
  return { games };
}

function selectSimBatch({ games, competition = 'regular', scope = 'all', batchSize = 20 }) {
  const eligible = (games || [])
    .filter(game => game && ['scheduled', 'preparing'].includes(game.status))
    .sort((left, right) => Number(left.sequence || 0) - Number(right.sequence || 0));
  const scoped = competition === 'playoffs' && scope === 'round'
    ? (() => {
      const firstRound = eligible[0] && eligible[0].round;
      return firstRound ? eligible.filter(game => game.round === firstRound) : eligible;
    })()
    : eligible;
  return scoped.slice(0, Math.max(1, Math.min(50, Number(batchSize) || 20)));
}

function mapError(error, HttpsError) {
  if (error instanceof MatchupError || error instanceof FinalizeGameError) {
    return new HttpsError(error.code, error.message, error.details);
  }
  return error;
}

function createMatchupHandler({ getFirestore, HttpsError, now }) {
  return async (request) => {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
    const data = request.data || {};
    const leagueId = typeof data.leagueId === 'string' ? data.leagueId.trim() : '';
    const gameId = typeof data.gameId === 'string' ? data.gameId.trim() : '';
    if (!leagueId || !gameId) throw new HttpsError('invalid-argument', 'Provide leagueId and gameId.');
    return { uid, data, leagueId, gameId, competition: scheduleCompetition(data) };
  };
}

function createGameMutationHandler({ getFirestore, HttpsError, now, mutate }) {
  const base = createMatchupHandler({ getFirestore, HttpsError, now });
  return async (request) => {
    const { uid, leagueId, gameId, competition } = await base(request);
    const db = getFirestore();
    const leagueRef = db.collection('leagues').doc(leagueId);
    return db.runTransaction(async (tx) => {
      const leagueSnap = await tx.get(leagueRef);
      if (!leagueSnap.exists) throw new HttpsError('not-found', 'League not found.');
      const league = leagueSnap.data() || {};
      const scheduleId = league.scheduleId || String(league.currentYear || 2025);
      const scheduleRef = leagueRef.collection('schedules').doc(scheduleId);
      const scheduleSnap = await tx.get(scheduleRef);
      if (!scheduleSnap.exists) throw new HttpsError('not-found', 'Schedule not found.');
      const schedule = scheduleSnap.data() || {};
      const games = gamesForCompetition(schedule, competition);
      const gameIndex = games.findIndex(game => game.id === gameId);
      if (gameIndex < 0) throw new HttpsError('not-found', 'Game not found.');
      const game = games[gameIndex];
      const [homeTeam, awayTeam] = await Promise.all([
        teamForScheduledGame({ tx, db, leagueRef, league, schedule, teamId: game.homeTeamId, gmId: game.homeGmId }),
        teamForScheduledGame({ tx, db, leagueRef, league, schedule, teamId: game.awayTeamId, gmId: game.awayGmId }),
      ]);
      let nextGame;
      try {
        nextGame = mutate({ game, uid, nowMs: now() });
      } catch (error) {
        throw mapError(error, HttpsError);
      }
      const nextGames = [...games];
      nextGames[gameIndex] = nextGame;
      tx.update(scheduleRef, updatePayloadForCompetition(competition, nextGames, schedule));
      const homePayload = teamResetPayload({ game, side: 'home', team: homeTeam });
      const awayPayload = teamResetPayload({ game, side: 'away', team: awayTeam });
      if (homeTeam && homeTeam.ref && homePayload) tx.update(homeTeam.ref, homePayload);
      if (awayTeam && awayTeam.ref && awayPayload) tx.update(awayTeam.ref, awayPayload);
      return nextGame;
    });
  };
}

function isCommissioner(uid, league) {
  return Boolean(
    uid
    && league
    && (
      league.commissionerId === uid
      || (league.coCommissioners || []).includes(uid)
    )
  );
}

function normalizeScheduleKey(value) {
  return String(value || '').trim().toUpperCase();
}

function scheduleAliases(value) {
  const key = normalizeScheduleKey(value);
  if (!key) return [];
  const displayKey = normalizeScheduleKey(displayScheduleAbbr(key));
  const aliases = new Set([key, displayKey]);
  const add = (...values) => values.filter(Boolean).forEach(value => aliases.add(normalizeScheduleKey(value)));
  if (key === 'NOP' || displayKey === 'NOP') add('NOP', 'NOH', 'NOK');
  if (key === 'NOH' || key === 'NOK' || displayKey === 'NOH' || displayKey === 'NOK') add('NOH', 'NOK', 'NOP');
  if (key === 'BKN' || displayKey === 'BKN') add('BKN', 'NJN');
  if (key === 'NJN' || displayKey === 'NJN') add('NJN', 'BKN');
  if (key === 'OKC' || displayKey === 'OKC') add('OKC', 'SEA');
  if (key === 'SEA' || displayKey === 'SEA') add('SEA', 'OKC');
  return [...aliases];
}

function schedulePoolKeys(teamId, participant) {
  const values = [
    teamId,
    displayScheduleAbbr(teamId),
    participant && participant.scheduleTeamId,
    participant && displayScheduleAbbr(participant.scheduleTeamId),
    participant && participant.abbreviation,
    participant && displayScheduleAbbr(participant.abbreviation),
  ].filter(Boolean);
  return new Set(values.flatMap(scheduleAliases).map(normalizeScheduleKey));
}

function poolPlayersForScheduleTeam(poolPlayers, teamId, participant) {
  if (!Array.isArray(poolPlayers)) return [];
  const wanted = schedulePoolKeys(teamId, participant);
  return poolPlayers.filter(player => (
    scheduleAliases(player && (player.team || player.abbreviation || player.teamId)).some(key => wanted.has(key))
  ));
}

function teamFromParticipantFallback({ teamId, participant, poolPlayers = [] }) {
  const players = poolPlayersForScheduleTeam(poolPlayers, teamId, participant);
  return {
    id: participant && (participant.sourceTeamDocId || participant.scheduleTeamId) || teamId,
    teamId: participant && participant.scheduleTeamId || teamId,
    abbreviation: participant && participant.abbreviation || displayScheduleAbbr(teamId) || teamId,
    name: participant && (participant.name || participant.abbreviation) || displayScheduleAbbr(teamId) || teamId,
    players,
  };
}

async function eraPoolPlayersForLeague({ tx, db, league }) {
  if (!tx || !db || !league) return [];
  const sport = String(league.sport || 'nba');
  const poolKey = sport && sport !== 'nba' ? sport : String(league.era || 'current');
  const poolSnap = await tx.get(db.collection('era_player_pools').doc(poolKey));
  if (!poolSnap.exists) return [];
  const pool = poolSnap.data() || {};
  return Array.isArray(pool.players) ? pool.players : [];
}

async function withFallbackRoster({ tx, db, league, team, teamId, participant }) {
  if (team && Array.isArray(team.players) && team.players.length > 0) return team;
  const poolPlayers = await eraPoolPlayersForLeague({ tx, db, league });
  const fallback = teamFromParticipantFallback({ teamId, participant, poolPlayers });
  if (!fallback.players.length) return team || fallback;
  return {
    ...(team || fallback),
    teamId: (team && team.teamId) || fallback.teamId,
    abbreviation: (team && team.abbreviation) || fallback.abbreviation,
    name: (team && team.name) || fallback.name,
    players: fallback.players,
  };
}

function participantForScheduledTeam(schedule, teamId) {
  const wanted = new Set(scheduleAliases(teamId));
  return (schedule.participants || []).find(participant => (
    scheduleAliases(participant.scheduleTeamId).some(key => wanted.has(key))
    || scheduleAliases(participant.abbreviation).some(key => wanted.has(key))
  )) || null;
}

function teamMatchesScheduledSlot(team, teamId, participant) {
  const wanted = schedulePoolKeys(teamId, participant);
  return [
    team && team.teamId,
    team && team.abbreviation,
    team && team.abbr,
    team && team.id,
  ].flatMap(scheduleAliases).some(key => wanted.has(normalizeScheduleKey(key)));
}

async function teamByParticipantGm({ tx, teamsCollection, participant, teamId, gmId: gameGmId }) {
  const gmId = (participant && participant.gmId) || gameGmId;
  if (!gmId || !teamsCollection || typeof teamsCollection.where !== 'function') return null;
  const snap = await tx.get(teamsCollection.where('gmId', '==', gmId));
  const docs = snap && Array.isArray(snap.docs) ? snap.docs : [];
  const matched = docs.find((doc) => {
    const data = doc.data ? doc.data() || {} : {};
    return teamMatchesScheduledSlot({ id: doc.id, ...data }, teamId, participant);
  }) || docs[0];
  if (!matched) return null;
  return {
    id: matched.id,
    ref: matched.ref,
    ...(matched.data ? matched.data() || {} : {}),
  };
}

async function teamForScheduledGame({ tx, db, leagueRef, league, schedule, teamId, gmId }) {
  const participant = participantForScheduledTeam(schedule, teamId);
  const teamsCollection = leagueRef.collection('teams');
  const teamDocId = participant && participant.sourceTeamDocId
    ? participant.sourceTeamDocId
    : null;
  if (teamDocId) {
    const teamRef = teamsCollection.doc(teamDocId);
    const teamSnap = await tx.get(teamRef);
    if (teamSnap.exists) {
      return withFallbackRoster({
        tx,
        db,
        league,
        team: { id: teamSnap.id, ref: teamRef, ...(teamSnap.data() || {}) },
        teamId,
        participant,
      });
    }
  }
  const directRef = teamsCollection.doc(String(teamId));
  const directSnap = await tx.get(directRef);
  if (directSnap.exists) {
    return withFallbackRoster({
      tx,
      db,
      league,
      team: { id: directSnap.id, ref: directRef, ...(directSnap.data() || {}) },
      teamId,
      participant,
    });
  }
  const gmTeam = await teamByParticipantGm({ tx, teamsCollection, participant, teamId, gmId });
  if (gmTeam && gmTeam.ref) {
    return withFallbackRoster({
      tx,
      db,
      league,
      team: gmTeam,
      teamId,
      participant,
    });
  }
  if (!participant) return null;
  const poolPlayers = await eraPoolPlayersForLeague({ tx, db, league });
  return teamFromParticipantFallback({ teamId, participant, poolPlayers });
}

async function coachingPlanForTeam({ tx, scheduleRef, game, team }) {
  if (!team || !team.id) return { firstHalf: null, secondHalf: null };
  const prepRef = scheduleRef.collection('preparation').doc(`${game.id}_${team.id}`);
  const prepSnap = await tx.get(prepRef);
  if (prepSnap.exists) {
    const prep = prepSnap.data() || {};
    const firstHalf = safeCoachingSnapshot(prep.firstHalfPresetSnapshot) || safeCoachingSnapshot(prep.presetSnapshot);
    const secondHalf = safeCoachingSnapshot(prep.secondHalfPresetSnapshot) || firstHalf;
    return { firstHalf, secondHalf };
  }
  const presets = Array.isArray(team.coachingPresets) ? team.coachingPresets : [];
  const firstPreset = presets.find(item => item && item.id === team.defaultCoachingPresetId) || null;
  const secondPreset = presets.find(item => item && item.id === team.defaultSecondHalfCoachingPresetId) || firstPreset;
  const firstHalf = safeCoachingSnapshot(firstPreset);
  const secondHalf = safeCoachingSnapshot(secondPreset) || firstHalf;
  return { firstHalf, secondHalf };
}

function createAdminGameMutationHandler({ getFirestore, HttpsError, now, mutate }) {
  const base = createMatchupHandler({ getFirestore, HttpsError, now });
  return async (request) => {
    const { uid, leagueId, gameId, competition } = await base(request);
    const db = getFirestore();
    const leagueRef = db.collection('leagues').doc(leagueId);
    return db.runTransaction(async (tx) => {
      const leagueSnap = await tx.get(leagueRef);
      if (!leagueSnap.exists) throw new HttpsError('not-found', 'League not found.');
      const league = leagueSnap.data() || {};
      if (!isCommissioner(uid, league)) {
        throw new HttpsError('permission-denied', 'Only commissioners can reset games.');
      }
      const scheduleId = league.scheduleId || String(league.currentYear || 2025);
      const scheduleRef = leagueRef.collection('schedules').doc(scheduleId);
      const scheduleSnap = await tx.get(scheduleRef);
      if (!scheduleSnap.exists) throw new HttpsError('not-found', 'Schedule not found.');
      const schedule = scheduleSnap.data() || {};
      const games = gamesForCompetition(schedule, competition);
      const gameIndex = games.findIndex(game => game.id === gameId);
      if (gameIndex < 0) throw new HttpsError('not-found', 'Game not found.');
      const game = games[gameIndex];
      const [homeTeam, awayTeam] = await Promise.all([
        teamForScheduledGame({ tx, db, leagueRef, league, schedule, teamId: game.homeTeamId, gmId: game.homeGmId }),
        teamForScheduledGame({ tx, db, leagueRef, league, schedule, teamId: game.awayTeamId, gmId: game.awayGmId }),
      ]);
      let nextGame;
      try {
        nextGame = mutate({ game, uid, nowMs: now() });
      } catch (error) {
        throw mapError(error, HttpsError);
      }
      const nextGames = [...games];
      nextGames[gameIndex] = nextGame;
      tx.update(scheduleRef, updatePayloadForCompetition(competition, nextGames, schedule));
      const homePayload = teamResetPayload({ game, side: 'home', team: homeTeam });
      const awayPayload = teamResetPayload({ game, side: 'away', team: awayTeam });
      if (homeTeam && homeTeam.ref && homePayload) tx.update(homeTeam.ref, homePayload);
      if (awayTeam && awayTeam.ref && awayPayload) tx.update(awayTeam.ref, awayPayload);
      return nextGame;
    });
  };
}

function createReportGameScoreHandler({ getFirestore, HttpsError, now }) {
  const base = createMatchupHandler({ getFirestore, HttpsError, now });
  return async (request) => {
    const { uid, data, leagueId, gameId, competition } = await base(request);
    const db = getFirestore();
    const leagueRef = db.collection('leagues').doc(leagueId);
    return db.runTransaction(async (tx) => {
      const leagueSnap = await tx.get(leagueRef);
      if (!leagueSnap.exists) throw new HttpsError('not-found', 'League not found.');
      const league = leagueSnap.data() || {};
      const scheduleId = league.scheduleId || String(league.currentYear || 2025);
      const scheduleRef = leagueRef.collection('schedules').doc(scheduleId);
      const scheduleSnap = await tx.get(scheduleRef);
      if (!scheduleSnap.exists) throw new HttpsError('not-found', 'Schedule not found.');
      const schedule = scheduleSnap.data() || {};
      const games = gamesForCompetition(schedule, competition);
      const gameIndex = games.findIndex(game => game.id === gameId);
      if (gameIndex < 0) throw new HttpsError('not-found', 'Game not found.');
      const game = games[gameIndex];
      const admin = isCommissioner(uid, league);
      if (!admin && !participatingGms(game).includes(uid)) {
        throw new HttpsError('permission-denied', 'Only participating GMs or commissioners can submit this score.');
      }
      const [homeTeam, awayTeam] = await Promise.all([
        teamForScheduledGame({ tx, db, leagueRef, league, schedule, teamId: game.homeTeamId, gmId: game.homeGmId }),
        teamForScheduledGame({ tx, db, leagueRef, league, schedule, teamId: game.awayTeamId, gmId: game.awayGmId }),
      ]);
      const [homePlan, awayPlan] = await Promise.all([
        coachingPlanForTeam({ tx, scheduleRef, game, team: homeTeam }),
        coachingPlanForTeam({ tx, scheduleRef, game, team: awayTeam }),
      ]);
      let result;
      try {
        result = finalScoreGameResult({
          game: gameWithCoachingSnapshots({
            game,
            homeSnapshot: homePlan.firstHalf,
            homeSecondHalfSnapshot: homePlan.secondHalf,
            awaySnapshot: awayPlan.firstHalf,
            awaySecondHalfSnapshot: awayPlan.secondHalf,
          }),
          uid,
          nowMs: now(),
          homeScore: data.homeScore,
          awayScore: data.awayScore,
          winnerTeamId: data.winnerTeamId,
          skipParticipantCheck: admin,
          homeTeam,
          awayTeam,
        });
      } catch (error) {
        throw mapError(error, HttpsError);
      }
      const nextGames = [...games];
      nextGames[gameIndex] = result.game;
      tx.update(scheduleRef, updatePayloadForCompetition(competition, nextGames, schedule));
      persistTeamStates({ tx, homeTeam, awayTeam, result });
      return result.game;
    });
  };
}

function createRequestMatchupHandler(deps) {
  return createGameMutationHandler({
    ...deps,
    mutate: ({ game, uid, nowMs }) => requestMatchup({ game, uid, nowMs }),
  });
}

function createAcceptMatchupHandler(deps) {
  return createGameMutationHandler({
    ...deps,
    mutate: ({ game, uid, nowMs }) => acceptMatchupRequest({ game, uid, nowMs }),
  });
}

function createSimulateScheduledGameHandler(deps) {
  const { getFirestore, HttpsError, now } = deps;
  const base = createMatchupHandler({ getFirestore, HttpsError, now });
  return async (request) => {
    const { uid, leagueId, gameId, competition } = await base(request);
    const db = getFirestore();
    const leagueRef = db.collection('leagues').doc(leagueId);
    return db.runTransaction(async (tx) => {
      const leagueSnap = await tx.get(leagueRef);
      if (!leagueSnap.exists) throw new HttpsError('not-found', 'League not found.');
      const league = leagueSnap.data() || {};
      const scheduleId = league.scheduleId || String(league.currentYear || 2025);
      const scheduleRef = leagueRef.collection('schedules').doc(scheduleId);
      const scheduleSnap = await tx.get(scheduleRef);
      if (!scheduleSnap.exists) throw new HttpsError('not-found', 'Schedule not found.');
      const schedule = scheduleSnap.data() || {};
      const games = gamesForCompetition(schedule, competition);
      const gameIndex = games.findIndex(game => game.id === gameId);
      if (gameIndex < 0) throw new HttpsError('not-found', 'Game not found.');
      const game = games[gameIndex];
      const [homeTeam, awayTeam] = await Promise.all([
        teamForScheduledGame({ tx, db, leagueRef, league, schedule, teamId: game.homeTeamId, gmId: game.homeGmId }),
        teamForScheduledGame({ tx, db, leagueRef, league, schedule, teamId: game.awayTeamId, gmId: game.awayGmId }),
      ]);
      const [homePlan, awayPlan] = await Promise.all([
        coachingPlanForTeam({ tx, scheduleRef, game, team: homeTeam }),
        coachingPlanForTeam({ tx, scheduleRef, game, team: awayTeam }),
      ]);
      let result;
      try {
        result = simulateScheduledGameResult({
          game: gameWithCoachingSnapshots({
            game,
            homeSnapshot: homePlan.firstHalf,
            homeSecondHalfSnapshot: homePlan.secondHalf,
            awaySnapshot: awayPlan.firstHalf,
            awaySecondHalfSnapshot: awayPlan.secondHalf,
          }),
          uid,
          nowMs: now(),
          homeTeam,
          awayTeam,
        });
      } catch (error) {
        throw mapError(error, HttpsError);
      }
      const nextGames = [...games];
      nextGames[gameIndex] = result.game;
      tx.update(scheduleRef, updatePayloadForCompetition(competition, nextGames, schedule));
      persistTeamStates({ tx, homeTeam, awayTeam, result });
      return result.game;
    });
  };
}

function createSimScheduleBatchHandler({ getFirestore, HttpsError, now }) {
  return async (request) => {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
    const data = request.data || {};
    const leagueId = typeof data.leagueId === 'string' ? data.leagueId.trim() : '';
    const action = typeof data.action === 'string' ? data.action : 'step';
    const competition = scheduleCompetition(data);
    const scope = data.scope === 'round' ? 'round' : 'all';
    const batchSize = Number(data.batchSize || 20);
    if (!leagueId) throw new HttpsError('invalid-argument', 'Provide leagueId.');
    const db = getFirestore();
    const leagueRef = db.collection('leagues').doc(leagueId);
    return db.runTransaction(async (tx) => {
      const leagueSnap = await tx.get(leagueRef);
      if (!leagueSnap.exists) throw new HttpsError('not-found', 'League not found.');
      const league = leagueSnap.data() || {};
      if (!isCommissioner(uid, league)) {
        throw new HttpsError('permission-denied', 'Only commissioners can sim league games.');
      }
      const scheduleId = league.scheduleId || String(league.currentYear || 2025);
      const scheduleRef = leagueRef.collection('schedules').doc(scheduleId);
      const scheduleSnap = await tx.get(scheduleRef);
      if (!scheduleSnap.exists) throw new HttpsError('not-found', 'Schedule not found.');
      const schedule = scheduleSnap.data() || {};
      const controlKey = competition === 'playoffs' ? 'playoffSimControl' : 'seasonSimControl';
      const existingControl = schedule[controlKey] || {};
      if (action === 'cancel') {
        const cancelled = {
          ...existingControl,
          status: 'cancelled',
          cancelRequested: true,
          cancelledAtMs: now(),
          cancelledByUid: uid,
        };
        tx.update(scheduleRef, { [controlKey]: cancelled });
        return cancelled;
      }
      if (existingControl.cancelRequested && action !== 'start') {
        return {
          ...existingControl,
          status: 'cancelled',
        };
      }

      const games = gamesForCompetition(schedule, competition);
      const batch = selectSimBatch({ games, competition, scope, batchSize });
      if (batch.length === 0) {
        const completeControl = {
          status: 'complete',
          competition,
          scope,
          completedAtMs: now(),
          finalGames: games.filter(game => game.status === 'final').length,
          totalGames: games.length,
        };
        tx.update(scheduleRef, { [controlKey]: completeControl });
        return completeControl;
      }

      const teamCache = new Map();
      const teamCacheKey = (game, side) => {
        const teamId = side === 'home' ? game.homeTeamId : game.awayTeamId;
        const gmId = side === 'home' ? game.homeGmId : game.awayGmId;
        return `${teamId}:${gmId || ''}`;
      };
      const getTeam = async (game, side) => {
        const teamId = side === 'home' ? game.homeTeamId : game.awayTeamId;
        const gmId = side === 'home' ? game.homeGmId : game.awayGmId;
        const key = teamCacheKey(game, side);
        if (teamCache.has(key)) return teamCache.get(key);
        const team = await teamForScheduledGame({ tx, db, leagueRef, league, schedule, teamId, gmId });
        teamCache.set(key, team);
        return team;
      };

      const contexts = [];
      for (const game of batch) {
        const [homeTeam, awayTeam] = await Promise.all([
          getTeam(game, 'home'),
          getTeam(game, 'away'),
        ]);
        const [homePlan, awayPlan] = await Promise.all([
          coachingPlanForTeam({ tx, scheduleRef, game, team: homeTeam }),
          coachingPlanForTeam({ tx, scheduleRef, game, team: awayTeam }),
        ]);
        contexts.push({
          game,
          homeKey: teamCacheKey(game, 'home'),
          awayKey: teamCacheKey(game, 'away'),
          homePlan,
          awayPlan,
        });
      }

      const nextGames = [...games];
      const simmed = [];
      for (const context of contexts) {
        const { game, homePlan, awayPlan } = context;
        const gameIndex = nextGames.findIndex(item => item.id === game.id);
        if (gameIndex < 0) continue;
        const homeTeam = teamCache.get(context.homeKey);
        const awayTeam = teamCache.get(context.awayKey);
        let result;
        try {
          result = simulateScheduledGameResult({
            game: gameWithCoachingSnapshots({
              game,
              homeSnapshot: homePlan.firstHalf,
              homeSecondHalfSnapshot: homePlan.secondHalf,
              awaySnapshot: awayPlan.firstHalf,
              awaySecondHalfSnapshot: awayPlan.secondHalf,
            }),
            uid,
            nowMs: now(),
            homeTeam,
            awayTeam,
            skipParticipantCheck: true,
          });
        } catch (error) {
          throw mapError(error, HttpsError);
        }
        nextGames[gameIndex] = result.game;
        simmed.push(result.game.id);
        const homePayload = teamPersistencePayload({
          state: result.teamStates && result.teamStates[result.game.homeTeamId],
          team: homeTeam,
          teamBoxScore: result.game.boxScore && result.game.boxScore.home,
        });
        const awayPayload = teamPersistencePayload({
          state: result.teamStates && result.teamStates[result.game.awayTeamId],
          team: awayTeam,
          teamBoxScore: result.game.boxScore && result.game.boxScore.away,
        });
        if (homeTeam && homeTeam.ref && homePayload) {
          tx.update(homeTeam.ref, homePayload);
          teamCache.set(context.homeKey, applyPayloadToCachedTeam(homeTeam, homePayload));
        }
        if (awayTeam && awayTeam.ref && awayPayload) {
          tx.update(awayTeam.ref, awayPayload);
          teamCache.set(context.awayKey, applyPayloadToCachedTeam(awayTeam, awayPayload));
        }
      }
      const remaining = nextGames.filter(game => ['scheduled', 'preparing'].includes(game.status)).length;
      const control = {
        status: remaining === 0 ? 'complete' : 'running',
        competition,
        scope,
        batchSize: Math.max(1, Math.min(50, batchSize || 20)),
        lastBatchGameIds: simmed,
        updatedAtMs: now(),
        startedAtMs: action === 'start' || !existingControl.startedAtMs ? now() : existingControl.startedAtMs,
        startedByUid: existingControl.startedByUid || uid,
        finalGames: nextGames.filter(game => game.status === 'final').length,
        totalGames: nextGames.length,
        remainingGames: remaining,
        cancelRequested: false,
      };
      tx.update(scheduleRef, {
        ...updatePayloadForCompetition(competition, nextGames, schedule),
        [controlKey]: control,
      });
      return control;
    });
  };
}

function createExpireMatchupRequestHandler(deps) {
  return createGameMutationHandler({
    ...deps,
    mutate: ({ game, nowMs }) => expireMatchupRequest({ game, nowMs }),
  });
}

function createResetScheduledGameHandler(deps) {
  return createAdminGameMutationHandler({
    ...deps,
    mutate: ({ game, uid, nowMs }) => resetScheduledGame({ game, uid, nowMs }),
  });
}

module.exports = {
  MatchupError,
  REQUEST_WINDOW_MS,
  PREPARATION_WINDOW_MS,
  acceptMatchupRequest,
  applyCoachingGradeAdjustmentsForSimulation,
  applyCoachingToTeamForSimulation,
  coachingGradeAdjustmentsForPlayer,
  createAcceptMatchupHandler,
  createExpireMatchupRequestHandler,
  createReportGameScoreHandler,
  createRequestMatchupHandler,
  createResetScheduledGameHandler,
  createSimScheduleBatchHandler,
  createSimulateScheduledGameHandler,
  expireMatchupRequest,
  finalScoreGame,
  finalScoreGameResult,
  gameWithCoachingSnapshots,
  gamesForCompetition,
  requestMatchup,
  resetScheduledGame,
  scheduleAliases,
  scheduleCompetition,
  selectSimBatch,
  simulateScheduledGame,
  simulateScheduledGameResult,
  teamFromParticipantFallback,
  teamPersistencePayload,
  teamResetPayload,
  teamStateUpdatePayload,
  updatePayloadForCompetition,
};
