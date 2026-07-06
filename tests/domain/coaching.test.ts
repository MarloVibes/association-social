import { describe, expect, it } from 'vitest';
import {
  COACHING_PRESETS,
  applyCoachingGradeAdjustments,
  buildCoachingSnapshot,
  coachingPresetInfoText,
  getCoachingGradeAdjustments,
  getCoachingPreset,
  validateCoachingPreset,
} from '@/domain/nba/coaching';

describe('NBA coaching presets', () => {
  it('defines explicit offensive and defensive modifiers', () => {
    const fiveOut = getCoachingPreset('five_out');

    expect(fiveOut).toMatchObject({
      id: 'five_out',
      name: '5-Out',
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
    expect(getCoachingPreset('pace_and_space')).toMatchObject({
      id: 'five_out',
      name: '5-Out',
    });
    expect(COACHING_PRESETS.length).toBeGreaterThanOrEqual(6);
    expect(COACHING_PRESETS.map(preset => preset.id)).toEqual(expect.arrayContaining([
      'five_out',
      'zone_23',
      'zone_32',
      'pick_and_roll',
      'motion_offense',
      'half_court_press',
      'star_isolation',
      'post_inside',
      'transition_pace',
      'switch_everything',
      'double_star',
      'protect_paint',
    ]));
    expect(COACHING_PRESETS.every(preset => validateCoachingPreset(preset).valid)).toBe(true);
  });

  it('gives commissioners readable info text for every built-in preset', () => {
    COACHING_PRESETS.forEach((preset) => {
      expect(preset.description).toBeTruthy();
      expect(preset.boostSummary).toBeTruthy();
      expect(coachingPresetInfoText(preset)).toContain(preset.description);
      expect(coachingPresetInfoText(preset)).toContain(preset.boostSummary);
    });
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

  it('boosts players whose grades fit the coaching identity', () => {
    const blakeLikeFinisher = {
      position: 'PF',
      labels: ['star'],
      hidden: {
        dunking: 93,
        athleticism: 91,
        closeShot: 87,
        postOffense: 78,
        threePoint: 57,
      },
    };

    const adjustments = getCoachingGradeAdjustments('lob_city', blakeLikeFinisher);
    const coached = applyCoachingGradeAdjustments(blakeLikeFinisher, 'lob_city');

    expect(adjustments).toMatchObject({
      dunking: 2,
      athleticism: 2,
      closeShot: 1,
    });
    expect(coached.hidden).toMatchObject({
      dunking: 95,
      athleticism: 93,
      closeShot: 88,
    });
    expect(blakeLikeFinisher.hidden.dunking).toBe(93);
  });

  it('dings poor fits without changing the saved player card', () => {
    const lowMotorShooter = {
      position: 'SG',
      hidden: {
        defense: 58,
        perimeterDefense: 55,
        defenseIq: 57,
        strength: 49,
        rebounding: 45,
        stamina: 58,
      },
    };

    const adjustments = getCoachingGradeAdjustments('grit_and_grind', lowMotorShooter);
    const coached = applyCoachingGradeAdjustments(lowMotorShooter, 'grit_and_grind');

    expect(adjustments).toMatchObject({
      defense: -1,
      stamina: -1,
    });
    expect(coached.hidden.defense).toBe(57);
    expect(lowMotorShooter.hidden.defense).toBe(58);
  });
});
