'use strict';

class ScheduleError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'ScheduleError';
    this.code = code;
    this.details = details;
  }
}

const APPROVED_LENGTHS = new Set([14, 17, 29, 58, 82, 162]);
const NBA_TEAM_IDS = Object.freeze([
  'ATL', 'BOS', 'BKN', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GSW',
  'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NOP', 'NYK',
  'OKC', 'ORL', 'PHI', 'PHX', 'POR', 'SAC', 'SAS', 'TOR', 'UTA', 'WAS',
]);

const TEAM_ALIASES = {
  NOH: ['NOP', 'NOK'],
  NOK: ['NOH', 'NOP'],
  NOP: ['NOH', 'NOK'],
  NJN: ['BKN'],
  BKN: ['NJN'],
  SEA: ['OKC'],
  OKC: ['SEA'],
  VAN: ['MEM'],
  MEM: ['VAN'],
  KCK: ['SAC'],
  SAC: ['KCK'],
};

function hash(value) {
  let h = 2166136261;
  for (let i = 0; i < String(value).length; i += 1) {
    h ^= String(value).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function supportsNbaCupSchedule({ era, currentYear }) {
  return String(era || 'current') === 'current' && Number(currentYear) >= 2023;
}

function buildNbaCupSchedule({ scheduleTeamIds, currentYear, seed }) {
  if (!Array.isArray(scheduleTeamIds) || scheduleTeamIds.length < 30) return null;
  const groupSize = scheduleTeamIds.length % 5 === 0 ? 5 : 6;
  const teams = [...scheduleTeamIds].sort((a, b) => hash(`${seed}:cup:${a}`) - hash(`${seed}:cup:${b}`) || a.localeCompare(b));
  const groups = Array.from({ length: Math.ceil(teams.length / groupSize) }, (_, index) => ({
    id: `Group ${String.fromCharCode(65 + index)}`,
    teamIds: teams.slice(index * groupSize, index * groupSize + groupSize),
  })).filter(group => group.teamIds.length > 1);
  const games = [];

  groups.forEach((group, groupIndex) => {
    const homeCounts = new Map(group.teamIds.map(teamId => [teamId, 0]));
    for (let leftIndex = 0; leftIndex < group.teamIds.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < group.teamIds.length; rightIndex += 1) {
        const left = group.teamIds[leftIndex];
        const right = group.teamIds[rightIndex];
        const leftHome = homeCounts.get(left) || 0;
        const rightHome = homeCounts.get(right) || 0;
        const homeTeamId = leftHome < rightHome
          ? left
          : rightHome < leftHome
            ? right
            : hash(`${seed}:cup-home:${group.id}:${left}:${right}`) % 2 === 0 ? left : right;
        const awayTeamId = homeTeamId === left ? right : left;
        homeCounts.set(homeTeamId, (homeCounts.get(homeTeamId) || 0) + 1);
        const sequence = games.length + 1;
        games.push({
          id: `nba_cup_${hash(`${seed}:${sequence}:${awayTeamId}:${homeTeamId}`).toString(36)}`,
          stage: 'group',
          groupId: group.id,
          competition: 'nbaCup',
          week: groupIndex + 1,
          sequence,
          homeTeamId,
          awayTeamId,
          status: 'scheduled',
        });
      }
    }
  });

  return {
    enabled: true,
    name: 'NBA Cup',
    seasonYear: currentYear,
    groupSize,
    groups,
    games,
  };
}

function cupPairKey(game) {
  return [game.homeTeamId, game.awayTeamId].sort().join('__');
}

function integrateNbaCupGamesIntoRegularSchedule(games, nbaCup) {
  if (!nbaCup || !Array.isArray(nbaCup.games) || nbaCup.games.length === 0) {
    return { games, nbaCup };
  }
  const availableByPair = new Map();
  (games || []).forEach((game) => {
    const key = cupPairKey(game);
    const current = availableByPair.get(key) || [];
    current.push(game);
    availableByPair.set(key, current);
  });
  const replacements = new Map();
  const nextCupGames = nbaCup.games.map((cupGame) => {
    if (!cupGame || cupGame.stage !== 'group') return cupGame;
    const candidates = availableByPair.get(cupPairKey(cupGame)) || [];
    const regularGame = candidates.shift();
    if (!regularGame) return cupGame;
    const sharedId = cupGame.id;
    const scheduleGame = {
      ...regularGame,
      id: sharedId,
      competition: 'nbaCup',
      stage: 'group',
      groupId: cupGame.groupId,
      cupSequence: cupGame.sequence,
      homeTeamId: cupGame.homeTeamId,
      awayTeamId: cupGame.awayTeamId,
      homeGmId: cupGame.homeGmId || regularGame.homeGmId || null,
      awayGmId: cupGame.awayGmId || regularGame.awayGmId || null,
      countsForRegularSeason: true,
    };
    const mirroredCupGame = {
      ...scheduleGame,
      sequence: cupGame.sequence,
      week: cupGame.week,
      competition: 'nbaCup',
      stage: 'group',
    };
    replacements.set(regularGame.id, { scheduleGame, cupGame: mirroredCupGame });
    return mirroredCupGame;
  });
  return {
    games: (games || []).map(game => {
      const replacement = replacements.get(game.id);
      return replacement ? replacement.scheduleGame : game;
    }),
    nbaCup: { ...nbaCup, games: nextCupGames },
  };
}

function gameId(seed, sequence, awayTeamId, homeTeamId) {
  return `game_${hash(`${seed}:${sequence}:${awayTeamId}:${homeTeamId}`).toString(36)}`;
}

function seededTeams(teams, seed) {
  return [...teams].sort((a, b) => hash(`${seed}:${a}`) - hash(`${seed}:${b}`) || a.localeCompare(b));
}

function candidatePairings(teams, seed, cycle) {
  const pairings = [];
  for (let leftIndex = 0; leftIndex < teams.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < teams.length; rightIndex += 1) {
      pairings.push([teams[leftIndex], teams[rightIndex]]);
    }
  }
  return pairings.sort((a, b) => (
    hash(`${seed}:pair:${cycle}:${a[0]}:${a[1]}`) - hash(`${seed}:pair:${cycle}:${b[0]}:${b[1]}`)
    || a[0].localeCompare(b[0])
    || a[1].localeCompare(b[1])
  ));
}

function regularPairings(teams, degree, seed) {
  if (degree <= 0) return [];
  if (degree >= teams.length) {
    throw new ScheduleError('failed-precondition', 'Schedule length is too large for this team count.');
  }
  const remaining = new Map(teams.map(team => [team, degree]));
  const pairings = [];
  let iteration = 0;

  while ([...remaining.values()].some(value => value > 0)) {
    const active = teams
      .filter(team => (remaining.get(team) || 0) > 0)
      .sort((a, b) => (
        (remaining.get(b) || 0) - (remaining.get(a) || 0)
        || hash(`${seed}:active:${iteration}:${a}`) - hash(`${seed}:active:${iteration}:${b}`)
        || a.localeCompare(b)
      ));
    const team = active[0];
    const needed = remaining.get(team) || 0;
    const opponents = active
      .slice(1)
      .sort((a, b) => (
        (remaining.get(b) || 0) - (remaining.get(a) || 0)
        || hash(`${seed}:opponent:${iteration}:${a}`) - hash(`${seed}:opponent:${iteration}:${b}`)
        || a.localeCompare(b)
      ))
      .slice(0, needed);
    if (opponents.length !== needed) {
      throw new ScheduleError('failed-precondition', 'Unable to build a balanced NBA schedule for this team count and length.');
    }
    remaining.set(team, 0);
    opponents.forEach((opponent) => {
      const opponentRemaining = remaining.get(opponent) || 0;
      if (opponentRemaining <= 0) {
        throw new ScheduleError('failed-precondition', 'Unable to build a balanced NBA schedule for this team count and length.');
      }
      remaining.set(opponent, opponentRemaining - 1);
      pairings.push([team, opponent]);
    });
    iteration += 1;
  }

  return pairings.sort((a, b) => (
    hash(`${seed}:order:${a[0]}:${a[1]}`) - hash(`${seed}:order:${b[0]}:${b[1]}`)
    || a[0].localeCompare(b[0])
    || a[1].localeCompare(b[1])
  ));
}

function buildPairings(teams, target, seed) {
  const fullCycles = Math.floor(target / Math.max(1, teams.length - 1));
  const remainder = target % Math.max(1, teams.length - 1);
  const pairings = [];
  for (let cycle = 0; cycle < fullCycles; cycle += 1) {
    pairings.push(...candidatePairings(teams, seed, cycle));
  }
  pairings.push(...regularPairings(teams, remainder, `${seed}:remainder:${fullCycles}`));
  return pairings;
}

function addFlowEdge(graph, from, to, cap) {
  const forward = { to, rev: graph[to].length, cap };
  const reverse = { to: from, rev: graph[from].length, cap: 0 };
  graph[from].push(forward);
  graph[to].push(reverse);
}

function maxFlow(graph, source, sink) {
  let flow = 0;
  while (true) {
    const parent = Array.from({ length: graph.length }, () => ({ node: -1, edge: -1 }));
    const queue = [source];
    parent[source] = { node: source, edge: -1 };
    for (let cursor = 0; cursor < queue.length && parent[sink].node < 0; cursor += 1) {
      const node = queue[cursor];
      graph[node].forEach((edge, edgeIndex) => {
        if (edge.cap > 0 && parent[edge.to].node < 0) {
          parent[edge.to] = { node, edge: edgeIndex };
          queue.push(edge.to);
        }
      });
    }
    if (parent[sink].node < 0) break;
    let add = 1;
    for (let node = sink; node !== source; node = parent[node].node) {
      const prev = parent[node];
      add = Math.min(add, graph[prev.node][prev.edge].cap);
    }
    for (let node = sink; node !== source; node = parent[node].node) {
      const prev = parent[node];
      const edge = graph[prev.node][prev.edge];
      edge.cap -= add;
      graph[edge.to][edge.rev].cap += add;
    }
    flow += add;
  }
  return flow;
}

function assignHomeTeams(pairings, teams, seed) {
  const teamIndex = new Map(teams.map((team, index) => [team, index]));
  const totalHomeGames = pairings.length;
  const baseHomeTarget = Math.floor(totalHomeGames / teams.length);
  const extraHomeTeams = totalHomeGames - baseHomeTarget * teams.length;
  const source = 0;
  const gameOffset = 1;
  const teamOffset = gameOffset + pairings.length;
  const sink = teamOffset + teams.length;
  const graph = Array.from({ length: sink + 1 }, () => []);

  pairings.forEach(([left, right], index) => {
    const gameNode = gameOffset + index;
    addFlowEdge(graph, source, gameNode, 1);
    [left, right]
      .sort((a, b) => hash(`${seed}:home-flow:${index}:${a}`) - hash(`${seed}:home-flow:${index}:${b}`) || a.localeCompare(b))
      .forEach(team => addFlowEdge(graph, gameNode, teamOffset + teamIndex.get(team), 1));
  });
  teams.forEach((team, index) => {
    const quota = baseHomeTarget + (index < extraHomeTeams ? 1 : 0);
    addFlowEdge(graph, teamOffset + index, sink, quota);
  });

  if (maxFlow(graph, source, sink) !== pairings.length) {
    throw new ScheduleError('failed-precondition', 'Unable to balance NBA home and away games.');
  }

  return pairings.map(([left, right], index) => {
    const gameNode = gameOffset + index;
    const used = graph[gameNode].find(edge => (
      edge.to >= teamOffset
      && edge.to < sink
      && edge.cap === 0
      && [left, right].includes(teams[edge.to - teamOffset])
    ));
    return used ? teams[used.to - teamOffset] : left;
  });
}

function generateServerSchedule({ teams, gamesPerTeam, seed }) {
  if (!Array.isArray(teams) || teams.length < 30 || teams.length > 36 || new Set(teams).size !== teams.length) {
    throw new ScheduleError('failed-precondition', 'Schedules require 30 to 36 unique teams.');
  }
  if (!APPROVED_LENGTHS.has(gamesPerTeam)) {
    throw new ScheduleError('invalid-argument', 'Choose an approved schedule length.');
  }
  if ((teams.length * gamesPerTeam) % 2 !== 0) {
    throw new ScheduleError('invalid-argument', 'Schedule length must create an even number of team games.');
  }
  const orderedTeams = seededTeams(teams, seed);
  const pairings = buildPairings(orderedTeams, gamesPerTeam, seed);
  const homeTeams = assignHomeTeams(pairings, orderedTeams, seed);
  const games = [];

  pairings.forEach(([left, right], index) => {
    const homeTeamId = homeTeams[index];
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
  });

  for (const team of orderedTeams) {
    const appearances = games.filter(game => game.homeTeamId === team || game.awayTeamId === team).length;
    if (appearances !== gamesPerTeam) {
      throw new ScheduleError('failed-precondition', 'Unable to build a balanced NBA schedule for this team count and length.');
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

function docData(doc) {
  return typeof doc.data === 'function' ? doc.data() : (doc.data || {});
}

function normalizeScheduleTeamId(value) {
  return String(value || '').trim().toUpperCase();
}

function scheduleKeyAliases(value) {
  const key = normalizeScheduleTeamId(value);
  return key ? [key].concat(TEAM_ALIASES[key] || []) : [];
}

function scheduleTeamIdFromDoc(doc) {
  const team = docData(doc);
  return normalizeScheduleTeamId(team.id || team.teamId || team.abbreviation || team.abbr || doc.id);
}

function buildNbaScheduleParticipants(teamDocs, scheduleTeamIds) {
  const claimedByTeam = new Map();
  (teamDocs || []).forEach((doc) => {
    const team = docData(doc);
    const scheduleTeamId = normalizeScheduleTeamId(team.teamId || team.abbreviation || team.abbr || doc.id);
    if (!scheduleTeamId || claimedByTeam.has(scheduleTeamId)) return;
    const participant = {
      scheduleTeamId,
      sourceTeamDocId: doc.id,
      gmId: team.gmId || null,
      abbreviation: normalizeScheduleTeamId(team.abbreviation || team.abbr || scheduleTeamId),
      name: team.name || team.full_name || '',
    };
    [team.teamId, team.abbreviation, team.abbr, doc.id]
      .flatMap(scheduleKeyAliases)
      .forEach((key) => {
        if (!claimedByTeam.has(key)) claimedByTeam.set(key, participant);
      });
  });

  return (scheduleTeamIds || NBA_TEAM_IDS).map((rawScheduleTeamId) => {
    const scheduleTeamId = normalizeScheduleTeamId(rawScheduleTeamId);
    const claimed = scheduleKeyAliases(scheduleTeamId)
      .map(key => claimedByTeam.get(key))
      .find(Boolean);
    return claimed ? { ...claimed, scheduleTeamId } : {
      scheduleTeamId,
      sourceTeamDocId: null,
      gmId: null,
      abbreviation: scheduleTeamId,
      name: '',
    };
  });
}

function decorateGamesWithParticipants(games, participants) {
  const byTeamId = new Map(participants.map(team => [team.scheduleTeamId, team]));
  return games.map((game) => {
    const home = byTeamId.get(game.homeTeamId);
    const away = byTeamId.get(game.awayTeamId);
    return {
      ...game,
      homeGmId: home && home.gmId ? home.gmId : null,
      awayGmId: away && away.gmId ? away.gmId : null,
    };
  });
}

function finalWinnerTeamId(game) {
  if (!game || game.status !== 'final') return '';
  if (game.winnerTeamId) return game.winnerTeamId;
  if (typeof game.homeScore !== 'number' || typeof game.awayScore !== 'number') return '';
  return game.homeScore > game.awayScore ? game.homeTeamId : game.awayTeamId;
}

function stageComplete(games) {
  return games.length > 0 && games.every(game => Boolean(finalWinnerTeamId(game)));
}

function participantForTeam(participants, teamId) {
  const aliases = new Set(scheduleKeyAliases(teamId));
  return participants.find(participant => scheduleKeyAliases(participant.scheduleTeamId).some(key => aliases.has(key)));
}

function cupStageGame({ seed, sequence, stage, awayTeamId, homeTeamId }) {
  const stageWeeks = { group: 1, quarterfinal: 7, semifinal: 8, final: 9 };
  return {
    id: `nba_cup_${stage}_${hash(`${seed}:${stage}:${sequence}:${awayTeamId}:${homeTeamId}`).toString(36)}`,
    stage,
    competition: 'nbaCup',
    week: stageWeeks[stage],
    sequence,
    homeTeamId,
    awayTeamId,
    status: 'scheduled',
  };
}

function ensureCupRow(rows, aliases, participant, rawTeamId) {
  const teamId = normalizeScheduleTeamId(rawTeamId || (participant && participant.scheduleTeamId));
  if (!teamId) return null;
  const rowKey = aliases.get(teamId) || teamId;
  if (!rows.has(rowKey)) {
    rows.set(rowKey, {
      teamId: rowKey,
      abbreviation: normalizeScheduleTeamId((participant && participant.abbreviation) || rowKey),
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDiff: 0,
      pct: 0,
    });
  }
  scheduleKeyAliases(teamId).forEach(key => aliases.set(key, rowKey));
  if (participant) {
    scheduleKeyAliases(participant.abbreviation).forEach(key => aliases.set(key, rowKey));
  }
  return rows.get(rowKey);
}

function cupGroupStandings({ games, groups, participants }) {
  return groups.map((group) => {
    const rows = new Map();
    const aliases = new Map();
    group.teamIds.forEach((teamId) => {
      const participant = participantForTeam(participants, teamId);
      ensureCupRow(rows, aliases, participant, teamId);
    });
    games
      .filter(game => game.groupId === group.id && game.status === 'final' && typeof game.homeScore === 'number' && typeof game.awayScore === 'number')
      .forEach((game) => {
        const home = ensureCupRow(rows, aliases, participantForTeam(participants, game.homeTeamId), game.homeTeamId);
        const away = ensureCupRow(rows, aliases, participantForTeam(participants, game.awayTeamId), game.awayTeamId);
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
    return {
      id: group.id,
      rows: [...rows.values()].map((row) => {
        const gamesPlayed = row.wins + row.losses;
        return {
          ...row,
          pointDiff: row.pointsFor - row.pointsAgainst,
          pct: gamesPlayed > 0 ? row.wins / gamesPlayed : 0,
        };
      }).sort((a, b) => (
        b.pct - a.pct
        || b.wins - a.wins
        || b.pointDiff - a.pointDiff
        || b.pointsFor - a.pointsFor
        || a.abbreviation.localeCompare(b.abbreviation)
      )),
    };
  });
}

function seededCupTeams(nbaCup, participants) {
  const groupTables = cupGroupStandings({
    games: nbaCup.games || [],
    groups: nbaCup.groups || [],
    participants,
  });
  const groupWinners = groupTables.map(group => group.rows[0]).filter(Boolean);
  const winnerIds = new Set(groupWinners.map(row => row.teamId));
  const wildcards = groupTables
    .flatMap(group => group.rows.slice(1))
    .filter(row => !winnerIds.has(row.teamId))
    .sort((a, b) => (
      b.pct - a.pct
      || b.wins - a.wins
      || b.pointDiff - a.pointDiff
      || b.pointsFor - a.pointsFor
      || a.abbreviation.localeCompare(b.abbreviation)
    ))
    .slice(0, Math.max(0, 8 - groupWinners.length));
  return [...groupWinners, ...wildcards]
    .sort((a, b) => (
      b.pct - a.pct
      || b.wins - a.wins
      || b.pointDiff - a.pointDiff
      || b.pointsFor - a.pointsFor
      || a.abbreviation.localeCompare(b.abbreviation)
    ))
    .map(row => row.teamId)
    .slice(0, 8);
}

function appendCupStageGames({ nbaCup, stage, pairings, participants, seed }) {
  const nextSequence = (nbaCup.games || []).length + 1;
  const games = pairings.map(([homeTeamId, awayTeamId], index) => cupStageGame({
    seed,
    sequence: nextSequence + index,
    stage,
    homeTeamId,
    awayTeamId,
  }));
  return {
    ...nbaCup,
    games: [
      ...(nbaCup.games || []),
      ...decorateGamesWithParticipants(games, participants),
    ],
  };
}

function advanceNbaCupStage({ nbaCup, participants, seed }) {
  const games = Array.isArray(nbaCup && nbaCup.games) ? nbaCup.games : [];
  const groupGames = games.filter(game => game.stage === 'group');
  const quarterfinals = games.filter(game => game.stage === 'quarterfinal');
  const semifinals = games.filter(game => game.stage === 'semifinal');
  const finals = games.filter(game => game.stage === 'final');

  if (quarterfinals.length === 0) {
    if (!stageComplete(groupGames)) return nbaCup;
    const seededTeams = seededCupTeams(nbaCup, participants);
    if (seededTeams.length < 8) return nbaCup;
    return appendCupStageGames({
      nbaCup,
      participants,
      seed,
      stage: 'quarterfinal',
      pairings: [
        [seededTeams[0], seededTeams[7]],
        [seededTeams[3], seededTeams[4]],
        [seededTeams[2], seededTeams[5]],
        [seededTeams[1], seededTeams[6]],
      ],
    });
  }

  if (semifinals.length === 0) {
    if (!stageComplete(quarterfinals)) return nbaCup;
    const winners = quarterfinals.map(finalWinnerTeamId);
    return appendCupStageGames({
      nbaCup,
      participants,
      seed,
      stage: 'semifinal',
      pairings: [[winners[0], winners[1]], [winners[2], winners[3]]],
    });
  }

  if (finals.length === 0) {
    if (!stageComplete(semifinals)) return nbaCup;
    const winners = semifinals.map(finalWinnerTeamId);
    return appendCupStageGames({
      nbaCup,
      participants,
      seed,
      stage: 'final',
      pairings: [[winners[0], winners[1]]],
    });
  }

  if (!nbaCup.championTeamId && stageComplete(finals)) {
    const championTeamId = finalWinnerTeamId(finals[0]);
    const champion = participantForTeam(participants, championTeamId);
    return {
      ...nbaCup,
      championTeamId,
      championTeamName: (champion && (champion.name || champion.abbreviation)) || championTeamId,
      championTeamAbbr: (champion && champion.abbreviation) || championTeamId,
    };
  }

  return nbaCup;
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
      if (!isCommissioner(uid, league)) throw new HttpsError('permission-denied', 'Only commissioners can create schedules.');
      if (league.scheduleLocked === true) throw new HttpsError('failed-precondition', 'Schedule is already locked.');

      const teamsSnap = await tx.get(leagueRef.collection('teams'));
      const sport = String(league.sport || 'nba').toLowerCase() === 'nfl' ? 'madden' : String(league.sport || 'nba').toLowerCase();
      const claimedTeamIds = teamsSnap.docs.map(scheduleTeamIdFromDoc).filter(Boolean);
      let scheduleTeamIds = claimedTeamIds.length >= 30 && claimedTeamIds.length <= 36 ? [...new Set(claimedTeamIds)] : [];
      if (sport === 'nba') {
        const eraKey = league.era && league.era !== 'null' ? league.era : 'current';
        const eraTeamsSnap = await tx.get(db.collection('era_rosters').doc(eraKey).collection('teams'));
        const eraTeamIds = eraTeamsSnap.docs.map(scheduleTeamIdFromDoc).filter(Boolean);
        scheduleTeamIds = eraTeamIds.length >= 30 && eraTeamIds.length <= 36 ? [...new Set(eraTeamIds)] : NBA_TEAM_IDS;
      } else if (scheduleTeamIds.length < 30) {
        const sportTeamsSnap = await tx.get(db.collection('sport_rosters').doc(sport).collection('teams'));
        const sportTeamIds = sportTeamsSnap.docs.map(scheduleTeamIdFromDoc).filter(Boolean);
        scheduleTeamIds = sportTeamIds.length >= 30 && sportTeamIds.length <= 36 ? [...new Set(sportTeamIds)] : scheduleTeamIds;
      }
      const participants = buildNbaScheduleParticipants(teamsSnap.docs, scheduleTeamIds);
      const teams = participants.map(team => team.scheduleTeamId);
      const seed = `${leagueId}:${league.currentYear || 2025}:${gamesPerTeam}`;
      const currentYear = Number(league.currentYear || 2025);
      const rawNbaCup = sport === 'nba' && supportsNbaCupSchedule({ era: league.era, currentYear })
        ? buildNbaCupSchedule({ scheduleTeamIds: teams, currentYear, seed })
        : null;
      const nbaCup = rawNbaCup
        ? { ...rawNbaCup, games: decorateGamesWithParticipants(rawNbaCup.games, participants) }
        : null;
      const baseGames = decorateGamesWithParticipants(
        generateServerSchedule({ teams, gamesPerTeam, seed }),
        participants,
      );
      const integratedSchedule = integrateNbaCupGamesIntoRegularSchedule(baseGames, nbaCup);
      const games = integratedSchedule.games;
      const integratedNbaCup = integratedSchedule.nbaCup;
      const batchId = String(league.currentYear || 2025);
      const scheduleRef = leagueRef.collection('schedules').doc(batchId);
      tx.set(scheduleRef, {
        games,
        gamesPerTeam,
        teamCount: teams.length,
        participants,
        nbaCup: integratedNbaCup,
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

function createAdvanceNbaCupHandler({ getFirestore, HttpsError }) {
  return async (request) => {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
    const data = request.data || {};
    const leagueId = typeof data.leagueId === 'string' ? data.leagueId.trim() : '';
    if (!leagueId) throw new HttpsError('invalid-argument', 'Provide leagueId.');
    const db = getFirestore();
    const leagueRef = db.collection('leagues').doc(leagueId);
    return db.runTransaction(async (tx) => {
      const leagueSnap = await tx.get(leagueRef);
      if (!leagueSnap.exists) throw new HttpsError('not-found', 'League not found.');
      const league = leagueSnap.data() || {};
      if (!isCommissioner(uid, league)) {
        throw new HttpsError('permission-denied', 'Only commissioners can advance the NBA Cup.');
      }
      const scheduleId = league.scheduleId || String(league.currentYear || 2025);
      const scheduleRef = leagueRef.collection('schedules').doc(scheduleId);
      const scheduleSnap = await tx.get(scheduleRef);
      if (!scheduleSnap.exists) throw new HttpsError('not-found', 'Schedule not found.');
      const schedule = scheduleSnap.data() || {};
      if (!schedule.nbaCup || !Array.isArray(schedule.nbaCup.games)) {
        throw new HttpsError('failed-precondition', 'NBA Cup is not available for this schedule.');
      }
      const seed = schedule.seed || `${leagueId}:${league.currentYear || 2025}:${schedule.gamesPerTeam || 82}`;
      const nextCup = advanceNbaCupStage({
        nbaCup: schedule.nbaCup,
        participants: Array.isArray(schedule.participants) ? schedule.participants : [],
        seed,
      });
      if (JSON.stringify(nextCup) === JSON.stringify(schedule.nbaCup)) {
        throw new HttpsError('failed-precondition', 'The NBA Cup is not ready to advance yet.');
      }
      tx.update(scheduleRef, { nbaCup: nextCup });
      return {
        advanced: true,
        championTeamId: nextCup.championTeamId || null,
        games: Array.isArray(nextCup.games) ? nextCup.games.length : 0,
      };
    });
  };
}

module.exports = {
  ScheduleError,
  NBA_TEAM_IDS,
  advanceNbaCupStage,
  buildNbaScheduleParticipants,
  buildNbaCupSchedule,
  createAdvanceNbaCupHandler,
  createGenerateScheduleHandler,
  decorateGamesWithParticipants,
  generateServerSchedule,
  integrateNbaCupGamesIntoRegularSchedule,
  supportsNbaCupSchedule,
};
