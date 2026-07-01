'use strict';

const { baselineProfiles } = require('./baselineProfiles.generated');

const ERA_TO_SEASON = {
  magic_bird: 1984,
  jordan: 1992,
  kobe: 2003,
  lebron: 2011,
  steph: 2017,
  current: 2026,
};

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeTeam(value) {
  return String(value || '').toUpperCase().trim();
}

function gradeFromRating(value) {
  const rating = Number(value);
  if (!Number.isFinite(rating)) return undefined;
  if (rating >= 99) return 'S';
  if (rating >= 95) return 'A+';
  if (rating >= 92) return 'A';
  if (rating >= 89) return 'A-';
  if (rating >= 85) return 'B+';
  if (rating >= 80) return 'B';
  if (rating >= 75) return 'B-';
  if (rating >= 70) return 'C+';
  if (rating >= 65) return 'C';
  if (rating >= 60) return 'C-';
  if (rating >= 57) return 'D+';
  if (rating >= 53) return 'D';
  if (rating >= 50) return 'D-';
  return 'F';
}

function skillGradesFromProfile(profile) {
  if (profile && profile.skill_grades) return profile.skill_grades;
  const attributes = (profile && (profile.era_adjusted_profiles || profile.attribute_model)) || {};
  return Object.fromEntries(
    Object.entries(attributes)
      .map(([key, value]) => [key, gradeFromRating(value)])
      .filter(([, grade]) => Boolean(grade)),
  );
}

function seasonFromContext(player, context = {}) {
  const exactSeason = Number(player && player.season);
  if (Number.isFinite(exactSeason) && exactSeason > 1900) {
    return exactSeason;
  }

  const rollingYearValues = [
    player && player.currentYear,
    player && player.leagueYear,
    context.currentYear,
  ];
  for (const value of rollingYearValues) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 1900) {
      return numeric < 2100 ? numeric + 1 : numeric;
    }
  }

  const era = String((player && player.era) || context.era || '').toLowerCase();
  return ERA_TO_SEASON[era] || null;
}

function resolveBaselineRatingProfile(player, context = {}) {
  const name = normalizeName(player && (player.full_name || player.name));
  if (!name) return null;
  const team = normalizeTeam(player && (player.team || player.teamAbbr || player.abbreviation || player.teamId));
  const targetSeason = seasonFromContext(player, context);
  const candidates = baselineProfiles.filter(profile => normalizeName(profile.full_name) === name);
  if (candidates.length === 0) return null;

  const seasonMatches = targetSeason
    ? candidates.filter(profile => profile.season === targetSeason)
    : candidates;
  const pool = seasonMatches.length > 0 ? seasonMatches : candidates;
  return pool.find(profile => team && normalizeTeam(profile.team) === team)
    || pool[0]
    || null;
}

function mergeBaselineRatingProfile(player, context = {}) {
  if (!player || typeof player !== 'object') return player;
  if (player.baselineRatingProfile) return player;
  const profile = resolveBaselineRatingProfile(player, context);
  if (!profile) return player;
  return {
    ...player,
    baselineRatingProfile: profile,
    category_skill_grades: profile.category_skill_grades || player.category_skill_grades,
    skill_grades: skillGradesFromProfile(profile) || player.skill_grades,
    era_adjusted_profiles: profile.era_adjusted_profiles || player.era_adjusted_profiles,
    attribute_model: profile.attribute_model || player.attribute_model,
    development_curve: profile.development_curve || player.development_curve,
    tendencies: profile.tendencies || player.tendencies,
  };
}

module.exports = {
  mergeBaselineRatingProfile,
  resolveBaselineRatingProfile,
};
