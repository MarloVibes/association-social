import { gradeFromNumeric } from './gradeScale';

export type NbaGrade = 'S' | 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'D+' | 'D' | 'D-' | 'F';

export type NbaReputation = 'Prospect' | 'Role Player' | 'Starter' | 'Star' | 'Superstar' | 'Legend';

export type DevelopmentTrait = 'Raw' | 'Stable' | 'Rising' | 'Breakout' | 'Veteran';

export type NbaPlayerTier =
  | 'Legend'
  | 'Superstar'
  | 'Star'
  | 'High-Impact Contributor'
  | 'Valuable Rotation Player'
  | 'Specialist / Depth Piece'
  | 'Prospect';

export function normalizeNbaTierLabel(label: unknown): NbaPlayerTier | null {
  if (label === 'Legend') return 'Legend';
  if (label === 'Superstar') return 'Superstar';
  if (label === 'Star') return 'Star';
  if (label === 'High-Impact Contributor') return 'High-Impact Contributor';
  if (label === 'Valuable Rotation Player') return 'Valuable Rotation Player';
  if (label === 'Specialist / Depth Piece' || label === 'Depth Piece' || label === 'ROLE PLAYER' || label === 'Role Player') return 'Specialist / Depth Piece';
  if (label === 'STARTER' || label === 'Starter') return 'Valuable Rotation Player';
  if (label === 'Prospect') return 'Prospect';
  return null;
}

export type NbaArchetype =
  | '3-and-D Wing'
  | 'Perimeter Defender'
  | 'Stretch Big'
  | 'Floor-Spacing Big'
  | 'Rim Protector'
  | 'Defensive Anchor'
  | 'Primary Creator'
  | 'Ball-Dominant Scorer'
  | 'Floor General'
  | 'Facilitator'
  | 'Off-Ball Scorer'
  | 'Spot-Up Shooter'
  | 'Catch-and-Shoot Specialist'
  | 'Versatile Connector'
  | 'Glue Guy'
  | 'Athletic Finisher'
  | 'Roll Big'
  | 'Bench Energizer'
  | 'Microwave Scorer'
  | 'Traditional Post Big'
  | 'Mid-Range Technician';

export type NbaDevelopmentOutlook = 'Raw' | 'Rising' | 'Breakout' | 'Near Peak' | 'Limited Growth' | 'Declining';

export type NbaPotentialLabel =
  | 'Legend Upside'
  | 'Superstar Upside'
  | 'Star Upside'
  | 'High-Impact Upside'
  | 'Rotation Upside'
  | 'Depth Upside'
  | 'Near Peak';

export type HiddenIdentityValues = {
  position?: string;
  shooting?: number;
  playmaking?: number;
  defense?: number;
  rebounding?: number;
  athleticism?: number;
  basketballIq?: number;
  consistency?: number;
  chemistry?: number;
  confidence?: number;
  potential?: number;
  closeShot?: number;
  midRange?: number;
  threePoint?: number;
  freeThrow?: number;
  dunking?: number;
  shotIq?: number;
  passing?: number;
  ballHandle?: number;
  offenseIq?: number;
  clutch?: number;
  perimeterDefense?: number;
  postDefense?: number;
  blocking?: number;
  steals?: number;
  defenseIq?: number;
  helpDefense?: number;
  speed?: number;
  acceleration?: number;
  strength?: number;
  postOffense?: number;
  stamina?: number;
  age?: number;
  seasonsPlayed?: number;
  accolades?: Record<string, number>;
  pointsPerGame?: number;
  reboundsPerGame?: number;
  assistsPerGame?: number;
  minutesPerGame?: number;
  winShares?: number;
  usagePct?: number;
  reputationScore?: number;
  legacyProtected?: boolean;
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
  tier: NbaPlayerTier;
  archetypes: NbaArchetype[];
  developmentTag?: 'Prospect';
  developmentOutlook: NbaDevelopmentOutlook;
  potentialLabel: NbaPotentialLabel;
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
  return gradeFromNumeric(value);
}

function orderedValues(input: HiddenIdentityValues) {
  return Object.keys(VALUE_LABELS)
    .map(key => ({ key, label: VALUE_LABELS[key], value: clampValue(Number(input[key as keyof HiddenIdentityValues] || 0)) }))
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label));
}

function positiveCount(accolades: Record<string, number> | undefined, keys: string[]): number {
  return keys.reduce((total, key) => total + Math.max(0, Number(accolades?.[key] || 0)), 0);
}

function basicImpact(input: HiddenIdentityValues) {
  const points = Math.max(0, Number(input.pointsPerGame || 0));
  const rebounds = Math.max(0, Number(input.reboundsPerGame || 0));
  const assists = Math.max(0, Number(input.assistsPerGame || 0));
  const minutes = Math.max(0, Number(input.minutesPerGame || 0));
  const winShares = Math.max(0, Number(input.winShares || 0));
  const usage = Math.max(0, Number(input.usagePct || 0));
  const reputationScore = Math.max(0, Number(input.reputationScore || 0));
  const values = orderedValues(input).map(item => item.value).filter(value => value > 0);
  const topSkill = values[0] || 0;
  const topThreeAverage = values.slice(0, 3).reduce((total, value) => total + value, 0) / Math.max(1, Math.min(3, values.length));
  const production = points + rebounds + assists;
  const impactScore = Math.max(
    reputationScore,
    points * 1.2
      + rebounds * 0.55
      + assists * 0.85
      + Math.max(0, minutes - 18) * 0.5
      + winShares * 1.7
      + Math.max(0, usage - 18) * 0.45,
  );

  return {
    points,
    rebounds,
    assists,
    minutes,
    winShares,
    usage,
    reputationScore,
    production,
    topSkill,
    topThreeAverage,
    impactScore,
  };
}

function currentTier(input: HiddenIdentityValues): NbaPlayerTier {
  const accolades = input.accolades || {};
  const seasonsPlayed = Math.max(0, Number(input.seasonsPlayed || 0));
  const age = Math.max(0, Number(input.age || 0));
  const allLeagueLevel = positiveCount(accolades, ['all_nba_1st', 'all_nba_2nd', 'all_nba_3rd', 'all_star']);
  const accoladeCount = positiveCount(accolades, ['mvp', 'finals_mvp', 'championship', 'all_nba_1st', 'all_nba_2nd', 'all_nba_3rd', 'all_star', 'dpoy']);
  const {
    points,
    production,
    minutes,
    winShares,
    usage,
    reputationScore,
    topSkill,
    topThreeAverage,
    impactScore,
  } = basicImpact(input);
  const nonLegacyLateCareer = age >= 37 && !input.legacyProtected;

  if (accoladeCount === 0 && seasonsPlayed <= 0 && minutes < 5 && production < 5 && winShares <= 0) {
    return 'Prospect';
  }
  if (
    input.legacyProtected
    && (
      positiveCount(accolades, ['mvp']) >= 2
      || positiveCount(accolades, ['finals_mvp']) >= 2
      || positiveCount(accolades, ['championship']) >= 3
      || allLeagueLevel >= 8
    )
  ) {
    return 'Legend';
  }
  if (
    reputationScore >= 92
    || (positiveCount(accolades, ['mvp', 'finals_mvp', 'all_nba_1st']) > 0 && production >= 28 && minutes >= 30)
    || (points >= 27 && production >= 36 && winShares >= 9)
    || (topSkill >= 94 && topThreeAverage >= 88 && production >= 34 && winShares >= 8)
  ) {
    return nonLegacyLateCareer ? 'Star' : 'Superstar';
  }
  if (
    reputationScore >= 76
    || (positiveCount(accolades, ['all_nba_2nd', 'all_nba_3rd', 'all_star', 'dpoy']) > 0 && production >= 22)
    || (points >= 21 && production >= 29 && winShares >= 6)
    || (points >= 19 && usage >= 27 && winShares >= 5)
    || (topThreeAverage >= 84 && production >= 25 && minutes >= 30)
  ) {
    return nonLegacyLateCareer ? 'High-Impact Contributor' : 'Star';
  }
  if (
    impactScore >= 48
    || (minutes >= 30 && (production >= 22 || winShares >= 6))
    || (winShares >= 5.5 && minutes >= 24 && production >= 18)
    || (winShares >= 5.5 && minutes >= 24 && topThreeAverage >= 84 && (input.defense || 0) >= 82)
    || (topThreeAverage >= 82 && production >= 22 && minutes >= 26)
  ) {
    return 'High-Impact Contributor';
  }
  if (
    minutes >= 24
    || winShares >= 3
    || production >= 14
    || (topSkill >= 84 && production >= 10 && minutes >= 18)
  ) {
    return 'Valuable Rotation Player';
  }
  if (seasonsPlayed <= 2 || (age > 0 && age <= 23)) return 'Prospect';
  return 'Specialist / Depth Piece';
}

function addArchetype(archetypes: NbaArchetype[], archetype: NbaArchetype) {
  if (!archetypes.includes(archetype)) archetypes.push(archetype);
}

function normalizedPosition(input: HiddenIdentityValues): string {
  return String(input.position || '').toUpperCase().trim();
}

function isBigPosition(input: HiddenIdentityValues): boolean {
  const position = normalizedPosition(input);
  if (/\b(C|PF)\b/.test(position) || position.includes('CENTER') || position.includes('POWER FORWARD')) return true;
  if (position.includes('F-C') || position.includes('C-F') || position.includes('BIG')) return true;

  const hasNoPosition = !position;
  const rebounding = clampValue(Number(input.rebounding || 0));
  const blocking = clampValue(Number(input.blocking || 0));
  const postDefense = clampValue(Number(input.postDefense || 0));
  return hasNoPosition && rebounding >= 76 && blocking >= 76 && postDefense >= 72;
}

function isWingPosition(input: HiddenIdentityValues): boolean {
  const position = normalizedPosition(input);
  if (!position) return true;
  if (position.includes('PG') || position === 'G') return false;
  return position.includes('SG') || position.includes('SF') || position === 'F' || position.includes('WING');
}

function playerArchetypes(input: HiddenIdentityValues): NbaArchetype[] {
  const archetypes: NbaArchetype[] = [];
  const bigPosition = isBigPosition(input);
  const wingPosition = isWingPosition(input);
  const shooting = Math.max(clampValue(Number(input.shooting || 0)), clampValue(Number(input.threePoint || 0)));
  const defense = clampValue(Number(input.defense || 0));
  const perimeterDefense = clampValue(Number(input.perimeterDefense || 0));
  const blocking = clampValue(Number(input.blocking || 0));
  const steals = clampValue(Number(input.steals || 0));
  const playmaking = Math.max(clampValue(Number(input.playmaking || 0)), clampValue(Number(input.passing || 0)), clampValue(Number(input.ballHandle || 0)));
  const athleticism = Math.max(clampValue(Number(input.athleticism || 0)), clampValue(Number(input.dunking || 0)), clampValue(Number(input.speed || 0)));
  const rebounding = clampValue(Number(input.rebounding || 0));
  const postOffense = clampValue(Number(input.postOffense || 0));
  const midRange = clampValue(Number(input.midRange || 0));
  const basketballIq = clampValue(Number(input.basketballIq || 0));
  const points = Math.max(0, Number(input.pointsPerGame || 0));
  const assists = Math.max(0, Number(input.assistsPerGame || 0));
  const minutes = Math.max(0, Number(input.minutesPerGame || 0));
  const usage = Math.max(0, Number(input.usagePct || 0));

  if (wingPosition && usage < 28 && shooting >= 78 && (perimeterDefense >= 74 || defense >= 74 || steals >= 70)) addArchetype(archetypes, '3-and-D Wing');
  if (perimeterDefense >= 84 || (!bigPosition && defense >= 84)) addArchetype(archetypes, 'Perimeter Defender');
  if (bigPosition && blocking >= 86 && defense >= 80) addArchetype(archetypes, 'Defensive Anchor');
  if (bigPosition && (blocking >= 82 || (defense >= 82 && rebounding >= 80))) addArchetype(archetypes, 'Rim Protector');
  if (bigPosition && shooting >= 84 && rebounding >= 72 && blocking >= 65) addArchetype(archetypes, 'Stretch Big');
  if (bigPosition && shooting >= 80 && rebounding >= 68) addArchetype(archetypes, 'Floor-Spacing Big');
  if ((playmaking >= 86 && assists >= 5.5) || (usage >= 28 && points >= 22 && playmaking >= 80)) addArchetype(archetypes, 'Primary Creator');
  if (athleticism >= 84) addArchetype(archetypes, 'Athletic Finisher');
  if (usage >= 28 && points >= 20) addArchetype(archetypes, 'Ball-Dominant Scorer');
  if (assists >= 6.5 && basketballIq >= 78) addArchetype(archetypes, 'Floor General');
  if (assists >= 4.5 && playmaking >= 76) addArchetype(archetypes, 'Facilitator');
  if (shooting >= 86 && usage < 24) addArchetype(archetypes, 'Catch-and-Shoot Specialist');
  if (shooting >= 80 && usage < 22) addArchetype(archetypes, 'Spot-Up Shooter');
  if (shooting >= 78 && points >= 14 && usage < 24) addArchetype(archetypes, 'Off-Ball Scorer');
  if (basketballIq >= 82 && defense >= 70 && playmaking >= 68) addArchetype(archetypes, 'Versatile Connector');
  if (basketballIq >= 78 && defense >= 74 && minutes >= 22) addArchetype(archetypes, 'Glue Guy');
  if (bigPosition && rebounding >= 78 && athleticism >= 72 && usage < 22) addArchetype(archetypes, 'Roll Big');
  if (minutes < 24 && points >= 8 && athleticism >= 72) addArchetype(archetypes, 'Bench Energizer');
  if (usage >= 24 && minutes < 28 && points >= 10) addArchetype(archetypes, 'Microwave Scorer');
  if (bigPosition && postOffense >= 82 && shooting < 80) addArchetype(archetypes, 'Traditional Post Big');
  if (midRange >= 84 && shooting < 88) addArchetype(archetypes, 'Mid-Range Technician');

  if (archetypes.length === 0) {
    if (playmaking >= defense && playmaking >= shooting) addArchetype(archetypes, 'Facilitator');
    else if (defense >= shooting) addArchetype(archetypes, 'Glue Guy');
    else addArchetype(archetypes, 'Spot-Up Shooter');
  }

  return archetypes.slice(0, 2);
}

function developmentTag(input: HiddenIdentityValues): 'Prospect' | undefined {
  const age = Math.max(0, Number(input.age || 0));
  const seasonsPlayed = Math.max(0, Number(input.seasonsPlayed || 0));
  if ((age > 0 && age <= 23) || seasonsPlayed <= 2) return 'Prospect';
  return undefined;
}

function potentialLabel(input: HiddenIdentityValues): NbaPotentialLabel {
  const potential = clampValue(Number(input.potential || 0));
  if (potential >= 96) return 'Legend Upside';
  if (potential >= 92) return 'Superstar Upside';
  if (potential >= 86) return 'Star Upside';
  if (potential >= 80) return 'High-Impact Upside';
  if (potential >= 72) return 'Rotation Upside';
  if (potential > 0) return 'Depth Upside';
  return 'Near Peak';
}

function developmentOutlook(input: HiddenIdentityValues): NbaDevelopmentOutlook {
  const age = Math.max(0, Number(input.age || 0));
  const potential = clampValue(Number(input.potential || 0));
  const consistency = clampValue(Number(input.consistency || 0));
  if (age >= 34) return 'Declining';
  if (age >= 27 && potential < 88) return 'Near Peak';
  if (age >= 24 && potential < 80) return 'Limited Growth';
  if (age > 0 && age <= 23 && potential >= 86) return 'Rising';
  if (age > 0 && age <= 24 && consistency >= 82) return 'Breakout';
  if (potential > 0 && potential < 70) return 'Limited Growth';
  return potential >= 84 ? 'Rising' : 'Near Peak';
}

export function classifyNbaPlayer(input: HiddenIdentityValues) {
  return {
    tier: currentTier(input),
    archetypes: playerArchetypes(input),
    developmentTag: developmentTag(input),
    developmentOutlook: developmentOutlook(input),
    potentialLabel: potentialLabel(input),
  };
}

export type NbaClassificationFilter = {
  tier?: NbaPlayerTier | 'ALL' | '';
  archetype?: NbaArchetype | 'ALL' | '';
};

export function matchesNbaClassificationFilter(
  identity: Pick<VisibleNbaIdentity, 'tier' | 'archetypes'> | null | undefined,
  filter: NbaClassificationFilter,
): boolean {
  if (!identity) return false;
  const tier = filter.tier && filter.tier !== 'ALL' ? filter.tier : null;
  const archetype = filter.archetype && filter.archetype !== 'ALL' ? filter.archetype : null;
  if (tier && identity.tier !== tier) return false;
  if (archetype && !identity.archetypes?.includes(archetype)) return false;
  return true;
}

export function reputationFromInputs(input: HiddenIdentityValues): NbaReputation {
  const accolades = input.accolades || {};
  const seasonsPlayed = Math.max(0, Number(input.seasonsPlayed || 0));
  const allLeagueLevel = positiveCount(accolades, ['all_nba_1st', 'all_nba_2nd', 'all_nba_3rd', 'all_star']);
  const points = Math.max(0, Number(input.pointsPerGame || 0));
  const rebounds = Math.max(0, Number(input.reboundsPerGame || 0));
  const assists = Math.max(0, Number(input.assistsPerGame || 0));
  const production = points + rebounds + assists;
  const winShares = Math.max(0, Number(input.winShares || 0));
  const minutes = Math.max(0, Number(input.minutesPerGame || 0));
  const usage = Math.max(0, Number(input.usagePct || 0));
  const reputationScore = Math.max(0, Number(input.reputationScore || 0));
  const values = orderedValues(input).map(item => item.value).filter(value => value > 0);
  const topSkill = values[0] || 0;
  const topThreeAverage = values.slice(0, 3).reduce((total, value) => total + value, 0) / Math.max(1, Math.min(3, values.length));
  const age = Math.max(0, Number(input.age || 0));
  const nonLegacyLateCareer = age >= 37 && !input.legacyProtected;

  const accoladeCount = positiveCount(accolades, ['mvp', 'finals_mvp', 'championship', 'all_nba_1st', 'all_nba_2nd', 'all_nba_3rd', 'all_star', 'dpoy']);
  if (accoladeCount === 0 && seasonsPlayed <= 0 && minutes < 5 && production < 5 && winShares <= 0) {
    return 'Prospect';
  }
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
  if (
    reputationScore >= 92
    || (points >= 30 && production >= 40 && winShares >= 12)
    || (topSkill >= 95 && topThreeAverage >= 90 && production >= 36 && winShares >= 10)
  ) {
    return 'Superstar';
  }
  if (nonLegacyLateCareer) {
    if ((minutes >= 26 && production >= 18) || winShares >= 5) return 'Starter';
    if (production >= 12 || minutes >= 20) return 'Role Player';
    return 'Prospect';
  }
  if (positiveCount(accolades, ['all_nba_2nd', 'all_nba_3rd', 'all_star', 'dpoy']) > 0) {
    return 'Star';
  }
  if (
    reputationScore >= 76
    || (points >= 23 && production >= 30 && winShares >= 7)
    || (production >= 34 && winShares >= 8)
    || (points >= 20 && usage >= 27 && winShares >= 6)
    || (topSkill >= 90 && topThreeAverage >= 84 && production >= 25)
  ) {
    return 'Star';
  }
  if (seasonsPlayed <= 1) {
    if ((minutes >= 28 && production >= 20) || winShares >= 5) return 'Starter';
    if (production >= 14 || minutes >= 25) return 'Role Player';
    return 'Prospect';
  }
  if (
    (minutes >= 28 && (production >= 18 || winShares >= 4))
    || winShares >= 5
    || (topThreeAverage >= 80 && seasonsPlayed >= 2)
    || (topSkill >= 86 && production >= 16)
  ) {
    return 'Starter';
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
  const classification = classifyNbaPlayer(input);

  return {
    grades,
    primaryRole: ROLE_BY_VALUE[primary?.key || 'basketballIq'],
    secondaryRole: ROLE_BY_VALUE[secondary?.key || 'basketballIq'],
    strengths: values.filter(item => item.value >= 80).slice(0, 3).map(item => item.label),
    weaknesses: [...values].reverse().filter(item => item.value > 0 && item.value < 60).slice(0, 3).map(item => item.label),
    consistency: gradeFromHiddenValue(input.consistency || 0),
    chemistry: gradeFromHiddenValue(input.chemistry || 0),
    reputation: reputationFromInputs(input),
    developmentTrait: developmentTrait(input),
    ...classification,
  };
}
