import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildBaselineRatingProfiles } from '../../domain/nba/ratingSeeds';
import { gradeRank } from '../../domain/nba/gradeScale';
import { buildScoutingGrades } from '../../domain/nba/scoutingGrades';

describe('rating seed baselines', () => {
  const profiles = () => buildBaselineRatingProfiles();
  const currentPool = () => JSON.parse(readFileSync(resolve(__dirname, '../../data/nba/current-player-pool.json'), 'utf8'));
  const historicalPools = () => [
    { era: 'magic_bird', season: 1984, data: JSON.parse(readFileSync(resolve(__dirname, '../../data/nba/magic_bird-player-pool.json'), 'utf8')) },
    { era: 'jordan', season: 1992, data: JSON.parse(readFileSync(resolve(__dirname, '../../data/nba/jordan-player-pool.json'), 'utf8')) },
    { era: 'kobe', season: 2003, data: JSON.parse(readFileSync(resolve(__dirname, '../../data/nba/kobe-player-pool.json'), 'utf8')) },
    { era: 'lebron', season: 2011, data: JSON.parse(readFileSync(resolve(__dirname, '../../data/nba/lebron-player-pool.json'), 'utf8')) },
    { era: 'steph', season: 2017, data: JSON.parse(readFileSync(resolve(__dirname, '../../data/nba/steph-player-pool.json'), 'utf8')) },
  ];
  const normalizeCoverageKey = (value: unknown) => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
  const findProfile = (name: string, team: string, season: number) => {
    const profile = profiles().find(candidate => (
      candidate.full_name === name
      && candidate.team === team
      && candidate.season === season
    ));
    expect(profile).toBeTruthy();
    return profile!;
  };
  const publicGrades = (profile: any) => buildScoutingGrades(profile, profile);

  it('keeps 2011 LeBron and 2011 Rose as elite potential franchise anchors', () => {
    const profiles = buildBaselineRatingProfiles();
    const lebron2011 = profiles.find(profile => profile.player_id === 'lebron-james-2011');
    const rose2011 = profiles.find(profile => profile.player_id === 'derrick-rose-2011');

    expect(lebron2011?.visibleIdentity?.reputation).toMatch(/Legend|Superstar|Star/);
    expect(rose2011?.visibleIdentity?.reputation).toMatch(/Superstar|Star/);
    expect(lebron2011?.development_curve.potential_grade).toBe('A+');
    expect(rose2011?.development_curve.potential_grade).toBe('A+');
    expect(lebron2011?.age).toBe(26);
    expect(rose2011?.age).toBe(22);
    expect(lebron2011?.category_skill_grades.finishing.grade).toMatch(/^A/);
    expect(lebron2011?.category_skill_grades.playmaking.grade).toMatch(/^A/);
    expect(rose2011?.category_skill_grades.playmaking.grade).toMatch(/^A|S/);
    expect(gradeRank(lebron2011?.skill_grades.passing || 'F')).toBeGreaterThanOrEqual(gradeRank('A-'));
  });

  it('gives every generated baseline profile a visible card identity', () => {
    for (const profile of buildBaselineRatingProfiles()) {
      expect(profile.visibleIdentity?.grades, `${profile.full_name} ${profile.season} needs visible identity grades`).toBeTruthy();
      expect(profile.visibleIdentity?.primaryRole, `${profile.full_name} ${profile.season} needs a card role`).toBeTruthy();
      expect(profile.visibleIdentity?.reputation, `${profile.full_name} ${profile.season} needs card reputation`).toBeTruthy();
      expect(profile.visibleIdentity?.tier, `${profile.full_name} ${profile.season} needs a primary tier`).toBeTruthy();
      expect(profile.visibleIdentity?.archetypes?.length, `${profile.full_name} ${profile.season} needs archetype tags`).toBeGreaterThan(0);
      expect(profile.visibleIdentity?.developmentOutlook, `${profile.full_name} ${profile.season} needs a development outlook`).toBeTruthy();
      expect(profile.visibleIdentity?.potentialLabel, `${profile.full_name} ${profile.season} needs a potential label`).toBeTruthy();
    }
  });

  it('separates baseline player tiers from archetypes for recognizable player types', () => {
    const rose2011 = findProfile('Derrick Rose', 'CHI', 2011);
    const korver2017 = findProfile('Kyle Korver', 'CLE', 2017);
    const gobert2017 = findProfile('Rudy Gobert', 'UTA', 2017);
    const jaylenBrown2017 = findProfile('Jaylen Brown', 'BOS', 2017);

    expect(rose2011.visibleIdentity.tier).toBe('Superstar');
    expect(rose2011.visibleIdentity.archetypes).toContain('Primary Creator');
    expect(rose2011.visibleIdentity.archetypes).toContain('Athletic Finisher');

    expect(korver2017.visibleIdentity.tier).toMatch(/Valuable Rotation Player|Specialist \/ Depth Piece/);
    expect(korver2017.visibleIdentity.archetypes).toContain('Catch-and-Shoot Specialist');
    expect(korver2017.visibleIdentity.archetypes).not.toContain('Primary Creator');

    expect(gobert2017.visibleIdentity.tier).toMatch(/Star|High-Impact Contributor/);
    expect(gobert2017.visibleIdentity.archetypes).toContain('Rim Protector');
    expect(gobert2017.visibleIdentity.archetypes).toContain('Defensive Anchor');

    expect(jaylenBrown2017.visibleIdentity.tier).toBe('Valuable Rotation Player');
    expect(jaylenBrown2017.visibleIdentity.developmentTag).toBe('Prospect');
    expect(jaylenBrown2017.visibleIdentity.potentialLabel).toMatch(/Star Upside|High-Impact Upside/);
  });

  it('includes current-pool NBA stars in generated 2026 baselines', () => {
    const tatum2026 = findProfile('Jayson Tatum', 'BOS', 2026);

    expect(tatum2026.visibleIdentity.reputation).toMatch(/Star|Superstar/);
    expect(tatum2026.visibleIdentity.primaryRole).toMatch(/Scoring Wing|Two-Way Wing|Shot Creator/);
  });

  it('keeps current two-way wings from being labeled as spacing bigs', () => {
    const mikal2026 = findProfile('Mikal Bridges', 'NYK', 2026);

    expect(mikal2026.position).toBe('SF');
    expect(mikal2026.visibleIdentity.archetypes).toContain('3-and-D Wing');
    expect(mikal2026.visibleIdentity.archetypes).not.toContain('Floor-Spacing Big');
    expect(mikal2026.visibleIdentity.archetypes).not.toContain('Stretch Big');
    expect(mikal2026.visibleIdentity.archetypes).not.toContain('Roll Big');
  });

  it('keeps primary point guards from being labeled as 3-and-D wings', () => {
    const luka2026 = findProfile('Luka Dončić', 'LAL', 2026);

    expect(luka2026.position).toBe('PG');
    expect(luka2026.visibleIdentity.archetypes).toContain('Primary Creator');
    expect(luka2026.visibleIdentity.archetypes).not.toContain('3-and-D Wing');
  });

  it('has a generated 2026 baseline for every current-pool NBA player', () => {
    const currentProfiles = profiles().filter(profile => profile.season === 2026);
    const covered = new Set(currentProfiles.map(profile => (
      `${normalizeCoverageKey(profile.full_name)}|${String(profile.team || '').toUpperCase()}`
    )));
    const missing = currentPool().players
      .filter((player: any) => !covered.has(`${normalizeCoverageKey(player.full_name)}|${String(player.team || '').toUpperCase()}`))
      .map((player: any) => `${player.full_name} ${player.team}`);

    expect(missing).toEqual([]);
  });

  it('has a generated baseline identity for every historical era-pool NBA player', () => {
    const allProfiles = profiles();
    const missing = historicalPools().flatMap(({ era, season, data }) => {
      const covered = new Set(
        allProfiles
          .filter(profile => profile.season === season)
          .map(profile => normalizeCoverageKey(profile.full_name)),
      );
      return data.players
        .filter((player: any) => !covered.has(normalizeCoverageKey(player.full_name)))
        .map((player: any) => `${era} ${player.full_name}`);
    });

    expect(missing).toEqual([]);
  });

  it('does not label core-production baseline players as role players', () => {
    for (const profile of buildBaselineRatingProfiles()) {
      const source = profile.source_stat_line;
      const production = Number(source.pointsPerGame || 0) + Number(source.reboundsPerGame || 0) + Number(source.assistsPerGame || 0);
      const minutes = Number(source.minutesPerGame || 0);
      const winShares = Number(source.winShares || 0);
      const games = Number(source.games || 0);
      const coreProduction = (games >= 50 && minutes >= 28 && production >= 18) || winShares >= 5;

      if (!coreProduction) continue;

      expect(
        profile.visibleIdentity.reputation,
        `${profile.full_name} ${profile.season} has core production and should not show as a role player`,
      ).not.toBe('Role Player');
    }
  });

  it('uses basketball-specific card roles instead of defaulting wings to shot creator', () => {
    const korver2017 = findProfile('Kyle Korver', 'CLE', 2017);
    const klay2017 = findProfile('Klay Thompson', 'GSW', 2017);
    const kiddGilchrist2017 = findProfile('Michael Kidd-Gilchrist', 'CHA', 2017);
    const jeramiGrant2017 = findProfile('Jerami Grant', 'OKC', 2017);
    const gobert2017 = findProfile('Rudy Gobert', 'UTA', 2017);
    const edwards2026 = findProfile('Anthony Edwards', 'MIN', 2026);
    const darwinCook1984 = findProfile('Darwin Cook', 'NJN', 1984);
    const magic1984 = findProfile('Magic Johnson', 'LAL', 1984);
    const stockton1992 = findProfile('John Stockton', 'UTA', 1992);
    const paul2011 = findProfile('Chris Paul', 'NOH', 2011);

    expect(korver2017.visibleIdentity.primaryRole).toBe('Movement Shooter');
    expect(klay2017.visibleIdentity.primaryRole).toBe('Two-Way Wing');
    expect(klay2017.visibleIdentity.secondaryRole).toBe('Movement Shooter');
    expect(kiddGilchrist2017.visibleIdentity.primaryRole).toBe('Defensive Wing');
    expect(jeramiGrant2017.visibleIdentity.primaryRole).toBe('Switch Forward');
    expect(gobert2017.visibleIdentity.primaryRole).toBe('Rim Protector');
    expect(edwards2026.visibleIdentity.primaryRole).toBe('Scoring Wing');
    expect(darwinCook1984.visibleIdentity.primaryRole).not.toBe('Defensive Wing');
    expect(magic1984.visibleIdentity.primaryRole).toBe('Floor General');
    expect(stockton1992.visibleIdentity.primaryRole).toBe('Floor General');
    expect(paul2011.visibleIdentity.primaryRole).toBe('Floor General');
  });

  it('leads scoring big player cards with offensive identity before rebounding', () => {
    const dirk2011 = findProfile('Dirk Nowitzki', 'DAL', 2011);
    const bosh2011 = findProfile('Chris Bosh', 'MIA', 2011);
    const aldridge2011 = findProfile('LaMarcus Aldridge', 'POR', 2011);
    const rodman1992 = findProfile('Dennis Rodman', 'DET', 1992);

    expect(dirk2011.visibleIdentity.primaryRole).toBe('Stretch Big');
    expect(bosh2011.visibleIdentity.primaryRole).toBe('Midrange Big');
    expect(aldridge2011.visibleIdentity.primaryRole).toBe('Post Scorer');
    expect(rodman1992.visibleIdentity.primaryRole).toBe('Glass Cleaner');
  });

  it('does not create MVP or superstar labels from generated career math alone', () => {
    const reggie1992 = findProfile('Reggie Miller', 'IND', 1992);
    const pau2011 = findProfile('Pau Gasol', 'LAL', 2011);
    const ray2011 = findProfile('Ray Allen', 'BOS', 2011);
    const marion2011 = findProfile('Shawn Marion', 'DAL', 2011);
    const rose2011 = findProfile('Derrick Rose', 'CHI', 2011);
    const rose2017 = findProfile('Derrick Rose', 'NYK', 2017);

    for (const profile of [reggie1992, pau2011, ray2011, marion2011]) {
      expect(profile.source_stat_line.scoutingTags).not.toContain('mvp');
      expect(profile.visibleIdentity.reputation).not.toBe('Legend');
      expect(profile.visibleIdentity.reputation).not.toBe('Superstar');
    }

    expect(rose2011.visibleIdentity.reputation).toBe('Superstar');
    expect(rose2017.visibleIdentity.reputation).not.toBe('Superstar');
  });

  it('caps non-legacy late-career reputation below star tier', () => {
    const hayes1984 = findProfile('Elvin Hayes', 'HOU', 1984);
    const malone2003 = findProfile('Karl Malone', 'LAL', 2003);
    const lebron2026 = findProfile('LeBron James', 'LAL', 2026);

    expect(hayes1984.visibleIdentity.reputation).toBe('Starter');
    expect(malone2003.visibleIdentity.reputation).toBe('Starter');
    expect(lebron2026.visibleIdentity.reputation).toBe('Superstar');
  });

  it('does not inflate 2011 Derrick Rose into an elite three point shooter', () => {
    const rose2011 = buildBaselineRatingProfiles().find(profile => profile.player_id === 'derrick-rose-2011');

    expect(rose2011?.attribute_model.threePoint).toBeLessThan(85);
    expect(rose2011?.category_skill_grades.threePoint.grade).toMatch(/B|B-|C\+/);
    expect(gradeRank(rose2011?.category_skill_grades.perimeterDefense.grade || 'F')).toBeLessThan(gradeRank('A-'));
  });

  it('keeps pure passing tied to historic assist production instead of creator usage', () => {
    const rose2011 = buildBaselineRatingProfiles().find(profile => profile.player_id === 'derrick-rose-2011');
    const rose2017 = findProfile('Derrick Rose', 'NYK', 2017);
    const lillard2017 = findProfile('Damian Lillard', 'POR', 2017);
    const paul2011 = findProfile('Chris Paul', 'NOH', 2011);

    expect(gradeRank(rose2011?.skill_grades.passing || 'F')).toBeLessThan(gradeRank('A+'));
    expect(gradeRank(rose2011?.skill_grades.passing || 'F')).toBeGreaterThanOrEqual(gradeRank('B+'));
    expect(gradeRank(publicGrades(rose2011).passing)).toBeLessThan(gradeRank('A+'));
    expect(gradeRank(rose2011?.category_skill_grades.playmaking.grade || 'F')).toBeGreaterThanOrEqual(gradeRank('A'));
    expect(gradeRank(rose2017.skill_grades.passing || 'F')).toBeLessThanOrEqual(gradeRank('B+'));
    expect(gradeRank(publicGrades(rose2017).passing)).toBeLessThanOrEqual(gradeRank('B+'));
    expect(gradeRank(lillard2017.skill_grades.passing || 'F')).toBeLessThan(gradeRank('S'));
    expect(gradeRank(paul2011.skill_grades.passing || 'F')).toBeGreaterThanOrEqual(gradeRank('A+'));
    expect(gradeRank(publicGrades(paul2011).passing)).toBeGreaterThanOrEqual(gradeRank('A+'));
  });

  it('requires elite assist proof before assigning A+ pure passing grades', () => {
    for (const profile of profiles()) {
      const assists = Number(profile.source_stat_line?.assistsPerGame || 0);
      const assistPct = Number(profile.source_stat_line?.assistPct || 0);
      const tags = (profile.source_stat_line?.scoutingTags || []).map(value => String(value).toLowerCase());
      const hasElitePassingProof = assists >= 8.5
        || (assists >= 8 && assistPct >= 35 && (tags.includes('elite_passer') || tags.includes('floor_general')));

      if (hasElitePassingProof) continue;

      expect(
        gradeRank(profile.skill_grades.passing || 'F'),
        `${profile.full_name} ${profile.season} needs elite assist proof for A+ passing`,
      ).toBeLessThan(gradeRank('A+'));
      expect(
        gradeRank(publicGrades(profile).passing),
        `${profile.full_name} ${profile.season} public passing grade should match assist proof`,
      ).toBeLessThan(gradeRank('A+'));
    }
  });

  it('keeps low-volume rim centers from receiving good three point grades', () => {
    const gobert2017 = findProfile('Rudy Gobert', 'UTA', 2017);

    expect(gradeRank(gobert2017.category_skill_grades.threePoint.grade)).toBeLessThanOrEqual(gradeRank('D+'));
    expect(gradeRank(gobert2017.skill_grades.threePoint || 'F')).toBeLessThanOrEqual(gradeRank('D+'));
    expect(gradeRank(publicGrades(gobert2017).threePoint)).toBeLessThanOrEqual(gradeRank('D+'));
    expect(gradeRank(gobert2017.category_skill_grades.interiorDefense.grade)).toBeGreaterThanOrEqual(gradeRank('A-'));
    expect(gradeRank(gobert2017.category_skill_grades.rebounding.grade)).toBeGreaterThanOrEqual(gradeRank('A-'));
  });

  it('keeps defense and rebounding grades tied to role proof instead of synthetic team signals', () => {
    const nash2003 = findProfile('Steve Nash', 'PHX', 2003);
    const kyrie2017 = findProfile('Kyrie Irving', 'CLE', 2017);
    const rose2011 = findProfile('Derrick Rose', 'CHI', 2011);
    const kawhi2017 = findProfile('Kawhi Leonard', 'SAS', 2017);
    const draymond2017 = findProfile('Draymond Green', 'GSW', 2017);
    const dirk2011 = findProfile('Dirk Nowitzki', 'DAL', 2011);
    const love2017 = findProfile('Kevin Love', 'CLE', 2017);
    const bargnani2011 = findProfile('Andrea Bargnani', 'TOR', 2011);

    expect(gradeRank(nash2003.category_skill_grades.perimeterDefense.grade)).toBeLessThan(gradeRank('B'));
    expect(gradeRank(kyrie2017.category_skill_grades.perimeterDefense.grade)).toBeLessThan(gradeRank('B'));
    expect(gradeRank(publicGrades(kyrie2017).perimeterDefense)).toBeLessThan(gradeRank('B'));
    expect(gradeRank(rose2011.category_skill_grades.perimeterDefense.grade)).toBeLessThan(gradeRank('B+'));
    expect(gradeRank(publicGrades(rose2011).perimeterDefense)).toBeLessThan(gradeRank('B+'));
    expect(gradeRank(publicGrades(rose2011).postDefense)).toBeLessThanOrEqual(gradeRank('C+'));
    expect(gradeRank(publicGrades(rose2011).blocking)).toBeLessThanOrEqual(gradeRank('C+'));
    expect(gradeRank(kawhi2017.category_skill_grades.perimeterDefense.grade)).toBeGreaterThanOrEqual(gradeRank('A-'));
    expect(gradeRank(publicGrades(kawhi2017).perimeterDefense)).toBeGreaterThanOrEqual(gradeRank('A-'));
    expect(gradeRank(draymond2017.category_skill_grades.interiorDefense.grade)).toBeGreaterThanOrEqual(gradeRank('A-'));
    expect(gradeRank(dirk2011.category_skill_grades.interiorDefense.grade)).toBeLessThan(gradeRank('A-'));
    expect(gradeRank(love2017.category_skill_grades.interiorDefense.grade)).toBeLessThan(gradeRank('A-'));
    expect(gradeRank(publicGrades(love2017).postDefense)).toBeLessThanOrEqual(gradeRank('B'));
    expect(gradeRank(bargnani2011.category_skill_grades.rebounding.grade)).toBeLessThan(gradeRank('B'));
  });

  it('prevents career production from leaking into pre-rookie and duplicate-name era seeds', () => {
    const lebron2003 = findProfile('LeBron James', 'CLE', 2003);
    const wade2003 = findProfile('Dwyane Wade', 'MIA', 2003);
    const bosh2003 = findProfile('Chris Bosh', 'TOR', 2003);
    const hawksEddie1984 = findProfile('Eddie Johnson', 'ATL', 1984);
    const warriorsReggie2011 = findProfile('Reggie Williams', 'GSW', 2011);
    const dirk2017 = findProfile('Dirk Nowitzki', 'DAL', 2017);
    const vince2017 = findProfile('Vince Carter', 'MEM', 2017);

    for (const rookie of [lebron2003, wade2003, bosh2003]) {
      expect(rookie.age).toBeLessThanOrEqual(21);
      expect(rookie.source_stat_line.minutesPerGame).toBeLessThan(34);
      expect(rookie.source_stat_line.pointsPerGame).toBeLessThan(22);
    }

    expect(hawksEddie1984.source_stat_line.birthDate).toBe('1955-02-24');
    expect(warriorsReggie2011.age).toBeLessThan(30);
    expect(warriorsReggie2011.position).toMatch(/SG|SF|G|F/i);

    for (const veteran of [dirk2017, vince2017]) {
      expect(veteran.age).toBeGreaterThanOrEqual(37);
      expect(veteran.source_stat_line.minutesPerGame).toBeLessThanOrEqual(31);
      expect(veteran.source_stat_line.awardWeight).toBeLessThanOrEqual(2);
      expect(veteran.source_stat_line.scoutingTags).not.toContain('mvp');
      expect(veteran.source_stat_line.scoutingTags).not.toContain('high_usage_creator');
    }
  });

  it('does not give rookie-era players their future-prime production', () => {
    const paulGeorge2011 = findProfile('Paul George', 'IND', 2011);
    const jaylenBrown2017 = findProfile('Jaylen Brown', 'BOS', 2017);

    expect(paulGeorge2011.source_stat_line.pointsPerGame).toBeLessThanOrEqual(12);
    expect(paulGeorge2011.source_stat_line.minutesPerGame).toBeLessThanOrEqual(26);
    expect(paulGeorge2011.visibleIdentity.reputation).toBe('Role Player');
    expect(paulGeorge2011.source_stat_line.scoutingTags).not.toContain('high_usage_creator');

    expect(jaylenBrown2017.source_stat_line.pointsPerGame).toBeLessThanOrEqual(9);
    expect(jaylenBrown2017.source_stat_line.minutesPerGame).toBeLessThanOrEqual(24);
    expect(jaylenBrown2017.visibleIdentity.reputation).toBe('Prospect');
  });

  it('does not trust impossible generated three point samples as elite shooting proof', () => {
    const truckRobinson1984 = findProfile('Truck Robinson', 'NYK', 1984);
    const eddyCurry2003 = findProfile('Eddy Curry', 'CHI', 2003);

    expect(gradeRank(truckRobinson1984.skill_grades.threePoint || 'F')).toBeLessThanOrEqual(gradeRank('C'));
    expect(gradeRank(truckRobinson1984.category_skill_grades.threePoint.grade)).toBeLessThanOrEqual(gradeRank('C'));
    expect(gradeRank(publicGrades(truckRobinson1984).threePoint)).toBeLessThanOrEqual(gradeRank('D+'));
    expect(truckRobinson1984.source_stat_line.scoutingTags).not.toContain('elite_shooter');
    expect(gradeRank(eddyCurry2003.skill_grades.threePoint || 'F')).toBeLessThanOrEqual(gradeRank('C'));
    expect(gradeRank(eddyCurry2003.category_skill_grades.threePoint.grade)).toBeLessThanOrEqual(gradeRank('C'));
    expect(gradeRank(publicGrades(eddyCurry2003).threePoint)).toBeLessThanOrEqual(gradeRank('D+'));
    expect(eddyCurry2003.source_stat_line.scoutingTags).not.toContain('elite_shooter');
  });

  it('does not inflate weak era three point profiles into A-level shooters', () => {
    const dominique1984 = findProfile('Dominique Wilkins', 'ATL', 1984);
    const magic1984 = findProfile('Magic Johnson', 'LAL', 1984);
    const drexler1984 = findProfile('Clyde Drexler', 'POR', 1984);

    for (const profile of [dominique1984, magic1984, drexler1984]) {
      expect(
        gradeRank(profile.category_skill_grades.threePoint.grade),
        `${profile.full_name} ${profile.season} needs efficiency and volume proof for A-level 3PT`,
      ).toBeLessThan(gradeRank('A-'));
    }
  });

  it('reserves elite midrange grades for players with role or tag proof', () => {
    const joeJohnson2011 = findProfile('Joe Johnson', 'ATL', 2011);
    const kobe2011 = findProfile('Kobe Bryant', 'LAL', 2011);

    expect(gradeRank(joeJohnson2011.category_skill_grades.midRange.grade)).toBeLessThan(gradeRank('A+'));
    expect(gradeRank(kobe2011.category_skill_grades.midRange.grade)).toBeGreaterThanOrEqual(gradeRank('A-'));
  });

  it('does not let duplicate source-name collisions overwrite famous player profiles', () => {
    const ewing1992 = findProfile('Patrick Ewing', 'NYK', 1992);

    expect(ewing1992.age).toBeGreaterThanOrEqual(25);
    expect(ewing1992.source_stat_line.minutesPerGame).toBeGreaterThanOrEqual(30);
    expect(ewing1992.source_stat_line.reboundsPerGame).toBeGreaterThanOrEqual(9);
    expect(gradeRank(ewing1992.category_skill_grades.interiorDefense.grade)).toBeGreaterThanOrEqual(gradeRank('A-'));
  });

  it('does not merge Jr players into older same-name historical profiles', () => {
    const hardawayJr2017 = findProfile('Tim Hardaway Jr', 'ATL', 2017);

    expect(hardawayJr2017.age).toBeLessThan(30);
    expect(hardawayJr2017.position).toMatch(/SG|SF|G|F/i);
    expect(hardawayJr2017.source_stat_line.assistsPerGame).toBeLessThan(5);
    expect(gradeRank(hardawayJr2017.category_skill_grades.playmaking.grade)).toBeLessThan(gradeRank('A-'));
  });

  it('does not give pre-breakout or inactive era seasons future playmaking production', () => {
    const simmons2017 = findProfile('Ben Simmons', 'PHI', 2017);

    expect(simmons2017.source_stat_line.minutesPerGame).toBeLessThan(18);
    expect(simmons2017.source_stat_line.assistsPerGame).toBeLessThan(4);
    expect(gradeRank(simmons2017.category_skill_grades.playmaking.grade)).toBeLessThan(gradeRank('A-'));
    expect(simmons2017.visibleIdentity.reputation).toBe('Prospect');
    expect(gradeRank(simmons2017.development_curve.potential_grade)).toBeGreaterThanOrEqual(gradeRank('A-'));
  });

  it('keeps explosive wings and guards as real dunking threats', () => {
    const lebron2011 = findProfile('LeBron James', 'MIA', 2011);
    const edwards2026 = findProfile('Anthony Edwards', 'MIN', 2026);

    expect(gradeRank(lebron2011.skill_grades.dunking || 'F')).toBeGreaterThanOrEqual(gradeRank('A-'));
    expect(gradeRank(edwards2026.skill_grades.dunking || 'F')).toBeGreaterThanOrEqual(gradeRank('A-'));
    expect(gradeRank(publicGrades(lebron2011).dunking)).toBeGreaterThanOrEqual(gradeRank('A-'));
    expect(gradeRank(publicGrades(edwards2026).dunking)).toBeGreaterThanOrEqual(gradeRank('A-'));
    expect(gradeRank(publicGrades(lebron2011).dunking)).toBeGreaterThanOrEqual(gradeRank('A'));
    expect(gradeRank(publicGrades(edwards2026).dunking)).toBeGreaterThanOrEqual(gradeRank('A'));
    expect(gradeRank(lebron2011.category_skill_grades.finishing.grade)).toBeGreaterThanOrEqual(gradeRank('A'));
    expect(gradeRank(edwards2026.skill_grades.drivingDunk || 'F')).toBeGreaterThanOrEqual(gradeRank('A'));
    expect(gradeRank(edwards2026.category_skill_grades.athleticism.grade)).toBeGreaterThanOrEqual(gradeRank('B+'));
  });

  it('keeps elite rim-pressure creators from being flattened into average dunking grades', () => {
    for (const profile of profiles()) {
      const position = String(profile.position || '').toUpperCase();
      const tags = (profile.source_stat_line?.scoutingTags || []).map(value => String(value).toLowerCase());
      const rimRate = Number(profile.source_stat_line?.rimAttemptRate || 0);
      const dunkRate = Number(profile.source_stat_line?.dunkRate || 0);
      const isCreatorAthlete = tags.includes('elite_rim_pressure')
        && (tags.includes('elite_burst') || tags.includes('high_usage_creator'))
        && (position.includes('PG') || position.includes('SG') || position.includes('SF') || position.includes('F'))
        && (rimRate >= 0.32 || dunkRate >= 0.08);

      if (!isCreatorAthlete) continue;

      expect(
        gradeRank(profile.skill_grades.dunking || 'F'),
        `${profile.full_name} ${profile.season} should show real dunk threat from rim-pressure proof`,
      ).toBeGreaterThanOrEqual(gradeRank('A-'));
      expect(
        gradeRank(publicGrades(profile).dunking),
        `${profile.full_name} ${profile.season} public card dunking should show rim-pressure proof`,
      ).toBeGreaterThanOrEqual(gradeRank('A-'));
    }
  });

  it('does not let high-volume good shooters become all-time elite without elite-shooter proof', () => {
    const edwards2026 = findProfile('Anthony Edwards', 'MIN', 2026);

    expect(gradeRank(edwards2026.skill_grades.threePoint || 'F')).toBeLessThanOrEqual(gradeRank('A'));
    expect(gradeRank(edwards2026.category_skill_grades.threePoint.grade)).toBeLessThanOrEqual(gradeRank('A'));
  });

  it('audits every baseline profile for obvious rating anomalies', () => {
    const allProfiles = profiles();
    const hasTag = (profile: any, tag: string) => (
      profile.source_stat_line?.scoutingTags || []
    ).some((value: string) => String(value).toLowerCase() === tag);
    const position = (profile: any) => String(profile.position || '').toUpperCase();
    const isBig = (profile: any) => position(profile).includes('PF') || position(profile).includes('C');
    const isGuardOrWing = (profile: any) => ['PG', 'SG', 'SF', 'G', 'F'].some(pos => position(profile).includes(pos));
    const hasDefensiveProof = (profile: any) => (
      hasTag(profile, 'defensive_wing_assignment')
      || hasTag(profile, 'point_of_attack_defender')
      || hasTag(profile, 'all_defense')
      || hasTag(profile, 'defensive_anchor')
      || hasTag(profile, 'rim_protector')
    );

    const lowVolumeNonShootingBigs = allProfiles.filter(profile => (
      isBig(profile)
      && Number(profile.source_stat_line?.threePointAttemptsPerGame || 0) < 1
      && !hasTag(profile, 'elite_shooter')
    ));
    for (const profile of lowVolumeNonShootingBigs) {
      expect(
        gradeRank(profile.category_skill_grades.threePoint.grade),
        `${profile.full_name} ${profile.season} should not grade as a real 3PT threat`,
      ).toBeLessThanOrEqual(gradeRank('D+'));
    }

    const nonStopperPerimeterPlayers = allProfiles.filter(profile => (
      isGuardOrWing(profile)
      && !hasDefensiveProof(profile)
      && Number(profile.source_stat_line?.stealsPerGame || 0) < 1.4
      && Number(profile.source_stat_line?.blocksPerGame || 0) < 0.9
    ));
    for (const profile of nonStopperPerimeterPlayers) {
      expect(
        gradeRank(profile.category_skill_grades.perimeterDefense.grade),
        `${profile.full_name} ${profile.season} should need individual defense proof for stopper grades`,
      ).toBeLessThan(gradeRank('A-'));
    }

    const nonRimProtectorWings = allProfiles.filter(profile => (
      isGuardOrWing(profile)
      && !isBig(profile)
      && !hasTag(profile, 'defensive_anchor')
      && !hasTag(profile, 'rim_protector')
      && Number(profile.source_stat_line?.blocksPerGame || 0) < 0.7
    ));
    for (const profile of nonRimProtectorWings) {
      expect(
        gradeRank(profile.category_skill_grades.interiorDefense.grade),
        `${profile.full_name} ${profile.season} should need rim proof for elite interior defense`,
      ).toBeLessThan(gradeRank('A-'));
    }

    const eliteReboundProfiles = allProfiles.filter(profile => (
      hasTag(profile, 'elite_rebounder')
      && Number(profile.source_stat_line?.reboundsPerGame || 0) >= 9
      && Number(profile.source_stat_line?.defensiveReboundPct || 0) >= 17
      && Number(profile.source_stat_line?.minutesPerGame || 0) >= 24
    ));
    for (const profile of eliteReboundProfiles) {
      expect(
        gradeRank(profile.category_skill_grades.rebounding.grade),
        `${profile.full_name} ${profile.season} should grade as an elite rebounder`,
      ).toBeGreaterThanOrEqual(gradeRank('A-'));
    }

    const weakMidrangeProof = allProfiles.filter(profile => (
      !hasTag(profile, 'elite_midrange')
      && !hasTag(profile, 'midrange_big')
      && !hasTag(profile, 'mvp')
      && !hasTag(profile, 'all_star')
      && !hasTag(profile, 'high_usage_creator')
      && !hasTag(profile, 'elite_shooter')
      && Number(profile.source_stat_line?.midRangeAttemptRate || 0) < 0.15
    ));
    for (const profile of weakMidrangeProof) {
      expect(
        gradeRank(profile.category_skill_grades.midRange.grade),
        `${profile.full_name} ${profile.season} needs midrange role proof for A-level midrange`,
      ).toBeLessThan(gradeRank('A-'));
    }

    const preModernGenericThreePoint = allProfiles.filter(profile => (
      Number(profile.season || 0) < 1990
      && !hasTag(profile, 'elite_shooter')
      && Number(profile.source_stat_line?.threePointPct || 0) < 0.33
      && Number(profile.source_stat_line?.threePointAttemptsPerGame || 0) >= 2
    ));
    for (const profile of preModernGenericThreePoint) {
      expect(
        gradeRank(profile.category_skill_grades.threePoint.grade),
        `${profile.full_name} ${profile.season} needs real era volume and efficiency proof for B+ or better 3PT`,
      ).toBeLessThan(gradeRank('B+'));
    }

    const genericBigDunkers = allProfiles.filter(profile => (
      isBig(profile)
      && !hasTag(profile, 'elite_rim_pressure')
      && !hasTag(profile, 'elite_burst')
      && !hasTag(profile, 'high_usage_creator')
      && Number(profile.source_stat_line?.rimAttemptRate || 0) <= 0.35
      && Number(profile.source_stat_line?.dunkRate || 0) <= 0.11
    ));
    for (const profile of genericBigDunkers) {
      expect(
        gradeRank(profile.skill_grades.dunking || 'F'),
        `${profile.full_name} ${profile.season} needs real rim-pressure proof for A-level dunking`,
      ).toBeLessThan(gradeRank('A-'));
    }

    const suspiciousYouthStars = allProfiles.filter(profile => (
      Number(profile.source_stat_line?.age || profile.age || 0) < 18
      && Number(profile.source_stat_line?.minutesPerGame || 0) < 10
    ));
    for (const profile of suspiciousYouthStars) {
      expect(
        gradeRank(profile.development_curve.potential_grade),
        `${profile.full_name} ${profile.season} has suspicious source data and should not get star potential`,
      ).toBeLessThan(gradeRank('A-'));
    }
  });

  it('labels 2026 LeBron as a legacy star with lower future-growth potential', () => {
    const lebron2026 = buildBaselineRatingProfiles().find(profile => profile.player_id === 'lebron-james-2026');

    expect(lebron2026?.development_curve.phase).toBe('Legacy Star');
    expect(lebron2026?.development_curve.potential_grade).toBe('B-');
    expect(lebron2026?.skill_grades.potential).toBe('B-');
    expect(lebron2026?.category_skill_grades.potential.grade).toBe('B-');
    expect(lebron2026?.category_skill_grades.basketballIq.grade).toMatch(/^A|S/);
    expect(lebron2026?.category_skill_grades.finishing.grade).toMatch(/^A|B/);
  });

  it('does not reuse prime-career athleticism for late-career generated seasons', () => {
    const jordan2003 = findProfile('Michael Jordan', 'WAS', 2003);

    expect(jordan2003.age).toBeGreaterThanOrEqual(39);
    expect(jordan2003.source_stat_line.pointsPerGame).toBeLessThan(25);
    expect(gradeRank(jordan2003.skill_grades.dunking || 'F')).toBeLessThan(gradeRank('A-'));
    expect(gradeRank(jordan2003.category_skill_grades.athleticism.grade)).toBeLessThan(gradeRank('A-'));
  });

  it('generates broad 2011 era roster baselines instead of leaving core teams generic', () => {
    const profiles = buildBaselineRatingProfiles();
    const lebronEraProfiles = profiles.filter(profile => profile.season === 2011);

    const find = (name: string, team: string) => lebronEraProfiles.find(profile => (
      profile.full_name === name && profile.team === team
    ));
    const mustFind = (name: string, team: string) => {
      const profile = find(name, team);
      expect(profile).toBeTruthy();
      return profile!;
    };

    const wade = mustFind('Dwyane Wade', 'MIA');
    const bosh = mustFind('Chris Bosh', 'MIA');
    const deng = mustFind('Luol Deng', 'CHI');
    const noah = mustFind('Joakim Noah', 'CHI');
    const kobe = mustFind('Kobe Bryant', 'LAL');
    const paul = mustFind('Chris Paul', 'NOH');
    const curry = mustFind('Stephen Curry', 'GSW');

    expect(lebronEraProfiles.length).toBeGreaterThanOrEqual(150);
    expect(gradeRank(wade?.category_skill_grades.finishing.grade)).toBeGreaterThanOrEqual(gradeRank('A-'));
    expect(gradeRank(wade?.category_skill_grades.perimeterDefense.grade)).toBeGreaterThanOrEqual(gradeRank('B+'));
    expect(gradeRank(bosh?.category_skill_grades.midRange.grade)).toBeGreaterThanOrEqual(gradeRank('B+'));
    expect(gradeRank(deng?.category_skill_grades.perimeterDefense.grade)).toBeGreaterThanOrEqual(gradeRank('B+'));
    expect(gradeRank(noah?.category_skill_grades.rebounding.grade)).toBeGreaterThanOrEqual(gradeRank('A-'));
    expect(gradeRank(kobe?.category_skill_grades.midRange.grade)).toBeGreaterThanOrEqual(gradeRank('A-'));
    expect(gradeRank(paul?.category_skill_grades.playmaking.grade)).toBeGreaterThanOrEqual(gradeRank('A'));
    expect(gradeRank(curry?.category_skill_grades.threePoint.grade)).toBeGreaterThanOrEqual(gradeRank('A-'));
  });
});
