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
const S_ELIGIBLE_LABELS = new Set(['SUPERSTAR', 'LEGEND']);
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

function nextGrade(current, label) {
  const index = GRADE_LADDER.indexOf(current);
  if (index < 0) return current;
  const candidate = GRADE_LADDER[Math.min(index + 1, GRADE_LADDER.length - 1)];
  if (candidate === 'S' && !S_ELIGIBLE_LABELS.has(normalizedLabel(label))) return current;
  return candidate;
}

function hiddenFloorForGrade(grade) {
  return GRADE_NUMERIC_FLOOR[grade] || 0;
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

function spendTeamUpgradePoint({ team, player, ability, seasonYear }) {
  if (!team) throw new PlayerUpgradeError('not-found', 'Team not found.');
  if (!player) throw new PlayerUpgradeError('not-found', 'Player not found.');
  const points = Number(team.upgradePoints || 0);
  if (points < 1) throw new PlayerUpgradeError('failed-precondition', 'This team does not have upgrade points.');
  const grades = { ...(player.grades || player.abilityGrades || abilityGradesFromStats(player)) };
  const current = grades[ability];
  if (!current) throw new PlayerUpgradeError('invalid-argument', 'Choose a valid ability to upgrade.');
  const usageKey = String(seasonYear || 'current');
  const upgradeUsage = { ...(player.upgradeUsage || {}) };
  const used = Number(upgradeUsage[usageKey] || 0);
  const playerLabel = derivePlayerLabel(player);
  if (!canUpgradePlayerThisSeason({ label: playerLabel, upgradesUsedThisSeason: used })) {
    throw new PlayerUpgradeError('failed-precondition', 'This player has reached their upgrade limit for the season.');
  }
  const upgraded = nextGrade(current, playerLabel);
  if (upgraded === current) {
    throw new PlayerUpgradeError('failed-precondition', 'This grade cannot be upgraded further.');
  }
  const nextHidden = player.hidden && typeof player.hidden === 'object'
    ? {
      ...player.hidden,
      [ability]: Math.max(
        numberFrom(player.hidden[ability]),
        hiddenFloorForGrade(upgraded),
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
    team: { ...team, upgradePoints: points - 1 },
    player: {
      ...player,
      grades: { ...grades, [ability]: upgraded },
      abilityGrades: player.abilityGrades
        ? { ...player.abilityGrades, [ability]: upgraded }
        : player.abilityGrades,
      hidden: nextHidden,
      visible: nextVisible,
      upgradeUsage: { ...upgradeUsage, [usageKey]: used + 1 },
    },
  };
}

function applySeasonUpgradeGrants({ teams, grants, seasonYear }) {
  const grantByTeam = new Map((grants || []).map(grant => [String(grant.teamId), grant]));
  const seasonKey = String(seasonYear || 'current');
  return (teams || []).map((team) => {
    const grant = grantByTeam.get(String(team.id || team.teamId || team.abbreviation || ''));
    if (!grant || Number(grant.totalPoints || 0) <= 0) return team;
    const existingGrants = team.upgradePointGrants || {};
    if (existingGrants[seasonKey]) return team;
    return {
      ...team,
      upgradePoints: Number(team.upgradePoints || 0) + Number(grant.totalPoints || 0),
      upgradePointGrants: {
        ...existingGrants,
        [seasonKey]: {
          awardPoints: Number(grant.awardPoints || 0),
          lotteryBoostPoints: Number(grant.lotteryBoostPoints || 0),
          totalPoints: Number(grant.totalPoints || 0),
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
        && JSON.stringify(team.upgradePointGrants || {}) === JSON.stringify(original.upgradePointGrants || {})
      ) {
        return null;
      }
      return {
        ref: original.ref,
        teamId: team.id || team.teamId || team.abbreviation,
        upgradePoints: team.upgradePoints,
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
      });
      return {
        player: next.player,
        upgradePoints: next.team.upgradePoints,
      };
    });
  };
}

function normalizeGrant(raw) {
  return {
    teamId: String(raw && raw.teamId || '').trim(),
    awardPoints: Number(raw && raw.awardPoints || 0),
    lotteryBoostPoints: Number(raw && raw.lotteryBoostPoints || 0),
    totalPoints: Number(raw && raw.totalPoints || 0),
  };
}

function createApplyUpgradeGrantsHandler({ getFirestore, HttpsError, FieldValue }) {
  return async (request) => {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
    const data = request.data || {};
    const leagueId = typeof data.leagueId === 'string' ? data.leagueId.trim() : '';
    const seasonYear = Number.isInteger(data.seasonYear) ? data.seasonYear : null;
    const grants = Array.isArray(data.grants) ? data.grants.map(normalizeGrant).filter(grant => grant.teamId && grant.totalPoints > 0) : [];
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
  applySeasonUpgradeGrants,
  canUpgradePlayerThisSeason,
  createApplyUpgradeGrantsHandler,
  createSpendPlayerUpgradeHandler,
  createUpgradePointNotifications,
  derivePlayerLabel,
  nextGrade,
  prepareSeasonGrantUpdates,
  spendTeamUpgradePoint,
  abilityGradesFromStats,
};
