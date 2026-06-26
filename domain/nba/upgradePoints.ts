import type { NbaGrade } from './identity';

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

const GRADE_LADDER: NbaGrade[] = ['F', 'D', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+', 'S'];
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

function normalizedLabel(label: UpgradePlayerLabel) {
  return String(label || '').trim().toUpperCase();
}

function numberFrom(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function gradeFromRating(value: number): NbaGrade {
  const rating = Math.max(25, Math.min(99, Math.round(value)));
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
