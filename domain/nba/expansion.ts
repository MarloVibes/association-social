export type ExpansionTeamInput = {
  city: string;
  name: string;
  abbreviation: string;
  conference?: string;
  division?: string;
  primaryColor?: string;
  secondaryColor?: string;
};

export type ExpansionProposalInput = {
  currentTeams: number;
  addedTeams: number;
  existingAbbreviations?: string[];
  scheduleLocked?: boolean;
  teams?: ExpansionTeamInput[];
};

export type ExpansionValidation = {
  valid: boolean;
  errors: string[];
};

const MAX_NBA_TEAMS = 36;

function normalizeAbbr(value: string) {
  return String(value || '').trim().toUpperCase();
}

export function buildExpansionTeamId(team: ExpansionTeamInput): string {
  return `EXP_${normalizeAbbr(team.abbreviation)}`;
}

export function validateExpansionProposal(input: ExpansionProposalInput): ExpansionValidation {
  const errors: string[] = [];
  const currentTeams = Number(input.currentTeams || 0);
  const addedTeams = Number(input.addedTeams || 0);
  if (!Number.isInteger(currentTeams) || currentTeams < 30) errors.push('current_team_count_invalid');
  if (!Number.isInteger(addedTeams) || addedTeams < 1) errors.push('added_team_count_invalid');
  if (currentTeams + addedTeams > MAX_NBA_TEAMS) errors.push('team_cap_exceeded');
  if (input.scheduleLocked) errors.push('schedule_locked');

  const existing = new Set((input.existingAbbreviations || []).map(normalizeAbbr));
  const seen = new Set<string>();
  (input.teams || []).forEach((team) => {
    const abbr = normalizeAbbr(team.abbreviation);
    if (!team.city?.trim()) errors.push('city_missing');
    if (!team.name?.trim()) errors.push('name_missing');
    if (!/^[A-Z]{3}$/.test(abbr)) errors.push('abbreviation_invalid');
    if (existing.has(abbr) || seen.has(abbr)) errors.push('abbreviation_taken');
    seen.add(abbr);
  });

  if (input.teams && input.teams.length !== addedTeams) errors.push('team_list_count_mismatch');
  return { valid: errors.length === 0, errors };
}
