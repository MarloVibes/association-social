import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRatingImportPayload } from '@/domain/nba/ratingImport';
import type { RatingPatchSet, RatingSourceSnapshot } from '@/domain/nba/ratingImport';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')) as T;
}

describe('player rating importer', () => {
  it('generates neutral rating profiles from a local source snapshot', () => {
    const snapshot = readJson<RatingSourceSnapshot>('tests/fixtures/player-rating-snapshot.json');
    const patch = readJson<RatingPatchSet>('tests/fixtures/player-rating-patch.json');
    const payload = buildRatingImportPayload({
      snapshot,
      patch,
      generated_at_ms: 100,
    });

    expect(payload.snapshot_id).toBe('fixture-current-2027');
    expect(payload.collection).toBe('player_ratings');
    expect(payload.profiles).toHaveLength(1);
    expect(payload.profiles[0].team).toBe('NEW');
    expect(payload.profiles[0].skill_grades.threePoint).not.toBe('S');
    expect(payload.profiles[0].validation_warnings[0]).toContain('requested S');
    expect(JSON.stringify(payload)).toContain('attribute_model');
  });

  it('runs the neutral CLI wrapper without network access', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'rating-import-'));
    const outFile = join(outDir, 'profiles.json');

    execFileSync('node', [
      'scripts/import-player-ratings.mjs',
      '--source',
      'tests/fixtures/player-rating-snapshot.json',
      '--patch',
      'tests/fixtures/player-rating-patch.json',
      '--out',
      outFile,
      '--dry-run',
    ], { stdio: 'pipe' });

    const payload = JSON.parse(readFileSync(outFile, 'utf8'));
    expect(payload.collection).toBe('player_ratings');
    expect(payload.profiles[0]).toMatchObject({
      player_id: 'fixture-1',
      team: 'NEW',
      import_status: 'ready_for_model',
    });
  });
});
