export type RosterComplianceError =
  | 'roster_limit'
  | 'standard_roster_limit'
  | 'two_way_limit'
  | 'financial_limit'
  | 'invalid_limit';

type RosterPlayer = {
  id?: string;
  player_id?: string;
  position?: string;
  value?: number;
  overall?: number;
  rating?: number;
  salary?: number;
};

type ComplianceInput = {
  standard: number;
  twoWay?: number;
  payroll: number;
  limit?: number;
};

export function rosterPayroll(players: RosterPlayer[]): number {
  return players.reduce((total, player) => (
    total + (
      typeof player.salary === 'number'
      && Number.isFinite(player.salary)
      && player.salary >= 0
        ? player.salary
        : 0
    )
  ), 0);
}

export function rosterCompliance(
  sportInput: string,
  input: ComplianceInput,
) {
  const sport = sportInput === 'nfl' ? 'madden' : sportInput;
  const rosterLimit = sport === 'madden' ? 53 : sport === 'mlb' ? 40 : 15;
  const twoWayLimit = sport === 'nba' ? 3 : 0;
  const errors: RosterComplianceError[] = [];
  if (sport === 'nba') {
    if (input.standard > rosterLimit) errors.push('standard_roster_limit');
    if (Number(input.twoWay || 0) > twoWayLimit) errors.push('two_way_limit');
  } else if (input.standard > rosterLimit) {
    errors.push('roster_limit');
  }
  if (sport !== 'nba') {
    if (!Number.isFinite(input.limit) || Number(input.limit) < 0) {
      errors.push('invalid_limit');
    } else if (input.payroll > Number(input.limit)) {
      errors.push('financial_limit');
    }
  }
  return {
    valid: errors.length === 0,
    errors,
    rosterCount: input.standard,
    rosterLimit,
    twoWayCount: Number(input.twoWay || 0),
    twoWayLimit,
    payroll: input.payroll,
    financeLimit: input.limit,
  };
}

function playerValue(player: RosterPlayer): number {
  for (const value of [player.value, player.overall, player.rating]) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return 50;
}

function positionGroup(sportInput: string, position?: string): string {
  const sport = sportInput === 'nfl' ? 'madden' : sportInput;
  if (sport === 'madden' && ['LT', 'LG', 'C', 'RG', 'RT', 'OL'].includes(position || '')) {
    return 'OL';
  }
  if (sport === 'mlb' && ['LF', 'CF', 'RF', 'OF'].includes(position || '')) {
    return 'OF';
  }
  return position || '';
}

export function autoCutRoster<T extends RosterPlayer>({
  sport,
  players,
  rosterLimit,
  financeLimit,
  positionMinimums = {},
}: {
  sport: string;
  players: T[];
  rosterLimit: number;
  financeLimit?: number;
  positionMinimums?: Record<string, number>;
}) {
  const kept = [...players];
  const cut: T[] = [];

  const compliance = () => {
    const base = rosterCompliance(sport, {
      standard: kept.length,
      payroll: rosterPayroll(kept),
      limit: financeLimit,
    });
    const errors = new Set(base.errors);
    if (kept.length > rosterLimit) errors.add('roster_limit');
    return {
      ...base,
      valid: errors.size === 0,
      errors: [...errors],
      rosterLimit,
    };
  };

  while (!compliance().valid) {
    const positionCounts = kept.reduce<Record<string, number>>((counts, player) => {
      const position = positionGroup(sport, player.position);
      counts[position] = (counts[position] || 0) + 1;
      return counts;
    }, {});
    const removable = kept
      .map((player, index) => ({ player, index }))
      .filter(({ player }) => {
        const position = positionGroup(sport, player.position);
        return (positionCounts[position] || 0) > (positionMinimums[position] || 0);
      })
      .sort((left, right) => (
        playerValue(left.player) - playerValue(right.player)
        || Number(right.player.salary || 0) - Number(left.player.salary || 0)
        || String(left.player.id || left.player.player_id || '')
          .localeCompare(String(right.player.id || right.player.player_id || ''))
      ));
    if (removable.length === 0) break;
    const [removed] = kept.splice(removable[0].index, 1);
    cut.push(removed);
  }

  return { kept, cut, compliance: compliance() };
}
