// MLB team data for Franchise Mobile leagues.
// Same SportTeam shape as the NFL table. Abbreviations follow the MLB Stats API
// team codes so they line up with the seeded player pool.

import type { SportTeam } from './nflTeams';

// conference field holds the league (AL / NL) for baseball.
export const MLB_TEAMS: Record<string, SportTeam> = {
  // AL East
  BAL: { city: 'Baltimore', name: 'Orioles', abbr: 'BAL', conference: 'AL', division: 'East', theme: { titleColor: '#000000', borderColor: '#000000', tintColor: '#DF4601' } },
  BOS: { city: 'Boston', name: 'Red Sox', abbr: 'BOS', conference: 'AL', division: 'East', theme: { titleColor: '#0C2340', borderColor: '#0C2340', tintColor: '#BD3039' } },
  NYY: { city: 'New York', name: 'Yankees', abbr: 'NYY', conference: 'AL', division: 'East', theme: { titleColor: '#FFFFFF', borderColor: '#FFFFFF', tintColor: '#003087' } },
  TB:  { city: 'Tampa Bay', name: 'Rays', abbr: 'TB', conference: 'AL', division: 'East', theme: { titleColor: '#8FBCE6', borderColor: '#F5D130', tintColor: '#092C5C' } },
  TOR: { city: 'Toronto', name: 'Blue Jays', abbr: 'TOR', conference: 'AL', division: 'East', theme: { titleColor: '#E8291C', borderColor: '#E8291C', tintColor: '#134A8E' } },
  // AL Central
  CWS: { city: 'Chicago', name: 'White Sox', abbr: 'CWS', conference: 'AL', division: 'Central', theme: { titleColor: '#C4CED4', borderColor: '#C4CED4', tintColor: '#27251F' } },
  CLE: { city: 'Cleveland', name: 'Guardians', abbr: 'CLE', conference: 'AL', division: 'Central', theme: { titleColor: '#E50022', borderColor: '#E50022', tintColor: '#00385D' } },
  DET: { city: 'Detroit', name: 'Tigers', abbr: 'DET', conference: 'AL', division: 'Central', theme: { titleColor: '#FA4616', borderColor: '#FA4616', tintColor: '#0C2340' } },
  KC:  { city: 'Kansas City', name: 'Royals', abbr: 'KC', conference: 'AL', division: 'Central', theme: { titleColor: '#BD9B60', borderColor: '#BD9B60', tintColor: '#004687' } },
  MIN: { city: 'Minnesota', name: 'Twins', abbr: 'MIN', conference: 'AL', division: 'Central', theme: { titleColor: '#D31145', borderColor: '#B9975B', tintColor: '#002B5C' } },
  // AL West
  HOU: { city: 'Houston', name: 'Astros', abbr: 'HOU', conference: 'AL', division: 'West', theme: { titleColor: '#EB6E1F', borderColor: '#EB6E1F', tintColor: '#002D62' } },
  LAA: { city: 'Los Angeles', name: 'Angels', abbr: 'LAA', conference: 'AL', division: 'West', theme: { titleColor: '#003263', borderColor: '#862633', tintColor: '#BA0021' } },
  ATH: { city: 'Athletics', name: 'Athletics', abbr: 'ATH', conference: 'AL', division: 'West', theme: { titleColor: '#EFB21E', borderColor: '#EFB21E', tintColor: '#003831' } },
  SEA: { city: 'Seattle', name: 'Mariners', abbr: 'SEA', conference: 'AL', division: 'West', theme: { titleColor: '#005C5C', borderColor: '#C4CED4', tintColor: '#0C2C56' } },
  TEX: { city: 'Texas', name: 'Rangers', abbr: 'TEX', conference: 'AL', division: 'West', theme: { titleColor: '#C0111F', borderColor: '#C0111F', tintColor: '#003278' } },
  // NL East
  ATL: { city: 'Atlanta', name: 'Braves', abbr: 'ATL', conference: 'NL', division: 'East', theme: { titleColor: '#CE1141', borderColor: '#CE1141', tintColor: '#13274F' } },
  MIA: { city: 'Miami', name: 'Marlins', abbr: 'MIA', conference: 'NL', division: 'East', theme: { titleColor: '#EF3340', borderColor: '#000000', tintColor: '#00A3E0' } },
  NYM: { city: 'New York', name: 'Mets', abbr: 'NYM', conference: 'NL', division: 'East', theme: { titleColor: '#FF5910', borderColor: '#FF5910', tintColor: '#002D72' } },
  PHI: { city: 'Philadelphia', name: 'Phillies', abbr: 'PHI', conference: 'NL', division: 'East', theme: { titleColor: '#002D72', borderColor: '#002D72', tintColor: '#E81828' } },
  WSH: { city: 'Washington', name: 'Nationals', abbr: 'WSH', conference: 'NL', division: 'East', theme: { titleColor: '#14225A', borderColor: '#14225A', tintColor: '#AB0003' } },
  // NL Central
  CHC: { city: 'Chicago', name: 'Cubs', abbr: 'CHC', conference: 'NL', division: 'Central', theme: { titleColor: '#CC3433', borderColor: '#CC3433', tintColor: '#0E3386' } },
  CIN: { city: 'Cincinnati', name: 'Reds', abbr: 'CIN', conference: 'NL', division: 'Central', theme: { titleColor: '#000000', borderColor: '#000000', tintColor: '#C6011F' } },
  MIL: { city: 'Milwaukee', name: 'Brewers', abbr: 'MIL', conference: 'NL', division: 'Central', theme: { titleColor: '#FFC52F', borderColor: '#FFC52F', tintColor: '#12284B' } },
  PIT: { city: 'Pittsburgh', name: 'Pirates', abbr: 'PIT', conference: 'NL', division: 'Central', theme: { titleColor: '#FDB827', borderColor: '#FDB827', tintColor: '#27251F' } },
  STL: { city: 'St. Louis', name: 'Cardinals', abbr: 'STL', conference: 'NL', division: 'Central', theme: { titleColor: '#FEDB00', borderColor: '#0C2340', tintColor: '#C41E3A' } },
  // NL West
  ARI: { city: 'Arizona', name: 'Diamondbacks', abbr: 'ARI', conference: 'NL', division: 'West', theme: { titleColor: '#E3D4AD', borderColor: '#000000', tintColor: '#A71930' } },
  COL: { city: 'Colorado', name: 'Rockies', abbr: 'COL', conference: 'NL', division: 'West', theme: { titleColor: '#C4CED4', borderColor: '#000000', tintColor: '#33006F' } },
  LAD: { city: 'Los Angeles', name: 'Dodgers', abbr: 'LAD', conference: 'NL', division: 'West', theme: { titleColor: '#EF3E42', borderColor: '#FFFFFF', tintColor: '#005A9C' } },
  SD:  { city: 'San Diego', name: 'Padres', abbr: 'SD', conference: 'NL', division: 'West', theme: { titleColor: '#FFC425', borderColor: '#FFC425', tintColor: '#2F241D' } },
  SF:  { city: 'San Francisco', name: 'Giants', abbr: 'SF', conference: 'NL', division: 'West', theme: { titleColor: '#27251F', borderColor: '#27251F', tintColor: '#FD5A1E' } },
};

export const MLB_TEAM_ABBRS = Object.keys(MLB_TEAMS);
