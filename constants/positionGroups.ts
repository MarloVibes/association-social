// Position groupings so MLB/NFL rosters render like a depth chart (grouped by
// position) instead of one flat list. Basketball is unaffected (returns null).

export interface PositionGroup { label: string; positions: string[]; }

const FOOTBALL: PositionGroup[] = [
  { label: 'Quarterbacks', positions: ['QB'] },
  { label: 'Running Backs', positions: ['RB', 'HB', 'FB'] },
  { label: 'Wide Receivers', positions: ['WR'] },
  { label: 'Tight Ends', positions: ['TE'] },
  { label: 'Offensive Line', positions: ['T', 'G', 'C', 'OT', 'OG', 'OL', 'LT', 'RT', 'LG', 'RG'] },
  { label: 'Defensive Line', positions: ['DE', 'DT', 'NT', 'DL', 'EDGE'] },
  { label: 'Linebackers', positions: ['LB', 'ILB', 'OLB', 'MLB'] },
  { label: 'Defensive Backs', positions: ['CB', 'S', 'FS', 'SS', 'DB'] },
  { label: 'Special Teams', positions: ['K', 'P', 'LS'] },
];

const BASEBALL: PositionGroup[] = [
  { label: 'Pitchers', positions: ['P', 'SP', 'RP', 'LHP', 'RHP'] },
  { label: 'Catchers', positions: ['C'] },
  { label: 'Infielders', positions: ['1B', '2B', '3B', 'SS', 'IF'] },
  { label: 'Outfielders', positions: ['LF', 'CF', 'RF', 'OF'] },
  { label: 'DH / Utility', positions: ['DH', 'UT', 'UTIL', 'TWP'] },
];

export function getPositionGroups(sport?: string): PositionGroup[] | null {
  if (sport === 'madden') return FOOTBALL;
  if (sport === 'mlb') return BASEBALL;
  return null; // nba — flat list
}

// Group index (for sorting) + label (for section headers) of a player's position.
export function groupForPosition(sport: string, position: string): { index: number; label: string } {
  const groups = getPositionGroups(sport);
  if (!groups) return { index: 999, label: '' };
  const pos = (position || '').toUpperCase();
  for (let i = 0; i < groups.length; i++) {
    if (groups[i].positions.includes(pos)) return { index: i, label: groups[i].label };
  }
  return { index: groups.length, label: 'Other' };
}
