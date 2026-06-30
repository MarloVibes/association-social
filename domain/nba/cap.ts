export type CapHistoryEntry = {
  seasonYear: number;
  salaryCap: number;
  luxuryTaxLine?: number;
  firstApron?: number;
  secondApron?: number;
  nonTaxpayerMidLevelException?: number;
  taxpayerMidLevelException?: number;
  minimumSalary: number;
  rookieScaleBase: number;
};

export type ProjectCapHistoryInput = {
  currentYear: number;
  currentSalaryCap: number;
  existingHistory?: CapHistoryEntry[];
  growthRate?: number;
};

function capEntry(seasonYear: number, salaryCap: number, extras: Partial<CapHistoryEntry> = {}): CapHistoryEntry {
  return {
    seasonYear,
    salaryCap,
    minimumSalary: Math.round(salaryCap * 0.01),
    rookieScaleBase: Math.round(salaryCap * 0.05),
    ...extras,
  };
}

export const NBA_CAP_HISTORY: Record<number, CapHistoryEntry> = {
  2010: capEntry(2010, 58_044_000),
  2011: capEntry(2011, 58_044_000),
  2012: capEntry(2012, 58_044_000),
  2013: capEntry(2013, 58_679_000),
  2014: capEntry(2014, 63_065_000),
  2015: capEntry(2015, 70_000_000),
  2016: capEntry(2016, 94_143_000),
  2017: capEntry(2017, 99_093_000),
  2018: capEntry(2018, 101_869_000),
  2019: capEntry(2019, 109_140_000),
  2020: capEntry(2020, 109_140_000),
  2021: capEntry(2021, 112_414_000),
  2022: capEntry(2022, 123_655_000),
  2023: capEntry(2023, 136_021_000),
  2024: capEntry(2024, 140_588_000),
  2025: capEntry(2025, 154_647_000),
  2026: {
    seasonYear: 2026,
    salaryCap: 165_000_000,
    luxuryTaxLine: 201_000_000,
    firstApron: 209_000_000,
    secondApron: 222_000_000,
    nonTaxpayerMidLevelException: 15_050_000,
    taxpayerMidLevelException: 6_100_000,
    minimumSalary: 1_650_000,
    rookieScaleBase: 8_250_000,
  },
};

export function nextSalaryCap(currentSalaryCap: number, growthRate = 0.05): number {
  return Math.round(currentSalaryCap * (1 + growthRate));
}

export function averageCapGrowthRate(lookbackYears = 5): number {
  const entries = Object.values(NBA_CAP_HISTORY)
    .sort((left, right) => left.seasonYear - right.seasonYear);
  const rates = entries.slice(Math.max(1, entries.length - lookbackYears)).map((entry, index, recentEntries) => {
    const previous = entries[entries.length - recentEntries.length + index - 1];
    return previous && previous.salaryCap > 0 ? (entry.salaryCap - previous.salaryCap) / previous.salaryCap : 0;
  }).filter(rate => Number.isFinite(rate) && rate > 0);
  const average = rates.reduce((sum, rate) => sum + rate, 0) / Math.max(1, rates.length);
  return Math.max(0.02, Math.min(0.1, average || 0.05));
}

export function projectCapHistory(input: ProjectCapHistoryInput): CapHistoryEntry[] {
  const knownEntry = input.growthRate === undefined
    ? NBA_CAP_HISTORY[input.currentYear + 1]
    : null;
  if (knownEntry) {
    return [...(input.existingHistory || []), knownEntry];
  }

  const salaryCap = nextSalaryCap(input.currentSalaryCap, input.growthRate ?? averageCapGrowthRate());
  const entry: CapHistoryEntry = {
    seasonYear: input.currentYear + 1,
    salaryCap,
    minimumSalary: Math.round(salaryCap * 0.01),
    rookieScaleBase: Math.round(salaryCap * 0.05),
  };
  return [...(input.existingHistory || []), entry];
}
