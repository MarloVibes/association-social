import type { NbaGrade } from './identity';
import { gradeFromNumeric } from './gradeScale';

export type UpgradePlayerLabel =
  | 'LEGEND'
  | 'SUPERSTAR'
  | 'STAR'
  | 'PLAYMAKER'
  | 'REBOUNDER'
  | 'SHOT BLOCKER'
  | 'LOCKDOWN'
  | '3&D'
  | 'SHARPSHOOTER'
  | 'TWO-WAY'
  | 'INTERIOR'
  | 'FLOOR GENERAL'
  | 'ROOKIE'
  | 'SOPHOMORE'
  | '3RD YEAR'
  | '4TH YEAR'
  | 'ROLE PLAYER'
  | string;

export type UpgradeAwards = Partial<Record<
  | 'championship'
  | 'finals_runner_up'
  | 'mvp'
  | 'finals_mvp'
  | 'dpoy'
  | 'roy'
  | 'sixth_man'
  | 'mip'
  | 'all_nba_1st'
  | 'all_nba_2nd'
  | 'all_nba_3rd'
  | 'all_defense'
  | 'all_star'
  | 'nba_cup',
  number
>>;

export type AwardUpgradeInput = {
  championships?: number;
  finalsRunnerUp?: number;
  awards?: UpgradeAwards;
};

export type StandingLike = {
  teamId: string;
  conference?: string | null;
  wins: number;
  losses?: number;
};

export type SeasonUpgradeGrant = {
  teamId: string;
  awardPoints: number;
  lotteryBoostPoints: number;
  totalPoints: number;
};

export type SeasonUpgradeGrantInput = {
  standings: StandingLike[];
  awardLedger?: Record<string, AwardUpgradeInput>;
};

export type SpendUpgradeInput = {
  teamPoints: number;
  playerLabel: UpgradePlayerLabel;
  upgradesUsedThisSeason: number;
  ability: string;
  grades: Record<string, NbaGrade>;
};

export type SpendUpgradeResult = {
  valid: boolean;
  errors: string[];
  teamPoints: number;
  upgradesUsedThisSeason: number;
  grades: Record<string, NbaGrade>;
};

const GRADE_LADDER: NbaGrade[] = ['F', 'D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+', 'S'];
const LIMITED_LABELS = new Set(['STAR', 'SUPERSTAR', 'LEGEND']);
const S_ELIGIBLE_LABELS = new Set(['SUPERSTAR', 'LEGEND']);

const AWARD_POINTS: Required<UpgradeAwards> = {
  championship: 5,
  finals_runner_up: 3,
  mvp: 1,
  finals_mvp: 1,
  dpoy: 1,
  roy: 1,
  sixth_man: 1,
  mip: 1,
  all_nba_1st: 1,
  all_nba_2nd: 1,
  all_nba_3rd: 1,
  all_defense: 1,
  all_star: 1,
  nba_cup: 1,
};

export type UpgradeGradeOption = {
  key: string;
  label: string;
  category: string;
};

export const UPGRADE_GRADE_OPTIONS: UpgradeGradeOption[] = [
  { key: 'closeShot', label: 'Close Shot', category: 'Scoring' },
  { key: 'midRange', label: 'Mid Range', category: 'Scoring' },
  { key: 'threePoint', label: '3PT Shot', category: 'Scoring' },
  { key: 'freeThrow', label: 'Free Throw', category: 'Scoring' },
  { key: 'dunking', label: 'Dunking', category: 'Scoring' },
  { key: 'shotIq', label: 'Shot IQ', category: 'Scoring' },
  { key: 'passing', label: 'Passing', category: 'Playmaking / IQ' },
  { key: 'ballHandle', label: 'Ball Handle', category: 'Playmaking / IQ' },
  { key: 'offenseIq', label: 'Offense IQ', category: 'Playmaking / IQ' },
  { key: 'clutch', label: 'Clutch', category: 'Playmaking / IQ' },
  { key: 'perimeterDefense', label: 'Perimeter D', category: 'Defense' },
  { key: 'postDefense', label: 'Post Defense', category: 'Defense' },
  { key: 'blocking', label: 'Blocking', category: 'Defense' },
  { key: 'steals', label: 'Steals', category: 'Defense' },
  { key: 'defenseIq', label: 'Defense IQ', category: 'Defense' },
  { key: 'helpDefense', label: 'Help Defense', category: 'Defense' },
  { key: 'speed', label: 'Speed', category: 'Physical / Interior' },
  { key: 'acceleration', label: 'Acceleration', category: 'Physical / Interior' },
  { key: 'strength', label: 'Strength', category: 'Physical / Interior' },
  { key: 'rebounding', label: 'Rebounding', category: 'Physical / Interior' },
  { key: 'postOffense', label: 'Post Offense', category: 'Physical / Interior' },
  { key: 'stamina', label: 'Stamina', category: 'Physical / Interior' },
  { key: 'potential', label: 'Potential', category: 'Growth' },
];

function normalizedLabel(label: UpgradePlayerLabel) {
  return String(label || '').trim().toUpperCase();
}

function numberFrom(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function gradeFromRating(value: number): NbaGrade {
  return gradeFromNumeric(value);
}

const GRADE_RATINGS: Record<NbaGrade, number> = {
  F: 25,
  'D-': 50,
  D: 53,
  'D+': 57,
  'C-': 60,
  C: 65,
  'C+': 70,
  'B-': 75,
  B: 80,
  'B+': 85,
  'A-': 89,
  A: 92,
  'A+': 95,
  S: 99,
};

function weightedGradeAverage(
  grades: Record<string, NbaGrade>,
  weights: Array<{ key: string; weight: number }>,
): NbaGrade {
  let total = 0;
  let weightTotal = 0;
  weights.forEach(({ key, weight }) => {
    const grade = grades[key];
    if (!grade) return;
    total += (GRADE_RATINGS[grade] ?? 65) * weight;
    weightTotal += weight;
  });
  return gradeFromRating(weightTotal > 0 ? total / weightTotal : 65);
}

export function upgradeGradesFromScoutingGrades(grades: Record<string, NbaGrade>): Record<string, NbaGrade> {
  return {
    shooting: weightedGradeAverage(grades, [
      { key: 'closeShot', weight: 18 },
      { key: 'midRange', weight: 16 },
      { key: 'threePoint', weight: 18 },
      { key: 'freeThrow', weight: 10 },
      { key: 'dunking', weight: 14 },
      { key: 'shotIq', weight: 24 },
    ]),
    playmaking: weightedGradeAverage(grades, [
      { key: 'passing', weight: 34 },
      { key: 'ballHandle', weight: 30 },
      { key: 'offenseIq', weight: 24 },
      { key: 'clutch', weight: 12 },
    ]),
    defense: weightedGradeAverage(grades, [
      { key: 'perimeterDefense', weight: 22 },
      { key: 'postDefense', weight: 18 },
      { key: 'blocking', weight: 14 },
      { key: 'steals', weight: 14 },
      { key: 'defenseIq', weight: 20 },
      { key: 'helpDefense', weight: 12 },
    ]),
    rebounding: weightedGradeAverage(grades, [
      { key: 'rebounding', weight: 74 },
      { key: 'strength', weight: 16 },
      { key: 'stamina', weight: 10 },
    ]),
    athleticism: weightedGradeAverage(grades, [
      { key: 'speed', weight: 24 },
      { key: 'acceleration', weight: 24 },
      { key: 'strength', weight: 18 },
      { key: 'dunking', weight: 18 },
      { key: 'stamina', weight: 16 },
    ]),
    basketballIq: weightedGradeAverage(grades, [
      { key: 'shotIq', weight: 25 },
      { key: 'offenseIq', weight: 25 },
      { key: 'defenseIq', weight: 25 },
      { key: 'helpDefense', weight: 15 },
      { key: 'clutch', weight: 10 },
    ]),
    consistency: weightedGradeAverage(grades, [
      { key: 'stamina', weight: 35 },
      { key: 'shotIq', weight: 25 },
      { key: 'clutch', weight: 20 },
      { key: 'offenseIq', weight: 20 },
    ]),
    chemistry: weightedGradeAverage(grades, [
      { key: 'offenseIq', weight: 30 },
      { key: 'defenseIq', weight: 30 },
      { key: 'passing', weight: 20 },
      { key: 'helpDefense', weight: 20 },
    ]),
  };
}

export function detailedUpgradeGradesFromScoutingGrades(grades: Record<string, NbaGrade>): Record<string, NbaGrade> {
  const detailed = UPGRADE_GRADE_OPTIONS.reduce<Record<string, NbaGrade>>((acc, option) => {
    const grade = grades[option.key];
    if (grade) acc[option.key] = grade;
    return acc;
  }, {});
  return Object.keys(detailed).length > 0 ? detailed : upgradeGradesFromScoutingGrades(grades);
}

export function abilityGradesFromStats(player: Record<string, unknown>): Record<string, NbaGrade> {
  const ppg = numberFrom(player.ppg);
  const apg = numberFrom(player.apg);
  const rpg = numberFrom(player.rpg);
  const spg = numberFrom(player.spg ?? player.stl);
  const bpg = numberFrom(player.bpg ?? player.blk);
  const fg3 = numberFrom(player.fg3_pct ?? player.three_pct);
  const gp = Math.max(1, numberFrom(player.gp));

  return {
    shooting: gradeFromRating(58 + Math.min(34, ppg * 1.2) + Math.min(8, fg3 * 20)),
    playmaking: gradeFromRating(56 + Math.min(36, apg * 4)),
    defense: gradeFromRating(58 + Math.min(34, (spg * 10) + (bpg * 7))),
    rebounding: gradeFromRating(55 + Math.min(38, rpg * 3)),
    athleticism: gradeFromRating(62 + Math.min(24, ppg * 0.5 + rpg * 0.8 + spg * 3)),
    basketballIq: gradeFromRating(60 + Math.min(32, gp * 0.25 + apg * 2 + ppg * 0.25)),
    consistency: gradeFromRating(60 + Math.min(30, gp * 0.3)),
    chemistry: gradeFromRating(65),
  };
}

export function awardUpgradePoints(input: AwardUpgradeInput): number {
  let total = Math.max(0, Number(input.championships || 0)) * AWARD_POINTS.championship;
  total += Math.max(0, Number(input.finalsRunnerUp || 0)) * AWARD_POINTS.finals_runner_up;
  Object.entries(input.awards || {}).forEach(([key, value]) => {
    const awardKey = key as keyof UpgradeAwards;
    total += Math.max(0, Number(value || 0)) * (AWARD_POINTS[awardKey] || 0);
  });
  return total;
}

export function teamLotteryBoostPoints(standings: StandingLike[]): Map<string, number> {
  const byConference = new Map<string, StandingLike[]>();
  standings.forEach((row) => {
    const conference = row.conference || 'League';
    byConference.set(conference, [...(byConference.get(conference) || []), row]);
  });

  const boosts = new Map<string, number>();
  byConference.forEach((rows) => {
    [...rows]
      .sort((a, b) => (
        a.wins - b.wins
        || (b.losses || 0) - (a.losses || 0)
        || a.teamId.localeCompare(b.teamId)
      ))
      .slice(0, 5)
      .forEach(row => boosts.set(row.teamId, 3));
  });
  return boosts;
}

export function seasonUpgradeGrants(input: SeasonUpgradeGrantInput): SeasonUpgradeGrant[] {
  const lotteryBoosts = teamLotteryBoostPoints(input.standings);
  const teamIds = new Set<string>([
    ...input.standings.map(row => row.teamId),
    ...Object.keys(input.awardLedger || {}),
  ]);

  return [...teamIds]
    .map((teamId) => {
      const awardPoints = awardUpgradePoints(input.awardLedger?.[teamId] || {});
      const lotteryBoostPoints = lotteryBoosts.get(teamId) || 0;
      return {
        teamId,
        awardPoints,
        lotteryBoostPoints,
        totalPoints: awardPoints + lotteryBoostPoints,
      };
    })
    .filter(grant => grant.totalPoints > 0)
    .sort((a, b) => b.totalPoints - a.totalPoints || a.teamId.localeCompare(b.teamId));
}

export function nextGrade(current: NbaGrade, playerLabel: UpgradePlayerLabel = ''): NbaGrade {
  const currentIndex = GRADE_LADDER.indexOf(current);
  if (currentIndex < 0) return current;
  const candidate = GRADE_LADDER[Math.min(currentIndex + 1, GRADE_LADDER.length - 1)];
  if (candidate === 'S' && !S_ELIGIBLE_LABELS.has(normalizedLabel(playerLabel))) {
    return current;
  }
  return candidate;
}

export function canUpgradePlayerThisSeason({
  label,
  upgradesUsedThisSeason,
}: {
  label: UpgradePlayerLabel;
  upgradesUsedThisSeason: number;
}): boolean {
  if (!LIMITED_LABELS.has(normalizedLabel(label))) return true;
  return Number(upgradesUsedThisSeason || 0) < 1;
}

export function spendUpgradePoint(input: SpendUpgradeInput): SpendUpgradeResult {
  const errors: string[] = [];
  if (input.teamPoints < 1) errors.push('insufficient_points');
  if (!canUpgradePlayerThisSeason({
    label: input.playerLabel,
    upgradesUsedThisSeason: input.upgradesUsedThisSeason,
  })) {
    errors.push('season_limit_reached');
  }
  const current = input.grades[input.ability];
  if (!current) errors.push('ability_missing');
  const upgraded = current ? nextGrade(current, input.playerLabel) : current;
  if (current && upgraded === current) errors.push('grade_maxed');

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      teamPoints: input.teamPoints,
      upgradesUsedThisSeason: input.upgradesUsedThisSeason,
      grades: { ...input.grades },
    };
  }

  return {
    valid: true,
    errors,
    teamPoints: input.teamPoints - 1,
    upgradesUsedThisSeason: input.upgradesUsedThisSeason + 1,
    grades: {
      ...input.grades,
      [input.ability]: upgraded,
    },
  };
}
