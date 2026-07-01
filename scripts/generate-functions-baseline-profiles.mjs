import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD_DIR = '/private/tmp/franchise-baseline-build';
const OUT_PATH = resolve(ROOT, 'functions/franchise/baselineProfiles.generated.js');

mkdirSync(BUILD_DIR, { recursive: true });

execFileSync(resolve(ROOT, 'node_modules/.bin/tsc'), [
  '--module',
  'commonjs',
  '--target',
  'es2020',
  '--esModuleInterop',
  '--skipLibCheck',
  '--outDir',
  BUILD_DIR,
  'domain/nba/ratingSeeds.ts',
], {
  cwd: ROOT,
  stdio: 'inherit',
});

const require = createRequire(import.meta.url);
const { buildBaselineRatingProfiles } = require(resolve(BUILD_DIR, 'ratingSeeds.js'));
const profiles = buildBaselineRatingProfiles(1);

const content = `'use strict';\n\n// Generated from the original basketball simulation rating model.\n// Keep this file inside functions so deployed simulations can repair older roster snapshots.\nconst baselineProfiles = ${JSON.stringify(profiles, null, 2)};\n\nmodule.exports = { baselineProfiles };\n`;

writeFileSync(OUT_PATH, content);
console.log(`Generated ${profiles.length} baseline profiles at ${OUT_PATH}`);
