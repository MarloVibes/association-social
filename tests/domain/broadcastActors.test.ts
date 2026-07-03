import { describe, expect, it } from 'vitest';
import { buildBroadcastActor, buildBroadcastActorsForLineup } from '@/domain/nba/broadcastActors';

describe('broadcast actors', () => {
  it('keeps player likeness while applying the current team uniform after a trade', () => {
    const player = {
      playerId: 'tatum',
      name: 'Jayson Tatum',
      jerseyNumber: 0,
      position: 'SF',
      visualIdentity: {
        skinTone: 'medium',
        hairStyle: 'short-fade',
        hairColor: 'black',
        bodyBuild: 'wing',
        facialHair: 'beard',
        accessories: ['arm-sleeve'],
      } as const,
    };

    const celticsActor = buildBroadcastActor({
      player,
      team: { teamId: 'BOS', abbreviation: 'BOS', primaryColor: '#007A33', secondaryColor: '#BA9653' },
      side: 'away',
      slot: 2,
    });
    const lakersActor = buildBroadcastActor({
      player,
      team: { teamId: 'LAL', abbreviation: 'LAL', primaryColor: '#552583', secondaryColor: '#FDB927' },
      side: 'home',
      slot: 2,
    });

    expect(lakersActor.identity).toEqual(celticsActor.identity);
    expect(celticsActor.uniform).toMatchObject({ teamId: 'BOS', primary: '#007A33', secondary: '#BA9653', number: '0' });
    expect(lakersActor.uniform).toMatchObject({ teamId: 'LAL', primary: '#552583', secondary: '#FDB927', number: '0' });
  });

  it('creates stable fallback identities for unaudited or generated players', () => {
    const actor = buildBroadcastActor({
      player: { playerId: 'rookie-42', name: 'Draft Prospect', position: 'C' },
      team: { teamId: 'MEM', abbreviation: 'MEM', primaryColor: '#5D76A9', secondaryColor: '#12173F' },
      side: 'home',
      slot: 4,
    });

    expect(actor.identity.skinTone).toMatch(/light|medium|dark|deep/);
    expect(actor.identity.bodyBuild).toBe('big');
    expect(actor.uniform.number).toBe('42');
    expect(actor.label).toBe('42');
  });

  it('builds exactly ten actors from two five-player lineups', () => {
    const actors = buildBroadcastActorsForLineup({
      homeTeam: { teamId: 'NYK', abbreviation: 'NYK', primaryColor: '#006BB6', secondaryColor: '#F58426' },
      awayTeam: { teamId: 'BOS', abbreviation: 'BOS', primaryColor: '#007A33', secondaryColor: '#BA9653' },
      homePlayers: Array.from({ length: 5 }, (_, index) => ({ playerId: `home-${index}`, name: `Home ${index}`, jerseyNumber: index + 1 })),
      awayPlayers: Array.from({ length: 5 }, (_, index) => ({ playerId: `away-${index}`, name: `Away ${index}`, jerseyNumber: index + 6 })),
    });

    expect(actors).toHaveLength(10);
    expect(actors.filter(actor => actor.side === 'home')).toHaveLength(5);
    expect(actors.filter(actor => actor.side === 'away')).toHaveLength(5);
  });
});
