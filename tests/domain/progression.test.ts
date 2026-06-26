import { describe, expect, it } from 'vitest';
import { progressPlayer } from '@/domain/nba/progression';

const player = {
  id: 'player-1',
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
};

describe('NBA player progression', () => {
  it('keeps annual grade movement controlled and deterministic', () => {
    const first = progressPlayer(player, {
      minutes: 1800,
      points: 980,
      assists: 280,
      rebounds: 310,
      awards: ['rookie'],
      injuryGamesMissed: 2,
    }, 'seed');
    const second = progressPlayer(player, {
      minutes: 1800,
      points: 980,
      assists: 280,
      rebounds: 310,
      awards: ['rookie'],
      injuryGamesMissed: 2,
    }, 'seed');

    expect(second).toEqual(first);
    expect(Math.abs((first.hidden.shooting as number) - player.hidden.shooting)).toBeLessThanOrEqual(8);
    expect(Math.abs((first.hidden.defense as number) - player.hidden.defense)).toBeLessThanOrEqual(8);
    expect(first.hidden.seasonsPlayed).toBe(2);
    expect(first.visible.grades.shooting).toBeTruthy();
  });

  it('lets aging veterans decline without falling off a cliff', () => {
    const veteran = progressPlayer({
      id: 'veteran',
      hidden: { ...player.hidden, age: 35, shooting: 84, athleticism: 78, seasonsPlayed: 12 },
    }, {
      minutes: 900,
      injuryGamesMissed: 25,
    }, 'vet-seed');

    expect(veteran.hidden.age).toBe(36);
    expect(veteran.hidden.athleticism as number).toBeLessThanOrEqual(78);
    expect(78 - (veteran.hidden.athleticism as number)).toBeLessThanOrEqual(8);
  });

  it('uses potential, playstyle, and season performance to boost matching detailed grades', () => {
    const wing = progressPlayer({
      id: 'two-way-wing',
      playstyle: 'Two-Way Wing',
      hidden: {
        shooting: 76,
        defense: 82,
        perimeterDefense: 82,
        helpDefense: 80,
        defenseIq: 81,
        stamina: 80,
        threePoint: 74,
        potential: 92,
        age: 23,
      },
    }, {
      minutes: 2600,
      points: 1200,
      rebounds: 430,
      steals: 95,
      blocks: 55,
      awards: ['All-Defense'],
    }, 'wing-seed');

    expect(wing.hidden.potential).toBe(92);
    expect(wing.hidden.perimeterDefense as number).toBeGreaterThan(82);
    expect(wing.hidden.helpDefense as number).toBeGreaterThan(80);
    expect(wing.hidden.stamina as number).toBeGreaterThan(80);
    expect(wing.progression.seasonDelta.perimeterDefense).toBeGreaterThan(0);
    expect(wing.progression.focusAreas).toContain('perimeterDefense');
  });
});
