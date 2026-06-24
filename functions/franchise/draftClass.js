'use strict';

class DraftClassError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'DraftClassError';
    this.code = code;
    this.details = details;
  }
}

const SERVER_FIRST_NAMES = ['Aiden', 'Caleb', 'Darius', 'Elias', 'Jalen', 'Malik', 'Noah', 'Theo'];
const SERVER_LAST_NAMES = ['Adams', 'Brooks', 'Carter', 'Davis', 'Hayes', 'Lewis', 'Parker', 'Walker'];
const SERVER_NFL_POSITIONS = ['QB', 'HB', 'WR', 'TE', 'LT', 'EDGE', 'DT', 'MLB', 'CB', 'FS', 'SS'];
const SERVER_MLB_POSITIONS = ['SP', 'RP', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];

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

function serverPick(random, values) {
  return values[Math.floor(random() * values.length)];
}

function serverInt(random, min, max) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function generateServerDraftClass(sportInput, teams, seed) {
  const sport = sportInput === 'nfl' ? 'madden' : sportInput;
  if (!['madden', 'mlb'].includes(sport)) {
    throw new DraftClassError('failed-precondition', 'Draft generation supports NFL and MLB leagues.');
  }
  if (!Number.isInteger(teams) || teams <= 0 || !seed) {
    throw new DraftClassError('invalid-argument', 'Valid teams and seed are required.');
  }
  const rounds = sport === 'madden' ? 7 : 5;
  const positions = sport === 'madden' ? SERVER_NFL_POSITIONS : SERVER_MLB_POSITIONS;
  const random = seededRandom(`${sport}:${seed}`);
  return Array.from({ length: teams * rounds }, (_, index) => {
    const projectedRound = Math.floor(index / teams) + 1;
    const first = serverPick(random, SERVER_FIRST_NAMES);
    const last = serverPick(random, SERVER_LAST_NAMES);
    const position = serverPick(random, positions);
    const id = `${String(seed).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${index + 1}`;
    const base = {
      id,
      player_id: id,
      name: `${first} ${last}`,
      full_name: `${first} ${last}`,
      sport,
      position,
      age: sport === 'madden' ? serverInt(random, 20, 24) : serverInt(random, 18, 23),
      archetype: sport === 'madden'
        ? serverPick(random, ['Athletic Prospect', 'Technical Prospect', 'Power Prospect'])
        : serverPick(random, ['Balanced Prospect', 'Contact Prospect', 'Defensive Prospect']),
      projectedRound,
      summary: `${first} ${last} is a developing ${position} prospect with a projected round ${projectedRound} grade and long-term upside.`,
    };
    if (sport === 'madden') {
      const heightInches = serverInt(random, 66, 81);
      return {
        ...base,
        heightInches,
        height: `${Math.floor(heightInches / 12)}'${heightInches % 12}"`,
        weight: serverInt(random, 165, 380),
        ratings: {
          athleticism: serverInt(random, 45, 92),
          awareness: serverInt(random, 40, 88),
          technique: serverInt(random, 42, 91),
          strength: serverInt(random, 40, 94),
          speed: serverInt(random, 42, 97),
        },
        developmentTrait: serverPick(random, ['normal', 'normal', 'star', 'superstar', 'x_factor']),
      };
    }
    return {
        ...base,
        handedness: serverPick(random, ['R', 'R', 'L', 'S']),
        ratings: {
          contact: serverInt(random, 35, 92),
          power: serverInt(random, 35, 95),
          fielding: serverInt(random, 38, 94),
          speed: serverInt(random, 35, 97),
          arm: serverInt(random, 38, 96),
          discipline: serverInt(random, 35, 91),
        },
        potential: serverInt(random, 55, 99),
    };
  });
}

function draftClassDocumentId(seasonYear) {
  if (!Number.isInteger(seasonYear) || seasonYear < 1900) {
    throw new DraftClassError('invalid-argument', 'A valid draft season is required.');
  }
  return String(seasonYear);
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

function assertDraftClassEditable({
  uid,
  league,
  expectedVersion,
  draftClass,
}) {
  if (!isCommissioner(uid, league)) {
    throw new DraftClassError('permission-denied', 'Only a commissioner can edit the draft class.');
  }
  const offseason = league.offseason || {};
  if (
    offseason.stage !== 'draft_class_review'
    || offseason.version !== expectedVersion
  ) {
    throw new DraftClassError(
      'failed-precondition',
      'Draft class editing is available only during the current review stage.',
    );
  }
  if (draftClass && draftClass.published === true) {
    throw new DraftClassError('failed-precondition', 'The published draft class is locked.');
  }
}

function prospectId(prospect) {
  return String(prospect && (prospect.id || prospect.player_id) || '');
}

function validProspect(prospect) {
  return Boolean(
    prospect
    && typeof prospect === 'object'
    && prospectId(prospect)
    && typeof prospect.full_name === 'string'
    && prospect.full_name.trim()
    && typeof prospect.position === 'string'
    && prospect.position.trim()
  );
}

function boundedNumber(value, fallback, min, max) {
  return Number.isFinite(value)
    ? Math.round(Math.min(max, Math.max(min, value)))
    : fallback;
}

function normalizeProspectForSport(prospect, sportInput) {
  if (!validProspect(prospect)) {
    throw new DraftClassError('invalid-argument', 'A valid prospect is required.');
  }
  const sport = sportInput === 'nfl' ? 'madden' : sportInput;
  const positions = sport === 'madden'
    ? SERVER_NFL_POSITIONS
    : sport === 'mlb' ? SERVER_MLB_POSITIONS : [];
  const maxRound = sport === 'madden' ? 7 : sport === 'mlb' ? 5 : 0;
  if (
    !positions.includes(prospect.position)
    || !Number.isInteger(prospect.projectedRound)
    || prospect.projectedRound < 1
    || prospect.projectedRound > maxRound
  ) {
    throw new DraftClassError('invalid-argument', 'Prospect position or projected round is invalid for this sport.');
  }
  const id = prospectId(prospect);
  const fullName = prospect.full_name.trim().slice(0, 80);
  const base = {
    ...prospect,
    id,
    player_id: id,
    name: fullName,
    full_name: fullName,
    sport,
    age: boundedNumber(prospect.age, sport === 'madden' ? 22 : 21, sport === 'madden' ? 20 : 18, 24),
    archetype: prospect.archetype || 'Custom Prospect',
    summary: String(
      prospect.summary
      || `${fullName} is a commissioner-created ${prospect.position} prospect.`,
    ).slice(0, 500),
  };
  if (sport === 'madden') {
    const heightInches = boundedNumber(prospect.heightInches, 74, 66, 81);
    const ratings = prospect.ratings || {};
    return {
      ...base,
      heightInches,
      height: prospect.height || `${Math.floor(heightInches / 12)}'${heightInches % 12}"`,
      weight: boundedNumber(prospect.weight, 220, 165, 380),
      ratings: {
        athleticism: boundedNumber(ratings.athleticism, 70, 40, 99),
        awareness: boundedNumber(ratings.awareness, 65, 40, 99),
        technique: boundedNumber(ratings.technique, 68, 40, 99),
        strength: boundedNumber(ratings.strength, 70, 40, 99),
        speed: boundedNumber(ratings.speed, 72, 40, 99),
      },
      developmentTrait: ['normal', 'star', 'superstar', 'x_factor'].includes(prospect.developmentTrait)
        ? prospect.developmentTrait
        : 'normal',
    };
  }
  const ratings = prospect.ratings || {};
  return {
    ...base,
    handedness: ['R', 'L', 'S'].includes(prospect.handedness) ? prospect.handedness : 'R',
    ratings: {
      contact: boundedNumber(ratings.contact, 65, 35, 99),
      power: boundedNumber(ratings.power, 60, 35, 99),
      fielding: boundedNumber(ratings.fielding, 65, 35, 99),
      speed: boundedNumber(ratings.speed, 65, 35, 99),
      arm: boundedNumber(ratings.arm, 65, 35, 99),
      discipline: boundedNumber(ratings.discipline, 60, 35, 99),
    },
    potential: boundedNumber(prospect.potential, 70, 55, 99),
  };
}

function applyDraftClassMutation(players, mutation) {
  const current = Array.isArray(players) ? players : [];
  const action = mutation && mutation.action;
  if (action === 'regenerate') {
    const generated = mutation.generatedPlayers;
    if (!Array.isArray(generated)) {
      throw new DraftClassError('invalid-argument', 'Generated players are required.');
    }
    const ids = generated.map(prospectId);
    if (ids.some(id => !id) || new Set(ids).size !== ids.length) {
      throw new DraftClassError('invalid-argument', 'Generated prospect IDs must be unique.');
    }
    return generated;
  }
  if (action === 'add') {
    if (!validProspect(mutation.prospect)) {
      throw new DraftClassError('invalid-argument', 'A valid prospect is required.');
    }
    const id = prospectId(mutation.prospect);
    if (current.some(player => prospectId(player) === id)) {
      throw new DraftClassError('already-exists', 'That prospect already exists.');
    }
    return [...current, mutation.prospect];
  }
  if (action === 'edit') {
    const id = String(mutation.prospectId || '');
    if (!id || !mutation.patch || typeof mutation.patch !== 'object') {
      throw new DraftClassError('invalid-argument', 'Prospect ID and patch are required.');
    }
    let found = false;
    const updated = current.map(player => {
      if (prospectId(player) !== id) return player;
      found = true;
      return { ...player, ...mutation.patch, id, player_id: id };
    });
    if (!found) throw new DraftClassError('not-found', 'Prospect not found.');
    return updated;
  }
  if (action === 'remove') {
    const id = String(mutation.prospectId || '');
    if (!current.some(player => prospectId(player) === id)) {
      throw new DraftClassError('not-found', 'Prospect not found.');
    }
    return current.filter(player => prospectId(player) !== id);
  }
  throw new DraftClassError('invalid-argument', 'Unknown draft class action.');
}

function publishDraftClassState(draftClass, publishedAt) {
  if (draftClass && draftClass.published === true) {
    throw new DraftClassError('failed-precondition', 'The draft class is already published.');
  }
  return {
    ...(draftClass || {}),
    players: Array.isArray(draftClass && draftClass.players) ? draftClass.players : [],
    published: true,
    publishedAt,
    version: Number.isInteger(draftClass && draftClass.version)
      ? draftClass.version + 1
      : 1,
  };
}

function toHttpsError(error, HttpsError) {
  if (error instanceof DraftClassError) {
    return new HttpsError(error.code, error.message, error.details);
  }
  return error;
}

function createMutateDraftClassHandler({ getFirestore, serverTimestamp, HttpsError }) {
  return async function mutateDraftClass(request) {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
    const data = request.data || {};
    const leagueId = typeof data.leagueId === 'string' ? data.leagueId.trim() : '';
    const action = typeof data.action === 'string' ? data.action : '';
    const expectedVersion = data.expectedVersion;
    if (!leagueId || !['add', 'edit', 'remove', 'regenerate'].includes(action) || !Number.isInteger(expectedVersion)) {
      throw new HttpsError('invalid-argument', 'Provide league, action, and current offseason version.');
    }
    const db = getFirestore();
    const leagueRef = db.collection('leagues').doc(leagueId);
    try {
      return await db.runTransaction(async tx => {
        const leagueSnap = await tx.get(leagueRef);
        if (!leagueSnap.exists) throw new HttpsError('not-found', 'League not found.');
        const league = leagueSnap.data() || {};
        const seasonYear = league.offseason && league.offseason.seasonYear;
        const classRef = leagueRef.collection('draft_classes').doc(draftClassDocumentId(seasonYear));
        const classSnap = await tx.get(classRef);
        const draftClass = classSnap.exists
          ? classSnap.data() || {}
          : { players: [], published: false, version: 0 };
        assertDraftClassEditable({ uid, league, expectedVersion, draftClass });
        const mutation = action === 'regenerate'
          ? {
            action,
            generatedPlayers: generateServerDraftClass(
              league.sport,
              league.sport === 'madden' || league.sport === 'nfl' ? 32 : 30,
              `${leagueId}:${seasonYear}:${data.seed || 'default'}`,
            ),
          }
          : data;
        const players = applyDraftClassMutation(draftClass.players, mutation)
          .map(prospect => normalizeProspectForSport(prospect, league.sport));
        const next = {
          ...draftClass,
          seasonYear,
          sport: league.sport,
          players,
          published: false,
          version: Number.isInteger(draftClass.version) ? draftClass.version + 1 : 1,
          updatedAt: serverTimestamp(),
          updatedBy: uid,
        };
        tx.set(classRef, next);
        return { draftClass: next };
      });
    } catch (error) {
      throw toHttpsError(error, HttpsError);
    }
  };
}

function createPublishDraftClassHandler({ getFirestore, serverTimestamp, HttpsError }) {
  return async function publishDraftClass(request) {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
    const data = request.data || {};
    const leagueId = typeof data.leagueId === 'string' ? data.leagueId.trim() : '';
    const expectedVersion = data.expectedVersion;
    if (!leagueId || !Number.isInteger(expectedVersion)) {
      throw new HttpsError('invalid-argument', 'Provide league and current offseason version.');
    }
    const db = getFirestore();
    const leagueRef = db.collection('leagues').doc(leagueId);
    try {
      return await db.runTransaction(async tx => {
        const leagueSnap = await tx.get(leagueRef);
        if (!leagueSnap.exists) throw new HttpsError('not-found', 'League not found.');
        const league = leagueSnap.data() || {};
        const classRef = leagueRef.collection('draft_classes')
          .doc(draftClassDocumentId(league.offseason && league.offseason.seasonYear));
        const classSnap = await tx.get(classRef);
        if (!classSnap.exists) throw new HttpsError('failed-precondition', 'Generate a draft class first.');
        const draftClass = classSnap.data() || {};
        assertDraftClassEditable({ uid, league, expectedVersion, draftClass });
        if (!Array.isArray(draftClass.players) || draftClass.players.length === 0) {
          throw new HttpsError('failed-precondition', 'The draft class cannot be empty.');
        }
        const timestamp = serverTimestamp();
        const published = publishDraftClassState(draftClass, timestamp);
        tx.set(classRef, published);
        tx.update(leagueRef, {
          'offseason.draftStatus': 'published',
          'offseason.draftClassVersion': published.version,
        });
        return { draftClass: published };
      });
    } catch (error) {
      throw toHttpsError(error, HttpsError);
    }
  };
}

module.exports = {
  DraftClassError,
  applyDraftClassMutation,
  assertDraftClassEditable,
  createMutateDraftClassHandler,
  createPublishDraftClassHandler,
  draftClassDocumentId,
  generateServerDraftClass,
  normalizeProspectForSport,
  publishDraftClassState,
};
