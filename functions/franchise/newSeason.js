'use strict';

class NewSeasonError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'NewSeasonError';
    this.code = code;
    this.details = details;
  }
}

function normalizeSport(sport) {
  if (sport === 'nfl' || sport === 'madden') return 'madden';
  if (sport === 'mlb') return 'mlb';
  return 'nba';
}

function playerId(player) {
  return String(player && (player.player_id || player.id || player.full_name) || '');
}

function payroll(players) {
  return (players || []).reduce((total, player) => (
    total + (
      Number.isFinite(player && player.salary) && player.salary >= 0
        ? player.salary
        : 0
    )
  ), 0);
}

function financeLimit(sport, team, league) {
  if (sport === 'mlb') {
    if (Number.isFinite(team.budget)) return team.budget;
    if (Number.isFinite(league.teamBudget)) return league.teamBudget;
    return league.salaryCap;
  }
  if (Number.isFinite(team.salaryCap)) return team.salaryCap;
  return league.salaryCap;
}

function isTwoWayPlayer(player) {
  const type = String(
    player && (
      player.contractType
      || player.contract_type
      || player.rosterSlot
      || player.slot
      || ''
    )
  ).trim().toLowerCase();
  return type === 'two_way' || type === 'two-way' || type === 'twoway' || type === 'two way';
}

function serverRosterCompliance(sportInput, team, league, rosterLimitOverride) {
  const sport = normalizeSport(sportInput);
  const rosterLimit = Number.isInteger(rosterLimitOverride)
    ? rosterLimitOverride
    : sport === 'madden' ? 53 : sport === 'mlb' ? 40 : 15;
  const twoWayLimit = sport === 'nba' ? 3 : 0;
  const players = Array.isArray(team.players) ? team.players : [];
  const twoWayCount = sport === 'nba' ? players.filter(isTwoWayPlayer).length : 0;
  const standardCount = sport === 'nba' ? players.length - twoWayCount : players.length;
  const teamPayroll = payroll(players);
  const limit = financeLimit(sport, team, league);
  const errors = [];
  if (sport === 'nba') {
    if (standardCount > rosterLimit) errors.push('standard_roster_limit');
    if (twoWayCount > twoWayLimit) errors.push('two_way_limit');
  } else if (players.length > rosterLimit) {
    errors.push('roster_limit');
  }
  if (sport !== 'nba') {
    if (!Number.isFinite(limit) || limit < 0) errors.push('invalid_limit');
    else if (teamPayroll > limit) errors.push('financial_limit');
  }
  return {
    valid: errors.length === 0,
    errors,
    rosterCount: players.length,
    standardCount,
    rosterLimit,
    twoWayCount,
    twoWayLimit,
    payroll: teamPayroll,
    financeLimit: limit,
  };
}

function newSeasonTeamResetPayload() {
  return {
    fatigue: 0,
    fatigueSequence: 0,
    minorInjuryCount: 0,
    severeInjuryCount: 0,
    injuries: [],
  };
}

function playerValue(player) {
  for (const value of [player.value, player.overall, player.rating]) {
    if (Number.isFinite(value)) return value;
  }
  return 50;
}

function positionGroup(sportInput, position) {
  const sport = normalizeSport(sportInput);
  if (sport === 'madden' && ['LT', 'LG', 'C', 'RG', 'RT', 'OL'].includes(position || '')) {
    return 'OL';
  }
  if (sport === 'mlb' && ['LF', 'CF', 'RF', 'OF'].includes(position || '')) {
    return 'OF';
  }
  return position || '';
}

function autoCutTeamRoster(
  sportInput,
  team,
  league,
  rosterLimitOverride,
  positionMinimums = {},
) {
  const players = [...(team.players || [])];
  const cut = [];
  while (!serverRosterCompliance(sportInput, { ...team, players }, league, rosterLimitOverride).valid) {
    const positionCounts = players.reduce((counts, player) => {
      const position = positionGroup(sportInput, player.position);
      counts[position] = (counts[position] || 0) + 1;
      return counts;
    }, {});
    const removable = players
      .map((player, index) => ({ player, index }))
      .filter(({ player }) => {
        const position = positionGroup(sportInput, player.position);
        return (positionCounts[position] || 0) > (positionMinimums[position] || 0);
      })
      .sort((left, right) => (
        playerValue(left.player) - playerValue(right.player)
        || Number(right.player.salary || 0) - Number(left.player.salary || 0)
        || playerId(left.player).localeCompare(playerId(right.player))
      ));
    if (removable.length === 0) break;
    const [removed] = players.splice(removable[0].index, 1);
    cut.push(removed);
  }
  return {
    kept: players,
    cut,
    teamUpdates: newSeasonTeamResetPayload(),
    compliance: serverRosterCompliance(
      sportInput,
      { ...team, players },
      league,
      rosterLimitOverride,
    ),
  };
}

function archivePlayerSeasonStats(player, seasonYear) {
  const season = player && player.seasonStats && typeof player.seasonStats === 'object'
    ? player.seasonStats
    : null;
  if (!season || Object.keys(season).length === 0) return player && player.statHistory ? player.statHistory : {};
  return {
    ...(player.statHistory || {}),
    [String(seasonYear)]: {
      ...season,
      awards: Array.isArray(season.awards) ? [...season.awards] : season.awards,
    },
  };
}

function advancePlayerForNewSeason(player, nextYear) {
  const nextAge = Number.isFinite(player.age) ? player.age + 1
    : Number.isFinite(player.birth_year) ? nextYear - player.birth_year
      : player.age;
  const retirementYear = player.retirement_year;
  const retired = player.retired === true
    || (Number.isFinite(retirementYear) && retirementYear <= nextYear);
  const signedThisOffseason = player.signedSeason === nextYear - 1;
  const contractYears = Number.isFinite(player.contractYears)
    ? signedThisOffseason
      ? player.contractYears
      : Math.max(0, player.contractYears - 1)
    : player.contractYears;
  return {
    ...player,
    age: nextAge,
    contractYears,
    contractExpired: Number.isFinite(contractYears) && contractYears === 0,
    retired,
    statHistory: archivePlayerSeasonStats(player, nextYear - 1),
    seasonStats: {},
  };
}

const NBA_SKILL_KEYS = [
  'shooting',
  'playmaking',
  'defense',
  'rebounding',
  'athleticism',
  'basketballIq',
  'consistency',
  'chemistry',
];

function hash(value) {
  let h = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function gradeFromHiddenValue(value) {
  const rating = clamp(Number.isFinite(value) ? value : 0, 0, 100);
  if (rating >= 99) return 'S';
  if (rating >= 95) return 'A+';
  if (rating >= 92) return 'A';
  if (rating >= 89) return 'A-';
  if (rating >= 86) return 'B+';
  if (rating >= 83) return 'B';
  if (rating >= 80) return 'B-';
  if (rating >= 77) return 'C+';
  if (rating >= 74) return 'C';
  if (rating >= 71) return 'C-';
  if (rating >= 68) return 'D+';
  if (rating >= 65) return 'D';
  if (rating >= 60) return 'D-';
  return 'F';
}

function buildNbaGrades(hidden) {
  return NBA_SKILL_KEYS.reduce((grades, key) => {
    grades[key] = gradeFromHiddenValue(Number(hidden[key] || 0));
    return grades;
  }, {});
}

function nbaAgeCurve(age) {
  if (age <= 23) return 3;
  if (age <= 26) return 2;
  if (age <= 29) return 1;
  if (age <= 32) return 0;
  if (age <= 34) return -2;
  return -4;
}

function nbaRoleBonus(minutes) {
  if (minutes >= 2400) return 2;
  if (minutes >= 1600) return 1;
  if (minutes < 700) return -1;
  return 0;
}

function nbaProductionBonus(key, season) {
  if (key === 'shooting' && Number(season.points || season.pts || 0) >= 900) return 1;
  if (key === 'playmaking' && Number(season.assists || season.ast || 0) >= 250) return 1;
  if (key === 'rebounding' && Number(season.rebounds || season.reb || 0) >= 300) return 1;
  if (key === 'basketballIq' && Number(season.minutes || season.min || 0) >= 1800) return 1;
  return 0;
}

function advanceNbaPlayerForNewSeason(player, nextYear, seed) {
  const advanced = advancePlayerForNewSeason(player, nextYear);
  if (!player || !player.hidden || typeof player.hidden !== 'object') return advanced;
  const season = player.seasonStats || player.stats || {};
  const completedSeasonYear = nextYear - 1;
  const hidden = { ...player.hidden };
  const age = Number(hidden.age || player.age || 19);
  const base = nbaAgeCurve(age) + nbaRoleBonus(Number(season.minutes || season.min || 0));
  const awardBonus = Array.isArray(season.awards) && season.awards.length > 0 ? 1 : 0;
  const injuryPenalty = Math.min(3, Math.floor(Number(season.injuryGamesMissed || season.gamesMissed || 0) / 10));
  const deltas = {};

  NBA_SKILL_KEYS.forEach((key) => {
    const current = Number(hidden[key] || 60);
    const variance = (hash(`${seed}:${playerId(player)}:${key}`) % 5) - 2;
    let delta = base + awardBonus + nbaProductionBonus(key, season) - injuryPenalty + variance;
    if (age >= 33 && (key === 'athleticism' || key === 'defense')) {
      delta = Math.min(delta, -1);
    }
    delta = clamp(delta, -8, 8);
    hidden[key] = clamp(Math.round(current + delta), 25, 99);
    deltas[key] = hidden[key] - current;
  });

  hidden.age = age + 1;
  hidden.seasonsPlayed = Number(hidden.seasonsPlayed || 0) + 1;

  return {
    ...advanced,
    hidden,
    grades: buildNbaGrades(hidden),
    visible: {
      ...(player.visible || {}),
      grades: buildNbaGrades(hidden),
    },
    progression: {
      ...(player.progression || {}),
      seasonDelta: deltas,
      progressedSeason: completedSeasonYear,
    },
    statHistory: archivePlayerSeasonStats(player, completedSeasonYear),
    seasonStats: {},
  };
}

function seasonLabel(sport, year) {
  return sport === 'nba' ? `${year}-${String(year + 1).slice(-2)}` : String(year);
}

function nextSalaryCap(currentSalaryCap, growthRate = 0.05) {
  return Math.round(Number(currentSalaryCap || 0) * (1 + growthRate));
}

function projectCapHistory({ currentYear, currentSalaryCap, existingHistory = [], growthRate = 0.05 }) {
  const salaryCap = nextSalaryCap(currentSalaryCap, growthRate);
  return [
    ...existingHistory,
    {
      seasonYear: currentYear + 1,
      salaryCap,
      minimumSalary: Math.round(salaryCap * 0.01),
      rookieScaleBase: Math.round(salaryCap * 0.05),
    },
  ];
}

function archiveSeasonAwards(awardHistory, seasonAwards) {
  const history = { ...(awardHistory || {}) };
  Object.entries(seasonAwards || {}).forEach(([key, records]) => {
    const nextRecords = Array.isArray(records) ? records : records ? [records] : [];
    if (nextRecords.length === 0) return;
    const existing = history[key];
    history[key] = [
      ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
      ...nextRecords,
    ];
  });
  return history;
}

function buildNextSeasonLeague(league, stageStartedAt) {
  const sport = normalizeSport(league.sport);
  const currentYear = Number.isInteger(league.currentYear)
    ? league.currentYear
    : league.offseason && league.offseason.seasonYear;
  const nextYear = currentYear + 1;
  const capHistory = sport === 'nba'
    ? projectCapHistory({
      currentYear,
      currentSalaryCap: Number(league.salaryCap || 0),
      existingHistory: Array.isArray(league.capHistory) ? league.capHistory : [],
      growthRate: Number.isFinite(league.capGrowthRate) ? league.capGrowthRate : 0.05,
    })
    : league.capHistory;
  const latestCap = Array.isArray(capHistory) ? capHistory[capHistory.length - 1] : null;
  const awardHistory = archiveSeasonAwards(league.awardHistory, league.seasonAwards);
  return {
    ...league,
    currentYear: nextYear,
    currentSeason: seasonLabel(sport, nextYear),
    salaryCap: sport === 'nba' && latestCap ? latestCap.salaryCap : league.salaryCap,
    capHistory,
    scheduleLocked: sport === 'nba' ? false : league.scheduleLocked,
    scheduleId: sport === 'nba' ? null : league.scheduleId,
    awardHistory,
    seasonAwards: {},
    awardsFinalizedSeason: null,
    offseason: {
      ...(league.offseason || {}),
      stage: 'regular_season',
      seasonYear: nextYear,
      stageStartedAt,
      completedTeamIds: [],
      draftStatus: 'none',
      contractRoundsComplete: false,
      draftClassVersion: null,
      version: Number.isInteger(league.offseason && league.offseason.version)
        ? league.offseason.version + 1
        : 1,
    },
  };
}

function isCommissioner(uid, league) {
  return league.commissionerId === uid || (league.coCommissioners || []).includes(uid);
}

function positionMinimums(sport) {
  return sport === 'madden'
    ? { QB: 1, HB: 1, WR: 3, TE: 1, OL: 5, K: 1, P: 1 }
    : { SP: 4, RP: 3, C: 1, '1B': 1, '2B': 1, '3B': 1, SS: 1, OF: 3 };
}

function toHttpsError(error, HttpsError) {
  if (error instanceof NewSeasonError) {
    return new HttpsError(error.code, error.message, error.details);
  }
  return error;
}

function createCutRosterPlayerHandler({ getFirestore, serverTimestamp, HttpsError }) {
  return async function cutRosterPlayer(request) {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
    const data = request.data || {};
    const leagueId = typeof data.leagueId === 'string' ? data.leagueId.trim() : '';
    const targetPlayerId = typeof data.playerId === 'string' ? data.playerId.trim() : '';
    if (!leagueId || !targetPlayerId || !Number.isInteger(data.expectedVersion)) {
      throw new HttpsError('invalid-argument', 'Provide league, player, and current offseason version.');
    }
    const db = getFirestore();
    const leagueRef = db.collection('leagues').doc(leagueId);
    try {
      return await db.runTransaction(async tx => {
        const [leagueSnap, teamsSnap] = await Promise.all([
          tx.get(leagueRef),
          tx.get(leagueRef.collection('teams')),
        ]);
        if (!leagueSnap.exists) throw new HttpsError('not-found', 'League not found.');
        const league = leagueSnap.data() || {};
        const offseason = league.offseason || {};
        if (offseason.stage !== 'roster_cuts' || offseason.version !== data.expectedVersion) {
          throw new NewSeasonError('aborted', 'The roster-cut stage changed.');
        }
        const teamDoc = teamsSnap.docs.find(doc => (doc.data() || {}).gmId === uid);
        if (!teamDoc) throw new HttpsError('permission-denied', 'You do not control a team in this league.');
        const team = teamDoc.data() || {};
        const player = (team.players || []).find(candidate => playerId(candidate) === targetPlayerId);
        if (!player) throw new HttpsError('not-found', 'Player not found on your roster.');
        const freeAgentsRef = leagueRef.collection('free_agents').doc(`cuts_${offseason.seasonYear}`);
        const freeAgentsSnap = await tx.get(freeAgentsRef);
        tx.update(teamDoc.ref, {
          players: (team.players || []).filter(candidate => playerId(candidate) !== targetPlayerId),
        });
        tx.set(freeAgentsRef, {
          seasonYear: offseason.seasonYear,
          players: [...(freeAgentsSnap.exists ? freeAgentsSnap.data().players || [] : []), {
            ...player,
            team: '',
            releasedAt: serverTimestamp(),
          }],
        });
        tx.update(leagueRef, {
          'offseason.completedTeamIds': (offseason.completedTeamIds || [])
            .map(String)
            .filter(teamId => teamId !== teamDoc.id),
        });
        return { teamId: teamDoc.id, playerId: targetPlayerId, cut: true };
      });
    } catch (error) {
      throw toHttpsError(error, HttpsError);
    }
  };
}

function createStartNextSeasonHandler({ getFirestore, serverTimestamp, HttpsError }) {
  return async function startNextSeason(request) {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
    const data = request.data || {};
    const leagueId = typeof data.leagueId === 'string' ? data.leagueId.trim() : '';
    if (!leagueId || !Number.isInteger(data.expectedVersion)) {
      throw new HttpsError('invalid-argument', 'Provide league and current offseason version.');
    }
    const db = getFirestore();
    const leagueRef = db.collection('leagues').doc(leagueId);
    try {
      return await db.runTransaction(async tx => {
        const [leagueSnap, teamsSnap] = await Promise.all([
          tx.get(leagueRef),
          tx.get(leagueRef.collection('teams')),
        ]);
        if (!leagueSnap.exists) throw new HttpsError('not-found', 'League not found.');
        const league = leagueSnap.data() || {};
        const sport = normalizeSport(league.sport);
        if (!isCommissioner(uid, league)) {
          throw new HttpsError('permission-denied', 'Only a commissioner can start the next season.');
        }
        const offseason = league.offseason || {};
        if (offseason.stage !== 'ready_for_season' || offseason.version !== data.expectedVersion) {
          throw new NewSeasonError('aborted', 'The offseason stage changed.');
        }
        const completed = new Set((offseason.completedTeamIds || []).map(String));
        const unresolved = teamsSnap.docs
          .filter(doc => (doc.data() || {}).gmId && !completed.has(doc.id))
          .map(doc => doc.id);
        if (unresolved.length > 0) {
          throw new NewSeasonError('failed-precondition', 'Claimed teams are not ready for the next season.', {
            unresolvedTeamIds: unresolved,
          });
        }
        const freeAgentsRef = leagueRef.collection('free_agents').doc(`cuts_${offseason.seasonYear}`);
        const freeAgentsSnap = await tx.get(freeAgentsRef);
        const nextLeague = buildNextSeasonLeague(league, serverTimestamp());
        const nextYear = nextLeague.currentYear;
        const releasedPlayers = [];
        for (const teamDoc of teamsSnap.docs) {
          const team = { id: teamDoc.id, ...(teamDoc.data() || {}) };
          const result = team.gmId
            ? {
              kept: team.players || [],
              cut: [],
              teamUpdates: newSeasonTeamResetPayload(),
              compliance: serverRosterCompliance(sport, team, league),
            }
            : autoCutTeamRoster(
              sport,
              team,
              league,
              undefined,
              positionMinimums(sport),
            );
          if (!result.compliance.valid) {
            throw new NewSeasonError('failed-precondition', 'A roster is not compliant.', {
              teamId: team.id,
              errors: result.compliance.errors,
            });
          }
          releasedPlayers.push(...result.cut);
          const advancedPlayers = result.kept
            .map(player => (
              sport === 'nba'
                ? advanceNbaPlayerForNewSeason(player, nextYear, `${leagueId}:${nextYear}`)
                : advancePlayerForNewSeason(player, nextYear)
            ));
          releasedPlayers.push(...advancedPlayers.filter(player => (
            player.contractExpired && !player.retired
          )));
          const advanced = advancedPlayers
            .filter(player => !player.retired && !player.contractExpired);
          tx.update(teamDoc.ref, {
            players: advanced,
            ...(result.teamUpdates || {}),
          });
        }
        if (releasedPlayers.length > 0) {
          tx.set(freeAgentsRef, {
            seasonYear: offseason.seasonYear,
            players: [
              ...(freeAgentsSnap.exists ? freeAgentsSnap.data().players || [] : []),
              ...releasedPlayers.map(player => ({ ...player, team: '' })),
            ],
          });
        }
        tx.update(leagueRef, {
          currentYear: nextLeague.currentYear,
          currentSeason: nextLeague.currentSeason,
          salaryCap: nextLeague.salaryCap,
          capHistory: nextLeague.capHistory,
          scheduleLocked: nextLeague.scheduleLocked,
          scheduleId: nextLeague.scheduleId,
          awardHistory: nextLeague.awardHistory,
          seasonAwards: nextLeague.seasonAwards,
          awardsFinalizedSeason: nextLeague.awardsFinalizedSeason,
          offseason: nextLeague.offseason,
        });
        return {
          currentYear: nextLeague.currentYear,
          currentSeason: nextLeague.currentSeason,
          releasedPlayers: releasedPlayers.length,
        };
      });
    } catch (error) {
      throw toHttpsError(error, HttpsError);
    }
  };
}

module.exports = {
  NewSeasonError,
  advanceNbaPlayerForNewSeason,
  advancePlayerForNewSeason,
  autoCutTeamRoster,
  buildNextSeasonLeague,
  createCutRosterPlayerHandler,
  createStartNextSeasonHandler,
  nextSalaryCap,
  newSeasonTeamResetPayload,
  projectCapHistory,
  serverRosterCompliance,
};
