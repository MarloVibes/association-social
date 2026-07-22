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
});
