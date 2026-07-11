import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import SportTeamLogo from '@/components/SportTeamLogo';
import { auth, db, functions } from '@/constants/firebase';
import type { NbaScheduleGame } from '@/domain/nba/schedule';
import { displayScheduleAbbr, displayScheduleName, gameMatchesMyTeam, isLiveResultRevealed, liveScheduleScore, normalizeScheduleKey, teamScheduleKeys, visibleScheduleGames, type ScheduleViewMode } from '@/domain/nba/scheduleView';

type CalendarViewMode = ScheduleViewMode | 'cup';
type CalendarGame = NbaScheduleGame & {
  competition?: 'nbaCup' | 'playoffs';
  groupId?: string;
  stage?: string;
  liveTimeline?: unknown;
};

type Team = {
  id: string;
  teamId?: string;
  name?: string;
  abbreviation?: string;
  gmId?: string;
};

type ScheduleDoc = {
  games?: CalendarGame[];
  gamesPerTeam?: number;
  locked?: boolean;
  seed?: string;
  nbaCup?: {
    enabled?: boolean;
    name?: string;
    games?: CalendarGame[];
    groups?: {
      id: string;
      teamIds: string[];
    }[];
    championTeamId?: string | null;
    championTeamName?: string | null;
    championTeamAbbr?: string | null;
  } | null;
  participants?: {
    scheduleTeamId?: string;
    sourceTeamDocId?: string | null;
    gmId?: string | null;
    abbreviation?: string;
    name?: string;
  }[];
};

type TeamPresentation = {
  label: string;
  abbr: string;
};

type CalendarSectionRow = {
  id: string;
  games: CalendarGame[];
};

type CalendarSection = {
  title: string;
  gameRange: string;
  data: CalendarSectionRow[];
};

function cupSectionTitle(game: CalendarGame) {
  if (!game.stage || game.stage === 'group') return game.groupId || 'Group Play';
  if (game.stage === 'quarterfinal') return 'Quarterfinals';
  if (game.stage === 'semifinal') return 'Semifinals';
  if (game.stage === 'final') return 'NBA Cup Final';
  return 'NBA Cup';
}

function cupSectionOrder(title: string) {
  if (title.startsWith('Group ')) return title.charCodeAt(title.length - 1) - 64;
  if (title === 'Quarterfinals') return 20;
  if (title === 'Semifinals') return 30;
  if (title === 'NBA Cup Final') return 40;
  return 50;
}

function formatGameRange(games: CalendarGame[]) {
  const sequences = games.map(game => game.sequence).sort((a, b) => a - b);
  const first = sequences[0];
  const last = sequences[sequences.length - 1];
  if (!first) return '';
  return first === last ? `Game ${first}` : `Games ${first}-${last}`;
}

function formatFinalScore(game: CalendarGame) {
  if (game.status !== 'final' || typeof game.awayScore !== 'number' || typeof game.homeScore !== 'number') return '';
  return `${game.awayScore}-${game.homeScore}`;
}

function sectionRowId(prefix: string, value: string | number) {
  return `${prefix}-${String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function normalizeSport(value: unknown): 'nba' | 'madden' | 'mlb' {
  const sport = String(value || 'nba').toLowerCase();
  if (sport === 'nfl' || sport === 'madden') return 'madden';
  if (sport === 'mlb') return 'mlb';
  return 'nba';
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default function CalendarScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const router = useRouter();
  const uid = auth.currentUser?.uid;
  const [league, setLeague] = useState<any>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [schedule, setSchedule] = useState<ScheduleDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [advancingCup, setAdvancingCup] = useState(false);
  const [simmingSeason, setSimmingSeason] = useState(false);
  const [seasonSimProgress, setSeasonSimProgress] = useState<{ finalGames: number; totalGames: number; remainingGames: number } | null>(null);
  const [autoFollowSeasonSim, setAutoFollowSeasonSim] = useState(false);
  const [viewMode, setViewMode] = useState<CalendarViewMode>('mine');
  const [nowMs, setNowMs] = useState(Date.now());
  const scheduleListRef = useRef<SectionList<CalendarSectionRow, CalendarSection> | null>(null);
  const cancelSeasonSimRef = useRef(false);

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
      unsubscribeSchedule = onSnapshot(
        doc(db, 'leagues', leagueId, 'schedules', scheduleId),
        scheduleSnapshot => {
          setSchedule(scheduleSnapshot.exists() ? scheduleSnapshot.data() as ScheduleDoc : null);
          setLoading(false);
        },
        error => {
          console.warn('Schedule calendar unavailable:', error);
          setSchedule(null);
          setLoading(false);
        },
      );
    }, err => {
      console.warn('League calendar unavailable:', err);
      setLoading(false);
    });
    const unsubscribeTeams = onSnapshot(collection(db, 'leagues', leagueId, 'teams'), snapshot => {
      setTeams(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as Team)));
    }, err => {
      console.warn('League teams unavailable for calendar:', err);
    });
    return () => {
      unsubscribeLeague();
      if (unsubscribeSchedule) unsubscribeSchedule();
      unsubscribeTeams();
    };
  }, [leagueId]);

  const sport = normalizeSport(league?.sport);
  const supportsCup = sport === 'nba';
  const myTeam = teams.find(team => team.gmId === uid);
  const isLeagueAdmin = Boolean(
    uid
    && league
    && (
      league.commissionerId === uid
      || (league.coCommissioners || []).includes(uid)
    ),
  );
  const teamNames = useMemo(() => {
    const names = new Map<string, string>();
    (schedule?.participants || []).forEach((team) => {
      const label = displayScheduleName(team);
      [team.scheduleTeamId, team.abbreviation].filter(Boolean).forEach(key => {
        names.set(String(key), label);
        names.set(normalizeScheduleKey(String(key)), label);
      });
    });
    teams.forEach((team) => {
      const label = displayScheduleName(team);
      [team.id, team.teamId, team.abbreviation].filter(Boolean).forEach(key => {
        names.set(String(key), label);
        names.set(normalizeScheduleKey(String(key)), label);
      });
    });
    return names;
  }, [schedule?.participants, teams]);
  const teamPresentations = useMemo(() => {
    const presentations = new Map<string, TeamPresentation>();
    const register = (keys: (string | undefined)[], presentation: TeamPresentation) => {
      keys.filter(Boolean).forEach((key) => {
        presentations.set(String(key), presentation);
        presentations.set(normalizeScheduleKey(String(key)), presentation);
      });
    };
    (schedule?.participants || []).forEach((team) => {
      const abbr = displayScheduleAbbr(team.abbreviation || team.scheduleTeamId);
      const label = displayScheduleName(team);
      register([team.scheduleTeamId, team.abbreviation], { label, abbr });
    });
    teams.forEach((team) => {
      const abbr = displayScheduleAbbr(team.abbreviation || team.teamId || team.id);
      const label = displayScheduleName(team);
      register([team.id, team.teamId, team.abbreviation], { label, abbr });
    });
    return presentations;
  }, [schedule?.participants, teams]);
  const myTeamIds = useMemo(() => teamScheduleKeys(myTeam), [myTeam]);
  const allGames = useMemo(() => [...(schedule?.games || [])].sort((a, b) => a.sequence - b.sequence), [schedule?.games]);
  const cupGames = useMemo(() => supportsCup ? [...(schedule?.nbaCup?.games || [])].sort((a, b) => a.sequence - b.sequence) : [], [schedule?.nbaCup?.games, supportsCup]);
  const hasNbaCup = supportsCup && cupGames.length > 0 && schedule?.nbaCup?.enabled !== false;
  const myGames = useMemo(() => allGames.filter(game => gameMatchesMyTeam(game, myTeam, uid)), [allGames, myTeam, uid]);
  const myCupGames = useMemo(() => cupGames.filter(game => gameMatchesMyTeam(game, myTeam, uid)), [cupGames, myTeam, uid]);
  const selectedViewMode: CalendarViewMode = viewMode === 'cup' && hasNbaCup ? 'cup' : myTeam ? viewMode : 'league';
  const games = useMemo(() => {
    if (selectedViewMode === 'cup') return cupGames;
    return visibleScheduleGames(allGames, selectedViewMode, myTeam, uid);
  }, [allGames, cupGames, myTeam, selectedViewMode, uid]);
  const sections = useMemo<CalendarSection[]>(() => {
    if (selectedViewMode === 'cup') {
      const byGroup = new Map<string, CalendarGame[]>();
      games.forEach((game) => {
        const group = cupSectionTitle(game);
        byGroup.set(group, [...(byGroup.get(group) || []), game]);
      });
      return [...byGroup.entries()]
        .sort(([a], [b]) => cupSectionOrder(a) - cupSectionOrder(b) || a.localeCompare(b))
        .map(([group, groupGames]) => {
          const sortedGames = [...groupGames].sort((a, b) => a.sequence - b.sequence);
          return {
            title: group,
            gameRange: formatGameRange(sortedGames),
            data: [{ id: sectionRowId('cup', group), games: sortedGames }],
          };
        });
    }
    const byWeek = new Map<number, NbaScheduleGame[]>();
    games.forEach((game) => {
      const week = Number(game.week || 1);
      byWeek.set(week, [...(byWeek.get(week) || []), game]);
    });
    return [...byWeek.entries()]
      .sort(([a], [b]) => a - b)
      .map(([week, weekGames]) => {
        const sortedGames = [...weekGames].sort((a, b) => a.sequence - b.sequence);
        return {
          title: `Week ${week}`,
          gameRange: formatGameRange(sortedGames),
          data: [{ id: sectionRowId('week', week), games: sortedGames }],
        };
      });
  }, [games, selectedViewMode]);
  const nextUnfinishedGame = useMemo(() => allGames.find(game => game.status !== 'final') || null, [allGames]);

  const scrollToNextUnfinishedGame = useCallback((animated = true, attempt = 0) => {
    if (!nextUnfinishedGame) return;
    const sectionIndex = sections.findIndex(section => section.title === `Week ${nextUnfinishedGame.week || 1}`);
    if (sectionIndex < 0) return;
    requestAnimationFrame(() => {
      try {
        scheduleListRef.current?.scrollToLocation({
          sectionIndex,
          itemIndex: 0,
          viewPosition: 0.18,
          animated,
        });
      } catch {
        if (attempt < 2) {
          setTimeout(() => scrollToNextUnfinishedGame(animated, attempt + 1), 180);
        }
      }
    });
  }, [nextUnfinishedGame, sections]);

  useEffect(() => {
    if (!simmingSeason || !autoFollowSeasonSim || selectedViewMode !== 'league') return;
    scrollToNextUnfinishedGame(true);
  }, [autoFollowSeasonSim, scrollToNextUnfinishedGame, selectedViewMode, simmingSeason]);

  const toggleSeasonSimFollow = () => {
    if (autoFollowSeasonSim) {
      setAutoFollowSeasonSim(false);
      return;
    }
    setViewMode('league');
    setAutoFollowSeasonSim(true);
    setTimeout(() => scrollToNextUnfinishedGame(true), 80);
  };

  const advanceCup = async () => {
    if (!leagueId || !schedule?.nbaCup || !isLeagueAdmin) return;
    setAdvancingCup(true);
    try {
      const fn = httpsCallable(functions, 'advanceNbaCup');
      await fn({ leagueId });
    } catch (error: any) {
      Alert.alert('Cup not advanced', error.message || 'Finish the current Cup stage first.');
    } finally {
      setAdvancingCup(false);
    }
  };

  const runSeasonSimContinuously = async () => {
    if (!leagueId || !isLeagueAdmin || simmingSeason) return;
    const maxSteps = allGames.filter(game => game.status !== 'final').length;
    if (maxSteps === 0) {
      Alert.alert('Season complete', 'Every scheduled game is already final.');
      return;
    }
    cancelSeasonSimRef.current = false;
    setViewMode('league');
    setAutoFollowSeasonSim(true);
    setSeasonSimProgress(null);
    setSimmingSeason(true);
    try {
      const simBatch = httpsCallable(functions, 'simScheduleBatch');
      let action = 'start';
      for (let step = 0; step < maxSteps && !cancelSeasonSimRef.current; step += 1) {
        const result: any = await simBatch({
          leagueId,
          action,
          competition: 'regular',
          batchSize: 1,
        });
        const control = result.data || {};
        setSeasonSimProgress({
          finalGames: Number(control.finalGames || 0),
          totalGames: Number(control.totalGames || allGames.length),
          remainingGames: Number(control.remainingGames || 0),
        });
        if (control.status === 'complete' || control.status === 'cancelled') break;
        action = 'step';
        await wait(220);
      }
    } catch (error: any) {
      Alert.alert('Season sim stopped', error.message || 'Please try again.');
    } finally {
      setSimmingSeason(false);
      cancelSeasonSimRef.current = false;
      setAutoFollowSeasonSim(false);
      setSeasonSimProgress(null);
    }
  };

  const runSeasonSim = () => {
    runSeasonSimContinuously();
  };

  const cancelSeasonSim = async () => {
    if (!leagueId) return;
    cancelSeasonSimRef.current = true;
    try {
      const simBatch = httpsCallable(functions, 'simScheduleBatch');
      await simBatch({ leagueId, action: 'cancel', competition: 'regular' });
    } catch (error: any) {
      Alert.alert('Cancel not sent', error.message || 'Please try again.');
    }
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator color="#00e58b" size="large" /></View>;

  return (
    <View style={styles.screen}>
      <SectionList
        ref={scheduleListRef}
        contentContainerStyle={styles.content}
        sections={sections}
        keyExtractor={item => item.id}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
        removeClippedSubviews
        onScrollBeginDrag={() => {
          if (simmingSeason) setAutoFollowSeasonSim(false);
        }}
        onScrollToIndexFailed={() => {
          if (simmingSeason && autoFollowSeasonSim) {
            setTimeout(() => scrollToNextUnfinishedGame(true), 220);
          }
        }}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={(
          <>
            <View style={styles.header}>
              <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                <Ionicons color="#ffffff" name="chevron-back" size={24} />
              </TouchableOpacity>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>{league?.name || 'League'}</Text>
                <Text style={styles.title}>Calendar</Text>
              </View>
            </View>
            {!schedule ? (
              <Text style={styles.empty}>No schedule has been created yet.</Text>
            ) : (
              <>
                <View style={styles.summary}>
                  <View style={styles.summaryTop}>
                    <View>
                      <Text style={styles.summaryText}>{selectedViewMode === 'cup' ? 'NBA Cup' : `${schedule.gamesPerTeam || 0} games per team`}</Text>
                      <Text style={styles.summaryMeta}>
                        {selectedViewMode === 'cup'
                          ? `${cupGames.length} NBA Cup games`
                          : selectedViewMode === 'mine'
                            ? `${myGames.length} team games`
                            : `${allGames.length} league games`}
                      </Text>
                    </View>
                    <View style={styles.boardBadge}>
                      <Ionicons color="#00e58b" name="grid-outline" size={15} />
                      <Text style={styles.boardBadgeText}>Board</Text>
                    </View>
                  </View>
                  <Text style={styles.summaryMeta}>
                    Season windows and reset ranges
                  </Text>
                </View>
                <View style={styles.segment}>
                  <TouchableOpacity
                    style={[styles.segmentButton, selectedViewMode === 'mine' && styles.segmentButtonActive, !myTeam && styles.segmentButtonDisabled]}
                    onPress={() => setViewMode('mine')}
                    disabled={!myTeam}
                  >
                    <Text style={[styles.segmentText, selectedViewMode === 'mine' && styles.segmentTextActive]}>My Team</Text>
                    <Text style={styles.segmentCount}>{myGames.length}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.segmentButton, selectedViewMode === 'league' && styles.segmentButtonActive]}
                    onPress={() => setViewMode('league')}
                  >
                    <Text style={[styles.segmentText, selectedViewMode === 'league' && styles.segmentTextActive]}>League</Text>
                    <Text style={styles.segmentCount}>{allGames.length}</Text>
                  </TouchableOpacity>
                  {hasNbaCup ? (
                    <TouchableOpacity
                      style={[styles.segmentButton, selectedViewMode === 'cup' && styles.segmentButtonActive]}
                      onPress={() => setViewMode('cup')}
                    >
                      <Text style={[styles.segmentText, selectedViewMode === 'cup' && styles.segmentTextActive]}>NBA Cup</Text>
                      <Text style={styles.segmentCount}>{myTeam ? `${myCupGames.length}/${cupGames.length}` : cupGames.length}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <View style={styles.legend}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendSwatch, styles.legendHome]} />
                    <Text style={styles.legendText}>Home</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendSwatch, styles.legendAway]} />
                    <Text style={styles.legendText}>Away</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendSwatch, styles.legendMine]} />
                    <Text style={styles.legendText}>My games</Text>
                  </View>
                </View>
                {isLeagueAdmin && selectedViewMode !== 'cup' ? (
                  <>
                    <View style={styles.simControl}>
                      <TouchableOpacity
                        disabled={simmingSeason || allGames.every(game => game.status === 'final')}
                        style={[styles.simButton, (simmingSeason || allGames.every(game => game.status === 'final')) && styles.simButtonDisabled]}
                        onPress={runSeasonSim}
                      >
                        {simmingSeason ? (
                          <ActivityIndicator color="#06130c" />
                        ) : (
                          <>
                            <Ionicons color="#06130c" name="play-forward" size={16} />
                            <Text style={styles.simButtonText}>
                              {allGames.every(game => game.status === 'final') ? 'Season Complete' : 'Sim Season'}
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                    {simmingSeason && seasonSimProgress ? (
                      <Text style={styles.simProgressText}>
                        Simming game by game - {seasonSimProgress.finalGames}/{seasonSimProgress.totalGames} final - {seasonSimProgress.remainingGames} left
                      </Text>
                    ) : null}
                  </>
                ) : null}
                {selectedViewMode === 'cup' && isLeagueAdmin ? (
                  <TouchableOpacity
                    disabled={advancingCup || Boolean(schedule.nbaCup?.championTeamId)}
                    style={[styles.advanceCupButton, (advancingCup || schedule.nbaCup?.championTeamId) && styles.advanceCupButtonDisabled]}
                    onPress={advanceCup}
                  >
                    {advancingCup ? (
                      <ActivityIndicator color="#06130c" />
                    ) : (
                      <Text style={styles.advanceCupText}>
                        {schedule.nbaCup?.championTeamId ? 'NBA Cup Champion Set' : 'Advance NBA Cup'}
                      </Text>
                    )}
                  </TouchableOpacity>
                ) : null}
              </>
            )}
          </>
        )}
        renderSectionHeader={({ section }) => (
          <View style={styles.weekHeader}>
            <Text style={styles.weekTitle}>{section.title}</Text>
            <Text style={styles.weekRange}>{section.gameRange}</Text>
          </View>
        )}
        renderItem={({ item: sectionRow }) => (
          <View style={styles.calendarGrid}>
            {sectionRow.games.map((item) => {
              const home = teamPresentations.get(item.homeTeamId) || teamPresentations.get(normalizeScheduleKey(item.homeTeamId)) || { label: teamNames.get(item.homeTeamId) || displayScheduleName({ scheduleTeamId: item.homeTeamId }), abbr: displayScheduleAbbr(item.homeTeamId) };
              const away = teamPresentations.get(item.awayTeamId) || teamPresentations.get(normalizeScheduleKey(item.awayTeamId)) || { label: teamNames.get(item.awayTeamId) || displayScheduleName({ scheduleTeamId: item.awayTeamId }), abbr: displayScheduleAbbr(item.awayTeamId) };
              const cupGame = supportsCup && (selectedViewMode === 'cup' || item.competition === 'nbaCup');
              const competitionParam = item.competition === 'playoffs' ? 'playoffs' : cupGame ? 'nbaCup' : 'regular';
              const mine = Boolean(myTeam && (myTeamIds.has(normalizeScheduleKey(item.homeTeamId)) || myTeamIds.has(normalizeScheduleKey(item.awayTeamId)) || item.homeGmId === uid || item.awayGmId === uid));
              const openable = Boolean(mine || isLeagueAdmin);
              const resultRevealed = isLiveResultRevealed(item, nowMs);
              const needsReset = isLeagueAdmin && item.status !== 'scheduled' && resultRevealed;
              const finalScore = resultRevealed ? formatFinalScore(item) : '';
              const liveScore = liveScheduleScore(item, nowMs);
              const statusLabel = item.status === 'final' && !resultRevealed
                ? 'Live'
                : item.status === 'final'
                ? finalScore || 'Final'
                : item.status === 'scheduled' && mine
                  ? 'Ready'
                  : item.status === 'requested'
                    ? 'Requested'
                    : item.status === 'preparing'
                      ? 'Prep'
                      : item.status === 'simulating'
                        ? 'Sim'
                        : 'Open';
              const destination = item.status === 'final' || (item.liveTimeline && !resultRevealed)
                ? '/screens/season/game-result'
                : '/screens/season/matchup';
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.calendarTile, mine && styles.myGame, !openable && styles.disabledGame]}
                  disabled={!openable}
                  onPress={() => {
                    router.push({
                      pathname: destination as any,
                      params: {
                        leagueId,
                        gameId: item.id,
                        competition: competitionParam,
                      },
                    });
                  }}
                >
                  <View style={styles.tileTop}>
                    <Text style={styles.tileGameNo}>Game {item.sequence}</Text>
                    <Text style={[styles.tileStatus, item.status === 'final' && styles.finalText]}>{statusLabel}</Text>
                  </View>
                  <View style={styles.tileMatchup}>
                    <View style={styles.tileTeam}>
                      <View style={[styles.tileLogoDisc, styles.awayLogoDisc]}>
                        <SportTeamLogo sport={sport} abbr={away.abbr} era={league?.currentYear} style={styles.teamLogo} fontSize={10} />
                      </View>
                      <Text style={styles.teamLabel} numberOfLines={1}>{away.abbr}</Text>
                      <Text style={styles.teamName} numberOfLines={1}>{away.label}</Text>
                    </View>
                    <View style={styles.versusStack}>
                      <View style={styles.versusPill}>
                        <Text style={styles.versusText}>AT</Text>
                      </View>
                      {liveScore ? (
                        <View style={styles.liveScoreStack}>
                          <Text style={styles.tileScore}>{liveScore.label}</Text>
                          <Text style={styles.liveScoreMeta}>{liveScore.periodLabel}</Text>
                        </View>
                      ) : finalScore ? (
                        <Text style={styles.tileScore}>{finalScore}</Text>
                      ) : null}
                    </View>
                    <View style={styles.tileTeam}>
                      <View style={[styles.tileLogoDisc, styles.homeLogoDisc]}>
                        <SportTeamLogo sport={sport} abbr={home.abbr} era={league?.currentYear} style={styles.teamLogo} fontSize={10} />
                      </View>
                      <Text style={styles.teamLabel} numberOfLines={1}>{home.abbr}</Text>
                      <Text style={styles.teamName} numberOfLines={1}>{home.label}</Text>
                    </View>
                  </View>
                  <View style={styles.tileFooter}>
                    {cupGame ? (
                      <Text style={styles.cupHint}>NBA Cup</Text>
                    ) : (
                      <Text style={styles.tileHint}>{openable ? 'Tap to manage' : 'League game'}</Text>
                    )}
                    {needsReset ? (
                      <Text style={styles.resetHint}>Reset</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        ListEmptyComponent={schedule ? (
          <View style={styles.emptyCard}>
            <Text style={styles.empty}>
              {selectedViewMode === 'mine'
                ? 'No games matched your team yet. View the full league schedule while this syncs.'
                : selectedViewMode === 'cup'
                  ? 'No NBA Cup games are in this schedule yet.'
                : 'No games are in this schedule yet.'}
            </Text>
            {selectedViewMode === 'mine' && allGames.length > 0 ? (
              <TouchableOpacity style={styles.emptyAction} onPress={() => setViewMode('league')}>
                <Text style={styles.emptyActionText}>Show League Schedule</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      />
      {simmingSeason ? (
        <View style={styles.simDock}>
          <TouchableOpacity style={styles.simDockStop} onPress={cancelSeasonSim}>
            <Ionicons color="#fff" name="stop-circle" size={17} />
            <Text style={styles.simDockStopText}>Stop</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.simDockFollow, autoFollowSeasonSim && styles.simDockFollowActive]}
            onPress={toggleSeasonSimFollow}
          >
            <Ionicons color={autoFollowSeasonSim ? '#06130c' : '#00e58b'} name="navigate" size={15} />
            <Text style={[styles.simDockFollowText, autoFollowSeasonSim && styles.simDockFollowTextActive]}>
              {autoFollowSeasonSim ? 'Following' : 'Follow'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050505' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#050505' },
  content: { padding: 18, paddingTop: 58, paddingBottom: 112 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  iconButton: { width: 42, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#151515' },
  headerCopy: { flex: 1 },
  eyebrow: { color: '#777', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  title: { color: '#fff', fontSize: 28, fontWeight: '900' },
  empty: { color: '#aaa', fontSize: 14, lineHeight: 20, marginBottom: 16 },
  summary: { backgroundColor: '#101410', borderWidth: 1, borderColor: '#1f3328', borderRadius: 8, padding: 14, marginBottom: 14 },
  summaryTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  summaryText: { color: '#fff', fontSize: 17, fontWeight: '900' },
  summaryMeta: { color: '#777', fontSize: 12, fontWeight: '700', marginTop: 4 },
  boardBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, borderWidth: 1, borderColor: '#00e58b44', paddingHorizontal: 9, paddingVertical: 6, backgroundColor: '#06140e' },
  boardBadgeText: { color: '#00e58b', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  segment: { flexDirection: 'row', backgroundColor: '#101010', borderRadius: 8, borderWidth: 1, borderColor: '#202020', padding: 4, marginBottom: 14, gap: 4 },
  segmentButton: { flex: 1, minHeight: 42, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  segmentButtonActive: { backgroundColor: '#0a1d14', borderWidth: 1, borderColor: '#00e58b55' },
  segmentButtonDisabled: { opacity: 0.4 },
  segmentText: { color: '#777', fontSize: 12, fontWeight: '900' },
  segmentTextActive: { color: '#00e58b' },
  segmentCount: { color: '#555', fontSize: 10, fontWeight: '800', marginTop: 2 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6, paddingHorizontal: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { width: 14, height: 6, borderRadius: 999 },
  legendHome: { backgroundColor: '#2477ff' },
  legendAway: { backgroundColor: '#d8345f' },
  legendMine: { backgroundColor: '#00e58b' },
  legendText: { color: '#777', fontSize: 10, fontWeight: '800' },
  simControl: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, marginBottom: 6 },
  simButton: { flex: 1, minHeight: 42, borderRadius: 8, backgroundColor: '#00e58b', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  simButtonDisabled: { opacity: 0.5 },
  simButtonText: { color: '#06130c', fontSize: 12, fontWeight: '900' },
  simProgressText: { color: '#8a8a8a', fontSize: 11, fontWeight: '800', marginTop: -2, marginBottom: 8, paddingHorizontal: 2 },
  simDock: { position: 'absolute', left: 18, right: 18, bottom: 18, borderRadius: 10, borderWidth: 1, borderColor: '#1f3328', backgroundColor: '#07120d', padding: 8, flexDirection: 'row', gap: 8 },
  simDockStop: { flex: 1, minHeight: 40, borderRadius: 8, backgroundColor: '#e53950', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  simDockStopText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  simDockFollow: { flex: 1, minHeight: 40, borderRadius: 8, borderWidth: 1, borderColor: '#00e58b66', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, backgroundColor: '#07120d' },
  simDockFollowActive: { backgroundColor: '#00e58b', borderColor: '#00e58b' },
  simDockFollowText: { color: '#00e58b', fontSize: 12, fontWeight: '900' },
  simDockFollowTextActive: { color: '#06130c' },
  weekHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 8, paddingHorizontal: 2 },
  weekTitle: { color: '#fff', fontSize: 13, fontWeight: '900' },
  weekRange: { color: '#777', fontSize: 11, fontWeight: '800' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 2 },
  calendarTile: { width: '48.7%', minHeight: 158, borderRadius: 8, borderWidth: 1, borderColor: '#202020', backgroundColor: '#111', padding: 10, justifyContent: 'space-between' },
  myGame: { borderColor: '#00e58b55', backgroundColor: '#0a1d14' },
  disabledGame: { opacity: 0.7 },
  tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 8 },
  tileGameNo: { color: '#777', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  tileStatus: { color: '#00e58b', fontSize: 11, fontWeight: '900', textAlign: 'right' },
  tileMatchup: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  tileTeam: { flex: 1, minWidth: 0, alignItems: 'center' },
  tileLogoDisc: { width: 47, height: 47, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#181818', borderWidth: 2 },
  awayLogoDisc: { borderColor: '#d8345f88' },
  homeLogoDisc: { borderColor: '#2477ff88' },
  teamLogo: { width: 35, height: 35 },
  teamLabel: { color: '#fff', fontSize: 11, fontWeight: '900', maxWidth: '100%' },
  teamName: { color: '#777', fontSize: 8, fontWeight: '800', marginTop: 2, maxWidth: '100%' },
  versusStack: { alignItems: 'center', gap: 6, width: 34 },
  versusPill: { width: 28, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#080808', borderWidth: 1, borderColor: '#2a2a2a' },
  versusText: { color: '#777', fontSize: 9, fontWeight: '900' },
  tileScore: { color: '#fff', fontSize: 10, fontWeight: '900', textAlign: 'center' },
  liveScoreStack: { alignItems: 'center', gap: 1 },
  liveScoreMeta: { color: '#00e58b', fontSize: 8, fontWeight: '900', textAlign: 'center', textTransform: 'uppercase' },
  tileFooter: { minHeight: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10 },
  tileHint: { color: '#555', fontSize: 9, fontWeight: '800' },
  finalText: { color: '#fff' },
  resetHint: { color: '#ff6b6b', fontSize: 11, fontWeight: '900' },
  cupHint: { color: '#f4c542', fontSize: 10, fontWeight: '900' },
  advanceCupButton: { minHeight: 42, borderRadius: 8, backgroundColor: '#f4c542', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  advanceCupButtonDisabled: { opacity: 0.6 },
  advanceCupText: { color: '#06130c', fontSize: 12, fontWeight: '900' },
  emptyCard: { backgroundColor: '#101010', borderRadius: 8, borderWidth: 1, borderColor: '#202020', padding: 16 },
  emptyAction: { marginTop: 12, borderRadius: 8, borderWidth: 1, borderColor: '#00e58b55', paddingVertical: 10, alignItems: 'center' },
  emptyActionText: { color: '#00e58b', fontSize: 12, fontWeight: '900' },
});
