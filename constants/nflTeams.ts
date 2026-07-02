// NFL team data for Franchise Mobile leagues.
// Mirrors the shape used by basketball's teamColors.ts so the same team cards
// (gradient + title/border accents) render unchanged. Abbreviations follow the
// nflverse standard so they line up with the seeded player pool.

export type SportTeam = {
  city: string;
  name: string;
  abbr: string;
  conference: string; // AFC / NFC
  division: string;   // East / North / South / West
  theme: { titleColor: string; borderColor: string; tintColor: string };
};

// tintColor = primary (gradient base); titleColor/borderColor = readable accent.
export const NFL_TEAMS: Record<string, SportTeam> = {
  // AFC East
  BUF: { city: 'Buffalo', name: 'Bills', abbr: 'BUF', conference: 'AFC', division: 'East', theme: { titleColor: '#C60C30', borderColor: '#C60C30', tintColor: '#00338D' } },
  MIA: { city: 'Miami', name: 'Dolphins', abbr: 'MIA', conference: 'AFC', division: 'East', theme: { titleColor: '#FC4C02', borderColor: '#FC4C02', tintColor: '#008E97' } },
  NE:  { city: 'New England', name: 'Patriots', abbr: 'NE', conference: 'AFC', division: 'East', theme: { titleColor: '#C60C30', borderColor: '#B0B7BC', tintColor: '#002244' } },
  NYJ: { city: 'New York', name: 'Jets', abbr: 'NYJ', conference: 'AFC', division: 'East', theme: { titleColor: '#FFFFFF', borderColor: '#FFFFFF', tintColor: '#125740' } },
  // AFC North
  BAL: { city: 'Baltimore', name: 'Ravens', abbr: 'BAL', conference: 'AFC', division: 'North', theme: { titleColor: '#9E7C0C', borderColor: '#9E7C0C', tintColor: '#241773' } },
  CIN: { city: 'Cincinnati', name: 'Bengals', abbr: 'CIN', conference: 'AFC', division: 'North', theme: { titleColor: '#000000', borderColor: '#000000', tintColor: '#FB4F14' } },
  CLE: { city: 'Cleveland', name: 'Browns', abbr: 'CLE', conference: 'AFC', division: 'North', theme: { titleColor: '#FF3C00', borderColor: '#FF3C00', tintColor: '#311D00' } },
  PIT: { city: 'Pittsburgh', name: 'Steelers', abbr: 'PIT', conference: 'AFC', division: 'North', theme: { titleColor: '#FFB612', borderColor: '#FFB612', tintColor: '#101820' } },
  // AFC South
  HOU: { city: 'Houston', name: 'Texans', abbr: 'HOU', conference: 'AFC', division: 'South', theme: { titleColor: '#A71930', borderColor: '#A71930', tintColor: '#03202F' } },
  IND: { city: 'Indianapolis', name: 'Colts', abbr: 'IND', conference: 'AFC', division: 'South', theme: { titleColor: '#FFFFFF', borderColor: '#FFFFFF', tintColor: '#002C5F' } },
  JAX: { city: 'Jacksonville', name: 'Jaguars', abbr: 'JAX', conference: 'AFC', division: 'South', theme: { titleColor: '#D7A22A', borderColor: '#D7A22A', tintColor: '#006778' } },
  TEN: { city: 'Tennessee', name: 'Titans', abbr: 'TEN', conference: 'AFC', division: 'South', theme: { titleColor: '#4B92DB', borderColor: '#C8102E', tintColor: '#0C2340' } },
  // AFC West
  DEN: { city: 'Denver', name: 'Broncos', abbr: 'DEN', conference: 'AFC', division: 'West', theme: { titleColor: '#FB4F14', borderColor: '#FB4F14', tintColor: '#002244' } },
  KC:  { city: 'Kansas City', name: 'Chiefs', abbr: 'KC', conference: 'AFC', division: 'West', theme: { titleColor: '#FFB81C', borderColor: '#FFB81C', tintColor: '#E31837' } },
  LV:  { city: 'Las Vegas', name: 'Raiders', abbr: 'LV', conference: 'AFC', division: 'West', theme: { titleColor: '#A5ACAF', borderColor: '#A5ACAF', tintColor: '#000000' } },
  LAC: { city: 'Los Angeles', name: 'Chargers', abbr: 'LAC', conference: 'AFC', division: 'West', theme: { titleColor: '#FFC20E', borderColor: '#FFC20E', tintColor: '#0080C6' } },
  // NFC East
  DAL: { city: 'Dallas', name: 'Cowboys', abbr: 'DAL', conference: 'NFC', division: 'East', theme: { titleColor: '#869397', borderColor: '#869397', tintColor: '#003594' } },
  NYG: { city: 'New York', name: 'Giants', abbr: 'NYG', conference: 'NFC', division: 'East', theme: { titleColor: '#A71930', borderColor: '#A71930', tintColor: '#0B2265' } },
  PHI: { city: 'Philadelphia', name: 'Eagles', abbr: 'PHI', conference: 'NFC', division: 'East', theme: { titleColor: '#A5ACAF', borderColor: '#A5ACAF', tintColor: '#004C54' } },
  WAS: { city: 'Washington', name: 'Commanders', abbr: 'WAS', conference: 'NFC', division: 'East', theme: { titleColor: '#FFB612', borderColor: '#FFB612', tintColor: '#5A1414' } },
  // NFC North
  CHI: { city: 'Chicago', name: 'Bears', abbr: 'CHI', conference: 'NFC', division: 'North', theme: { titleColor: '#C83803', borderColor: '#C83803', tintColor: '#0B162A' } },
  DET: { city: 'Detroit', name: 'Lions', abbr: 'DET', conference: 'NFC', division: 'North', theme: { titleColor: '#B0B7BC', borderColor: '#B0B7BC', tintColor: '#0076B6' } },
  GB:  { city: 'Green Bay', name: 'Packers', abbr: 'GB', conference: 'NFC', division: 'North', theme: { titleColor: '#FFB612', borderColor: '#FFB612', tintColor: '#203731' } },
  MIN: { city: 'Minnesota', name: 'Vikings', abbr: 'MIN', conference: 'NFC', division: 'North', theme: { titleColor: '#FFC62F', borderColor: '#FFC62F', tintColor: '#4F2683' } },
  // NFC South
  ATL: { city: 'Atlanta', name: 'Falcons', abbr: 'ATL', conference: 'NFC', division: 'South', theme: { titleColor: '#000000', borderColor: '#A5ACAF', tintColor: '#A71930' } },
  CAR: { city: 'Carolina', name: 'Panthers', abbr: 'CAR', conference: 'NFC', division: 'South', theme: { titleColor: '#101820', borderColor: '#BFC0BF', tintColor: '#0085CA' } },
  NO:  { city: 'New Orleans', name: 'Saints', abbr: 'NO', conference: 'NFC', division: 'South', theme: { titleColor: '#D3BC8D', borderColor: '#D3BC8D', tintColor: '#101820' } },
  TB:  { city: 'Tampa Bay', name: 'Buccaneers', abbr: 'TB', conference: 'NFC', division: 'South', theme: { titleColor: '#FF7900', borderColor: '#FF7900', tintColor: '#D50A0A' } },
  // NFC West
  ARI: { city: 'Arizona', name: 'Cardinals', abbr: 'ARI', conference: 'NFC', division: 'West', theme: { titleColor: '#FFFFFF', borderColor: '#FFB612', tintColor: '#97233F' } },
  LAR: { city: 'Los Angeles', name: 'Rams', abbr: 'LAR', conference: 'NFC', division: 'West', theme: { titleColor: '#FFA300', borderColor: '#FFA300', tintColor: '#003594' } },
  SF:  { city: 'San Francisco', name: '49ers', abbr: 'SF', conference: 'NFC', division: 'West', theme: { titleColor: '#B3995D', borderColor: '#B3995D', tintColor: '#AA0000' } },
  SEA: { city: 'Seattle', name: 'Seahawks', abbr: 'SEA', conference: 'NFC', division: 'West', theme: { titleColor: '#69BE28', borderColor: '#69BE28', tintColor: '#002244' } },
};

export const NFL_TEAM_ABBRS = Object.keys(NFL_TEAMS);
