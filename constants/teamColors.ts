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


// Per-team theme overrides for league UI.
// titleColor: button labels (League Activity, Rosters, Members, Find GMs, back button, team name, channel hub)
// borderColor: borders + button outlines
// tintColor: background of cards/buttons (will be applied with low alpha)
// Subtext + small labels stay white universally.
export const TEAM_THEME: Record<string, { titleColor: string; borderColor: string; tintColor: string }> = {
  ATL: { titleColor: '#E03A3E', borderColor: '#E03A3E', tintColor: '#C1D32F' },
  BOS: { titleColor: '#FFFFFF', borderColor: '#BB9753', tintColor: '#007A33' },
  BKN: { titleColor: '#FFFFFF', borderColor: '#FFFFFF', tintColor: '#000000' },
  CHA: { titleColor: '#FFFFFF', borderColor: '#FFFFFF', tintColor: '#00788C' },
  CHI: { titleColor: '#FFFFFF', borderColor: '#FFFFFF', tintColor: '#CE1141' },
  CLE: { titleColor: '#FDBB30', borderColor: '#FDBB30', tintColor: '#860038' },
  DAL: { titleColor: '#FFFFFF', borderColor: '#FFFFFF', tintColor: '#00538C' },
  DEN: { titleColor: '#FEC524', borderColor: '#FEC524', tintColor: '#418FDE' },
  DET: { titleColor: '#C8102E', borderColor: '#C8102E', tintColor: '#1D42BA' },
  GSW: { titleColor: '#FFC72C', borderColor: '#FFC72C', tintColor: '#1D428A' },
  HOU: { titleColor: '#FFFFFF', borderColor: '#000000', tintColor: '#A40012' },
  IND: { titleColor: '#FDBB30', borderColor: '#FDBB30', tintColor: '#002D62' },
  LAC: { titleColor: '#C8102E', borderColor: '#C8102E', tintColor: '#1D428A' },
  LAL: { titleColor: '#FDB927', borderColor: '#FDB927', tintColor: '#552583' },
  MEM: { titleColor: '#FFFFFF', borderColor: '#12173F', tintColor: '#00B2A9' },
  MIA: { titleColor: '#F9A01B', borderColor: '#F9A01B', tintColor: '#98002E' },
  MIL: { titleColor: '#EEE1C6', borderColor: '#EEE1C6', tintColor: '#00471B' },
  MIN: { titleColor: '#78BE20', borderColor: '#78BE20', tintColor: '#0C2340' },
  NOP: { titleColor: '#85714D', borderColor: '#FFFFFF', tintColor: '#0C2340' },
  NYK: { titleColor: '#F58426', borderColor: '#F58426', tintColor: '#006BB6' },
  OKC: { titleColor: '#EF3B24', borderColor: '#EF3B24', tintColor: '#007AC1' },
  ORL: { titleColor: '#FFFFFF', borderColor: '#FFFFFF', tintColor: '#0077C0' },
  PHI: { titleColor: '#006BB6', borderColor: '#FFFFFF', tintColor: '#ED174C' },
  PHX: { titleColor: '#E56020', borderColor: '#FFFFFF', tintColor: '#1D1160' },
  POR: { titleColor: '#FFFFFF', borderColor: '#FFFFFF', tintColor: '#E03A3E' },
  SAC: { titleColor: '#C4CED4', borderColor: '#FFFFFF', tintColor: '#5A2D81' },
  SAS: { titleColor: '#FFFFFF', borderColor: '#C4CED4', tintColor: '#6D6E71' },
  TOR: { titleColor: '#CE1141', borderColor: '#FFFFFF', tintColor: '#753BBD' },
  UTA: { titleColor: '#F9A01B', borderColor: '#FFFFFF', tintColor: '#0E1B36' },
  WAS: { titleColor: '#E31837', borderColor: '#FFFFFF', tintColor: '#002B5C' },
};

// Get the theme for a team, with sensible defaults.
// Defaults: title=white, border=team primary, tint=team primary.
export function getTeamTheme(abbr: string, currentYear?: number): { titleColor: string; borderColor: string; tintColor: string } {
  const effectiveAbbr = currentYear ? getCurrentTeamAbbr(abbr, currentYear) : abbr;
  const override = TEAM_THEME[effectiveAbbr];
  if (override) return override;
  const colors = TEAM_COLORS[effectiveAbbr] || TEAM_COLORS[abbr] || ['#1a1a1a', '#333333', '#ffffff'];
  return { titleColor: '#FFFFFF', borderColor: colors[0], tintColor: colors[0] };
}

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

// Local logo assets — preferred source for all current teams.
// Returns a require() asset or null if no local override exists.
// Use in <Image source={getTeamLogoLocal(abbr) || { uri: getTeamLogoUrl(abbr) }} />
export function getTeamLogoLocal(abbr: string, currentYear?: number): any {
  const effectiveAbbr = currentYear ? getCurrentTeamAbbr(abbr, currentYear) : abbr;
  const localOverrides: Record<string, any> = {
    ATL: require('@/assets/team-logos/atl.png'),
    BOS: require('@/assets/team-logos/bos.png'),
    BKN: require('@/assets/team-logos/bkn.png'),
    CHA: require('@/assets/team-logos/cha.png'),
    CHI: require('@/assets/team-logos/chi.png'),
    CLE: require('@/assets/team-logos/cle.png'),
    DAL: require('@/assets/team-logos/dal.png'),
    DEN: require('@/assets/team-logos/den.png'),
    DET: require('@/assets/team-logos/det.png'),
    GSW: require('@/assets/team-logos/gsw.png'),
    HOU: require('@/assets/team-logos/hou.png'),
    IND: require('@/assets/team-logos/ind.png'),
    LAC: require('@/assets/team-logos/lac.png'),
    LAL: require('@/assets/team-logos/lal.png'),
    MEM: require('@/assets/team-logos/mem.png'),
    MIA: require('@/assets/team-logos/mia.png'),
    MIL: require('@/assets/team-logos/mil.png'),
    MIN: require('@/assets/team-logos/min.png'),
    NOP: require('@/assets/team-logos/nop.png'),
    NYK: require('@/assets/team-logos/nyk.png'),
    OKC: require('@/assets/team-logos/okc.png'),
    ORL: require('@/assets/team-logos/orl.png'),
    PHI: require('@/assets/team-logos/phi.png'),
    PHX: require('@/assets/team-logos/phx.png'),
    POR: require('@/assets/team-logos/por.png'),
    SAC: require('@/assets/team-logos/sac.png'),
    SAS: require('@/assets/team-logos/sas.png'),
    TOR: require('@/assets/team-logos/tor.png'),
    UTA: require('@/assets/team-logos/uta.png'),
    WAS: require('@/assets/team-logos/was.png'),
  };
  return localOverrides[effectiveAbbr] || null;
}
