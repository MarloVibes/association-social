import { describe, expect, it } from 'vitest';
import {
  buildScoutingGrades,
  compareScoutingGrades,
  getCompareRowModel,
  getPotentialScoutingSummary,
  getScoutingGradeSections,
  gradeColors,
  gradeRank,
} from '@/domain/nba/scoutingGrades';
import { buildBaselineRatingProfiles } from '@/domain/nba/ratingSeeds';

describe('NBA scouting grades', () => {
  it('maps grade colors with a neutral C tier distinct from high grades', () => {
    expect(gradeColors('S').textColor).toBe('#f5c451');
    expect(gradeColors('A').textColor).toBe('#00ff87');
    expect(gradeColors('B+').textColor).toBe('#54a3ff');
    expect(gradeColors('C').textColor).toBe('#cbd5e1');
    expect(gradeColors('C').borderColor).toBe('#64748b');
    expect(gradeColors('C').textColor).not.toBe(gradeColors('A').textColor);
    expect(gradeColors('C').borderColor).not.toBe(gradeColors('A').borderColor);
    expect(gradeColors('D').textColor).toBe('#ff9f43');
    expect(gradeColors('F').textColor).toBe('#ff4d5e');
  });

  it('prefers explicit expanded grades and groups them into scouting sections', () => {
    const sections = getScoutingGradeSections({
      scoutingGrades: {
        threePoint: 'S',
        passing: 'A+',
        defenseIq: 'A',
        dunking: 'D',
      },
    });

    const scoring = sections.find(section => section.title === 'Scoring');
    const playmaking = sections.find(section => section.title === 'Playmaking / IQ');
    const defense = sections.find(section => section.title === 'Defense');

    expect(scoring?.items.find(item => item.key === 'threePoint')?.grade).toBe('S');
    expect(scoring?.items.find(item => item.key === 'dunking')?.grade).toBe('D');
    expect(playmaking?.items.find(item => item.key === 'passing')?.grade).toBe('A+');
    expect(defense?.items.find(item => item.key === 'defenseIq')?.grade).toBe('A');
  });

  it('shows Potential as a visible growth grade without exposing hidden scores', () => {
    const growth = getScoutingGradeSections({
      hidden: { potential: 91 },
    }).find(section => section.title === 'Growth');

    expect(growth?.items.find(item => item.key === 'potential')?.grade).toBe('A-');
    expect(growth?.items.find(item => item.key === 'potential')?.colors.textColor).toBe('#00ff87');
  });

  it('derives detailed grades from hidden ratings and legacy broad grades', () => {
    const hiddenGrades = buildScoutingGrades({
      hidden: {
        shooting: 96,
        threePoint: 99,
        dunking: 51,
        basketballIq: 93,
        defense: 88,
      },
    });

    expect(hiddenGrades.threePoint).toBe('S');
    expect(hiddenGrades.dunking).toBe('D-');
    expect(hiddenGrades.defenseIq).toBe('A');
    expect(hiddenGrades.offenseIq).toBe('A');

    const legacyGrades = buildScoutingGrades({
      grades: {
        shooting: 'A',
        playmaking: 'B+',
        defense: 'C',
        athleticism: 'D',
      },
    });

    expect(legacyGrades.midRange).toBe('A');
    expect(legacyGrades.passing).toBe('B+');
    expect(legacyGrades.perimeterDefense).toBe('C');
    expect(legacyGrades.speed).toBe('D');
  });

  it('compares rows with one shared center ability label', () => {
    const rows = compareScoutingGrades(
      buildScoutingGrades({ scoutingGrades: { threePoint: 'S', passing: 'B+' } }),
      buildScoutingGrades({ scoutingGrades: { threePoint: 'A-', passing: 'S' } }),
    );

    const passing = rows.find(row => row.key === 'passing');
    expect(passing?.winner).toBe('right');
    expect(gradeRank('S')).toBeGreaterThan(gradeRank('B+'));

    const compact = getCompareRowModel({
      leftName: 'Curry',
      rightName: 'Paul',
      row: passing!,
    });

    expect(compact.left).toEqual({ name: 'Curry', grade: 'B+' });
    expect(compact.centerLabel).toBe('Passing');
    expect(compact.right).toEqual({ grade: 'S', name: 'Paul' });
    expect(compact.accessibilityLabel).toBe('Curry B+ Passing S Paul');
  });

  it('uses one weighted numeric source for player cards and comparisons', () => {
    const rose2011 = {
      full_name: 'Derrick Rose',
      position: 'PG',
      fg3_pct: 0.332,
      fg3a_per_game: 4.8,
      hidden: {
        shooting: 96,
        threePoint: 78,
        shotIq: 80,
        consistency: 76,
        offenseIq: 90,
        closeShot: 94,
        dunking: 90,
        speed: 98,
        acceleration: 97,
        ballHandle: 96,
        passing: 90,
      },
      scoutingGrades: {
        threePoint: 'A+',
      },
    };
    const cardGrades = buildScoutingGrades(rose2011);
    const compareGrades = buildScoutingGrades(rose2011);

    expect(cardGrades.threePoint).toBe('B-');
    expect(compareGrades.threePoint).toBe(cardGrades.threePoint);
    expect(cardGrades.closeShot).toBe('A');
    expect(cardGrades.speed).toBe('A+');
    expect(cardGrades.acceleration).toBe('A+');
    expect(cardGrades.ballHandle).toBe('A+');
  });

  it('prefers the canonical rating profile over stale roster hidden grades', () => {
    const rosterSnapshot = {
      full_name: 'Era Guard',
      position: 'PG',
      hidden: {
        threePoint: 98,
        shotIq: 90,
        consistency: 90,
        offenseIq: 90,
      },
    };
    const canonicalProfile = {
      attribute_model: {
        threePoint: 78,
        shotIq: 80,
        consistency: 76,
        offenseIq: 88,
      },
    };

    expect(buildScoutingGrades(rosterSnapshot, canonicalProfile).threePoint).toBe('B-');
  });

  it('prefers the canonical rating profile over stale saved attribute models', () => {
    const staleRosterSnapshot = {
      full_name: 'Stale Big',
      position: 'C',
      attribute_model: {
        threePoint: 94,
        shotIq: 86,
        shotConsistency: 88,
        offenseIq: 78,
      },
    };
    const canonicalProfile = {
      attribute_model: {
        threePoint: 55,
        shotIq: 62,
        shotConsistency: 60,
        offenseIq: 72,
      },
      source_stat_line: {
        threePointAttemptsPerGame: 0.1,
      },
    };

    expect(buildScoutingGrades(staleRosterSnapshot, canonicalProfile).threePoint).toBe('D+');
  });

  it('uses production caps for public passing grades on player cards', () => {
    const profiles = buildBaselineRatingProfiles();
    const rose2011 = profiles.find(profile => profile.player_id === 'derrick-rose-2011');
    const paul2011 = profiles.find(profile => profile.full_name === 'Chris Paul' && profile.team === 'NOH' && profile.season === 2011);

    expect(rose2011).toBeTruthy();
    expect(paul2011).toBeTruthy();
    const roseGrades = buildScoutingGrades(rose2011!, rose2011);
    const paulGrades = buildScoutingGrades(paul2011!, paul2011);

    expect(gradeRank(roseGrades.passing)).toBeLessThan(gradeRank('A+'));
    expect(gradeRank(roseGrades.passing)).toBeGreaterThanOrEqual(gradeRank('B+'));
    expect(gradeRank(paulGrades.passing)).toBeGreaterThanOrEqual(gradeRank('A+'));
  });

  it('keeps public shooting grades capped for low-volume and untrusted three point samples', () => {
    const profiles = buildBaselineRatingProfiles();
    const gobert2017 = profiles.find(profile => profile.full_name === 'Rudy Gobert' && profile.team === 'UTA' && profile.season === 2017);
    const truckRobinson1984 = profiles.find(profile => profile.full_name === 'Truck Robinson' && profile.team === 'NYK' && profile.season === 1984);

    expect(gobert2017).toBeTruthy();
    expect(truckRobinson1984).toBeTruthy();
    expect(gradeRank(buildScoutingGrades(gobert2017!, gobert2017).threePoint)).toBeLessThanOrEqual(gradeRank('D+'));
    expect(gradeRank(buildScoutingGrades(truckRobinson1984!, truckRobinson1984).threePoint)).toBeLessThanOrEqual(gradeRank('C'));
  });

  it('keeps public player-card grades aligned with obvious real player skill profiles', () => {
    const profiles = buildBaselineRatingProfiles();
    const lebron2011 = profiles.find(profile => profile.full_name === 'LeBron James' && profile.team === 'MIA' && profile.season === 2011);
    const edwards2026 = profiles.find(profile => profile.full_name === 'Anthony Edwards' && profile.team === 'MIN' && profile.season === 2026);
    const rose2011 = profiles.find(profile => profile.full_name === 'Derrick Rose' && profile.team === 'CHI' && profile.season === 2011);
    const gobert2026 = profiles.find(profile => profile.full_name === 'Rudy Gobert' && profile.team === 'MIN' && profile.season === 2026);

    expect(lebron2011).toBeTruthy();
    expect(edwards2026).toBeTruthy();
    expect(rose2011).toBeTruthy();
    expect(gobert2026).toBeTruthy();

    const lebronGrades = buildScoutingGrades(lebron2011!, lebron2011);
    const edwardsGrades = buildScoutingGrades(edwards2026!, edwards2026);
    const roseGrades = buildScoutingGrades(rose2011!, rose2011);
    const gobertGrades = buildScoutingGrades(gobert2026!, gobert2026);

    expect(gradeRank(lebronGrades.dunking)).toBeGreaterThanOrEqual(gradeRank('A-'));
    expect(gradeRank(edwardsGrades.dunking)).toBeGreaterThanOrEqual(gradeRank('A-'));
    expect(gradeRank(roseGrades.perimeterDefense)).toBeLessThan(gradeRank('A-'));
    expect(gradeRank(gobertGrades.threePoint)).toBeLessThanOrEqual(gradeRank('D+'));
  });

  it('shows true rebounders as rebounders on public player cards', () => {
    const profiles = buildBaselineRatingProfiles();
    const roundfield1984 = profiles.find(profile => profile.full_name === 'Dan Roundfield' && profile.team === 'ATL' && profile.season === 1984);

    expect(roundfield1984).toBeTruthy();
    expect(gradeRank(buildScoutingGrades(roundfield1984!, roundfield1984).rebounding)).toBeGreaterThanOrEqual(gradeRank('A-'));
  });

  it('does not copy one broad legacy defense grade into every defensive subskill', () => {
    const grades = buildScoutingGrades({
      position: 'SG',
      grades: {
        defense: 'A',
      },
      hidden: {
        perimeterDefense: 88,
        lateralQuickness: 84,
        steals: 72,
        defenseIq: 80,
        postDefense: 58,
        blocking: 51,
        strength: 62,
        helpDefense: 68,
      },
      blocksPerGame: 0.2,
    });

    expect(gradeRank(grades.perimeterDefense)).toBeGreaterThanOrEqual(gradeRank('B'));
    expect(gradeRank(grades.blocking)).toBeLessThanOrEqual(gradeRank('D+'));
    expect(gradeRank(grades.postDefense)).toBeLessThanOrEqual(gradeRank('C-'));
  });

  it('separates skill, role, impact, overall, and trade value grades', () => {
    const benchShooter = buildScoutingGrades({
      hidden: {
        threePoint: 91,
        shotIq: 88,
        consistency: 84,
        offenseIq: 80,
        minutes: 14,
        usage: 12,
        durability: 72,
        tradeValue: 74,
      },
      minutesPerGame: 14,
      usagePct: 12,
      fg3a_per_game: 4,
    }) as any;

    expect(benchShooter.threePoint).toBe('A-');
    expect(benchShooter.role).toBe('C');
    expect(benchShooter.impact).toBe('B-');
    expect(benchShooter.overall).toBe('C+');
    expect(benchShooter.tradeValue).toBe('C+');
  });

  it('keeps potential labels separate from role labels', () => {
    const primeSuperstar = buildScoutingGrades({
      age: 25,
      hidden: {
        shooting: 94,
        playmaking: 96,
        defense: 84,
        athleticism: 97,
        basketballIq: 94,
        potential: 65,
        developmentRate: 88,
        workEthic: 90,
      },
      visibleIdentity: { reputation: 'Superstar' },
      seasonStats: { games: 70, minutes: 2500, points: 1800, assists: 560, rebounds: 320 },
    });

    expect(gradeRank(primeSuperstar.potential)).toBeGreaterThanOrEqual(gradeRank('B+'));

    const veteranSummary = getPotentialScoutingSummary({
      age: 35,
      hidden: {
        shooting: 95,
        playmaking: 94,
        defense: 82,
        athleticism: 86,
        basketballIq: 98,
        potential: 68,
      },
      visibleIdentity: { reputation: 'Superstar' },
    });

    expect(veteranSummary.label).toBe('Near Peak');
    expect(veteranSummary.label).not.toBe('Contributor');
    expect(veteranSummary.description).toContain('already close to his ceiling');

    const rotationSummary = getPotentialScoutingSummary({
      age: 26,
      hidden: {
        shooting: 78,
        playmaking: 76,
        defense: 75,
        athleticism: 77,
        basketballIq: 76,
        potential: 84,
        developmentRate: 86,
        workEthic: 84,
      },
    });

    expect(rotationSummary.label).toBe('Rotation Upside');
    expect(rotationSummary.label).not.toMatch(/Starter|Contributor|Role/i);
  });
});
