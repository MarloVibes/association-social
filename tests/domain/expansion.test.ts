import { describe, expect, it } from 'vitest';
import { buildExpansionTeamId, validateExpansionProposal } from '@/domain/nba/expansion';

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
});
