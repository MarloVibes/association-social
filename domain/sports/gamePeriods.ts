type Sport = 'nba' | 'madden' | 'mlb';

type RawPeriod = {
  period?: number;
  quarter?: number;
  inning?: number;
  label?: string;
  home?: number;
  away?: number;
};

function normalizeSport(sport?: string | null): Sport {
  if (sport === 'nfl' || sport === 'madden') return 'madden';
  if (sport === 'mlb') return 'mlb';
  return 'nba';
}

function ordinal(value: number) {
  const suffix = value % 100 >= 11 && value % 100 <= 13
    ? 'th'
    : value % 10 === 1
      ? 'st'
      : value % 10 === 2
        ? 'nd'
        : value % 10 === 3
          ? 'rd'
          : 'th';
  return `${value}${suffix}`;
}

function periodNumber(period: RawPeriod) {
  return Number(period.period || period.quarter || period.inning || 0);
}

export function periodLabelForSport(sportInput: string | null | undefined, period: RawPeriod) {
  if (period.label) return period.label;
  const sport = normalizeSport(sportInput);
  const value = periodNumber(period);
  if (sport === 'mlb') return ordinal(value || 1);
  if (value <= 4) return `Q${value || 1}`;
  return value === 5 ? 'OT' : `${value - 4}OT`;
}

export function scorePeriodsForSport(
  sportInput: string | null | undefined,
  game?: {
    periods?: RawPeriod[];
    innings?: RawPeriod[];
    quarters?: RawPeriod[];
  } | null,
) {
  const rawPeriods = game?.periods || game?.innings || game?.quarters || [];
  return rawPeriods.map((period, index) => {
    const periodValue = periodNumber(period) || index + 1;
    return {
      period: periodValue,
      label: periodLabelForSport(sportInput, { ...period, period: periodValue }),
      home: Number(period.home || 0),
      away: Number(period.away || 0),
    };
  });
}
