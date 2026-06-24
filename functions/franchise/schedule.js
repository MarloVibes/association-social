'use strict';

class ScheduleError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'ScheduleError';
    this.code = code;
    this.details = details;
  }
}

const APPROVED_LENGTHS = new Set([14, 29, 58, 82]);

function hash(value) {
  let h = 2166136261;
  for (let i = 0; i < String(value).length; i += 1) {
    h ^= String(value).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function gameId(seed, sequence, awayTeamId, homeTeamId) {
  return `nba_${hash(`${seed}:${sequence}:${awayTeamId}:${homeTeamId}`).toString(36)}`;
}

function seededTeams(teams, seed) {
  return [...teams].sort((a, b) => hash(`${seed}:${a}`) - hash(`${seed}:${b}`) || a.localeCompare(b));
}

function roundRobinRounds(teams) {
  const rotating = [...teams];
  const rounds = [];
  const half = rotating.length / 2;
  for (let round = 0; round < rotating.length - 1; round += 1) {
    const pairings = [];
    for (let index = 0; index < half; index += 1) {
      pairings.push([rotating[index], rotating[rotating.length - 1 - index]]);
    }
    rounds.push(pairings);
    const fixed = rotating[0];
    const moved = rotating.pop();
    rotating.splice(1, 0, moved);
    rotating[0] = fixed;
  }
  return rounds;
}

function generateServerSchedule({ teams, gamesPerTeam, seed }) {
  if (!Array.isArray(teams) || teams.length < 30 || teams.length > 36 || new Set(teams).size !== teams.length) {
    throw new ScheduleError('failed-precondition', 'NBA schedules require 30 to 36 unique teams.');
  }
  if (!APPROVED_LENGTHS.has(gamesPerTeam)) {
    throw new ScheduleError('invalid-argument', 'Choose an approved NBA schedule length.');
  }
  const orderedTeams = seededTeams(teams, seed);
  const home = new Map(orderedTeams.map(team => [team, 0]));
  const totalHomeGames = (orderedTeams.length * gamesPerTeam) / 2;
  const baseHomeTarget = Math.floor(totalHomeGames / orderedTeams.length);
  const extraHomeTeams = totalHomeGames - baseHomeTarget * orderedTeams.length;
  const homeQuota = new Map(orderedTeams.map((team, index) => [
    team,
    baseHomeTarget + (index < extraHomeTeams ? 1 : 0),
  ]));
  const rounds = roundRobinRounds(orderedTeams);
  const games = [];
  for (let roundIndex = 0; roundIndex < gamesPerTeam; roundIndex += 1) {
    const baseRound = rounds[roundIndex % rounds.length];
    const cycle = Math.floor(roundIndex / rounds.length);
    for (let pairingIndex = 0; pairingIndex < baseRound.length; pairingIndex += 1) {
      const [left, right] = baseRound[pairingIndex];
      const leftNeed = (homeQuota.get(left) || 0) - (home.get(left) || 0);
      const rightNeed = (homeQuota.get(right) || 0) - (home.get(right) || 0);
      const homeTeamId = leftNeed > rightNeed
        ? left
        : rightNeed > leftNeed
          ? right
          : (roundIndex + pairingIndex + cycle) % 2 === 0 ? left : right;
      const awayTeamId = homeTeamId === left ? right : left;
      const sequence = games.length + 1;
      games.push({
        id: gameId(seed, sequence, awayTeamId, homeTeamId),
        week: Math.ceil(sequence / Math.max(1, Math.floor(orderedTeams.length / 2))),
        sequence,
        homeTeamId,
        awayTeamId,
        status: 'scheduled',
      });
      home.set(homeTeamId, (home.get(homeTeamId) || 0) + 1);
    }
  }
  return games;
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

function createGenerateScheduleHandler({ getFirestore, serverTimestamp, HttpsError }) {
  return async (request) => {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
    const data = request.data || {};
    const leagueId = typeof data.leagueId === 'string' ? data.leagueId.trim() : '';
    const gamesPerTeam = Number(data.gamesPerTeam);
    if (!leagueId || !APPROVED_LENGTHS.has(gamesPerTeam)) {
      throw new HttpsError('invalid-argument', 'Provide leagueId and an approved schedule length.');
    }
    const db = getFirestore();
    const leagueRef = db.collection('leagues').doc(leagueId);
    return db.runTransaction(async (tx) => {
      const leagueSnap = await tx.get(leagueRef);
      if (!leagueSnap.exists) throw new HttpsError('not-found', 'League not found.');
      const league = leagueSnap.data() || {};
      if (league.sport !== 'nba') throw new HttpsError('failed-precondition', 'Schedules are only available for NBA leagues.');
      if (!isCommissioner(uid, league)) throw new HttpsError('permission-denied', 'Only commissioners can create schedules.');
      if (league.scheduleLocked === true) throw new HttpsError('failed-precondition', 'Schedule is already locked.');

      const teamsSnap = await tx.get(leagueRef.collection('teams'));
      const teams = teamsSnap.docs.map(doc => doc.id).sort();
      const seed = `${leagueId}:${league.currentYear || 2025}:${gamesPerTeam}`;
      const games = generateServerSchedule({ teams, gamesPerTeam, seed });
      const batchId = String(league.currentYear || 2025);
      const scheduleRef = leagueRef.collection('schedules').doc(batchId);
      tx.set(scheduleRef, {
        games,
        gamesPerTeam,
        teamCount: teams.length,
        seed,
        locked: true,
        createdBy: uid,
        createdAt: serverTimestamp(),
      }, { merge: true });
      tx.update(leagueRef, {
        scheduleId: batchId,
        scheduleLocked: true,
        gamesPerTeam,
        scheduleCreatedAt: serverTimestamp(),
      });
      return { scheduleId: batchId, games: games.length, gamesPerTeam };
    });
  };
}

module.exports = {
  ScheduleError,
  createGenerateScheduleHandler,
  generateServerSchedule,
};
