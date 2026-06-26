'use strict';

const TEAM_COLORS = {
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
  SEA: ['#00653A', '#FFC200', '#ffffff'],
  NJN: ['#BEC0C2', '#002A60', '#ffffff'],
  NOH: ['#0C2340', '#C8102E', '#ffffff'],
  NOK: ['#C8102E', '#0C2340', '#ffffff'],
  VAN: ['#00B2A9', '#1D1160', '#ffffff'],
  KCK: ['#5A2D81', '#63727A', '#ffffff'],
  CHA_old: ['#00788C', '#1D1160', '#ffffff'],
};

const TEAM_REBRAND = {
  SEA: { year: 2008, newAbbr: 'OKC' },
  NJN: { year: 2012, newAbbr: 'BKN' },
  NOK: { year: 2005, newAbbr: 'NOH' },
  NOH: { year: 2013, newAbbr: 'NOP' },
  VAN: { year: 2001, newAbbr: 'MEM' },
  KCK: { year: 1985, newAbbr: 'SAC' },
};

const FALLBACK_ABBR = 'NBA';
const FALLBACK_PRIMARY = '#1a1a1a';
const FALLBACK_SECONDARY = '#333333';
const FALLBACK_TEXT = '#ffffff';

function buildArenaTheme(input) {
  const source = input || {};
  const normalizedAbbr = normalizeAbbr(source.homeAbbr);
  const currentYear = Number.isFinite(source.currentYear) ? Number(source.currentYear) : undefined;
  const providedPrimary = usableHexColor(source.primaryColor);
  const providedSecondary = usableHexColor(source.secondaryColor);
  const knownTeam = normalizedAbbr ? isKnownTeam(normalizedAbbr, currentYear) : false;

  const homeAbbr = knownTeam
    ? getCurrentTeamAbbr(normalizedAbbr, currentYear || 0)
    : providedPrimary || providedSecondary
      ? normalizedAbbr || FALLBACK_ABBR
      : FALLBACK_ABBR;

  const teamColors = knownTeam
    ? getTeamColors(normalizedAbbr, currentYear)
    : [FALLBACK_PRIMARY, FALLBACK_SECONDARY, FALLBACK_TEXT];
  const primary = knownTeam ? teamColors[0] : providedPrimary || FALLBACK_PRIMARY;
  const secondary = knownTeam ? teamColors[1] : providedSecondary || FALLBACK_SECONDARY;
  const text = knownTeam ? teamColors[2] : FALLBACK_TEXT;

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

function normalizeAbbr(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function usableHexColor(value) {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : null;
}

function isKnownTeam(abbr, currentYear) {
  if (TEAM_COLORS[abbr]) return true;
  if (!currentYear) return false;
  return Boolean(TEAM_COLORS[getCurrentTeamAbbr(abbr, currentYear)]);
}

function getCurrentTeamAbbr(abbr, currentYear) {
  const rebrand = TEAM_REBRAND[abbr];
  if (rebrand && currentYear >= rebrand.year) {
    return getCurrentTeamAbbr(rebrand.newAbbr, currentYear);
  }
  return abbr;
}

function getTeamColors(abbr, currentYear) {
  const effectiveAbbr = currentYear ? getCurrentTeamAbbr(abbr, currentYear) : abbr;
  return TEAM_COLORS[effectiveAbbr] || TEAM_COLORS[abbr] || [FALLBACK_PRIMARY, FALLBACK_SECONDARY, FALLBACK_TEXT];
}

module.exports = {
  buildArenaTheme,
};
