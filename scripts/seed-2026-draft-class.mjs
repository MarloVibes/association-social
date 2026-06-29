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

function vaultDocForDraftPick(draft, player) {
  const names = splitName(player.name);
  return {
    bref_id: playerId(player.name, player.pick),
    full_name: player.name,
    first_name: names.first_name,
    last_name: names.last_name,
    position: '',
    height: '',
    weight: '',
    birth_date: '',
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
    source: draft.source,
    sourceUpdatedAt: draft.sourceUpdatedAt,
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
      position: '',
      jersey_number: '',
      trade_note: player.tradeNote || '',
      source: draft.source,
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
