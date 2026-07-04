import { describe, expect, it } from 'vitest';
import {
  buildVisibleIdentity,
  classifyNbaPlayer,
  matchesNbaClassificationFilter,
  gradeFromHiddenValue,
  reputationFromInputs,
} from '@/domain/nba/identity';

describe('NBA player identity', () => {
  it('maps hidden values to exact grades without exposing overall', () => {
    expect(gradeFromHiddenValue(98)).toBe('A+');
    expect(gradeFromHiddenValue(91)).toBe('A-');
    expect(gradeFromHiddenValue(78)).toBe('B-');
    expect(gradeFromHiddenValue(65)).toBe('C');
    expect(gradeFromHiddenValue(57)).toBe('D+');
    expect(gradeFromHiddenValue(53)).toBe('D');
    expect(gradeFromHiddenValue(50)).toBe('D-');
    expect(gradeFromHiddenValue(42)).toBe('F');

    const identity = buildVisibleIdentity({
      shooting: 91,
      playmaking: 78,
      defense: 65,
    });

    expect(identity).not.toHaveProperty('overall');
    expect(identity.grades.shooting).toBe('A-');
    expect(identity.grades.playmaking).toBe('B-');
    expect(identity.grades.defense).toBe('C');
  });

  it('derives roles, traits, strengths, weaknesses, and reputation from hidden values', () => {
    const identity = buildVisibleIdentity({
      shooting: 88,
      playmaking: 84,
      defense: 52,
      rebounding: 58,
      athleticism: 72,
      basketballIq: 81,
      consistency: 79,
      chemistry: 69,
      age: 22,
      accolades: { all_star: 1, championship: 1 },
    });

    expect(identity.primaryRole).toBe('Shot Creator');
    expect(identity.secondaryRole).toBe('Floor General');
    expect(identity.strengths).toEqual(['Shooting', 'Playmaking', 'Basketball IQ']);
    expect(identity.weaknesses).toEqual(['Defense', 'Rebounding']);
    expect(identity.developmentTrait).toBe('Rising');
    expect(identity.reputation).toBe('Star');
    expect((identity as Record<string, unknown>).hidden).toBeUndefined();
  });

  it('normalizes reputation inputs deterministically', () => {
    expect(reputationFromInputs({ accolades: { mvp: 2 }, seasonsPlayed: 9 })).toBe('Legend');
    expect(reputationFromInputs({ accolades: { mvp: 1 }, seasonsPlayed: 4 })).toBe('Superstar');
    expect(reputationFromInputs({ accolades: { all_nba_1st: 1 }, seasonsPlayed: 4 })).toBe('Superstar');
    expect(reputationFromInputs({ accolades: { all_star: 1 }, seasonsPlayed: 4 })).toBe('Star');
    expect(reputationFromInputs({ accolades: {}, seasonsPlayed: 1 })).toBe('Prospect');
  });

  it('uses production and skill strength before falling back to role player', () => {
    expect(reputationFromInputs({
      accolades: {},
      seasonsPlayed: 3,
      pointsPerGame: 18,
      reboundsPerGame: 6,
      assistsPerGame: 4,
      winShares: 8,
      minutesPerGame: 33,
    })).toBe('Starter');

    expect(reputationFromInputs({
      accolades: {},
      seasonsPlayed: 3,
      pointsPerGame: 27,
      reboundsPerGame: 7,
      assistsPerGame: 7,
      winShares: 12,
      usagePct: 30,
      offenseIq: 90,
      basketballIq: 90,
    })).toBe('Star');
  });

  it('uses reputation score instead of raw award weight for visible tiers', () => {
    expect(reputationFromInputs({
      accolades: {},
      seasonsPlayed: 8,
      pointsPerGame: 12,
      reboundsPerGame: 5,
      assistsPerGame: 2,
      minutesPerGame: 28,
      winShares: 4,
      usagePct: 18,
      reputationScore: 35,
    })).toBe('Starter');

    expect(reputationFromInputs({
      accolades: {},
      seasonsPlayed: 8,
      pointsPerGame: 24,
      reboundsPerGame: 7,
      assistsPerGame: 5,
      minutesPerGame: 36,
      winShares: 11,
      usagePct: 30,
      reputationScore: 82,
    })).toBe('Star');
  });

  it('builds visible reputation from hidden strength when accolade metadata is missing', () => {
    const identity = buildVisibleIdentity({
      shooting: 86,
      playmaking: 83,
      defense: 79,
      rebounding: 70,
      athleticism: 84,
      basketballIq: 87,
      consistency: 82,
      seasonsPlayed: 4,
      pointsPerGame: 19,
      reboundsPerGame: 5,
      assistsPerGame: 5,
      minutesPerGame: 34,
      winShares: 8.5,
    });

    expect(identity.reputation).toBe('Starter');
  });

  it('separates overall tier from archetype so one elite skill does not create a star', () => {
    const identity = classifyNbaPlayer({
      shooting: 96,
      threePoint: 98,
      defense: 48,
      playmaking: 52,
      athleticism: 55,
      basketballIq: 66,
      seasonsPlayed: 6,
      pointsPerGame: 8.4,
      reboundsPerGame: 2.1,
      assistsPerGame: 1.0,
      minutesPerGame: 17,
      winShares: 2.1,
      usagePct: 16,
    });

    expect(identity.tier).toBe('Specialist / Depth Piece');
    expect(identity.archetypes).toEqual(expect.arrayContaining(['Catch-and-Shoot Specialist']));
    expect(identity.archetypes).not.toContain('Primary Creator');
  });

  it('marks strong role players with valuable tiers and basketball-specific archetypes', () => {
    const identity = classifyNbaPlayer({
      shooting: 82,
      threePoint: 84,
      defense: 88,
      perimeterDefense: 91,
      helpDefense: 86,
      athleticism: 79,
      basketballIq: 83,
      seasonsPlayed: 6,
      pointsPerGame: 14,
      reboundsPerGame: 4.5,
      assistsPerGame: 2.3,
      minutesPerGame: 31,
      winShares: 5.2,
      usagePct: 18,
    });

    expect(identity.tier).toBe('Valuable Rotation Player');
    expect(identity.archetypes).toEqual(expect.arrayContaining(['3-and-D Wing', 'Perimeter Defender']));
  });

  it('keeps current tier, prospect tag, potential, and development outlook separate', () => {
    const identity = buildVisibleIdentity({
      shooting: 78,
      defense: 80,
      athleticism: 84,
      basketballIq: 75,
      potential: 88,
      age: 21,
      seasonsPlayed: 1,
      pointsPerGame: 12,
      reboundsPerGame: 4,
      assistsPerGame: 2,
      minutesPerGame: 27,
      winShares: 3.5,
      usagePct: 19,
    });

    expect(identity.tier).toBe('Valuable Rotation Player');
    expect(identity.developmentTag).toBe('Prospect');
    expect(identity.potentialLabel).toBe('Star Upside');
    expect(identity.developmentOutlook).toBe('Rising');
  });

  it('classifies franchise-changing creators without requiring broad role labels', () => {
    const identity = classifyNbaPlayer({
      shooting: 86,
      playmaking: 92,
      ballHandle: 95,
      passing: 88,
      dunking: 94,
      athleticism: 96,
      basketballIq: 88,
      consistency: 88,
      accolades: { mvp: 1, all_nba_1st: 1, all_star: 3 },
      seasonsPlayed: 4,
      pointsPerGame: 25,
      reboundsPerGame: 4,
      assistsPerGame: 7.7,
      minutesPerGame: 37,
      winShares: 13,
      usagePct: 32,
    });

    expect(identity.tier).toBe('Superstar');
    expect(identity.archetypes).toEqual(expect.arrayContaining(['Primary Creator', 'Athletic Finisher']));
    expect(identity.developmentOutlook).toBe('Near Peak');
  });

  it('filters players by tier and archetype together', () => {
    const identity = buildVisibleIdentity({
      shooting: 82,
      threePoint: 84,
      defense: 88,
      perimeterDefense: 91,
      helpDefense: 86,
      athleticism: 79,
      basketballIq: 83,
      seasonsPlayed: 6,
      pointsPerGame: 14,
      reboundsPerGame: 4.5,
      assistsPerGame: 2.3,
      minutesPerGame: 31,
      winShares: 5.2,
      usagePct: 18,
    });

    expect(matchesNbaClassificationFilter(identity, {
      tier: 'Valuable Rotation Player',
      archetype: '3-and-D Wing',
    })).toBe(true);
    expect(matchesNbaClassificationFilter(identity, {
      tier: 'Star',
      archetype: '3-and-D Wing',
    })).toBe(false);
    expect(matchesNbaClassificationFilter(identity, {
      archetype: 'Primary Creator',
    })).toBe(false);
  });
});
