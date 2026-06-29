import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);

function arg(name, fallback = '') {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || fallback : fallback;
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8'));
}

function main() {
  const sourcePath = arg('--source');
  const patchPath = arg('--patch');
  const outPath = arg('--out', 'dist/player-ratings.json');
  if (!sourcePath) throw new Error('Provide --source path.');

  const snapshot = readJson(sourcePath);
  const patch = patchPath ? readJson(patchPath) : { players: {} };
  const payload = {
    collection: 'player_ratings',
    snapshot_id: snapshot.snapshot_id,
    generated_at_ms: Date.now(),
    source_path: sourcePath,
    patch_path: patchPath || null,
    dry_run: args.includes('--dry-run'),
    profiles: (snapshot.players || []).map(player => ({
      player_id: player.player_id,
      full_name: player.full_name,
      team: patch.players?.[player.player_id]?.team || player.team,
      source_snapshot_id: snapshot.snapshot_id,
      import_status: 'ready_for_model',
    })),
  };
  const resolvedOut = resolve(process.cwd(), outPath);
  mkdirSync(dirname(resolvedOut), { recursive: true });
  writeFileSync(resolvedOut, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Prepared ${payload.profiles.length} player rating source record${payload.profiles.length === 1 ? '' : 's'} at ${outPath}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
