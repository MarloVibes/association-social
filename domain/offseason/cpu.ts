import {
  scoreContractOffer,
  validateContractOfferFinance,
  type ContractRole,
} from './contracts';
import type { OffseasonStage } from './types';

export type CpuContractCandidate = {
  id: string;
  incumbentTeamId?: string | null;
  position: string;
  age: number;
  value: number;
  role: ContractRole;
  askingSalary: number;
  askingYears: number;
  loyalty: number;
  currentSalary?: number;
};

export type CpuContractTeam = {
  id: string;
  sport?: string | null;
  currentPayroll: number;
  financeLimit?: number | null;
  currentRosterCount: number;
  rosterLimit: number;
  needs: string[];
  contender: number;
  reputation: number;
};

export type CpuContractDecisionInput = {
  leagueId: string;
  seasonYear: number;
  stage: OffseasonStage;
  team: CpuContractTeam;
  candidates: CpuContractCandidate[];
  existingDecisionIds?: readonly string[];
};

export type CpuDecisionIdInput = {
  leagueId: string;
  seasonYear: number;
  stage: OffseasonStage;
  teamId: string;
  playerId: string;
};

export type CpuContractDecision = {
  id: string;
  kind: 're_sign' | 'free_agent_bid';
  playerId: string;
  teamId: string;
  position: string;
  salary: number;
  years: number;
  preferenceScore: number;
  payrollAfter: number;
  rosterCountAfter: number;
};

function isRetainableStarter(
  candidate: CpuContractCandidate,
  teamId: string,
): boolean {
  return candidate.incumbentTeamId === teamId
    && candidate.age <= 27
    && candidate.value >= 80
    && (candidate.role === 'franchise' || candidate.role === 'starter');
}

function isNeededFreeAgent(
  candidate: CpuContractCandidate,
  team: CpuContractTeam,
): boolean {
  return candidate.incumbentTeamId !== team.id
    && team.needs.includes(candidate.position);
}

function validContract(candidate: CpuContractCandidate): boolean {
  return Number.isInteger(candidate.askingYears)
    && candidate.askingYears > 0
    && Number.isFinite(candidate.askingSalary)
    && candidate.askingSalary >= 0;
}

export function buildCpuDecisionId(input: CpuDecisionIdInput): string {
  return [
    input.leagueId,
    input.seasonYear,
    input.stage,
    input.teamId,
    input.playerId,
  ].join(':');
}

export function createCpuContractDecisions(
  input: CpuContractDecisionInput,
): CpuContractDecision[] {
  const existingIds = new Set(input.existingDecisionIds || []);
  const seenPlayerIds = new Set<string>();
  const candidates = input.candidates
    .filter(candidate => {
      if (!candidate.id || seenPlayerIds.has(candidate.id)) return false;
      seenPlayerIds.add(candidate.id);
      const allowedForStage = input.stage === 're_signing'
        ? candidate.incumbentTeamId === input.team.id
        : input.stage === 'free_agency'
          ? candidate.incumbentTeamId !== input.team.id
          : false;
      return validContract(candidate)
        && allowedForStage
        && (
          isRetainableStarter(candidate, input.team.id)
          || isNeededFreeAgent(candidate, input.team)
        );
    })
    .sort((left, right) => {
      const leftPriority = isRetainableStarter(left, input.team.id) ? 0 : 1;
      const rightPriority = isRetainableStarter(right, input.team.id) ? 0 : 1;
      return leftPriority - rightPriority
        || right.value - left.value
        || left.id.localeCompare(right.id);
    });

  const decisions: CpuContractDecision[] = [];
  let payroll = input.team.currentPayroll;
  let rosterCount = input.team.currentRosterCount;

  for (const candidate of candidates) {
    const reSigning = candidate.incumbentTeamId === input.team.id;
    if (!reSigning && rosterCount >= input.team.rosterLimit) continue;

    const id = buildCpuDecisionId({
      leagueId: input.leagueId,
      seasonYear: input.seasonYear,
      stage: input.stage,
      teamId: input.team.id,
      playerId: candidate.id,
    });
    if (existingIds.has(id)) continue;

    const finance = validateContractOfferFinance({
      sport: input.team.sport,
      currentPayroll: payroll - (
        reSigning && Number.isFinite(candidate.currentSalary)
          ? Math.max(0, Number(candidate.currentSalary))
          : 0
      ),
      offerSalary: candidate.askingSalary,
      financeLimit: input.team.financeLimit,
    });
    if (!finance.valid) continue;

    if (!reSigning) rosterCount += 1;
    payroll = finance.payrollAfter;
    existingIds.add(id);
    decisions.push({
      id,
      kind: reSigning ? 're_sign' : 'free_agent_bid',
      playerId: candidate.id,
      teamId: input.team.id,
      position: candidate.position,
      salary: candidate.askingSalary,
      years: candidate.askingYears,
      preferenceScore: scoreContractOffer({
        salary: candidate.askingSalary,
        years: candidate.askingYears,
        role: candidate.role,
        contender: input.team.contender,
        need: input.team.needs.includes(candidate.position) ? 1 : 0,
        loyalty: candidate.loyalty,
        reputation: input.team.reputation,
        seed: id,
      }),
      payrollAfter: payroll,
      rosterCountAfter: rosterCount,
    });
  }

  return decisions;
}
