import { describe, expect, it } from 'vitest';

import {
  buildFreeAgentVaultDoc,
  buildProfileLookup,
  normName,
  parsePriorYearPlayers,
} from '../../scripts/lib/vault-free-agent-seed.mjs';

describe('vault free agent seeding helpers', () => {
  it('parses prior-year players from Basketball Reference table rows', () => {
    const html = `
      <table><tbody>
        <tr data-append-csv="jamesle01"><td data-stat="name_display"><a>LeBron James</a></td><td data-stat="games">76</td></tr>
        <tr data-append-csv="short01"><td data-stat="name_display"><a>Short Stay</a></td><td data-stat="games">5</td></tr>
      </tbody></table>
    `;

    expect(parsePriorYearPlayers(html)).toEqual([
      { bref_id: 'jamesle01', full_name: 'LeBron James', games: 76 },
    ]);
  });

  it('builds new vault free agent docs with local profile metadata when available', () => {
    const profiles = buildProfileLookup([
      {
        _id: 'lewisra02',
        name: 'Rashard Lewis',
        position: 'Small Forward and Power Forward',
        height: '6-10',
        weight: '215lb',
        birthDate: 'August 8, 1979',
      },
    ]);

    expect(buildFreeAgentVaultDoc(
      { bref_id: 'lewisra02', full_name: 'Rashard Lewis', games: 57 },
      'lebron',
      profiles,
      new Date('2026-06-30T00:00:00.000Z'),
    )).toEqual(expect.objectContaining({
      bref_id: 'lewisra02',
      full_name: 'Rashard Lewis',
      first_name: 'Rashard',
      last_name: 'Lewis',
      position: 'Small Forward and Power Forward',
      height: '6-10',
      weight: '215lb',
      birth_date: 'August 8, 1979',
      eras: ['lebron'],
      free_in_eras: ['lebron'],
      no_profile: false,
      added_as_free_agent: true,
      created_at: '2026-06-30T00:00:00.000Z',
    }));
  });

  it('keeps a transparent no-profile marker when local metadata is missing', () => {
    const doc = buildFreeAgentVaultDoc(
      { bref_id: 'unknown01', full_name: 'Unknown Player', games: 44 },
      'kobe',
      buildProfileLookup([]),
      new Date('2026-06-30T00:00:00.000Z'),
    );

    expect(doc).toMatchObject({
      position: '',
      height: '',
      weight: '',
      birth_date: '',
      no_profile: true,
    });
  });

  it('normalizes names for rostered/free-agent comparisons', () => {
    expect(normName('P.J. Tucker Jr.')).toBe('pjtuckerjr');
  });
});
