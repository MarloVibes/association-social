import type { NbaGrade } from './identity';
import { buildEvaluationLayers, gradeFromScore } from './evaluation';

export type EraAuditPlayer = Record<string, any>;
export type EraAuditPriority = 'high' | 'medium' | 'normal';
export type SuggestedGradeUpdate = {
  key: string;
  label: string;
  currentGrade: NbaGrade | 'Missing';
  suggestedGrade: NbaGrade;
  reason: string;
};

export type EraAuditResult = {
  playerName: string;
  team: string;
  position: string;
  coreRole: boolean;
  needsReview: boolean;
  reviewPriority: EraAuditPriority;
  suggestedArchetype: string;
  suggestedGradeUpdates: SuggestedGradeUpdate[];
  reviewReasons: string[];
  visibleSummary: {
    overallTalent: string;
    currentForm: string;
    potential: string;
  };
};

function numberFrom(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

const GRADE_ORDER: NbaGrade[] = ['F', 'D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+', 'S'];
const GRADE_LABELS: Record<string, string> = {
  threePoint: '3PT Shot',
  passing: 'Passing',
  dunking: 'Dunking',
  perimeterDefense: 'Perimeter D',
  defenseIq: 'Defense IQ',
  helpDefense: 'Help Defense',
  stamina: 'Stamina',
  offenseIq: 'Offense IQ',
  midRange: 'Mid Range',
  rebounding: 'Rebounding',
  steals: 'Steals',
};

function gradeRank(grade: NbaGrade | 'Missing') {
  return grade === 'Missing' ? -1 : GRADE_ORDER.indexOf(grade);
}

function stat(player: EraAuditPlayer, keys: string[]) {
  for (const key of keys) {
    const value = player?.[key] ?? player?.seasonStats?.[key];
    if (value !== undefined && value !== null && value !== '') return numberFrom(value);
  }
  return 0;
}

function hidden(player: EraAuditPlayer, key: string) {
  return numberFrom(player?.hidden?.[key] ?? player?.[key]);
}

function hasHidden(player: EraAuditPlayer, key: string) {
  return player?.hidden?.[key] !== undefined || player?.[key] !== undefined;
}

function currentGrade(player: EraAuditPlayer, key: string): NbaGrade | 'Missing' {
  if (!hasHidden(player, key)) return 'Missing';
  return gradeFromScore(hidden(player, key));
}

function positionIncludes(player: EraAuditPlayer, values: string[]) {
  const position = String(player.position || '').toUpperCase();
  return values.some(value => position.includes(value));
}

function isWing(player: EraAuditPlayer) {
  return positionIncludes(player, ['SG', 'SF', 'G-F', 'F-G']);
}

function isBig(player: EraAuditPlayer) {
  return positionIncludes(player, ['PF', 'C', 'F-C', 'C-F']);
}

function salaryCoreSignal(player: EraAuditPlayer) {
  const salary = stat(player, ['salary', 'currentSalary', 'seasonSalary']);
  const salaryRank = stat(player, ['teamSalaryRank', 'salaryRank']);
  return salary >= 8_000_000 || (salaryRank > 0 && salaryRank <= 3);
}

function careerCoreSignal(player: EraAuditPlayer) {
  const winShares = stat(player, ['career_WS', 'careerWinShares', 'winShares']);
  const per = stat(player, ['career_PER', 'careerPer', 'per']);
  return winShares >= 40 || (winShares >= 25 && per >= 14);
}

function wingDefensiveWorkloadSignal(player: EraAuditPlayer) {
  const minutes = stat(player, ['minutes', 'mpg', 'min']);
  const ppg = stat(player, ['ppg', 'points', 'pts']);
  const rpg = stat(player, ['rpg', 'rebounds', 'reb']);
  const spg = stat(player, ['spg', 'steals', 'stl']);
  return isWing(player) && minutes >= 32 && ppg >= 11 && rpg >= 4 && spg >= 0.7;
}

function inferredDefense(player: EraAuditPlayer) {
  return hidden(player, 'defense') || (wingDefensiveWorkloadSignal(player) ? 84 : 0);
}

function inferredIq(player: EraAuditPlayer) {
  const iq = hidden(player, 'basketballIq');
  if (iq) return iq;
  return salaryCoreSignal(player) && careerCoreSignal(player) ? 82 : 0;
}

function inferredStamina(player: EraAuditPlayer) {
  const stamina = hidden(player, 'stamina');
  const minutes = stat(player, ['minutes', 'mpg', 'min']);
  if (stamina) return stamina;
  return minutes >= 36 ? 90 : minutes >= 32 ? 86 : 0;
}

function archetypeFor(player: EraAuditPlayer) {
  const defense = inferredDefense(player);
  const iq = inferredIq(player);
  const stamina = inferredStamina(player);
  const shooting = hidden(player, 'shooting') || hidden(player, 'threePoint');
  const playmaking = hidden(player, 'playmaking') || hidden(player, 'passing');
  const rebounding = hidden(player, 'rebounding');
  const ppg = stat(player, ['ppg', 'points', 'pts']);
  if ((defense >= 82 || iq >= 84) && ppg >= 12) return 'Two-Way Core Wing';
  if (shooting >= 86 && ppg >= 14) return 'Primary Scorer';
  if (playmaking >= 86) return 'Lead Creator';
  if (defense >= 84 && rebounding >= 80) return 'Defensive Anchor';
  if (stamina >= 88 && defense >= 78) return 'High-Minute Connector';
  return 'Rotation Player';
}

function passingGradeFromAssists(apg: number): NbaGrade | null {
  if (apg >= 10) return 'S';
  if (apg >= 9) return 'A+';
  if (apg >= 8) return 'A';
  if (apg >= 7) return 'A-';
  if (apg >= 6) return 'B+';
  if (apg >= 5) return 'B';
  if (apg >= 4) return 'B-';
  if (apg >= 3) return 'C+';
  if (apg >= 2) return 'C';
  return null;
}

function likelyThreePointVolume(player: EraAuditPlayer) {
  return stat(player, [
    'threePointAttemptsPerGame',
    'fg3a',
    'fg3Attempts',
    'threePointAttempts',
    'three_point_attempts_per_game',
  ]);
}

function dunkingGradeFromProfile(player: EraAuditPlayer): NbaGrade | null {
  const ppg = stat(player, ['ppg', 'points', 'pts']);
  const freeThrows = stat(player, ['freeThrowAttemptsPerGame', 'fta', 'freeThrowsAttempted']);
  const dunks = stat(player, ['dunks', 'dunkAttempts', 'madeDunks']);
  const athleticism = hidden(player, 'athleticism');
  const finishing = hidden(player, 'finishing');
  if (dunks >= 100 || (athleticism >= 94 && ppg >= 24 && freeThrows >= 5)) return 'A';
  if (dunks >= 70 || (athleticism >= 90 && ppg >= 20 && freeThrows >= 4)) return 'A-';
  if (dunks >= 40 || (finishing >= 88 && athleticism >= 86 && ppg >= 17)) return 'B+';
  return null;
}

function suggestedGradeUpdates(player: EraAuditPlayer): SuggestedGradeUpdate[] {
  const minutes = stat(player, ['minutes', 'mpg', 'min']);
  const ppg = stat(player, ['ppg', 'points', 'pts']);
  const rpg = stat(player, ['rpg', 'rebounds', 'reb']);
  const apg = stat(player, ['apg', 'assists', 'ast']);
  const spg = stat(player, ['spg', 'steals', 'stl']);
  const per = stat(player, ['career_PER', 'careerPer', 'per']);
  const winShares = stat(player, ['career_WS', 'careerWinShares', 'winShares']);
  const suggestions: SuggestedGradeUpdate[] = [];
  const add = (key: string, suggestedGrade: NbaGrade, reason: string) => {
    const current = currentGrade(player, key);
    if (gradeRank(current) >= gradeRank(suggestedGrade)) return;
    const existingIndex = suggestions.findIndex(suggestion => suggestion.key === key);
    if (existingIndex >= 0) {
      if (gradeRank(suggestions[existingIndex].suggestedGrade) >= gradeRank(suggestedGrade)) return;
      suggestions.splice(existingIndex, 1);
    }
    suggestions.push({
      key,
      label: GRADE_LABELS[key] || key,
      currentGrade: current,
      suggestedGrade,
      reason,
    });
  };
  const correctDown = (key: string, suggestedGrade: NbaGrade, reason: string) => {
    const current = currentGrade(player, key);
    if (gradeRank(current) <= gradeRank(suggestedGrade)) return;
    const existingIndex = suggestions.findIndex(suggestion => suggestion.key === key);
    if (existingIndex >= 0) {
      suggestions.splice(existingIndex, 1);
    }
    suggestions.push({
      key,
      label: GRADE_LABELS[key] || key,
      currentGrade: current,
      suggestedGrade,
      reason,
    });
  };

  const assistBasedPassingGrade = passingGradeFromAssists(apg);
  if (assistBasedPassingGrade && hasHidden(player, 'passing')) {
    const current = currentGrade(player, 'passing');
    if (gradeRank(current) - gradeRank(assistBasedPassingGrade) >= 2) {
      correctDown('passing', assistBasedPassingGrade, `${apg.toFixed(1)} APG does not support a higher passing tier`);
    }
  }

  const threePointAttempts = likelyThreePointVolume(player);
  if (isBig(player) && threePointAttempts > 0 && threePointAttempts <= 0.5 && hasHidden(player, 'threePoint')) {
    correctDown('threePoint', 'F', `${threePointAttempts.toFixed(1)} 3PA per game non-shooting big profile`);
  }

  if (wingDefensiveWorkloadSignal(player)) {
    add('perimeterDefense', 'B+', 'trusted wing-stopper workload');
    add('defenseIq', 'B', 'defensive assignment value');
    add('helpDefense', 'B-', 'team-defense connector profile');
  }
  if (minutes >= 36) add('stamina', 'A-', 'near-40-minute role');
  else if (minutes >= 32) add('stamina', 'B+', 'starter workload');
  if (apg >= 9 && per >= 22 && winShares >= 70) add('offenseIq', 'A', 'elite table-setting production proof');
  else if (apg >= 8 && per >= 19 && winShares >= 40) add('offenseIq', 'A-', 'lead table-setting production proof');
  else if (ppg >= 25 && apg >= 6 && per >= 22 && winShares >= 70) add('offenseIq', 'A', 'primary creator with elite production proof');
  else if (ppg >= 22 && apg >= 5 && per >= 19) add('offenseIq', 'A-', 'primary creator production');
  else if (ppg >= 18 && apg >= 4) add('offenseIq', 'B+', 'high-usage creator');
  else if (ppg >= 14 && apg >= 2) add('offenseIq', 'B-', 'secondary offensive engine');
  if (ppg >= 25 && per >= 22) add('midRange', 'A-', 'elite half-court scoring load');
  else if (ppg >= 21 && per >= 18) add('midRange', 'B+', 'primary scoring load');
  else if (ppg >= 15) add('midRange', 'B-', 'half-court scoring load');
  if (rpg >= 5 && isWing(player)) add('rebounding', 'C+', 'plus rebounding wing');
  if (spg >= 1) add('steals', 'B-', 'active defensive event rate');
  const suggestedDunking = dunkingGradeFromProfile(player);
  if (suggestedDunking) add('dunking', suggestedDunking, 'downhill athletic finishing proof');

  return suggestions;
}

export function auditEraPlayer(player: EraAuditPlayer): EraAuditResult {
  const minutes = stat(player, ['minutes', 'mpg', 'min']);
  const ppg = stat(player, ['ppg', 'points', 'pts']);
  const rpg = stat(player, ['rpg', 'rebounds', 'reb']);
  const apg = stat(player, ['apg', 'assists', 'ast']);
  const defense = inferredDefense(player);
  const iq = inferredIq(player);
  const stamina = inferredStamina(player);
  const salarySignal = salaryCoreSignal(player);
  const careerSignal = careerCoreSignal(player);
  const wingDefenseSignal = wingDefensiveWorkloadSignal(player);
  const coreRole = minutes >= 32
    || salarySignal
    || careerSignal
    || (minutes >= 28 && ppg + rpg + apg >= 20)
    || (defense >= 84 && stamina >= 86);
  const reviewReasons: string[] = [];
  if (minutes >= 32) reviewReasons.push(`${minutes} MPG workload`);
  if (salarySignal) reviewReasons.push('core salary signal');
  if (wingDefenseSignal) reviewReasons.push('wing defensive workload signal');
  if (careerSignal) reviewReasons.push('career win-share/core signal');
  if (defense >= 84) reviewReasons.push('high defensive grade signal');
  if (iq >= 82) reviewReasons.push('strong basketball IQ signal');
  if (stamina >= 88) reviewReasons.push('high stamina/core-minute signal');
  if (ppg >= 14 && defense >= 80) reviewReasons.push('two-way production profile');
  if (coreRole && reviewReasons.length === 0) reviewReasons.push('core rotation profile');
  const layers = buildEvaluationLayers(player);
  const missingCoreHiddenGrades = coreRole && !hasHidden(player, 'defense') && !hasHidden(player, 'basketballIq') && !hasHidden(player, 'stamina');
  const needsReview = missingCoreHiddenGrades || (coreRole && archetypeFor(player) === 'Rotation Player');
  const reviewPriority: EraAuditPriority = needsReview
    ? 'high'
    : coreRole
      ? 'medium'
      : 'normal';

  return {
    playerName: String(player.full_name || player.name || 'Unknown Player'),
    team: String(player.team || player.teamAbbr || ''),
    position: String(player.position || ''),
    coreRole,
    needsReview,
    reviewPriority,
    suggestedArchetype: archetypeFor(player),
    suggestedGradeUpdates: suggestedGradeUpdates(player),
    reviewReasons,
    visibleSummary: {
      overallTalent: `${layers.overallTalent.grade} ${layers.overallTalent.tier}`,
      currentForm: `${layers.currentForm.grade} ${layers.currentForm.tier}`,
      potential: `${layers.potential.grade} ${layers.potential.tier}`,
    },
  };
}

export function buildEraAuditReport(era: string, players: EraAuditPlayer[]) {
  const results = players
    .map(auditEraPlayer)
    .sort((left, right) => Number(right.coreRole) - Number(left.coreRole) || left.playerName.localeCompare(right.playerName));
  const rows = results.map(result => [
    result.playerName,
    result.team || '-',
    result.position || '-',
    result.coreRole ? 'Yes' : 'No',
    result.reviewPriority,
    result.suggestedArchetype,
    result.visibleSummary.overallTalent,
    result.visibleSummary.currentForm,
    result.visibleSummary.potential,
    result.suggestedGradeUpdates.map(update => `${update.label} -> ${update.suggestedGrade}`).join('; ') || '-',
    result.reviewReasons.join('; ') || '-',
  ]);
  return [
    '# NBA Era Grade Audit',
    '',
    `Era: ${era}`,
    '',
    'This report is read-only. Review suggested player roles before applying any vault updates.',
    '',
    '| Player | Team | Pos | Core Role | Priority | Suggested Archetype | Talent | Form | Potential | Suggested Grade Review | Reasons |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map(row => `| ${row.join(' | ')} |`),
    '',
  ].join('\n');
}
