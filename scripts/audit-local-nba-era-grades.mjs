import fs from 'node:fs/promises';
import path from 'node:path';
import {
  buildLocalEraAuditPlayers,
  buildLocalEraAuditReport,
  parseEraRosters,
} from './lib/local-era-audit.mjs';

const ERA_START_YEAR = {
  magic_bird: 1983,
  jordan: 1991,
  kobe: 2002,
  lebron: 2010,
  steph: 2016,
};

const era = process.argv[2] || 'lebron';
const eraKeys = era === 'all' ? Object.keys(ERA_START_YEAR) : [era];

if (eraKeys.some(key => !ERA_START_YEAR[key])) {
  console.error(`Unknown era "${era}". Use one of: ${Object.keys(ERA_START_YEAR).join(', ')}, all`);
  process.exit(1);
}

async function readRequired(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    console.error(`Missing required local file: ${filePath}`);
    process.exit(1);
  }
}

const root = process.cwd();
const rosterSource = await readRequired(path.join(root, 'scripts/seed-era-rosters.mjs'));
const playersCsv = await readRequired(path.join(root, 'players.csv'));
const salariesCsv = await readRequired(path.join(root, 'salaries_1985to2018.csv'));

const rosters = parseEraRosters(rosterSource);
const outDir = path.join(root, 'docs/reports');
await fs.mkdir(outDir, { recursive: true });

for (const eraKey of eraKeys) {
  const players = buildLocalEraAuditPlayers({
    era: eraKey,
    seasonStartYear: ERA_START_YEAR[eraKey],
    rosters,
    playersCsv,
    salariesCsv,
  });
  const report = buildLocalEraAuditReport(eraKey, players);
  const outPath = path.join(outDir, `local-nba-era-grade-audit-${eraKey}.md`);
  await fs.writeFile(outPath, report, 'utf8');
  console.log(`Wrote ${outPath}`);
}
