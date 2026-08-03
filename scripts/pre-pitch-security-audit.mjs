import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const checks = [];

function addCheck(name, status, details) {
  checks.push({ name, status, details });
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(path.join(root, file), 'utf8'));
  } catch {
    return null;
  }
}

function gitTrackedFiles() {
  try {
    return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

function gitIgnoredFiles(files) {
  if (!files.length) return new Set();
  try {
    const output = execFileSync('git', ['check-ignore', ...files], { cwd: root, encoding: 'utf8' });
    return new Set(output.split('\n').filter(Boolean));
  } catch {
    return new Set();
  }
}

function walkFiles(dir, output = []) {
  const abs = path.join(root, dir);
  if (!existsSync(abs)) return output;
  for (const entry of readdirSync(abs)) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === '.expo') continue;
    const rel = path.join(dir, entry);
    const full = path.join(root, rel);
    const stat = statSync(full);
    if (stat.isDirectory()) walkFiles(rel, output);
    else output.push(rel);
  }
  return output;
}

const firebase = readJson('firebase.json');
if (!firebase) {
  addCheck('Firebase config', 'fail', 'firebase.json was not found.');
} else {
  addCheck('Firebase config', 'pass', 'firebase.json exists.');
  addCheck(
    'Firestore rules are versioned',
    firebase.firestore?.rules && existsSync(path.join(root, firebase.firestore.rules)) ? 'pass' : 'warn',
    firebase.firestore?.rules
      ? `Configured as ${firebase.firestore.rules}.`
      : 'No Firestore rules file is configured in firebase.json; console rules are not reviewable from the repo.',
  );
  addCheck(
    'Storage rules are versioned',
    firebase.storage?.rules && existsSync(path.join(root, firebase.storage.rules)) ? 'pass' : 'warn',
    firebase.storage?.rules
      ? `Configured as ${firebase.storage.rules}.`
      : 'No Storage rules file is configured in firebase.json; console rules are not reviewable from the repo.',
  );
  addCheck(
    'Firestore indexes are versioned',
    firebase.firestore?.indexes && existsSync(path.join(root, firebase.firestore.indexes)) ? 'pass' : 'warn',
    firebase.firestore?.indexes
      ? `Configured as ${firebase.firestore.indexes}.`
      : 'No Firestore indexes file is configured in firebase.json.',
  );
}

const tracked = gitTrackedFiles();
const riskyTracked = tracked.filter(file => {
  const lower = file.toLowerCase();
  return lower.includes('service-account')
    || lower.includes('pitch-demo-credentials')
    || lower.includes('private-key')
    || lower.endsWith('.pem')
    || lower.endsWith('.p12')
    || lower.endsWith('.key')
    || lower === '.env'
    || lower.startsWith('.env.');
});
addCheck(
  'Tracked secrets',
  riskyTracked.length ? 'fail' : 'pass',
  riskyTracked.length
    ? `Potential secret files are tracked: ${riskyTracked.join(', ')}`
    : 'No obvious secret files are tracked by git.',
);

const localSecretFiles = walkFiles('.')
  .filter(file => {
    const lower = file.toLowerCase();
    return lower.includes('service-account')
      || lower.includes('pitch-demo-credentials')
      || lower.includes('private-key')
      || lower.endsWith('.pem')
      || lower.endsWith('.p12')
      || lower.endsWith('.key');
  });
addCheck(
  'Local secret files',
  localSecretFiles.length ? 'warn' : 'pass',
  localSecretFiles.length
    ? `Potential local secret files exist. Ignored by git: ${[...gitIgnoredFiles(localSecretFiles)].join(', ') || 'none'}. Do not share them in a pitch package: ${localSecretFiles.join(', ')}`
    : 'No obvious local private-key files found in the repo tree.',
);

const envFiles = walkFiles('.').filter(file => {
  const base = path.basename(file);
  return base === '.env' || base.startsWith('.env.');
});
const ignoredEnvFiles = gitIgnoredFiles(envFiles);
addCheck(
  'Environment files',
  envFiles.length ? 'warn' : 'pass',
  envFiles.length
    ? `Environment files exist locally. Ignored by git: ${[...ignoredEnvFiles].join(', ') || 'none'}. Do not share them in a pitch package: ${envFiles.join(', ')}`
    : 'No local environment files found.',
);

const sourceFiles = walkFiles('.').filter(file => /\.(ts|tsx|js|jsx|mjs|json|md)$/.test(file));
const riskyWords = [];
for (const file of sourceFiles) {
  const text = readFileSync(path.join(root, file), 'utf8');
  if (/\bTODO\s*:\s*(secret|private|formula|key|password|token)/i.test(text)) riskyWords.push(file);
}
addCheck(
  'Sensitive TODO markers',
  riskyWords.length ? 'warn' : 'pass',
  riskyWords.length
    ? `Review sensitive TODO wording before sharing screenshots/docs: ${riskyWords.join(', ')}`
    : 'No obvious sensitive TODO markers found.',
);

let failures = 0;
let warnings = 0;
for (const check of checks) {
  if (check.status === 'fail') failures += 1;
  if (check.status === 'warn') warnings += 1;
}

console.log('\nFranchise Mobile pre-pitch security audit\n');
for (const check of checks) {
  const label = check.status === 'pass' ? 'PASS' : check.status === 'warn' ? 'WARN' : 'FAIL';
  console.log(`${label} ${check.name}`);
  console.log(`  ${check.details}`);
}
console.log(`\nSummary: ${failures} failure(s), ${warnings} warning(s), ${checks.length} checks.`);

if (failures) process.exitCode = 1;
