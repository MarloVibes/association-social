import { describe, expect, it } from 'vitest';
import {
  buildCpuRotation,
  compareRosterPlayersByValue,
  matchesRosterPosition,
  normalizedRosterPosition,
  rotationValidationMessages,
  rosterPlayerValue,
  validateRotation,
} from '@/domain/nba/rotation';

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

  it('does not let placeholder value fields bury franchise players in auto minutes', () => {
    const rotation = buildCpuRotation([
      { player_id: 'lucas', full_name: 'John Lucas III', position: 'PG', value: 0, ppg: 7.5, apg: 2.2, rpg: 1.6, mpg: 14.8 },
      { player_id: 'bogans', full_name: 'Keith Bogans', position: 'SG', value: 0, ppg: 4.4, apg: 1.2, rpg: 1.8, mpg: 17.8 },
      { player_id: 'deng', full_name: 'Luol Deng', position: 'SF', value: 0, ppg: 17.4, apg: 2.8, rpg: 5.8, spg: 1.0, mpg: 39.1, hidden: { defense: 86, basketballIq: 84, stamina: 94 } },
      { player_id: 'taj', full_name: 'Taj Gibson', position: 'PF', value: 0, ppg: 7.1, rpg: 5.3, bpg: 1.3, mpg: 21.8, hidden: { defense: 82, rebounding: 80 } },
      { player_id: 'asik', full_name: 'Omer Asik', position: 'C', value: 0, ppg: 3.1, rpg: 5.3, bpg: 1.0, mpg: 14.7, hidden: { defense: 82, rebounding: 84 } },
      { player_id: 'boozer', full_name: 'Carlos Boozer', position: 'PF', value: 0, ppg: 17.5, rpg: 9.6, apg: 2.5, mpg: 31.9, hidden: { scoring: 82, rebounding: 84, basketballIq: 78 } },
      { player_id: 'brewer', full_name: 'Ronnie Brewer', position: 'SG', value: 0, ppg: 6.2, rpg: 3.2, mpg: 22.0, hidden: { defense: 78 } },
      { player_id: 'korver', full_name: 'Kyle Korver', position: 'SG', value: 0, ppg: 8.3, rpg: 1.8, mpg: 20.1, hidden: { shooting: 88, threePoint: 90 } },
      { player_id: 'noah', full_name: 'Joakim Noah', position: 'C', value: 0, ppg: 11.3, rpg: 10.4, apg: 2.2, bpg: 1.5, mpg: 32.8, hidden: { defense: 90, rebounding: 92, basketballIq: 84, stamina: 88 } },
      { player_id: 'rose', full_name: 'Derrick Rose', position: 'PG', value: 0, ppg: 25.0, apg: 7.7, rpg: 4.1, spg: 1.0, mpg: 37.4, playerLabel: 'SUPERSTAR', hidden: { scoring: 94, playmaking: 94, athleticism: 96, basketballIq: 90, stamina: 94 } },
    ]);

    const minutes = new Map(rotation.map(slot => [slot.playerId, slot.minutes]));
    const topFive = rotation.slice(0, 5).map(slot => slot.playerId);

    expect(topFive).toContain('rose');
    expect(topFive).toContain('noah');
    expect(minutes.get('rose')).toBeGreaterThanOrEqual(38);
    expect(minutes.get('rose')).toBeGreaterThan(minutes.get('lucas') || 0);
    expect(minutes.get('noah')).toBeGreaterThan(minutes.get('asik') || 0);
  });

  it('sorts team displays by roster value so stronger players appear first', () => {
    const players = [
      {
        player_id: 'bench-center',
        full_name: 'Bench Center',
        position: 'Center',
        hidden: { scoring: 48, playmaking: 35, defense: 70, rebounding: 76, basketballIq: 58, stamina: 68 },
      },
      {
        player_id: 'two-way-star',
        full_name: 'Two Way Star',
        position: 'Small Forward',
        playerLabel: 'STAR',
        hidden: { scoring: 85, playmaking: 78, defense: 91, rebounding: 75, basketballIq: 88, stamina: 92 },
      },
      {
        player_id: 'rotation-guard',
        full_name: 'Rotation Guard',
        position: 'Shooting Guard',
        hidden: { scoring: 72, playmaking: 70, defense: 68, rebounding: 48, basketballIq: 72, stamina: 78 },
      },
    ];

    const sorted = [...players].sort(compareRosterPlayersByValue);

    expect(rosterPlayerValue(sorted[0])).toBeGreaterThan(rosterPlayerValue(sorted[1]));
    expect(sorted.map(player => player.player_id)).toEqual(['two-way-star', 'rotation-guard', 'bench-center']);
  });

  it('matches roster position filters for full position names and broad groups', () => {
    const pointGuard = { full_name: 'Point Guard', position: 'Point Guard' };
    const comboForward = { full_name: 'Combo Forward', position: 'Small Forward and Power Forward' };
    const center = { full_name: 'Center', position: 'Center' };

    expect(normalizedRosterPosition(pointGuard)).toBe('PG');
    expect(matchesRosterPosition(pointGuard, 'PG')).toBe(true);
    expect(matchesRosterPosition(pointGuard, 'G')).toBe(true);
    expect(matchesRosterPosition(comboForward, 'SF')).toBe(true);
    expect(matchesRosterPosition(comboForward, 'F')).toBe(true);
    expect(matchesRosterPosition(center, 'C')).toBe(true);
    expect(matchesRosterPosition(center, 'G')).toBe(false);
    expect(matchesRosterPosition({ full_name: 'Shortstop', position: 'SS' }, 'SS')).toBe(true);
    expect(matchesRosterPosition({ full_name: 'Wide Receiver', position: 'WR' }, 'WR')).toBe(true);
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
