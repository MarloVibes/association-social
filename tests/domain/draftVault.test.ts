import { describe, expect, it } from 'vitest';
import { buildDraftPlayerId, buildDraftVaultDoc } from '@/domain/nba/draftVault';

describe('draft vault source', () => {
  it('builds deterministic vault docs for real draft picks without bref ids', () => {
    const vaultDoc = buildDraftVaultDoc({
      year: 2026,
      era: 'current',
      source: 'https://www.nba.com/news/2026-nba-draft-order',
      sourceUpdatedAt: '2026-06-25T13:21:00-04:00',
      pick: {
        pick: 1,
        round: 1,
        draftedBy: 'WAS',
        rightsTeam: 'WAS',
        name: 'AJ Dybantsa',
        school: 'BYU',
      },
    });

    expect(buildDraftPlayerId('AJ Dybantsa', 1, 2026)).toBe('draft_2026_1_aj_dybantsa');
    expect(vaultDoc).toMatchObject({
      bref_id: 'draft_2026_1_aj_dybantsa',
      full_name: 'AJ Dybantsa',
      first_name: 'AJ',
      last_name: 'Dybantsa',
      draft_year: 2026,
      draft_pick: 1,
      draft_round: 1,
      drafted_by: 'WAS',
      rights_team: 'WAS',
      team: 'WAS',
      college: 'BYU',
      eras: ['current'],
      is_custom: false,
      no_profile: true,
      source: 'https://www.nba.com/news/2026-nba-draft-order',
      sourceUpdatedAt: '2026-06-25T13:21:00-04:00',
    });
    expect(vaultDoc.seasons).toEqual([]);
    expect(vaultDoc.accolades).toEqual([]);
  });
});
