export type ContractRole = 'franchise' | 'starter' | 'rotation' | 'depth';

export type ContractOfferScoreInput = {
  salary: number;
  years: number;
  role: ContractRole;
  contender: number;
  need: number;
  loyalty: number;
  reputation: number;
  market?: number;
  playerPreferences?: PlayerContractPreferences;
  seed: string;
};

export type PlayerContractPreferences = {
  money: number;
  loyalty: number;
  winning: number;
  role: number;
  market: number;
  security: number;
};

export type EraSalaryBaseline = {
  median: number;
  p75: number;
  p90: number;
};

export type ContractPreferenceInput = {
  player: {
    id?: string;
    player_id?: string;
    age?: number;
    salary?: number;
    contractYears?: number;
    label?: string;
    tier?: string;
    overall?: number;
    team?: string;
    teamHistory?: string[];
    playoffAppearances?: number;
  };
  eraSalaryBaseline?: EraSalaryBaseline;
};

export type ExpectedSalaryInput = ContractPreferenceInput & {
  role: ContractRole;
};

export type ContractFinanceError =
  | 'invalid_salary'
  | 'invalid_payroll'
  | 'invalid_limit'
  | 'financial_limit';

export type ContractFinanceInput = {
  sport?: string | null;
  currentPayroll: number;
  offerSalary: number;
  financeLimit?: number | null;
};

export type ContractFinanceValidation = {
  valid: boolean;
  payrollAfter: number;
  errors: ContractFinanceError[];
};

export type ContractCandidateStage = 're_signing' | 'free_agency';

export type ContractCandidatePlayer = {
  id?: string;
  player_id?: string;
  full_name?: string;
  name?: string;
  contractYears?: number;
  contractExpired?: boolean;
  freeAgent?: boolean;
  isFreeAgent?: boolean;
  retired?: boolean;
  contract?: {
    years?: number;
  };
};

export type ContractCandidateTeam<T extends ContractCandidatePlayer = ContractCandidatePlayer> = {
  id: string;
  players?: T[];
};

export type SelectContractCandidatesInput<T extends ContractCandidatePlayer = ContractCandidatePlayer> = {
  stage: ContractCandidateStage;
  teams: Array<ContractCandidateTeam<T>>;
  freeAgents: T[];
  myTeamId?: string | null;
};

const ROLE_SCORE: Readonly<Record<ContractRole, number>> = Object.freeze({
  franchise: 18,
  starter: 12,
  rotation: 7,
  depth: 3,
});

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function normalizeWeights(weights: PlayerContractPreferences): PlayerContractPreferences {
  const entries = Object.entries(weights) as Array<[keyof PlayerContractPreferences, number]>;
  const total = entries.reduce((sum, [, value]) => sum + Math.max(0, Number(value) || 0), 0) || 1;
  return entries.reduce((result, [key, value]) => {
    result[key] = Math.round((Math.max(0, Number(value) || 0) / total) * 1000) / 1000;
    return result;
  }, {} as PlayerContractPreferences);
}

function seededUnit(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function normalizeSport(sport?: string | null): 'nba' | 'madden' | 'mlb' {
  if (sport === 'nfl' || sport === 'madden') return 'madden';
  if (sport === 'mlb') return 'mlb';
  return 'nba';
}

function candidateId(player: ContractCandidatePlayer): string {
  return String(player.player_id || player.id || player.full_name || player.name || '');
}

function expiringCandidate(player: ContractCandidatePlayer): boolean {
  if (!player || player.retired) return false;
  if (player.freeAgent === true || player.isFreeAgent === true || player.contractExpired === true) return true;
  if (Number.isFinite(player.contractYears) && Number(player.contractYears) <= 1) return true;
  const contractYears = Number(player.contract?.years);
  return Number.isFinite(contractYears) && contractYears <= 1;
}

function openMarketCandidate(player: ContractCandidatePlayer): boolean {
  if (!player || player.retired) return false;
  if (player.freeAgent === true || player.isFreeAgent === true || player.contractExpired === true) return true;
  if (Number.isFinite(player.contractYears) && Number(player.contractYears) <= 0) return true;
  const contractYears = Number(player.contract?.years);
  return Number.isFinite(contractYears) && contractYears <= 0;
}

function uniqueCandidates<T extends ContractCandidatePlayer>(players: T[]): T[] {
  const seen = new Set<string>();
  return players.filter(player => {
    const id = candidateId(player);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function selectContractCandidates<T extends ContractCandidatePlayer>(
  input: SelectContractCandidatesInput<T>,
): T[] {
  if (input.stage === 're_signing') {
    const team = input.teams.find(item => String(item.id) === String(input.myTeamId || ''));
    return uniqueCandidates((team?.players || []).filter(expiringCandidate));
  }
  const rosteredIds = new Set(input.teams.flatMap(team => team.players || []).map(candidateId).filter(Boolean));
  const pooled = uniqueCandidates((input.freeAgents || []).filter(player => !rosteredIds.has(candidateId(player))));
  if (pooled.length > 0) return pooled;
  return uniqueCandidates(
    input.teams.flatMap(team => (
      (team.players || [])
        .filter(openMarketCandidate)
        .map(player => ({
          ...player,
          team: '',
          previousTeamId: team.id,
        }))
    )) as T[],
  );
}

export function scoreContractOffer(input: ContractOfferScoreInput): number {
  const salary = finiteNonNegative(input.salary) ? input.salary : 0;
  const years = Number.isFinite(input.years) ? Math.max(0, input.years) : 0;
  const preferences = input.playerPreferences ? normalizeWeights(input.playerPreferences) : normalizeWeights({
    money: 0.36,
    loyalty: 0.1,
    winning: 0.16,
    role: 0.18,
    market: 0.08,
    security: 0.12,
  });
  const salaryScore = Math.sqrt(Math.min(1, salary / 35_000_000)) * 100;
  const yearsScore = Math.min(years, 7) / 7 * 100;
  const roleScore = (ROLE_SCORE[input.role] || 0) / ROLE_SCORE.franchise * 100;
  const loyaltyScore = clampUnit(input.loyalty) * 100;
  const winningScore = clampUnit(input.contender) * 100;
  const roleFitScore = ((clampUnit(input.need) * 0.6) + (roleScore / 100 * 0.4)) * 100;
  const marketScore = clampUnit(input.market ?? input.reputation) * 100;
  const variance = (seededUnit(input.seed) * 4) - 2;
  const score = (
    salaryScore * preferences.money
    + loyaltyScore * preferences.loyalty
    + winningScore * preferences.winning
    + roleFitScore * preferences.role
    + marketScore * preferences.market
    + yearsScore * preferences.security
    + clampUnit(input.reputation) * 6
    + variance
  );

  return Math.round(score * 1000) / 1000;
}

export function derivePlayerContractPreferences(input: ContractPreferenceInput): PlayerContractPreferences {
  const player = input.player || {};
  const age = Number.isFinite(player.age) ? Number(player.age) : 27;
  const salary = finiteNonNegative(player.salary) ? Number(player.salary) : 0;
  const baseline = input.eraSalaryBaseline || { median: 8_000_000, p75: 14_000_000, p90: 24_000_000 };
  const history = Array.isArray(player.teamHistory) ? player.teamHistory.filter(Boolean) : [];
  const uniqueTeams = new Set(history.map(String));
  const currentTeam = String(player.team || history.at(-1) || '');
  const seasonsWithCurrent = currentTeam
    ? history.filter(team => String(team) === currentTeam).length
    : history.length > 0 && uniqueTeams.size === 1 ? history.length : 0;
  const movementRate = history.length > 1 ? Math.min(1, Math.max(0, (uniqueTeams.size - 1) / history.length)) : 0;
  const salaryPercentile = salary >= baseline.p90 ? 0.95 : salary >= baseline.p75 ? 0.78 : salary >= baseline.median ? 0.55 : 0.32;
  const tier = String(player.label || player.tier || '').toLowerCase();
  const star = tier.includes('star') || tier.includes('legend') || tier.includes('super') || Number(player.overall || 0) >= 86;
  const veteran = age >= 32;
  const young = age <= 24;

  return normalizeWeights({
    money: 0.25 + movementRate * 0.18 + (1 - salaryPercentile) * 0.16 + (star ? 0.06 : 0),
    loyalty: 0.1 + Math.min(0.26, seasonsWithCurrent * 0.055) + Math.max(0, salaryPercentile - 0.55) * 0.08 - movementRate * 0.12,
    winning: 0.12 + (veteran ? 0.22 : 0) + Math.min(0.16, Number(player.playoffAppearances || 0) * 0.015),
    role: 0.15 + (young ? 0.16 : 0) + movementRate * 0.08 + (star ? 0.06 : 0),
    market: 0.07 + (star ? 0.08 : 0),
    security: 0.14 + (veteran ? 0.08 : 0) + (Number(player.contractYears || 0) >= 3 ? 0.05 : 0),
  });
}

export function expectedAnnualSalary(input: ExpectedSalaryInput): number {
  const player = input.player || {};
  const baseline = input.eraSalaryBaseline || { median: 8_000_000, p75: 14_000_000, p90: 24_000_000 };
  const salary = finiteNonNegative(player.salary) ? Number(player.salary) : baseline.median;
  const roleMultiplier = {
    franchise: 1.75,
    starter: 1.25,
    rotation: 0.82,
    depth: 0.48,
  }[input.role];
  const tier = String(player.label || player.tier || '').toLowerCase();
  const overall = Number(player.overall || 0);
  const impactMultiplier = tier.includes('legend') || tier.includes('superstar') || overall >= 90
    ? 1.75
    : tier.includes('star') || overall >= 84
      ? 1.35
      : tier.includes('starter') || overall >= 76
        ? 1.05
        : 0.82;
  const age = Number.isFinite(player.age) ? Number(player.age) : 27;
  const ageMultiplier = age <= 24 ? 1.12 : age >= 34 ? 0.88 : 1;
  const eraAnchor = Math.max(salary, baseline.median * 0.55);
  const salaryRankMultiplier = salary >= baseline.p90 ? 1.18 : salary >= baseline.p75 ? 1.08 : salary < baseline.median ? 0.95 : 1;

  return Math.round(eraAnchor * roleMultiplier * impactMultiplier * ageMultiplier * salaryRankMultiplier);
}

export function validateContractOfferFinance(
  input: ContractFinanceInput,
): ContractFinanceValidation {
  const errors: ContractFinanceError[] = [];
  const payrollValid = finiteNonNegative(input.currentPayroll);
  const salaryValid = finiteNonNegative(input.offerSalary);

  if (!payrollValid) errors.push('invalid_payroll');
  if (!salaryValid) errors.push('invalid_salary');

  const payrollAfter = input.currentPayroll + input.offerSalary;
  const sport = normalizeSport(input.sport);

  if (sport !== 'nba') {
    if (!finiteNonNegative(input.financeLimit)) {
      errors.push('invalid_limit');
    } else if (
      payrollValid
      && salaryValid
      && payrollAfter > input.financeLimit
    ) {
      errors.push('financial_limit');
    }
  }

  return {
    valid: errors.length === 0,
    payrollAfter,
    errors,
  };
}
