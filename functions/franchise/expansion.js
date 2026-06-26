'use strict';

class ExpansionError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'ExpansionError';
    this.code = code;
    this.details = details;
  }
}

function normalizeAbbr(value) {
  return String(value || '').trim().toUpperCase();
}

function buildExpansionTeamId(team) {
  return `EXP_${normalizeAbbr(team && team.abbreviation)}`;
}

function teamName(team) {
  return [team && team.city, team && team.name].filter(Boolean).join(' ').trim();
}

function buildExpansionTeamDocs({ proposal, existingTeams = [], seasonYear }) {
  const proposedTeams = Array.isArray(proposal && proposal.teams) ? proposal.teams : [];
  const existing = new Set(
    existingTeams.flatMap(team => [
      normalizeAbbr(team && team.id),
      normalizeAbbr(team && team.teamId),
      normalizeAbbr(team && team.abbreviation),
    ]).filter(Boolean),
  );
  const seen = new Set();

  return proposedTeams.map((team) => {
    const abbreviation = normalizeAbbr(team && team.abbreviation);
    const id = buildExpansionTeamId(team);
    if (!abbreviation || existing.has(abbreviation) || existing.has(id) || seen.has(abbreviation) || seen.has(id)) {
      throw new ExpansionError('failed-precondition', 'Expansion team abbreviation is already in use.', {
        abbreviation,
      });
    }
    seen.add(abbreviation);
    seen.add(id);
    const name = teamName(team);
    return {
      id,
      data: {
        teamId: id,
        abbreviation,
        city: String(team && team.city || '').trim(),
        name,
        full_name: name,
        conference: team && team.conference || null,
        division: team && team.division || null,
        primaryColor: team && team.primaryColor || null,
        secondaryColor: team && team.secondaryColor || null,
        expansionSeason: seasonYear,
        isExpansionTeam: true,
        gmId: null,
        players: [],
        tradeBlock: [],
      },
    };
  });
}

module.exports = {
  ExpansionError,
  buildExpansionTeamDocs,
  buildExpansionTeamId,
};
