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

function serverRosterCompliance(sportInput, team, league, rosterLimitOverride) {
  const sport = normalizeSport(sportInput);
  const rosterLimit = Number.isInteger(rosterLimitOverride)
    ? rosterLimitOverride
    : sport === 'madden' ? 53 : sport === 'mlb' ? 40 : 15;
  const players = Array.isArray(team.players) ? team.players : [];
  const teamPayroll = payroll(players);
  const limit = financeLimit(sport, team, league);
  const errors = [];
  if (players.length > rosterLimit) errors.push('roster_limit');
  if (sport !== 'nba') {
    if (!Number.isFinite(limit) || limit < 0) errors.push('invalid_limit');
    else if (teamPayroll > limit) errors.push('financial_limit');
  }
  return {
    valid: errors.length === 0,
    errors,
    rosterCount: players.length,
    rosterLimit,
    payroll: teamPayroll,
    financeLimit: limit,
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
    compliance: serverRosterCompliance(
      sportInput,
      { ...team, players },
      league,
      rosterLimitOverride,
    ),
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
  };
}

function buildNextSeasonLeague(league, stageStartedAt) {
  const sport = normalizeSport(league.sport);
  if (sport === 'nba') {
    throw new NewSeasonError('failed-precondition', 'NBA season advancement uses the NBA season engine.');
  }
  const currentYear = Number.isInteger(league.currentYear)
    ? league.currentYear
    : league.offseason && league.offseason.seasonYear;
  const nextYear = currentYear + 1;
  return {
    ...league,
    currentYear: nextYear,
    currentSeason: String(nextYear),
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
        if (sport === 'nba') {
          throw new NewSeasonError('failed-precondition', 'NBA season advancement uses the NBA season engine.');
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
            .map(player => advancePlayerForNewSeason(player, nextYear));
          releasedPlayers.push(...advancedPlayers.filter(player => (
            player.contractExpired && !player.retired
          )));
          const advanced = advancedPlayers
            .filter(player => !player.retired && !player.contractExpired);
          tx.update(teamDoc.ref, { players: advanced });
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
  advancePlayerForNewSeason,
  autoCutTeamRoster,
  buildNextSeasonLeague,
  createCutRosterPlayerHandler,
  createStartNextSeasonHandler,
  serverRosterCompliance,
};
