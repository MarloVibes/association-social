import { describe, expect, it } from 'vitest';
import { simulateGame, type SimGameInput } from '@/domain/nba/simulateGame';

const fixture = {
  home: {
    teamId: 'BOS',
    players: Array.from({ length: 10 }, (_, index) => ({
      playerId: `h${index}`,
      name: `Home ${index}`,
      minutes: index < 5 ? 30 : 18,
      shooting: 85 - index,
      playmaking: 80 - index,
      defense: 78 - index,
    })),
  },
  away: {
    teamId: 'LAL',
    players: Array.from({ length: 10 }, (_, index) => ({
      playerId: `a${index}`,
      name: `Away ${index}`,
      minutes: index < 5 ? 30 : 18,
      shooting: 82 - index,
      playmaking: 78 - index,
      defense: 76 - index,
    })),
  },
};

describe('NBA game simulation', () => {
  it('refuses to simulate without real players for both teams', () => {
    expect(() => simulateGame({
      home: { teamId: 'BOS', players: [] },
      away: fixture.away,
    }, 'missing-roster')).toThrow('Cannot simulate');
  });

  it('returns a stable legal full box score', () => {
    const first = simulateGame(fixture, 'game-seed');
    const second = simulateGame(fixture, 'game-seed');

    expect(second).toEqual(first);
    expect(first.home.players.reduce((total, player) => total + player.minutes, 0)).toBe(240);
    expect(first.away.players.reduce((total, player) => total + player.minutes, 0)).toBe(240);
    expect(first.home.points).toBe(first.home.players.reduce((total, player) => total + player.points, 0));
    expect(first.away.points).toBe(first.away.players.reduce((total, player) => total + player.points, 0));
    expect(first.home.points).not.toBe(first.away.points);
    expect(first.quarters).toHaveLength(4);
    expect(first.story.length).toBeGreaterThan(0);
    expect(first.home.players[0]).toMatchObject({
      fieldGoalsMade: expect.any(Number),
      fieldGoalsAttempted: expect.any(Number),
      threePointersMade: expect.any(Number),
      threePointersAttempted: expect.any(Number),
      freeThrowsMade: expect.any(Number),
      freeThrowsAttempted: expect.any(Number),
      offensiveRebounds: expect.any(Number),
      defensiveRebounds: expect.any(Number),
      fouls: expect.any(Number),
      plusMinus: expect.any(Number),
      starter: true,
    });
  });

  it('keeps player production tied to skill profiles and realistic team totals', () => {
    const result = simulateGame({
      home: {
        teamId: 'SAS',
        players: [
          { playerId: 'duncan', name: 'Tim Duncan', position: 'PF', minutes: 34, shooting: 84, playmaking: 62, rebounding: 94, defense: 96 },
          { playerId: 'parker', name: 'Tony Parker', position: 'PG', minutes: 34, shooting: 88, playmaking: 91, rebounding: 45, defense: 72 },
          { playerId: 'ginobili', name: 'Manu Ginobili', position: 'SG', minutes: 30, shooting: 89, playmaking: 86, rebounding: 58, defense: 78 },
          { playerId: 'splitter', name: 'Tiago Splitter', position: 'C', minutes: 24, shooting: 66, playmaking: 45, rebounding: 82, defense: 80 },
          { playerId: 'green', name: 'Danny Green', position: 'SG', minutes: 22, shooting: 80, playmaking: 52, rebounding: 55, defense: 82 },
        ],
      },
      away: {
        teamId: 'CHI',
        players: [
          { playerId: 'rose', name: 'Derrick Rose', position: 'PG', minutes: 38, shooting: 92, playmaking: 92, rebounding: 52, defense: 70 },
          { playerId: 'boozer', name: 'Carlos Boozer', position: 'PF', minutes: 32, shooting: 80, playmaking: 50, rebounding: 88, defense: 62 },
          { playerId: 'noah', name: 'Joakim Noah', position: 'C', minutes: 30, shooting: 62, playmaking: 70, rebounding: 90, defense: 90 },
          { playerId: 'korver', name: 'Kyle Korver', position: 'SG', minutes: 22, shooting: 89, playmaking: 48, rebounding: 42, defense: 55 },
          { playerId: 'asik', name: 'Omer Asik', position: 'C', minutes: 14, shooting: 45, playmaking: 34, rebounding: 84, defense: 82 },
        ],
      },
    }, 'profile-seed');

    expect(result.home.rebounds).toBeLessThanOrEqual(58);
    expect(result.away.rebounds).toBeLessThanOrEqual(58);
    expect(result.home.assists).toBeLessThanOrEqual(34);
    expect(result.away.assists).toBeLessThanOrEqual(34);
    const home = new Map(result.home.players.map(player => [player.name, player]));
    const away = new Map(result.away.players.map(player => [player.name, player]));
    expect(home.get('Tim Duncan')!.rebounds).toBeGreaterThan(home.get('Tony Parker')!.rebounds);
    expect(home.get('Tony Parker')!.assists).toBeGreaterThan(home.get('Tim Duncan')!.assists);
    expect(away.get('Derrick Rose')!.rebounds).toBeLessThanOrEqual(8);
    expect(away.get('Omer Asik')!.assists).toBeLessThanOrEqual(2);
  });

  it('uses detailed grade profiles to shape shot selection and defensive impact', () => {
    const result = simulateGame({
      home: {
        teamId: 'SKILL',
        players: [
          { playerId: 'shooter', name: 'Pure Shooter', position: 'SG', minutes: 36, shooting: 82, playmaking: 70, defense: 72, threePoint: 96, midRange: 82, closeShot: 68, dunking: 45, shotIq: 90 },
          { playerId: 'driver', name: 'Paint Driver', position: 'SF', minutes: 36, shooting: 82, playmaking: 70, defense: 72, threePoint: 58, midRange: 74, closeShot: 92, dunking: 91, shotIq: 80 },
          { playerId: 'lockdown', name: 'Lockdown Wing', position: 'SF', minutes: 34, shooting: 70, playmaking: 66, defense: 90, perimeterDefense: 96, defenseIq: 94, helpDefense: 91, stealsSkill: 88 },
          { playerId: 'big', name: 'Glass Big', position: 'C', minutes: 30, shooting: 62, playmaking: 48, defense: 82, rebounding: 94, blocking: 88, postDefense: 86 },
          { playerId: 'guard', name: 'Table Guard', position: 'PG', minutes: 30, shooting: 76, playmaking: 86, defense: 72, passing: 90, ballHandle: 88, offenseIq: 86 },
        ],
      },
      away: {
        teamId: 'PLAIN',
        players: Array.from({ length: 8 }, (_, index) => ({
          playerId: `plain${index}`,
          name: `Plain ${index}`,
          position: index === 0 ? 'PG' : index === 4 ? 'C' : 'G',
          minutes: index < 5 ? 30 : 18,
          shooting: 75,
          playmaking: 70,
          defense: 70,
        })),
      },
    }, 'detailed-sim-seed');

    const home = new Map(result.home.players.map(player => [player.name, player]));
    expect(home.get('Pure Shooter')!.threePointersAttempted).toBeGreaterThan(home.get('Paint Driver')!.threePointersAttempted);
    expect(home.get('Lockdown Wing')!.steals + home.get('Lockdown Wing')!.blocks).toBeGreaterThanOrEqual(2);
    expect(result.home.points).toBeGreaterThan(result.away.points - 8);
  });

  it('uses rating-engine category grades and tendencies to shape player production', () => {
    const result = simulateGame({
      home: {
        teamId: 'ENGINE',
        players: [
          {
            playerId: 'category-shooter',
            name: 'Category Shooter',
            position: 'SG',
            minutes: 36,
            shooting: 70,
            playmaking: 66,
            defense: 68,
            category_skill_grades: {
              threePoint: { rating: 96, grade: 'A+' },
              finishing: { rating: 62, grade: 'C-' },
              playmaking: { rating: 72, grade: 'C+' },
            },
            tendencies: {
              threePointFrequency: 96,
              catchAndShootFrequency: 94,
              paintAttack: 42,
              rimFinishFrequency: 45,
            },
          },
          {
            playerId: 'category-driver',
            name: 'Category Driver',
            position: 'SF',
            minutes: 36,
            shooting: 70,
            playmaking: 66,
            defense: 68,
            category_skill_grades: {
              threePoint: { rating: 66, grade: 'C' },
              finishing: { rating: 94, grade: 'A' },
              playmaking: { rating: 74, grade: 'C+' },
            },
            tendencies: {
              threePointFrequency: 34,
              catchAndShootFrequency: 38,
              paintAttack: 94,
              rimFinishFrequency: 92,
            },
          },
          { playerId: 'engine-pg', name: 'Engine PG', position: 'PG', minutes: 32, shooting: 76, playmaking: 84, defense: 72 },
          { playerId: 'engine-pf', name: 'Engine PF', position: 'PF', minutes: 30, shooting: 72, playmaking: 60, defense: 78, rebounding: 82 },
          { playerId: 'engine-c', name: 'Engine C', position: 'C', minutes: 28, shooting: 68, playmaking: 54, defense: 82, rebounding: 88 },
        ],
      },
      away: fixture.away,
    }, 'rating-engine-sim-seed');

    const lines = new Map(result.home.players.map(player => [player.name, player]));
    expect(lines.get('Category Shooter')!.threePointersAttempted).toBeGreaterThan(lines.get('Category Driver')!.threePointersAttempted);
    expect(lines.get('Category Shooter')!.points).toBeGreaterThan(0);
    expect(lines.get('Category Driver')!.freeThrowsAttempted).toBeGreaterThanOrEqual(lines.get('Category Shooter')!.freeThrowsAttempted);
  });

  it('lets audited baseline profiles override stale saved shooting data', () => {
    const result = simulateGame({
      home: {
        teamId: 'AUDIT',
        players: [
          {
            playerId: 'stale-center',
            name: 'Stale Center',
            position: 'C',
            minutes: 34,
            shooting: 99,
            threePoint: 99,
            hidden: { shooting: 99, threePoint: 99, shotIq: 99 },
            category_skill_grades: {
              threePoint: { rating: 99, grade: 'S' },
              finishing: { rating: 82, grade: 'B' },
            },
            baselineRatingProfile: {
              attribute_model: { shooting: 48, threePoint: 35, shotIq: 62, closeShot: 78, dunking: 60 },
              source_stat_line: { threePointAttemptsPerGame: 0.1 },
              category_skill_grades: {
                threePoint: { rating: 42, grade: 'F' },
                finishing: { rating: 76, grade: 'B-' },
              },
            },
            tendencies: {
              threePointFrequency: 30,
              catchAndShootFrequency: 26,
              paintAttack: 62,
            },
          },
          {
            playerId: 'real-shooter',
            name: 'Real Shooter',
            position: 'SG',
            minutes: 34,
            shooting: 82,
            threePoint: 86,
            hidden: { shooting: 82, threePoint: 86, shotIq: 84 },
            category_skill_grades: {
              threePoint: { rating: 86, grade: 'B+' },
              finishing: { rating: 64, grade: 'C-' },
            },
            tendencies: {
              threePointFrequency: 88,
              catchAndShootFrequency: 86,
              paintAttack: 38,
            },
          },
          { playerId: 'audit-pg', name: 'Audit PG', position: 'PG', minutes: 32, shooting: 76, playmaking: 84, defense: 72 },
          { playerId: 'audit-pf', name: 'Audit PF', position: 'PF', minutes: 30, shooting: 72, playmaking: 60, defense: 78, rebounding: 82 },
          { playerId: 'audit-sf', name: 'Audit SF', position: 'SF', minutes: 28, shooting: 70, playmaking: 58, defense: 76 },
        ],
      },
      away: fixture.away,
    }, 'audited-baseline-sim-seed');

    const lines = new Map(result.home.players.map(player => [player.name, player]));
    expect(lines.get('Stale Center')!.threePointersAttempted).toBeLessThan(lines.get('Real Shooter')!.threePointersAttempted);
    expect(lines.get('Stale Center')!.threePointersAttempted).toBeLessThanOrEqual(1);
    expect(lines.get('Stale Center')!.threePointersMade).toBe(0);
  });

  it('creates believable star explosions, quiet nights, and specialist bench pops', () => {
    const varianceFixture: SimGameInput = {
      home: {
        teamId: 'VAR',
        players: [
          {
            playerId: 'elite-wing',
            name: 'Elite Wing',
            position: 'SF',
            minutes: 38,
            shooting: 95,
            playmaking: 88,
            defense: 84,
            category_skill_grades: {
              overallOffense: { rating: 97, grade: 'A+' },
              finishing: { rating: 96, grade: 'A+' },
              threePoint: { rating: 91, grade: 'A-' },
              midRange: { rating: 94, grade: 'A' },
              playmaking: { rating: 88, grade: 'B+' },
            },
            tendencies: {
              paintAttack: 94,
              midRangeFrequency: 88,
              threePointFrequency: 76,
              isolationFrequency: 92,
              drawFoulPressure: 92,
            },
          },
          {
            playerId: 'bench-flamethrower',
            name: 'Bench Flamethrower',
            position: 'SG',
            minutes: 19,
            shooting: 86,
            playmaking: 54,
            defense: 58,
            category_skill_grades: {
              threePoint: { rating: 94, grade: 'A' },
              finishing: { rating: 58, grade: 'D+' },
              playmaking: { rating: 54, grade: 'D+' },
            },
            tendencies: {
              threePointFrequency: 98,
              catchAndShootFrequency: 96,
              paintAttack: 24,
            },
          },
          { playerId: 'generic-bench', name: 'Generic Bench', position: 'SG', minutes: 19, shooting: 66, playmaking: 58, defense: 60 },
          { playerId: 'starter-pg', name: 'Starter PG', position: 'PG', minutes: 33, shooting: 77, playmaking: 84, defense: 72 },
          { playerId: 'starter-pf', name: 'Starter PF', position: 'PF', minutes: 32, shooting: 74, playmaking: 60, rebounding: 82, defense: 78 },
          { playerId: 'starter-c', name: 'Starter C', position: 'C', minutes: 30, shooting: 70, playmaking: 52, rebounding: 88, defense: 84 },
          { playerId: 'reserve-f', name: 'Reserve F', position: 'SF', minutes: 14, shooting: 68, playmaking: 55, defense: 70 },
        ],
      },
      away: fixture.away,
    };
    const seeds = Array.from({ length: 90 }, (_, index) => `variance-${index}`);
    const lines = seeds.map((seed) => {
      const result = simulateGame(varianceFixture, seed);
      return new Map(result.home.players.map(player => [player.name, player.points]));
    });

    const elitePoints = lines.map(line => line.get('Elite Wing') || 0);
    const specialistPoints = lines.map(line => line.get('Bench Flamethrower') || 0);
    const genericBenchPoints = lines.map(line => line.get('Generic Bench') || 0);

    expect(Math.max(...elitePoints)).toBeGreaterThanOrEqual(40);
    expect(Math.min(...elitePoints)).toBeLessThanOrEqual(18);
    expect(Math.max(...specialistPoints)).toBeGreaterThanOrEqual(25);
    expect(Math.max(...genericBenchPoints)).toBeLessThan(22);
  });

  it('uses public efficiency signals so similar grades do not produce identical scoring value', () => {
    const result = simulateGame({
      home: {
        teamId: 'EFF',
        players: [
          {
            playerId: 'efficient-primary',
            name: 'Efficient Primary',
            position: 'SF',
            minutes: 38,
            shooting: 88,
            playmaking: 82,
            defense: 76,
            baselineRatingProfile: {
              source_stat_line: {
                trueShootingPct: 0.635,
                effectiveFieldGoalPct: 0.585,
                turnoverPct: 9.5,
                freeThrowAttemptsPerGame: 7.2,
              },
            },
          },
          {
            playerId: 'inefficient-primary',
            name: 'Inefficient Primary',
            position: 'SF',
            minutes: 38,
            shooting: 88,
            playmaking: 82,
            defense: 76,
            baselineRatingProfile: {
              source_stat_line: {
                trueShootingPct: 0.505,
                effectiveFieldGoalPct: 0.455,
                turnoverPct: 15.8,
                freeThrowAttemptsPerGame: 3.1,
              },
            },
          },
          { playerId: 'eff-pg', name: 'Efficiency PG', position: 'PG', minutes: 34, shooting: 76, playmaking: 84, defense: 72 },
          { playerId: 'eff-pf', name: 'Efficiency PF', position: 'PF', minutes: 30, shooting: 72, playmaking: 60, defense: 78, rebounding: 82 },
          { playerId: 'eff-c', name: 'Efficiency C', position: 'C', minutes: 28, shooting: 68, playmaking: 54, defense: 82, rebounding: 88 },
        ],
      },
      away: fixture.away,
    }, 'efficiency-profile-seed');

    const lines = new Map(result.home.players.map(player => [player.name, player]));
    const efficient = lines.get('Efficient Primary')!;
    const inefficient = lines.get('Inefficient Primary')!;
    const efficientTrueAttempts = efficient.fieldGoalsAttempted + 0.44 * efficient.freeThrowsAttempted;
    const inefficientTrueAttempts = inefficient.fieldGoalsAttempted + 0.44 * inefficient.freeThrowsAttempted;

    expect(efficient.points).toBeGreaterThanOrEqual(inefficient.points);
    expect(efficient.points / efficientTrueAttempts).toBeGreaterThan(inefficient.points / inefficientTrueAttempts);
    expect(efficient.turnovers).toBeLessThanOrEqual(inefficient.turnovers);
  });

  it('keeps raw era ids out of generated game stories', () => {
    const result = simulateGame({
      home: { ...fixture.home, teamId: 'SAS_2011' },
      away: { ...fixture.away, teamId: 'CHI' },
    }, 'era-story-seed');

    expect(result.story).not.toContain('_2011');
  });

  it('writes a specific postgame story instead of a generic rotation summary', () => {
    const result = simulateGame(fixture, 'story-detail-seed');

    expect(result.story).not.toContain('controlled the decisive stretches');
    expect(result.story).not.toContain('balanced rotation production');
    expect(result.story).toMatch(/BOS|LAL/);
    expect(result.story).toMatch(/points/);
  });
});
