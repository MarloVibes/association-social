import { buildVisibleIdentity, type VisibleNbaIdentity } from './identity';

export type DraftVaultPick = {
  pick: number;
  round: number;
  draftedBy: string;
  rightsTeam: string;
  name: string;
  school: string;
  tradeNote?: string;
  position?: string;
  height?: string;
  weight?: string;
  birthDate?: string;
  headshotUrl?: string;
  archetype?: string;
};

export type DraftVaultInput = {
  year: number;
  era: string;
  source: string;
  sourceUpdatedAt?: string;
  pick: DraftVaultPick;
};

export type DraftVaultDoc = {
  bref_id: string;
  full_name: string;
  first_name: string;
  last_name: string;
  position: string;
  height: string;
  weight: string;
  birth_date: string;
  jersey_number: string;
  draft_year: number;
  draft_pick: number;
  draft_round: number;
  drafted_by: string;
  rights_team: string;
  team: string;
  college: string;
  trade_note: string;
  accolades: unknown[];
  seasons: unknown[];
  eras: string[];
  is_custom: false;
  no_profile: true;
  draft_source: true;
  photo?: string;
  headshot_url?: string;
  archetype?: string;
  projectedOverall: number;
  projectedRound: number;
  source: string;
  sourceUpdatedAt?: string;
  identity: VisibleNbaIdentity;
  visibleIdentity: VisibleNbaIdentity;
  grades: VisibleNbaIdentity['grades'];
  playerLabel: string;
  developmentTrait: VisibleNbaIdentity['developmentTrait'];
};

function slugName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function splitName(name: string) {
  const parts = name.trim().split(/\s+/);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
  };
}

const PROSPECT_POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];

function inferredPosition(pick: DraftVaultPick) {
  if (pick.position) return pick.position;
  const index = Math.max(0, Number(pick.pick || 1) - 1);
  return PROSPECT_POSITIONS[index % PROSPECT_POSITIONS.length];
}

function pickTierValue(pick: number, round: number) {
  const slot = Math.max(1, Number(pick || 60));
  const roundPenalty = Math.max(0, Number(round || 1) - 1) * 9;
  return Math.max(54, Math.min(88, 88 - Math.floor((slot - 1) / 4) * 2 - roundPenalty));
}

export function buildDraftProspectIdentity(pick: DraftVaultPick): VisibleNbaIdentity {
  const position = inferredPosition(pick);
  const base = pickTierValue(pick.pick, pick.round);
  const guard = position === 'PG' || position === 'SG';
  const wing = position === 'SF';
  const big = position === 'PF' || position === 'C';
  return buildVisibleIdentity({
    shooting: base + (guard || wing ? 2 : -3),
    playmaking: base + (position === 'PG' ? 4 : guard ? 1 : -4),
    defense: base + (wing || big ? 2 : -1),
    rebounding: base + (big ? 4 : wing ? 1 : -5),
    athleticism: base + 1,
    basketballIq: base,
    consistency: Math.max(50, base - 7),
    chemistry: Math.max(54, base - 4),
    potential: Math.min(99, base + 8),
    age: 19,
    seasonsPlayed: 0,
  });
}

export function buildDraftPlayerId(name: string, pick: number, year: number) {
  return `draft_${year}_${pick}_${slugName(name)}`;
}

export function buildDraftVaultDoc(input: DraftVaultInput): DraftVaultDoc {
  const names = splitName(input.pick.name);
  const visibleIdentity = buildDraftProspectIdentity(input.pick);
  return {
    bref_id: buildDraftPlayerId(input.pick.name, input.pick.pick, input.year),
    full_name: input.pick.name,
    first_name: names.firstName,
    last_name: names.lastName,
    position: inferredPosition(input.pick),
    height: input.pick.height || '',
    weight: input.pick.weight || '',
    birth_date: input.pick.birthDate || '',
    jersey_number: '',
    draft_year: input.year,
    draft_pick: input.pick.pick,
    draft_round: input.pick.round,
    drafted_by: input.pick.draftedBy,
    rights_team: input.pick.rightsTeam,
    team: input.pick.rightsTeam,
    college: input.pick.school,
    trade_note: input.pick.tradeNote || '',
    accolades: [],
    seasons: [],
    eras: [input.era],
    is_custom: false,
    no_profile: true,
    draft_source: true,
    photo: input.pick.headshotUrl || undefined,
    headshot_url: input.pick.headshotUrl || undefined,
    archetype: input.pick.archetype || undefined,
    projectedOverall: input.pick.pick,
    projectedRound: input.pick.round,
    source: input.source,
    sourceUpdatedAt: input.sourceUpdatedAt,
    identity: visibleIdentity,
    visibleIdentity,
    grades: visibleIdentity.grades,
    playerLabel: visibleIdentity.reputation.toUpperCase(),
    developmentTrait: visibleIdentity.developmentTrait,
  };
}
