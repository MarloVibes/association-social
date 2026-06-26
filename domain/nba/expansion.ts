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

export type ExpansionDraftPlayer = {
  playerId: string;
  sourceTeamId: string;
  name: string;
  value: number;
  player: Record<string, unknown>;
};

export type ExpansionDraftTeam = {
  id?: string;
  teamId?: string;
  abbreviation?: string;
  protectedPlayerIds?: string[];
  players?: Record<string, unknown>[];
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

function playerId(player: Record<string, unknown>) {
  return String(player.id || player.player_id || player.playerId || player.full_name || player.name || '').trim();
}

function playerName(player: Record<string, unknown>) {
  return String(player.full_name || player.name || playerId(player) || 'Player');
}

function playerValue(player: Record<string, unknown>) {
  for (const key of ['value', 'overall', 'rating']) {
    const numeric = Number(player[key]);
    if (Number.isFinite(numeric)) return numeric;
  }
  const hidden = player.hidden && typeof player.hidden === 'object' ? player.hidden as Record<string, unknown> : {};
  const hiddenValues = Object.values(hidden).map(Number).filter(Number.isFinite);
  if (hiddenValues.length > 0) {
    return hiddenValues.reduce((total, value) => total + value, 0) / hiddenValues.length;
  }
  return 0;
}

function teamId(team: ExpansionDraftTeam) {
  return String(team.id || team.teamId || team.abbreviation || '').trim();
}

export function buildExpansionDraftPool({ teams }: { teams: ExpansionDraftTeam[] }): ExpansionDraftPlayer[] {
  return (teams || [])
    .flatMap((team) => {
      const protectedIds = new Set((team.protectedPlayerIds || []).map(String));
      const sourceTeamId = teamId(team);
      return (team.players || [])
        .map(player => ({ player, id: playerId(player) }))
        .filter(({ id }) => id && !protectedIds.has(id))
        .map(({ player, id }) => ({
          playerId: id,
          sourceTeamId,
          name: playerName(player),
          value: playerValue(player),
          player,
        }));
    })
    .sort((left, right) => (
      right.value - left.value
      || left.sourceTeamId.localeCompare(right.sourceTeamId)
      || left.playerId.localeCompare(right.playerId)
    ));
}

export function selectExpansionDraftPlayers({
  expansionTeamIds,
  pool,
  picksPerExpansionTeam,
}: {
  expansionTeamIds: string[];
  pool: ExpansionDraftPlayer[];
  picksPerExpansionTeam: number;
}): Record<string, ExpansionDraftPlayer[]> {
  const result: Record<string, ExpansionDraftPlayer[]> = {};
  const remaining = [...(pool || [])];
  (expansionTeamIds || []).forEach((expansionTeamId) => {
    const usedSourceTeams = new Set<string>();
    result[expansionTeamId] = [];
    for (let index = 0; index < remaining.length && result[expansionTeamId].length < picksPerExpansionTeam;) {
      const candidate = remaining[index];
      if (usedSourceTeams.has(candidate.sourceTeamId)) {
        index += 1;
        continue;
      }
      result[expansionTeamId].push(candidate);
      usedSourceTeams.add(candidate.sourceTeamId);
      remaining.splice(index, 1);
    }
  });
  return result;
}
