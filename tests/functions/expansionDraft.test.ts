import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  buildExpansionTeamDocs,
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
});
