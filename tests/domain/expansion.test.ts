import { describe, expect, it } from 'vitest';
import {
  buildExpansionDraftPool,
  buildExpansionTeamId,
  selectExpansionDraftPlayers,
  validateExpansionProposal,
} from '@/domain/nba/expansion';

describe('NBA expansion', () => {
  it('allows optional expansion but caps the league at 36 teams', () => {
    expect(validateExpansionProposal({ currentTeams: 30, addedTeams: 2 }).valid).toBe(true);
    expect(validateExpansionProposal({ currentTeams: 36, addedTeams: 1 }).valid).toBe(false);
    expect(validateExpansionProposal({ currentTeams: 34, addedTeams: 3 }).errors).toContain('team_cap_exceeded');
  });

  it('requires unique three-letter abbreviations for new teams', () => {
    expect(validateExpansionProposal({
      currentTeams: 30,
      addedTeams: 1,
      existingAbbreviations: ['SEA'],
      teams: [{ city: 'Seattle', name: 'Sonics', abbreviation: 'SEA' }],
    }).errors).toContain('abbreviation_taken');

    expect(buildExpansionTeamId({ city: 'Las Vegas', name: 'Aces', abbreviation: 'LVA' })).toBe('EXP_LVA');
  });

  it('builds an expansion draft pool from unprotected players only', () => {
    const pool = buildExpansionDraftPool({
      teams: [
        {
          id: 'NOH',
          protectedPlayerIds: ['cp3'],
          players: [
            { id: 'cp3', name: 'Chris Paul', value: 98 },
            { id: 'west', name: 'David West', value: 86 },
          ],
        },
        {
          id: 'SAS',
          protectedPlayerIds: ['duncan'],
          players: [
            { id: 'duncan', name: 'Tim Duncan', value: 96 },
            { id: 'parker', name: 'Tony Parker', value: 88 },
          ],
        },
      ],
    });

    expect(pool.map(player => player.playerId)).toEqual(['parker', 'west']);
    expect(pool[0]).toMatchObject({ sourceTeamId: 'SAS', name: 'Tony Parker' });
  });

  it('selects expansion players without taking more than one from the same team per expansion team', () => {
    const result = selectExpansionDraftPlayers({
      expansionTeamIds: ['EXP_SEA', 'EXP_LVA'],
      pool: [
        { playerId: 'a1', sourceTeamId: 'A', name: 'A1', value: 90, player: { id: 'a1' } },
        { playerId: 'a2', sourceTeamId: 'A', name: 'A2', value: 88, player: { id: 'a2' } },
        { playerId: 'b1', sourceTeamId: 'B', name: 'B1', value: 80, player: { id: 'b1' } },
        { playerId: 'c1', sourceTeamId: 'C', name: 'C1', value: 70, player: { id: 'c1' } },
      ],
      picksPerExpansionTeam: 2,
    });

    expect(result.EXP_SEA.map(player => player.playerId)).toEqual(['a1', 'b1']);
    expect(result.EXP_LVA.map(player => player.playerId)).toEqual(['a2', 'c1']);
  });
});
