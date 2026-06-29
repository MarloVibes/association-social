const suppressedDeletedLeagueAlerts = new Set<string>();

export function suppressDeletedLeagueAlert(leagueId?: string | null) {
  if (leagueId) suppressedDeletedLeagueAlerts.add(String(leagueId));
}

export function isDeletedLeagueAlertSuppressed(leagueId?: string | null) {
  return Boolean(leagueId && suppressedDeletedLeagueAlerts.has(String(leagueId)));
}
