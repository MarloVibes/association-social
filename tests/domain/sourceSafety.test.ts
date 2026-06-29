import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const source = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('source safety regressions', () => {
  it('uses numeric currentYear for NBA team branding', () => {
    const roster = source('app/screens/team-roster.tsx');
    const select = source('app/screens/team-select.tsx');

    expect(roster).toContain('getTeamColors(abbr, currentYear)');
    expect(roster).toContain('<SportTeamLogo');
    expect(roster).toContain('era={currentYear}');
    expect(select).toContain('currentYear={currentYear}');
  });

  it('uses sport-aware team logos in the team picker', () => {
    const select = source('app/screens/team-select.tsx');

    expect(select).toContain('<SportTeamLogo');
    expect(select).toContain('sport={sportResolved}');
    expect(select).not.toContain('source={getTeamLogoLocal(team.abbreviation, currentYear)');
  });

  it('uses sport-aware player photos in the trade center', () => {
    const tradeChannel = source('app/screens/trade-channel.tsx');

    expect(tradeChannel).toContain("import PlayerHeadshot from '@/components/PlayerHeadshot'");
    expect(tradeChannel).toContain('<PlayerHeadshot player={player} sport={sport}');
    expect(tradeChannel).not.toContain('basketball-reference.com/req/202106291/images/headshots/');
  });

  it('keeps the Stepien Rule NBA-only in trade rooms', () => {
    const tradeRoom = source('app/screens/trade-room.tsx');

    expect(tradeRoom).toContain("setStepienRule((data.sport || 'nba') === 'nba' && !!data.stepienRule)");
    expect(tradeRoom).toContain("if (leagueSport === 'nba' && stepienRule && pick.round === 1)");
  });

  it('does not dereference a nullable auth user while saving a profile', () => {
    const profile = source('app/screens/profile.tsx');

    expect(profile).toContain("if (!user?.uid || profileUid !== user.uid) return;");
    expect(profile).toContain("doc(db, 'users', profileUid)");
  });

  it('uses supported Firestore snapshot listener signatures', () => {
    for (const path of [
      'app/screens/locker-console-chat.tsx',
      'app/screens/locker-group-chat.tsx',
    ]) {
      expect(source(path)).not.toContain(
        "setLoading(false);\n    }, err => { if (err.code !== 'permission-denied') console.error(err); });",
      );
    }
  });

  it('centralizes Firebase initialization in constants/firebase', () => {
    const screens = [
      'app/screens/league-rosters.tsx',
      'app/screens/locker-console-chat.tsx',
      'app/screens/locker-group-chat.tsx',
      'app/screens/locker-group-create.tsx',
      'app/screens/locker-group-info.tsx',
      'app/screens/mvp-locker-room.tsx',
      'app/screens/mvp-player-edit.tsx',
      'app/screens/mvp-player-view.tsx',
      'app/screens/mvp-players.tsx',
      'app/screens/pending-players.tsx',
      'app/screens/salary-overrides.tsx',
      'app/screens/team-roster.tsx',
    ];

    for (const path of screens) {
      const file = source(path);
      expect(file).not.toContain('firebaseConfig');
      expect(file).not.toContain("from 'firebase/app'");
      expect(file).toContain("from '@/constants/firebase'");
    }
  });

  it('does not call native push notification response APIs on web', () => {
    const hook = source('hooks/usePushNotifications.ts');

    expect(hook).toContain("if (Platform.OS === 'web') return;");
    expect(hook.indexOf("if (Platform.OS === 'web') return;")).toBeLessThan(
      hook.indexOf('(Notifications as any).getLastNotificationResponseAsync'),
    );
    expect(hook).toContain('const getLastNotificationResponseAsync = (Notifications as any).getLastNotificationResponseAsync;');
    expect(hook).toContain("if (typeof getLastNotificationResponseAsync === 'function')");
    expect(hook.indexOf('(Notifications as any).getLastNotificationResponseAsync')).toBeLessThan(
      hook.indexOf('Notifications.addNotificationReceivedListener'),
    );
    expect(hook).toContain('let pushNotificationsMounted = true;');
    expect(hook).toContain('if (!pushNotificationsMounted || !response) return;');
    expect(hook).toContain('pushNotificationsMounted = false;');
  });

  it('routes franchise push taps to their destination screens', () => {
    const hook = source('hooks/usePushNotifications.ts');

    expect(hook).toContain("pathname: '/screens/season/matchup'");
    expect(hook).toContain("pathname: '/screens/season/calendar'");
    expect(hook).toContain("pathname: '/screens/season/injuries'");
    expect(hook).toContain("pathname: '/screens/offseason'");
    expect(hook).toContain("pathname: '/screens/offseason/live-draft'");
    expect(hook).toContain("pathname: '/screens/offseason/roster-cuts'");
    expect(hook).toContain("pathname: '/screens/season/awards'");
    expect(hook).toContain("pathname: '/screens/season/player-upgrades'");
    expect(hook).not.toContain("['matchup_request', 'matchup_accepted', 'game_ready', 'injury_update']");
    expect(hook).not.toContain("['season_awards', 'awards_finalized', 'upgrade_points']");
  });

  it('routes franchise inbox notification taps to their destination screens', () => {
    const notifications = source('app/screens/notifications.tsx');

    expect(notifications).toContain('routeNotification');
    expect(notifications).toContain("pathname: '/screens/season/matchup'");
    expect(notifications).toContain("pathname: '/screens/season/calendar'");
    expect(notifications).toContain("pathname: '/screens/season/injuries'");
    expect(notifications).toContain("pathname: '/screens/offseason/live-draft'");
    expect(notifications).toContain("pathname: '/screens/offseason/roster-cuts'");
    expect(notifications).toContain("pathname: '/screens/season/awards'");
    expect(notifications).toContain("pathname: '/screens/season/player-upgrades'");
    expect(notifications).not.toContain("['matchup_request', 'matchup_accepted', 'game_ready', 'injury_update']");
    expect(notifications).toContain("if (type === 'injury_update') return 'View Injuries");
    expect(notifications).not.toContain("['season_awards', 'awards_finalized', 'upgrade_points']");
  });

  it('sends franchise push payload fields and titles from functions', () => {
    const functionsIndex = source('functions/index.js');

    expect(functionsIndex).toContain("require('firebase-functions/v2/scheduler')");
    expect(functionsIndex).toContain("case 'game_ready'");
    expect(functionsIndex).toContain("case 'draft_started'");
    expect(functionsIndex).toContain("case 'season_awards'");
    expect(functionsIndex).toContain('exports.advanceDueOffseasons');
    expect(functionsIndex).toContain('gameId: n.gameId || n.scheduleGameId || n.matchupId ||');
    expect(functionsIndex).toContain("competition: n.competition || n.scheduleCompetition || 'regular'");
  });

  it('keeps the NBA season calendar visible inside the command center without requiring a claimed team', () => {
    const league = source('app/screens/league.tsx');
    const channels = source('app/screens/channels.tsx');

    expect(league).toContain('goToChannels');
    expect(channels).toContain('Command Center');
    expect(channels).toContain('/screens/season/calendar');
    expect(channels).toContain('Calendar');
    expect(channels).toContain('/screens/season/finances');
    expect(channels).toContain('Payroll, cap room, and player contracts');
    expect(league).not.toContain('isNBASport && myTeam && (');
    expect(league).not.toContain('Season Hub');
  });

  it('puts NBA schedule setup in the league creation flow', () => {
    const createLeague = source('app/screens/create-league.tsx');
    const teamSelect = source('app/screens/team-select.tsx');

    expect(createLeague).toContain('scheduleGamesPerTeam');
    expect(createLeague).toContain('NBA Schedule');
    expect(createLeague).toContain("gamesPerTeam: sport === 'nba'");
    expect(teamSelect).toContain('scheduleCreationFailed');
    expect(teamSelect).toContain('The team was claimed, but the schedule did not lock');
  });

  it('routes fantasy draft leagues into a startup draft room before the season begins', () => {
    const createLeague = source('app/screens/create-league.tsx');
    const teamSelect = source('app/screens/team-select.tsx');
    const league = source('app/screens/league.tsx');
    const liveDraft = source('app/screens/offseason/live-draft.tsx');

    expect(createLeague).toContain("draftStatus: finalMode === 'draft' ? 'setup' : 'none'");
    expect(createLeague).toContain('draftSeasonYear: leagueSeasonYear');
    expect(teamSelect).toContain("currentLeague.mode !== 'draft'");
    expect(teamSelect).toContain("pathname: '/screens/offseason/live-draft'");
    expect(league).toContain('Fantasy Draft Room');
    expect(liveDraft).toContain("league?.draftSeasonYear || league?.currentYear");
    expect(liveDraft).toContain("league?.mode === 'draft' ? 'Fantasy Draft' :");
  });

  it('shows the NBA draft lottery as a weighted reveal instead of a plain list', () => {
    const offseason = source('app/screens/offseason/index.tsx');

    expect(offseason).toContain('lotterySpin');
    expect(offseason).toContain('lotteryWheel');
    expect(offseason).toContain('Flattened anti-tank odds');
    expect(offseason).toContain('Top-four draw');
    expect(offseason).toContain('Full draft order');
  });

  it('uses sport finance defaults when creating non-NBA leagues', () => {
    const createLeague = source('app/screens/create-league.tsx');

    expect(createLeague).toContain('initialFinanceLimit');
    expect(createLeague).toContain('defaults.defaultFinanceLimit');
    expect(createLeague).toContain("...(sport === 'mlb' ? { teamBudget: initialFinanceLimit } : {})");
  });

  it('lets standings switch between regular season and NBA Cup tables', () => {
    const standings = source('app/screens/season/standings.tsx');

    expect(standings).toContain("type StandingsViewMode = 'regular' | 'cup'");
    expect(standings).toContain('schedule?.nbaCup?.games');
    expect(standings).toContain('buildNbaCupGroupStandings');
    expect(standings).toContain('NBA Cup');
  });

  it('wires commissioner NBA Cup advancement from calendar to functions', () => {
    const calendar = source('app/screens/season/calendar.tsx');
    const functionsIndex = source('functions/index.js');

    expect(calendar).toContain("httpsCallable(functions, 'advanceNbaCup')");
    expect(calendar).toContain('advanceNbaCupStage');
    expect(calendar).toContain('Advance NBA Cup');
    expect(functionsIndex).toContain('exports.advanceNbaCup');
  });

  it('loads scheduled team rosters before server-side NBA simulation', () => {
    const matchups = source('functions/franchise/matchups.js');

    expect(matchups).toContain('teamForScheduledGame');
    expect(matchups).toContain('sourceTeamDocId');
    expect(matchups).toContain('homeTeam');
    expect(matchups).toContain('awayTeam');
  });

  it('shows simulated game stories and box scores on the matchup screen', () => {
    const matchup = source('app/screens/season/matchup.tsx');

    expect(matchup).toContain('game.boxScore');
    expect(matchup).toContain('game.quarters');
    expect(matchup).toContain('game.story');
    expect(matchup).toContain('Top Performers');
  });

  it('routes completed games to a dedicated result screen', () => {
    const calendar = source('app/screens/season/calendar.tsx');
    const rootLayout = source('app/_layout.tsx');
    const seasonLayout = source('app/screens/season/_layout.tsx');
    const hook = source('hooks/usePushNotifications.ts');
    const notifications = source('app/screens/notifications.tsx');
    const result = source('app/screens/season/game-result.tsx');

    expect(rootLayout).toContain('screens/season');
    expect(rootLayout).not.toContain('screens/season/game-result');
    expect(seasonLayout).toContain('game-result');
    expect(calendar).toContain("item.status === 'final' ? '/screens/season/game-result'");
    expect(hook).toContain("pathname: '/screens/season/game-result'");
    expect(notifications).toContain("pathname: '/screens/season/game-result'");
    expect(result).toContain('Final Score');
    expect(result).toContain('Quarter Scores');
    expect(result).toContain('Top Performers');
    expect(result).toContain('Full Box Score');
  });

  it('uses shared roster value ordering and position filters across team and trade screens', () => {
    const roster = source('app/screens/roster.tsx');
    const teamRoster = source('app/screens/team-roster.tsx');
    const tradeRoom = source('app/screens/trade-room.tsx');
    const cpuTrade = source('app/screens/cpu-trade.tsx');
    const tradeChannel = source('app/screens/trade-channel.tsx');
    const league = source('app/screens/league.tsx');

    for (const file of [roster, teamRoster, tradeRoom, cpuTrade, tradeChannel, league]) {
      expect(file).toContain('compareRosterPlayersByValue');
    }
    for (const file of [roster, teamRoster, tradeRoom, cpuTrade, tradeChannel]) {
      expect(file).toContain('matchesRosterPosition');
      expect(file).toContain('getPositionFilters');
    }
    expect(tradeRoom).toContain('theirPickerPosFilter');
    expect(cpuTrade).toContain('givePosFilter');
    expect(cpuTrade).toContain('getPosFilter');
  });

  it('keeps NBA rotation lineup controlled by row order instead of starter closer toggles', () => {
    const rotation = source('app/screens/season/rotation.tsx');

    expect(rotation).toContain('normalizeOrder(nextTeam.rotation)');
    expect(rotation).toContain('rotation: normalizeOrder(rotation)');
    expect(rotation).toContain('enrichRotationPlayers');
    expect(rotation).toContain('mergeRotationProfile');
    expect(rotation).toContain('meaningfulNumber(player.value) ? player.value : profile?.value');
    expect(rotation).toContain("getDoc(doc(db, 'players', id))");
    expect(rotation).not.toContain('onToggle');
    expect(rotation).not.toContain('>Start</Text>');
    expect(rotation).not.toContain('>Close</Text>');
    expect(rotation).not.toContain("item.closing ? 'Closing' : null");
  });

  it('exposes NBA live mode without in-game adjustment controls', () => {
    const rootLayout = source('app/_layout.tsx');
    const seasonLayout = source('app/screens/season/_layout.tsx');
    const liveMode = source('app/screens/season/live-mode.tsx');

    expect(rootLayout).toContain('screens/season');
    expect(rootLayout).not.toContain('screens/season/live-mode');
    expect(seasonLayout).toContain('live-mode');
    expect(liveMode).toContain('liveTimeline');
    expect(liveMode).toContain('arenaTheme');
    expect(liveMode).toContain('currentTimelineEvent');
    expect(liveMode).toContain('livePlayerStatsAt');
    expect(liveMode).toContain('Matchups');
    expect(liveMode).not.toContain(['Starter', 'Matchups'].join(' '));
    expect(liveMode).not.toContain('matchupChip');
    expect(liveMode).toContain('See More Player Stats');
    expect(liveMode).not.toContain('httpsCallable(functions');
    expect(liveMode).not.toContain('Push Tempo');
    expect(liveMode).not.toContain('Trap Star');
  });

  it('routes simulated games and timeline replays into live mode', () => {
    const matchup = source('app/screens/season/matchup.tsx');
    const calendar = source('app/screens/season/calendar.tsx');
    const result = source('app/screens/season/game-result.tsx');
    const liveMode = source('app/screens/season/live-mode.tsx');

    expect(matchup).toContain('/screens/season/live-mode');
    expect(calendar).toContain('/screens/season/live-mode');
    expect(result).toContain('/screens/season/live-mode');
    expect(liveMode).toContain('replayStartedAtMs');
    expect(liveMode).toContain('safeElapsedMs(game, nowMs, replayStartedAtMs)');
    expect(liveMode).toContain('const replayStartMs = Number(replayStartedAtMs || 0);');
    expect(liveMode.indexOf('const replayStartMs = Number(replayStartedAtMs || 0);')).toBeLessThan(
      liveMode.indexOf('const startedAt = replayStartMs > 0'),
    );
    expect(matchup).toContain("const responseData = response.data as any;");
    expect(matchup).toContain("responseData?.status === 'final' && responseData?.liveTimeline");
    expect(matchup).toContain("name === 'requestMatchup'");
    expect(matchup).not.toContain('simulateGameLocally');
    expect(matchup).not.toContain('resetGameLocally');
    expect(matchup).not.toContain('submitWinnerLocally');
    expect(matchup).not.toContain('winnerIsHome ? 101 : 97');
    expect(matchup).not.toContain('homePlayers: [{ playerId:');
    expect(matchup).not.toContain('buildLiveTimeline');
    expect(calendar).toContain('const resultRevealed = isLiveResultRevealed(item, nowMs);');
    expect(calendar).toContain("const destination = item.liveTimeline && !resultRevealed ? '/screens/season/live-mode' : resultDestination;");
    expect(calendar).not.toContain('replayStartedAtMs: String(Date.now())');
    expect(result).toContain('!resultVisible');
    expect(result).toContain('The final score unlocks when the live simulation reaches the final buzzer.');
    expect(result).toContain('replayStartedAtMs: String(Date.now())');
  });

  it('lets commissioners reset finalized games from the result screen', () => {
    const result = source('app/screens/season/game-result.tsx');

    expect(result).toContain("httpsCallable(functions, 'resetScheduledGame')");
    expect(result).toContain('Reset Game');
    expect(result).toContain('Only commissioners can reset completed games');
  });

  it('keeps raw schedule ids out of playoff winner labels', () => {
    const playoffs = source('app/screens/season/playoffs.tsx');

    expect(playoffs).toContain('displayScheduleAbbr');
    expect(playoffs).toContain('teamLabel(item.winnerTeamId');
    expect(playoffs).not.toContain('Winner: {item.winnerTeamId}');
    expect(playoffs).not.toContain('{item.homeTeamId} wins');
    expect(playoffs).not.toContain('{item.awayTeamId} wins');
  });

  it('labels overtime periods on the result screen', () => {
    const result = source('app/screens/season/game-result.tsx');

    expect(result).toContain('periodLabel');
    expect(result).toContain("quarter.quarter === 5 ? 'OT'");
  });

  it('exposes NBA playoffs from the command center and router', () => {
    const channels = source('app/screens/channels.tsx');
    const rootLayout = source('app/_layout.tsx');
    const seasonLayout = source('app/screens/season/_layout.tsx');

    expect(channels).toContain('/screens/season/playoffs');
    expect(channels).toContain('Playoff Picture');
    expect(rootLayout).toContain('screens/season');
    expect(rootLayout).not.toContain('screens/season/playoffs');
    expect(seasonLayout).toContain('playoffs');
  });

  it('registers the full offseason route stack', () => {
    const rootLayout = source('app/_layout.tsx');
    const offseasonLayout = source('app/screens/offseason/_layout.tsx');

    expect(rootLayout).toContain('screens/offseason');
    expect(rootLayout).not.toContain('screens/offseason/index');
    expect(rootLayout).not.toContain('screens/offseason/live-draft');
    expect(rootLayout).not.toContain('screens/offseason/roster-cuts');
    expect(offseasonLayout).toContain('draft-class');
    expect(offseasonLayout).toContain('free-agency');
    expect(offseasonLayout).toContain('expansion');
  });

  it('includes deployable Firestore index configuration', () => {
    const firebase = source('firebase.json');
    const indexes = source('firestore.indexes.json');

    expect(firebase).toContain('firestore.indexes.json');
    expect(indexes).toContain('"indexes"');
    expect(indexes).toContain('"collectionGroup": "trade_rooms"');
    expect(indexes).toContain('"collectionGroup": "contract_offers"');
    expect(indexes).toContain('"collectionGroup": "draft_sessions"');
    expect(indexes).toContain('"collectionGroup": "mvp_players"');
    expect(indexes).toContain('"fieldPath": "ownerUid"');
    expect(indexes).toContain('"fieldOverrides"');
    expect(indexes).toContain('"fieldPath": "status"');
    expect(indexes).toContain('"queryScope": "COLLECTION_GROUP"');
  });

  it('documents the franchise engine QA matrix', () => {
    const qa = source('docs/FRANCHISE_ENGINE_QA.md');

    expect(qa).toContain('NBA schedule creation');
    expect(qa).toContain('Player upgrades');
    expect(qa).toContain('Expansion');
    expect(qa).toContain('Functions deploy');
  });

  it('lets commissioners advance playoff series from the playoff screen', () => {
    const playoffs = source('app/screens/season/playoffs.tsx');

    expect(playoffs).toContain('advancePlayoffSeries');
    expect(playoffs).toContain('markSeriesWinner');
    expect(playoffs).toContain('winnerTeamId');
  });

  it('exposes historical scouting from the command center and router', () => {
    const channels = source('app/screens/channels.tsx');
    const rootLayout = source('app/_layout.tsx');
    const seasonLayout = source('app/screens/season/_layout.tsx');
    const scouting = source('app/screens/season/scouting.tsx');

    expect(channels).toContain('/screens/season/scouting');
    expect(channels).toContain('Scouting');
    expect(rootLayout).toContain('screens/season');
    expect(rootLayout).not.toContain('screens/season/scouting');
    expect(seasonLayout).toContain('scouting');
    expect(scouting).toContain('Active game plans stay hidden');
  });

  it('does not show the commissioner a deleted-league alert after they delete their own league', () => {
    const league = source('app/screens/league.tsx');
    const settings = source('app/screens/league-settings.tsx');

    expect(settings).toContain('suppressDeletedLeagueAlert(leagueId)');
    expect(league).toContain('isDeletedLeagueAlertSuppressed(leagueId)');
  });

  it('lets commissioners tune the live draft timer from league settings', () => {
    const settings = source('app/screens/league-settings.tsx');

    expect(settings).toContain('draftTimerSeconds');
    expect(settings).toContain('Draft Timer (seconds)');
    expect(settings).toContain('draftTimer < 30 || draftTimer > 600');
    expect(settings).toContain("'offseason.draftTimerSeconds': draftTimer");
  });

  it('backfills sport defaults when league settings are saved', () => {
    const settings = source('app/screens/league-settings.tsx');

    expect(settings).toContain('rosterLimit: sportRules.standardRosterLimit');
    expect(settings).toContain('twoWayLimit: sportRules.twoWayLimit');
    expect(settings).toContain('draftRounds: sportRules.draftRounds');
    expect(settings).toContain('financeMode: sportRules.financeMode');
  });

  it('lets commissioners apply award and lottery upgrade points from the trophy case', () => {
    const awards = source('app/screens/season/awards.tsx');
    const functionsIndex = source('functions/index.js');

    expect(awards).toContain("httpsCallable(functions, 'applyUpgradeGrants')");
    expect(awards).toContain('seasonUpgradeGrants');
    expect(awards).toContain('Apply Upgrade Points');
    expect(awards).toContain('grantsAlreadyApplied');
    expect(awards).toContain('(result.data as any)?.updatedTeams');
    expect(awards).toContain('Already Applied');
    expect(functionsIndex).toContain('exports.applyUpgradeGrants');
  });

  it('uses trophy and ring-style visuals in the Trophy Case', () => {
    const awards = source('app/screens/season/awards.tsx');

    expect(awards).toContain('awardIconName');
    expect(awards).toContain("'diamond'");
    expect(awards).toContain("'trophy'");
    expect(awards).toContain('<Ionicons');
  });

  it('persists archived awards when starting the next season', () => {
    const newSeason = source('functions/franchise/newSeason.js');

    expect(newSeason).toContain('archiveSeasonAwards');
    expect(newSeason).toContain('awardHistory: nextLeague.awardHistory');
    expect(newSeason).toContain('seasonAwards: nextLeague.seasonAwards');
    expect(newSeason).toContain('awardsFinalizedSeason: nextLeague.awardsFinalizedSeason');
  });

  it('shows player upgrade buttons using the same seasonal limit rule as the server', () => {
    const upgrades = source('app/screens/season/player-upgrades.tsx');

    expect(upgrades).toContain('canUpgradePlayerThisSeason');
    expect(upgrades).toContain('upgradesUsedThisSeason: used');
    expect(upgrades).toContain('selectedTeamId');
    expect(upgrades).toContain('One point raises one grade');
    expect(upgrades).toContain('getUpgradeStatus');
  });

  it('shows archived franchise player seasons in player cards', () => {
    const playerCard = source('components/PlayerCard.tsx');

    expect(playerCard).toContain('statHistory');
    expect(playerCard).toContain('seasonStats');
    expect(playerCard).toContain('Franchise Mobile Stats');
    expect(playerCard).toContain('franchiseSeasons');
    expect(playerCard).toContain('player?.accolades');
  });

  it('shows expanded scouting cards with compare and original stat tabs', () => {
    const playerCard = source('components/PlayerCard.tsx');

    expect(playerCard).toContain("from '@/domain/nba/scoutingGrades'");
    expect(playerCard).toContain('Scouting Grades');
    expect(playerCard).toContain('Franchise Mobile Stats');
    expect(playerCard).toContain('Original NBA Stats');
    expect(playerCard).toContain('Compare');
    expect(playerCard).toContain('compareCandidates');
    expect(playerCard).toContain('getScoutingGradeSections');
    expect(playerCard).toContain('buildEvaluationLayers');
    expect(playerCard).toContain('Current Form');
    expect(playerCard).toContain('Potential');
    expect(playerCard).toContain('compareScoutingGrades');
    expect(playerCard).toContain('getCompareRowModel');
    expect(playerCard).toContain('compareHeaderName');
    expect(playerCard).toContain('compareHeaderMeta');
    expect(playerCard).toContain('compareGradeColumn');
    expect(playerCard).not.toContain('compareSmallName');
    expect(playerCard).toContain('baselineProfile || savedProfile');
    expect(playerCard).toContain('selectedBaselineCompareProfile || selectedSavedCompareProfile');
    expect(playerCard).toContain('Age: {resolvedProfile.display_age || resolvedProfile.age}');
    expect(playerCard).not.toContain('Born: {resolvedProfile.birth_date}');
  });

  it('keeps draft picks out of the default roster list view', () => {
    const roster = source('app/screens/team-roster.tsx');

    expect(roster).toContain("rosterViewMode, setRosterViewMode");
    expect(roster).toContain('playerBaselineProfile || profilesByName[p.full_name]');
    expect(roster).toContain("ROSTER");
    expect(roster).toContain("PICKS");
    expect(roster).toContain("rosterViewMode === 'picks'");
    expect(roster).not.toContain('DRAFT PICKS ({team.picks.length})</Text>');
  });

  it('does not present the franchise game as a mini game on the dashboard', () => {
    const dashboard = source('app/(tabs)/dashboard.tsx');
    const createLeague = source('app/screens/create-league.tsx');

    expect(dashboard).not.toContain('MINI GAME');
    expect(dashboard).not.toContain('Mini Games are on the way');
    expect(dashboard).not.toContain('miniGameCard');
    expect(createLeague).not.toContain('coming soon');
  });

  it('shows NBA standard and two-way roster slots during roster cuts', () => {
    const rosterCuts = source('app/screens/offseason/roster-cuts.tsx');

    expect(rosterCuts).toContain('standardPlayers.length');
    expect(rosterCuts).toContain('twoWayPlayers.length');
    expect(rosterCuts).toContain('Two-way');
  });

  it('routes NBA expansion stage to an expansion screen', () => {
    const offseason = source('app/screens/offseason/index.tsx');
    const rootLayout = source('app/_layout.tsx');
    const expansion = source('app/screens/offseason/expansion.tsx');
    const functionsIndex = source('functions/index.js');

    expect(offseason).toContain('/screens/offseason/expansion');
    expect(rootLayout).toContain('screens/offseason');
    expect(rootLayout).not.toContain('screens/offseason/expansion');
    expect(expansion).toContain('Expansion Teams');
    expect(expansion).toContain("httpsCallable(functions, 'submitExpansionProtection')");
    expect(expansion).toContain("httpsCallable(functions, 'runExpansionDraft')");
    expect(functionsIndex).toContain('exports.submitExpansionProtection');
    expect(functionsIndex).toContain('exports.runExpansionDraft');
    expect(expansion).not.toContain('completeOffseasonTeamAction');
  });

  it('routes playoff games through matchup/result screens and syncs completed series', () => {
    const playoffs = source('app/screens/season/playoffs.tsx');
    const matchup = source('app/screens/season/matchup.tsx');
    const result = source('app/screens/season/game-result.tsx');
    const matchupsFn = source('functions/franchise/matchups.js');

    expect(playoffs).toContain('syncPlayoffSeriesFromGames');
    expect(playoffs).toContain("competition: 'playoffs'");
    expect(matchup).toContain("competition === 'playoffs'");
    expect(result).toContain("competition === 'playoffs'");
    expect(matchupsFn).toContain("data.competition === 'playoffs'");
  });

  it('exposes commissioner injury management from the command center', () => {
    const channels = source('app/screens/channels.tsx');
    const rootLayout = source('app/_layout.tsx');
    const seasonLayout = source('app/screens/season/_layout.tsx');
    const injuries = source('app/screens/season/injuries.tsx');
    const functionsIndex = source('functions/index.js');

    expect(channels).toContain('/screens/season/injuries');
    expect(rootLayout).toContain('screens/season');
    expect(rootLayout).not.toContain('screens/season/injuries');
    expect(seasonLayout).toContain('injuries');
    expect(injuries).toContain("httpsCallable(functions, 'manageTeamInjury')");
    expect(functionsIndex).toContain('exports.manageTeamInjury');
  });

  it('does not show raw player OVR labels in NBA franchise management screens', () => {
    const rosterCuts = source('app/screens/offseason/roster-cuts.tsx');

    expect(rosterCuts).not.toContain(' OVR');
    expect(rosterCuts).toContain('gradeFromHiddenValue');
    expect(rosterCuts).toContain('Grade ');
  });

  it('uses clear Trade Center tab labels', () => {
    const tradeCenter = source('app/screens/trade-channel.tsx');

    expect(tradeCenter).toContain('MY TEAM');
    expect(tradeCenter).toContain('BLOCK FEED');
    expect(tradeCenter).toContain('>TRADE<');
    expect(tradeCenter).not.toContain('MY TRADE BLOCK');
    expect(tradeCenter).not.toContain('ON THE BLOCK');
    expect(tradeCenter).not.toContain('>PROPOSE<');
  });

  it('uses neutral franchise labels for public sport modes', () => {
    const createLeague = source('app/screens/create-league.tsx');
    const dashboard = source('app/(tabs)/dashboard.tsx');
    const profileSetup = source('app/(tabs)/profile-setup.tsx');
    const profile = source('app/screens/profile.tsx');
    const joinLeague = source('app/screens/join-league.tsx');

    for (const file of [createLeague, dashboard, profileSetup, profile]) {
      expect(file).toContain('NBA Franchise');
      expect(file).toContain('NFL Franchise');
      expect(file).toContain('MLB Franchise');
    }
    expect(joinLeague).toContain("s === 'madden' ? 'NFL'");
    expect(joinLeague).not.toContain("s === 'madden' ? 'MADDEN'");
  });

  it('keeps signup language preference private to the account', () => {
    const auth = source('app/(tabs)/auth.tsx');
    const profileSetup = source('app/(tabs)/profile-setup.tsx');

    expect(auth).toContain('SUPPORTED_ACCOUNT_LANGUAGES');
    expect(auth).toContain('preferredLanguage');
    expect(profileSetup).toContain('private');
    expect(profileSetup).toContain('preferences');
    expect(profileSetup).toContain('preferredLanguage');
    expect(profileSetup).not.toContain('profileData = {\n        uid: user.uid,\n        preferredLanguage');
  });

  it('renders Live Mode player stats as starter head-to-head matchups', () => {
    const liveMode = source('app/screens/season/live-mode.tsx');

    expect(liveMode).toContain('starterMatchupsForTimeline');
    expect(liveMode).toContain('See More Player Stats');
    expect(liveMode).toContain('Matchups');
    expect(liveMode).not.toContain(['Starter', 'Matchups'].join(' '));
  });

  it('keeps coaching game plans to first-half and second-half preset selection', () => {
    const coaching = source('app/screens/season/coaching-presets.tsx');

    expect(coaching).toContain('First Half System');
    expect(coaching).toContain('Second Half System');
    expect(coaching).toContain('Save Game Plan');
    expect(coaching).toContain('halfCourtPreview');
    expect(coaching).not.toContain('tunerGrid');
    expect(coaching).not.toContain('updateModifier');
    expect(coaching).not.toContain('Custom Gameplan');
  });

  it('shows conference-aware playoff picture sections', () => {
    const playoffs = source('app/screens/season/playoffs.tsx');

    expect(playoffs).toContain('conferencePictures');
    expect(playoffs).toContain('Eastern Conference');
    expect(playoffs).toContain('Western Conference');
    expect(playoffs).not.toContain('<Text style={styles.pictureTitle}>Playoff Field</Text>');
  });

  it('adds finance definition bubbles and clearer draft prospect cards', () => {
    const finances = source('app/screens/season/finances.tsx');
    const draftClass = source('app/screens/offseason/draft-class.tsx');

    expect(finances).toContain('FINANCE_DEFINITIONS');
    expect(finances).toContain('activeFinanceHelp');
    expect(finances).toContain('definitionBubble');
    expect(draftClass).toContain('Projected #');
    expect(draftClass).toContain('PlayerHeadshot');
    expect(draftClass).not.toContain('>R{prospect.projectedRound || prospect.draft_round ||');
  });

  it('centers compact award marks in the trophy case', () => {
    const awards = source('app/screens/season/awards.tsx');

    expect(awards).toContain('awardMarkIconWrap');
    expect(awards).toContain('numberOfLines={2}');
    expect(awards).toContain('textAlign:');
  });

  it('keeps prohibited commercial-game branding out of app source and docs', () => {
    const banned = [
      ['N', 'BA', ' ', '2', 'K'].join(''),
      ['2', 'K', ' ', 'ratings'].join(''),
      ['2', 'K', ' ', 'badges'].join(''),
      ['official', ' ', '2', 'K', ' ', 'attributes'].join(''),
      ['2', 'K', ' ', 'tendencies'].join(''),
      ['N', 'BA', ' ', '2', 'K', ' ', 'database'].join(''),
      ['Ta', 'ke-', 'Two'].join(''),
      ['Vis', 'ual', ' ', 'Con', 'cepts'].join(''),
      ['Mad', 'den', ' ', 'NFL'].join(''),
      ['MLB', ' ', 'The', ' ', 'Show'].join(''),
      ['WWE', ' ', '2', 'K'].join(''),
      ['EA', ' ', 'FC', ' ', '(', 'FI', 'FA', ')'].join(''),
    ].map(term => term.toLowerCase());
    const paths = [
      'app/(tabs)/dashboard.tsx',
      'app/(tabs)/profile-setup.tsx',
      'app/screens/create-league.tsx',
      'app/screens/profile.tsx',
      'constants/baseballArchetypes.ts',
      'constants/eraCaps.ts',
      'constants/mlbTeams.ts',
      'docs/superpowers/specs/2026-06-22-mlb-nfl-sport-logic-design.md',
      'scripts/backfill-era-salaries.mjs',
      'scripts/seed-mlb-pool.mjs',
    ];

    const offenders = paths.flatMap(path => {
      const text = source(path).toLowerCase();
      return banned
        .filter(term => text.includes(term))
        .map(term => `${path}:${term}`);
    });

    expect(offenders).toEqual([]);
  });
});
