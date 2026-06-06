import { router } from 'expo-router';

export type TeamSelectArgs = {
  leagueId: string;
  sport?: string;
  era?: string;
  mode?: string;
};

/**
 * Single source of truth for navigating to the team-select screen.
 *
 * Every entry point (create league, join league, league home) MUST route
 * through here. team-select derives its behavior entirely from these params —
 * `mode === 'random'` shows the carousel, `mode === 'draft'` the draft board,
 * otherwise the manual grid; `era` selects the roster pool. When call sites
 * hand-assembled these params separately, one drifted (passed `eraKey` instead
 * of `era` and omitted `mode`), which sent random-mode joiners to the manual
 * picker and loaded the wrong era. Funneling through one typed helper makes
 * that class of mismatch impossible.
 */
export function goToTeamSelect({ leagueId, sport, era, mode }: TeamSelectArgs) {
  router.push({
    pathname: '/screens/team-select',
    params: {
      leagueId,
      sport: sport || '',
      era: era || '',
      mode: mode || '',
    },
  });
}
