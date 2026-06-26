'use strict';

class ExpansionError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'ExpansionError';
    this.code = code;
    this.details = details;
  }
}

function normalizeAbbr(value) {
  return String(value || '').trim().toUpperCase();
}

function buildExpansionTeamId(team) {
  return `EXP_${normalizeAbbr(team && team.abbreviation)}`;
}

function teamName(team) {
  return [team && team.city, team && team.name].filter(Boolean).join(' ').trim();
}

function buildExpansionTeamDocs({ proposal, existingTeams = [], seasonYear }) {
  const proposedTeams = Array.isArray(proposal && proposal.teams) ? proposal.teams : [];
  const existing = new Set(
    existingTeams.flatMap(team => [
      normalizeAbbr(team && team.id),
      normalizeAbbr(team && team.teamId),
      normalizeAbbr(team && team.abbreviation),
    ]).filter(Boolean),
  );
  const seen = new Set();

  return proposedTeams.map((team) => {
    const abbreviation = normalizeAbbr(team && team.abbreviation);
    const id = buildExpansionTeamId(team);
    if (!abbreviation || existing.has(abbreviation) || existing.has(id) || seen.has(abbreviation) || seen.has(id)) {
      throw new ExpansionError('failed-precondition', 'Expansion team abbreviation is already in use.', {
        abbreviation,
      });
    }
    seen.add(abbreviation);
    seen.add(id);
    const name = teamName(team);
    return {
      id,
      data: {
        teamId: id,
        abbreviation,
        city: String(team && team.city || '').trim(),
        name,
        full_name: name,
        conference: team && team.conference || null,
        division: team && team.division || null,
        primaryColor: team && team.primaryColor || null,
        secondaryColor: team && team.secondaryColor || null,
        expansionSeason: seasonYear,
        isExpansionTeam: true,
        gmId: null,
        players: [],
        tradeBlock: [],
      },
    };
  });
}

function playerId(player) {
  return String(player && (player.id || player.player_id || player.playerId || player.full_name || player.name) || '').trim();
}

function playerName(player) {
  return String(player && (player.full_name || player.name || playerId(player)) || 'Player');
}

function playerValue(player) {
  for (const key of ['value', 'overall', 'rating']) {
    const numeric = Number(player && player[key]);
    if (Number.isFinite(numeric)) return numeric;
  }
  const hidden = player && player.hidden && typeof player.hidden === 'object' ? player.hidden : {};
  const hiddenValues = Object.values(hidden).map(Number).filter(Number.isFinite);
  if (hiddenValues.length > 0) {
    return hiddenValues.reduce((total, value) => total + value, 0) / hiddenValues.length;
  }
  return 0;
}

function teamId(team) {
  return String(team && (team.id || team.teamId || team.abbreviation) || '').trim();
}

function buildExpansionDraftPool({ teams }) {
  return (teams || [])
    .flatMap((team) => {
      const protectedIds = new Set((team.protectedPlayerIds || []).map(String));
      const sourceTeamId = teamId(team);
      return (team.players || [])
        .map(player => ({ player, id: playerId(player) }))
        .filter(({ id }) => id && !protectedIds.has(id))
        .map(({ player, id }) => ({
          playerId: id,
          sourceTeamId,
          name: playerName(player),
          value: playerValue(player),
          player,
        }));
    })
    .sort((left, right) => (
      right.value - left.value
      || left.sourceTeamId.localeCompare(right.sourceTeamId)
      || left.playerId.localeCompare(right.playerId)
    ));
}

function selectExpansionDraftPlayers({ expansionTeamIds, pool, picksPerExpansionTeam }) {
  const result = {};
  const remaining = [...(pool || [])];
  (expansionTeamIds || []).forEach((expansionTeamId) => {
    const usedSourceTeams = new Set();
    result[expansionTeamId] = [];
    for (let index = 0; index < remaining.length && result[expansionTeamId].length < picksPerExpansionTeam;) {
      const candidate = remaining[index];
      if (usedSourceTeams.has(candidate.sourceTeamId)) {
        index += 1;
        continue;
      }
      result[expansionTeamId].push(candidate);
      usedSourceTeams.add(candidate.sourceTeamId);
      remaining.splice(index, 1);
    }
  });
  return result;
}

function applyExpansionDraftSelections({ teams, expansionTeamDocs, selections }) {
  const selectedBySource = new Map();
  Object.values(selections || {}).flat().forEach((selection) => {
    if (!selectedBySource.has(selection.sourceTeamId)) selectedBySource.set(selection.sourceTeamId, new Set());
    selectedBySource.get(selection.sourceTeamId).add(selection.playerId);
  });
  const teamUpdates = (teams || []).map((team) => {
    const selectedIds = selectedBySource.get(teamId(team)) || new Set();
    return {
      ...team,
      players: (team.players || []).filter(player => !selectedIds.has(playerId(player))),
    };
  });
  const expansionUpdates = (expansionTeamDocs || []).map((doc) => ({
    ...doc,
    data: {
      ...doc.data,
      players: (selections[doc.id] || []).map(selection => ({
        ...selection.player,
        previousTeamId: selection.sourceTeamId,
        expansionDrafted: true,
      })),
    },
  }));
  return { teamUpdates, expansionUpdates };
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

function createSubmitExpansionProtectionHandler({ getFirestore, HttpsError }) {
  return async (request) => {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
    const data = request.data || {};
    const leagueId = String(data.leagueId || '').trim();
    const teamIdInput = String(data.teamId || '').trim();
    const protectedPlayerIds = Array.isArray(data.protectedPlayerIds)
      ? [...new Set(data.protectedPlayerIds.map(id => String(id || '').trim()).filter(Boolean))]
      : [];
    if (!leagueId || !teamIdInput) throw new HttpsError('invalid-argument', 'Provide leagueId and teamId.');

    const db = getFirestore();
    const leagueRef = db.collection('leagues').doc(leagueId);
    return db.runTransaction(async (tx) => {
      const [leagueSnap, teamsSnap] = await Promise.all([
        tx.get(leagueRef),
        tx.get(leagueRef.collection('teams')),
      ]);
      if (!leagueSnap.exists) throw new HttpsError('not-found', 'League not found.');
      const league = leagueSnap.data() || {};
      if (league.expansionDraftCompleted) throw new HttpsError('failed-precondition', 'Expansion draft is already complete.');
      const teamDoc = teamsSnap.docs.find((doc) => {
        const team = doc.data() || {};
        return [doc.id, team.teamId, team.abbreviation].map(value => String(value || '').trim()).includes(teamIdInput);
      });
      if (!teamDoc) throw new HttpsError('not-found', 'Team not found.');
      const team = teamDoc.data() || {};
      if (team.gmId !== uid && !isCommissioner(uid, league)) {
        throw new HttpsError('permission-denied', 'Only this GM or a commissioner can submit protections.');
      }
      const playerIds = new Set((team.players || []).map(playerId));
      const invalid = protectedPlayerIds.find(id => !playerIds.has(id));
      if (invalid) throw new HttpsError('invalid-argument', 'Protected players must be on this roster.');
      const maxProtected = Number(league.expansionProposal && league.expansionProposal.maxProtectedPlayers || 8);
      if (protectedPlayerIds.length > maxProtected) {
        throw new HttpsError('failed-precondition', `Protect ${maxProtected} players or fewer.`);
      }
      tx.update(teamDoc.ref, {
        protectedPlayerIds,
        expansionProtectionUpdatedAt: new Date().toISOString(),
      });
      return { teamId: teamDoc.id, protectedPlayerIds };
    });
  };
}

function createRunExpansionDraftHandler({ getFirestore, HttpsError }) {
  return async (request) => {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
    const data = request.data || {};
    const leagueId = String(data.leagueId || '').trim();
    const picksPerExpansionTeam = Math.max(1, Math.min(15, Number(data.picksPerExpansionTeam || 8)));
    if (!leagueId) throw new HttpsError('invalid-argument', 'Provide leagueId.');

    const db = getFirestore();
    const leagueRef = db.collection('leagues').doc(leagueId);
    return db.runTransaction(async (tx) => {
      const [leagueSnap, teamsSnap] = await Promise.all([
        tx.get(leagueRef),
        tx.get(leagueRef.collection('teams')),
      ]);
      if (!leagueSnap.exists) throw new HttpsError('not-found', 'League not found.');
      const league = leagueSnap.data() || {};
      if (!isCommissioner(uid, league)) throw new HttpsError('permission-denied', 'Only commissioners can run the expansion draft.');
      if (league.expansionDraftCompleted) throw new HttpsError('failed-precondition', 'Expansion draft is already complete.');
      const teams = teamsSnap.docs.map(doc => ({ id: doc.id, ref: doc.ref, ...(doc.data() || {}) }));
      const existingTeams = teams.filter(team => !team.isExpansionTeam);
      const expansionTeamDocs = buildExpansionTeamDocs({
        proposal: league.expansionProposal,
        existingTeams: teams,
        seasonYear: league.offseason && league.offseason.seasonYear || league.currentYear,
      });
      if (expansionTeamDocs.length === 0) throw new HttpsError('failed-precondition', 'No expansion teams are proposed.');
      const pool = buildExpansionDraftPool({ teams: existingTeams });
      const selections = selectExpansionDraftPlayers({
        expansionTeamIds: expansionTeamDocs.map(team => team.id),
        pool,
        picksPerExpansionTeam,
      });
      const result = applyExpansionDraftSelections({ teams: existingTeams, expansionTeamDocs, selections });
      result.teamUpdates.forEach((team) => {
        if (team.ref) tx.update(team.ref, { players: team.players || [] });
      });
      result.expansionUpdates.forEach((team) => {
        tx.set(leagueRef.collection('teams').doc(team.id), team.data);
      });
      tx.update(leagueRef, {
        expansionDraftCompleted: true,
        expansionDraft: {
          completedAt: new Date().toISOString(),
          picksPerExpansionTeam,
          selections,
        },
      });
      return {
        expansionTeamIds: expansionTeamDocs.map(team => team.id),
        selections,
      };
    });
  };
}

module.exports = {
  ExpansionError,
  applyExpansionDraftSelections,
  buildExpansionDraftPool,
  buildExpansionTeamDocs,
  buildExpansionTeamId,
  createRunExpansionDraftHandler,
  createSubmitExpansionProtectionHandler,
  selectExpansionDraftPlayers,
};
