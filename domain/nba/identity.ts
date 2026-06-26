export type NbaGrade = 'S' | 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'D+' | 'D' | 'D-' | 'F';

export type NbaReputation = 'Prospect' | 'Role Player' | 'Starter' | 'Star' | 'Superstar' | 'Legend';

export type DevelopmentTrait = 'Raw' | 'Stable' | 'Rising' | 'Breakout' | 'Veteran';

export type HiddenIdentityValues = {
  shooting?: number;
  playmaking?: number;
  defense?: number;
  rebounding?: number;
  athleticism?: number;
  basketballIq?: number;
  consistency?: number;
  chemistry?: number;
  age?: number;
  seasonsPlayed?: number;
  accolades?: Record<string, number>;
};

export type VisibleNbaIdentity = {
  grades: Record<string, NbaGrade>;
  primaryRole: string;
  secondaryRole: string;
  strengths: string[];
  weaknesses: string[];
  consistency: NbaGrade;
  chemistry: NbaGrade;
  reputation: NbaReputation;
  developmentTrait: DevelopmentTrait;
};

const VALUE_LABELS: Record<string, string> = {
  shooting: 'Shooting',
  playmaking: 'Playmaking',
  defense: 'Defense',
  rebounding: 'Rebounding',
  athleticism: 'Athleticism',
  basketballIq: 'Basketball IQ',
};

const ROLE_BY_VALUE: Record<string, string> = {
  shooting: 'Shot Creator',
  playmaking: 'Floor General',
  defense: 'Stopper',
  rebounding: 'Glass Cleaner',
  athleticism: 'Slasher',
  basketballIq: 'Connector',
};

function clampValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(99, value));
}

export function gradeFromHiddenValue(value: number): NbaGrade {
  const rating = clampValue(value);
  if (rating >= 99) return 'S';
  if (rating >= 95) return 'A+';
  if (rating >= 92) return 'A';
  if (rating >= 89) return 'A-';
  if (rating >= 86) return 'B+';
  if (rating >= 83) return 'B';
  if (rating >= 80) return 'B-';
  if (rating >= 77) return 'C+';
  if (rating >= 74) return 'C';
  if (rating >= 71) return 'C-';
  if (rating >= 68) return 'D+';
  if (rating >= 65) return 'D';
  if (rating >= 60) return 'D-';
  return 'F';
}

function orderedValues(input: HiddenIdentityValues) {
  return Object.keys(VALUE_LABELS)
    .map(key => ({ key, label: VALUE_LABELS[key], value: clampValue(Number(input[key as keyof HiddenIdentityValues] || 0)) }))
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label));
}

function positiveCount(accolades: Record<string, number> | undefined, keys: string[]): number {
  return keys.reduce((total, key) => total + Math.max(0, Number(accolades?.[key] || 0)), 0);
}

export function reputationFromInputs(input: Pick<HiddenIdentityValues, 'accolades' | 'seasonsPlayed'>): NbaReputation {
  const accolades = input.accolades || {};
  const seasonsPlayed = Math.max(0, Number(input.seasonsPlayed || 0));
  const allLeagueLevel = positiveCount(accolades, ['all_nba_1st', 'all_nba_2nd', 'all_nba_3rd', 'all_star']);
  if (
    positiveCount(accolades, ['mvp']) >= 2
    || positiveCount(accolades, ['finals_mvp']) >= 2
    || positiveCount(accolades, ['championship']) >= 3
    || allLeagueLevel >= 8
  ) {
    return 'Legend';
  }
  if (positiveCount(accolades, ['mvp', 'finals_mvp', 'all_nba_1st']) > 0) {
    return 'Superstar';
  }
  if (positiveCount(accolades, ['all_nba_2nd', 'all_nba_3rd', 'all_star', 'dpoy']) > 0) {
    return 'Star';
  }
  if (seasonsPlayed >= 5) return 'Starter';
  if (seasonsPlayed >= 2) return 'Role Player';
  return 'Prospect';
}

function developmentTrait(input: HiddenIdentityValues): DevelopmentTrait {
  const age = Number(input.age || 0);
  const consistency = clampValue(input.consistency || 0);
  if (age > 0 && age <= 23 && consistency >= 82) return 'Breakout';
  if (age > 0 && age <= 25) return 'Rising';
  if (age >= 32) return 'Veteran';
  if (consistency < 55) return 'Raw';
  return 'Stable';
}

export function buildVisibleIdentity(input: HiddenIdentityValues): VisibleNbaIdentity {
  const values = orderedValues(input);
  const grades = values.reduce<Record<string, NbaGrade>>((acc, item) => {
    acc[item.key] = gradeFromHiddenValue(item.value);
    return acc;
  }, {});
  const primary = values[0];
  const secondary = values.find(item => item.key !== primary?.key) || primary;

  return {
    grades,
    primaryRole: ROLE_BY_VALUE[primary?.key || 'basketballIq'],
    secondaryRole: ROLE_BY_VALUE[secondary?.key || 'basketballIq'],
    strengths: values.filter(item => item.value >= 80).slice(0, 3).map(item => item.label),
    weaknesses: [...values].reverse().filter(item => item.value > 0 && item.value < 60).slice(0, 3).map(item => item.label),
    consistency: gradeFromHiddenValue(input.consistency || 0),
    chemistry: gradeFromHiddenValue(input.chemistry || 0),
    reputation: reputationFromInputs({ accolades: input.accolades, seasonsPlayed: input.seasonsPlayed }),
    developmentTrait: developmentTrait(input),
  };
}
