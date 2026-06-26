'use strict';

function numberFrom(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function playerName(player) {
  return player && (player.full_name || player.name || player.winnerName) || 'Unnamed Player';
}

function playerStats(player) {
  return player && (player.seasonStats || player.stats) || {};
}

function metric(player, key) {
  const stats = playerStats(player);
  if (key === 'games') return numberFrom(stats.games || stats.gp);
  if (key === 'points') return numberFrom(stats.points || stats.pts);
  if (key === 'rebounds') return numberFrom(stats.rebounds || stats.reb);
  if (key === 'assists') return numberFrom(stats.assists || stats.ast);
  if (key === 'steals') return numberFrom(stats.steals || stats.stl);
  if (key === 'blocks') return numberFrom(stats.blocks || stats.blk);
  return numberFrom(stats[key]);
}

function hasOwn(object, key) {
  return object && Object.prototype.hasOwnProperty.call(object, key);
}

function isRookie(player) {
  return Boolean(
    player && (
      player.rookie
      || player.isRookie
      || (hasOwn(player, 'yearsPro') && numberFrom(player.yearsPro) === 0)
      || (hasOwn(player, 'seasonsPlayed') && numberFrom(player.seasonsPlayed) === 0)
    )
  );
}

function isBenchCandidate(player) {
  const stats = playerStats(player);
  if (player && (player.starter === false || player.role === 'bench' || player.role === 'sixth_man')) return true;
  const games = metric(player, 'games');
  const starts = hasOwn(stats, 'starts') ? numberFrom(stats.starts) : 0;
  return hasOwn(stats, 'starts') && games > 0 && starts < games / 2;
}

function awardPool(teams) {
  return (teams || []).flatMap(team => (team.players || []).map(player => ({
    player,
    team,
  }))).filter(item => metric(item.player, 'games') > 0);
}

function teamName(team) {
  return team.name || team.full_name || team.abbreviation || team.abbr || team.teamId || team.id || null;
}

function teamAbbr(team) {
  return team.abbreviation || team.abbr || team.teamId || team.id || null;
}

function recordForPlayer(item, seasonYear, note) {
  return {
    season: seasonYear,
    winnerName: playerName(item.player),
    teamName: teamName(item.team),
    teamAbbr: teamAbbr(item.team),
    note,
  };
}

function topPlayers(teams, scorer, limit) {
  return awardPool(teams)
    .sort((left, right) => (
      scorer(right) - scorer(left)
      || metric(right.player, 'games') - metric(left.player, 'games')
      || playerName(left.player).localeCompare(playerName(right.player))
    ))
    .slice(0, limit);
}

function filteredTeams(teams, predicate) {
  return (teams || []).map(team => ({
    ...team,
    players: (team.players || []).filter(predicate),
  }));
}

function buildSeasonAwardRecords({ teams, seasonYear }) {
  const mvp = topPlayers(teams, item => (
    metric(item.player, 'points')
    + metric(item.player, 'assists') * 1.45
    + metric(item.player, 'rebounds') * 0.8
    + metric(item.player, 'steals') * 1.8
    + metric(item.player, 'blocks') * 1.5
  ), 1).map(item => recordForPlayer(item, seasonYear, 'MVP'));

  const defensive_player = topPlayers(teams, item => (
    metric(item.player, 'steals') * 3
    + metric(item.player, 'blocks') * 3
    + metric(item.player, 'rebounds') * 0.6
  ), 1).map(item => recordForPlayer(item, seasonYear, 'DPOY'));

  const rookie = topPlayers(filteredTeams(teams, isRookie), item => (
    metric(item.player, 'points')
    + metric(item.player, 'assists')
    + metric(item.player, 'rebounds') * 0.7
  ), 1).map(item => recordForPlayer(item, seasonYear, 'ROY'));

  const sixth_man = topPlayers(filteredTeams(teams, isBenchCandidate), item => (
    metric(item.player, 'points')
    + metric(item.player, 'assists') * 0.8
    + metric(item.player, 'rebounds') * 0.6
  ), 1).map(item => recordForPlayer(item, seasonYear, 'Sixth Man'));

  const most_improved = topPlayers(teams, item => (
    numberFrom(item.player && item.player.progression && item.player.progression.seasonDeltaTotal)
    || numberFrom(item.player && item.player.improvement)
    || numberFrom(item.player && item.player.developmentPointsEarned)
    || metric(item.player, 'points') * 0.25
  ), 1).map(item => recordForPlayer(item, seasonYear, 'MIP'));

  const all_nba = topPlayers(teams, item => (
    metric(item.player, 'points')
    + metric(item.player, 'assists') * 1.2
    + metric(item.player, 'rebounds') * 0.8
  ), 5).map((item, index) => recordForPlayer(item, seasonYear, `All-NBA ${index + 1}`));

  const all_defense = topPlayers(teams, item => (
    metric(item.player, 'steals') * 3
    + metric(item.player, 'blocks') * 3
    + metric(item.player, 'rebounds') * 0.5
  ), 5).map((item, index) => recordForPlayer(item, seasonYear, `All-Defense ${index + 1}`));

  const all_star = topPlayers(teams, item => (
    metric(item.player, 'points')
    + metric(item.player, 'assists')
    + metric(item.player, 'rebounds')
  ), 12).map(item => recordForPlayer(item, seasonYear, 'All-Star'));

  return {
    mvp,
    defensive_player,
    rookie,
    sixth_man,
    most_improved,
    all_nba,
    all_defense,
    all_star,
  };
}

function normalize(value) {
  return String(value || '').trim().toUpperCase();
}

function awardLabel(record, key) {
  if (record && record.note) return String(record.note);
  const labels = {
    mvp: 'MVP',
    defensive_player: 'DPOY',
    rookie: 'ROY',
    sixth_man: 'Sixth Man',
    most_improved: 'MIP',
    all_nba: 'All-NBA',
    all_defense: 'All-Defense',
    all_star: 'All-Star',
  };
  return labels[key] || key;
}

function recordMatchesPlayer(record, team, player) {
  const teamKeys = [team.id, team.teamId, team.abbreviation, team.abbr, team.name].map(normalize);
  const playerKeys = [player.id, player.player_id, player.playerId, player.full_name, player.name].map(normalize);
  return teamKeys.includes(normalize(record.teamAbbr || record.teamName))
    && playerKeys.includes(normalize(record.winnerName));
}

function appendUnique(values, next) {
  const result = [...(Array.isArray(values) ? values : [])];
  if (next && !result.includes(next)) result.push(next);
  return result;
}

function applyAwardRecordsToTeams({ teams, records }) {
  const entries = Object.entries(records || {}).flatMap(([key, awardRecords]) => (
    (Array.isArray(awardRecords) ? awardRecords : []).map(record => ({
      key,
      record,
      label: awardLabel(record, key),
    }))
  ));
  if (entries.length === 0) return teams || [];
  return (teams || []).map(team => ({
    ...team,
    players: (team.players || []).map((player) => {
      const labels = entries
        .filter(entry => recordMatchesPlayer(entry.record, team, player))
        .map(entry => entry.label);
      if (labels.length === 0) return player;
      let seasonAwards = Array.isArray(player.seasonStats && player.seasonStats.awards)
        ? [...player.seasonStats.awards]
        : [];
      let accolades = Array.isArray(player.accolades) ? [...player.accolades] : [];
      labels.forEach((label) => {
        seasonAwards = appendUnique(seasonAwards, label);
        accolades = appendUnique(accolades, label);
      });
      return {
        ...player,
        seasonStats: {
          ...(player.seasonStats || {}),
          awards: seasonAwards,
        },
        accolades,
      };
    }),
  }));
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

function uniqueStrings(values) {
  return [...new Set((values || []).map(value => String(value || '').trim()).filter(Boolean))];
}

function createAwardFinalizedNotifications({ league, leagueId, seasonYear, createdAt }) {
  const leagueName = league && league.name || 'League';
  return uniqueStrings(league && league.members).map(uid => ({
    uid,
    notification: {
      id: `awards-finalized:${leagueId}:${seasonYear}:${uid}`,
      type: 'awards_finalized',
      leagueId,
      leagueName,
      createdAt,
      read: false,
      message: `${seasonYear} awards were finalized in ${leagueName}.`,
    },
  }));
}

function createFinalizeSeasonAwardsHandler({ getFirestore, HttpsError, FieldValue }) {
  return async (request) => {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
    const data = request.data || {};
    const leagueId = typeof data.leagueId === 'string' ? data.leagueId.trim() : '';
    const seasonYear = Number.isInteger(data.seasonYear) ? data.seasonYear : null;
    if (!leagueId || !seasonYear) throw new HttpsError('invalid-argument', 'Provide leagueId and seasonYear.');

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
        throw new HttpsError('permission-denied', 'Only commissioners can finalize awards.');
      }
      const teams = teamsSnap.docs.map(doc => ({ id: doc.id, ref: doc.ref, ...(doc.data() || {}) }));
      const records = buildSeasonAwardRecords({ teams, seasonYear });
      const awardedTeams = applyAwardRecordsToTeams({ teams, records });
      awardedTeams.forEach((team, index) => {
        const original = teams[index];
        if (JSON.stringify(team.players || []) !== JSON.stringify(original.players || [])) {
          tx.update(original.ref, { players: team.players || [] });
        }
      });
      tx.update(leagueRef, {
        seasonAwards: {
          ...(league.seasonAwards || {}),
          ...records,
        },
        awardsFinalizedSeason: seasonYear,
      });
      if (FieldValue) {
        createAwardFinalizedNotifications({
          league,
          leagueId,
          seasonYear,
          createdAt: new Date().toISOString(),
        }).forEach(({ uid: recipientUid, notification }) => {
          tx.set(db.collection('users').doc(recipientUid), {
            notifications: FieldValue.arrayUnion(notification),
          }, { merge: true });
        });
      }
      return { seasonYear, records };
    });
  };
}

module.exports = {
  applyAwardRecordsToTeams,
  buildSeasonAwardRecords,
  createAwardFinalizedNotifications,
  createFinalizeSeasonAwardsHandler,
};
