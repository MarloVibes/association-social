import fs from 'node:fs/promises';
import path from 'node:path';
import { initializeApp } from 'firebase/app';
import { doc, getDoc, getFirestore } from 'firebase/firestore';

const era = process.argv[2] || 'current';
const app = initializeApp({
  apiKey: 'AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY',
  projectId: 'association-social',
});
const db = getFirestore(app);

function numberFrom(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function stat(player, keys) {
  for (const key of keys) {
    const value = player?.[key] ?? player?.seasonStats?.[key];
    if (value !== undefined && value !== null && value !== '') return numberFrom(value);
  }
  return 0;
}

function hidden(player, key) {
  return numberFrom(player?.hidden?.[key] ?? player?.[key]);
}

function gradeFromScore(score) {
  const value = Math.max(0, Math.min(100, Math.round(numberFrom(score))));
  if (value >= 99) return 'S Legend';
  if (value >= 95) return 'A+ Elite';
  if (value >= 92) return 'A Elite';
  if (value >= 89) return 'A- Elite';
  if (value >= 86) return 'B+ Pro';
  if (value >= 83) return 'B Pro';
  if (value >= 80) return 'B- Pro';
  if (value >= 77) return 'C+ Contributor';
  if (value >= 74) return 'C Contributor';
  if (value >= 71) return 'C- Contributor';
  if (value >= 68) return 'D+ Prospect';
  if (value >= 65) return 'D Prospect';
  if (value >= 60) return 'D- Prospect';
  return 'F Development';
}

function auditPlayer(player) {
  const minutes = stat(player, ['minutes', 'mpg', 'min']);
  const ppg = stat(player, ['ppg', 'points', 'pts']);
  const rpg = stat(player, ['rpg', 'rebounds', 'reb']);
  const apg = stat(player, ['apg', 'assists', 'ast']);
  const defense = hidden(player, 'defense');
  const iq = hidden(player, 'basketballIq');
  const stamina = hidden(player, 'stamina');
  const shooting = hidden(player, 'shooting') || hidden(player, 'threePoint');
  const playmaking = hidden(player, 'playmaking') || hidden(player, 'passing');
  const rebounding = hidden(player, 'rebounding');
  const coreRole = minutes >= 32 || (minutes >= 28 && ppg + rpg + apg >= 20) || (defense >= 84 && stamina >= 86);
  const reasons = [];
  if (minutes >= 32) reasons.push(`${minutes} MPG workload`);
  if (defense >= 84) reasons.push('high defensive grade signal');
  if (iq >= 82) reasons.push('strong basketball IQ signal');
  if (stamina >= 88) reasons.push('high stamina/core-minute signal');
  if (ppg >= 14 && defense >= 80) reasons.push('two-way production profile');
  let archetype = 'Rotation Player';
  if ((defense >= 82 || iq >= 84) && ppg >= 12) archetype = 'Two-Way Core Wing';
  else if (shooting >= 86 && ppg >= 14) archetype = 'Primary Scorer';
  else if (playmaking >= 86) archetype = 'Lead Creator';
  else if (defense >= 84 && rebounding >= 80) archetype = 'Defensive Anchor';
  else if (stamina >= 88 && defense >= 78) archetype = 'High-Minute Connector';
  const talent = [hidden(player, 'shooting'), hidden(player, 'playmaking'), defense, hidden(player, 'rebounding'), hidden(player, 'athleticism'), iq].filter(Boolean);
  const talentScore = talent.reduce((sum, value) => sum + value, 0) / Math.max(1, talent.length);
  return {
    name: player.full_name || player.name || 'Unknown Player',
    team: player.team || '-',
    position: player.position || '-',
    coreRole,
    archetype,
    talent: gradeFromScore(talentScore || 74),
    potential: gradeFromScore(hidden(player, 'potential') || talentScore || 74),
    reasons: reasons.join('; ') || '-',
  };
}

function buildEraAuditReport(eraKey, players) {
  const rows = players
    .map(auditPlayer)
    .sort((left, right) => Number(right.coreRole) - Number(left.coreRole) || left.name.localeCompare(right.name));
  return [
    '# NBA Era Grade Audit',
    '',
    `Era: ${eraKey}`,
    '',
    'This report is read-only. Review suggested player roles before applying any vault updates.',
    '',
    '| Player | Team | Pos | Core Role | Suggested Archetype | Talent | Potential | Reasons |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map(row => `| ${row.name} | ${row.team} | ${row.position} | ${row.coreRole ? 'Yes' : 'No'} | ${row.archetype} | ${row.talent} | ${row.potential} | ${row.reasons} |`),
    '',
  ].join('\n');
}
const snap = await getDoc(doc(db, 'era_player_pools', era));

if (!snap.exists()) {
  console.error(`era_player_pools/${era} not found`);
  process.exit(1);
}

const players = snap.data().players || [];
const report = buildEraAuditReport(era, players);
const outDir = path.resolve('docs/reports');
const outPath = path.join(outDir, 'nba-era-grade-audit.md');
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(outPath, report, 'utf8');
console.log(`Wrote ${outPath}`);
