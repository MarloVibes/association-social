// Draft pick inventory + helpers, shared across all sports.
//
// Pick shape: { id, originalTeam, team, year, round }
//   - originalTeam / team: the abbreviation of the team the pick originally belongs to
//   - ownership lives in each team doc's `picks` array (trades move picks by id)
//
// Round counts are sport-specific: NBA has a 2-round draft, NFL 7, and MLB we
// keep major-league-focused at 5 (the early, trade-relevant rounds only).

export const DRAFT_ROUNDS: Record<string, number> = { nba: 2, madden: 7, mlb: 5 };
export const DRAFT_YEARS = 7;

export function getDraftRounds(sport?: string): number {
  return DRAFT_ROUNDS[sport || 'nba'] || 2;
}

export function getPickKey(pk: any): string {
  return pk?.id || `${pk?.originalTeam || pk?.team || ''}_${pk?.year || ''}_${pk?.round || ''}`;
}

export function pickLabel(pk: any): string {
  const r = pk?.round;
  const ord = r === 1 ? '1st' : r === 2 ? '2nd' : r === 3 ? '3rd' : `${r}th`;
  return `${pk?.year} ${ord} Rd${pk?.protection ? ' · ' + pk.protection : ''}`;
}

// Generate a team's own picks: rounds 1..N for `years` drafts starting at baseYear.
// This is the "standard" ownership baseline — every team owns its own picks,
// nobody starts ahead or behind. Used unless the league uses realistic ownership.
export function generateTeamPicks(sport: string, teamAbbr: string, baseYear: number, years = DRAFT_YEARS): any[] {
  const rounds = getDraftRounds(sport);
  const picks: any[] = [];
  for (let y = 0; y < years; y++) {
    const year = baseYear + y;
    for (let r = 1; r <= rounds; r++) {
      picks.push({ id: `${teamAbbr}_${year}_R${r}`, originalTeam: teamAbbr, team: teamAbbr, year, round: r });
    }
  }
  return picks;
}

// Era-relative base draft year: the first draft after the league's season.
export function draftBaseYearFor(seasonYear: number): number {
  return (seasonYear || new Date().getFullYear()) + 1;
}

// Stepien Rule (optional house rule): a team may not be left without a
// first-round pick in two consecutive future drafts. Given the set of years for
// which a team WOULD still own at least one 1st-rounder after a proposed trade,
// returns true if that leaves a violation (two consecutive missing years) within
// the horizon [baseYear, baseYear + years - 1].
export function stepienViolation(ownedFirstYears: number[], baseYear: number, years = DRAFT_YEARS): boolean {
  const owned = new Set(ownedFirstYears);
  for (let y = baseYear; y < baseYear + years - 1; y++) {
    if (!owned.has(y) && !owned.has(y + 1)) return true;
  }
  return false;
}
