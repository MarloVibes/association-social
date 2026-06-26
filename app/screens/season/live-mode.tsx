import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import SportTeamLogo from '@/components/SportTeamLogo';
import { db } from '@/constants/firebase';
import { buildArenaTheme, type ArenaTheme } from '@/domain/nba/arenaTheme';
import { currentTimelineEvent, type LiveTimeline, type LiveTimelineEvent } from '@/domain/nba/liveTimeline';
import type { NbaScheduleGame } from '@/domain/nba/schedule';
import { normalizeScheduleKey, teamScheduleKeys } from '@/domain/nba/scheduleView';

type Team = {
  id: string;
  teamId?: string;
  name?: string;
  abbreviation?: string;
  primaryColor?: string | null;
  secondaryColor?: string | null;
};

type LiveGame = NbaScheduleGame & {
  competition?: 'nbaCup' | 'playoffs';
  groupId?: string;
  stage?: string;
  round?: string;
  seriesId?: string;
  playoffGame?: number;
  quarters?: { quarter: number; home: number; away: number }[];
  liveTimeline?: LiveTimeline;
  liveMode?: {
    status?: string;
    simulationStartedAtMs?: number;
    simulationEndsAtMs?: number;
    arenaTheme?: ArenaTheme;
  };
  arenaTheme?: ArenaTheme;
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

const COURT_ASPECT_RATIO = 5 / 3;
const SCREEN_HORIZONTAL_PADDING = 36;
const PLAYER_TOKEN_SIZE = 28;
const BALL_TOKEN_SIZE = 14;

function translucentColor(value: string | null | undefined, alpha: string, fallback: string) {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) && /^[0-9a-f]{2}$/i.test(alpha) ? `${color}${alpha}` : fallback;
}

function numberText(value: unknown) {
  return Number.isFinite(Number(value)) ? String(Number(value)) : '0';
}

function fallbackPeriodLabel(period: number) {
  if (period <= 4) return `Q${period}`;
  const overtimeNumber = period - 4;
  return overtimeNumber === 1 ? 'OT' : `${overtimeNumber}OT`;
}

function clockText(event: LiveTimelineEvent | null) {
  if (!event) return '12:00';
  const minutes = Math.floor(Math.max(0, event.clockSeconds) / 60);
  const seconds = Math.max(0, event.clockSeconds) % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function eventSide(event: LiveTimelineEvent | null, game: LiveGame | null) {
  if (!event || !game || !event.actingTeamId) return 'LIVE';
  if (normalizeScheduleKey(event.actingTeamId) === normalizeScheduleKey(game.homeTeamId)) return 'HOME';
  if (normalizeScheduleKey(event.actingTeamId) === normalizeScheduleKey(game.awayTeamId)) return 'AWAY';
  return 'LIVE';
}

function safeElapsedMs(game: LiveGame | null, nowMs: number) {
  if (!game?.liveTimeline) return 0;
  const startedAt = Number(game.liveMode?.simulationStartedAtMs || 0);
  const rawElapsed = startedAt > 0 ? nowMs - startedAt : game.liveTimeline.revealDurationMs;
  return Math.max(0, Math.min(rawElapsed, game.liveTimeline.revealDurationMs || rawElapsed));
}

export default function LiveModeScreen() {
  const { leagueId, gameId, competition } = useLocalSearchParams<{ leagueId: string; gameId: string; competition?: string }>();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const [league, setLeague] = useState<any>(null);
  const [schedule, setSchedule] = useState<ScheduleDoc | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(Date.now());
  const tokenX = useSharedValue(0);
  const tokenY = useSharedValue(0);
  const ballX = useSharedValue(0);
  const ballY = useSharedValue(0);
  const availableCourtWidth = Math.max(120, windowWidth - SCREEN_HORIZONTAL_PADDING);
  const courtWidth = Math.min(availableCourtWidth, 420);
  const courtHeight = Math.round(courtWidth / COURT_ASPECT_RATIO);

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
  const homeTeam = teams.find(team => game?.homeTeamId && teamScheduleKeys(team).has(normalizeScheduleKey(game.homeTeamId)));
  const awayTeam = teams.find(team => game?.awayTeamId && teamScheduleKeys(team).has(normalizeScheduleKey(game.awayTeamId)));
  const homeAbbr = normalizeScheduleKey(homeTeam?.abbreviation || homeTeam?.teamId || game?.homeTeamId || '');
  const awayAbbr = normalizeScheduleKey(awayTeam?.abbreviation || awayTeam?.teamId || game?.awayTeamId || '');
  const homeLabel = homeTeam?.abbreviation || homeTeam?.name || game?.homeTeamId || 'Home';
  const awayLabel = awayTeam?.abbreviation || awayTeam?.name || game?.awayTeamId || 'Away';
  const liveTimeline = game?.liveTimeline || null;
  const elapsedMs = safeElapsedMs(game, nowMs);
  const current = liveTimeline ? currentTimelineEvent(liveTimeline, elapsedMs) : { event: null, index: -1 as const };
  const currentEvent = current.event;
  const visibleEvents = useMemo(() => (
    liveTimeline?.events.filter(event => event.elapsedMs <= elapsedMs).slice(-8).reverse() || []
  ), [elapsedMs, liveTimeline?.events]);
  const displayedPeriods = liveTimeline?.periods?.length
    ? liveTimeline.periods
    : (game?.quarters || []).map(quarter => ({
      period: quarter.quarter,
      label: fallbackPeriodLabel(quarter.quarter),
      home: quarter.home,
      away: quarter.away,
    }));
  const arenaTheme = game?.liveMode?.arenaTheme || game?.arenaTheme || buildArenaTheme({
    homeAbbr,
    currentYear: league?.currentYear,
    primaryColor: homeTeam?.primaryColor,
    secondaryColor: homeTeam?.secondaryColor,
  });
  const homeScore = currentEvent?.homeScore ?? game?.homeScore ?? liveTimeline?.homeScore ?? 0;
  const awayScore = currentEvent?.awayScore ?? game?.awayScore ?? liveTimeline?.awayScore ?? 0;
  const competitionLabel = isCupGame ? 'NBA Cup' : isPlayoffGame ? 'Playoffs' : league?.name || 'Season';
  const momentumText = currentEvent
    ? currentEvent.momentum === 0
      ? 'Even'
      : currentEvent.momentum > 0
        ? `${homeLabel} +${currentEvent.momentum}`
        : `${awayLabel} +${Math.abs(currentEvent.momentum)}`
    : 'Opening tip';
  const resultCompetition = isCupGame ? 'nbaCup' : isPlayoffGame ? 'playoffs' : 'regular';
  const scoreboardBackground = translucentColor(arenaTheme.primary, '22', 'rgba(255,255,255,0.06)');
  const courtBackground = translucentColor(arenaTheme.primary, '33', 'rgba(255,255,255,0.08)');
  const crowdGlowBackground = translucentColor(arenaTheme.crowdGlow, '44', 'rgba(255,255,255,0.12)');

  useEffect(() => {
    const eventX = currentEvent ? currentEvent.x : 50;
    const eventY = currentEvent ? currentEvent.y : 50;
    const nextX = (Math.max(0, Math.min(100, eventX)) / 100) * courtWidth;
    const nextY = (Math.max(0, Math.min(100, eventY)) / 100) * courtHeight;
    tokenX.value = withTiming(nextX, { duration: 650 });
    tokenY.value = withTiming(nextY, { duration: 650 });
    ballX.value = withTiming(Math.max(BALL_TOKEN_SIZE, Math.min(courtWidth - BALL_TOKEN_SIZE, nextX + 18)), { duration: 760 });
    ballY.value = withTiming(Math.max(BALL_TOKEN_SIZE, Math.min(courtHeight - BALL_TOKEN_SIZE, nextY - 14)), { duration: 760 });
  }, [ballX, ballY, courtHeight, courtWidth, currentEvent, tokenX, tokenY]);

  const tokenStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tokenX.value - PLAYER_TOKEN_SIZE / 2 },
      { translateY: tokenY.value - PLAYER_TOKEN_SIZE / 2 },
    ],
  }));
  const ballStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: ballX.value - BALL_TOKEN_SIZE / 2 },
      { translateY: ballY.value - BALL_TOKEN_SIZE / 2 },
    ],
  }));

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
            <View style={[styles.scoreboard, { borderColor: arenaTheme.scoreboardTint, backgroundColor: scoreboardBackground }]}>
              <View style={styles.teamBlock}>
                <View style={styles.logoDisc}>
                  <SportTeamLogo sport="nba" abbr={awayAbbr} era={league?.currentYear} style={styles.logo} fontSize={10} />
                </View>
                <Text numberOfLines={1} style={styles.teamName}>{awayLabel}</Text>
                <Text style={[styles.teamScore, { color: awayScore > homeScore ? '#ffffff' : '#b8b8b8' }]}>{numberText(awayScore)}</Text>
              </View>
              <View style={styles.scoreCenter}>
                <Text style={[styles.clock, { color: arenaTheme.text }]}>{clockText(currentEvent)}</Text>
                <Text style={styles.period}>{currentEvent?.periodLabel || displayedPeriods[0]?.label || 'Q1'}</Text>
              </View>
              <View style={styles.teamBlock}>
                <View style={[styles.logoDisc, { borderColor: arenaTheme.secondary }]}>
                  <SportTeamLogo sport="nba" abbr={homeAbbr} era={league?.currentYear} style={styles.logo} fontSize={10} />
                </View>
                <Text numberOfLines={1} style={styles.teamName}>{homeLabel}</Text>
                <Text style={[styles.teamScore, { color: homeScore >= awayScore ? arenaTheme.text : '#b8b8b8' }]}>{numberText(homeScore)}</Text>
              </View>
            </View>

            <View style={[styles.courtWrap, { borderColor: arenaTheme.sidelineColor, backgroundColor: courtBackground, height: courtHeight + 36 }]}>
              <View style={[styles.crowdGlow, { backgroundColor: crowdGlowBackground, width: courtWidth * 0.82, height: courtWidth * 0.82, borderRadius: courtWidth * 0.41 }]} />
              <View style={[styles.court, { width: courtWidth, height: courtHeight, borderColor: arenaTheme.sidelineColor }]}>
                <View style={[styles.paint, styles.leftPaint, { top: courtHeight * 0.25, width: courtWidth * 0.17, height: courtHeight * 0.5, borderColor: arenaTheme.laneColor }]} />
                <View style={[styles.paint, styles.rightPaint, { top: courtHeight * 0.25, width: courtWidth * 0.17, height: courtHeight * 0.5, borderColor: arenaTheme.laneColor }]} />
                <View style={[styles.centerCircle, { left: (courtWidth - courtWidth * 0.24) / 2, top: (courtHeight - courtWidth * 0.24) / 2, width: courtWidth * 0.24, height: courtWidth * 0.24, borderRadius: courtWidth * 0.12, borderColor: arenaTheme.secondary }]}>
                  <Text style={[styles.centerText, { color: arenaTheme.text }]}>{arenaTheme.centerText}</Text>
                </View>
                <View style={[styles.midLine, { left: courtWidth / 2, height: courtHeight }]} />
                <Animated.View style={[styles.playerToken, { backgroundColor: arenaTheme.primary, borderColor: arenaTheme.text }, tokenStyle]} />
                <Animated.View style={[styles.ballToken, ballStyle]} />
              </View>
            </View>

            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <Text style={styles.panelTitle}>Possession</Text>
                <Text style={[styles.panelPill, { color: arenaTheme.text, borderColor: arenaTheme.secondary }]}>{eventSide(currentEvent, game)}</Text>
              </View>
              <Text style={styles.eventText}>{currentEvent?.text || 'Live timeline is loading.'}</Text>
              <View style={styles.momentumRow}>
                <Text style={styles.momentumLabel}>Momentum</Text>
                <Text style={[styles.momentumValue, { color: arenaTheme.text }]}>{momentumText}</Text>
              </View>
            </View>

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Period Scoring</Text>
              <View style={styles.periodGrid}>
                {displayedPeriods.map(period => (
                  <View key={period.period} style={styles.periodCell}>
                    <Text style={styles.periodLabel}>{period.label}</Text>
                    <Text style={styles.periodScore}>{awayLabel} {period.away}</Text>
                    <Text style={styles.periodScore}>{homeLabel} {period.home}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Event Feed</Text>
              {visibleEvents.length > 0 ? visibleEvents.map(event => (
                <View key={event.id} style={styles.feedRow}>
                  <View style={[styles.feedDot, { backgroundColor: event.actingTeamId === game.homeTeamId ? arenaTheme.primary : '#f1f1f1' }]} />
                  <View style={styles.feedCopy}>
                    <Text style={styles.feedMeta}>{event.periodLabel} · {clockText(event)}</Text>
                    <Text style={styles.feedText}>{event.text}</Text>
                  </View>
                  <Text style={styles.feedScore}>{event.awayScore}-{event.homeScore}</Text>
                </View>
              )) : (
                <Text style={styles.emptySmall}>Waiting for the first stored timeline event.</Text>
              )}
            </View>

            <TouchableOpacity
              onPress={() => router.push({ pathname: '/screens/season/game-result', params: { leagueId, gameId, competition: resultCompetition } })}
              style={[styles.resultButton, { backgroundColor: arenaTheme.text }]}
            >
              <Ionicons color="#050505" name="trophy" size={17} />
              <Text style={styles.resultButtonText}>Final Result</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
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
  logo: { width: 44, height: 44 },
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
  playerToken: { position: 'absolute', left: 0, top: 0, width: 28, height: 28, borderRadius: 14, borderWidth: 2 },
  ballToken: { position: 'absolute', left: 0, top: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: '#f97316', borderWidth: 1, borderColor: '#fff1d6' },
  panel: { backgroundColor: '#101010', borderRadius: 8, borderWidth: 1, borderColor: '#202020', padding: 14, gap: 10 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  panelTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
  panelPill: { borderWidth: 1, borderRadius: 7, paddingHorizontal: 9, paddingVertical: 5, fontSize: 10, fontWeight: '900' },
  eventText: { color: '#ddd', fontSize: 15, fontWeight: '800', lineHeight: 21 },
  momentumRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  momentumLabel: { color: '#777', fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  momentumValue: { fontSize: 13, fontWeight: '900' },
  periodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  periodCell: { width: '23%', minWidth: 72, borderRadius: 7, borderWidth: 1, borderColor: '#262626', backgroundColor: '#080808', padding: 9, gap: 3 },
  periodLabel: { color: '#777', fontSize: 10, fontWeight: '900' },
  periodScore: { color: '#fff', fontSize: 11, fontWeight: '800' },
  feedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#1b1b1b' },
  feedDot: { width: 8, height: 8, borderRadius: 4 },
  feedCopy: { flex: 1, minWidth: 0 },
  feedMeta: { color: '#777', fontSize: 10, fontWeight: '900' },
  feedText: { color: '#ddd', fontSize: 12, fontWeight: '800', marginTop: 2 },
  feedScore: { color: '#fff', fontSize: 12, fontWeight: '900', fontVariant: ['tabular-nums'] },
  resultButton: { minHeight: 46, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  resultButtonText: { color: '#050505', fontSize: 13, fontWeight: '900' },
  empty: { color: '#aaa', fontSize: 14, lineHeight: 20 },
  emptySmall: { color: '#777', fontSize: 13, lineHeight: 19 },
});
