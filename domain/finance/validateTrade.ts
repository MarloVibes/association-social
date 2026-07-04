export type TradeValidationError =
  | 'ownership'
  | 'roster_limit'
  | 'invalid_salary'
  | 'financial_limit'
  | 'nba_matching';

type TradeAsset = {
  id?: string;
  player_id?: string;
  bref_id?: string;
  full_name?: string;
  salary?: number;
  contractType?: string;
  contract_type?: string;
  rosterSlot?: string;
  roster_slot?: string;
  status?: string;
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
  teamALabel?: string;
  teamBLabel?: string;
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
  messages: string[];
  warnings: string[];
  payrollAfter: { teamA: number; teamB: number };
  rosterAfter: { teamA: number; teamB: number };
};

const NBA_STANDARD_ROSTER_LIMIT = 15;
const NBA_TOTAL_ROSTER_LIMIT = 18;
const NBA_MINIMUM_CONTRACT_CUTOFF = 1_300_000;

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

function teamLabel(value: unknown, fallback: string): string {
  const label = String(value || '').trim();
  return label || fallback;
}

function money(value: number): string {
  return `$${(Math.max(0, value) / 1_000_000).toFixed(1)}M`;
}

function limitMessage(label: string, kind: 'cap' | 'budget', payroll: number, limit: number): string {
  if (!Number.isFinite(limit)) {
    return `${label} needs a valid ${kind === 'budget' ? 'team budget' : 'salary cap'} before this trade can be checked.`;
  }
  const excess = payroll - limit;
  return `${label} will exceed the ${kind === 'budget' ? 'team budget' : 'salary cap'} by about ${money(excess)} after this trade.`;
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

function offeredPlayers(owned: TradeAsset[], offered: TradeAsset[]): TradeAsset[] {
  const byKey = new Map(owned.map(player => [playerKey(player), player]));
  return offered.map(asset => byKey.get(playerKey(asset))).filter((player): player is TradeAsset => !!player);
}

function finalRoster(owned: TradeAsset[], outgoing: TradeAsset[], incoming: TradeAsset[]): TradeAsset[] {
  const outgoingKeys = new Set(outgoing.map(playerKey).filter(Boolean));
  return [
    ...owned.filter(player => !outgoingKeys.has(playerKey(player))),
    ...incoming,
  ];
}

function isNbaOverflowEligible(player: TradeAsset): boolean {
  const label = String(
    player.contractType
      || player.contract_type
      || player.rosterSlot
      || player.roster_slot
      || player.status
      || '',
  ).toLowerCase();
  if (label.includes('two') && label.includes('way')) return true;
  if (label.includes('minimum') || label === 'min') return true;
  const playerSalary = salary(player);
  return playerSalary > 0 && playerSalary <= NBA_MINIMUM_CONTRACT_CUTOFF;
}

function checkNbaOverflowRoster(
  roster: TradeAsset[],
  label: string,
  errors: Set<TradeValidationError>,
  messages: string[],
  warnings: string[],
) {
  if (roster.length <= NBA_STANDARD_ROSTER_LIMIT) return;
  if (roster.length > NBA_TOTAL_ROSTER_LIMIT) {
    errors.add('roster_limit');
    messages.push(`${label} will exceed the ${NBA_TOTAL_ROSTER_LIMIT}-player roster limit with ${roster.length} players after this trade.`);
    return;
  }
  const overflow = roster.length - NBA_STANDARD_ROSTER_LIMIT;
  const eligibleOverflowPlayers = roster.filter(isNbaOverflowEligible).length;
  if (eligibleOverflowPlayers < overflow) {
    errors.add('roster_limit');
    messages.push(`${label} has ${roster.length} players after this trade. Extra NBA roster spots 16-18 must be two-way or minimum-contract players.`);
    return;
  }
  warnings.push(`${label} will use ${overflow} two-way/minimum overflow ${overflow === 1 ? 'spot' : 'spots'} after this trade.`);
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
  const messages: string[] = [];
  const warnings: string[] = [];
  const labelA = teamLabel(input.teamALabel, 'Team A');
  const labelB = teamLabel(input.teamBLabel, 'Team B');

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
    messages.push('One side includes a player or pick that is not on that roster, or the same asset was added twice.');
  }

  if (!offeredSalariesValid(playersA, offerA) || !offeredSalariesValid(playersB, offerB)) {
    errors.add('invalid_salary');
    messages.push('One offered player has a missing or invalid contract. Refresh the room or check salary overrides.');
  }

  const outgoingA = offeredSalary(playersA, offerA);
  const outgoingB = offeredSalary(playersB, offerB);
  const offeredPlayersA = offeredPlayers(playersA, offerA);
  const offeredPlayersB = offeredPlayers(playersB, offerB);
  const payrollAfter = {
    teamA: sumPayroll(playersA) - outgoingA + outgoingB,
    teamB: sumPayroll(playersB) - outgoingB + outgoingA,
  };
  const rosterAfter = {
    teamA: playersA.length - offerA.length + offerB.length,
    teamB: playersB.length - offerB.length + offerA.length,
  };

  if (sport === 'nba') {
    checkNbaOverflowRoster(finalRoster(playersA, offerA, offeredPlayersB), labelA, errors, messages, warnings);
    checkNbaOverflowRoster(finalRoster(playersB, offerB, offeredPlayersA), labelB, errors, messages, warnings);
  } else {
    const rosterLimit = sport === 'madden' ? 53 : 40;
    if (rosterAfter.teamA > rosterLimit) {
      errors.add('roster_limit');
      messages.push(`${labelA} will exceed the ${rosterLimit}-player roster limit with ${rosterAfter.teamA} players after this trade.`);
    }
    if (rosterAfter.teamB > rosterLimit) {
      errors.add('roster_limit');
      messages.push(`${labelB} will exceed the ${rosterLimit}-player roster limit with ${rosterAfter.teamB} players after this trade.`);
    }
  }

  if (sport !== 'nba') {
    const limitA = sport === 'mlb' ? input.teamABudget : input.teamACap;
    const limitB = sport === 'mlb' ? input.teamBBudget : input.teamBCap;
    const kind = sport === 'mlb' ? 'budget' : 'cap';
    if (!Number.isFinite(limitA) || payrollAfter.teamA > Number(limitA)) {
      errors.add('financial_limit');
      messages.push(limitMessage(labelA, kind, payrollAfter.teamA, Number(limitA)));
    }
    if (!Number.isFinite(limitB) || payrollAfter.teamB > Number(limitB)) {
      errors.add('financial_limit');
      messages.push(limitMessage(labelB, kind, payrollAfter.teamB, Number(limitB)));
    }
  }

  if (sport === 'nba' && (outgoingA > 0 || outgoingB > 0)) {
    const tolerance = Number.isFinite(input.nbaMatchingTolerance)
      ? Number(input.nbaMatchingTolerance)
      : 1.25;
    const buffer = Number.isFinite(input.nbaMatchingBuffer)
      ? Number(input.nbaMatchingBuffer)
      : 100_000;
    if (outgoingB > outgoingA * tolerance + buffer) {
      errors.add('nba_matching');
      const shortfall = Math.ceil((outgoingB - buffer) / tolerance - outgoingA);
      messages.push(`${labelA} needs to add about ${money(shortfall)} more outgoing salary for NBA matching.`);
    }
    if (outgoingA > outgoingB * tolerance + buffer) {
      errors.add('nba_matching');
      const shortfall = Math.ceil((outgoingA - buffer) / tolerance - outgoingB);
      messages.push(`${labelB} needs to add about ${money(shortfall)} more outgoing salary for NBA matching.`);
    }
  }

  if (input.commissionerOverride) {
    const removedFinancial = errors.delete('financial_limit');
    const removedMatching = errors.delete('nba_matching');
    if (removedFinancial || removedMatching) {
      messages.push('Commissioner override can bypass salary matching or finance limits, but roster and ownership checks still apply.');
    }
  }

  const errorList = Array.from(errors);
  return {
    valid: errorList.length === 0,
    errors: errorList,
    messages: errorList.length === 0 ? [] : [...new Set(messages)],
    warnings: [...new Set(warnings)],
    payrollAfter,
    rosterAfter,
  };
}
