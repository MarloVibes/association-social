import { NFL_TEAMS, NFL_TEAM_ABBRS, type SportTeam } from './nflTeams';
import { MLB_TEAMS, MLB_TEAM_ABBRS } from './mlbTeams';
import { TEAM_THEME } from './teamColors';

// Single entry point for team metadata across all sports. Basketball keeps using
// its existing TEAM_THEME map; football/baseball use their own tables. Screens
// call these with the league's `sport` instead of hardcoding one sport.

export function getSportTeams(sport: string): Record<string, SportTeam> | null {
  if (sport === 'madden') return NFL_TEAMS;
  if (sport === 'mlb') return MLB_TEAMS;
  return null; // nba handled by its own (era-aware) team system
}

export function getSportTeamAbbrs(sport: string): string[] {
  if (sport === 'madden') return NFL_TEAM_ABBRS;
  if (sport === 'mlb') return MLB_TEAM_ABBRS;
  return [];
}

export function getSportTeam(sport: string, abbr: string): SportTeam | null {
  const teams = getSportTeams(sport);
  return teams ? teams[abbr] || null : null;
}

// Returns the {titleColor, borderColor, tintColor} theme for any team in any
// sport, falling back to a neutral dark theme for unknown teams.
export function getSportTeamTheme(sport: string, abbr: string) {
  if (sport === 'nba') {
    return TEAM_THEME[abbr] || { titleColor: '#FFFFFF', borderColor: '#2a2a2a', tintColor: '#1a1a1a' };
  }
  const team = getSportTeam(sport, abbr);
  return team ? team.theme : { titleColor: '#FFFFFF', borderColor: '#2a2a2a', tintColor: '#1a1a1a' };
}

export function getSportTeamName(sport: string, abbr: string): string {
  const team = getSportTeam(sport, abbr);
  return team ? `${team.city} ${team.name}` : abbr;
}

// Real team logos via ESPN's public CDN. Our abbreviations mostly match ESPN's
// lowercase filenames; the few that differ are mapped here. NBA keeps its own
// local-asset logo system (getTeamLogoLocal/Url in teamColors).
const ESPN_LEAGUE: Record<string, string> = { madden: 'nfl', mlb: 'mlb' };
const ESPN_ABBR_OVERRIDE: Record<string, Record<string, string>> = {
  madden: { WAS: 'wsh' },
  mlb: { CWS: 'chw', ATH: 'oak' },
};
export function getSportLogoUrl(sport: string, abbr: string): string {
  const league = ESPN_LEAGUE[sport];
  if (!league || !abbr) return '';
  const mapped = (ESPN_ABBR_OVERRIDE[sport] && ESPN_ABBR_OVERRIDE[sport][abbr]) || abbr;
  return `https://a.espncdn.com/i/teamlogos/${league}/500/${mapped.toLowerCase()}.png`;
}
