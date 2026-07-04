'use strict';

class PlayerUpgradeError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'PlayerUpgradeError';
    this.code = code;
    this.details = details;
  }
}

const GRADE_LADDER = ['F', 'D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+', 'S'];
const LIMITED_LABELS = new Set(['STAR', 'SUPERSTAR', 'LEGEND']);
const DEFENSE_CREDIT_ABILITIES = new Set([
  'perimeterDefense',
  'postDefense',
  'blocking',
  'steals',
  'defenseIq',
  'helpDefense',
  'rebounding',
]);
const GRADE_NUMERIC_FLOOR = {
  F: 0,
  'D-': 50,
  D: 53,
  'D+': 57,
  'C-': 60,
  C: 65,
  'C+': 70,
  'B-': 75,
  B: 80,
  'B+': 85,
  'A-': 89,
  A: 92,
  'A+': 95,
  S: 99,
};
const GRADE_VALUE = {
  F: 25,
  'D-': 50,
  D: 53,
  'D+': 57,
  'C-': 60,
  C: 65,
  'C+': 70,
  'B-': 75,
  B: 80,
  'B+': 85,
  'A-': 89,
  A: 92,
  'A+': 95,
  S: 99,
};
const DEVELOPMENT_ASSIGNMENT_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const NBA_MINIMUM_CONTRACT_CUTOFF = 1_300_000;
const UPGRADE_BUCKETS = {
  shooting: [
    ['threePoint', 0.36],
    ['midRange', 0.22],
    ['freeThrow', 0.12],
    ['shotIq', 0.12],
    ['overallOffense', 0.1],
    ['finishing', 0.08],
  ],
  playmaking: [
    ['playmaking', 0.42],
    ['passing', 0.24],
    ['ballHandle', 0.18],
    ['offenseIq', 0.1],
    ['basketballIq', 0.06],
  ],
  defense: [
    ['perimeterDefense', 0.32],
    ['interiorDefense', 0.25],
    ['defenseIq', 0.18],
    ['steals', 0.12],
    ['blocking', 0.08],
    ['rebounding', 0.05],
  ],
  rebounding: [
    ['rebounding', 0.58],
    ['interiorDefense', 0.16],
    ['blocking', 0.12],
    ['strength', 0.08],
    ['athleticism', 0.06],
  ],
  athleticism: [
    ['athleticism', 0.5],
    ['speed', 0.18],
    ['acceleration', 0.14],
    ['finishing', 0.1],
    ['stamina', 0.08],
  ],
  basketballIq: [
    ['basketballIq', 0.42],
    ['offenseIq', 0.18],
    ['defenseIq', 0.18],
    ['shotIq', 0.12],
    ['playmaking', 0.1],
  ],
  consistency: [
    ['consistency', 0.5],
    ['stamina', 0.2],
    ['shotIq', 0.16],
    ['basketballIq', 0.14],
  ],
  chemistry: [
    ['chemistry', 0.55],
    ['basketballIq', 0.2],
    ['playmaking', 0.15],
    ['defenseIq', 0.1],
  ],
};
const DETAILED_UPGRADE_KEYS = [
  'closeShot',
  'drivingLayup',
  'drivingDunk',
  'standingDunk',
  'drawFoul',
  'hands',
  'midRange',
  'threePoint',
  'freeThrow',
  'dunking',
  'shotIq',
  'shotConsistency',
  'passing',
  'passIq',
  'passVision',
  'ballHandle',
  'speedWithBall',
  'offenseIq',
  'clutch',
  'perimeterDefense',
  'lateralQuickness',
  'postDefense',
  'blocking',
  'steals',
  'defenseIq',
  'helpDefense',
  'speed',
  'acceleration',
  'vertical',
  'agility',
  'strength',
  'rebounding',
  'offensiveRebound',
  'defensiveRebound',
  'postOffense',
  'stamina',
  'hustle',
  'durability',
  'potential',
];

function normalizedLabel(label) {
  return String(label || '').trim().toUpperCase();
}

function numberFrom(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function gradeFromRating(value) {
  const rating = Math.max(0, Math.min(100, Math.round(value)));
  if (rating >= 99) return 'S';
  if (rating >= 95) return 'A+';
  if (rating >= 92) return 'A';
  if (rating >= 89) return 'A-';
  if (rating >= 85) return 'B+';
  if (rating >= 80) return 'B';
  if (rating >= 75) return 'B-';
  if (rating >= 70) return 'C+';
  if (rating >= 65) return 'C';
  if (rating >= 60) return 'C-';
  if (rating >= 57) return 'D+';
  if (rating >= 53) return 'D';
  if (rating >= 50) return 'D-';
  return 'F';
}

function ratingFromGrade(raw) {
  const grade = String(raw || '').trim().toUpperCase();
  return GRADE_VALUE[grade] === undefined ? null : GRADE_VALUE[grade];
}

function ratingFromEntry(entry) {
  if (typeof entry === 'number' && Number.isFinite(entry)) return entry;
  if (typeof entry === 'string') return ratingFromGrade(entry);
  if (!entry || typeof entry !== 'object') return null;
  if (typeof entry.rating === 'number' && Number.isFinite(entry.rating)) return entry.rating;
  return ratingFromGrade(entry.grade || entry.value);
}

function firstCanonicalRating(player, key) {
  const sources = [
    player && player.category_skill_grades,
    player && player.skill_grades,
    player && player.attribute_model,
    player && player.era_adjusted_profiles,
    player && player.hidden,
  ].filter(Boolean);
  for (const source of sources) {
    const rating = ratingFromEntry(source[key]);
    if (rating !== null) return rating;
  }
  return null;
}

function weightedBucketGrade(player, bucket) {
  let total = 0;
  let weightTotal = 0;
  for (const [key, weight] of bucket) {
    const rating = firstCanonicalRating(player, key);
    if (rating === null) continue;
    total += rating * weight;
    weightTotal += weight;
  }
  return weightTotal > 0 ? gradeFromRating(total / weightTotal) : null;
}

function abilityGradesFromCanonicalRatings(player) {
  if (!player || typeof player !== 'object') return null;
  const hasCanonical = player.category_skill_grades || player.skill_grades || player.attribute_model || player.era_adjusted_profiles || player.hidden;
  if (!hasCanonical) return null;
  const grades = {};
  for (const [ability, bucket] of Object.entries(UPGRADE_BUCKETS)) {
    const grade = weightedBucketGrade(player, bucket);
    if (grade) grades[ability] = grade;
  }
  for (const ability of DETAILED_UPGRADE_KEYS) {
    const rating = firstCanonicalRating(player, ability);
    if (rating !== null) grades[ability] = gradeFromRating(rating);
  }
  return Object.keys(grades).length > 0 ? grades : null;
}

function abilityGradesFromStats(player) {
  const ppg = numberFrom(player && player.ppg);
  const apg = numberFrom(player && player.apg);
  const rpg = numberFrom(player && player.rpg);
  const spg = numberFrom(player && (player.spg ?? player.stl));
  const bpg = numberFrom(player && (player.bpg ?? player.blk));
  const fg3 = numberFrom(player && (player.fg3_pct ?? player.three_pct));
  const gp = Math.max(1, numberFrom(player && player.gp));

  return {
    shooting: gradeFromRating(58 + Math.min(34, ppg * 1.2) + Math.min(8, fg3 * 20)),
    playmaking: gradeFromRating(56 + Math.min(36, apg * 4)),
    defense: gradeFromRating(58 + Math.min(34, (spg * 10) + (bpg * 7))),
    rebounding: gradeFromRating(55 + Math.min(38, rpg * 3)),
    athleticism: gradeFromRating(62 + Math.min(24, ppg * 0.5 + rpg * 0.8 + spg * 3)),
    basketballIq: gradeFromRating(60 + Math.min(32, gp * 0.25 + apg * 2 + ppg * 0.25)),
    consistency: gradeFromRating(60 + Math.min(30, gp * 0.3)),
    chemistry: gradeFromRating(65),
  };
}

function upgradeGradesForPlayer(player) {
  const canonical = abilityGradesFromCanonicalRatings(player);
  if (canonical) {
    return {
      ...(player && player.grades || {}),
      ...(player && player.abilityGrades || {}),
      ...canonical,
    };
  }
  return { ...(player && player.grades || player && player.abilityGrades || abilityGradesFromStats(player)) };
}

function nextGrade(current, label) {
  const index = GRADE_LADDER.indexOf(current);
  if (index < 0) return current;
  const candidate = GRADE_LADDER[Math.min(index + 1, GRADE_LADDER.length - 1)];
  return candidate;
}

function hiddenFloorForGrade(grade) {
  return GRADE_NUMERIC_FLOOR[grade] || 0;
}

function advanceDevelopmentGrade(grade, levels = 2) {
  const index = GRADE_LADDER.indexOf(grade);
  if (index < 0) return grade;
  return GRADE_LADDER[Math.min(index + levels, GRADE_LADDER.length - 1)];
}

function syncedRatingSource(source, ability, grade, rating) {
  if (!source || typeof source !== 'object') return source;
  const current = source[ability];
  const nextValue = current && typeof current === 'object'
    ? { ...current, grade, rating }
    : typeof current === 'number'
      ? rating
      : grade;
  return {
    ...source,
    [ability]: nextValue,
  };
}

function developmentPlayerId(player) {
  return String(player && (player.id || player.player_id || player.playerId || player.full_name || player.name) || '');
}

function developmentPlayerName(player) {
  return player && (player.full_name || player.name) || 'Player';
}

function isDevelopmentEligiblePlayer(player) {
  const labels = [
    player && player.contractType,
    player && player.contract_type,
    player && player.rosterSlot,
    player && player.roster_slot,
    player && player.status,
  ].map(value => String(value || '').trim().toLowerCase()).filter(Boolean);
  if (labels.some(label => label.includes('two') && label.includes('way'))) return true;
  if (labels.some(label => label.includes('minimum') || label === 'min')) return true;
  const salary = numberFrom(player && player.salary);
  return salary > 0 && salary <= NBA_MINIMUM_CONTRACT_CUTOFF;
}

function isAssignmentActive(assignment, nowMs) {
  return Boolean(assignment && assignment.status === 'active' && numberFrom(assignment.completesAtMs) > nowMs);
}

function gradeFromEntry(entry) {
  if (typeof entry === 'string' && GRADE_LADDER.includes(entry)) return entry;
  if (!entry || typeof entry !== 'object') return null;
  const grade = entry.grade || entry.value;
  return typeof grade === 'string' && GRADE_LADDER.includes(grade) ? grade : null;
}

function developmentPlayerGrade(player, gradeKey) {
  const sources = [
    player && player.skill_grades,
    player && player.category_skill_grades,
    player && player.grades,
    player && player.abilityGrades,
    player && player.visible && player.visible.grades,
  ].filter(Boolean);
  for (const source of sources) {
    const grade = gradeFromEntry(source[gradeKey]);
    if (grade) return grade;
  }
  return null;
}

function applyDevelopmentGradeToPlayer(player, gradeKey, grade) {
  const rating = hiddenFloorForGrade(grade);
  const nextHidden = player.hidden && typeof player.hidden === 'object'
    ? {
      ...player.hidden,
      [gradeKey]: Math.max(numberFrom(player.hidden[gradeKey]), rating),
    }
    : player.hidden;
  const nextVisible = player.visible && typeof player.visible === 'object'
    ? {
      ...player.visible,
      grades: {
        ...(player.visible.grades || {}),
        [gradeKey]: grade,
      },
    }
    : player.visible;
  return {
    ...player,
    grades: player.grades ? { ...player.grades, [gradeKey]: grade } : player.grades,
    abilityGrades: player.abilityGrades ? { ...player.abilityGrades, [gradeKey]: grade } : player.abilityGrades,
    skill_grades: syncedRatingSource(player.skill_grades, gradeKey, grade, rating),
    category_skill_grades: syncedRatingSource(player.category_skill_grades, gradeKey, grade, rating),
    attribute_model: syncedRatingSource(player.attribute_model, gradeKey, grade, rating),
    era_adjusted_profiles: syncedRatingSource(player.era_adjusted_profiles, gradeKey, grade, rating),
    hidden: nextHidden,
    visible: nextVisible,
  };
}

function startDevelopmentAssignment({ team, playerId: targetPlayerId, gradeKey, gradeLabel, nowMs }) {
  const errors = [];
  if (isAssignmentActive(team && team.developmentAssignment, nowMs)) errors.push('assignment_active');
  const player = ((team && team.players) || []).find(item => developmentPlayerId(item) === targetPlayerId);
  if (!player) errors.push('player_missing');
  if (player && !isDevelopmentEligiblePlayer(player)) errors.push('player_not_eligible');
  const currentGrade = player ? developmentPlayerGrade(player, gradeKey) : null;
  if (!gradeKey || !currentGrade) errors.push('grade_missing');
  if (errors.length > 0) return { valid: false, errors };
  const toGrade = advanceDevelopmentGrade(currentGrade, 2);
  if (toGrade === currentGrade) return { valid: false, errors: ['grade_maxed'] };
  return {
    valid: true,
    errors: [],
    assignment: {
      playerId: targetPlayerId,
      playerName: developmentPlayerName(player),
      gradeKey,
      gradeLabel,
      fromGrade: currentGrade,
      toGrade,
      status: 'active',
      startedAtMs: nowMs,
      completesAtMs: nowMs + DEVELOPMENT_ASSIGNMENT_DURATION_MS,
    },
  };
}

function completeDevelopmentAssignment({ team, nowMs }) {
  const assignment = team && team.developmentAssignment;
  const players = (team && Array.isArray(team.players)) ? team.players : [];
  if (!assignment || assignment.status !== 'active') return { valid: false, errors: ['assignment_missing'], players };
  if (numberFrom(assignment.completesAtMs) > nowMs) return { valid: false, errors: ['assignment_not_ready'], players, assignment };
  const index = players.findIndex(item => developmentPlayerId(item) === assignment.playerId);
  if (index < 0) return { valid: false, errors: ['player_missing'], players, assignment };
  const currentGrade = developmentPlayerGrade(players[index], assignment.gradeKey) || assignment.fromGrade;
  if (!currentGrade) return { valid: false, errors: ['grade_missing'], players, assignment };
  const toGrade = assignment.toGrade || advanceDevelopmentGrade(currentGrade, 2);
  const nextPlayers = [...players];
  nextPlayers[index] = applyDevelopmentGradeToPlayer(nextPlayers[index], assignment.gradeKey, toGrade);
  return {
    valid: true,
    errors: [],
    players: nextPlayers,
    assignment: {
      ...assignment,
      fromGrade: assignment.fromGrade || currentGrade,
      toGrade,
      status: 'completed',
      completedAtMs: nowMs,
    },
  };
}

function accoladeTexts(player) {
  if (Array.isArray(player && player.accolades)) {
    return player.accolades.map(item => String(item || '').toLowerCase());
  }
  const awards = player && player.awards && typeof player.awards === 'object' ? player.awards : {};
  return Object.entries(awards)
    .filter(([, count]) => Number(count || 0) > 0)
    .flatMap(([key, count]) => Array.from({ length: Number(count || 0) }, () => String(key).toLowerCase()));
}

function countAccolades(texts, matcher) {
  return texts.filter(matcher).length;
}

function derivePlayerLabel(player) {
  const saved = normalizedLabel(player && (player.playerLabel || player.tierLabel || player.reputation));
  if (saved) return saved;
  const manual = normalizedLabel(player && (player.tierOverride || player.manualTier || player.franchiseTier));
  if (manual) return manual;
  const accolades = accoladeTexts(player);
  const mvpCount = countAccolades(accolades, text => text.includes('mvp') && !text.includes('all-star') && !text.includes('all star'));
  const finalsMvpCount = countAccolades(accolades, text => text.includes('finals') && text.includes('mvp'));
  const championshipCount = countAccolades(accolades, text => text.includes('champion') || text.includes('championship') || text.includes('nba title'));
  const allLeagueCount = countAccolades(accolades, text => text.includes('all-star') || text.includes('all star') || text.includes('all-nba') || text.includes('all nba'));
  if (mvpCount >= 2 || finalsMvpCount >= 2 || championshipCount >= 3 || allLeagueCount >= 8) return 'LEGEND';
  if (mvpCount >= 1 || finalsMvpCount >= 1 || accolades.some(text => text.includes('all_nba_1st') || text.includes('all-nba 1') || text.includes('all nba 1') || text.includes('all-nba first'))) {
    return 'SUPERSTAR';
  }
  if (numberFrom(player && player.ppg) >= 25) return 'SUPERSTAR';
  if (
    numberFrom(player && player.ppg) >= 20
    || accolades.some(text => text.includes('all-star') || text.includes('all star') || text.includes('all_nba_2nd') || text.includes('all_nba_3rd') || text.includes('dpoy') || text.includes('defensive player of the year'))
  ) {
    return 'STAR';
  }
  return 'ROLE PLAYER';
}

function canUpgradePlayerThisSeason({ label, upgradesUsedThisSeason }) {
  if (!LIMITED_LABELS.has(normalizedLabel(label))) return true;
  return Number(upgradesUsedThisSeason || 0) < 1;
}

function upgradeCost(target) {
  if (target === 'S') return { teamPoints: 4, starTrainingTokens: 1 };
  if (target === 'A+') return { teamPoints: 3, starTrainingTokens: 0 };
  if (target === 'A' || target === 'A-') return { teamPoints: 2, starTrainingTokens: 0 };
  return { teamPoints: 1, starTrainingTokens: 0 };
}

function creditAppliesToAbility(credit, ability) {
  if (Number(credit && credit.remaining || 0) <= 0) return false;
  const allowed = Array.isArray(credit.allowedAbilities) ? credit.allowedAbilities : [];
  if (allowed.length === 0) return true;
  return allowed.includes(ability);
}

function spendTeamUpgradePoint({ team, player, ability, seasonYear }) {
  if (!team) throw new PlayerUpgradeError('not-found', 'Team not found.');
  if (!player) throw new PlayerUpgradeError('not-found', 'Player not found.');
  const points = Number(team.upgradePoints || 0);
  const starTrainingTokens = Number(team.starTrainingTokens || 0);
  const grades = upgradeGradesForPlayer(player);
  const current = grades[ability];
  if (!current) throw new PlayerUpgradeError('invalid-argument', 'Choose a valid ability to upgrade.');
  const usageKey = String(seasonYear || 'current');
  const upgradeUsage = { ...(player.upgradeUsage || {}) };
  const playerCredits = Array.isArray(player.playerUpgradeCredits && player.playerUpgradeCredits[usageKey])
    ? player.playerUpgradeCredits[usageKey].map(credit => ({ ...credit, remaining: Math.max(0, Number(credit.remaining || 0)) }))
    : [];
  const used = Number(upgradeUsage[usageKey] || 0);
  const playerLabel = derivePlayerLabel(player);
  if (!canUpgradePlayerThisSeason({ label: playerLabel, upgradesUsedThisSeason: used })) {
    throw new PlayerUpgradeError('failed-precondition', 'This player has reached their upgrade limit for the season.');
  }
  const upgraded = nextGrade(current, playerLabel);
  if (upgraded === current) {
    throw new PlayerUpgradeError('failed-precondition', 'This grade cannot be upgraded further.');
  }
  const cost = upgradeCost(upgraded);
  const creditIndex = playerCredits.findIndex(credit => creditAppliesToAbility(credit, ability));
  const teamPointCost = Math.max(0, cost.teamPoints - (creditIndex >= 0 ? 1 : 0));
  if (points < teamPointCost) throw new PlayerUpgradeError('failed-precondition', 'This team does not have enough development points.');
  if (starTrainingTokens < cost.starTrainingTokens) throw new PlayerUpgradeError('failed-precondition', 'This upgrade requires a Star Training Token.');
  const upgradedFloor = hiddenFloorForGrade(upgraded);
  const nextHidden = player.hidden && typeof player.hidden === 'object'
    ? {
      ...player.hidden,
      [ability]: Math.max(
        numberFrom(player.hidden[ability]),
        upgradedFloor,
      ),
    }
    : player.hidden;
  const nextVisible = player.visible && typeof player.visible === 'object'
    ? {
      ...player.visible,
      grades: {
        ...(player.visible.grades || {}),
        [ability]: upgraded,
      },
    }
    : player.visible;
  return {
    team: {
      ...team,
      upgradePoints: points - teamPointCost,
      starTrainingTokens: starTrainingTokens - cost.starTrainingTokens,
    },
    player: {
      ...player,
      grades: { ...grades, [ability]: upgraded },
      abilityGrades: player.abilityGrades
        ? { ...player.abilityGrades, [ability]: upgraded }
        : player.abilityGrades,
      category_skill_grades: syncedRatingSource(player.category_skill_grades, ability, upgraded, upgradedFloor),
      skill_grades: syncedRatingSource(player.skill_grades, ability, upgraded, upgradedFloor),
      attribute_model: syncedRatingSource(player.attribute_model, ability, upgraded, upgradedFloor),
      era_adjusted_profiles: syncedRatingSource(player.era_adjusted_profiles, ability, upgraded, upgradedFloor),
      hidden: nextHidden,
      visible: nextVisible,
      playerUpgradeCredits: {
        ...(player.playerUpgradeCredits || {}),
        [usageKey]: playerCredits.map((credit, index) => (
          index === creditIndex ? { ...credit, remaining: Math.max(0, Number(credit.remaining || 0) - 1) } : credit
        )),
      },
      upgradeUsage: { ...upgradeUsage, [usageKey]: used + 1 },
    },
  };
}

function creditMatchesPlayer(credit, player) {
  const creditPlayerId = String(credit && (credit.playerId || credit.player_id || '')).trim();
  const creditPlayerName = String(credit && credit.playerName || '').trim().toLowerCase();
  if (creditPlayerId && playerId(player) === creditPlayerId) return true;
  if (creditPlayerName && String(player && (player.full_name || player.name) || '').trim().toLowerCase() === creditPlayerName) return true;
  return !creditPlayerId && !creditPlayerName;
}

function applyPlayerCreditsToRoster(players, credits, seasonKey) {
  const remainingCredits = [...(credits || [])];
  return (players || []).map((player) => {
    const matched = remainingCredits.filter(credit => creditMatchesPlayer(credit, player));
    matched.forEach(credit => {
      const index = remainingCredits.indexOf(credit);
      if (index >= 0) remainingCredits.splice(index, 1);
    });
    if (matched.length === 0) return player;
    return {
      ...player,
      playerUpgradeCredits: {
        ...(player.playerUpgradeCredits || {}),
        [seasonKey]: [
          ...((player.playerUpgradeCredits && player.playerUpgradeCredits[seasonKey]) || []),
          ...matched,
        ],
      },
    };
  });
}

function applySeasonUpgradeGrants({ teams, grants, seasonYear }) {
  const grantByTeam = new Map((grants || []).map(grant => [String(grant.teamId), grant]));
  const seasonKey = String(seasonYear || 'current');
  return (teams || []).map((team) => {
    const grant = grantByTeam.get(String(team.id || team.teamId || team.abbreviation || ''));
    if (!grant || Number(grant.totalPoints || 0) <= 0) return team;
    const existingGrants = team.upgradePointGrants || {};
    if (existingGrants[seasonKey]) return team;
    const playerCredits = Array.isArray(grant.playerCredits) ? grant.playerCredits : [];
    return {
      ...team,
      upgradePoints: Number(team.upgradePoints || 0) + Number(grant.totalPoints || 0),
      starTrainingTokens: Number(team.starTrainingTokens || 0) + Number(grant.starTrainingTokens || 0),
      players: applyPlayerCreditsToRoster(team.players || [], playerCredits, seasonKey),
      upgradePointGrants: {
        ...existingGrants,
        [seasonKey]: {
          awardPoints: Number(grant.awardPoints || 0),
          lotteryBoostPoints: Number(grant.lotteryBoostPoints || 0),
          rebuildPoints: Number(grant.rebuildPoints || 0),
          totalPoints: Number(grant.totalPoints || 0),
          starTrainingTokens: Number(grant.starTrainingTokens || 0),
          playerCredits,
        },
      },
    };
  });
}

function prepareSeasonGrantUpdates({ teams, grants, seasonYear }) {
  const nextTeams = applySeasonUpgradeGrants({ teams, grants, seasonYear });
  return nextTeams
    .map((team, index) => {
      const original = (teams || [])[index] || {};
      if (
        Number(team.upgradePoints || 0) === Number(original.upgradePoints || 0)
        && Number(team.starTrainingTokens || 0) === Number(original.starTrainingTokens || 0)
        && JSON.stringify(team.players || []) === JSON.stringify(original.players || [])
        && JSON.stringify(team.upgradePointGrants || {}) === JSON.stringify(original.upgradePointGrants || {})
      ) {
        return null;
      }
      return {
        ref: original.ref,
        teamId: team.id || team.teamId || team.abbreviation,
        upgradePoints: team.upgradePoints,
        starTrainingTokens: Number(team.starTrainingTokens || 0),
        players: team.players || [],
        upgradePointGrants: team.upgradePointGrants || {},
      };
    })
    .filter(Boolean);
}

function normalizedTeamKey(value) {
  return String(value || '').trim().toUpperCase();
}

function teamKeys(team) {
  return [
    team && team.id,
    team && team.teamId,
    team && team.abbreviation,
    team && team.abbr,
    team && team.name,
  ].map(normalizedTeamKey).filter(Boolean);
}

function teamDisplayName(team) {
  return team && (team.name || team.full_name || team.abbreviation || team.abbr || team.teamId || team.id) || 'Team';
}

function createUpgradePointNotifications({ teams, updates, leagueId, leagueName, seasonYear, createdAt }) {
  const seasonKey = String(seasonYear || 'current');
  return (updates || []).flatMap((update) => {
    const updateKey = normalizedTeamKey(update && update.teamId);
    const team = (teams || []).find(item => teamKeys(item).includes(updateKey));
    if (!team || !team.gmId) return [];
    const grant = update.upgradePointGrants && update.upgradePointGrants[seasonKey]
      ? update.upgradePointGrants[seasonKey]
      : {};
    const totalPoints = Number(grant.totalPoints || 0);
    return [{
      uid: team.gmId,
      notification: {
        id: `upgrade-points:${leagueId}:${seasonKey}:${team.id || team.teamId || update.teamId}`,
        type: 'upgrade_points',
        leagueId,
        leagueName: leagueName || '',
        teamId: team.id || team.teamId || team.abbreviation || update.teamId,
        createdAt,
        read: false,
        message: `${teamDisplayName(team)} received ${totalPoints} upgrade points for ${seasonYear}.`,
      },
    }];
  });
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

function playerId(player) {
  return String(player && (player.id || player.player_id || player.playerId || player.full_name || player.name) || '');
}

function createSpendPlayerUpgradeHandler({ getFirestore, HttpsError }) {
  return async (request) => {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
    const data = request.data || {};
    const leagueId = typeof data.leagueId === 'string' ? data.leagueId.trim() : '';
    const teamId = typeof data.teamId === 'string' ? data.teamId.trim() : '';
    const targetPlayerId = typeof data.playerId === 'string' ? data.playerId.trim() : '';
    const ability = typeof data.ability === 'string' ? data.ability.trim() : '';
    if (!leagueId || !teamId || !targetPlayerId || !ability) {
      throw new HttpsError('invalid-argument', 'Provide leagueId, teamId, playerId, and ability.');
    }

    const db = getFirestore();
    const leagueRef = db.collection('leagues').doc(leagueId);
    const teamRef = leagueRef.collection('teams').doc(teamId);
    return db.runTransaction(async (tx) => {
      const [leagueSnap, teamSnap] = await Promise.all([tx.get(leagueRef), tx.get(teamRef)]);
      if (!leagueSnap.exists) throw new HttpsError('not-found', 'League not found.');
      if (!teamSnap.exists) throw new HttpsError('not-found', 'Team not found.');
      const league = leagueSnap.data() || {};
      const team = { id: teamSnap.id, ...teamSnap.data() };
      if (team.gmId !== uid && !isCommissioner(uid, league)) {
        throw new HttpsError('permission-denied', 'Only the team GM or commissioner can spend upgrade points.');
      }
      const players = Array.isArray(team.players) ? team.players : [];
      const index = players.findIndex(player => playerId(player) === targetPlayerId);
      if (index < 0) throw new HttpsError('not-found', 'Player not found.');
      let next;
      try {
        next = spendTeamUpgradePoint({
          team,
          player: players[index],
          ability,
          seasonYear: league.currentYear,
        });
      } catch (error) {
        if (error instanceof PlayerUpgradeError) {
          throw new HttpsError(error.code, error.message, error.details);
        }
        throw error;
      }
      const nextPlayers = [...players];
      nextPlayers[index] = next.player;
      tx.update(teamRef, {
        players: nextPlayers,
        upgradePoints: next.team.upgradePoints,
        starTrainingTokens: next.team.starTrainingTokens,
      });
      return {
        player: next.player,
        upgradePoints: next.team.upgradePoints,
        starTrainingTokens: next.team.starTrainingTokens,
      };
    });
  };
}

function mapDevelopmentError(HttpsError, code) {
  const messages = {
    assignment_active: 'Only one player can be in the Development League at a time.',
    player_missing: 'Player not found.',
    player_not_eligible: 'Only minimum-contract and two-way players can be sent to the Development League.',
    grade_missing: 'Choose a valid grade to train.',
    grade_maxed: 'That grade cannot improve further.',
    assignment_missing: 'No active Development League assignment found.',
    assignment_not_ready: 'This Development League assignment is not ready yet.',
  };
  const status = code === 'player_missing' || code === 'assignment_missing'
    ? 'not-found'
    : code === 'assignment_active' || code === 'assignment_not_ready' || code === 'grade_maxed'
      ? 'failed-precondition'
      : 'invalid-argument';
  return new HttpsError(status, messages[code] || 'Development League action failed.', { code });
}

function createStartDevelopmentAssignmentHandler({ getFirestore, HttpsError, now = () => Date.now() }) {
  return async (request) => {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
    const data = request.data || {};
    const leagueId = typeof data.leagueId === 'string' ? data.leagueId.trim() : '';
    const teamId = typeof data.teamId === 'string' ? data.teamId.trim() : '';
    const targetPlayerId = typeof data.playerId === 'string' ? data.playerId.trim() : '';
    const gradeKey = typeof data.gradeKey === 'string' ? data.gradeKey.trim() : '';
    const gradeLabel = typeof data.gradeLabel === 'string' ? data.gradeLabel.trim() : '';
    if (!leagueId || !teamId || !targetPlayerId || !gradeKey) {
      throw new HttpsError('invalid-argument', 'Provide leagueId, teamId, playerId, and gradeKey.');
    }

    const db = getFirestore();
    const leagueRef = db.collection('leagues').doc(leagueId);
    const teamRef = leagueRef.collection('teams').doc(teamId);
    return db.runTransaction(async (tx) => {
      const [leagueSnap, teamSnap] = await Promise.all([tx.get(leagueRef), tx.get(teamRef)]);
      if (!leagueSnap.exists) throw new HttpsError('not-found', 'League not found.');
      if (!teamSnap.exists) throw new HttpsError('not-found', 'Team not found.');
      const league = leagueSnap.data() || {};
      const team = { id: teamSnap.id, ...teamSnap.data() };
      if (team.gmId !== uid && !isCommissioner(uid, league)) {
        throw new HttpsError('permission-denied', 'Only the team GM or commissioner can use the Development League.');
      }
      const result = startDevelopmentAssignment({
        team,
        playerId: targetPlayerId,
        gradeKey,
        gradeLabel,
        nowMs: now(),
      });
      if (!result.valid) throw mapDevelopmentError(HttpsError, result.errors[0]);
      tx.update(teamRef, { developmentAssignment: result.assignment });
      return { assignment: result.assignment };
    });
  };
}

function createCompleteDevelopmentAssignmentHandler({ getFirestore, HttpsError, now = () => Date.now() }) {
  return async (request) => {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
    const data = request.data || {};
    const leagueId = typeof data.leagueId === 'string' ? data.leagueId.trim() : '';
    const teamId = typeof data.teamId === 'string' ? data.teamId.trim() : '';
    if (!leagueId || !teamId) {
      throw new HttpsError('invalid-argument', 'Provide leagueId and teamId.');
    }

    const db = getFirestore();
    const leagueRef = db.collection('leagues').doc(leagueId);
    const teamRef = leagueRef.collection('teams').doc(teamId);
    return db.runTransaction(async (tx) => {
      const [leagueSnap, teamSnap] = await Promise.all([tx.get(leagueRef), tx.get(teamRef)]);
      if (!leagueSnap.exists) throw new HttpsError('not-found', 'League not found.');
      if (!teamSnap.exists) throw new HttpsError('not-found', 'Team not found.');
      const league = leagueSnap.data() || {};
      const team = { id: teamSnap.id, ...teamSnap.data() };
      if (team.gmId !== uid && !isCommissioner(uid, league)) {
        throw new HttpsError('permission-denied', 'Only the team GM or commissioner can use the Development League.');
      }
      const result = completeDevelopmentAssignment({ team, nowMs: now() });
      if (!result.valid) throw mapDevelopmentError(HttpsError, result.errors[0]);
      tx.update(teamRef, {
        players: result.players,
        developmentAssignment: result.assignment,
      });
      return { assignment: result.assignment };
    });
  };
}

function normalizeGrant(raw) {
  return {
    teamId: String(raw && raw.teamId || '').trim(),
    awardPoints: Number(raw && raw.awardPoints || 0),
    lotteryBoostPoints: Number(raw && raw.lotteryBoostPoints || 0),
    rebuildPoints: Number(raw && raw.rebuildPoints || 0),
    totalPoints: Number(raw && raw.totalPoints || 0),
    starTrainingTokens: Number(raw && raw.starTrainingTokens || 0),
    playerCredits: Array.isArray(raw && raw.playerCredits) ? raw.playerCredits : [],
  };
}

function createApplyUpgradeGrantsHandler({ getFirestore, HttpsError, FieldValue }) {
  return async (request) => {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
    const data = request.data || {};
    const leagueId = typeof data.leagueId === 'string' ? data.leagueId.trim() : '';
    const seasonYear = Number.isInteger(data.seasonYear) ? data.seasonYear : null;
    const grants = Array.isArray(data.grants)
      ? data.grants.map(normalizeGrant).filter(grant => (
        grant.teamId
        && (
          grant.totalPoints > 0
          || grant.starTrainingTokens > 0
          || grant.playerCredits.length > 0
        )
      ))
      : [];
    if (!leagueId || !seasonYear || grants.length === 0) {
      throw new HttpsError('invalid-argument', 'Provide leagueId, seasonYear, and grants.');
    }

    const db = getFirestore();
    const leagueRef = db.collection('leagues').doc(leagueId);
    return db.runTransaction(async (tx) => {
      const [leagueSnap, teamsSnap] = await Promise.all([
        tx.get(leagueRef),
        tx.get(leagueRef.collection('teams')),
      ]);
      if (!leagueSnap.exists) throw new HttpsError('not-found', 'League not found.');
      const league = leagueSnap.data() || {};
      if (!isCommissioner(uid, league)) {
        throw new HttpsError('permission-denied', 'Only commissioners can apply season upgrade grants.');
      }
      const teams = teamsSnap.docs.map(doc => ({ id: doc.id, ref: doc.ref, ...(doc.data() || {}) }));
      const updates = prepareSeasonGrantUpdates({ teams, grants, seasonYear });
      updates.forEach(update => tx.update(update.ref, {
        upgradePoints: update.upgradePoints,
        starTrainingTokens: update.starTrainingTokens,
        players: update.players,
        upgradePointGrants: update.upgradePointGrants,
      }));
      if (FieldValue) {
        createUpgradePointNotifications({
          teams,
          updates,
          leagueId,
          leagueName: league.name || '',
          seasonYear,
          createdAt: new Date().toISOString(),
        }).forEach(({ uid: recipientUid, notification }) => {
          tx.set(db.collection('users').doc(recipientUid), {
            notifications: FieldValue.arrayUnion(notification),
          }, { merge: true });
        });
      }
      return {
        seasonYear,
        updatedTeams: updates.map(update => update.teamId),
      };
    });
  };
}

module.exports = {
  PlayerUpgradeError,
  DEVELOPMENT_ASSIGNMENT_DURATION_MS,
  applySeasonUpgradeGrants,
  canUpgradePlayerThisSeason,
  createApplyUpgradeGrantsHandler,
  createCompleteDevelopmentAssignmentHandler,
  createStartDevelopmentAssignmentHandler,
  createSpendPlayerUpgradeHandler,
  createUpgradePointNotifications,
  completeDevelopmentAssignment,
  derivePlayerLabel,
  isDevelopmentEligiblePlayer,
  nextGrade,
  prepareSeasonGrantUpdates,
  startDevelopmentAssignment,
  spendTeamUpgradePoint,
  abilityGradesFromStats,
};
