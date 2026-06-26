export type CapHistoryEntry = {
  seasonYear: number;
  salaryCap: number;
  minimumSalary: number;
  rookieScaleBase: number;
};

export type ProjectCapHistoryInput = {
  currentYear: number;
  currentSalaryCap: number;
  existingHistory?: CapHistoryEntry[];
  growthRate?: number;
};

export function nextSalaryCap(currentSalaryCap: number, growthRate = 0.05): number {
  return Math.round(currentSalaryCap * (1 + growthRate));
}

export function projectCapHistory(input: ProjectCapHistoryInput): CapHistoryEntry[] {
  const salaryCap = nextSalaryCap(input.currentSalaryCap, input.growthRate ?? 0.05);
  const entry: CapHistoryEntry = {
    seasonYear: input.currentYear + 1,
    salaryCap,
    minimumSalary: Math.round(salaryCap * 0.01),
    rookieScaleBase: Math.round(salaryCap * 0.05),
  };
  return [...(input.existingHistory || []), entry];
}
