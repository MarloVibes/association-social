// Team colors for all NBA teams including historical/defunct
// Format: [primary, secondary, text]
export const TEAM_COLORS: Record<string, [string, string, string]> = {
  // Current Teams
  ATL: ['#C8102E', '#FDB927', '#ffffff'],
  BOS: ['#007A33', '#BA9653', '#ffffff'],
  BKN: ['#000000', '#ffffff', '#ffffff'],
  CHA: ['#1D1160', '#00788C', '#ffffff'],
  CHI: ['#CE1141', '#000000', '#ffffff'],
  CLE: ['#860038', '#FDBB30', '#ffffff'],
  DAL: ['#00538C', '#002B5E', '#ffffff'],
  DEN: ['#0E2240', '#FEC524', '#ffffff'],
  DET: ['#C8102E', '#1D42BA', '#ffffff'],
  GSW: ['#1D428A', '#FFC72C', '#ffffff'],
  HOU: ['#CE1141', '#000000', '#ffffff'],
  IND: ['#002D62', '#FDBB30', '#ffffff'],
  LAC: ['#C8102E', '#1D428A', '#ffffff'],
  LAL: ['#552583', '#FDB927', '#ffffff'],
  MEM: ['#5D76A9', '#12173F', '#ffffff'],
  MIA: ['#98002E', '#F9A01B', '#ffffff'],
  MIL: ['#00471B', '#EEE1C6', '#ffffff'],
  MIN: ['#0C2340', '#236192', '#ffffff'],
  NOP: ['#0C2340', '#C8102E', '#ffffff'],
  NYK: ['#006BB6', '#F58426', '#ffffff'],
  OKC: ['#007AC1', '#EF3B24', '#ffffff'],
  ORL: ['#0077C0', '#000000', '#ffffff'],
  PHI: ['#006BB6', '#ED174C', '#ffffff'],
  PHX: ['#1D1160', '#E56020', '#ffffff'],
  POR: ['#E03A3E', '#000000', '#ffffff'],
  SAC: ['#5A2D81', '#63727A', '#ffffff'],
  SAS: ['#000000', '#C4CED4', '#ffffff'],
  TOR: ['#CE1141', '#000000', '#ffffff'],
  UTA: ['#002B5C', '#F9A01B', '#ffffff'],
  WAS: ['#002B5C', '#E31837', '#ffffff'],

  // Historical/Defunct Teams
  SEA: ['#00653A', '#FFC200', '#ffffff'],  // Seattle SuperSonics
  NJN: ['#002A60', '#BEC0C2', '#ffffff'],  // New Jersey Nets
  NOH: ['#0C2340', '#C8102E', '#ffffff'],  // New Orleans Hornets
  NOK: ['#0C2340', '#C8102E', '#ffffff'],  // New Orleans/OKC Hornets
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
