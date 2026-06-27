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

const GRADE_ORDER = ['F', 'D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+', 'S'];
const GRADE_LABELS = {
  perimeterDefense: 'Perimeter D',
  defenseIq: 'Defense IQ',
  helpDefense: 'Help Defense',
  stamina: 'Stamina',
  offenseIq: 'Offense IQ',
  midRange: 'Mid Range',
  rebounding: 'Rebounding',
  steals: 'Steals',
};

function gradeRank(grade) {
  return grade === 'Missing' ? -1 : GRADE_ORDER.indexOf(grade);
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

function hasHidden(player, key) {
  return player?.hidden?.[key] !== undefined || player?.[key] !== undefined;
}

function currentGrade(player, key) {
  if (!hasHidden(player, key)) return 'Missing';
  return gradeOnly(hidden(player, key));
}

function positionIncludes(player, values) {
  const position = String(player.position || '').toUpperCase();
  return values.some(value => position.includes(value));
}

function isWing(player) {
  return positionIncludes(player, ['SG', 'SF', 'G-F', 'F-G']);
}

function salaryCoreSignal(player) {
  const salary = stat(player, ['salary', 'currentSalary', 'seasonSalary']);
  const salaryRank = stat(player, ['teamSalaryRank', 'salaryRank']);
  return salary >= 8_000_000 || (salaryRank > 0 && salaryRank <= 3);
}

function careerCoreSignal(player) {
  const winShares = stat(player, ['career_WS', 'careerWinShares', 'winShares']);
  const per = stat(player, ['career_PER', 'careerPer', 'per']);
  return winShares >= 40 || (winShares >= 25 && per >= 14);
}

function wingDefensiveWorkloadSignal(player) {
  const minutes = stat(player, ['minutes', 'mpg', 'min']);
  const ppg = stat(player, ['ppg', 'points', 'pts']);
  const rpg = stat(player, ['rpg', 'rebounds', 'reb']);
  const spg = stat(player, ['spg', 'steals', 'stl']);
  return isWing(player) && minutes >= 32 && ppg >= 11 && rpg >= 4 && spg >= 0.7;
}

function inferredDefense(player) {
  return hidden(player, 'defense') || (wingDefensiveWorkloadSignal(player) ? 84 : 0);
}

function inferredIq(player) {
  const iq = hidden(player, 'basketballIq');
  if (iq) return iq;
  return salaryCoreSignal(player) && careerCoreSignal(player) ? 82 : 0;
}

function inferredStamina(player) {
  const stamina = hidden(player, 'stamina');
  const minutes = stat(player, ['minutes', 'mpg', 'min']);
  if (stamina) return stamina;
  return minutes >= 36 ? 90 : minutes >= 32 ? 86 : 0;
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

function gradeOnly(score) {
  return gradeFromScore(score).split(' ')[0];
}

function suggestedGradeUpdates(player) {
  const minutes = stat(player, ['minutes', 'mpg', 'min']);
  const ppg = stat(player, ['ppg', 'points', 'pts']);
  const rpg = stat(player, ['rpg', 'rebounds', 'reb']);
  const apg = stat(player, ['apg', 'assists', 'ast']);
  const spg = stat(player, ['spg', 'steals', 'stl']);
  const suggestions = [];
  const add = (key, suggestedGrade, reason) => {
    const current = currentGrade(player, key);
    if (gradeRank(current) >= gradeRank(suggestedGrade)) return;
    suggestions.push({
      key,
      label: GRADE_LABELS[key] || key,
      currentGrade: current,
      suggestedGrade,
      reason,
    });
  };

  if (wingDefensiveWorkloadSignal(player)) {
    add('perimeterDefense', 'B+', 'trusted wing-stopper workload');
    add('defenseIq', 'B', 'defensive assignment value');
    add('helpDefense', 'B-', 'team-defense connector profile');
  }
  if (minutes >= 36) add('stamina', 'A-', 'near-40-minute role');
  else if (minutes >= 32) add('stamina', 'B+', 'starter workload');
  if (ppg >= 14 && apg >= 2) add('offenseIq', 'B-', 'secondary offensive engine');
  if (ppg >= 15) add('midRange', 'B-', 'half-court scoring load');
  if (rpg >= 5 && isWing(player)) add('rebounding', 'C+', 'plus rebounding wing');
  if (spg >= 1) add('steals', 'B-', 'active defensive event rate');

  return suggestions;
}

function auditPlayer(player) {
  const minutes = stat(player, ['minutes', 'mpg', 'min']);
  const ppg = stat(player, ['ppg', 'points', 'pts']);
  const rpg = stat(player, ['rpg', 'rebounds', 'reb']);
  const apg = stat(player, ['apg', 'assists', 'ast']);
  const defense = inferredDefense(player);
  const iq = inferredIq(player);
  const stamina = inferredStamina(player);
  const shooting = hidden(player, 'shooting') || hidden(player, 'threePoint');
  const playmaking = hidden(player, 'playmaking') || hidden(player, 'passing');
  const rebounding = hidden(player, 'rebounding');
  const salarySignal = salaryCoreSignal(player);
  const careerSignal = careerCoreSignal(player);
  const wingDefenseSignal = wingDefensiveWorkloadSignal(player);
  const coreRole = minutes >= 32
    || salarySignal
    || careerSignal
    || (minutes >= 28 && ppg + rpg + apg >= 20)
    || (defense >= 84 && stamina >= 86);
  const reasons = [];
  if (minutes >= 32) reasons.push(`${minutes} MPG workload`);
  if (salarySignal) reasons.push('core salary signal');
  if (wingDefenseSignal) reasons.push('wing defensive workload signal');
  if (careerSignal) reasons.push('career win-share/core signal');
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
  const missingCoreHiddenGrades = coreRole && !hasHidden(player, 'defense') && !hasHidden(player, 'basketballIq') && !hasHidden(player, 'stamina');
  const needsReview = missingCoreHiddenGrades || (coreRole && archetype === 'Rotation Player');
  const priority = needsReview ? 'high' : coreRole ? 'medium' : 'normal';
  const talent = [hidden(player, 'shooting'), hidden(player, 'playmaking'), defense, hidden(player, 'rebounding'), hidden(player, 'athleticism'), iq].filter(Boolean);
  const talentScore = talent.reduce((sum, value) => sum + value, 0) / Math.max(1, talent.length);
  return {
    name: player.full_name || player.name || 'Unknown Player',
    team: player.team || '-',
    position: player.position || '-',
    coreRole,
    priority,
    archetype,
    talent: gradeFromScore(talentScore || 74),
    potential: gradeFromScore(hidden(player, 'potential') || talentScore || 74),
    suggestions: suggestedGradeUpdates(player).map(update => `${update.label} -> ${update.suggestedGrade}`).join('; ') || '-',
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
    '| Player | Team | Pos | Core Role | Priority | Suggested Archetype | Talent | Potential | Suggested Grade Review | Reasons |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map(row => `| ${row.name} | ${row.team} | ${row.position} | ${row.coreRole ? 'Yes' : 'No'} | ${row.priority} | ${row.archetype} | ${row.talent} | ${row.potential} | ${row.suggestions} | ${row.reasons} |`),
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
