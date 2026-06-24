export type ContractRole = 'franchise' | 'starter' | 'rotation' | 'depth';

export type ContractOfferScoreInput = {
  salary: number;
  years: number;
  role: ContractRole;
  contender: number;
  need: number;
  loyalty: number;
  reputation: number;
  seed: string;
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

export function scoreContractOffer(input: ContractOfferScoreInput): number {
  const salary = finiteNonNegative(input.salary) ? input.salary : 0;
  const years = Number.isFinite(input.years) ? Math.max(0, input.years) : 0;
  const salaryScore = Math.log1p(salary) / Math.log1p(50_000_000) * 40;
  const yearsScore = Math.min(years, 7) * 2;
  const variance = (seededUnit(input.seed) * 4) - 2;
  const score =
    salaryScore
    + yearsScore
    + ROLE_SCORE[input.role]
    + clampUnit(input.contender) * 8
    + clampUnit(input.need) * 10
    + clampUnit(input.loyalty) * 7
    + clampUnit(input.reputation) * 6
    + variance;

  return Math.round(score * 1000) / 1000;
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
