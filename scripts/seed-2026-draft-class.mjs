import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Usage:
//   node scripts/seed-2026-draft-class.mjs --dry-run
//   node scripts/seed-2026-draft-class.mjs
//
// The source data comes from NBA.com's official 2026 draft results page.

const app = initializeApp({
  apiKey: "AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY",
  projectId: "association-social",
});
const db = getFirestore(app);

const DRY_RUN = process.argv.includes('--dry-run');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(__dirname, '..', 'data', 'nba-draft-2026.json');

function playerId(name, pick) {
  return `draft_2026_${pick}_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
}

function splitName(name) {
  const parts = name.trim().split(/\s+/);
  return {
    first_name: parts[0] || '',
    last_name: parts.slice(1).join(' '),
  };
}

const PROSPECT_POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];
const ROLE_BY_VALUE = {
  shooting: 'Shot Creator',
  playmaking: 'Floor General',
  defense: 'Stopper',
  rebounding: 'Glass Cleaner',
  athleticism: 'Slasher',
  basketballIq: 'Connector',
};

function inferredPosition(player) {
  if (player.position) return player.position;
  return PROSPECT_POSITIONS[Math.max(0, Number(player.pick || 1) - 1) % PROSPECT_POSITIONS.length];
}

function gradeFromValue(value) {
  if (value >= 99) return 'S';
  if (value >= 95) return 'A+';
  if (value >= 92) return 'A';
  if (value >= 89) return 'A-';
  if (value >= 85) return 'B+';
  if (value >= 80) return 'B';
  if (value >= 75) return 'B-';
  if (value >= 70) return 'C+';
  if (value >= 65) return 'C';
  if (value >= 60) return 'C-';
  if (value >= 57) return 'D+';
  if (value >= 53) return 'D';
  if (value >= 50) return 'D-';
  return 'F';
}

function buildDraftProspectIdentity(player) {
  const position = inferredPosition(player);
  const slot = Math.max(1, Number(player.pick || 60));
  const roundPenalty = Math.max(0, Number(player.round || 1) - 1) * 9;
  const base = Math.max(54, Math.min(88, 88 - Math.floor((slot - 1) / 4) * 2 - roundPenalty));
  const guard = position === 'PG' || position === 'SG';
  const wing = position === 'SF';
  const big = position === 'PF' || position === 'C';
  const values = {
    shooting: base + (guard || wing ? 2 : -3),
    playmaking: base + (position === 'PG' ? 4 : guard ? 1 : -4),
    defense: base + (wing || big ? 2 : -1),
    rebounding: base + (big ? 4 : wing ? 1 : -5),
    athleticism: base + 1,
    basketballIq: base,
  };
  const ordered = Object.entries(values).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const grades = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, gradeFromValue(value)]));
  const primary = ordered[0]?.[0] || 'basketballIq';
  const secondary = ordered.find(([key]) => key !== primary)?.[0] || primary;
  return {
    grades,
    primaryRole: ROLE_BY_VALUE[primary] || 'Connector',
    secondaryRole: ROLE_BY_VALUE[secondary] || 'Connector',
    strengths: ordered.filter(([, value]) => value >= 80).slice(0, 3).map(([key]) => key),
    weaknesses: [...ordered].reverse().filter(([, value]) => value > 0 && value < 60).slice(0, 3).map(([key]) => key),
    consistency: gradeFromValue(Math.max(50, base - 7)),
    chemistry: gradeFromValue(Math.max(54, base - 4)),
    reputation: 'Prospect',
    developmentTrait: base >= 82 ? 'Breakout' : 'Rising',
  };
}

function vaultDocForDraftPick(draft, player) {
  const names = splitName(player.name);
  const visibleIdentity = buildDraftProspectIdentity(player);
  return {
    bref_id: playerId(player.name, player.pick),
    full_name: player.name,
    first_name: names.first_name,
    last_name: names.last_name,
    position: inferredPosition(player),
    height: player.height || '',
    weight: player.weight || '',
    birth_date: player.birthDate || '',
    jersey_number: '',
    draft_year: draft.year,
    draft_pick: player.pick,
    draft_round: player.round,
    drafted_by: player.draftedBy,
    rights_team: player.rightsTeam,
    team: player.rightsTeam,
    college: player.school,
    trade_note: player.tradeNote || '',
    accolades: [],
    seasons: [],
    eras: [draft.era || 'current'],
    is_custom: false,
    no_profile: true,
    draft_source: true,
    photo: player.headshotUrl || undefined,
    headshot_url: player.headshotUrl || undefined,
    archetype: player.archetype || undefined,
    projectedOverall: player.pick,
    projectedRound: player.round,
    source: draft.source,
    sourceUpdatedAt: draft.sourceUpdatedAt,
    identity: visibleIdentity,
    visibleIdentity,
    grades: visibleIdentity.grades,
    playerLabel: visibleIdentity.reputation.toUpperCase(),
    developmentTrait: visibleIdentity.developmentTrait,
  };
}

async function main() {
  const raw = await readFile(sourcePath, 'utf8');
  const draft = JSON.parse(raw);
  if (!draft || draft.year !== 2026 || !Array.isArray(draft.players) || draft.players.length !== 60) {
    throw new Error('Expected data/nba-draft-2026.json to contain all 60 2026 NBA Draft picks.');
  }

  const players = draft.players.map((player) => {
    const names = splitName(player.name);
    const visibleIdentity = buildDraftProspectIdentity(player);
    return {
      player_id: playerId(player.name, player.pick),
      first_name: names.first_name,
      last_name: names.last_name,
      full_name: player.name,
      draft_year: draft.year,
      draft_pick: player.pick,
      draft_round: player.round,
      drafted_by: player.draftedBy,
      rights_team: player.rightsTeam,
      team: player.rightsTeam,
      college: player.school,
      position: inferredPosition(player),
      height: player.height || '',
      weight: player.weight || '',
      birth_date: player.birthDate || '',
      jersey_number: '',
      trade_note: player.tradeNote || '',
      photo: player.headshotUrl || undefined,
      headshot_url: player.headshotUrl || undefined,
      archetype: player.archetype || undefined,
      projectedOverall: player.pick,
      projectedRound: player.round,
      source: draft.source,
      identity: visibleIdentity,
      visibleIdentity,
      grades: visibleIdentity.grades,
      playerLabel: visibleIdentity.reputation.toUpperCase(),
      developmentTrait: visibleIdentity.developmentTrait,
    };
  });
  const vaultPlayers = draft.players.map((player) => ({
    player_id: playerId(player.name, player.pick),
    data: vaultDocForDraftPick(draft, player),
  }));

  console.log(`Prepared ${players.length} 2026 NBA Draft picks from ${draft.source}.`);
  if (DRY_RUN) {
    console.log('--dry-run: not writing. First five picks:');
    players.slice(0, 5).forEach((player) => {
      console.log(`  ${player.draft_pick}. ${player.full_name} -> ${player.rights_team}`);
    });
    process.exit(0);
  }

  await setDoc(doc(db, 'draft_classes', String(draft.year)), {
    year: draft.year,
    era: draft.era || 'current',
    total: players.length,
    source: draft.source,
    sourceUpdatedAt: draft.sourceUpdatedAt,
    seeded_at: new Date().toISOString(),
    players,
  });

  for (const player of vaultPlayers) {
    await setDoc(doc(db, 'players', player.player_id), player.data, { merge: true });
  }

  console.log(`Seeded ${players.length} players into draft_classes/${draft.year} and players/ vault.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
