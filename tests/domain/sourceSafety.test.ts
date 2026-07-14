import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const source = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('source safety regressions', () => {
  it('uses Franchise Mobile as the public app title', () => {
    const appConfig = JSON.parse(source('app.json'));
    const functions = source('functions/index.js');
    const landing = source('app/(tabs)/index.tsx');

    expect(appConfig.expo.name).toBe('Franchise Mobile');
    expect(appConfig.expo.name).not.toBe('Franchise Social');
    expect(functions).toContain("default: return 'Franchise Mobile'");
    expect(functions).not.toContain("default: return 'Franchise Social'");
    expect(landing).toContain('MOBILE');
    expect(landing).not.toContain('SOCIAL');
  });

  it('documents the full public NBA grade ladder', () => {
    const ratingDesign = source('docs/superpowers/specs/2026-06-27-original-basketball-rating-import-design.md');
    const evaluationDesign = source('docs/superpowers/specs/2026-06-26-player-evaluation-v2-design.md');

    for (const doc of [ratingDesign, evaluationDesign]) {
      expect(doc).toContain('D+');
      expect(doc).toContain('D-');
      expect(doc).toContain('57-59');
      expect(doc).toContain('53-56');
      expect(doc).toContain('50-52');
      expect(doc).not.toContain('50-59');
      expect(doc).not.toContain('68-70');
    }
  });

  it('uses numeric currentYear for NBA team branding', () => {
    const roster = source('app/screens/team-roster.tsx');
    const select = source('app/screens/team-select.tsx');

    expect(roster).toContain('getTeamColors(abbr, currentYear)');
    expect(roster).toContain('<SportTeamLogo');
    expect(roster).toContain('era={currentYear}');
    expect(select).toContain('currentYear={currentYear}');
  });

  it('sorts enriched team rosters with the freshly loaded league year', () => {
    const roster = source('app/screens/team-roster.tsx');

    expect(roster).toContain('let loadedCurrentYear');
    expect(roster).toContain('comparePlayersByTierForYear({}, loadedCurrentYear)');
    expect(roster).not.toContain('comparePlayersByTierForYear({}, currentYear)');
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

  it('removes the My MVP product area from app navigation', () => {
    const rootLayout = source('app/_layout.tsx');
    const dashboard = source('app/(tabs)/dashboard.tsx');
    const profile = source('app/screens/profile.tsx');
    const routes = [
      'my-mvp',
      'mvp-players',
      'mvp-player-edit',
      'mvp-player-view',
      'mvp-proam',
      'mvp-locker-room',
      'mvp-stats',
      'locker-console-chat',
      'locker-group-chat',
      'locker-group-create',
      'locker-group-info',
    ];

    for (const route of routes) {
      expect(rootLayout).not.toContain(`screens/${route}`);
      expect(dashboard).not.toContain(route);
      expect(profile).not.toContain(route);
    }
    for (const file of routes.map(route => `app/screens/${route}.tsx`)) {
      expect(existsSync(resolve(root, file))).toBe(false);
    }
    expect(dashboard).not.toContain('My MVP');
    expect(profile).not.toContain('My MVP Players');
  });

  it('links Help / FAQ from the profile settings area', () => {
    const profile = source('app/screens/profile.tsx');

    expect(profile).toContain("router.push('/screens/faq-help')");
    expect(profile).toContain('Help / FAQ');
  });

  it('links Help / FAQ from the public title screen', () => {
    const landing = source('app/(tabs)/index.tsx');

    expect(landing).toContain("router.push('/screens/faq-help')");
    expect(landing).toContain('Help / FAQ');
  });

  it('uses one shared franchise player card row across roster and trade surfaces', () => {
    const sharedRow = source('components/FranchisePlayerRow.tsx');
    const roster = source('app/screens/roster.tsx');
    const teamRoster = source('app/screens/team-roster.tsx');
    const tradeRoom = source('app/screens/trade-room.tsx');

    expect(sharedRow).toContain('export default function FranchisePlayerRow');
    expect(sharedRow).toContain('PlayerHeadshot');
    expect(sharedRow).toContain('buildScoutingGrades');
    expect(sharedRow).toContain('gradeBadge');
    expect(sharedRow).toContain('salaryLabel');
    expect(roster).toContain("from '@/components/FranchisePlayerRow'");
    expect(teamRoster).toContain("from '@/components/FranchisePlayerRow'");
    expect(tradeRoom).toContain("from '@/components/FranchisePlayerRow'");
  });

  it('shows NBA tier, archetypes, and development outlook separately from potential grades', () => {
    const playerCard = source('components/PlayerCard.tsx');
    const sharedRow = source('components/FranchisePlayerRow.tsx');

    expect(playerCard).toContain('nbaIdentity.tier');
    expect(playerCard).toContain('nbaIdentity.archetypes');
    expect(playerCard).toContain('Development Outlook');
    expect(playerCard).toContain('Potential Ceiling');
    expect(playerCard).toContain("from '@/domain/nba/visibleIdentityFallback'");
    expect(playerCard).toContain('visibleNbaIdentityFromSources(player, profile)');
    expect(playerCard).toContain('buildFallbackVisibleNbaIdentity(player, profile)');
    expect(playerCard).not.toContain("Potential: C - Contributor");
    expect(sharedRow).toContain('rowIdentity?.tier');
    expect(sharedRow).toContain('rowIdentity?.archetypes');
    expect(sharedRow).toContain("from '@/domain/nba/visibleIdentityFallback'");
    expect(sharedRow).toContain('buildFallbackVisibleNbaIdentity(player, profile)');
    expect(sharedRow).toContain('normalizeNbaTierLabel(archetype.label)');
    const roster = source('app/screens/roster.tsx');
    expect(roster).toContain('positionFilters.map');
    expect(roster).not.toContain('ALL TIERS');
    expect(roster).not.toContain('ALL ARCHETYPES');
    expect(roster).not.toContain('First Name');
    expect(roster).not.toContain('Last Name');
    expect(roster).toContain('filterDock');
    expect(roster).toContain('listContent: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 100 }');
    expect(playerCard).toContain('compareMode');
    expect(playerCard).toContain("same_tier");
    expect(playerCard).toContain("same_archetype");
    const tradeChannel = source('app/screens/trade-channel.tsx');
    expect(tradeChannel).toContain('tradeTierFilter');
    expect(tradeChannel).toContain('tradeArchetypeFilter');
    expect(tradeChannel).toContain('matchesNbaClassificationFilter');
    expect(tradeChannel).toContain('normalizeNbaTierLabel(identity.tier)');
    expect(tradeChannel).toContain("'Specialist / Depth Piece'");
    const scoutingGrades = source('domain/nba/scoutingGrades.ts');
    expect(scoutingGrades).not.toContain('Starter Upside');
    expect(scoutingGrades).not.toContain('starter-level');
    expect(scoutingGrades).toContain('Rotation Upside');
    expect(scoutingGrades).toContain('High-Impact Upside');
    const createPlayer = source('app/screens/create-player.tsx');
    expect(createPlayer).toContain('Archetype Notes');
    expect(createPlayer).not.toContain('Starter, rotation, prospect');
  });

  it('keeps custom player edit and delete actions wired on team roster cards', () => {
    const teamRoster = source('app/screens/team-roster.tsx');

    expect(teamRoster).toContain("pathname: '/screens/create-player'");
    expect(teamRoster).toContain('onDeleteCustom={selectedPlayer?.isCustom');
    expect(teamRoster).toContain('handleDeleteCustomPlayer(p)');
  });

  it('renders online friends as profile photo bubbles with initials as fallback', () => {
    const dashboard = source('app/(tabs)/dashboard.tsx');

    expect(dashboard).toContain("Image source={{ uri: f.photoUrl }}");
    expect(dashboard).toContain('styles.onlinePreviewImage');
    expect(dashboard).toContain('styles.onlineSheetAvatarImage');
    expect(dashboard).toContain("f.photoUrl ? (");
  });

  it('centralizes Firebase initialization in constants/firebase', () => {
    const screens = [
      'app/screens/league-rosters.tsx',
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
    expect(hook).toContain("pathname: '/screens/season/game-result'");
    expect(hook).not.toContain("pathname: '/screens/season/live-mode'");
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
    expect(notifications).toContain("pathname: '/screens/season/game-result'");
    expect(notifications).not.toContain("pathname: '/screens/season/live-mode'");
    expect(notifications).toContain("if (type === 'game_ready') return 'View Result");
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
    expect(functionsIndex).toContain('createSimulateScheduledGameHandler({');
    expect(functionsIndex).toContain('FieldValue,');
    expect(functionsIndex).toContain("case 'draft_started'");
    expect(functionsIndex).toContain("case 'season_awards'");
    expect(functionsIndex).toContain('exports.advanceDueOffseasons');
    expect(functionsIndex).toContain('gameId: n.gameId || n.scheduleGameId || n.matchupId ||');
    expect(functionsIndex).toContain("competition: n.competition || n.scheduleCompetition || 'regular'");
    const matchups = source('functions/franchise/matchups.js');
    expect(matchups).toContain('writeLiveGameReadyNotifications({');
    expect(matchups).toContain('FieldValue,');
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

  it('orders Command Center rooms around GM flow before player wires', () => {
    const channels = source('app/screens/channels.tsx');
    const roomOrder = [
      "title: 'GM Lounge'",
      "title: 'Trade Center'",
      "title: 'League News'",
      "title: 'Front Office'",
      "title: 'Coaching Room'",
      "title: 'Stats & Standings'",
      "title: 'Player Wire'",
    ];

    for (let i = 0; i < roomOrder.length - 1; i += 1) {
      expect(channels.indexOf(roomOrder[i])).toBeGreaterThan(-1);
      expect(channels.indexOf(roomOrder[i])).toBeLessThan(channels.indexOf(roomOrder[i + 1]));
    }

    expect(channels).toContain("const [activeRoomTitle, setActiveRoomTitle] = useState('GM Lounge')");
  });

  it('keeps GM Lounge chat dark while preserving chat tools', () => {
    const channel = source('app/screens/channel.tsx');

    expect(channel).toContain('styles.chatHero');
    expect(channel).toContain('styles.chatSurface');
    expect(channel).toContain('styles.chatToolRail');
    expect(channel).not.toContain('styles.chatHeroTitle');
    expect(channel).toContain('style={styles.chatFeed}');
    expect(channel).toContain("container: { flex: 1, backgroundColor: '#02070d' }");
    expect(channel).toContain("chatFeed: { flex: 1, backgroundColor: '#02070d' }");
    expect(channel).toContain('<Text style={styles.gifBtnText}>GIF</Text>');
    expect(channel).toContain('onLongPress={() => onMessageLongPress(item)}');
    expect(channel).toContain('blockAndReport(item.uid, senderName)');
    expect(channel).toContain('MESSAGE_REACTIONS');
    expect(channel).toContain('setShowGiphy(true)');
    expect(channel).toContain('renderMentionDropdown');
  });

  it('shows an in-app unread badge for League Chat and resets it on open', () => {
    const channels = source('app/screens/channels.tsx');
    const channel = source('app/screens/channel.tsx');

    expect(channels).toContain('countUnreadChannelMessages');
    expect(channels).toContain('formatUnreadBadge');
    expect(channels).toContain('leagueChatUnreadBadge');
    expect(channels).toContain('styles.unreadBadge');
    expect(channels).toContain('styles.quickUnreadBadge');
    expect(channels).toContain('numberOfLines={1}>{item.label}</Text>');
    expect(channels).toContain("action.id === 'league-chat' && leagueChatUnreadBadge");
    expect(channel).toContain('channelReadKey(leagueId, channelId)');
    expect(channel).toContain('lastOpenedAt: serverTimestamp()');
    expect(channel).toContain('{ merge: true }');
  });

  it('separates Team Player Stats from League Stats in Stats and Standings', () => {
    const channels = source('app/screens/channels.tsx');
    const standings = source('app/screens/season/standings.tsx');

    expect(channels).toContain('Player Stats');
    expect(channels).toContain("statsMode: 'teamPlayers'");
    expect(channels).toContain('League Stats');
    expect(channels).toContain("statsMode: 'leaguePlayers'");
    expect(standings).toContain("type StandingsContentMode = 'standings' | 'teamPlayers' | 'leaguePlayers'");
    expect(standings).toContain("mode === 'teamPlayers'");
    expect(standings).toContain("activeContentMode === 'leaguePlayers'");
    expect(standings).toContain('teamScopedPlayerLeaders');
    expect(standings).toContain('leaguePlayerLeaders');
    expect(standings).toContain('leagueStatTeams');
    expect(standings).toContain('setPoolPlayers');
    expect(standings).toContain("doc(db, 'era_player_pools', poolKey)");
    expect(standings).toContain('mergeLeagueStatTeams');
    expect(standings).toContain('buildCombinedPlayerStatRows');
    expect(standings).toContain('includeZeroGamePlayers: activeContentMode === \'leaguePlayers\'');
    expect(standings).toContain('GP');
    expect(standings).toContain('PTS');
    expect(standings).toContain('REB');
    expect(standings).toContain('AST');
    expect(standings).toContain('playerStatValues');
  });

  it('keeps the stats screen mode synced when Command Center opens another stats card', () => {
    const standings = source('app/screens/season/standings.tsx');

    expect(standings).toContain('setContentMode(initialContentMode)');
    expect(standings).toContain('[initialContentMode]');
  });

  it('puts NBA schedule setup in the league creation flow', () => {
    const createLeague = source('app/screens/create-league.tsx');
    const teamSelect = source('app/screens/team-select.tsx');
    const leagueSettings = source('app/screens/league-settings.tsx');

    expect(createLeague).toContain('scheduleGamesPerTeam');
    expect(createLeague).toContain('NBA Schedule');
    expect(createLeague).toContain('defaultScheduleGamesPerTeam(sport)');
    expect(createLeague).not.toContain("gamesPerTeam: sport === 'nba' ? Number(scheduleGamesPerTeam) : null");
    expect(teamSelect).toContain('scheduleCreationFailed');
    expect(teamSelect).toContain('The team was claimed, but the schedule did not lock');
    expect(leagueSettings).toContain('scheduleOptionsForSport');
    expect(leagueSettings).toContain("league?.sport === 'madden' ? 'NFL SCHEDULE'");
    expect(leagueSettings).not.toContain("{league?.sport === 'nba' && (");
  });

  it('keeps CPU team controls server-backed for solo leagues', () => {
    const settings = source('app/screens/league-settings.tsx');
    const cpuTrade = source('app/screens/cpu-trade.tsx');
    const functionsIndex = source('functions/index.js');
    const matchups = source('functions/franchise/matchups.js');

    expect(settings).toContain('allowCpuGameSimulation');
    expect(settings).toContain('allowCpuTrades');
    expect(settings).toContain('CPU TEAMS / SOLO PLAY');
    expect(cpuTrade).toContain("httpsCallable(functions, 'submitCpuTradeRequest')");
    expect(cpuTrade).toContain("httpsCallable(functions, 'finalizeTrade')");
    expect(cpuTrade).not.toContain("addDoc(collection(db, 'leagues', leagueId, 'cpu_trade_requests')");
    expect(functionsIndex).toContain('exports.submitCpuTradeRequest');
    expect(functionsIndex).toContain('evaluateCpuTrade');
    expect(matchups).toContain('canUserSimulateVsCpu');
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
    expect(calendar).not.toContain('advanceCupLocally');
    expect(calendar).toContain('Advance NBA Cup');
    expect(functionsIndex).toContain('exports.advanceNbaCup');
  });

  it('keeps heavy schedule repair writes off the phone calendar screen', () => {
    const calendar = source('app/screens/season/calendar.tsx');

    expect(calendar).not.toContain('repairNbaScheduleOwnershipLocally');
    expect(calendar).not.toContain('previewNbaScheduleOwnershipRepair');
    expect(calendar).not.toContain('integrateNbaCupGamesIntoRegularSchedule');
    expect(calendar).not.toContain('buildNbaCupSchedule');
    expect(calendar).not.toContain('updateDoc');
  });

  it('runs commissioner season simulation continuously in one-game steps', () => {
    const calendar = source('app/screens/season/calendar.tsx');

    expect(calendar).toContain('runSeasonSimContinuously');
    expect(calendar).toContain("'Sim Season?'");
    expect(calendar).toContain("'Start Sim'");
    expect(calendar).toContain('remainingGames');
    expect(calendar).toContain("batchSize: 1");
    expect(calendar).toContain("setViewMode('league')");
    expect(calendar).toContain('Simming game by game');
    expect(calendar).toContain('onScrollBeginDrag');
    expect(calendar).toContain('simDockStop');
    expect(calendar).toContain('autoFollowSeasonSim');
    expect(calendar).toContain('toggleSeasonSimFollow');
    expect(calendar).toContain('scrollToNextUnfinishedGame');
    expect(calendar).toContain('scrollToGameId');
    expect(calendar).toContain('seasonSimFollowGameId');
    expect(calendar).toContain('nextSimTargetAfter(');
    expect(calendar).toContain('simmedSeasonGameIdsRef');
    expect(calendar).toContain('getCalendarItemLayout');
    expect(calendar).toContain('CALENDAR_ROW_HEIGHT');
    expect(calendar).toContain('CALENDAR_FOLLOW_VIEW_POSITION');
    expect(calendar).toContain('viewPosition: CALENDAR_FOLLOW_VIEW_POSITION');
    expect(calendar).toContain('LEAGUE_WEEKS_PER_PAGE');
    expect(calendar).toContain('weekPageStartFor');
    expect(calendar).toContain('renderedSections');
    expect(calendar).toContain('Weeks {leagueWeekPageStart}-{leagueWeekPageEnd}');
    expect(calendar).toContain('pendingFollowGameIdRef');
    expect(calendar).toContain('control.lastBatchGameIds');
    expect(calendar).toContain('calendarGameRows(sortedGames, rowSize)');
    expect(calendar).toContain("const rowSize = selectedViewMode === 'league' ? 1 : 2");
    expect(calendar).toContain('removeClippedSubviews={false}');
    expect(calendar).toContain('SIM_ELIGIBLE_STATUSES');
    expect(calendar).toContain('row.games.some(game => game.id === gameId)');
    expect(calendar).toContain('onScrollToIndexFailed');
    expect(calendar).toContain('await wait(220)');
    expect(calendar).not.toContain('runSeasonSimToTarget');
    expect(calendar).not.toContain('runSeasonSimWeeks');
    expect(calendar).not.toContain("'Full Season'");
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

    expect(matchup).toContain('const [resultDetails, setResultDetails]');
    expect(matchup).toContain("'gameResults', String(gameId)");
    expect(matchup).toContain('resultDetails?.id === scheduleGame.id');
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
    expect(calendar).toContain("item.status === 'final' || (item.liveTimeline && !resultRevealed)");
    expect(calendar).toContain("? '/screens/season/game-result'");
    expect(calendar).toContain("const cupGame = supportsCup && selectedViewMode === 'cup';");
    expect(calendar).not.toContain("item.competition === 'nbaCup' ? 'nbaCup'");
    expect(hook).toContain("pathname: '/screens/season/game-result'");
    expect(notifications).toContain("pathname: '/screens/season/game-result'");
    expect(result).toContain('Final Score');
    expect(result).toContain('postgameStory');
    expect(result).toContain('resultPostgameStory');
    expect(result).toContain('Turning Point');
    expect(result).toContain('Coaching Impact');
    expect(result).toContain('Quarter Scores');
    expect(result).toContain('Top Performers');
    expect(result).toContain('Full Box Score');
  });

  it('repairs finalized result details when box score player lines are missing', () => {
    const result = source('app/screens/season/game-result.tsx');

    expect(result).toContain('repairingResultDetails');
    expect(result).toContain("httpsCallable(functions, 'simScheduleBatch')");
    expect(result).toContain("action: 'repairResults'");
    expect(result).toContain('hasCompleteBoxScore');
  });

  it('uses shared roster value ordering and position filters across team and trade screens', () => {
    const roster = source('app/screens/roster.tsx');
    const teamRoster = source('app/screens/team-roster.tsx');
    const tradeRoom = source('app/screens/trade-room.tsx');
    const cpuTrade = source('app/screens/cpu-trade.tsx');
    const tradeChannel = source('app/screens/trade-channel.tsx');
    const league = source('app/screens/league.tsx');

    for (const file of [roster, teamRoster, tradeRoom, tradeChannel, cpuTrade, league]) {
      expect(file).toContain('compareSportRosterPlayersByValue');
    }
    for (const file of [roster, teamRoster, tradeRoom, tradeChannel, cpuTrade]) {
      expect(file).toContain('matchesSportRosterPosition');
      expect(file).toContain('getPositionFilters');
    }
    expect(tradeRoom).toContain('theirPickerPosFilter');
    expect(cpuTrade).toContain('givePosFilter');
    expect(cpuTrade).toContain('getPosFilter');
  });

  it('keeps roster and trade player cards visually consistent', () => {
    const roster = source('app/screens/roster.tsx');
    const teamRoster = source('app/screens/team-roster.tsx');
    const tradeRoom = source('app/screens/trade-room.tsx');
    const tradeChannel = source('app/screens/trade-channel.tsx');

    expect(roster).toContain('gradeCount={6}');
    expect(teamRoster).toContain('gradeCount={6}');
    expect(tradeRoom).toContain('salaryLabel={`${formatFranchisePlayerMoney(effectiveSalary)} salary`}');
    expect(tradeRoom).toContain('gradeCount={3}');
    expect(tradeChannel).toContain("from '@/components/FranchisePlayerRow'");
    expect(tradeChannel).toContain('salaryLabel={`${formatFranchisePlayerMoney(playerSalary(p))} salary`}');
    expect(tradeChannel).toContain('{formatFranchisePlayerMoney(playerSalary(item.player))}');
    expect(tradeChannel).toContain('styles.blockPlayerRow');
    expect(tradeChannel).toContain('gradeCount={3}');
    expect(tradeChannel).not.toContain('styles.rosterRowName');
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

  it('removes the old Live Mode page and app route while preserving results', () => {
    const rootLayout = source('app/_layout.tsx');
    const seasonLayout = source('app/screens/season/_layout.tsx');
    const matchup = source('app/screens/season/matchup.tsx');
    const calendar = source('app/screens/season/calendar.tsx');
    const result = source('app/screens/season/game-result.tsx');

    expect(rootLayout).toContain('screens/season');
    expect(rootLayout).not.toContain('screens/season/live-mode');
    expect(seasonLayout).not.toContain('live-mode');
    expect(existsSync(resolve(root, 'app/screens/season/live-mode.tsx'))).toBe(false);
    expect(existsSync(resolve(root, 'components/season/NbaBroadcastLiveMode.tsx'))).toBe(false);
    expect(existsSync(resolve(root, 'components/season/NbaLiveVisualBoard.tsx'))).toBe(false);
    expect(matchup).not.toContain('/screens/season/live-mode');
    expect(calendar).not.toContain('/screens/season/live-mode');
    expect(result).not.toContain('/screens/season/live-mode');
    expect(matchup).toContain('/screens/season/game-result');
    expect(calendar).toContain('/screens/season/game-result');
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
    expect(result).toContain('!resultVisible');
    expect(result).toContain('The final score unlocks when the live simulation reaches the final buzzer.');
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
    const periods = source('domain/sports/gamePeriods.ts');

    expect(result).toContain("from '@/domain/sports/gamePeriods'");
    expect(result).toContain('scorePeriodsForSport(sport, game)');
    expect(result).toContain('periodTableTitle(sport)');
    expect(periods).toContain("return value === 5 ? 'OT'");
    expect(periods).toContain("if (sport === 'mlb') return ordinal");
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
    expect(indexes).not.toContain('"collectionGroup": "mvp_players"');
    expect(indexes).toContain('"collectionGroup": "players"');
    expect(indexes).toContain('"collectionGroup": "leagues"');
    expect(indexes).toContain('"collectionGroup": "teams"');
    expect(indexes).toContain('"fieldPath": "is_custom"');
    expect(indexes).toContain('"fieldPath": "created_by_league"');
    expect(indexes).toContain('"fieldPath": "sport"');
    expect(indexes).toContain('"fieldPath": "offseason.stageEndsAt"');
    expect(indexes).toContain('"fieldPath": "gmId"');
    expect(indexes).toContain('"fieldOverrides"');
    expect(indexes).toContain('"fieldPath": "status"');
    expect(indexes).toContain('"queryScope": "COLLECTION_GROUP"');
  });

  it('documents the franchise engine QA matrix', () => {
    const qa = source('docs/FRANCHISE_ENGINE_QA.md');

    expect(qa).toContain('NBA schedule creation');
    expect(qa).toContain('Player upgrades');
    expect(qa).toContain('Expansion');
    expect(qa).toContain('Versioned index coverage');
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

  it('lets commissioners apply award, lottery, and player-bound upgrade currency from the trophy case', () => {
    const awards = source('app/screens/season/awards.tsx');
    const functionsIndex = source('functions/index.js');

    expect(awards).toContain("httpsCallable(functions, 'applyUpgradeGrants')");
    expect(awards).toContain('seasonUpgradeGrants');
    expect(awards).toContain('awardWinners');
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
    expect(upgrades).toContain('Higher grades cost more');
    expect(upgrades).toContain('getUpgradeStatus');
    expect(upgrades).toContain('arrow-up-circle');
    expect(upgrades).toContain('arrow-forward');
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
    expect(playerCard).toContain("compareVs: { width: 44");
    expect(playerCard).toContain("compareAbilityLabel: { width: 112");
    expect(playerCard).not.toContain('model.left.name');
    expect(playerCard).not.toContain('model.right.name');
    expect(playerCard).not.toContain('compareSmallName');
    expect(playerCard).toContain('teamId');
    expect(playerCard).toContain('teamName');
    expect(playerCard).not.toContain("playerTeam(player) || player.position || 'Player'");
    expect(playerCard).toContain('baselineProfile || savedProfile');
    expect(playerCard).toContain('selectedBaselineCompareProfile || selectedSavedCompareProfile');
    expect(playerCard).toContain('Age: {resolvedProfile.display_age || resolvedProfile.age}');
    expect(playerCard).not.toContain('Born: {resolvedProfile.birth_date}');
  });

  it('keeps draft picks out of the default roster list view', () => {
    const roster = source('app/screens/team-roster.tsx');

    expect(roster).toContain("rosterViewMode, setRosterViewMode");
    expect(roster).toContain('<FranchisePlayerRow');
    expect(roster).toContain('profilesByName={profilesByName}');
    expect(roster).toContain("ROSTER");
    expect(roster).toContain("PICKS");
    expect(roster).toContain("rosterViewMode === 'picks'");
    expect(roster).not.toContain('DRAFT PICKS ({team.picks.length})</Text>');
  });

  it('keeps the NBA league hub title and subtitle short enough for mobile cards', () => {
    const league = source('app/screens/league.tsx');

    expect(league).toContain("nba: 'Inside The NBA'");
    expect(league).toContain('function sportDisplayLabel');
    expect(league).toContain('function leagueSetupLabel');
    expect(league).toContain('{sportDisplayLabel(league.sport)}');
    expect(league).toContain('{leagueSetupLabel(league)}');
    expect(league).toContain('GM Controls and News');
    expect(league).not.toContain("league.sport?.toUpperCase()");
    expect(league).not.toContain("league.mode + ' mode'");
    expect(league).not.toContain('League News · Trade Center · Coaching · Front Office');
  });

  it('cleans era-suffixed team labels on the league home card', () => {
    const league = source('app/screens/league.tsx');

    expect(league).toContain("from '@/domain/nba/scheduleView'");
    expect(league).toContain('const myTeamAbbr = displayScheduleAbbr');
    expect(league).toContain('const myTeamName = displayScheduleTeamLabel');
    expect(league).toContain('{myTeamName}');
    expect(league).toContain('{myTeamAbbr} · {myTeam.players?.length || 0} players');
    expect(league).not.toContain('{myTeam.name}</Text>');
  });

  it('keeps GIF access visible in league chat without disabling the button', () => {
    const channel = source('app/screens/channel.tsx');

    expect(channel).toContain('<Text style={styles.gifBtnText}>GIF</Text>');
    expect(channel).not.toContain('GIF search unavailable');
    expect(channel).not.toContain('gifBtnBoxDisabled');
    expect(channel).not.toContain('gifBtnTextDisabled');
  });

  it('uses the canonical profile resolver on roster and trade surfaces', () => {
    const roster = source('app/screens/roster.tsx');
    const sharedRow = source('components/FranchisePlayerRow.tsx');
    const tradeChannel = source('app/screens/trade-channel.tsx');

    expect(roster).toContain('<FranchisePlayerRow');
    expect(roster).toContain('profilesByName={profilesByName}');
    expect(sharedRow).toContain('selectRosterRatingProfile(player, profilesByName, { era, currentYear, leagueDate })');
    expect(sharedRow).toContain('getSportArchetypeForYear');
    expect(sharedRow).toContain("from '@/domain/nba/visibleIdentityFallback'");
    expect(sharedRow).toContain('buildFallbackVisibleNbaIdentity(player, profile)');
    expect(tradeChannel).toContain('selectRosterRatingProfile');
    expect(tradeChannel).toContain('tradeVisibleIdentity');
    expect(tradeChannel).toContain('tradeSlotIdentity');
    expect(tradeChannel).not.toContain('getSportArchetype(player, sport, eraKey)');
    expect(tradeChannel).not.toContain("import { getPlaystyle }");
    expect(tradeChannel).toContain("era={league?.era || 'current'}");
    expect(tradeChannel).not.toContain("era={myTeam?.era || 'current'}");
  });

  it('does not present the franchise game as a mini game on the dashboard', () => {
    const dashboard = source('app/(tabs)/dashboard.tsx');
    const createLeague = source('app/screens/create-league.tsx');

    expect(dashboard).not.toContain('MINI GAME');
    expect(dashboard).not.toContain('Mini Games are on the way');
    expect(dashboard).not.toContain('miniGameCard');
    expect(dashboard).not.toContain('focusFranchiseModes');
    expect(dashboard).not.toContain('Choose Franchise');
    expect(dashboard).toContain("params: { sport: mode.sport }");
    expect(createLeague).not.toContain('coming soon');
  });

  it('keeps Schedule directly accessible under League Rosters on the league dashboard', () => {
    const league = source('app/screens/league.tsx');
    const rostersIndex = league.indexOf('📋 League Rosters');
    const scheduleIndex = league.indexOf('📅 Schedule');

    expect(rostersIndex).toBeGreaterThan(-1);
    expect(scheduleIndex).toBeGreaterThan(rostersIndex);
    expect(scheduleIndex - rostersIndex).toBeLessThan(500);
    expect(league).toContain("pathname: '/screens/season/calendar'");
    expect(league).toContain('styles.scheduleBtn');
    expect(league).toContain('styles.scheduleBtnText');
  });

  it('keeps the league team page in the official operations-card visual system', () => {
    const league = source('app/screens/league.tsx');

    expect(league).toContain('styles.leagueCommandShell');
    expect(league).toContain('styles.leagueActionStack');
    expect(league).toContain('styles.myTeamOperationsCard');
    expect(league).toContain('styles.leagueQuickLink');
    expect(league).toContain('League Operations');
    expect(league).toContain('Club Snapshot');
    expect(league).not.toContain('styles.channelsTab');
    expect(league).not.toContain('styles.myTeamCard');
  });

  it('keeps Trade Center board header labels inside their card', () => {
    const tradeCenter = source('app/screens/trade-channel.tsx');

    expect(tradeCenter).toContain('styles.boardHeroTextBlock');
    expect(tradeCenter).toContain('<Text style={styles.boardTeamLabel} numberOfLines={1}');
    expect(tradeCenter).toContain("overflow: 'hidden'");
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

  it('exposes Development League as its own Command Center page', () => {
    const channels = source('app/screens/channels.tsx');
    const seasonLayout = source('app/screens/season/_layout.tsx');
    const developmentLeague = source('app/screens/season/development-league.tsx');
    const functionsIndex = source('functions/index.js');

    expect(channels).toContain('/screens/season/development-league');
    expect(channels).toContain('Development League');
    expect(seasonLayout).toContain('development-league');
    expect(developmentLeague).toContain("httpsCallable(functions, 'startDevelopmentAssignment')");
    expect(developmentLeague).toContain("httpsCallable(functions, 'completeDevelopmentAssignment')");
    expect(functionsIndex).toContain('exports.startDevelopmentAssignment');
    expect(functionsIndex).toContain('exports.completeDevelopmentAssignment');
    expect(functionsIndex).toContain('exports.startDevelopmentAssignment = onCall(upgradeFunctionOptions');
    expect(functionsIndex).toContain('exports.completeDevelopmentAssignment = onCall(upgradeFunctionOptions');
  });

  it('does not show raw player OVR labels in NBA franchise management screens', () => {
    const rosterCuts = source('app/screens/offseason/roster-cuts.tsx');

    expect(rosterCuts).not.toContain(' OVR');
    expect(rosterCuts).toContain('gradeFromHiddenValue');
    expect(rosterCuts).toContain('Grade ');
  });

  it('keeps player-facing NBA grade surfaces free of visible numeric ratings', () => {
    const playerFacingPaths = [
      'components/PlayerCard.tsx',
      'app/screens/team-roster.tsx',
      'app/screens/league-rosters.tsx',
      'app/screens/trade-channel.tsx',
      'app/screens/season/scouting.tsx',
      'app/screens/season/player-upgrades.tsx',
    ];

    for (const path of playerFacingPaths) {
      const file = source(path);
      expect(file).not.toContain('OVR');
      expect(file).not.toContain('Overall Rating');
      expect(file).not.toContain('numeric rating');
      expect(file).not.toContain('rating number');
    }

    const playerCard = source('components/PlayerCard.tsx');
    expect(playerCard).not.toContain('Overall Talent');
    expect(playerCard).toContain('Talent Grade');

    const upgrades = source('app/screens/season/player-upgrades.tsx');
    expect(upgrades).toContain('Upgrade Points');
    expect(upgrades).toContain('Team Development Points');
    expect(upgrades).toContain('Star Training Tokens');
    expect(upgrades).toContain('player-bound credit');
    expect(upgrades).toContain('S-grade upgrades are rare');
    expect(upgrades).not.toContain('One point raises one grade');
    expect(upgrades).not.toContain('rating');
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

  it('groups the Trade Center block feed by team with compact player rows', () => {
    const tradeCenter = source('app/screens/trade-channel.tsx');

    expect(tradeCenter).toContain('tradeBlockTeamSections');
    expect(tradeCenter).toContain('styles.blockTeamSection');
    expect(tradeCenter).toContain('styles.blockPlayerRow');
    expect(tradeCenter).toContain('players.length');
    expect(tradeCenter).toContain('Open Trade');
    expect(tradeCenter).not.toContain('style={styles.listingCard}');
    expect(tradeCenter).not.toContain('styles.listingPlayerCardWrap');
  });

  it('uses player tier identity instead of old role-player badges in the Trade Center board slots', () => {
    const tradeCenter = source('app/screens/trade-channel.tsx');

    expect(tradeCenter).toContain('TierBadge');
    expect(tradeCenter).toContain('tradeSlotIdentity');
    expect(tradeCenter).toContain('identity?.tier');
    expect(tradeCenter).not.toContain('function PlaystyleBadge');
    expect(tradeCenter).not.toContain('<PlaystyleBadge');
  });

  it('presents the Trade Center My Team tab as an official front office board', () => {
    const tradeCenter = source('app/screens/trade-channel.tsx');

    expect(tradeCenter).toContain('Front Office Trade Board');
    expect(tradeCenter).toContain('styles.boardSummaryStrip');
    expect(tradeCenter).toContain('renderBoardSection');
    expect(tradeCenter).toContain('styles.boardPlayerCard');
    expect(tradeCenter).toContain('styles.addSectionButton');
    expect(tradeCenter).toContain('Protected');
    expect(tradeCenter).not.toContain('/* 3 Column Layout */');
    expect(tradeCenter).not.toContain('styles.threeCol');
  });

  it('keeps trade-room player pickers readable like roster filters', () => {
    const tradeRoom = source('app/screens/trade-room.tsx');

    expect(tradeRoom).toContain('positionFilterLabel(pos)');
    expect(tradeRoom).toContain('minWidth: 54');
    expect(tradeRoom).toContain('flexShrink: 0');
    expect(tradeRoom).toContain('paddingHorizontal: 14');
    expect(tradeRoom).toContain('height: 36');
    expect(tradeRoom).not.toContain("positionFilterBtn: { minWidth: 50");
  });

  it('shows NBA roster overflow warnings inside trade rooms', () => {
    const tradeRoom = source('app/screens/trade-room.tsx');

    expect(tradeRoom).toContain('tradeValidation.warnings');
    expect(tradeRoom).toContain('balanceWarningText');
  });

  it('keeps trade center filter chips from collapsing into unreadable labels', () => {
    const tradeChannel = source('app/screens/trade-channel.tsx');

    expect(tradeChannel).toContain('minWidth: 54');
    expect(tradeChannel).toContain('flexShrink: 0');
    expect(tradeChannel).toContain('textAlign:');
    expect(tradeChannel).not.toContain("sortBtn: { borderRadius: 6, paddingHorizontal: 12");
  });

  it('cleans era-suffixed team labels in offseason draft surfaces', () => {
    const liveDraft = source('app/screens/offseason/live-draft.tsx');
    const offseasonView = source('domain/offseason/viewModel.ts');

    expect(liveDraft).toContain("from '@/domain/nba/scheduleView'");
    expect(liveDraft).toContain('displayScheduleName(currentTeam)');
    expect(liveDraft).toContain('displayScheduleAbbr(pick.teamId)');
    expect(liveDraft).not.toContain("currentTeam?.name || currentTeam?.abbreviation || 'Current Team'");
    expect(liveDraft).not.toContain("team?.abbreviation || team?.name || pick.teamId");

    expect(offseasonView).toContain("from '@/domain/nba/scheduleView'");
    expect(offseasonView).toContain('displayScheduleTeamLabel(team.name || team.abbreviation, team.id)');
    expect(offseasonView).not.toContain("label: team.name || team.abbreviation || 'Claimed team'");
  });

  it('cleans era-suffixed team labels in league chat surfaces', () => {
    const channel = source('app/screens/channel.tsx');

    expect(channel).toContain("from '@/domain/nba/scheduleView'");
    expect(channel).toContain('channelTeamName(team)');
    expect(channel).toContain('channelTeamAbbr(team)');
    expect(channel).toContain('channelTeamName(myTeam)');
    expect(channel).toContain('cleanChannelTeamLabel(item.teamName');
    expect(channel).not.toContain("teamName: team?.name || ''");
    expect(channel).not.toContain("teamAbbr: team?.abbreviation || ''");
    expect(channel).not.toContain("teamName: myTeam.name || ''");
    expect(channel).not.toContain("teamAbbr: myTeam.abbreviation || ''");
  });

  it('cleans era-suffixed team labels before server notifications', () => {
    const contracts = source('functions/franchise/contracts.js');
    const finalizeTrade = source('functions/domain/finalizeTrade.js');
    const draftLottery = source('functions/franchise/draftLottery.js');

    for (const file of [contracts, finalizeTrade, draftLottery]) {
      expect(file).toContain('displayTeamLabel');
      expect(file).toContain('displayTeamAbbr');
    }
    expect(contracts).toContain('previousTeamName: displayTeamLabel(team)');
    expect(contracts).toContain('deadlineMessage(kind, warning, displayTeamLabel(team))');
    expect(contracts).toContain('`${displayTeamLabel(team)} offered');
    expect(finalizeTrade).toContain('teamALabel: displayTeamLabel(teamA, source.hostTeamName ||');
    expect(finalizeTrade).toContain('teamBLabel: displayTeamLabel(teamB, source.guestTeamName ||');
    expect(draftLottery).toContain('name: displayTeamLabel(team, teamId)');
  });

  it('cleans era-suffixed team labels in remaining roster and offseason surfaces', () => {
    const roster = source('app/screens/roster.tsx');
    const teamRoster = source('app/screens/team-roster.tsx');
    const offseasonIndex = source('app/screens/offseason/index.tsx');
    const rosterCuts = source('app/screens/offseason/roster-cuts.tsx');
    const tradeChannel = source('app/screens/trade-channel.tsx');

    expect(roster).toContain('activityTeamLabel()');
    expect(roster).not.toContain("teamName: team?.name || ''");
    expect(roster).not.toContain("message: (team?.name || 'A GM')");

    expect(teamRoster).toContain('tradeRouteTeamLabel');
    expect(teamRoster).not.toContain("cpuName: team.name || ''");
    expect(teamRoster).not.toContain("otherTeamName: team.name || ''");

    expect(offseasonIndex).toContain("from '@/domain/nba/scheduleView'");
    expect(offseasonIndex).toContain('displayScheduleTeamLabel(team.name || team.abbreviation');
    expect(offseasonIndex).not.toContain('{team.abbreviation || team.name || team.teamId}');

    expect(rosterCuts).toContain("from '@/domain/nba/scheduleView'");
    expect(rosterCuts).toContain('displayScheduleTeamLabel(team.name');
    expect(rosterCuts).not.toContain("{team.name || 'Your Team'}");

    expect(tradeChannel).toContain('displayScheduleTeamLabel(t.name || t.abbreviation');
    expect(tradeChannel).not.toContain('teamName: t.name, teamId: t.id');
  });

  it('uses neutral franchise labels for public sport modes', () => {
    const createLeague = source('app/screens/create-league.tsx');
    const dashboard = source('app/(tabs)/dashboard.tsx');
    const profileSetup = source('app/(tabs)/profile-setup.tsx');
    const profile = source('app/screens/profile.tsx');
    const joinLeague = source('app/screens/join-league.tsx');
    const searchUsers = source('app/screens/search-users.tsx');

    for (const file of [createLeague, dashboard, profileSetup, profile]) {
      expect(file).toContain('NBA Franchise');
      expect(file).toContain('NFL Franchise');
      expect(file).toContain('MLB Franchise');
    }
    expect(joinLeague).toContain("s === 'madden' ? 'NFL'");
    expect(joinLeague).toContain('function setupLabel');
    expect(joinLeague).toContain('setupLabel(item)');
    expect(joinLeague).toContain('setupLabel(selectedLeague)');
    expect(joinLeague).not.toContain("s === 'madden' ? 'MADDEN'");
    expect(joinLeague).not.toContain("const era = ERA_LABELS[item.era] || item.era || ''");
    expect(joinLeague).not.toContain('{ERA_LABELS[selectedLeague.era] || selectedLeague.era}</Text>');
    expect(searchUsers).toContain('function sportLabel');
    expect(searchUsers).toContain('sportLabel(league.sport)');
    expect(searchUsers).not.toContain('league.sport?.toUpperCase()');
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

  it('keeps coaching game plans to sport-aware preset selection', () => {
    const coaching = source('app/screens/season/coaching-presets.tsx');

    expect(coaching).toContain('phaseLabels[0]');
    expect(coaching).toContain('phaseLabels[1]');
    expect(coaching).toContain("['Early Game', 'Late Game']");
    expect(coaching).toContain("['Offense', 'Defense']");
    expect(coaching).toContain("['Opening Plan', 'Adjustment Plan']");
    expect(coaching).toContain('matchup adjustment');
    expect(coaching).toContain('Pick one offense and one defense.');
    expect(coaching).toContain('Save Game Plan');
    expect(coaching).toContain('halfCourtPreview');
    expect(coaching).not.toContain('halftime adjustment');
    expect(coaching).not.toContain('tunerGrid');
    expect(coaching).not.toContain('updateModifier');
    expect(coaching).not.toContain('Custom Gameplan');
  });

  it('creates private matchup prep records on first save', () => {
    const matchup = source('app/screens/season/matchup.tsx');

    expect(matchup).toContain('setDoc(doc(db, \'leagues\', leagueId, \'schedules\', scheduleId, \'preparation\'');
    expect(matchup).toContain('{ merge: true }');
    expect(matchup).toContain('Save Preparations');
    expect(matchup).not.toContain('Save Private Prep');
    expect(matchup).not.toContain('await updateDoc(doc(db, \'leagues\', leagueId, \'schedules\', scheduleId, \'preparation\'');
  });

  it('shows conference-aware playoff picture sections', () => {
    const playoffs = source('app/screens/season/playoffs.tsx');

    expect(playoffs).toContain('conferencePictures');
    expect(playoffs).toContain('Eastern Conference');
    expect(playoffs).toContain('Western Conference');
    expect(playoffs).toContain('AFC');
    expect(playoffs).toContain('NFC');
    expect(playoffs).toContain('American League');
    expect(playoffs).toContain('National League');
    expect(playoffs).toContain('sport,');
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

  it('keeps season calendar and money screens sport-aware outside NBA', () => {
    const calendar = source('app/screens/season/calendar.tsx');
    const finances = source('app/screens/season/finances.tsx');
    const scouting = source('app/screens/season/scouting.tsx');
    const standings = source('app/screens/season/standings.tsx');
    const playoffs = source('app/screens/season/playoffs.tsx');
    const awards = source('app/screens/season/awards.tsx');
    const channels = source('app/screens/channels.tsx');

    expect(calendar).toContain('const sport = normalizeSport(league?.sport)');
    expect(calendar).toContain("const supportsCup = sport === 'nba'");
    expect(calendar).toContain('sport={sport}');
    expect(calendar).not.toContain('SportTeamLogo sport="nba"');
    expect(finances).toContain('const sport = normalizeSport(league?.sport)');
    expect(finances).toContain("const financeLanguage = sport === 'mlb'");
    expect(finances).toContain("renderFinanceTile('capRoom', financeLanguage.roomLabel");
    expect(finances).toContain("renderFinanceTile('salaryCap', financeLanguage.limitLabel");
    expect(finances).toContain("renderFinanceTile('taxRoom', financeLanguage.thresholdLabel");
    expect(finances).toContain('sport={sport}');
    expect(finances).not.toContain('SportTeamLogo sport="nba"');
    expect(scouting).toContain('const sport = normalizeSport(league?.sport)');
    expect(scouting).toContain('sport={sport}');
    expect(scouting).not.toContain('SportTeamLogo sport="nba"');
    expect(standings).toContain('const sport = normalizeSport(league?.sport)');
    expect(standings).toContain("from '@/domain/sports/playerLeaderboards'");
    expect(standings).toContain('playerLeaderboardTabsForSport(sport)');
    expect(standings).toContain('buildSportPlayerLeaderboard');
    expect(standings).not.toContain("const supportsPlayerLeaders = sport === 'nba'");
    expect(standings).toContain('sport={sport}');
    expect(standings).not.toContain("sport={league?.sport || 'nba'}");
    expect(standings).not.toContain('SportTeamLogo sport="nba"');
    expect(playoffs).toContain('const sport = normalizeSport(league?.sport)');
    expect(playoffs).toContain('sport={sport}');
    expect(playoffs).toContain("from '@/domain/sports/playoffDisplay'");
    expect(playoffs).toContain('playoffFormatOptionsForSport(sport)');
    expect(playoffs).toContain('postseasonOffseasonWarning(sport)');
    expect(playoffs).toContain('offseasonStartStageForSport(sport)');
    expect(playoffs).not.toContain("expectedStage: 'awards_recap'");
    expect(playoffs).not.toContain("{ value: 'play_in_16', label: 'Play-In' }");
    expect(playoffs).not.toContain('SportTeamLogo sport="nba"');
    expect(channels).toContain("desc: 'Schedule and game access'");
    expect(channels).toContain("desc: 'Season standings'");
    expect(channels).not.toContain("pathname: '/screens/season/calendar', nbaOnly: true");
    expect(channels).not.toContain("pathname: '/screens/season/standings', nbaOnly: true");
    expect(channels).not.toContain("pathname: '/screens/season/playoffs', nbaOnly: true");
    expect(channels).not.toContain("pathname: '/screens/season/finances', nbaOnly: true");
    expect(channels).not.toContain("pathname: '/screens/season/scouting', nbaOnly: true");
    expect(channels).not.toContain("pathname: '/screens/season/injuries', nbaOnly: true");
    expect(channels).not.toContain("pathname: '/screens/season/awards', nbaOnly: true");
    expect(awards).toContain("from '@/domain/sports/awards'");
    expect(awards).toContain('awardCategoriesForSport(sport)');
    expect(awards).toContain('recordsForSportAward(sport, league, category.key');
    expect(awards).toContain("const ledgerSport = league?.sport || 'nba'");
    expect(awards).not.toContain("recordsForSportAward('nba'");
    expect(awards).toContain("isNba ? 'NBA Awards' : sport === 'madden' ? 'NFL Awards' : 'MLB Awards'");
  });

  it('opens shared offseason tools for MLB and NFL leagues', () => {
    const channels = source('app/screens/channels.tsx');
    const league = source('app/screens/league.tsx');
    const draftClass = source('app/screens/offseason/draft-class.tsx');
    const contractStage = source('components/offseason/ContractStageScreen.tsx');

    for (const pathname of [
      '/screens/offseason',
      '/screens/offseason/draft-class',
      '/screens/offseason/re-signing',
      '/screens/offseason/free-agency',
      '/screens/offseason/live-draft',
    ]) {
      expect(channels).not.toContain(`pathname: '${pathname}', nbaOnly: true`);
    }
    expect(league).toContain('offseasonStartStageForSport');
    expect(league).toContain("leagueSport === 'madden' || leagueSport === 'mlb' ? 'season_end' : 'awards_recap'");
    expect(league).not.toContain('!isNBASport || league?.offseason');
    expect(draftClass).toContain('const sport = normalizeSport(league?.sport)');
    expect(draftClass).toContain('sport,');
    expect(draftClass).not.toContain("sport={league?.sport || 'nba'}");
    expect(contractStage).toContain('const sport = normalizeSport(league?.sport)');
    expect(contractStage).not.toContain("sport={league?.sport || 'nba'}");
  });

  it('keeps league member team labels sport-aware', () => {
    const members = source('app/screens/league-members.tsx');

    expect(members).toContain('sportIconForLeague');
    expect(members).not.toContain('🏀 {team.name}');
  });

  it('preserves sport team conference and division metadata when teams are claimed', () => {
    const teamSelect = source('app/screens/team-select.tsx');

    expect(teamSelect).toContain('conference: t.conference');
    expect(teamSelect).toContain('division: t.division');
    expect(teamSelect).toContain('conference: team.conference || null');
    expect(teamSelect).toContain('division: team.division || null');
  });

  it('keeps join league sport labels user-facing', () => {
    const joinLeague = source('app/screens/join-league.tsx');

    expect(joinLeague).toContain('function sportLabel');
    expect(joinLeague).toContain("return 'NFL'");
    expect(joinLeague).toContain("return 'MLB'");
    expect(joinLeague).toContain('sportIcon(filterSport)');
    expect(joinLeague).toContain('sportLabel(selectedLeague.sport)');
    expect(joinLeague).not.toContain("item.sport?.toUpperCase() || 'NBA'");
    expect(joinLeague).not.toContain("selectedLeague.sport?.toUpperCase()");
    expect(joinLeague).not.toContain('<Text style={styles.emptyIcon}>🏀</Text>');
  });

  it('keeps NFL and MLB player cards as rich as NBA cards', () => {
    const row = source('components/FranchisePlayerRow.tsx');
    const card = source('components/PlayerCard.tsx');
    const headshot = source('components/PlayerHeadshot.tsx');

    expect(row).toContain('buildSportGradePreview');
    expect(row).not.toContain("const preview = sport === 'nba' ? gradePreview(player, profile, gradeCount) : [];");
    expect(card).toContain('buildSportPlayerIdentity');
    expect(card).toContain('buildSportScoutingSections');
    expect(card).toContain('sportIdentity');
    expect(card).not.toContain("const identity = isNBAPlayer ? getVisibleIdentity(player, resolvedProfile) : null;");
    expect(headshot).toContain('photo_url');
    expect(card).toContain('photo_url');
  });

  it('uses sport-aware roster value and draft potential display outside NBA', () => {
    const teamRoster = source('app/screens/team-roster.tsx');
    const roster = source('app/screens/roster.tsx');
    const tradeChannel = source('app/screens/trade-channel.tsx');
    const cpuTrade = source('app/screens/cpu-trade.tsx');
    const liveDraft = source('app/screens/offseason/live-draft.tsx');

    expect(teamRoster).toContain('compareSportRosterPlayersByValue');
    expect(roster).toContain('compareSportRosterPlayersByValue');
    expect(tradeChannel).toContain('compareSportRosterPlayersByValue');
    expect(cpuTrade).toContain('FranchisePlayerRow');
    expect(cpuTrade).toContain('compareSportRosterPlayersByValue');
    expect(liveDraft).toContain('gradeFromNumeric');
    expect(liveDraft).not.toContain('`POT ${item.potential}`');
  });

  it('keeps secondary roster previews and trade pickers sport-aware outside NBA', () => {
    const league = source('app/screens/league.tsx');
    const leagueRosters = source('app/screens/league-rosters.tsx');
    const finances = source('app/screens/season/finances.tsx');
    const tradeRoom = source('app/screens/trade-room.tsx');
    const createPlayer = source('app/screens/create-player.tsx');

    expect(league).toContain('compareSportRosterPlayersByValue');
    expect(leagueRosters).toContain('compareSportRosterPlayersByValue');
    expect(finances).toContain('compareSportRosterPlayersByValue');
    expect(tradeRoom).toContain('compareSportRosterPlayersByValue');
    expect(tradeRoom).toContain('matchesSportRosterPosition');
    expect(tradeRoom).toContain('const [otherTeam, setOtherTeam]');
    expect(tradeRoom).toContain('const hostTeam = isHost ? myTeam : otherTeam');
    expect(tradeRoom).toContain('const guestTeam = isHost ? otherTeam : myTeam');
    expect(tradeRoom).toContain('teamACap: teamFinanceLimit(hostTeam, leagueSport)');
    expect(tradeRoom).toContain('teamBCap: teamFinanceLimit(guestTeam, leagueSport)');
    expect(tradeRoom).toContain('teamABudget: teamFinanceLimit(hostTeam, leagueSport)');
    expect(tradeRoom).toContain('teamBBudget: teamFinanceLimit(guestTeam, leagueSport)');
    expect(tradeRoom).not.toContain('teamBCap: undefined');
    expect(tradeRoom).not.toContain('teamBBudget: undefined');
    expect(createPlayer).not.toContain("placeholder='Bron James Jr'");
  });

  it('keeps game notifications and reset cards sport-aware', () => {
    const notifications = source('app/screens/notifications.tsx');
    const channel = source('app/screens/channel.tsx');
    const functionsIndex = source('functions/index.js');

    expect(notifications).toContain('sportIconForNotification');
    expect(notifications).toContain('notificationIcon(n.type, n.sport || n.leagueSport)');
    expect(notifications).not.toContain("if (['matchup_request', 'matchup_accepted', 'game_ready', 'game_simulated', 'game_final', 'score_reported'].includes(type)) return '🏀';");
    expect(channel).toContain('sportIconForChannel');
    expect(channel).toContain('{sportIconForChannel(resolvedSport)} VS');
    expect(channel).not.toContain('🏀 VS');
    expect(functionsIndex).toContain('sportIconForNotification');
    expect(functionsIndex).toContain('titleFor(n.type, n.sport || n.leagueSport)');
    expect(functionsIndex).not.toContain("case 'matchup_request': return '🏀 Matchup Request';");
  });

  it('opens sport-aware coaching presets for MLB and NFL leagues', () => {
    const channels = source('app/screens/channels.tsx');
    const coachingScreen = source('app/screens/season/coaching-presets.tsx');
    const matchup = source('app/screens/season/matchup.tsx');
    const sportPresets = source('domain/sports/coachingPresets.ts');

    expect(channels).not.toContain("pathname: '/screens/season/coaching-presets', nbaOnly: true");
    expect(coachingScreen).toContain('defaultPresetsForSport');
    expect(coachingScreen).toContain('presetsForPrepSlot');
    expect(coachingScreen).toContain('isPresetAllowedForPrepSlot');
    expect(coachingScreen).toContain('const sport = normalizeSport(leagueSport)');
    expect(coachingScreen).toContain('defaultPresetsForSport(sport)');
    expect(coachingScreen).not.toContain('Coaching presets are only available for NBA leagues.');
    expect(matchup).toContain("from '@/domain/sports/coachingPresets'");
    expect(matchup).toContain('matchup adjustment');
    expect(matchup).toContain("['OFF', 'DEF']");
    expect(matchup).toContain('prepChoiceGrid');
    expect(matchup).toContain('offenseColumn');
    expect(matchup).toContain('defenseColumn');
    expect(matchup).toContain('quarterPlans');
    expect(matchup).toContain('quarterPresetSnapshots');
    expect(matchup).toContain('setQuarterPlanPreset');
    expect(matchup).not.toContain('halftime adjustment');
    expect(matchup).not.toContain('const NFL_GAME_PRESETS');
    expect(matchup).not.toContain('const MLB_GAME_PRESETS');
    expect(sportPresets).toContain('export const NFL_GAME_PRESETS');
    expect(sportPresets).toContain('export const MLB_GAME_PRESETS');
    expect(sportPresets).toContain('export function defaultPresetsForSport');
  });

  it('normalizes NFL CPU trade pools before loading rosters', () => {
    const cpuTrade = source('app/screens/cpu-trade.tsx');
    const matchups = source('functions/franchise/matchups.js');
    const salaryOverrides = source('app/screens/salary-overrides.tsx');
    const teamRoster = source('app/screens/team-roster.tsx');

    expect(cpuTrade).toContain('const sport = normalizeSport(league?.sport)');
    expect(cpuTrade).toContain("const loadedSport = normalizeSport(ld.sport)");
    expect(cpuTrade).toContain("const poolKey = loadedSport !== 'nba' ? loadedSport : eraKey");
    expect(cpuTrade).not.toContain("const sport = league?.sport || 'nba'");
    expect(cpuTrade).not.toContain("(ld.sport && ld.sport !== 'nba') ? ld.sport : eraKey");
    expect(matchups).toContain("const sport = normalizeSport(league.sport || 'nba')");
    expect(matchups).toContain("const rawKeys = sport !== 'nba'");
    expect(matchups).toContain("league.rosterEra");
    expect(matchups).toContain("'current'");
    expect(matchups).not.toContain("const sport = String(league.sport || 'nba')");
    expect(salaryOverrides).toContain("const sport = normalizeSport(ld.sport)");
    expect(salaryOverrides).toContain("const poolKey = sport !== 'nba' ? sport : era");
    expect(salaryOverrides).not.toContain("(ld.sport && ld.sport !== 'nba') ? ld.sport : era");
    expect(teamRoster).toContain('function normalizeSport');
    expect(teamRoster).toContain('loadedSport = normalizeSport(d.sport)');
    expect(teamRoster).toContain("const loadedPoolSport = normalizeSport(ld2.sport)");
    expect(teamRoster).toContain("const poolKey = loadedPoolSport !== 'nba' ? loadedPoolSport : eraKey");
    expect(teamRoster).not.toContain("(ld2.sport && ld2.sport !== 'nba') ? ld2.sport : eraKey");
  });

  it('does not show raw schedule ids in scouting opponent labels', () => {
    const scouting = source('app/screens/season/scouting.tsx');

    expect(scouting).toContain('displayScheduleAbbr(item.opponentTeamId)');
    expect(scouting).not.toContain('vs {item.opponentTeamId}');
    expect(scouting).not.toContain('abbr={item.opponentTeamId}');
  });

  it('does not show raw schedule ids in launch summary rows', () => {
    const awards = source('app/screens/season/awards.tsx');
    const offseason = source('app/screens/offseason/index.tsx');
    const expansion = source('app/screens/offseason/expansion.tsx');

    expect(awards).toContain('displayScheduleAbbr(grant.teamId)');
    expect(awards).not.toContain('{grant.teamId}: {grant.totalPoints}');
    expect(offseason).toContain('displayScheduleTeamLabel(pick.name || pick.abbreviation, pick.teamId, league?.sport)');
    expect(offseason).not.toContain('{pick.name || pick.abbreviation || pick.teamId}');
    expect(expansion).toContain('displayScheduleAbbr(teamId)');
    expect(expansion).toContain('displayScheduleAbbr(pick.sourceTeamId)');
    expect(expansion).not.toContain('{teamId}</Text>');
    expect(expansion).not.toContain('from {pick.sourceTeamId}');
  });

  it('centers compact award marks in the trophy case', () => {
    const awards = source('app/screens/season/awards.tsx');

    expect(awards).toContain('awardMarkIconWrap');
    expect(awards).toContain('numberOfLines={2}');
    expect(awards).toContain('textAlign:');
  });

  it('keeps player-bound upgrade credits with manually dropped free agents', () => {
    const roster = source('app/screens/roster.tsx');

    expect(roster).toContain("setDoc(doc(db, 'leagues', leagueId, 'free_agents'");
    expect(roster).toContain('arrayUnion({ ...player, team:');
    expect(roster).toContain('playerUpgradeCredits');
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
