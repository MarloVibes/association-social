export type DashboardLeagueSummary = {
  sport?: string | null;
  members?: unknown[] | null;
};

export type DashboardHomeInput = {
  leagues: DashboardLeagueSummary[];
  onlineFriendCount: number;
  pendingInviteCount: number;
};

export type DashboardAction = {
  label: string;
  route: '/screens/join-league' | '/screens/search-users' | '/screens/faq-help';
  tone: 'primary' | 'secondary';
};

export type DashboardModeCard = {
  sport: 'nba' | 'madden' | 'mlb';
  title: string;
  description: string;
  accent: string;
};

export function buildDashboardHomeModel(input: DashboardHomeInput) {
  return {
    heroTitle: 'Franchise HQ',
    heroSubtitle: 'Build, manage, and compete across your leagues.',
    stats: [
      { label: 'Leagues', value: String(input.leagues.length) },
      { label: 'Online GMs', value: String(input.onlineFriendCount) },
      { label: 'Alerts', value: String(input.pendingInviteCount) },
    ],
    quickActions: [
      { label: 'Join League', route: '/screens/join-league', tone: 'secondary' },
      { label: 'Find GMs', route: '/screens/search-users', tone: 'secondary' },
      { label: 'Help / FAQ', route: '/screens/faq-help', tone: 'secondary' },
    ] satisfies DashboardAction[],
    modeCards: [
      {
        sport: 'nba',
        title: 'NBA Franchise',
        description: 'Eras, live mode, playoffs, draft, awards, and offseason control.',
        accent: '#00ff87',
      },
      {
        sport: 'madden',
        title: 'NFL Franchise',
        description: 'Roster building, season planning, and football franchise tools.',
        accent: '#38bdf8',
      },
      {
        sport: 'mlb',
        title: 'MLB Franchise',
        description: 'Long-season team building, prospects, and baseball front office flow.',
        accent: '#f59e0b',
      },
    ] satisfies DashboardModeCard[],
  };
}
