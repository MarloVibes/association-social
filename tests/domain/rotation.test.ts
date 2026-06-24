import { describe, expect, it } from 'vitest';
import { buildCpuRotation, validateRotation } from '@/domain/nba/rotation';

describe('NBA rotations', () => {
  it('requires exactly 240 active minutes', () => {
    expect(validateRotation([{ playerId: 'a', minutes: 48 }]).valid).toBe(false);
    expect(validateRotation(Array.from({ length: 10 }, (_, i) => ({ playerId: String(i), minutes: 24 })))).toMatchObject({ valid: true });
  });

  it('requires five starters and a closing lineup of active players', () => {
    const rotation = Array.from({ length: 10 }, (_, i) => ({
      playerId: String(i),
      minutes: 24,
      starter: i < 4,
      closing: i < 5,
    }));

    expect(validateRotation(rotation)).toMatchObject({
      valid: false,
      errors: ['starters_required'],
    });

    expect(validateRotation(rotation.map((slot, i) => ({ ...slot, starter: i < 5 })))).toMatchObject({ valid: true });
  });

  it('rejects duplicate, inactive, and invalid-minute rotation entries', () => {
    expect(validateRotation([
      { playerId: 'a', minutes: 120, starter: true },
      { playerId: 'a', minutes: 120, starter: true },
    ])).toMatchObject({ valid: false, errors: ['invalid_minutes', 'duplicate_player', 'starters_required'] });

    expect(validateRotation([
      ...Array.from({ length: 9 }, (_, i) => ({ playerId: String(i), minutes: 24, starter: i < 5, closing: i < 5 })),
      { playerId: 'resting', minutes: 24, status: 'rest' },
    ])).toMatchObject({ valid: false, errors: ['inactive_minutes'] });
  });

  it('builds a legal CPU fallback from available players', () => {
    const players = Array.from({ length: 12 }, (_, i) => ({
      playerId: `p${i}`,
      identity: { grades: { basketballIq: i >= 5 ? 'B' : 'A' } },
      value: 90 - i,
    }));

    const fallback = buildCpuRotation(players);
    const result = validateRotation(fallback);

    expect(result.valid).toBe(true);
    expect(fallback.filter(slot => slot.starter).map(slot => slot.playerId)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4']);
    expect(fallback.filter(slot => slot.closing).map(slot => slot.playerId)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4']);
    expect(fallback.filter(slot => slot.status === 'active')).toHaveLength(10);
  });
});
