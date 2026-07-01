import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  advancePlayerForNewSeason,
  advanceNbaPlayerForNewSeason,
  autoCutTeamRoster,
  buildNextSeasonLeague,
  serverRosterCompliance,
} = require('../../functions/franchise/newSeason.js');

describe('new season orchestration', () => {
  it('uses sport roster and finance limits', () => {
    expect(serverRosterCompliance('madden', {
      players: Array.from({ length: 54 }, (_, index) => ({ id: String(index), salary: 1 })),
      salaryCap: 100,
    }, { salaryCap: 100 }).errors).toContain('roster_limit');
    expect(serverRosterCompliance('mlb', {
      players: [{ id: 'a', salary: 151 }],
      budget: 150,
    }, { teamBudget: 150 }).errors).toContain('financial_limit');
  });

  it('enforces NBA standard and two-way roster slots separately', () => {
    expect(serverRosterCompliance('nba', {
      players: [
        ...Array.from({ length: 15 }, (_, index) => ({ id: `s${index}`, contractType: 'standard' })),
        ...Array.from({ length: 3 }, (_, index) => ({ id: `tw${index}`, contractType: 'two_way' })),
      ],
    }, {}).valid).toBe(true);
    expect(serverRosterCompliance('nba', {
      players: [
        ...Array.from({ length: 16 }, (_, index) => ({ id: `s${index}`, contractType: 'standard' })),
        ...Array.from({ length: 3 }, (_, index) => ({ id: `tw${index}`, contractType: 'two_way' })),
      ],
    }, {}).errors).toContain('standard_roster_limit');
    expect(serverRosterCompliance('nba', {
      players: [
        ...Array.from({ length: 15 }, (_, index) => ({ id: `s${index}`, contractType: 'standard' })),
        ...Array.from({ length: 4 }, (_, index) => ({ id: `tw${index}`, contractType: 'twoWay' })),
      ],
    }, {}).errors).toContain('two_way_limit');
  });

  it('auto-cuts the lowest-value CPU surplus', () => {
    const result = autoCutTeamRoster('madden', {
      id: 'cpu',
      salaryCap: 100,
      players: [
        { id: 'star', position: 'QB', overall: 95, salary: 60 },
        { id: 'backup', position: 'QB', overall: 60, salary: 20 },
        { id: 'fringe', position: 'WR', overall: 40, salary: 30 },
      ],
    }, { salaryCap: 100 }, 2, { QB: 1, WR: 0 });

    expect(result.cut.map((player: any) => player.id)).toEqual(['fringe']);
    expect(result.compliance.valid).toBe(true);
  });

  it('ages players, advances contracts, and identifies retirement', () => {
    expect(advancePlayerForNewSeason({
      id: 'p',
      age: 29,
      contractYears: 3,
    }, 2028)).toMatchObject({
      age: 30,
      contractYears: 2,
      contractExpired: false,
      retired: false,
    });
    expect(advancePlayerForNewSeason({
      id: 'new-deal',
      age: 25,
      contractYears: 1,
      signedSeason: 2027,
    }, 2028)).toMatchObject({
      contractYears: 1,
      contractExpired: false,
    });
    expect(advancePlayerForNewSeason({
      id: 'expired',
      age: 25,
      contractYears: 1,
    }, 2028)).toMatchObject({
      contractYears: 0,
      contractExpired: true,
    });
    expect(advancePlayerForNewSeason({
      id: 'old',
      age: 38,
      retirement_year: 2028,
    }, 2028).retired).toBe(true);
    expect(advancePlayerForNewSeason({
      id: 'wr',
      age: 25,
      contractYears: 2,
      statHistory: { 2026: { receptions: 80 } },
      seasonStats: { receptions: 94, yards: 1250, touchdowns: 11 },
    }, 2028)).toMatchObject({
      statHistory: {
        2026: { receptions: 80 },
        2027: { receptions: 94, yards: 1250, touchdowns: 11 },
      },
      seasonStats: {},
    });
  });

  it('increments numeric MLB/NFL seasons without NBA era logic', () => {
    expect(buildNextSeasonLeague({
      sport: 'madden',
      currentYear: 2027,
      era: null,
      offseason: {
        stage: 'ready_for_season',
        seasonYear: 2027,
        version: 8,
      },
    }, 'now')).toMatchObject({
      currentYear: 2028,
      currentSeason: '2028',
      era: null,
      offseason: {
        stage: 'regular_season',
        seasonYear: 2028,
        version: 9,
        draftStatus: 'none',
        contractRoundsComplete: false,
        stageStartedAt: 'now',
      },
    });
  });

  it('advances NBA leagues into the next era season without stopping at 2025', () => {
    expect(buildNextSeasonLeague({
      sport: 'nba',
      currentYear: 2025,
      currentSeason: '2025-26',
      scheduleLocked: true,
      scheduleId: '2025',
      salaryCap: 154_647_000,
      capHistory: [],
      offseason: {
        stage: 'ready_for_season',
        seasonYear: 2025,
        version: 4,
      },
    }, 'now')).toMatchObject({
      currentYear: 2026,
      currentSeason: '2026-27',
      scheduleLocked: false,
      scheduleId: null,
      salaryCap: 164_961_000,
      capHistory: [{
        seasonYear: 2026,
        salaryCap: 164_961_000,
        luxuryTaxLine: 200_428_000,
        firstApron: 209_015_000,
        secondApron: 221_686_000,
        nonTaxpayerMidLevelException: 15_044_000,
        taxpayerMidLevelException: 6_064_000,
        minimumSalary: 1_649_610,
        rookieScaleBase: 8_248_050,
      }],
      offseason: {
        stage: 'regular_season',
        seasonYear: 2026,
        version: 5,
        draftStatus: 'none',
        contractRoundsComplete: false,
        stageStartedAt: 'now',
      },
    });
  });

  it('archives finalized season awards before advancing the league year', () => {
    const next = buildNextSeasonLeague({
      sport: 'nba',
      currentYear: 2026,
      currentSeason: '2026-27',
      salaryCap: 160_000_000,
      awardHistory: {
        mvp: [{ season: 2025, winnerName: 'Old MVP', teamAbbr: 'BOS' }],
      },
      seasonAwards: {
        mvp: [{ season: 2026, winnerName: 'Chris Paul', teamAbbr: 'NOH', note: 'MVP' }],
        defensive_player: [{ season: 2026, winnerName: 'Defensive Stopper', teamAbbr: 'CHI', note: 'DPOY' }],
      },
      awardsFinalizedSeason: 2026,
      offseason: {
        stage: 'ready_for_season',
        seasonYear: 2026,
        version: 2,
      },
    }, 'now');

    expect(next.awardHistory).toMatchObject({
      mvp: [
        { season: 2025, winnerName: 'Old MVP', teamAbbr: 'BOS' },
        { season: 2026, winnerName: 'Chris Paul', teamAbbr: 'NOH', note: 'MVP' },
      ],
      defensive_player: [
        { season: 2026, winnerName: 'Defensive Stopper', teamAbbr: 'CHI', note: 'DPOY' },
      ],
    });
    expect(next.seasonAwards).toEqual({});
    expect(next.awardsFinalizedSeason).toBeNull();
  });

  it('progresses NBA player identity while advancing age and contract', () => {
    const player = advanceNbaPlayerForNewSeason({
      id: 'p1',
      age: 22,
      contractYears: 3,
      statHistory: {
        2024: { points: 800 },
      },
      hidden: {
        shooting: 72,
        playmaking: 70,
        defense: 68,
        rebounding: 64,
        athleticism: 76,
        basketballIq: 69,
        consistency: 74,
        chemistry: 70,
        age: 22,
        seasonsPlayed: 1,
      },
      seasonStats: {
        minutes: 1800,
        points: 980,
        assists: 280,
        rebounds: 310,
        awards: ['MVP'],
      },
    }, 2026, 'season-seed');

    expect(player.age).toBe(23);
    expect(player.contractYears).toBe(2);
    expect(player.hidden.age).toBe(23);
    expect(player.hidden.seasonsPlayed).toBe(2);
    expect(player.grades.shooting).toBeTruthy();
    expect(player.progression.seasonDelta.shooting).toBeTypeOf('number');
    expect(player.progression.outcome).toBeTruthy();
    expect(player.statHistory).toMatchObject({
      2024: { points: 800 },
      2025: {
        minutes: 1800,
        points: 980,
        assists: 280,
        rebounds: 310,
        awards: ['MVP'],
      },
    });
    expect(player.seasonStats).toEqual({});
  });

  it('uses potential and playstyle to progress detailed NBA grades at season rollover', () => {
    const player = advanceNbaPlayerForNewSeason({
      id: 'deng',
      full_name: 'Luol Deng',
      age: 25,
      contractYears: 2,
      playstyle: 'Two-Way Wing',
      hidden: {
        shooting: 76,
        defense: 84,
        perimeterDefense: 84,
        helpDefense: 82,
        defenseIq: 83,
        stamina: 91,
        potential: 90,
        age: 25,
        seasonsPlayed: 6,
      },
      seasonStats: {
        minutes: 3200,
        points: 1400,
        rebounds: 470,
        steals: 85,
        blocks: 45,
        awards: ['All-Defense'],
      },
    }, 2012, 'deng-seed');

    expect(player.hidden.potential).toBe(90);
    expect(player.hidden.perimeterDefense).toBeGreaterThan(84);
    expect(player.hidden.helpDefense).toBeGreaterThan(82);
    expect(player.progression.focusAreas).toContain('perimeterDefense');
    expect(player.grades.potential).toBeTruthy();
  });

  it('keeps generational veteran skills resistant to normal age regression at rollover', () => {
    const base = {
      id: 'curry',
      full_name: 'Stephen Curry',
      age: 36,
      contractYears: 2,
      reputation: 'Legend',
      hidden: {
        shooting: 96,
        playmaking: 90,
        defense: 76,
        athleticism: 78,
        basketballIq: 97,
        threePoint: 99,
        shotIq: 98,
        passing: 88,
        clutch: 98,
        speed: 77,
        acceleration: 76,
        stamina: 88,
        potential: 97,
        age: 36,
        seasonsPlayed: 15,
        accolades: { mvp: 2, championship: 4, finals_mvp: 1 },
      },
      seasonStats: {
        minutes: 2500,
        points: 1900,
        assists: 520,
        rebounds: 360,
        awards: ['All-NBA'],
      },
    };
    const player = advanceNbaPlayerForNewSeason(base, 2027, 'curry-aging-seed');

    expect(player.hidden.shooting).toBeGreaterThanOrEqual(base.hidden.shooting);
    expect(player.hidden.basketballIq).toBeGreaterThanOrEqual(base.hidden.basketballIq);
    expect(player.hidden.athleticism).toBeLessThanOrEqual(base.hidden.athleticism);
    expect(player.progression.outcome).not.toBe('Sharp Decline');
  });

  it('resets team season condition when advancing rosters', () => {
    const result = autoCutTeamRoster('nba', {
      id: 'NOH',
      fatigue: 12,
      fatigueSequence: 82,
      minorInjuryCount: 4,
      severeInjuryCount: 1,
      injuries: [{ id: 'old-injury' }],
      players: Array.from({ length: 10 }, (_, index) => ({ id: `p${index}`, contractType: 'standard' })),
    }, {}, 15);

    expect(result.teamUpdates).toMatchObject({
      fatigue: 0,
      fatigueSequence: 0,
      minorInjuryCount: 0,
      severeInjuryCount: 0,
      injuries: [],
    });
  });
});
