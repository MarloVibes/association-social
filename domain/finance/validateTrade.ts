export type TradeValidationError =
  | 'ownership'
  | 'roster_limit'
  | 'financial_limit'
  | 'nba_matching';

type TradeAsset = {
  id?: string;
  player_id?: string;
  bref_id?: string;
  full_name?: string;
  salary?: number;
};

type TradeTeam = {
  players?: TradeAsset[];
  picks?: TradeAsset[];
};

export type ValidateTradeInput = {
  sport?: string | null;
  teamA: TradeTeam;
  teamB: TradeTeam;
  offerA?: TradeAsset[];
  offerB?: TradeAsset[];
  pickOfferA?: TradeAsset[];
  pickOfferB?: TradeAsset[];
  teamACap?: number;
  teamBCap?: number;
  teamABudget?: number;
  teamBBudget?: number;
  nbaMatchingTolerance?: number;
  nbaMatchingBuffer?: number;
  commissionerOverride?: boolean;
};

export type TradeValidation = {
  valid: boolean;
  errors: TradeValidationError[];
  payrollAfter: { teamA: number; teamB: number };
  rosterAfter: { teamA: number; teamB: number };
};

function playerKey(player: TradeAsset): string {
  return String(player.player_id || player.id || player.bref_id || player.full_name || '');
}

function pickKey(pick: TradeAsset): string {
  return String(pick.id || '');
}

function normalizeSport(sport: unknown): 'nba' | 'madden' | 'mlb' {
  if (sport === 'nfl' || sport === 'madden') return 'madden';
  if (sport === 'mlb') return 'mlb';
  return 'nba';
}

function validSalary(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function salary(player: TradeAsset): number {
  return validSalary(player.salary) ? player.salary : 0;
}

function sumPayroll(players: TradeAsset[]): number {
  return players.reduce((total, player) => total + salary(player), 0);
}

function ownedAssets(
  owned: TradeAsset[],
  offered: TradeAsset[],
  keyOf: (asset: TradeAsset) => string,
): boolean {
  const ownedKeys = new Set(owned.map(keyOf).filter(Boolean));
  return offered.every(asset => {
    const key = keyOf(asset);
    return !!key && ownedKeys.has(key);
  });
}

function uniqueAssets(offered: TradeAsset[], keyOf: (asset: TradeAsset) => string): boolean {
  const keys = offered.map(keyOf);
  return keys.every(Boolean) && new Set(keys).size === keys.length;
}

function offeredSalariesValid(owned: TradeAsset[], offered: TradeAsset[]): boolean {
  const byKey = new Map(owned.map(player => [playerKey(player), player]));
  return offered.every(asset => {
    const authoritative = byKey.get(playerKey(asset));
    return !!authoritative && validSalary(authoritative.salary);
  });
}

function offeredSalary(owned: TradeAsset[], offered: TradeAsset[]): number {
  const byKey = new Map(owned.map(player => [playerKey(player), player]));
  return offered.reduce((total, asset) => {
    const authoritative = byKey.get(playerKey(asset));
    return total + (authoritative ? salary(authoritative) : 0);
  }, 0);
}

export function validateTrade(input: ValidateTradeInput): TradeValidation {
  const sport = normalizeSport(input.sport);
  const playersA = input.teamA.players || [];
  const playersB = input.teamB.players || [];
  const picksA = input.teamA.picks || [];
  const picksB = input.teamB.picks || [];
  const offerA = input.offerA || [];
  const offerB = input.offerB || [];
  const pickOfferA = input.pickOfferA || [];
  const pickOfferB = input.pickOfferB || [];
  const errors = new Set<TradeValidationError>();

  if (
    !ownedAssets(playersA, offerA, playerKey)
    || !ownedAssets(playersB, offerB, playerKey)
    || !ownedAssets(picksA, pickOfferA, pickKey)
    || !ownedAssets(picksB, pickOfferB, pickKey)
    || !uniqueAssets(offerA, playerKey)
    || !uniqueAssets(offerB, playerKey)
    || !uniqueAssets(pickOfferA, pickKey)
    || !uniqueAssets(pickOfferB, pickKey)
  ) {
    errors.add('ownership');
  }

  if (!offeredSalariesValid(playersA, offerA) || !offeredSalariesValid(playersB, offerB)) {
    errors.add('financial_limit');
  }

  const outgoingA = offeredSalary(playersA, offerA);
  const outgoingB = offeredSalary(playersB, offerB);
  const payrollAfter = {
    teamA: sumPayroll(playersA) - outgoingA + outgoingB,
    teamB: sumPayroll(playersB) - outgoingB + outgoingA,
  };
  const rosterAfter = {
    teamA: playersA.length - offerA.length + offerB.length,
    teamB: playersB.length - offerB.length + offerA.length,
  };

  const rosterLimit = sport === 'madden' ? 53 : sport === 'mlb' ? 40 : 15;
  if (rosterAfter.teamA > rosterLimit || rosterAfter.teamB > rosterLimit) {
    errors.add('roster_limit');
  }

  if (sport !== 'nba') {
    const limitA = sport === 'mlb' ? input.teamABudget : input.teamACap;
    const limitB = sport === 'mlb' ? input.teamBBudget : input.teamBCap;
    if (
      !Number.isFinite(limitA)
      || !Number.isFinite(limitB)
      || payrollAfter.teamA > Number(limitA)
      || payrollAfter.teamB > Number(limitB)
    ) {
      errors.add('financial_limit');
    }
  }

  if (sport === 'nba' && (outgoingA > 0 || outgoingB > 0)) {
    const tolerance = Number.isFinite(input.nbaMatchingTolerance)
      ? Number(input.nbaMatchingTolerance)
      : 1.25;
    const buffer = Number.isFinite(input.nbaMatchingBuffer)
      ? Number(input.nbaMatchingBuffer)
      : 100_000;
    if (
      outgoingB > outgoingA * tolerance + buffer
      || outgoingA > outgoingB * tolerance + buffer
    ) {
      errors.add('nba_matching');
    }
  }

  if (input.commissionerOverride) {
    errors.delete('financial_limit');
    errors.delete('nba_matching');
  }

  const errorList = Array.from(errors);
  return {
    valid: errorList.length === 0,
    errors: errorList,
    payrollAfter,
    rosterAfter,
  };
}
