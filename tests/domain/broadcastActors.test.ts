import { describe, expect, it } from 'vitest';

import { buildBroadcastActorsForLineup } from '@/domain/nba/broadcastActors';

describe('broadcast actors', () => {
  it('uses the current matchup team uniform even when a player came from another team', () => {
    const [actor] = buildBroadcastActorsForLineup({
      awayTeam: { teamId: 'GSW', abbreviation: 'GSW' },
      homeTeam: { teamId: 'LAL', abbreviation: 'LAL' },
      awayPlayers: [{
        player_id: 'traded-player',
        full_name: 'Traded Player',
        team: 'LAL',
        jersey_number: 30,
        position: 'PG',
      }],
      homePlayers: [],
    });

    expect(actor.uniform.abbr).toBe('GSW');
    expect(actor.uniform.primary).toBe('#FFC72C');
    expect(actor.uniform.secondary).toBe('#1D428A');
    expect(actor.uniform.numberColor).toBe('#111111');
    expect(actor.uniform.number).toBe('30');
    expect(actor.label).toBe('30');
  });

  it('uses unique lineup-slot numbers when jersey numbers are unavailable', () => {
    const actors = buildBroadcastActorsForLineup({
      awayTeam: { teamId: 'DEN', abbreviation: 'DEN' },
      homeTeam: { teamId: 'UTA', abbreviation: 'UTA' },
      awayPlayers: Array.from({ length: 5 }, (_, index) => ({
        player_id: `den-player-${index}`,
        full_name: `Denver Player ${index + 1}`,
        position: ['PG', 'SG', 'SF', 'PF', 'C'][index],
      })),
      homePlayers: [],
    });

    expect(actors.slice(0, 5).map(actor => actor.label)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('cleans accidental leading-zero jersey numbers', () => {
    const [actor] = buildBroadcastActorsForLineup({
      awayTeam: { teamId: 'DEN', abbreviation: 'DEN' },
      homeTeam: { teamId: 'UTA', abbreviation: 'UTA' },
      awayPlayers: [{
        player_id: 'den-player-1',
        full_name: 'Denver Player',
        jersey_number: '01',
        position: 'PG',
      }],
      homePlayers: [],
    });

    expect(actor.label).toBe('1');
  });
});
