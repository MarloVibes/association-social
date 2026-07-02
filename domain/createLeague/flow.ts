const SPORT_LABELS: Record<string, string> = {
  nba: 'NBA',
  madden: 'NFL',
  mlb: 'MLB',
};

export function shouldShowSportPicker(selectedSport?: string | null): boolean {
  return !String(selectedSport || '').trim();
}

export function getCreateLeagueIntro(selectedSport?: string | null): { title: string; subtitle: string } {
  const sportLabel = SPORT_LABELS[String(selectedSport || '')];
  if (!sportLabel) {
    return {
      title: 'Name Your League',
      subtitle: 'What do you want to call your association?',
    };
  }

  return {
    title: `Name Your ${sportLabel} Franchise`,
    subtitle: 'Set the league name, then choose the season setup.',
  };
}
