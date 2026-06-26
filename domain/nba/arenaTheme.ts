import { TEAM_COLORS, getCurrentTeamAbbr, getTeamColors } from '@/constants/teamColors';

export type ArenaThemeInput = {
  homeAbbr?: string | null;
  currentYear?: number | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
};

export type ArenaTheme = {
  homeAbbr: string;
  primary: string;
  secondary: string;
  text: string;
  centerText: string;
  laneColor: string;
  sidelineColor: string;
  crowdGlow: string;
  scoreboardTint: string;
};

const FALLBACK_ABBR = 'NBA';
const FALLBACK_PRIMARY = '#1a1a1a';
const FALLBACK_SECONDARY = '#333333';
const FALLBACK_TEXT = '#ffffff';

function normalizeAbbr(value: string | null | undefined): string {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function usableHexColor(value: string | null | undefined): string | null {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : null;
}

function isKnownTeam(abbr: string, currentYear?: number | null): boolean {
  if (TEAM_COLORS[abbr]) return true;
  if (!currentYear) return false;
  return Boolean(TEAM_COLORS[getCurrentTeamAbbr(abbr, currentYear)]);
}

export function buildArenaTheme(input: ArenaThemeInput): ArenaTheme {
  const normalizedAbbr = normalizeAbbr(input.homeAbbr);
  const currentYear = Number.isFinite(input.currentYear) ? Number(input.currentYear) : undefined;
  const providedPrimary = usableHexColor(input.primaryColor);
  const providedSecondary = usableHexColor(input.secondaryColor);
  const knownTeam = normalizedAbbr ? isKnownTeam(normalizedAbbr, currentYear) : false;

  const homeAbbr = knownTeam
    ? getCurrentTeamAbbr(normalizedAbbr, currentYear || 0)
    : providedPrimary || providedSecondary
      ? normalizedAbbr || FALLBACK_ABBR
      : FALLBACK_ABBR;

  const [teamPrimary, teamSecondary, teamText] = knownTeam
    ? getTeamColors(normalizedAbbr, currentYear)
    : [FALLBACK_PRIMARY, FALLBACK_SECONDARY, FALLBACK_TEXT];
  const primary = knownTeam ? teamPrimary : providedPrimary || FALLBACK_PRIMARY;
  const secondary = knownTeam ? teamSecondary : providedSecondary || FALLBACK_SECONDARY;
  const text = knownTeam ? teamText : FALLBACK_TEXT;

  return {
    homeAbbr,
    primary,
    secondary,
    text,
    centerText: homeAbbr,
    laneColor: primary,
    sidelineColor: secondary,
    crowdGlow: primary,
    scoreboardTint: secondary,
  };
}
