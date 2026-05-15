// Team colors for all NBA teams including historical/defunct
// Format: [primary, secondary, text]
export const TEAM_COLORS: Record<string, [string, string, string]> = {
// Current Teams
  ATL: ['#C1D32F', '#E03A3E', '#ffffff'],
  BOS: ['#007A33', '#FFFFFF', '#ffffff'],
  BKN: ['#000000', '#FFFFFF', '#ffffff'],
  CHA: ['#00788C', '#FFFFFF', '#ffffff'],
  CHI: ['#CE1141', '#000000', '#ffffff'],
  CLE: ['#860038', '#FDBB30', '#ffffff'],
  DAL: ['#00538C', '#FFFFFF', '#ffffff'],
  DEN: ['#0E2240', '#FEC524', '#ffffff'],
  DET: ['#1D42BA', '#C8102E', '#ffffff'],
  GSW: ['#FFC72C', '#1D428A', '#ffffff'],
  HOU: ['#A40012', '#FFFFFF', '#ffffff'],
  IND: ['#002D62', '#FDBB30', '#ffffff'],
  LAC: ['#1D428A', '#C8102E', '#ffffff'],
  LAL: ['#552583', '#FDB927', '#ffffff'],
  MEM: ['#00B2A9', '#12173F', '#ffffff'],
  MIA: ['#98002E', '#F9A01B', '#ffffff'],
  MIL: ['#EEE1C6', '#00471B', '#ffffff'],
  MIN: ['#0C2340', '#78BE20', '#ffffff'],
  NOP: ['#85714D', '#0C2340', '#ffffff'],
  NYK: ['#F58426', '#006BB6', '#ffffff'],
  OKC: ['#007AC1', '#EF3B24', '#ffffff'],
  ORL: ['#0B1F3F', '#0077C0', '#ffffff'],
  PHI: ['#ED174C', '#006BB6', '#ffffff'],
  PHX: ['#E56020', '#1D1160', '#ffffff'],
  POR: ['#E03A3E', '#FFFFFF', '#ffffff'],
  SAC: ['#5A2D81', '#63727A', '#ffffff'],
  SAS: ['#C4CED4', '#6D6E71', '#ffffff'],
  TOR: ['#C4A26C', '#000000', '#ffffff'],
  UTA: ['#0E1B36', '#F9A01B', '#ffffff'],
  WAS: ['#002B5C', '#E31837', '#ffffff'],

  // Historical/Defunct Teams
  SEA: ['#00653A', '#FFC200', '#ffffff'],  // Seattle SuperSonics
  NJN: ['#BEC0C2', '#002A60', '#ffffff'],  // New Jersey Nets
  NOH: ['#0C2340', '#C8102E', '#ffffff'],  // New Orleans Hornets
  NOK: ['#C8102E', '#0C2340', '#ffffff'],  // New Orleans/OKC Hornets
  VAN: ['#00B2A9', '#1D1160', '#ffffff'],  // Vancouver Grizzlies
  KCK: ['#5A2D81', '#63727A', '#ffffff'],  // Kansas City Kings
  CHA_old: ['#00788C', '#1D1160', '#ffffff'], // Charlotte Hornets (original)
};

// Era-aware team rebrand map
// When currentYear passes threshold, team switches to new identity
export const TEAM_REBRAND: Record<string, { year: number; newAbbr: string }> = {
  SEA: { year: 2008, newAbbr: 'OKC' },   // Sonics -> Thunder after 2007-08
  NJN: { year: 2012, newAbbr: 'BKN' },   // Nets -> Brooklyn after 2011-12
  NOK: { year: 2005, newAbbr: 'NOH' },   // OKC Hornets -> New Orleans
  NOH: { year: 2013, newAbbr: 'NOP' },   // Hornets -> Pelicans
  VAN: { year: 2001, newAbbr: 'MEM' },   // Grizzlies -> Memphis
  KCK: { year: 1985, newAbbr: 'SAC' },   // Kings -> Sacramento
};

// Get current team identity based on abbreviation and league year
export function getCurrentTeamAbbr(abbr: string, currentYear: number): string {
  const rebrand = TEAM_REBRAND[abbr];
  if (rebrand && currentYear >= rebrand.year) {
    return getCurrentTeamAbbr(rebrand.newAbbr, currentYear);
  }
  return abbr;
}

// Get team colors, accounting for rebrands
export function getTeamColors(abbr: string, currentYear?: number): [string, string, string] {
  const effectiveAbbr = currentYear ? getCurrentTeamAbbr(abbr, currentYear) : abbr;
  return TEAM_COLORS[effectiveAbbr] || TEAM_COLORS[abbr] || ['#1a1a1a', '#333333', '#ffffff'];
}

// Get team logo URL, accounting for rebrands
export function getTeamLogoUrl(abbr: string, currentYear?: number): string {
  const effectiveAbbr = currentYear ? getCurrentTeamAbbr(abbr, currentYear) : abbr;
  const historicalLogos: Record<string, string> = {
    SEA: 'https://i.logocdn.com/nba/1992/seattle-supersonics@3x.png',
    NJN: 'https://i.logocdn.com/nba/1997/new-jersey-nets@3x.png',
    NOK: 'https://i.logocdn.com/nba/2003/new-orleans-hornets@3x.png',
    NOH: 'https://i.logocdn.com/nba/2003/new-orleans-hornets@3x.png',
    KCK: 'https://i.logocdn.com/nba/1984/sacramento-kings@3x.png',
  };
  if (historicalLogos[abbr] && (!currentYear || getCurrentTeamAbbr(abbr, currentYear) === abbr)) {
    return historicalLogos[abbr];
  }
  return 'https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/' + effectiveAbbr.toLowerCase() + '.png';
}
