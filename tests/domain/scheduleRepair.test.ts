import { describe, expect, it } from 'vitest';
import type { NbaScheduleGame } from '@/domain/nba/schedule';
import { repairScheduleOwnership } from '@/domain/nba/scheduleRepair';

describe('NBA schedule ownership repair', () => {
  it('adds claimed historical team ownership to modern schedule slots', () => {
    const games: NbaScheduleGame[] = [{
      id: 'g1',
      week: 1,
      sequence: 1,
      homeTeamId: 'NOP',
      awayTeamId: 'LAL',
      status: 'scheduled',
    }];
    const repair = repairScheduleOwnership({
      teams: [{
        id: 'league_gm',
        teamId: 'NOH',
        abbreviation: 'NOH',
        name: 'New Orleans Hornets',
        gmId: 'gm-1',
      }],
      participants: [{
        scheduleTeamId: 'NOP',
        gmId: null,
        abbreviation: 'NOP',
        name: '',
      }],
      games,
    });

    expect(repair.changed).toBe(true);
    expect(repair.games[0].homeGmId).toBe('gm-1');
    expect(repair.participants[0]).toMatchObject({
      scheduleTeamId: 'NOP',
      sourceTeamDocId: 'league_gm',
      gmId: 'gm-1',
      abbreviation: 'NOH',
      name: 'New Orleans Hornets',
    });
  });

  it('leaves unclaimed CPU teams available without adding fake owners', () => {
    const games: NbaScheduleGame[] = [{
      id: 'g1',
      week: 1,
      sequence: 1,
      homeTeamId: 'LAL',
      awayTeamId: 'NYK',
      status: 'scheduled',
    }];
    const repair = repairScheduleOwnership({
      teams: [{ id: 'league_gm', teamId: 'BOS', gmId: 'gm-1' }],
      participants: [{ scheduleTeamId: 'LAL', gmId: null }],
      games,
    });

    expect(repair.changed).toBe(false);
    expect(repair.games[0].homeGmId).toBeUndefined();
    expect(repair.games[0].awayGmId).toBeUndefined();
  });
});
