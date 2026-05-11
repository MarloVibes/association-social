// Centralized player playstyle/tier classification.
// Used by roster.tsx, team-roster.tsx, and trade-channel.tsx.

export type PlaystyleLabel =
  | 'LEGEND' | 'SUPERSTAR' | 'STAR'
  | 'PLAYMAKER' | 'REBOUNDER' | 'SHOT BLOCKER' | 'LOCKDOWN'
  | '3&D' | 'SHARPSHOOTER' | 'TWO-WAY'
  | 'INTERIOR' | 'FLOOR GENERAL'
  | 'ROOKIE' | 'SOPHOMORE' | '3RD YEAR' | '4TH YEAR'
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
  'ROOKIE': 3.5,
  'SOPHOMORE': 3.5,
  '3RD YEAR': 3.5,
  '4TH YEAR': 3.5,
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

// Find the season entry matching a league's currentYear.
// currentYear is the START year (e.g., 2010 = season "2010-11").
export function getSeasonForYear(profile: any, currentYear: number | undefined): any | null {
  if (!profile || !currentYear) return null;
  const seasons = profile.seasons || [];
  // Year format in profile is "YYYY-YY" — match against the start year
  const targetYearStr = String(currentYear);
  const exact = seasons.find((s: any) => s.year && s.year.startsWith(targetYearStr + '-'));
  if (exact) return exact;
  // Fallback: closest year not exceeding currentYear (player retired or hadn't entered yet)
  const sorted = seasons
    .filter((s: any) => s.year)
    .sort((a: any, b: any) => parseInt(a.year) - parseInt(b.year));
  let best = null;
  for (const s of sorted) {
    const startYr = parseInt(s.year);
    if (startYr <= currentYear) best = s;
  }
  return best;
}

// Compute which career year a player is in (1-indexed) based on the league's currentYear.
// Returns 0 if no profile or no match.
export function getCareerYear(profile: any, currentYear: number | undefined): number {
  if (!profile || !currentYear) return 0;
  const seasons = (profile.seasons || []).filter((s: any) => s.year).sort(
    (a: any, b: any) => parseInt(a.year) - parseInt(b.year)
  );
  const targetYearStr = String(currentYear);
  for (let i = 0; i < seasons.length; i++) {
    if (seasons[i].year.startsWith(targetYearStr + '-')) return i + 1;
  }
  return 0;
}

const YEAR_LABELS: Record<number, PlaystyleLabel> = {
  1: 'ROOKIE', 2: 'SOPHOMORE', 3: '3RD YEAR', 4: '4TH YEAR',
};
const YEAR_COLOR = '#00ccff';

// Compute playstyle using year-specific stats when profile + currentYear are provided.
// If the result would be ROLE PLAYER AND the player is in years 1-4, replace with year tag.
// Falls back to the static getPlaystyle(player) if no season match.
export function getPlaystyleForYear(player: any, profile: any, currentYear: number | undefined): Playstyle {
  const season = getSeasonForYear(profile, currentYear);
  if (!season) return getPlaystyle(player);
  const synthetic = {
    ...player,
    ppg: season.ppg,
    apg: season.apg,
    rpg: season.rpg,
    spg: season.spg,
    bpg: season.bpg,
    fg3_pct: season.fg3_pct,
    fg_pct: season.fg_pct,
  };
  const tier = getPlaystyle(synthetic);
  // Graduation logic: only override ROLE PLAYER for early-career players
  if (tier.label === 'ROLE PLAYER') {
    const careerYear = getCareerYear(profile, currentYear);
    if (careerYear >= 1 && careerYear <= 4) {
      return { label: YEAR_LABELS[careerYear], color: YEAR_COLOR };
    }
  }
  return tier;
}

export function comparePlayersByTierForYear(profilesByName: Record<string, any>, currentYear: number | undefined) {
  return (a: any, b: any): number => {
    const profA = profilesByName[a.full_name];
    const profB = profilesByName[b.full_name];
    const rankA = SORT_RANK[getPlaystyleForYear(a, profA, currentYear).label] ?? 4;
    const rankB = SORT_RANK[getPlaystyleForYear(b, profB, currentYear).label] ?? 4;
    if (rankA !== rankB) return rankA - rankB;
    const sA = getSeasonForYear(profA, currentYear);
    const sB = getSeasonForYear(profB, currentYear);
    const ppgA = parseFloat(sA?.ppg ?? a?.ppg) || 0;
    const ppgB = parseFloat(sB?.ppg ?? b?.ppg) || 0;
    return ppgB - ppgA;
  };
}
