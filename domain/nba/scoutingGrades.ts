import type { NbaGrade } from './identity';
import { abilityGradesFromStats } from './upgradePoints';

export type ScoutingGradeKey =
  | 'closeShot'
  | 'midRange'
  | 'threePoint'
  | 'freeThrow'
  | 'dunking'
  | 'shotIq'
  | 'passing'
  | 'ballHandle'
  | 'offenseIq'
  | 'clutch'
  | 'perimeterDefense'
  | 'postDefense'
  | 'blocking'
  | 'steals'
  | 'defenseIq'
  | 'helpDefense'
  | 'speed'
  | 'acceleration'
  | 'strength'
  | 'rebounding'
  | 'postOffense'
  | 'stamina';

export type ScoutingGradeMap = Record<ScoutingGradeKey, NbaGrade>;

export type ScoutingGradeItem = {
  key: ScoutingGradeKey;
  label: string;
  grade: NbaGrade;
  colors: GradeColorStyle;
};

export type ScoutingGradeSection = {
  title: string;
  items: ScoutingGradeItem[];
};

export type GradeColorStyle = {
  textColor: string;
  backgroundColor: string;
  borderColor: string;
};

export type CompareGradeRow = {
  key: ScoutingGradeKey;
  label: string;
  left: NbaGrade;
  right: NbaGrade;
  winner: 'left' | 'right' | 'tie';
};

const GRADE_ORDER: NbaGrade[] = ['F', 'D', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+', 'S'];

export const SCOUTING_GRADE_GROUPS: { title: string; items: { key: ScoutingGradeKey; label: string }[] }[] = [
  {
    title: 'Scoring',
    items: [
      { key: 'closeShot', label: 'Close Shot' },
      { key: 'midRange', label: 'Mid Range' },
      { key: 'threePoint', label: '3PT Shot' },
      { key: 'freeThrow', label: 'Free Throw' },
      { key: 'dunking', label: 'Dunking' },
      { key: 'shotIq', label: 'Shot IQ' },
    ],
  },
  {
    title: 'Playmaking / IQ',
    items: [
      { key: 'passing', label: 'Passing' },
      { key: 'ballHandle', label: 'Ball Handle' },
      { key: 'offenseIq', label: 'Offense IQ' },
      { key: 'clutch', label: 'Clutch' },
    ],
  },
  {
    title: 'Defense',
    items: [
      { key: 'perimeterDefense', label: 'Perimeter D' },
      { key: 'postDefense', label: 'Post Defense' },
      { key: 'blocking', label: 'Blocking' },
      { key: 'steals', label: 'Steals' },
      { key: 'defenseIq', label: 'Defense IQ' },
      { key: 'helpDefense', label: 'Help Defense' },
    ],
  },
  {
    title: 'Physical / Interior',
    items: [
      { key: 'speed', label: 'Speed' },
      { key: 'acceleration', label: 'Acceleration' },
      { key: 'strength', label: 'Strength' },
      { key: 'rebounding', label: 'Rebounding' },
      { key: 'postOffense', label: 'Post Offense' },
      { key: 'stamina', label: 'Stamina' },
    ],
  },
];

const SCOUTING_KEYS = SCOUTING_GRADE_GROUPS.flatMap(group => group.items.map(item => item.key));
const VALID_GRADES = new Set<string>(GRADE_ORDER);

function numberFrom(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizedGrade(value: unknown): NbaGrade | null {
  const normalized = String(value || '').trim().toUpperCase();
  return VALID_GRADES.has(normalized) ? normalized as NbaGrade : null;
}

function gradeFromRating(value: unknown): NbaGrade | null {
  const numeric = numberFrom(value);
  if (numeric === null) return null;
  const rating = Math.max(25, Math.min(99, Math.round(numeric)));
  if (rating >= 99) return 'S';
  if (rating >= 97) return 'A+';
  if (rating >= 90) return 'A';
  if (rating >= 85) return 'A-';
  if (rating >= 80) return 'B+';
  if (rating >= 75) return 'B';
  if (rating >= 70) return 'B-';
  if (rating >= 68) return 'C+';
  if (rating >= 60) return 'C';
  if (rating >= 55) return 'C-';
  if (rating >= 50) return 'D';
  return 'F';
}

function firstGrade(...values: unknown[]): NbaGrade | null {
  for (const value of values) {
    const grade = normalizedGrade(value) || gradeFromRating(value);
    if (grade) return grade;
  }
  return null;
}

function sourceObject(player: Record<string, any>, profile: Record<string, any> | null | undefined, key: string) {
  const candidates = [
    player?.[key],
    player?.visible?.[key],
    player?.identity?.[key],
    player?.visibleIdentity?.[key],
    profile?.[key],
    profile?.visible?.[key],
    profile?.identity?.[key],
    profile?.visibleIdentity?.[key],
  ];
  return candidates.find(value => value && typeof value === 'object') || {};
}

function gradeFromExplicit(player: Record<string, any>, profile: Record<string, any> | null | undefined, key: ScoutingGradeKey) {
  const expanded = sourceObject(player, profile, 'scoutingGrades');
  return normalizedGrade(expanded[key]);
}

function gradeFromLegacy(player: Record<string, any>, profile: Record<string, any> | null | undefined, key: ScoutingGradeKey) {
  const legacy = {
    ...sourceObject(profile || {}, null, 'abilityGrades'),
    ...sourceObject(profile || {}, null, 'grades'),
    ...sourceObject(player, profile, 'abilityGrades'),
    ...sourceObject(player, profile, 'grades'),
  };
  const grade = (legacyKey: string) => normalizedGrade(legacy[legacyKey]);
  switch (key) {
    case 'closeShot':
    case 'midRange':
    case 'threePoint':
    case 'freeThrow':
    case 'shotIq':
      return grade('shooting');
    case 'passing':
    case 'ballHandle':
    case 'offenseIq':
    case 'clutch':
      return grade('playmaking') || grade('basketballIq');
    case 'perimeterDefense':
    case 'postDefense':
    case 'blocking':
    case 'steals':
    case 'defenseIq':
    case 'helpDefense':
      return grade('defense');
    case 'rebounding':
      return grade('rebounding');
    case 'speed':
    case 'acceleration':
    case 'strength':
    case 'dunking':
    case 'stamina':
      return grade('athleticism');
    case 'postOffense':
      return grade('rebounding') || grade('shooting');
    default:
      return null;
  }
}

function gradeFromHidden(player: Record<string, any>, profile: Record<string, any> | null | undefined, key: ScoutingGradeKey) {
  const hidden = {
    ...sourceObject(profile || {}, null, 'hidden'),
    ...sourceObject(player, profile, 'hidden'),
  };
  const value = (...keys: string[]) => firstGrade(...keys.map(candidate => hidden[candidate]));
  switch (key) {
    case 'closeShot': return value('closeShot', 'insideScoring', 'shooting');
    case 'midRange': return value('midRange', 'midRangeShot', 'shooting');
    case 'threePoint': return value('threePoint', 'threePointShot', 'shooting');
    case 'freeThrow': return value('freeThrow', 'freeThrowShot', 'shooting');
    case 'dunking': return value('dunking', 'athleticism');
    case 'shotIq': return value('shotIq', 'basketballIq', 'consistency');
    case 'passing': return value('passing', 'playmaking');
    case 'ballHandle': return value('ballHandle', 'handles', 'playmaking');
    case 'offenseIq': return value('offenseIq', 'basketballIq', 'playmaking');
    case 'clutch': return value('clutch', 'consistency', 'basketballIq');
    case 'perimeterDefense': return value('perimeterDefense', 'defense');
    case 'postDefense': return value('postDefense', 'interiorDefense', 'defense', 'strength');
    case 'blocking': return value('blocking', 'blocks', 'defense');
    case 'steals': return value('steals', 'perimeterDefense', 'defense');
    case 'defenseIq': return value('defenseIq', 'basketballIq', 'defense');
    case 'helpDefense': return value('helpDefense', 'defenseIq', 'defense');
    case 'speed': return value('speed', 'athleticism');
    case 'acceleration': return value('acceleration', 'athleticism');
    case 'strength': return value('strength', 'athleticism');
    case 'rebounding': return value('rebounding');
    case 'postOffense': return value('postOffense', 'insideScoring', 'closeShot', 'shooting');
    case 'stamina': return value('stamina', 'consistency');
    default: return null;
  }
}

function gradeFromStats(player: Record<string, any>, profile: Record<string, any> | null | undefined, key: ScoutingGradeKey): NbaGrade | null {
  const broad = abilityGradesFromStats({
    ...(profile?.careerStats || {}),
    ...(profile?.seasons?.[0] || {}),
    ...player,
  });
  const legacyPlayer = { grades: broad };
  return gradeFromLegacy(legacyPlayer, null, key);
}

export function buildScoutingGrades(player: Record<string, any>, profile?: Record<string, any> | null): ScoutingGradeMap {
  return SCOUTING_KEYS.reduce((grades, key) => {
    grades[key] = (
      gradeFromExplicit(player, profile, key)
      || gradeFromHidden(player, profile, key)
      || gradeFromLegacy(player, profile, key)
      || gradeFromStats(player, profile, key)
      || 'C'
    );
    return grades;
  }, {} as ScoutingGradeMap);
}

export function gradeRank(grade: NbaGrade): number {
  return Math.max(0, GRADE_ORDER.indexOf(grade));
}

export function gradeColors(grade: NbaGrade): GradeColorStyle {
  if (grade === 'S') return { textColor: '#f5c451', backgroundColor: '#261f0c', borderColor: '#f5c451' };
  if (grade.startsWith('A')) return { textColor: '#00ff87', backgroundColor: '#062416', borderColor: '#00ff87' };
  if (grade.startsWith('B')) return { textColor: '#54a3ff', backgroundColor: '#071a2e', borderColor: '#2477d8' };
  if (grade.startsWith('C')) return { textColor: '#f7d154', backgroundColor: '#241f08', borderColor: '#c99c20' };
  if (grade === 'D') return { textColor: '#ff9f43', backgroundColor: '#2a1605', borderColor: '#cc7420' };
  return { textColor: '#ff4d5e', backgroundColor: '#2d080d', borderColor: '#bf2636' };
}

export function getScoutingGradeSections(player: Record<string, any>, profile?: Record<string, any> | null): ScoutingGradeSection[] {
  const grades = buildScoutingGrades(player, profile);
  return SCOUTING_GRADE_GROUPS.map(group => ({
    title: group.title,
    items: group.items.map(item => ({
      ...item,
      grade: grades[item.key],
      colors: gradeColors(grades[item.key]),
    })),
  }));
}

export function compareScoutingGrades(left: ScoutingGradeMap, right: ScoutingGradeMap): CompareGradeRow[] {
  return SCOUTING_GRADE_GROUPS.flatMap(group => group.items.map(item => {
    const leftGrade = left[item.key];
    const rightGrade = right[item.key];
    const leftRank = gradeRank(leftGrade);
    const rightRank = gradeRank(rightGrade);
    return {
      key: item.key,
      label: item.label,
      left: leftGrade,
      right: rightGrade,
      winner: leftRank === rightRank ? 'tie' : leftRank > rightRank ? 'left' : 'right',
    };
  }));
}

export function getCompareRowModel({
  leftName,
  rightName,
  row,
}: {
  leftName: string;
  rightName: string;
  row: CompareGradeRow;
}) {
  return {
    left: { name: leftName, grade: row.left },
    centerLabel: row.label,
    right: { grade: row.right, name: rightName },
    winner: row.winner,
    accessibilityLabel: `${leftName} ${row.left} ${row.label} ${row.right} ${rightName}`,
  };
}
