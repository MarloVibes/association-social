import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import PlayerCard, { leagueDateFromRecord } from '@/components/PlayerCard';
import NbaBroadcastLiveMode from '@/components/season/NbaBroadcastLiveMode';
import NbaLiveVisualBoard from '@/components/season/NbaLiveVisualBoard';
import { db } from '@/constants/firebase';
import { buildArenaTheme, type ArenaTheme } from '@/domain/nba/arenaTheme';
import { buildBroadcastActorsForLineup } from '@/domain/nba/broadcastActors';
import { buildLiveVisualBoardState } from '@/domain/nba/liveVisualBoard';
import { currentTimelineEvent, livePlayerStatsAt, playableLiveTimeline, starterMatchupsForTimeline, type LiveTimeline, type LiveTimelineEvent, type LiveTimelineStarterMatchup } from '@/domain/nba/liveTimeline';
import type { NbaScheduleGame } from '@/domain/nba/schedule';
import { displayScheduleAbbr, displayScheduleEventText, displayScheduleName, isLiveResultRevealed, normalizeScheduleKey, teamScheduleKeys } from '@/domain/nba/scheduleView';
import { periodLabelForSport, scorePeriodsForSport } from '@/domain/sports/gamePeriods';

type Team = {
  id: string;
  teamId?: string;
  name?: string;
  abbreviation?: string;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  players?: any[];
};

type LiveGame = NbaScheduleGame & {
  competition?: 'nbaCup' | 'playoffs';
  groupId?: string;
  stage?: string;
  round?: string;
  seriesId?: string;
  playoffGame?: number;
  quarters?: { quarter: number; home: number; away: number }[];
  innings?: { inning: number; period?: number; label?: string; home: number; away: number }[];
  periods?: { period: number; label?: string; home: number; away: number }[];
  liveTimeline?: LiveTimeline;
  liveMode?: {
    status?: string;
    simulationStartedAtMs?: number;
    simulationEndsAtMs?: number;
    arenaTheme?: ArenaTheme;
  };
  arenaTheme?: ArenaTheme;
  finalAtMs?: number;
  simulationStartedAtMs?: number;
  sport?: string;
  homeCoachingPresetName?: string | null;
  awayCoachingPresetName?: string | null;
  homeFirstHalfCoachingPresetName?: string | null;
  awayFirstHalfCoachingPresetName?: string | null;
};

type ScheduleDoc = {
  games?: LiveGame[];
  nbaCup?: {
    games?: LiveGame[];
  } | null;
  playoffs?: {
    rounds?: {
      series?: {
        games?: LiveGame[];
      }[];
    }[];
  } | null;
};

type LiveTimelineDoc = {
  gameId?: string;
  liveTimeline?: LiveTimeline;
  liveMode?: LiveGame['liveMode'];
};

const SCREEN_HORIZONTAL_PADDING = 36;

function translucentColor(value: string | null | undefined, alpha: string, fallback: string) {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) && /^[0-9a-f]{2}$/i.test(alpha) ? `${color}${alpha}` : fallback;
}

function numberText(value: unknown) {
  return Number.isFinite(Number(value)) ? String(Number(value)) : '0';
}

function LiveTeamBadge({ abbr, accent, textColor = '#ffffff' }: { abbr: string; accent?: string | null; textColor?: string }) {
  return (
    <View style={[styles.liveTeamBadge, { borderColor: accent || '#3a3a3a' }]}>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={[styles.liveTeamBadgeText, { color: textColor }]}>
        {displayScheduleAbbr(abbr || 'TEAM')}
      </Text>
    </View>
  );
}

function normalizeSport(value: unknown): 'nba' | 'madden' | 'mlb' {
  const sport = String(value || 'nba').toLowerCase();
  if (sport === 'nfl' || sport === 'madden') return 'madden';
  if (sport === 'mlb') return 'mlb';
  return 'nba';
}

function clockText(event: LiveTimelineEvent | null) {
  if (!event) return '12:00';
  const minutes = Math.floor(Math.max(0, event.clockSeconds) / 60);
  const seconds = Math.max(0, event.clockSeconds) % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function statsTextForPlayer(playerId: string | undefined, players: ReturnType<typeof livePlayerStatsAt>, sport: 'nba' | 'madden' | 'mlb') {
  const player = players.find(item => item.playerId === playerId);
  if (!player) {
    if (sport === 'madden') return '0 YDS 0 TD';
    if (sport === 'mlb') return '0 H 0 K';
    return '0 PTS 0 REB 0 AST';
  }
  const line = player as any;
  if (sport === 'madden') {
    const yards = Number(line.passingYards || 0) + Number(line.rushingYards || 0) + Number(line.receivingYards || 0);
    const touchdowns = Number(line.passingTouchdowns || 0) + Number(line.rushingTouchdowns || 0) + Number(line.receivingTouchdowns || 0);
    return `${yards} YDS ${touchdowns} TD ${Number(line.sacks || 0)} SACK`;
  }
  if (sport === 'mlb') {
    return `${Number(line.hits || 0)} H ${Number(line.rbi || 0)} RBI ${Number(line.strikeouts || 0)} K`;
  }
  return `${player.points} PTS ${player.rebounds} REB ${player.assists} AST`;
}

function playerKey(player: any) {
  return String(player?.player_id || player?.playerId || player?.id || player?.bref_id || player?.full_name || player?.name || '').trim();
}

function playerForCard(player: { playerId?: string; name?: string; teamId?: string }, team: Team | undefined) {
  const key = playerKey({ player_id: player.playerId, full_name: player.name });
  const found = (team?.players || []).find(candidate => playerKey(candidate) === key);
  return found || {
    player_id: player.playerId,
    full_name: player.name,
    name: player.name,
    team: team?.abbreviation || team?.teamId || team?.name,
  };
}

function fallbackMatchupsFromStats({ away, home, sport }: { away: ReturnType<typeof livePlayerStatsAt>; home: ReturnType<typeof livePlayerStatsAt>; sport: 'nba' | 'madden' | 'mlb' }): LiveTimelineStarterMatchup[] {
  const positions = sport === 'madden'
    ? ['QB', 'HB', 'WR', 'EDGE', 'DB']
    : sport === 'mlb'
      ? ['SP', 'C', 'IF', 'OF', 'CL']
      : ['PG', 'SG', 'SF', 'PF', 'C'];
  return positions.map((position, index) => ({
    position,
    awayPlayer: {
      playerId: away[index]?.playerId || `away-${position}`,
      name: away[index]?.name || 'Away Player',
      teamId: away[index]?.teamId || '',
      skillChips: [],
    },
    homePlayer: {
      playerId: home[index]?.playerId || `home-${position}`,
      name: home[index]?.name || 'Home Player',
      teamId: home[index]?.teamId || '',
      skillChips: [],
    },
  }));
}

function safeElapsedMs(game: LiveGame | null, liveTimeline: LiveTimeline | null, liveMode: LiveGame['liveMode'] | undefined, nowMs: number, replayStartedAtMs?: string) {
  if (!liveTimeline) return 0;
  const replayStartMs = Number(replayStartedAtMs || 0);
  const startedAt = replayStartMs > 0
    ? replayStartMs
    : Number(liveMode?.simulationStartedAtMs || game?.simulationStartedAtMs || game?.finalAtMs || 0);
  const rawElapsed = startedAt > 0 ? nowMs - startedAt : 0;
  return Math.max(0, Math.min(rawElapsed, liveTimeline.revealDurationMs || rawElapsed));
}

export default function LiveModeScreen() {
  const { leagueId, gameId, competition, replayStartedAtMs } = useLocalSearchParams<{ leagueId: string; gameId: string; competition?: string; replayStartedAtMs?: string }>();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const [league, setLeague] = useState<any>(null);
  const [schedule, setSchedule] = useState<ScheduleDoc | null>(null);
  const [storedTimeline, setStoredTimeline] = useState<LiveTimelineDoc | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(Date.now());
  const [showFullPlayerStats, setShowFullPlayerStats] = useState(false);
  const [selectedPlayerCard, setSelectedPlayerCard] = useState<{ player: any; teamId: string } | null>(null);
  const availableCourtWidth = Math.max(120, windowWidth - SCREEN_HORIZONTAL_PADDING);
  const courtWidth = Math.min(availableCourtWidth, 420);

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!leagueId) return;
    let unsubscribeSchedule: (() => void) | undefined;
    const unsubscribeLeague = onSnapshot(doc(db, 'leagues', leagueId), snapshot => {
      if (!snapshot.exists()) {
        setLoading(false);
        return;
      }
      const nextLeague = { id: snapshot.id, ...snapshot.data() } as any;
      setLeague(nextLeague);
      const scheduleId = nextLeague.scheduleId || String(nextLeague.currentYear || 2025);
      if (unsubscribeSchedule) unsubscribeSchedule();
      unsubscribeSchedule = onSnapshot(doc(db, 'leagues', leagueId, 'schedules', scheduleId), scheduleSnapshot => {
        setSchedule(scheduleSnapshot.exists() ? scheduleSnapshot.data() as ScheduleDoc : null);
        setLoading(false);
      }, () => {
        setSchedule(null);
        setLoading(false);
      });
    }, () => setLoading(false));
    const unsubscribeTeams = onSnapshot(collection(db, 'leagues', leagueId, 'teams'), snapshot => {
      setTeams(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as Team)));
    });
    return () => {
      unsubscribeLeague();
      if (unsubscribeSchedule) unsubscribeSchedule();
      unsubscribeTeams();
    };
  }, [leagueId]);

  useEffect(() => {
    if (!leagueId || !gameId || !league) {
      setStoredTimeline(null);
      return;
    }
    const scheduleId = league.scheduleId || String(league.currentYear || 2025);
    return onSnapshot(doc(db, 'leagues', leagueId, 'schedules', scheduleId, 'liveTimelines', gameId), snapshot => {
      setStoredTimeline(snapshot.exists() ? snapshot.data() as LiveTimelineDoc : null);
    }, () => setStoredTimeline(null));
  }, [gameId, league, leagueId]);

  const isCupGame = competition === 'nbaCup';
  const isPlayoffGame = competition === 'playoffs';
  const playoffGames = useMemo(() => (
    schedule?.playoffs?.rounds?.flatMap(round => (
      round.series?.flatMap(series => series.games || []) || []
    )) || []
  ), [schedule?.playoffs?.rounds]);
  const games = useMemo(() => (
    isCupGame ? schedule?.nbaCup?.games || [] : isPlayoffGame ? playoffGames : schedule?.games || []
  ), [isCupGame, isPlayoffGame, playoffGames, schedule?.games, schedule?.nbaCup?.games]);
  const game = useMemo(() => games.find(item => item.id === gameId) || null, [gameId, games]);
  const sport = normalizeSport(league?.sport || game?.sport);
  const isBasketball = sport === 'nba';
  const homeTeam = teams.find(team => game?.homeTeamId && teamScheduleKeys(team).has(normalizeScheduleKey(game.homeTeamId)));
  const awayTeam = teams.find(team => game?.awayTeamId && teamScheduleKeys(team).has(normalizeScheduleKey(game.awayTeamId)));
  const homeAbbr = displayScheduleAbbr(homeTeam?.abbreviation || homeTeam?.teamId || game?.homeTeamId || '');
  const awayAbbr = displayScheduleAbbr(awayTeam?.abbreviation || awayTeam?.teamId || game?.awayTeamId || '');
  const homeLabel = homeTeam ? displayScheduleName(homeTeam) : displayScheduleName({ scheduleTeamId: game?.homeTeamId || 'Home' });
  const awayLabel = awayTeam ? displayScheduleName(awayTeam) : displayScheduleName({ scheduleTeamId: game?.awayTeamId || 'Away' });
  const liveTimeline = playableLiveTimeline({
    scheduleTimeline: game?.liveTimeline || null,
    storedTimeline: storedTimeline?.liveTimeline || null,
  });
  const hasLiveTimelineMarker = Boolean(game?.liveTimeline);
  const waitingForStoredTimeline = hasLiveTimelineMarker && !liveTimeline;
  const liveMode = storedTimeline?.liveMode || game?.liveMode;
  const elapsedMs = safeElapsedMs(game, liveTimeline, liveMode, nowMs, replayStartedAtMs);
  const current = liveTimeline ? currentTimelineEvent(liveTimeline, elapsedMs) : { event: null, index: -1 as const };
  const currentEvent = current.event;
  const visibleEvents = useMemo(() => (
    liveTimeline?.events?.filter(event => event.elapsedMs <= elapsedMs).slice(-8).reverse() || []
  ), [elapsedMs, liveTimeline?.events]);
  const livePlayerStats = useMemo(() => (
    liveTimeline ? livePlayerStatsAt(liveTimeline, elapsedMs) : []
  ), [elapsedMs, liveTimeline]);
  const displayedPeriods = scorePeriodsForSport(sport, liveTimeline?.periods?.length ? { periods: liveTimeline.periods } : game);
  const defaultPeriodLabel = displayedPeriods[0]?.label || periodLabelForSport(sport, { period: 1 });
  const arenaTheme = liveMode?.arenaTheme || game?.arenaTheme || buildArenaTheme({
    homeAbbr,
    currentYear: league?.currentYear,
    primaryColor: homeTeam?.primaryColor,
    secondaryColor: homeTeam?.secondaryColor,
  });
  const resultVisible = isLiveResultRevealed(game, nowMs);
  const homeScore = currentEvent?.homeScore ?? (resultVisible ? Number(game?.homeScore || 0) : 0);
  const awayScore = currentEvent?.awayScore ?? (resultVisible ? Number(game?.awayScore || 0) : 0);
  const competitionLabel = isCupGame ? 'NBA Cup' : isPlayoffGame ? 'Playoffs' : league?.name || 'Season';
  const resultCompetition = isCupGame ? 'nbaCup' : isPlayoffGame ? 'playoffs' : 'regular';
  const liveStatsByTeam = useMemo(() => ({
    away: livePlayerStats.filter(player => normalizeScheduleKey(player.teamId) === normalizeScheduleKey(game?.awayTeamId || '')).slice(0, 8),
    home: livePlayerStats.filter(player => normalizeScheduleKey(player.teamId) === normalizeScheduleKey(game?.homeTeamId || '')).slice(0, 8),
  }), [game?.awayTeamId, game?.homeTeamId, livePlayerStats]);
  const broadcastHomePlayers = useMemo(() => {
    const livePlayers = liveStatsByTeam.home.slice(0, 5).map(player => playerForCard(player, homeTeam));
    return livePlayers.length >= 5 ? livePlayers : (homeTeam?.players || []).slice(0, 5);
  }, [homeTeam, liveStatsByTeam.home]);
  const broadcastAwayPlayers = useMemo(() => {
    const livePlayers = liveStatsByTeam.away.slice(0, 5).map(player => playerForCard(player, awayTeam));
    return livePlayers.length >= 5 ? livePlayers : (awayTeam?.players || []).slice(0, 5);
  }, [awayTeam, liveStatsByTeam.away]);
  const broadcastActors = useMemo(() => buildBroadcastActorsForLineup({
    homeTeam: {
      teamId: game?.homeTeamId || homeTeam?.teamId || homeTeam?.id || 'home',
      abbreviation: homeAbbr,
      primaryColor: homeTeam?.primaryColor || arenaTheme.primary,
      secondaryColor: homeTeam?.secondaryColor || arenaTheme.secondary,
    },
    awayTeam: {
      teamId: game?.awayTeamId || awayTeam?.teamId || awayTeam?.id || 'away',
      abbreviation: awayAbbr,
      primaryColor: awayTeam?.primaryColor || '#5d76a9',
      secondaryColor: awayTeam?.secondaryColor || '#ffffff',
    },
    homePlayers: broadcastHomePlayers,
    awayPlayers: broadcastAwayPlayers,
  }), [
    arenaTheme.primary,
    arenaTheme.secondary,
    awayAbbr,
    awayTeam,
    broadcastAwayPlayers,
    broadcastHomePlayers,
    game?.awayTeamId,
    game?.homeTeamId,
    homeAbbr,
    homeTeam,
  ]);
  const elapsedAfterFinalMs = currentEvent?.eventType === 'final_buzzer'
    ? Math.max(0, elapsedMs - Number(currentEvent.elapsedMs || 0))
    : resultVisible
      ? Math.max(0, nowMs - Number(game?.finalAtMs || liveMode?.simulationEndsAtMs || nowMs))
      : 0;
  const starterMatchups = useMemo(() => starterMatchupsForTimeline(liveTimeline), [liveTimeline]);
  const matchupRows = starterMatchups.length > 0
    ? starterMatchups
    : fallbackMatchupsFromStats({ away: liveStatsByTeam.away.slice(0, 5), home: liveStatsByTeam.home.slice(0, 5), sport });
  const scoreboardBackground = translucentColor(arenaTheme.primary, '22', 'rgba(255,255,255,0.06)');
  const visualBoardState = useMemo(() => buildLiveVisualBoardState({
    event: currentEvent,
    homeTeamId: game?.homeTeamId || '',
    awayTeamId: game?.awayTeamId || '',
    homeAbbr,
    awayAbbr,
    homeCoachingLabel: game?.homeFirstHalfCoachingPresetName || game?.homeCoachingPresetName || 'Balanced',
    awayCoachingLabel: game?.awayFirstHalfCoachingPresetName || game?.awayCoachingPresetName || 'Balanced',
  }), [
    awayAbbr,
    currentEvent,
    game?.awayCoachingPresetName,
    game?.awayFirstHalfCoachingPresetName,
    game?.awayTeamId,
    game?.homeCoachingPresetName,
    game?.homeFirstHalfCoachingPresetName,
    game?.homeTeamId,
    homeAbbr,
  ]);
  const openPlayerCard = (player: { playerId?: string; name?: string; teamId?: string }) => {
    const sideTeam = normalizeScheduleKey(player.teamId || '') === normalizeScheduleKey(game?.awayTeamId || '') ? awayTeam : homeTeam;
    setSelectedPlayerCard({
      player: playerForCard(player, sideTeam),
      teamId: sideTeam?.id || '',
    });
  };

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator color="#00e58b" size="large" /></View>;
  }

  return (
    <View style={[styles.screen, { backgroundColor: '#050505' }]}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
            <Ionicons color="#ffffff" name="chevron-back" size={24} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>{competitionLabel}</Text>
            <Text style={styles.title}>Live Mode</Text>
          </View>
        </View>

        {!game ? (
          <Text style={styles.empty}>Live Mode is not available for this game.</Text>
        ) : (
          <>
            {!isBasketball ? (
            <View style={[styles.scoreboard, { borderColor: arenaTheme.scoreboardTint, backgroundColor: scoreboardBackground }]}>
              <View style={styles.teamBlock}>
                <View style={styles.logoDisc}>
                  <LiveTeamBadge abbr={awayAbbr} accent="#f1f1f1" />
                </View>
                <Text numberOfLines={1} style={styles.teamName}>{awayAbbr}</Text>
                <Text style={[styles.teamScore, { color: awayScore > homeScore ? '#ffffff' : '#b8b8b8' }]}>{numberText(awayScore)}</Text>
              </View>
              <View style={styles.scoreCenter}>
                <Text style={[styles.clock, { color: arenaTheme.text }]}>{clockText(currentEvent)}</Text>
                <Text style={styles.period}>{currentEvent?.eventType === 'final_buzzer' ? 'Final' : currentEvent?.periodLabel || defaultPeriodLabel}</Text>
              </View>
              <View style={styles.teamBlock}>
                <View style={[styles.logoDisc, { borderColor: arenaTheme.secondary }]}>
                  <LiveTeamBadge abbr={homeAbbr} accent={arenaTheme.secondary} textColor={arenaTheme.text} />
                </View>
                <Text numberOfLines={1} style={styles.teamName}>{homeAbbr}</Text>
                <Text style={[styles.teamScore, { color: homeScore >= awayScore ? arenaTheme.text : '#b8b8b8' }]}>{numberText(homeScore)}</Text>
              </View>
            </View>
            ) : null}

            {isBasketball ? (
              broadcastActors.length > 0 ? (
                <NbaBroadcastLiveMode
                  width={courtWidth}
                  event={currentEvent}
                  homeTeamId={game?.homeTeamId || ''}
                  awayTeamId={game?.awayTeamId || ''}
                  homeAbbr={homeAbbr}
                  awayAbbr={awayAbbr}
                  homeScore={homeScore}
                  awayScore={awayScore}
                  clock={clockText(currentEvent)}
                  period={currentEvent?.eventType === 'final_buzzer' ? 'Final' : currentEvent?.periodLabel || defaultPeriodLabel}
                  theme={arenaTheme}
                  era={league?.currentYear || league?.era}
                  actors={broadcastActors}
                  elapsedAfterFinalMs={elapsedAfterFinalMs}
                />
              ) : (
                <NbaLiveVisualBoard
                  width={courtWidth}
                  state={visualBoardState}
                  homeAbbr={homeAbbr}
                  awayAbbr={awayAbbr}
                  homeScore={homeScore}
                  awayScore={awayScore}
                  clock={clockText(currentEvent)}
                  period={currentEvent?.eventType === 'final_buzzer' ? 'Final' : currentEvent?.periodLabel || defaultPeriodLabel}
                  theme={arenaTheme}
                  era={league?.currentYear || league?.era}
                  isFinal={resultVisible || currentEvent?.eventType === 'final_buzzer'}
                />
              )
            ) : null}
            {isBasketball && waitingForStoredTimeline ? (
              <View style={styles.panel}>
                <ActivityIndicator color={arenaTheme.text} />
                <Text style={styles.emptySmall}>Loading detailed replay events...</Text>
              </View>
            ) : null}

            {resultVisible ? (
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>{sport === 'mlb' ? 'Inning Scores' : 'Quarter Scores'}</Text>
                <View style={styles.periodList}>
                  {displayedPeriods.map(period => (
                    <Text key={period.period} style={styles.periodLine}>
                      {period.label}: {awayAbbr} {period.away} - {homeAbbr} {period.home}
                    </Text>
                  ))}
                  <Text style={styles.finalLine}>Final: {awayAbbr} {game.awayScore ?? awayScore} - {homeAbbr} {game.homeScore ?? homeScore}</Text>
                </View>
              </View>
            ) : null}

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Event Feed</Text>
              {visibleEvents.length > 0 ? visibleEvents.map(event => (
                <View key={event.id} style={styles.feedRow}>
                  <View style={[styles.feedDot, { backgroundColor: normalizeScheduleKey(event.actingTeamId || '') === normalizeScheduleKey(game.homeTeamId) ? arenaTheme.primary : '#f1f1f1' }]} />
                  <View style={styles.feedCopy}>
                    <Text style={styles.feedMeta}>{event.periodLabel} · {clockText(event)}</Text>
                    <Text style={styles.feedText}>{displayScheduleEventText(event.text)}</Text>
                  </View>
                  <Text style={styles.feedScore}>{event.awayScore}-{event.homeScore}</Text>
                </View>
              )) : (
                <Text style={styles.emptySmall}>Waiting for the first stored timeline event.</Text>
              )}
            </View>

            <View style={styles.panel}>
              <View style={styles.panelHeaderRow}>
                <Text style={styles.panelTitle}>Matchups</Text>
                <TouchableOpacity onPress={() => setShowFullPlayerStats(value => !value)} style={[styles.smallOutlineButton, { borderColor: arenaTheme.secondary }]}>
                  <Text style={[styles.smallOutlineButtonText, { color: arenaTheme.text }]}>{showFullPlayerStats ? 'Hide' : 'See More Player Stats'}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.matchupHeader}>
                <Text numberOfLines={1} style={styles.matchupTeamLabel}>{awayLabel}</Text>
                <Text style={styles.matchupTeamVs}>vs</Text>
                <Text numberOfLines={1} style={[styles.matchupTeamLabel, styles.matchupTeamRight]}>{homeLabel}</Text>
              </View>
              {matchupRows.map(row => (
                <View key={row.position} style={styles.matchupRow}>
                  <View style={styles.matchupPlayer}>
                    <TouchableOpacity onPress={() => openPlayerCard(row.awayPlayer)} style={styles.playerTapArea}>
                      <Text numberOfLines={1} style={styles.matchupName}>{row.awayPlayer.name}</Text>
                      <Text numberOfLines={1} style={styles.matchupStats}>{statsTextForPlayer(row.awayPlayer.playerId, livePlayerStats, sport)}</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.matchupPosition, { color: arenaTheme.text, borderColor: arenaTheme.secondary }]}>{row.position}</Text>
                  <View style={[styles.matchupPlayer, styles.matchupPlayerRight]}>
                    <TouchableOpacity onPress={() => openPlayerCard(row.homePlayer)} style={[styles.playerTapArea, styles.playerTapAreaRight]}>
                      <Text numberOfLines={1} style={styles.matchupName}>{row.homePlayer.name}</Text>
                      <Text numberOfLines={1} style={styles.matchupStats}>{statsTextForPlayer(row.homePlayer.playerId, livePlayerStats, sport)}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              {showFullPlayerStats ? (
                <View style={styles.fullStatsWrap}>
                  {([
                    { key: 'away', label: awayLabel, players: liveStatsByTeam.away },
                    { key: 'home', label: homeLabel, players: liveStatsByTeam.home },
                  ] as const).map(group => (
                    <View key={group.key} style={styles.statTeamGroup}>
                      <Text style={styles.statGroupTitle}>{group.label}</Text>
                      {group.players.map(player => (
                        <TouchableOpacity key={player.playerId} onPress={() => openPlayerCard(player)} style={styles.statRow}>
                          <View style={styles.statNameBlock}>
                            <Text numberOfLines={1} style={styles.statName}>{player.name}</Text>
                          </View>
                          {statsTextForPlayer(player.playerId, livePlayerStats, sport).split(' ').reduce<string[]>((chunks, value, index, values) => {
                            if (index % 2 === 0) chunks.push(`${value} ${values[index + 1] || ''}`.trim());
                            return chunks;
                          }, []).slice(0, 5).map((line, index) => (
                            <Text key={`${player.playerId}-${line}`} style={[styles.statValue, index === 0 && { color: arenaTheme.text }]}>{line}</Text>
                          ))}
                        </TouchableOpacity>
                      ))}
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            {resultVisible ? (
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/screens/season/game-result', params: { leagueId, gameId, competition: resultCompetition } })}
                style={[styles.resultButton, { backgroundColor: arenaTheme.text }]}
              >
                <Ionicons color="#050505" name="trophy" size={17} />
                <Text style={styles.resultButtonText}>Final Result</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.lockedResult}>
                <Text style={styles.lockedResultText}>Final result unlocks at the buzzer</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
      <PlayerCard
        player={selectedPlayerCard?.player || null}
        era={league?.era || league?.currentYear || 'current'}
        sport={sport}
        leagueId={leagueId}
        teamId={selectedPlayerCard?.teamId || ''}
        leagueDate={leagueDateFromRecord(league)}
        visible={!!selectedPlayerCard}
        onClose={() => setSelectedPlayerCard(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#050505' },
  content: { padding: 18, paddingTop: 58, paddingBottom: 40, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconButton: { width: 42, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#151515' },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: '#777', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  title: { color: '#fff', fontSize: 28, fontWeight: '900' },
  scoreboard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, padding: 14 },
  teamBlock: { flex: 1, minWidth: 0, alignItems: 'center', gap: 7 },
  logoDisc: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: '#181818', borderWidth: 1, borderColor: '#2a2a2a' },
  liveTeamBadge: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#101010', paddingHorizontal: 4 },
  liveTeamBadgeText: { fontSize: 13, fontWeight: '900', letterSpacing: 0, maxWidth: '100%' },
  teamName: { color: '#fff', fontSize: 12, fontWeight: '900', maxWidth: '100%' },
  teamScore: { fontSize: 30, fontWeight: '900', fontVariant: ['tabular-nums'] },
  scoreCenter: { width: 86, alignItems: 'center', gap: 4 },
  clock: { fontSize: 20, fontWeight: '900', fontVariant: ['tabular-nums'] },
  period: { color: '#999', fontSize: 11, fontWeight: '900' },
  courtWrap: { borderRadius: 8, borderWidth: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  crowdGlow: { position: 'absolute', opacity: 0.45 },
  court: { borderRadius: 8, borderWidth: 2, backgroundColor: '#b88345', overflow: 'hidden' },
  paint: { position: 'absolute', borderWidth: 2, opacity: 0.82 },
  leftPaint: { left: 0, borderLeftWidth: 0 },
  rightPaint: { right: 0, borderRightWidth: 0 },
  centerCircle: { position: 'absolute', borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.16)' },
  centerText: { fontSize: 14, fontWeight: '900' },
  midLine: { position: 'absolute', top: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.5)' },
  playerToken: { position: 'absolute', width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  activePlayerToken: { borderWidth: 3 },
  playerTokenText: { fontSize: 10, fontWeight: '900' },
  ballToken: { position: 'absolute', left: 0, top: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: '#f97316', borderWidth: 1, borderColor: '#fff1d6' },
  panel: { backgroundColor: '#101010', borderRadius: 8, borderWidth: 1, borderColor: '#202020', padding: 14, gap: 10 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  panelHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  panelTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
  panelPill: { borderWidth: 1, borderRadius: 7, paddingHorizontal: 9, paddingVertical: 5, fontSize: 10, fontWeight: '900' },
  smallOutlineButton: { minHeight: 34, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  smallOutlineButtonText: { fontSize: 11, fontWeight: '900' },
  eventText: { color: '#ddd', fontSize: 15, fontWeight: '800', lineHeight: 21 },
  momentumRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  momentumLabel: { color: '#777', fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  momentumValue: { fontSize: 13, fontWeight: '900' },
  periodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  periodCell: { width: '23%', minWidth: 72, borderRadius: 7, borderWidth: 1, borderColor: '#262626', backgroundColor: '#080808', padding: 9, gap: 3 },
  periodLabel: { color: '#777', fontSize: 10, fontWeight: '900' },
  periodScore: { color: '#fff', fontSize: 11, fontWeight: '800' },
  periodList: { gap: 7 },
  periodLine: { color: '#ddd', fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  finalLine: { color: '#fff', fontSize: 14, fontWeight: '900', fontVariant: ['tabular-nums'], marginTop: 3 },
  feedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#1b1b1b' },
  feedDot: { width: 8, height: 8, borderRadius: 4 },
  feedCopy: { flex: 1, minWidth: 0 },
  feedMeta: { color: '#777', fontSize: 10, fontWeight: '900' },
  feedText: { color: '#ddd', fontSize: 12, fontWeight: '800', marginTop: 2 },
  feedScore: { color: '#fff', fontSize: 12, fontWeight: '900', fontVariant: ['tabular-nums'] },
  insightRow: { flexDirection: 'row', gap: 10, borderTopWidth: 1, borderTopColor: '#1b1b1b', paddingTop: 10 },
  insightRail: { width: 4, borderRadius: 2 },
  insightCopy: { flex: 1, minWidth: 0, gap: 2 },
  insightMeta: { color: '#777', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  insightTitle: { color: '#fff', fontSize: 13, fontWeight: '900' },
  insightText: { color: '#cfcfcf', fontSize: 12, fontWeight: '800', lineHeight: 17 },
  matchupHeader: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: '#1b1b1b', paddingTop: 10 },
  matchupTeamLabel: { flex: 1, minWidth: 0, color: '#888', fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  matchupTeamRight: { textAlign: 'right' },
  matchupTeamVs: { width: 34, textAlign: 'center', color: '#555', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  matchupRow: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: '#1b1b1b', paddingVertical: 10 },
  matchupPlayer: { flex: 1, minWidth: 0 },
  matchupPlayerRight: { alignItems: 'flex-end' },
  playerTapArea: { minHeight: 36, justifyContent: 'center' },
  playerTapAreaRight: { alignItems: 'flex-end' },
  matchupName: { color: '#fff', fontSize: 12, fontWeight: '900' },
  matchupStats: { color: '#bdbdbd', fontSize: 10, fontWeight: '900', marginTop: 3, fontVariant: ['tabular-nums'] },
  matchupPosition: { width: 34, minHeight: 28, borderRadius: 7, borderWidth: 1, textAlign: 'center', textAlignVertical: 'center', fontSize: 10, fontWeight: '900', paddingTop: 6 },
  fullStatsWrap: { gap: 10, borderTopWidth: 1, borderTopColor: '#1b1b1b', paddingTop: 10 },
  statTeamGroup: { gap: 2 },
  statGroupTitle: { color: '#fff', fontSize: 13, fontWeight: '900', marginTop: 2 },
  statRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: '#1b1b1b', paddingVertical: 8 },
  statNameBlock: { flex: 1, minWidth: 0 },
  statName: { color: '#fff', fontSize: 12, fontWeight: '900' },
  statTeam: { color: '#777', fontSize: 10, fontWeight: '900', marginTop: 2 },
  statValue: { color: '#cfcfcf', fontSize: 11, fontWeight: '900', minWidth: 42, textAlign: 'right', fontVariant: ['tabular-nums'] },
  resultButton: { minHeight: 46, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  resultButtonText: { color: '#050505', fontSize: 13, fontWeight: '900' },
  lockedResult: { minHeight: 46, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#262626', backgroundColor: '#101010' },
  lockedResultText: { color: '#aaa', fontSize: 13, fontWeight: '900' },
  empty: { color: '#aaa', fontSize: 14, lineHeight: 20 },
  emptySmall: { color: '#777', fontSize: 13, lineHeight: 19 },
});
