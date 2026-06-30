import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeName, parseCsv, parseEraRosters } from './lib/local-era-audit.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

const ERA_CONFIG = {
  magic_bird: { seasonStart: 1983, season: 1984, era: '1980s', pace: 101, leaguePace: 101, leagueThreePointPct: 0.25, leagueFreeThrowPct: 0.76, positionMinutesBaseline: 35 },
  jordan: { seasonStart: 1991, season: 1992, era: '1990s', pace: 96, leaguePace: 96, leagueThreePointPct: 0.33, leagueFreeThrowPct: 0.76, positionMinutesBaseline: 35 },
  kobe: { seasonStart: 2002, season: 2003, era: '2000s', pace: 91, leaguePace: 91, leagueThreePointPct: 0.35, leagueFreeThrowPct: 0.75, positionMinutesBaseline: 35 },
  lebron: { seasonStart: 2010, season: 2011, era: '2010s', pace: 92, leaguePace: 92, leagueThreePointPct: 0.358, leagueFreeThrowPct: 0.763, positionMinutesBaseline: 34 },
  steph: { seasonStart: 2016, season: 2017, era: '2010s', pace: 97, leaguePace: 97, leagueThreePointPct: 0.358, leagueFreeThrowPct: 0.772, positionMinutesBaseline: 33 },
};

const NAME_ALIASES = {
  [normalizeName('Nene Hilario')]: normalizeName('Nene'),
  [normalizeName('Ron Artest')]: normalizeName('Metta World Peace'),
  [normalizeName('D Angelo Russell')]: normalizeName("D'Angelo Russell"),
  [normalizeName('David Greenwood')]: normalizeName('Dave Greenwood'),
  [normalizeName('Chris Jackson')]: normalizeName('Mahmoud Abdul-Rauf'),
  [normalizeName('Armon Gilliam')]: normalizeName('Armen Gilliam'),
  [normalizeName('Otto Porter Jr')]: normalizeName('Otto Porter'),
};

const SEASON_SOURCE_OVERRIDES = {
  [`${profileExactKey('Ben Simmons')}|2016`]: {
    minutesPerGame: 0,
    pointsPerGame: 0,
    reboundsPerGame: 0,
    assistsPerGame: 0,
    stealsPerGame: 0,
    blocksPerGame: 0,
    fieldGoalPct: 0.45,
    trueShootingPct: 0.5,
    effectiveFieldGoalPct: 0.5,
    threePointPct: 0,
    threePointAttemptsPerGame: 0,
    freeThrowAttemptsPerGame: 0,
    usagePct: 12,
    assistPct: 10,
    turnoverPct: 14,
    winShares: 0,
    defensiveWinShares: 0,
    rimAttemptRate: 0.1,
    dunkRate: 0.03,
    driveRate: 0.08,
    transitionRate: 0.06,
    postTouchRate: 0.04,
    awardWeight: 7,
    tagsToAdd: ['pre_breakout', 'season_unavailable'],
    tagsToRemove: ['all_star', 'floor_general', 'elite_passer', 'high_usage_creator'],
  },
};

const SCOUTING_TAGS = {
  'lebron james': ['generational', 'elite_rim_pressure', 'high_usage_creator', 'defensive_wing_assignment', 'floor_general'],
  'dwyane wade': ['mvp', 'elite_rim_pressure', 'elite_burst', 'high_usage_creator', 'defensive_wing_assignment'],
  'chris bosh': ['all_star', 'midrange_big', 'switch_big'],
  'derrick rose': ['mvp', 'elite_rim_pressure', 'elite_burst', 'high_usage_creator'],
  'luol deng': ['defensive_wing_assignment', 'high_motor', 'two_way_connector'],
  'joakim noah': ['defensive_anchor', 'elite_rebounder', 'high_motor', 'connector_big'],
  'carlos boozer': ['post_scorer', 'elite_rebounder'],
  'kobe bryant': ['mvp', 'high_usage_creator', 'elite_midrange', 'defensive_wing_assignment', 'killer_instinct'],
  'chris paul': ['floor_general', 'elite_passer', 'point_of_attack_defender', 'killer_instinct'],
  'kevin durant': ['mvp', 'high_usage_creator', 'elite_shooter', 'elite_midrange'],
  'stephen curry': ['mvp', 'elite_shooter', 'floor_general', 'high_usage_creator'],
  'ray allen': ['elite_shooter', 'elite_midrange'],
  'kyle korver': ['elite_shooter'],
  'dirk nowitzki': ['mvp', 'elite_shooter', 'elite_midrange', 'post_scorer'],
  'dwight howard': ['mvp', 'defensive_anchor', 'rim_protector', 'elite_rebounder'],
  'kevin garnett': ['mvp', 'defensive_anchor', 'elite_rebounder', 'midrange_big'],
  'tim duncan': ['mvp', 'defensive_anchor', 'post_scorer', 'elite_rebounder'],
  'pau gasol': ['all_star', 'post_scorer', 'midrange_big', 'connector_big'],
  'rajon rondo': ['floor_general', 'elite_passer', 'point_of_attack_defender'],
  'andre iguodala': ['defensive_wing_assignment', 'two_way_connector'],
  'tony allen': ['defensive_wing_assignment', 'point_of_attack_defender'],
  'tyson chandler': ['defensive_anchor', 'rim_protector', 'elite_rebounder'],
  'ben wallace': ['defensive_anchor', 'rim_protector', 'elite_rebounder'],
  'serge ibaka': ['rim_protector', 'defensive_anchor'],
  'marc gasol': ['defensive_anchor', 'connector_big', 'post_scorer'],
  'blake griffin': ['elite_rim_pressure', 'elite_burst', 'post_scorer'],
  'james harden': ['high_usage_creator', 'elite_passer'],
  'russell westbrook': ['elite_rim_pressure', 'elite_burst', 'high_usage_creator'],
  'kevin love': ['elite_rebounder', 'elite_shooter'],
  'steve nash': ['mvp', 'floor_general', 'elite_passer', 'elite_shooter'],
  'carmelo anthony': ['high_usage_creator', 'elite_midrange', 'post_scorer'],
  'paul pierce': ['high_usage_creator', 'elite_midrange', 'killer_instinct'],
  'vince carter': ['elite_rim_pressure', 'elite_burst', 'high_usage_creator'],
  'tracy mcgrady': ['high_usage_creator', 'elite_midrange', 'elite_burst'],
  'shaq oneal': ['mvp', 'defensive_anchor', 'post_scorer', 'elite_rebounder'],
  'shaquille oneal': ['mvp', 'defensive_anchor', 'post_scorer', 'elite_rebounder'],
  'michael jordan': ['mvp', 'high_usage_creator', 'elite_midrange', 'elite_burst', 'defensive_wing_assignment'],
  'scottie pippen': ['defensive_wing_assignment', 'floor_general', 'two_way_connector'],
  'magic johnson': ['mvp', 'floor_general', 'elite_passer', 'high_usage_creator'],
  'larry bird': ['mvp', 'elite_shooter', 'elite_midrange', 'floor_general'],
  'hakeem olajuwon': ['mvp', 'defensive_anchor', 'rim_protector', 'post_scorer'],
  'patrick ewing': ['defensive_anchor', 'post_scorer', 'elite_rebounder'],
  'david robinson': ['mvp', 'defensive_anchor', 'rim_protector', 'elite_rebounder'],
  'charles barkley': ['mvp', 'elite_rebounder', 'post_scorer', 'elite_rim_pressure'],
  'john stockton': ['floor_general', 'elite_passer', 'point_of_attack_defender'],
  'karl malone': ['mvp', 'post_scorer', 'elite_rebounder'],
  'dominique wilkins': ['high_usage_creator', 'elite_rim_pressure', 'elite_burst'],
};

function headerIndex(headers, ...names) {
  const normalized = headers.map(header => String(header).toLowerCase().trim());
  for (const name of names) {
    const index = normalized.indexOf(name);
    if (index >= 0) return index;
  }
  return -1;
}

function numberFrom(value, fallback = 0) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const numeric = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(numeric) ? numeric : fallback;
}

function profileExactKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.'`]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pct(value, fallback) {
  const numeric = numberFrom(value, fallback);
  if (!Number.isFinite(numeric)) return fallback;
  return numeric > 1 ? numeric / 100 : numeric;
}

function draftPick(value) {
  const match = String(value || '').match(/\d+/);
  return match ? Number(match[0]) : undefined;
}

function isoBirthDate(value) {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
}

function ageFromBirthDate(value, seasonStart) {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return undefined;
  const age = seasonStart - date.getUTCFullYear();
  return age > 15 && age < 60 ? age : undefined;
}

function playerSlug(name, season) {
  return `${normalizeName(name).replace(/\s+/g, '-')}-${season}`;
}

function buildProfileIndex(playersCsv) {
  const rows = parseCsv(playersCsv);
  const headers = rows[0] || [];
  const indexes = {
    id: headerIndex(headers, '_id', 'player_id'),
    name: headerIndex(headers, 'name', 'full_name'),
    birthDate: headerIndex(headers, 'birthdate', 'birth_date'),
    position: headerIndex(headers, 'position', 'pos'),
    ppg: headerIndex(headers, 'career_pts'),
    rpg: headerIndex(headers, 'career_trb'),
    apg: headerIndex(headers, 'career_ast'),
    fg: headerIndex(headers, 'career_fg%'),
    fg3: headerIndex(headers, 'career_fg3%'),
    ft: headerIndex(headers, 'career_ft%'),
    games: headerIndex(headers, 'career_g'),
    per: headerIndex(headers, 'career_per'),
    ws: headerIndex(headers, 'career_ws'),
    efg: headerIndex(headers, 'career_efg%'),
    draftPick: headerIndex(headers, 'draft_pick'),
  };
  const byName = {};
  const byExactName = {};
  const idToName = {};
  for (const row of rows.slice(1)) {
    const name = row[indexes.name];
    const id = row[indexes.id];
    if (!name) continue;
    const profile = {
      id,
      full_name: name,
      birthDate: row[indexes.birthDate],
      position: row[indexes.position],
      ppg: numberFrom(row[indexes.ppg]),
      rpg: numberFrom(row[indexes.rpg]),
      apg: numberFrom(row[indexes.apg]),
      fg: pct(row[indexes.fg], 0.45),
      fg3: pct(row[indexes.fg3], 0.32),
      ft: pct(row[indexes.ft], 0.75),
      games: numberFrom(row[indexes.games]),
      per: numberFrom(row[indexes.per]),
      ws: numberFrom(row[indexes.ws]),
      efg: pct(row[indexes.efg], 0.5),
      draftPick: draftPick(row[indexes.draftPick]),
    };
    const exact = profileExactKey(name);
    const exactExisting = byExactName[exact];
    if (!exactExisting || profileConfidence(profile) > profileConfidence(exactExisting)) {
      byExactName[exact] = profile;
    }
    const normalized = normalizeName(name);
    const existing = byName[normalized];
    if (!existing) {
      byName[normalized] = profile;
    } else if (profileExactKey(existing.full_name) === exact && profileConfidence(profile) > profileConfidence(existing)) {
      byName[normalized] = profile;
    }
    if (id) idToName[id] = name;
  }
  return { byName, byExactName, idToName };
}

function profileConfidence(profile) {
  const birthYear = Number(String(profile.birthDate || '').slice(0, 4));
  const validBirthDate = Number.isFinite(birthYear) && birthYear >= 1940 && birthYear <= 2008;
  return (
    (validBirthDate ? 1000 : 0)
    + numberFrom(profile.games) * 0.4
    + numberFrom(profile.ppg) * 12
    + numberFrom(profile.rpg) * 9
    + numberFrom(profile.apg) * 8
    + numberFrom(profile.ws) * 2
    + numberFrom(profile.per) * 5
  );
}

function buildSalaryIndex(salariesCsv, idToName) {
  const rows = parseCsv(salariesCsv);
  const headers = rows[0] || [];
  const playerIdIndex = headerIndex(headers, 'player_id');
  const salaryIndex = headerIndex(headers, 'salary');
  const seasonStartIndex = headerIndex(headers, 'season_start');
  const byNameYear = {};
  for (const row of rows.slice(1)) {
    const name = idToName[row[playerIdIndex]];
    if (!name) continue;
    const year = String(row[seasonStartIndex] || '').slice(0, 4);
    const salary = Math.round(numberFrom(row[salaryIndex]));
    if (!year || salary <= 0) continue;
    const key = normalizeName(name);
    byNameYear[key] = byNameYear[key] || {};
    byNameYear[key][year] = salary;
  }
  return byNameYear;
}

function estimateMinutes(profile, salary) {
  const impact = profile.ppg + profile.rpg * 0.65 + profile.apg * 0.9 + profile.per * 0.55 + Math.min(10, profile.ws / 12);
  const salarySignal = salary >= 12_000_000 ? 5 : salary >= 8_000_000 ? 3 : salary >= 4_000_000 ? 1.5 : 0;
  return Math.round(Math.max(15, Math.min(39, 16 + impact * 0.42 + salarySignal)));
}

function roleSignal(profile, salary) {
  return profile.ppg * 1.4 + profile.rpg * 0.9 + profile.apg * 1.1 + profile.per * 0.65 + Math.min(14, profile.ws / 10) + (salary >= 8_000_000 ? 6 : salary >= 4_000_000 ? 3 : 0);
}

function tagsFor(name, profile, salary) {
  const normalized = normalizeName(name);
  const tags = new Set(SCOUTING_TAGS[normalized] || []);
  if (roleSignal(profile, salary) >= 57) tags.add('all_star');
  if (profile.ppg >= 20) tags.add('high_usage_creator');
  if (profile.apg >= 7) tags.add('floor_general');
  if (profile.apg >= 8.5) tags.add('elite_passer');
  if (profile.rpg >= 9) tags.add('elite_rebounder');
  if (profile.fg3 >= 0.385 && profile.ppg >= 8) tags.add('elite_shooter');
  if (profile.per >= 22 || profile.ws >= 120) tags.add('mvp');
  return [...tags];
}

function hasShootingSample(profile) {
  return Number.isFinite(profile.fg3) && profile.fg3 >= 0.12;
}

function sourceForPlayer(player, profile, salary, config) {
  let tags = tagsFor(player.full_name, profile, salary);
  const isGuard = /PG|SG|G/i.test(player.position || profile.position);
  const isBig = /PF|C/i.test(player.position || profile.position);
  const age = ageFromBirthDate(profile.birthDate, config.seasonStart);
  const lateCareer = Number(age) >= 37;
  if (lateCareer) {
    tags = tags.filter(tag => !['elite_burst', 'elite_rim_pressure'].includes(tag));
  }
  const override = SEASON_SOURCE_OVERRIDES[`${profileExactKey(player.full_name)}|${config.seasonStart}`] || {};
  if (override.tagsToRemove) {
    tags = tags.filter(tag => !override.tagsToRemove.includes(tag));
  }
  if (override.tagsToAdd) {
    tags = [...new Set([...tags, ...override.tagsToAdd])];
  }
  const shootingSample = hasShootingSample(profile);
  const productionScale = lateCareer ? 0.66 : 1;
  const ppg = numberFrom(override.pointsPerGame, profile.ppg * productionScale);
  const rpg = numberFrom(override.reboundsPerGame, profile.rpg * (lateCareer ? 0.82 : 1));
  const apg = numberFrom(override.assistsPerGame, profile.apg * (lateCareer ? 0.88 : 1));
  const minutes = numberFrom(override.minutesPerGame, lateCareer ? Math.min(34, estimateMinutes(profile, salary)) : estimateMinutes(profile, salary));
  const star = roleSignal(profile, salary);
  const uncappedThreeAttempts = !shootingSample && isBig
    ? 0.1
    : tags.includes('elite_shooter')
    ? 5.6
    : isGuard ? 3.4
      : /SF/i.test(player.position || profile.position) ? 2.6
        : isBig ? 0.8 : 1.8;
  const threeAttempts = numberFrom(override.threePointAttemptsPerGame, uncappedThreeAttempts);
  const freeThrowAttempts = numberFrom(override.freeThrowAttemptsPerGame, Math.max(1.2, Math.min(9.5, ppg * 0.24 + (tags.includes('elite_rim_pressure') ? 2.2 : 0) + (isBig ? 0.5 : 0))));
  const usage = numberFrom(override.usagePct, Math.max(12, Math.min(34, 13 + ppg * 0.65 + apg * 0.45 + (tags.includes('high_usage_creator') ? 4 : 0))));
  const defensiveWinShares = Math.max(0.8, Math.min(5.8, profile.ws / 24 + (tags.includes('defensive_anchor') ? 1.6 : 0) + (tags.includes('defensive_wing_assignment') ? 1.1 : 0)));
  const winShares = Math.max(1, Math.min(16, profile.ws / 11 + (salary >= 8_000_000 ? 1.2 : 0)));

  return {
    player_id: playerSlug(player.full_name, config.season),
    full_name: player.full_name,
    team: player.team,
    position: player.position || profile.position,
    age,
    birthDate: isoBirthDate(profile.birthDate),
    games: Math.max(50, Math.min(82, Math.round(68 + Math.min(12, profile.games / 120)))),
    minutesPerGame: minutes,
    pointsPerGame: ppg,
    reboundsPerGame: rpg,
    assistsPerGame: apg,
    stealsPerGame: numberFrom(override.stealsPerGame, Math.max(0.3, Math.min(2.4, 0.45 + apg * 0.08 + (tags.includes('point_of_attack_defender') ? 0.8 : 0) + (tags.includes('defensive_wing_assignment') ? 0.45 : 0)))),
    blocksPerGame: numberFrom(override.blocksPerGame, Math.max(0.1, Math.min(3.1, isBig ? 0.55 + rpg * 0.12 + (tags.includes('rim_protector') ? 1.2 : 0) : 0.2 + rpg * 0.04))),
    fieldGoalPct: numberFrom(override.fieldGoalPct, profile.fg || 0.45),
    trueShootingPct: numberFrom(override.trueShootingPct, Math.max(0.45, Math.min(0.66, (profile.efg || profile.fg || 0.5) + profile.ft * 0.055 + (tags.includes('elite_shooter') ? 0.018 : 0)))),
    effectiveFieldGoalPct: numberFrom(override.effectiveFieldGoalPct, profile.efg || profile.fg || 0.5),
    threePointPct: numberFrom(override.threePointPct, shootingSample ? profile.fg3 : isBig ? 0.05 : Math.max(0.24, config.leagueThreePointPct - 0.08)),
    threePointAttemptsPerGame: threeAttempts,
    freeThrowPct: numberFrom(override.freeThrowPct, profile.ft || config.leagueFreeThrowPct),
    freeThrowAttemptsPerGame: freeThrowAttempts,
    usagePct: usage,
    assistPct: numberFrom(override.assistPct, Math.max(5, Math.min(48, apg * 4.1 + (isGuard ? 8 : 0) + (tags.includes('floor_general') ? 6 : 0)))),
    turnoverPct: numberFrom(override.turnoverPct, Math.max(8, Math.min(16, 13.5 - apg * 0.2 + (usage > 27 ? 1.1 : 0)))),
    defensiveWinShares: numberFrom(override.defensiveWinShares, defensiveWinShares),
    winShares: numberFrom(override.winShares, winShares),
    draftPick: profile.draftPick,
    offensiveReboundPct: isBig ? Math.max(6, Math.min(14, rpg * 0.9)) : Math.max(1, Math.min(5, rpg * 0.35)),
    defensiveReboundPct: isBig ? Math.max(16, Math.min(30, rpg * 1.9)) : Math.max(7, Math.min(18, rpg * 1.25)),
    rimAttemptRate: numberFrom(override.rimAttemptRate, tags.includes('elite_rim_pressure') ? 0.4 : isBig ? 0.34 : 0.22),
    dunkRate: numberFrom(override.dunkRate, tags.includes('elite_rim_pressure') ? 0.13 : isBig ? 0.1 : 0.04),
    midRangeAttemptRate: tags.includes('elite_midrange') || tags.includes('midrange_big') ? 0.32 : 0.12,
    threePointAttemptRate: Math.max(0.04, Math.min(0.48, threeAttempts / Math.max(8, ppg * 0.9))),
    catchAndShootRate: tags.includes('elite_shooter') ? 0.36 : 0.18,
    pullUpRate: tags.includes('high_usage_creator') ? 0.28 : 0.12,
    driveRate: numberFrom(override.driveRate, tags.includes('elite_rim_pressure') ? 0.4 : isGuard ? 0.28 : 0.16),
    transitionRate: numberFrom(override.transitionRate, tags.includes('elite_burst') ? 0.24 : isGuard ? 0.16 : 0.1),
    postTouchRate: numberFrom(override.postTouchRate, tags.includes('post_scorer') ? 0.32 : isBig ? 0.18 : 0.05),
    awardWeight: numberFrom(override.awardWeight, tags.includes('generational') ? 10 : tags.includes('mvp') ? 7 : tags.includes('all_star') ? 4 : star >= 42 ? 2 : 0),
    scoutingTags: tags,
  };
}

function compact(value) {
  return JSON.stringify(value, null, 2).replace(/"([^"]+)":/g, '$1:');
}

function main() {
  const rosterSource = readFileSync(resolve(ROOT, 'scripts/seed-era-rosters.mjs'), 'utf8');
  const rosters = parseEraRosters(rosterSource);
  const playersCsv = readFileSync(resolve(ROOT, 'players.csv'), 'utf8');
  const salariesCsv = readFileSync(resolve(ROOT, 'salaries_1985to2018.csv'), 'utf8');
  const { byName, byExactName, idToName } = buildProfileIndex(playersCsv);
  const salaries = buildSalaryIndex(salariesCsv, idToName);

  const seeds = [];
  for (const [era, teams] of Object.entries(rosters)) {
    const config = ERA_CONFIG[era];
    if (!config) continue;
    for (const team of teams) {
      for (const player of team.players || []) {
        const key = NAME_ALIASES[normalizeName(player.full_name)] || normalizeName(player.full_name);
        const profile = byExactName[profileExactKey(player.full_name)] || byName[key];
        if (!profile) continue;
        const salary = (salaries[key] || {})[String(config.seasonStart)] || 0;
        seeds.push({
          snapshotId: `generated-${config.season}`,
          leagueContext: {
            season: config.season,
            pace: config.pace,
            leagueThreePointPct: config.leagueThreePointPct,
            leagueFreeThrowPct: config.leagueFreeThrowPct,
          },
          eraContext: {
            season: config.season,
            era: config.era,
            pace: config.pace,
            leaguePace: config.leaguePace,
            leagueThreePointPct: config.leagueThreePointPct,
            positionMinutesBaseline: config.positionMinutesBaseline,
          },
          source: sourceForPlayer(player, profile, salary, config),
        });
      }
    }
  }

  const output = [
    "import type { BaselineSeed } from './ratingSeeds';",
    '',
    '// Generated from local public basketball stat and era roster sources.',
    '// Run scripts/generate-nba-rating-seeds.mjs after source data changes.',
    `export const generatedRatingSeeds: BaselineSeed[] = ${compact(seeds)};`,
    '',
  ].join('\n');
  writeFileSync(resolve(ROOT, 'domain/nba/generatedRatingSeeds.ts'), output);
  console.log(`Wrote ${seeds.length} generated NBA rating seeds.`);
}

main();
