import { describe, expect, it } from 'vitest';

import {
  MLB_DRAFT_POSITIONS,
  NFL_DRAFT_POSITIONS,
  generateDraftClass,
} from '../../domain/draft/generateClass';
import {
  createSeededRandom,
  randomInt,
  randomPick,
} from '../../domain/draft/random';

describe('seeded draft randomness', () => {
  it('replays the same random sequence from the same seed', () => {
    const first = createSeededRandom('stable-seed');
    const second = createSeededRandom('stable-seed');

    expect(Array.from({ length: 8 }, () => first())).toEqual(
      Array.from({ length: 8 }, () => second()),
    );
  });

  it('produces bounded integers and deterministic selections', () => {
    const first = createSeededRandom('bounded-seed');
    const values = Array.from({ length: 100 }, () => randomInt(first, 3, 7));
    const pickFirst = createSeededRandom('pick-seed');
    const pickSecond = createSeededRandom('pick-seed');

    expect(values.every(value => value >= 3 && value <= 7)).toBe(true);
    expect(randomPick(pickFirst, ['A', 'B', 'C'])).toBe(randomPick(pickSecond, ['A', 'B', 'C']));
  });
});

describe('generateDraftClass', () => {
  it('generates stable sport-specific class sizes', () => {
    expect(generateDraftClass({ sport: 'nba', teams: 30, seed: 'x' })).toHaveLength(60);
    expect(generateDraftClass({ sport: 'madden', teams: 32, seed: 'x' })).toHaveLength(224);
    expect(generateDraftClass({ sport: 'mlb', teams: 30, seed: 'x' })).toHaveLength(150);
  });

  it('is deterministic for the same seed and changes for a different seed', () => {
    const first = generateDraftClass({ sport: 'madden', teams: 4, seed: 'alpha' });
    const replay = generateDraftClass({ sport: 'madden', teams: 4, seed: 'alpha' });
    const different = generateDraftClass({ sport: 'madden', teams: 4, seed: 'beta' });

    expect(replay).toEqual(first);
    expect(different).not.toEqual(first);
  });

  it('normalizes nfl to Madden generation', () => {
    expect(generateDraftClass({ sport: 'nfl', teams: 2, seed: 'alias' })).toEqual(
      generateDraftClass({ sport: 'madden', teams: 2, seed: 'alias' }),
    );
  });

  it('fills every configured draft round for smaller test leagues', () => {
    expect(new Set(generateDraftClass({
      sport: 'madden',
      teams: 2,
      seed: 'rounds',
    }).map(player => player.projectedRound))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7]));
    expect(new Set(generateDraftClass({
      sport: 'mlb',
      teams: 2,
      seed: 'rounds',
    }).map(player => player.projectedRound))).toEqual(new Set([1, 2, 3, 4, 5]));
  });

  it('creates unique stable player IDs and plausible identities', () => {
    const draftClass = generateDraftClass({ sport: 'mlb', teams: 30, seed: 'identity' });
    const replay = generateDraftClass({ sport: 'mlb', teams: 30, seed: 'identity' });
    const ids = draftClass.map(player => player.id);

    expect(new Set(ids).size).toBe(draftClass.length);
    expect(replay.map(player => player.id)).toEqual(ids);
    expect(draftClass.every(player => /^[A-Z][a-z]+ [A-Z][a-z'-]+$/.test(player.name))).toBe(true);
    expect(draftClass.every(player => player.age >= 18 && player.age <= 23)).toBe(true);
  });

  it('generates complete NFL prospects', () => {
    const prospects = generateDraftClass({ sport: 'madden', teams: 32, seed: 'nfl-class' });

    for (const prospect of prospects) {
      expect(prospect.sport).toBe('madden');
      expect(NFL_DRAFT_POSITIONS).toContain(prospect.position);
      expect(prospect.age).toBeGreaterThanOrEqual(20);
      expect(prospect.age).toBeLessThanOrEqual(24);
      expect(prospect.heightInches).toBeGreaterThanOrEqual(66);
      expect(prospect.heightInches).toBeLessThanOrEqual(81);
      expect(prospect.height).toMatch(/^\d'\d{1,2}"$/);
      expect(prospect.weight).toBeGreaterThanOrEqual(165);
      expect(prospect.weight).toBeLessThanOrEqual(380);
      expect(prospect.archetype.length).toBeGreaterThan(2);
      expect(prospect.projectedRound).toBeGreaterThanOrEqual(1);
      expect(prospect.projectedRound).toBeLessThanOrEqual(7);
      expect(Object.keys(prospect.ratings).length).toBeGreaterThanOrEqual(4);
      expect(Object.values(prospect.ratings).every(value => value >= 40 && value <= 99)).toBe(true);
      expect(['normal', 'star', 'superstar', 'x_factor']).toContain(prospect.developmentTrait);
      expect(prospect.summary.length).toBeGreaterThanOrEqual(30);
    }
  });

  it('generates complete MLB prospects', () => {
    const prospects = generateDraftClass({ sport: 'mlb', teams: 30, seed: 'mlb-class' });

    for (const prospect of prospects) {
      expect(prospect.sport).toBe('mlb');
      expect(MLB_DRAFT_POSITIONS).toContain(prospect.position);
      expect(['R', 'L', 'S']).toContain(prospect.handedness);
      expect(prospect.archetype.length).toBeGreaterThan(2);
      expect(prospect.projectedRound).toBeGreaterThanOrEqual(1);
      expect(prospect.projectedRound).toBeLessThanOrEqual(5);
      expect(Object.keys(prospect.ratings).length).toBeGreaterThanOrEqual(5);
      expect(Object.values(prospect.ratings).every(value => value >= 35 && value <= 99)).toBe(true);
      expect(prospect.potential).toBeGreaterThanOrEqual(55);
      expect(prospect.potential).toBeLessThanOrEqual(99);
      expect(prospect.summary.length).toBeGreaterThanOrEqual(30);
    }
  });

  it('generates NBA prospects with identity grades instead of visible overalls', () => {
    const prospects = generateDraftClass({ sport: 'nba', teams: 30, seed: 'nba-class' });

    for (const prospect of prospects) {
      expect(prospect.sport).toBe('nba');
      expect(['PG', 'SG', 'SF', 'PF', 'C']).toContain(prospect.position);
      expect(prospect.age).toBeGreaterThanOrEqual(18);
      expect(prospect.age).toBeLessThanOrEqual(23);
      expect(prospect.projectedRound).toBeGreaterThanOrEqual(1);
      expect(prospect.projectedRound).toBeLessThanOrEqual(2);
      expect(prospect.hidden).toBeTruthy();
      expect(prospect.visible.grades.shooting).toBeTruthy();
      expect((prospect as any).overall).toBeUndefined();
    }
  });

  it('rejects unsupported sports and invalid team counts', () => {
    expect(() => generateDraftClass({ sport: 'nhl', teams: 30, seed: 'x' })).toThrow(
      'Draft class generation supports only NBA, Madden/NFL, and MLB',
    );
    expect(() => generateDraftClass({ sport: 'mlb', teams: 0, seed: 'x' })).toThrow(
      'teams must be a positive integer',
    );
    expect(() => generateDraftClass({ sport: 'mlb', teams: 30, seed: '' })).toThrow(
      'seed is required',
    );
  });
});
