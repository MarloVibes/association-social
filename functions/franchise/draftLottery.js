'use strict';

class DraftLotteryError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'DraftLotteryError';
    this.code = code;
    this.details = details;
  }
}

const NBA_STANDARD_LOTTERY_ODDS = Object.freeze([140, 140, 140, 125, 105, 90, 75, 60, 45, 30, 20, 15, 10, 5]);

function seededRandom(seed) {
  let state = 2166136261;
  for (let index = 0; index < String(seed).length; index += 1) {
    state ^= String(seed).charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function key(value) {
  return String(value || '').trim().toUpperCase();
}

function teamIdFor(team) {
  return key(team && (team.teamId || team.abbreviation || team.abbr || team.id));
}

function displayName(team, fallback) {
  return team && (team.name || team.full_name || team.abbreviation || team.abbr || team.teamId || team.id) || fallback;
}

function baseRows(teams) {
  return new Map((teams || []).map((team) => {
    const teamId = teamIdFor(team);
    return [teamId, {
      teamId,
      abbreviation: key(team && (team.abbreviation || team.abbr || teamId)),
      name: displayName(team, teamId),
      gmId: team && team.gmId || null,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDiff: 0,
      pct: 0,
    }];
  }).filter(([teamId]) => teamId));
}

function ensureRow(rows, teamId) {
  const id = key(teamId);
  if (!rows.has(id)) {
    rows.set(id, {
      teamId: id,
      abbreviation: id,
      name: id,
      gmId: null,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDiff: 0,
      pct: 0,
    });
  }
  return rows.get(id);
}

function standingsFromSchedule({ teams, games }) {
  const rows = baseRows(teams);
  (games || []).filter(game => (
    game
    && game.stage !== 'playoffs'
    && game.status === 'final'
    && Number.isFinite(game.homeScore)
    && Number.isFinite(game.awayScore)
  )).forEach((game) => {
    const home = ensureRow(rows, game.homeTeamId);
    const away = ensureRow(rows, game.awayTeamId);
    home.pointsFor += game.homeScore;
    home.pointsAgainst += game.awayScore;
    away.pointsFor += game.awayScore;
    away.pointsAgainst += game.homeScore;
    if (game.homeScore > game.awayScore) {
      home.wins += 1;
      away.losses += 1;
    } else {
      away.wins += 1;
      home.losses += 1;
    }
  });
  return [...rows.values()]
    .map(row => {
      const played = row.wins + row.losses;
      return {
        ...row,
        pointDiff: row.pointsFor - row.pointsAgainst,
        pct: played > 0 ? row.wins / played : 0,
      };
    })
    .sort((a, b) => (
      b.pct - a.pct
      || b.wins - a.wins
      || b.pointDiff - a.pointDiff
      || a.abbreviation.localeCompare(b.abbreviation)
    ));
}

function sortedWorstFirst(standings) {
  return [...(standings || [])].sort((a, b) => (
    a.pct - b.pct
    || a.wins - b.wins
    || a.pointDiff - b.pointDiff
    || a.abbreviation.localeCompare(b.abbreviation)
  ));
}

function lotteryCandidatesFromStandings({ standings, playoffTeamIds = [], lotteryCount = 14 }) {
  const playoffKeys = new Set((playoffTeamIds || []).map(key).filter(Boolean));
  return sortedWorstFirst(standings)
    .filter(row => !playoffKeys.has(key(row.teamId)) && !playoffKeys.has(key(row.abbreviation)))
    .slice(0, lotteryCount);
}

function pickTemplate(row, index) {
  return {
    pick: index + 1,
    teamId: row.teamId,
    abbreviation: row.abbreviation,
    name: row.name,
    source: 'reverse_standings',
    originalSeed: index + 1,
    odds: NBA_STANDARD_LOTTERY_ODDS[index] || 0,
  };
}

function weightedIndex(random, weights) {
  const total = weights.reduce((sum, value) => sum + Math.max(0, value), 0);
  let target = random() * total;
  for (let index = 0; index < weights.length; index += 1) {
    target -= Math.max(0, weights[index]);
    if (target <= 0) return index;
  }
  return Math.max(0, weights.length - 1);
}

function buildDraftLottery({ standings, playoffTeamIds = [], seed, lotteryCount = 14, drawnPickCount = 4 }) {
  const candidates = lotteryCandidatesFromStandings({ standings, playoffTeamIds, lotteryCount })
    .map(pickTemplate);
  const random = seededRandom(seed);
  const pool = [...candidates];
  const drawnPicks = [];
  for (let pick = 1; pick <= Math.min(drawnPickCount, pool.length); pick += 1) {
    const index = weightedIndex(random, pool.map(candidate => candidate.odds));
    const winner = pool.splice(index, 1)[0];
    drawnPicks.push({ ...winner, pick, source: 'lottery_draw' });
  }
  const remainingLottery = pool.map((candidate, index) => ({
    ...candidate,
    pick: drawnPicks.length + index + 1,
    source: 'reverse_standings',
  }));
  const lotteryKeys = new Set(candidates.map(candidate => key(candidate.teamId)));
  const playoffKeys = new Set((playoffTeamIds || []).map(key).filter(Boolean));
  const nonLotteryOrder = sortedWorstFirst(standings)
    .filter(row => !lotteryKeys.has(key(row.teamId)))
    .filter(row => playoffKeys.size === 0 || playoffKeys.has(key(row.teamId)) || playoffKeys.has(key(row.abbreviation)))
    .map((row, index) => ({
      pick: drawnPicks.length + remainingLottery.length + index + 1,
      teamId: row.teamId,
      abbreviation: row.abbreviation,
      name: row.name,
      source: 'reverse_standings',
      originalSeed: lotteryCount + index + 1,
      odds: 0,
    }));
  const picks = [...drawnPicks, ...remainingLottery, ...nonLotteryOrder];
  return {
    complete: true,
    seed,
    odds: [...NBA_STANDARD_LOTTERY_ODDS],
    candidates,
    drawnPicks,
    picks,
    draftOrder: picks.map(pick => pick.teamId),
  };
}

function playoffTeamIdsFromSchedule(schedule) {
  const seeds = schedule && schedule.playoffs && Array.isArray(schedule.playoffs.seeds)
    ? schedule.playoffs.seeds
    : [];
  if (seeds.length > 0) return seeds.map(row => row.teamId || row.abbreviation).filter(Boolean);
  const rounds = schedule && schedule.playoffs && Array.isArray(schedule.playoffs.rounds)
    ? schedule.playoffs.rounds
    : [];
  return [...new Set(rounds.flatMap(round => (
    (round.series || []).flatMap(series => [series.homeTeamId, series.awayTeamId])
  )).filter(Boolean))];
}

function hasLotteryComplete(offseason) {
  return Boolean(
    offseason
    && (
      offseason.lotteryComplete === true
      || (offseason.draftLottery && offseason.draftLottery.complete === true)
    )
  );
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

function notificationPayload({ league, leagueId, seasonYear, createdAt }) {
  return {
    id: `draft-lottery:${leagueId}:${seasonYear}`,
    type: 'offseason_stage',
    leagueId,
    leagueName: league.name || 'League',
    seasonYear,
    message: `${league.name || 'League'} draft lottery is complete. Draft order is ready.`,
    createdAt,
    read: false,
  };
}

function toHttpsError(error, HttpsError) {
  if (error instanceof DraftLotteryError) {
    return new HttpsError(error.code, error.message, error.details);
  }
  return error;
}

function createRunDraftLotteryHandler({ getFirestore, serverTimestamp, HttpsError, FieldValue }) {
  return async function runDraftLottery(request) {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
    const data = request.data || {};
    const leagueId = typeof data.leagueId === 'string' ? data.leagueId.trim() : '';
    const expectedVersion = data.expectedVersion;
    if (!leagueId || !Number.isInteger(expectedVersion)) {
      throw new HttpsError('invalid-argument', 'Provide leagueId and expectedVersion.');
    }
    const db = getFirestore();
    const leagueRef = db.collection('leagues').doc(leagueId);
    try {
      return await db.runTransaction(async (tx) => {
        const [leagueSnap, teamsSnap] = await Promise.all([
          tx.get(leagueRef),
          tx.get(leagueRef.collection('teams')),
        ]);
        if (!leagueSnap.exists) throw new HttpsError('not-found', 'League not found.');
        const league = leagueSnap.data() || {};
        if (!isCommissioner(uid, league)) {
          throw new HttpsError('permission-denied', 'Only commissioners can run the draft lottery.');
        }
        const offseason = league.offseason || {};
        if (league.sport !== 'nba' || offseason.stage !== 'lottery_and_draft_order' || offseason.version !== expectedVersion) {
          throw new DraftLotteryError('failed-precondition', 'Draft lottery is only available during the current NBA lottery stage.');
        }
        if (hasLotteryComplete(offseason)) {
          throw new DraftLotteryError('failed-precondition', 'Draft lottery has already been run.');
        }
        const scheduleId = league.scheduleId || String(league.currentYear || offseason.seasonYear);
        const scheduleSnap = await tx.get(leagueRef.collection('schedules').doc(scheduleId));
        if (!scheduleSnap.exists) throw new HttpsError('failed-precondition', 'Season schedule is required before draft lottery.');
        const teams = teamsSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() || {}) }));
        const schedule = scheduleSnap.data() || {};
        const standings = standingsFromSchedule({ teams, games: schedule.games || [] });
        const playoffTeamIds = playoffTeamIdsFromSchedule(schedule);
        const draftLottery = {
          ...buildDraftLottery({
            standings,
            playoffTeamIds,
            seed: `${leagueId}:${offseason.seasonYear || league.currentYear}:draft-lottery`,
          }),
          seasonYear: offseason.seasonYear || league.currentYear,
          completedAt: serverTimestamp(),
          completedBy: uid,
        };
        const claimedLotteryTeamIds = draftLottery.candidates
          .map(candidate => teams.find(team => teamIdFor(team) === key(candidate.teamId)))
          .filter(team => team && team.gmId)
          .map(team => String(team.id));
        tx.update(leagueRef, {
          draftLottery,
          draftOrder: draftLottery.draftOrder,
          'offseason.draftLottery': draftLottery,
          'offseason.lotteryComplete': true,
          'offseason.completedTeamIds': claimedLotteryTeamIds,
        });
        if (FieldValue) {
          const note = notificationPayload({
            league,
            leagueId,
            seasonYear: draftLottery.seasonYear,
            createdAt: new Date().toISOString(),
          });
          (league.members || []).forEach((memberId) => {
            tx.set(db.collection('users').doc(memberId), {
              notifications: FieldValue.arrayUnion(note),
            }, { merge: true });
          });
        }
        return { draftLottery };
      });
    } catch (error) {
      throw toHttpsError(error, HttpsError);
    }
  };
}

module.exports = {
  DraftLotteryError,
  NBA_STANDARD_LOTTERY_ODDS,
  buildDraftLottery,
  createRunDraftLotteryHandler,
  hasLotteryComplete,
  lotteryCandidatesFromStandings,
  playoffTeamIdsFromSchedule,
  standingsFromSchedule,
};
