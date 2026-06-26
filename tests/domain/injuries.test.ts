import { describe, expect, it } from 'vitest';
import { applyInjuryAction, generateInjuryEvent, updateTeamFatigue } from '@/domain/nba/injuries';

describe('NBA injuries and fatigue', () => {
  it('caps minor events once a team has reached the season limit', () => {
    expect(generateInjuryEvent({ minorCount: 6, severeCount: 0, seed: 'x' })).toBeNull();
  });

  it('never creates more than 15 missed games for severe injuries', () => {
    const event = generateInjuryEvent({ minorCount: 0, severeCount: 0, seed: 'severe-seed', force: 'severe' });

    expect(event).toBeTruthy();
    expect(event!.severity).toBe('severe');
    expect(event!.gamesRemaining).toBeLessThanOrEqual(15);
  });

  it('is deterministic and keeps minor injuries short', () => {
    const first = generateInjuryEvent({ minorCount: 0, severeCount: 0, seed: 'minor-seed', force: 'minor' });
    const second = generateInjuryEvent({ minorCount: 0, severeCount: 0, seed: 'minor-seed', force: 'minor' });

    expect(second).toEqual(first);
    expect(first?.gamesRemaining).toBeGreaterThanOrEqual(1);
    expect(first?.gamesRemaining).toBeLessThanOrEqual(2);
  });

  it('updates fatigue after completed games and recovery days', () => {
    expect(updateTeamFatigue({ current: 0, minutesPlayed: 240, recoveryDays: 0 })).toBeGreaterThan(0);
    expect(updateTeamFatigue({ current: 8, minutesPlayed: 180, recoveryDays: 2 })).toBeLessThan(8);
  });

  it('lets commissioners add, update, and remove team injuries', () => {
    const added = applyInjuryAction({
      injuries: [],
      action: {
        type: 'add',
        injury: {
          id: 'manual-1',
          playerId: 'cp3',
          playerName: 'Chris Paul',
          severity: 'minor',
          gamesRemaining: 2,
          label: 'Ankle soreness',
          recoveryTag: 'day-to-day',
        },
      },
    });

    expect(added).toHaveLength(1);
    const updated = applyInjuryAction({
      injuries: added,
      action: { type: 'update', injuryId: 'manual-1', patch: { gamesRemaining: 1, label: 'Ankle soreness improving' } },
    });
    expect(updated[0]).toMatchObject({ gamesRemaining: 1, label: 'Ankle soreness improving' });

    const removed = applyInjuryAction({
      injuries: updated,
      action: { type: 'remove', injuryId: 'manual-1' },
    });
    expect(removed).toEqual([]);
  });
});
