import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  applyExpansionDraftSelections,
  buildExpansionTeamDocs,
  buildExpansionDraftPool,
  selectExpansionDraftPlayers,
} = require('../../functions/franchise/expansion.js');

describe('expansion team materialization', () => {
  it('turns a valid proposal into empty expansion team docs', () => {
    const docs = buildExpansionTeamDocs({
      seasonYear: 2028,
      existingTeams: [{ id: 'team_lal', abbreviation: 'LAL' }],
      proposal: {
        teams: [
          {
            city: 'Seattle',
            name: 'Sonics',
            abbreviation: 'SEA',
            conference: 'West',
            division: 'Northwest',
            primaryColor: '#00653A',
            secondaryColor: '#FFC200',
          },
        ],
      },
    });

    expect(docs).toEqual([{
      id: 'EXP_SEA',
      data: {
        abbreviation: 'SEA',
        city: 'Seattle',
        conference: 'West',
        division: 'Northwest',
        expansionSeason: 2028,
        full_name: 'Seattle Sonics',
        gmId: null,
        isExpansionTeam: true,
        name: 'Seattle Sonics',
        players: [],
        primaryColor: '#00653A',
        secondaryColor: '#FFC200',
        teamId: 'EXP_SEA',
        tradeBlock: [],
      },
    }]);
  });

  it('rejects duplicate expansion abbreviations before writes happen', () => {
    expect(() => buildExpansionTeamDocs({
      seasonYear: 2028,
      existingTeams: [{ id: 'EXP_SEA', abbreviation: 'SEA' }],
      proposal: {
        teams: [{ city: 'Seattle', name: 'Sonics', abbreviation: 'SEA' }],
      },
    })).toThrow(expect.objectContaining({ code: 'failed-precondition' }));
  });

  it('drafts unprotected players onto expansion teams and removes them from source teams', () => {
    const teams = [
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
    ];
    const expansionTeamDocs = buildExpansionTeamDocs({
      seasonYear: 2028,
      existingTeams: teams,
      proposal: {
        teams: [
          { city: 'Seattle', name: 'Sonics', abbreviation: 'SEA' },
        ],
      },
    });
    const pool = buildExpansionDraftPool({ teams });
    const selections = selectExpansionDraftPlayers({
      expansionTeamIds: expansionTeamDocs.map((team: any) => team.id),
      pool,
      picksPerExpansionTeam: 2,
    });

    const result = applyExpansionDraftSelections({
      teams,
      expansionTeamDocs,
      selections,
    });

    expect(result.teamUpdates.find((team: any) => team.id === 'NOH').players.map((player: any) => player.id)).toEqual(['cp3']);
    expect(result.teamUpdates.find((team: any) => team.id === 'SAS').players.map((player: any) => player.id)).toEqual(['duncan']);
    expect(result.expansionUpdates[0].data.players.map((player: any) => player.id)).toEqual(['parker', 'west']);
    expect(result.expansionUpdates[0].data.players[0]).toMatchObject({ previousTeamId: 'SAS' });
  });
});
