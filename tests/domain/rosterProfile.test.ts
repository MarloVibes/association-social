import { describe, expect, it } from 'vitest';

import { selectRosterRatingProfile } from '@/domain/nba/rosterProfile';

describe('roster rating profile selection', () => {
  it('prefers canonical era baselines over stale saved vault profiles', () => {
    const staleVaultProfile = {
      full_name: 'LeBron James',
      team: 'MIA',
      category_skill_grades: {
        finishing: { grade: 'C+', rating: 72 },
      },
      skill_grades: {
        dunking: 'B+',
      },
    };

    const profile = selectRosterRatingProfile(
      { full_name: 'LeBron James', team: 'MIA' },
      { 'LeBron James': staleVaultProfile },
      { era: 'lebron' },
    );

    expect(profile).toBeTruthy();
    expect(profile?.player_id).toBe('lebron-james-2011');
    expect(profile).not.toBe(staleVaultProfile);
  });

  it('falls back to saved vault profiles when no canonical baseline exists', () => {
    const savedProfile = {
      full_name: 'Local Prospect',
      category_skill_grades: {
        potential: { grade: 'B+', rating: 86 },
      },
    };

    const profile = selectRosterRatingProfile(
      { full_name: 'Local Prospect' },
      { 'Local Prospect': savedProfile },
      { era: 'current' },
    );

    expect(profile).toBe(savedProfile);
  });
});
