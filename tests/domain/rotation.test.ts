import { describe, expect, it } from 'vitest';
import { buildCpuRotation, rotationValidationMessages, validateRotation } from '@/domain/nba/rotation';

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

  it('preserves canonical roster player_id values when auto-building rotations', () => {
    const players = Array.from({ length: 10 }, (_, i) => ({
      player_id: `vault-player-${i}`,
      id: `doc-player-${i}`,
      full_name: `Vault Player ${i + 1}`,
      value: 90 - i,
    }));

    const fallback = buildCpuRotation(players);

    expect(fallback.map(slot => slot.playerId)).toEqual(players.map(player => player.player_id));
  });

  it('prioritizes stars and high-impact creators over low-usage role players', () => {
    const rotation = buildCpuRotation([
      {
        player_id: 'rose',
        full_name: 'Derrick Rose',
        position: 'PG',
        ppg: 25,
        apg: 7.7,
        playerLabel: 'SUPERSTAR',
        hidden: { shooting: 92, playmaking: 94, defense: 70, rebounding: 50, basketballIq: 90, stamina: 94 },
      },
      {
        player_id: 'deng',
        full_name: 'Luol Deng',
        position: 'SF',
        ppg: 17,
        rpg: 6,
        hidden: { shooting: 78, playmaking: 64, defense: 86, rebounding: 74, basketballIq: 84, stamina: 92 },
      },
      {
        player_id: 'noah',
        full_name: 'Joakim Noah',
        position: 'C',
        ppg: 11,
        rpg: 10,
        hidden: { shooting: 62, playmaking: 72, defense: 91, rebounding: 92, basketballIq: 86, stamina: 88 },
      },
      {
        player_id: 'asik',
        full_name: 'Omer Asik',
        position: 'C',
        ppg: 3,
        rpg: 5,
        hidden: { shooting: 45, playmaking: 34, defense: 82, rebounding: 84, basketballIq: 62, stamina: 74 },
      },
      ...Array.from({ length: 7 }, (_, index) => ({
        player_id: `bench-${index}`,
        full_name: `Bench ${index}`,
        position: index % 2 ? 'G' : 'F',
        hidden: { shooting: 66 - index, playmaking: 58, defense: 60, rebounding: 54, basketballIq: 60 },
      })),
    ]);

    const minutesByPlayer = new Map(rotation.map(slot => [slot.playerId, slot.minutes]));

    expect(minutesByPlayer.get('rose')).toBeGreaterThan(minutesByPlayer.get('asik') || 0);
    expect(minutesByPlayer.get('rose')).toBeGreaterThanOrEqual(38);
    expect(rotation.find(slot => slot.playerId === 'rose')).toMatchObject({ starter: true, closing: true, role: 'primary' });
    expect(rotation.find(slot => slot.playerId === 'asik')?.minutes).toBeLessThanOrEqual(18);
  });

  it('converts validation codes into readable messages', () => {
    const validation = validateRotation([{ playerId: 'a', minutes: 48 }]);

    expect(rotationValidationMessages(validation)).toEqual([
      'Active minutes must add up to 240.',
    ]);
    expect(rotationValidationMessages(validateRotation(Array.from({ length: 10 }, (_, i) => ({ playerId: String(i), minutes: 24 }))))).toEqual([
      'Legal rotation',
    ]);
  });
});
