// Centralized player playstyle/tier classification.
// Used by roster.tsx, team-roster.tsx, and trade-channel.tsx.

export type PlaystyleLabel =
  | 'LEGEND' | 'SUPERSTAR' | 'STAR'
  | 'PLAYMAKER' | 'REBOUNDER' | 'SHOT BLOCKER' | 'LOCKDOWN'
  | '3&D' | 'SHARPSHOOTER' | 'TWO-WAY'
  | 'INTERIOR' | 'FLOOR GENERAL'
  | 'ROLE PLAYER';

export interface Playstyle {
  label: PlaystyleLabel;
  color: string;
}

export function getPlaystyle(player: any): Playstyle {
  const ppg = parseFloat(player?.ppg) || 0;
  const apg = parseFloat(player?.apg) || 0;
  const rpg = parseFloat(player?.rpg) || 0;
  const spg = parseFloat(player?.spg) || 0;
  const bpg = parseFloat(player?.bpg) || 0;
  const fg3 = parseFloat(player?.fg3_pct) || 0;
  const pos = player?.position || '';

  // Hall of Fame / Jersey retirement / Anniversary teams = LEGEND
  const accolades = player?.accolades || [];
  const isLegend = accolades.some((a: string) => {
    const t = a.toLowerCase();
    return t.includes('hall of fame') || t.includes('retired') || t.includes('jersey') ||
           t.includes('50 greatest') || t.includes('75th anniversary');
  });
  if (isLegend) return { label: 'LEGEND', color: '#ff00ff' };

  // Long career + strong scoring proxy
  const retiredYear = player?.retirement_year;
  const birthYear = player?.birth_year;
  const seasons = retiredYear && birthYear ? retiredYear - birthYear - 18 : 0;
  if (seasons >= 15 && ppg >= 18) return { label: 'LEGEND', color: '#ff00ff' };

  if (ppg >= 25) return { label: 'SUPERSTAR', color: '#FFD700' };
  if (ppg >= 20) return { label: 'STAR', color: '#FFA500' };
  if (apg >= 7) return { label: 'PLAYMAKER', color: '#00ccff' };
  if (rpg >= 10) return { label: 'REBOUNDER', color: '#aa44ff' };
  if (bpg >= 2) return { label: 'SHOT BLOCKER', color: '#ff6644' };
  if (spg >= 2) return { label: 'LOCKDOWN', color: '#ff4444' };
  if (fg3 >= 0.38 && (pos.includes('SF') || pos.includes('SG') || pos.includes('PF'))) return { label: '3&D', color: '#00ff87' };
  if (fg3 >= 0.38) return { label: 'SHARPSHOOTER', color: '#44ffaa' };
  if (ppg >= 15 && (spg >= 1.2 || bpg >= 1.2)) return { label: 'TWO-WAY', color: '#88ff44' };
  if (pos.includes('C') || pos.includes('PF')) return { label: 'INTERIOR', color: '#aa88ff' };
  if (pos.includes('PG')) return { label: 'FLOOR GENERAL', color: '#44aaff' };
  return { label: 'ROLE PLAYER', color: '#888888' };
}

// Sort priority: lower number = higher priority (sorts to top of roster).
// LEGEND > SUPERSTAR > STAR > (role specialists tied) > ROLE PLAYER
const SORT_RANK: Record<PlaystyleLabel, number> = {
  'LEGEND': 0,
  'SUPERSTAR': 1,
  'STAR': 2,
  // Role specialists all tie — PPG will be the tiebreaker within this group
  'PLAYMAKER': 3,
  'REBOUNDER': 3,
  'SHOT BLOCKER': 3,
  'LOCKDOWN': 3,
  '3&D': 3,
  'SHARPSHOOTER': 3,
  'TWO-WAY': 3,
  'INTERIOR': 3,
  'FLOOR GENERAL': 3,
  'ROLE PLAYER': 4,
};

export function getPlaystyleSortRank(player: any): number {
  return SORT_RANK[getPlaystyle(player).label] ?? 4;
}

// Composite comparator: rank first, then PPG (descending) as tiebreaker
export function comparePlayersByTier(a: any, b: any): number {
  const rankA = getPlaystyleSortRank(a);
  const rankB = getPlaystyleSortRank(b);
  if (rankA !== rankB) return rankA - rankB;
  const ppgA = parseFloat(a?.ppg) || 0;
  const ppgB = parseFloat(b?.ppg) || 0;
  return ppgB - ppgA;
}
