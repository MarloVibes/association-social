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

// ── Era normalization ───────────────────────────────────────────────
// Counting stats (points, assists, rebounds, steals, blocks) scale with
// pace/possessions, which varied hugely by era. We normalize each era's
// stats to a neutral baseline so a fixed threshold means the same thing
// across eras and during era transitions. Rates (FG%, 3P%) are NOT scaled.

// Approx league points-per-game per team, by era (pace/scoring proxy).
const ERA_PACE: Record<string, number> = {
  magic_bird: 110, jordan: 105, kobe: 95, lebron: 100, steph: 106, current: 114,
};
// Approx league average 3P%, by era — the 3-point bar is relative to this.
const ERA_3P_AVG: Record<string, number> = {
  magic_bird: 0.27, jordan: 0.32, kobe: 0.35, lebron: 0.36, steph: 0.36, current: 0.37,
};
const BASELINE_PACE = 105; // neutral reference (~early-90s scoring)
const THREE_MARGIN = 0.045; // how far above era average counts as a shooter
const THREE_NOISE_CAP = 0.52; // above this over a season is small-sample noise

// Map a league start-year to its era key (same boundaries as advance-season).
export function eraForYear(year: number | undefined): string | undefined {
  if (!year) return undefined;
  if (year >= 2024) return 'current';
  if (year >= 2016) return 'steph';
  if (year >= 2010) return 'lebron';
  if (year >= 2002) return 'kobe';
  if (year >= 1991) return 'jordan';
  return 'magic_bird';
}

function paceFactor(eraKey?: string): number {
  if (!eraKey || !ERA_PACE[eraKey]) return 1;
  return BASELINE_PACE / ERA_PACE[eraKey];
}
function threeFloor(eraKey?: string): number {
  if (!eraKey || ERA_3P_AVG[eraKey] == null) return 0.38; // legacy default
  return ERA_3P_AVG[eraKey] + THREE_MARGIN;
}

function normalizedManualTier(player: any): Playstyle | null {
  const raw = String(
    player?.tierOverride
    || player?.manualTier
    || player?.franchiseTier
    || player?.playerLabel
    || '',
  ).trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (raw === 'LEGEND') return { label: 'LEGEND', color: '#ff00ff' };
  if (raw === 'SUPERSTAR') return { label: 'SUPERSTAR', color: '#FFD700' };
  if (raw === 'STAR') return { label: 'STAR', color: '#FFA500' };
  return null;
}

function accoladeText(accolade: string): string {
  return String(accolade || '').toLowerCase();
}

function accoladeCount(accolades: string[], matcher: (text: string) => boolean): number {
  return accolades.filter(item => matcher(accoladeText(item))).length;
}

function isMvp(text: string): boolean {
  return text.includes('mvp') && !text.includes('all-star') && !text.includes('all star');
}

function isFinalsMvp(text: string): boolean {
  return text.includes('finals') && text.includes('mvp');
}

function isAllNbaFirst(text: string): boolean {
  return text.includes('all-nba 1') || text.includes('all nba 1') || text.includes('all-nba first') || text.includes('all nba first');
}

function isAllNbaSecondOrThird(text: string): boolean {
  return text.includes('all-nba 2') || text.includes('all nba 2') || text.includes('all-nba second') || text.includes('all nba second')
    || text.includes('all-nba 3') || text.includes('all nba 3') || text.includes('all-nba third') || text.includes('all nba third');
}

function isAllStar(text: string): boolean {
  return text.includes('all-star') || text.includes('all star');
}

function isDpoy(text: string): boolean {
  return text.includes('defensive player of the year') || text.includes('dpoy');
}

function isChampionship(text: string): boolean {
  return text.includes('champion') || text.includes('championship') || text.includes('nba title');
}

export function getPlaystyle(player: any, eraKey?: string): Playstyle {
  const manualTier = normalizedManualTier(player);
  if (manualTier) return manualTier;

  const f = paceFactor(eraKey);
  // pace-adjust counting stats; leave shooting rates alone
  const ppg = (parseFloat(player?.ppg) || 0) * f;
  const apg = (parseFloat(player?.apg) || 0) * f;
  const rpg = (parseFloat(player?.rpg) || 0) * f;
  const spg = (parseFloat(player?.spg) || 0) * f;
  const bpg = (parseFloat(player?.bpg) || 0) * f;
  const fg3 = parseFloat(player?.fg3_pct) || 0;
  const pos = player?.position || '';
  const t3 = threeFloor(eraKey);
  const isShooter = fg3 >= t3 && fg3 <= THREE_NOISE_CAP;

  const accolades = player?.accolades || [];
  const isLegend = accolades.some((a: string) => {
    const t = a.toLowerCase();
    return t.includes('hall of fame') || t.includes('retired') || t.includes('jersey') ||
           t.includes('50 greatest') || t.includes('75th anniversary');
  });
  if (isLegend) return { label: 'LEGEND', color: '#ff00ff' };

  const mvpCount = accoladeCount(accolades, text => isMvp(text));
  const finalsMvpCount = accoladeCount(accolades, text => isFinalsMvp(text));
  const championshipCount = accoladeCount(accolades, text => isChampionship(text));
  const allLeagueCount = accoladeCount(accolades, text => isAllStar(text) || text.includes('all-nba') || text.includes('all nba'));
  if (mvpCount >= 2 || finalsMvpCount >= 2 || championshipCount >= 3 || allLeagueCount >= 8) {
    return { label: 'LEGEND', color: '#ff00ff' };
  }

  // Long career + strong scoring proxy (career ppg, era-neutral)
  const retiredYear = player?.retirement_year;
  const birthYear = player?.birth_year;
  const seasons = retiredYear && birthYear ? retiredYear - birthYear - 18 : 0;
  if (seasons >= 15 && (parseFloat(player?.ppg) || 0) >= 18) return { label: 'LEGEND', color: '#ff00ff' };

  if (
    mvpCount >= 1
    || finalsMvpCount >= 1
    || accoladeCount(accolades, text => isAllNbaFirst(text)) > 0
  ) {
    return { label: 'SUPERSTAR', color: '#FFD700' };
  }
  if (ppg >= 25) return { label: 'SUPERSTAR', color: '#FFD700' };
  if (
    accoladeCount(accolades, text => isAllStar(text) || isAllNbaSecondOrThird(text) || isDpoy(text)) > 0
  ) {
    return { label: 'STAR', color: '#FFA500' };
  }
  if (ppg >= 20) return { label: 'STAR', color: '#FFA500' };
  if (apg >= 7) return { label: 'PLAYMAKER', color: '#00ccff' };
  if (rpg >= 10) return { label: 'REBOUNDER', color: '#aa44ff' };
  if (bpg >= 2) return { label: 'SHOT BLOCKER', color: '#ff6644' };
  if (spg >= 2) return { label: 'LOCKDOWN', color: '#ff4444' };
  if (isShooter && (pos.includes('SF') || pos.includes('SG') || pos.includes('PF'))) return { label: '3&D', color: '#00ff87' };
  if (isShooter) return { label: 'SHARPSHOOTER', color: '#44ffaa' };
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
  // Accolades (incl. All-Star) live on the profile, not the pool player — carry
  // them through so accolade-based tiers (LEGEND, All-Star floor) can fire.
  const withAccolades = { ...player, accolades: profile?.accolades || player?.accolades || [] };
  const season = getSeasonForYear(profile, currentYear);
  if (!season) return getPlaystyle(withAccolades, eraForYear(currentYear));
  // Use the season's stat when it's actually present; otherwise keep the
  // player's existing (era_stats-merged) value. Older seasons often scrape
  // with blank fields, and a blank value must NOT clobber a real stat —
  // that's what was dropping stars (e.g. Kobe 2002-03) to ROLE PLAYER.
  const pick = (v: any, fallback: any) =>
    (v !== undefined && v !== null && v !== '' && !Number.isNaN(parseFloat(v))) ? v : fallback;
  const synthetic = {
    ...withAccolades,
    ppg: pick(season.ppg, player?.ppg),
    apg: pick(season.apg, player?.apg),
    rpg: pick(season.rpg, player?.rpg),
    spg: pick(season.spg, player?.spg),
    bpg: pick(season.bpg, player?.bpg),
    fg3_pct: pick(season.fg3_pct, player?.fg3_pct),
    fg_pct: pick(season.fg_pct, player?.fg_pct),
  };
  const tier = getPlaystyle(synthetic, eraForYear(currentYear));
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
