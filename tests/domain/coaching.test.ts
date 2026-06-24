import { describe, expect, it } from 'vitest';
import {
  COACHING_PRESETS,
  buildCoachingSnapshot,
  getCoachingPreset,
  validateCoachingPreset,
} from '@/domain/nba/coaching';

describe('NBA coaching presets', () => {
  it('defines explicit offensive and defensive modifiers', () => {
    const paceAndSpace = getCoachingPreset('pace_and_space');

    expect(paceAndSpace).toMatchObject({
      id: 'pace_and_space',
      offense: 'pace_and_space',
      defense: 'switch_heavy',
      modifiers: {
        pace: 8,
        threePointRate: 10,
        turnovers: 2,
        fouls: 1,
        fatigue: 6,
      },
    });
    expect(COACHING_PRESETS.length).toBeGreaterThanOrEqual(4);
  });

  it('validates named custom presets and rejects invalid modifier ranges', () => {
    expect(validateCoachingPreset({
      id: 'balanced-custom',
      name: 'Balanced Custom',
      offense: 'balanced',
      defense: 'drop',
      modifiers: {
        pace: 0,
        threePointRate: 0,
        rimPressure: 0,
        midrangeRate: 0,
        turnovers: 0,
        fouls: 0,
        rebounding: 0,
        fatigue: 0,
      },
      counters: ['switch_heavy'],
    })).toMatchObject({ valid: true });

    expect(validateCoachingPreset({
      id: '',
      name: '',
      offense: 'mystery' as any,
      defense: 'drop',
      modifiers: { pace: 99 } as any,
      counters: ['unknown'] as any,
    })).toMatchObject({
      valid: false,
      errors: ['id_required', 'name_required', 'invalid_offense', 'invalid_modifier', 'invalid_counter'],
    });
  });

  it('copies a preset snapshot for matchup preparation', () => {
    const source = getCoachingPreset('grit_and_grind');
    const snapshot = buildCoachingSnapshot(source, 'team-a', 'game-1');

    expect(snapshot).toMatchObject({
      teamId: 'team-a',
      gameId: 'game-1',
      presetId: source.id,
      name: source.name,
      modifiers: source.modifiers,
    });

    source.modifiers.pace = 10;
    expect(snapshot.modifiers.pace).not.toBe(10);
  });
});
