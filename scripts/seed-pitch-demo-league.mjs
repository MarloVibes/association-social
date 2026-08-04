import admin from 'firebase-admin';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { createGenerateScheduleHandler } = require('../functions/franchise/schedule.js');
const DEMO_PROJECT_ID = 'association-social-demo';
const LOCAL_ERA_FILES = {
  current: 'data/nba/current-player-pool.json',
};

const NBA_TEAMS = [
  { abbr: 'ATL', city: 'Atlanta', name: 'Hawks', conference: 'East', division: 'Southeast' },
  { abbr: 'BOS', city: 'Boston', name: 'Celtics', conference: 'East', division: 'Atlantic' },
  { abbr: 'BKN', city: 'Brooklyn', name: 'Nets', conference: 'East', division: 'Atlantic' },
  { abbr: 'CHA', city: 'Charlotte', name: 'Hornets', conference: 'East', division: 'Southeast' },
  { abbr: 'CHI', city: 'Chicago', name: 'Bulls', conference: 'East', division: 'Central' },
  { abbr: 'CLE', city: 'Cleveland', name: 'Cavaliers', conference: 'East', division: 'Central' },
  { abbr: 'DAL', city: 'Dallas', name: 'Mavericks', conference: 'West', division: 'Southwest' },
  { abbr: 'DEN', city: 'Denver', name: 'Nuggets', conference: 'West', division: 'Northwest' },
  { abbr: 'DET', city: 'Detroit', name: 'Pistons', conference: 'East', division: 'Central' },
  { abbr: 'GSW', city: 'Golden State', name: 'Warriors', conference: 'West', division: 'Pacific' },
  { abbr: 'HOU', city: 'Houston', name: 'Rockets', conference: 'West', division: 'Southwest' },
  { abbr: 'IND', city: 'Indiana', name: 'Pacers', conference: 'East', division: 'Central' },
  { abbr: 'LAC', city: 'LA', name: 'Clippers', conference: 'West', division: 'Pacific' },
  { abbr: 'LAL', city: 'Los Angeles', name: 'Lakers', conference: 'West', division: 'Pacific' },
  { abbr: 'MEM', city: 'Memphis', name: 'Grizzlies', conference: 'West', division: 'Southwest' },
  { abbr: 'MIA', city: 'Miami', name: 'Heat', conference: 'East', division: 'Southeast' },
  { abbr: 'MIL', city: 'Milwaukee', name: 'Bucks', conference: 'East', division: 'Central' },
  { abbr: 'MIN', city: 'Minnesota', name: 'Timberwolves', conference: 'West', division: 'Northwest' },
  { abbr: 'NOP', city: 'New Orleans', name: 'Pelicans', conference: 'West', division: 'Southwest' },
  { abbr: 'NYK', city: 'New York', name: 'Knicks', conference: 'East', division: 'Atlantic' },
  { abbr: 'OKC', city: 'Oklahoma City', name: 'Thunder', conference: 'West', division: 'Northwest' },
  { abbr: 'ORL', city: 'Orlando', name: 'Magic', conference: 'East', division: 'Southeast' },
  { abbr: 'PHI', city: 'Philadelphia', name: '76ers', conference: 'East', division: 'Atlantic' },
  { abbr: 'PHX', city: 'Phoenix', name: 'Suns', conference: 'West', division: 'Pacific' },
  { abbr: 'POR', city: 'Portland', name: 'Trail Blazers', conference: 'West', division: 'Northwest' },
  { abbr: 'SAC', city: 'Sacramento', name: 'Kings', conference: 'West', division: 'Pacific' },
  { abbr: 'SAS', city: 'San Antonio', name: 'Spurs', conference: 'West', division: 'Southwest' },
  { abbr: 'TOR', city: 'Toronto', name: 'Raptors', conference: 'East', division: 'Atlantic' },
  { abbr: 'UTA', city: 'Utah', name: 'Jazz', conference: 'West', division: 'Northwest' },
  { abbr: 'WAS', city: 'Washington', name: 'Wizards', conference: 'East', division: 'Southeast' },
];

const TEAM_BY_ABBR = new Map(NBA_TEAMS.map(team => [team.abbr, team]));

class AdminScriptHttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'HttpsError';
  }
}

function parseArgs(argv) {
  const flags = new Set();
  const values = new Map();
  argv.forEach((arg) => {
    if (!arg.startsWith('--')) return;
    const raw = arg.slice(2);
    const equalsIndex = raw.indexOf('=');
    if (equalsIndex === -1) {
      flags.add(raw);
      return;
    }
    values.set(raw.slice(0, equalsIndex), raw.slice(equalsIndex + 1));
  });
  return {
    has: name => flags.has(name),
    get: (name, fallback = '') => values.get(name) || fallback,
  };
}

function normalizeAbbr(value) {
  return String(value || '').trim().toUpperCase();
}

function displayNameFor(team) {
  if (team.full_name) return String(team.full_name);
  if (team.fullName) return String(team.fullName);
  if (team.city && team.name) return `${team.city} ${team.name}`;
  const fallback = TEAM_BY_ABBR.get(normalizeAbbr(team.abbreviation || team.abbr));
  return fallback ? `${fallback.city} ${fallback.name}` : normalizeAbbr(team.abbreviation || team.abbr);
}

function createDraftPicks(teamAbbr, baseYear) {
  const picks = [];
  for (let year = baseYear; year < baseYear + 7; year += 1) {
    picks.push({
      id: `${teamAbbr}_${year}_1`,
      year,
      round: 1,
      originalTeam: teamAbbr,
      currentTeam: teamAbbr,
      protected: null,
    });
    picks.push({
      id: `${teamAbbr}_${year}_2`,
      year,
      round: 2,
      originalTeam: teamAbbr,
      currentTeam: teamAbbr,
      protected: null,
    });
  }
  return picks;
}

function createLeagueId() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `pitch_demo_${stamp}`;
}

export function readDemoServiceAccount(serviceAccountPath) {
  const resolvedPath = resolve(serviceAccountPath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`Missing service account file: ${resolvedPath}`);
  }
  const serviceAccount = JSON.parse(readFileSync(resolvedPath, 'utf8'));
  if (serviceAccount.project_id !== DEMO_PROJECT_ID) {
    throw new Error(
      `Refusing to seed Firebase project ${serviceAccount.project_id || '(missing project_id)'}. ` +
      `Use a service account created by ${DEMO_PROJECT_ID}.`,
    );
  }
  return serviceAccount;
}

function initializeAdmin(serviceAccountPath) {
  const serviceAccount = readDemoServiceAccount(serviceAccountPath);
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: DEMO_PROJECT_ID,
    });
  }
  return admin.firestore();
}

export function loadLocalEraData(era) {
  const relativePath = LOCAL_ERA_FILES[era];
  if (!relativePath) {
    throw new Error(
      `Pitch demo seeding currently supports: ${Object.keys(LOCAL_ERA_FILES).join(', ')}. ` +
      'Add and review a local scrubbed snapshot before enabling another era.',
    );
  }
  const filePath = resolve(relativePath);
  if (!existsSync(filePath)) throw new Error(`Missing local pitch roster snapshot: ${filePath}`);
  const pool = JSON.parse(readFileSync(filePath, 'utf8'));
  const players = Array.isArray(pool.players) ? pool.players : [];
  if (players.length === 0) throw new Error(`Local pitch roster snapshot has no players: ${filePath}`);
  const playersByTeam = new Map();
  players.forEach((player) => {
    const teamAbbr = normalizeAbbr(player.team || player.teamAbbr || player.currentTeam || player.currentTeamId);
    if (!teamAbbr) return;
    playersByTeam.set(teamAbbr, [...(playersByTeam.get(teamAbbr) || []), player]);
  });

  const teams = NBA_TEAMS.map((meta) => {
    const abbr = meta.abbr;
    return {
      id: `${abbr.toLowerCase()}_${era}`,
      teamId: abbr,
      abbreviation: abbr,
      city: meta.city,
      name: meta.name,
      fullName: `${meta.city} ${meta.name}`,
      conference: meta.conference,
      division: meta.division,
      players: playersByTeam.get(abbr) || [],
    };
  });

  return { teams, playersByTeam, sourceFile: relativePath };
}

function topPlayerIds(players, count) {
  return [...players]
    .sort((a, b) => Number(b.overall || b.rating || 0) - Number(a.overall || a.rating || 0))
    .slice(0, count)
    .map(player => String(player.id || player.player_id || player.playerId || player.full_name || player.name || ''))
    .filter(Boolean);
}

function createTeamDoc({ leagueId, era, team, draftBaseYear, ownerUid, ownerTeam }) {
  const roster = (team.players || []).slice(0, 18);
  const isOwnerTeam = ownerUid && ownerTeam && team.abbreviation === ownerTeam;
  return {
    gmId: isOwnerTeam ? ownerUid : `CPU_${team.abbreviation}`,
    cpuControlled: !isOwnerTeam,
    cpuIdentity: {
      mode: 'pitch_demo',
      strategy: Number(team.abbreviation.charCodeAt(0)) % 2 === 0 ? 'competing' : 'balanced',
    },
    teamId: team.abbreviation,
    name: team.fullName,
    abbreviation: team.abbreviation,
    conference: team.conference || null,
    division: team.division || null,
    era,
    players: roster,
    picks: createDraftPicks(team.abbreviation, draftBaseYear),
    tradeBlock: topPlayerIds(roster.slice(8), 2),
    targetList: [],
    untouchables: topPlayerIds(roster, 2),
    pitchDemoTeam: true,
    createdForPitchDemo: true,
    source: `pitch_demo:${leagueId}`,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

async function seedPitchDemoLeague() {
  const args = parseArgs(process.argv.slice(2));
  const write = args.has('write');
  const skipSchedule = args.has('skipSchedule');
  const serviceAccount = args.get('serviceAccount', './demo-service-account.json');
  const ownerUid = args.get('ownerUid').trim();
  const viewerUid = args.get('viewerUid').trim();
  const leagueId = args.get('leagueId', createLeagueId()).trim();
  const leagueName = args.get('name', 'Franchise Mobile Pitch Demo').trim();
  const era = args.get('era', 'current').trim();
  const ownerTeam = normalizeAbbr(args.get('ownerTeam'));
  const currentYear = Number(args.get('currentYear', '2025'));
  const gamesPerTeam = Number(args.get('gamesPerTeam', '82'));
  const draftBaseYear = Number(args.get('draftBaseYear', String(currentYear + 1)));

  if (write && !ownerUid) {
    throw new Error('Writing a demo league requires --ownerUid=<founder user uid>.');
  }
  if (!Number.isFinite(gamesPerTeam) || ![14, 17, 29, 58, 82, 162].includes(gamesPerTeam)) {
    throw new Error('Use an approved --gamesPerTeam value: 14, 17, 29, 58, 82, or 162.');
  }
  if (ownerTeam && !TEAM_BY_ABBR.has(ownerTeam)) {
    throw new Error(`Unknown --ownerTeam value: ${ownerTeam}`);
  }

  const { teams, sourceFile } = loadLocalEraData(era);
  const missingTeams = NBA_TEAMS.map(team => team.abbr).filter(abbr => !teams.some(team => team.abbreviation === abbr));
  if (missingTeams.length) {
    throw new Error(`Era roster is missing teams: ${missingTeams.join(', ')}`);
  }

  const selectedTeams = NBA_TEAMS.map(team => teams.find(candidate => candidate.abbreviation === team.abbr));
  const plannedPlayers = selectedTeams.reduce((sum, team) => sum + Math.min(18, (team.players || []).length), 0);
  console.log(`${write ? 'Creating' : 'Dry run for'} pitch demo league: ${leagueName}`);
  console.log(`League ID: ${leagueId}`);
  console.log(`Owner UID: ${ownerUid || '(required only with --write)'}`);
  console.log(`Viewer UID: ${viewerUid || '(none)'}`);
  console.log(`Owner team: ${ownerTeam || '(none; all teams CPU-controlled)'}`);
  console.log(`Teams: ${selectedTeams.length}`);
  console.log(`Rostered players: ${plannedPlayers}`);
  console.log(`Roster source: ${sourceFile} (local snapshot)`);
  console.log(`Firebase target: ${DEMO_PROJECT_ID}`);
  console.log(`Schedule: ${skipSchedule ? 'skipped' : `${gamesPerTeam} games per team`}`);

  if (!write) {
    console.log('\nNo writes performed. Add --write --ownerUid=<uid> when ready.');
    return;
  }

  const db = initializeAdmin(serviceAccount);
  const leagueRef = db.collection('leagues').doc(leagueId);
  const now = admin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.set(leagueRef, {
    name: leagueName,
    privacy: 'private',
    inviteCode: 'PITCH-DEMO',
    tradeApprovalMode: 'commissioner',
    maxPlayersPerTrade: 5,
    tradeApronTolerance: 0,
    votePassThreshold: 0.6,
    voteDeadlineDays: 2,
    spinChoices: 3,
    currentYear,
    currentSeason: `${currentYear}-${String(currentYear + 1).slice(2)}`,
    sport: 'nba',
    mode: 'nba',
    era,
    draftPickMode: 'standard',
    stepienRule: true,
    gamesPerTeam,
    scheduleLocked: false,
    draftBaseYear,
    rosterLimit: 18,
    twoWayLimit: 3,
    draftRounds: 2,
    draftTimerSeconds: 60,
    allowCpuGameSimulation: true,
    allowCpuTrades: true,
    draftStatus: 'complete',
    draftSeasonYear: draftBaseYear,
    startupDraftRounds: 0,
    financeMode: 'nba',
    salaryCap: 154600000,
    commissionerId: ownerUid,
    coCommissioners: [],
    members: [ownerUid, viewerUid].filter(Boolean),
    maxMembers: 30,
    invites: [],
    takenTeams: ownerTeam ? [ownerTeam] : [],
    status: 'active',
    pitchDemoLocked: true,
    demoAccessLocked: true,
    pitchMode: 'locked',
    isPitchDemoLeague: true,
    createdForPitchDemo: true,
    createdAt: now,
    updatedAt: now,
  }, { merge: true });

  selectedTeams.forEach((team) => {
    const teamRef = leagueRef.collection('teams').doc(`${leagueId}_CPU_${team.abbreviation}`);
    batch.set(teamRef, createTeamDoc({ leagueId, era, team, draftBaseYear, ownerUid, ownerTeam }), { merge: true });
  });

  batch.set(db.collection('users').doc(ownerUid), {
    leagues: admin.firestore.FieldValue.arrayUnion(leagueId),
    pitchAccessRole: 'founder',
    updatedAt: now,
  }, { merge: true });

  if (viewerUid) {
    batch.set(db.collection('users').doc(viewerUid), {
      leagues: admin.firestore.FieldValue.arrayUnion(leagueId),
      pitchAccessRole: 'viewer',
      updatedAt: now,
    }, { merge: true });
  }

  await batch.commit();

  if (!skipSchedule) {
    const handler = createGenerateScheduleHandler({
      getFirestore: () => db,
      serverTimestamp: () => admin.firestore.FieldValue.serverTimestamp(),
      HttpsError: AdminScriptHttpsError,
    });
    const result = await handler({ auth: { uid: ownerUid }, data: { leagueId, gamesPerTeam } });
    console.log(`Schedule locked: ${result.games} games (${result.gamesPerTeam} per team)`);
  }

  console.log(`Done. Demo league is ready: ${leagueId}`);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) {
  seedPitchDemoLeague()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error.message || error);
      process.exit(1);
    });
}
