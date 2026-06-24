import { createSeededRandom, randomInt, randomPick } from './random';

export const NFL_DRAFT_POSITIONS = Object.freeze([
  'QB', 'HB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT',
  'EDGE', 'DT', 'MLB', 'CB', 'FS', 'SS', 'K', 'P',
]);

export const MLB_DRAFT_POSITIONS = Object.freeze([
  'SP', 'RP', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF',
]);

const FIRST_NAMES = Object.freeze([
  'Aiden', 'Andre', 'Caleb', 'Cameron', 'Darius', 'Devin', 'Elias', 'Evan',
  'Isaiah', 'Jalen', 'Jordan', 'Julian', 'Malik', 'Marcus', 'Miles', 'Noah',
  'Owen', 'Roman', 'Theo', 'Tyler', 'Victor', 'Xavier',
]);

const LAST_NAMES = Object.freeze([
  'Adams', 'Bennett', 'Brooks', 'Carter', 'Collins', 'Davis', 'Foster',
  'Garcia', 'Grant', 'Hayes', 'Jackson', 'Johnson', 'King', 'Lewis',
  'Martinez', 'Miller', 'Mitchell', 'Morgan', 'Parker', 'Reed', 'Rivera',
  'Robinson', 'Scott', 'Taylor', 'Thomas', 'Walker', 'Williams', 'Young',
]);

const NFL_ARCHETYPES: Record<string, readonly string[]> = {
  QB: ['Field General', 'Improviser', 'Strong Arm', 'Scrambler'],
  HB: ['Elusive Back', 'Power Back', 'Receiving Back'],
  WR: ['Deep Threat', 'Route Runner', 'Physical Receiver', 'Slot Target'],
  TE: ['Vertical Threat', 'Possession Target', 'Blocking Tight End'],
  EDGE: ['Speed Rusher', 'Power Rusher', 'Run Stopper'],
  DT: ['Power Rusher', 'Run Stopper', 'Interior Disruptor'],
  CB: ['Man Cover', 'Zone Cover', 'Slot Corner'],
  FS: ['Zone Safety', 'Hybrid Safety', 'Ball Hawk'],
  SS: ['Run Support', 'Hybrid Safety', 'Enforcer'],
  K: ['Power Kicker', 'Accurate Kicker'],
  P: ['Power Punter', 'Accurate Punter'],
};

const MLB_ARCHETYPES: Record<string, readonly string[]> = {
  SP: ['Power Starter', 'Control Artist', 'Breaking Ball Specialist'],
  RP: ['Power Reliever', 'Ground Ball Reliever', 'Setup Specialist'],
  C: ['Defensive Catcher', 'Power Catcher', 'Contact Catcher'],
  '1B': ['Power Bat', 'Contact Bat', 'Run Producer'],
  '2B': ['Contact Bat', 'Speed Threat', 'Glove First'],
  '3B': ['Power Bat', 'Two-Way Corner', 'Run Producer'],
  SS: ['Five-Tool Shortstop', 'Glove First', 'Speed Threat'],
  LF: ['Power Bat', 'Contact Bat', 'Corner Outfielder'],
  CF: ['Five-Tool Outfielder', 'Speed Threat', 'Glove First'],
  RF: ['Power Bat', 'Strong Arm Outfielder', 'Run Producer'],
};

type GenerateDraftClassInput = {
  sport: string;
  teams: number;
  seed: string;
};

export type NflDraftProspect = ReturnType<typeof nflProspect>;
export type MlbDraftProspect = ReturnType<typeof mlbProspect>;

function positionArchetype(
  position: string,
  sport: 'madden' | 'mlb',
  random: () => number,
): string {
  const map = sport === 'madden' ? NFL_ARCHETYPES : MLB_ARCHETYPES;
  const fallback = sport === 'madden'
    ? ['Balanced', 'Athletic', 'Technician']
    : ['Balanced', 'Contact First', 'Defensive Specialist'];
  return randomPick(random, map[position] || fallback);
}

function rating(random: () => number, round: number, floor: number): number {
  const ceiling = Math.max(floor, 96 - round * 3);
  return randomInt(random, floor, ceiling);
}

function identity(random: () => number, index: number, seed: string) {
  const first = randomPick(random, FIRST_NAMES);
  const last = randomPick(random, LAST_NAMES);
  return {
    id: `${seed.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${index + 1}`,
    name: `${first} ${last}`,
    full_name: `${first} ${last}`,
  };
}

function nflProspect(random: () => number, index: number, seed: string, teams = 32) {
  const position = randomPick(random, NFL_DRAFT_POSITIONS);
  const projectedRound = Math.min(7, Math.floor(index / teams) + 1);
  const profile = identity(random, index, seed);
  const heightInches = position === 'QB' || position === 'TE'
    ? randomInt(random, 73, 80)
    : position === 'HB' || position === 'CB'
      ? randomInt(random, 66, 74)
      : randomInt(random, 69, 81);
  const weight = ['LT', 'LG', 'C', 'RG', 'RT', 'DT'].includes(position)
    ? randomInt(random, 285, 380)
    : ['WR', 'CB', 'FS', 'SS'].includes(position)
      ? randomInt(random, 165, 225)
      : randomInt(random, 195, 285);
  const feet = Math.floor(heightInches / 12);
  const inches = heightInches % 12;
  const archetype = positionArchetype(position, 'madden', random);
  const developmentRoll = random();
  const developmentTrait = developmentRoll > 0.97
    ? 'x_factor'
    : developmentRoll > 0.88
      ? 'superstar'
      : developmentRoll > 0.68
        ? 'star'
        : 'normal';
  return {
    ...profile,
    player_id: profile.id,
    sport: 'madden' as const,
    position,
    age: randomInt(random, 20, 24),
    heightInches,
    height: `${feet}'${inches}"`,
    weight,
    archetype,
    projectedRound,
    ratings: {
      athleticism: rating(random, projectedRound, 45),
      awareness: rating(random, projectedRound, 40),
      technique: rating(random, projectedRound, 42),
      strength: rating(random, projectedRound, 45),
      speed: rating(random, projectedRound, 45),
    },
    developmentTrait,
    summary: `${profile.name} is a ${archetype.toLowerCase()} ${position} prospect with developmental upside and a projected round ${projectedRound} grade.`,
  };
}

function mlbProspect(random: () => number, index: number, seed: string, teams = 30) {
  const position = randomPick(random, MLB_DRAFT_POSITIONS);
  const projectedRound = Math.min(5, Math.floor(index / teams) + 1);
  const profile = identity(random, index, seed);
  const archetype = positionArchetype(position, 'mlb', random);
  return {
    ...profile,
    player_id: profile.id,
    sport: 'mlb' as const,
    position,
    age: randomInt(random, 18, 23),
    handedness: randomPick(random, ['R', 'R', 'R', 'L', 'S'] as const),
    archetype,
    projectedRound,
    ratings: {
      contact: rating(random, projectedRound, 35),
      power: rating(random, projectedRound, 35),
      fielding: rating(random, projectedRound, 38),
      speed: rating(random, projectedRound, 35),
      arm: rating(random, projectedRound, 38),
      discipline: rating(random, projectedRound, 35),
    },
    potential: randomInt(random, Math.max(55, 82 - projectedRound * 4), 99),
    summary: `${profile.name} is a ${archetype.toLowerCase()} ${position} prospect with a round ${projectedRound} projection and meaningful long-term upside.`,
  };
}

export function generateDraftClass(
  input: GenerateDraftClassInput & { sport: 'madden' | 'nfl' },
): NflDraftProspect[];
export function generateDraftClass(
  input: GenerateDraftClassInput & { sport: 'mlb' },
): MlbDraftProspect[];
export function generateDraftClass(
  input: GenerateDraftClassInput,
): NflDraftProspect[] | MlbDraftProspect[];
export function generateDraftClass(input: GenerateDraftClassInput) {
  if (!Number.isInteger(input.teams) || input.teams <= 0) {
    throw new Error('teams must be a positive integer');
  }
  if (!input.seed) throw new Error('seed is required');
  const sport = input.sport === 'nfl' ? 'madden' : input.sport;
  if (sport !== 'madden' && sport !== 'mlb') {
    throw new Error('Draft class generation supports only Madden/NFL and MLB');
  }
  const rounds = sport === 'madden' ? 7 : 5;
  const random = createSeededRandom(`${sport}:${input.seed}`);
  return Array.from({ length: input.teams * rounds }, (_, index) => (
    sport === 'madden'
      ? nflProspect(random, index, input.seed, input.teams)
      : mlbProspect(random, index, input.seed, input.teams)
  ));
}
