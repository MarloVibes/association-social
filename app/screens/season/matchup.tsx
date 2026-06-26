import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import SportTeamLogo from '@/components/SportTeamLogo';
import { auth, db, functions } from '@/constants/firebase';
import { COACHING_PRESETS, buildCoachingSnapshot, type CoachingPreset } from '@/domain/nba/coaching';
import type { NbaScheduleGame } from '@/domain/nba/schedule';
import { gameMatchesMyTeam, normalizeScheduleKey, teamScheduleKeys } from '@/domain/nba/scheduleView';
import { isMissingCallable } from '@/utils/createNbaSchedule';

type Team = {
  id: string;
  teamId?: string;
  name?: string;
  abbreviation?: string;
  gmId?: string;
  coachingPresets?: CoachingPreset[];
  defaultCoachingPresetId?: string;
};

type ScheduleDoc = {
  games?: MatchupGame[];
  nbaCup?: {
    name?: string;
    games?: MatchupGame[];
  } | null;
  playoffs?: {
    rounds?: {
      series?: {
        games?: MatchupGame[];
      }[];
    }[];
  } | null;
};

type MatchupGame = Omit<NbaScheduleGame, 'status'> & {
  status: NbaScheduleGame['status'] | 'requested' | 'preparing' | 'expired' | 'simulating';
  competition?: 'nbaCup' | 'playoffs';
  groupId?: string;
  stage?: string;
  round?: string;
  seriesId?: string;
  playoffGame?: number;
  requestedByUid?: string;
  preparationDeadlineMs?: number;
  resetByUid?: string;
  resetAtMs?: number;
  finalScoreSubmittedByUid?: string;
  liveTimeline?: unknown;
  boxScore?: {
    home?: { points?: number; players?: BoxScorePlayer[] };
    away?: { points?: number; players?: BoxScorePlayer[] };
  };
  quarters?: { quarter: number; home: number; away: number }[];
  story?: string;
};

type BoxScorePlayer = {
  playerId?: string;
  name?: string;
  minutes?: number;
  points?: number;
  rebounds?: number;
  assists?: number;
};

export default function MatchupScreen() {
  const { leagueId, gameId, competition } = useLocalSearchParams<{ leagueId: string; gameId: string; competition?: string }>();
  const router = useRouter();
  const uid = auth.currentUser?.uid;
  const [league, setLeague] = useState<any>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [schedule, setSchedule] = useState<ScheduleDoc | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState('balanced');
  const [awayScoreInput, setAwayScoreInput] = useState('');
  const [homeScoreInput, setHomeScoreInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

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
      }, error => {
        console.warn('Schedule matchup unavailable:', error);
        setSchedule(null);
        setLoading(false);
      });
    }, err => {
      console.warn('League matchup unavailable:', err);
      setLoading(false);
    });
    const unsubscribeTeams = onSnapshot(collection(db, 'leagues', leagueId, 'teams'), snapshot => {
      setTeams(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as Team)));
    }, err => {
      console.warn('League teams unavailable for matchup:', err);
    });
    return () => {
      unsubscribeLeague();
      if (unsubscribeSchedule) unsubscribeSchedule();
      unsubscribeTeams();
    };
  }, [leagueId]);

  const isCupGame = competition === 'nbaCup';
  const isPlayoffGame = competition === 'playoffs';
  const competitionParam = isCupGame ? 'nbaCup' : isPlayoffGame ? 'playoffs' : 'regular';
  const playoffGames = useMemo(() => (
    schedule?.playoffs?.rounds?.flatMap(round => (
      round.series?.flatMap(series => series.games || []) || []
    )) || []
  ), [schedule?.playoffs?.rounds]);
  const scheduledGames = useMemo(() => {
    if (isCupGame) return schedule?.nbaCup?.games || [];
    if (isPlayoffGame) return playoffGames;
    return schedule?.games || [];
  }, [isCupGame, isPlayoffGame, playoffGames, schedule?.games, schedule?.nbaCup?.games]);
  const game = useMemo<MatchupGame | null>(
    () => scheduledGames.find(item => item.id === gameId) || null,
    [gameId, scheduledGames],
  );
  const myTeam = teams.find(team => (
    team.gmId === uid
    && game
    && gameMatchesMyTeam(game, team, uid)
  ));
  const myTeamIds = teamScheduleKeys(myTeam);
  const opponentTeamId = game && myTeam
    ? myTeamIds.has(normalizeScheduleKey(game.homeTeamId)) || game.homeGmId === uid ? game.awayTeamId : game.homeTeamId
    : '';
  const homeTeam = teams.find(team => game?.homeTeamId && teamScheduleKeys(team).has(normalizeScheduleKey(game.homeTeamId)));
  const awayTeam = teams.find(team => game?.awayTeamId && teamScheduleKeys(team).has(normalizeScheduleKey(game.awayTeamId)));
  const opponentTeam = teams.find(team => opponentTeamId && teamScheduleKeys(team).has(normalizeScheduleKey(opponentTeamId)));
  const myTeamAbbr = normalizeScheduleKey(myTeam?.abbreviation || myTeam?.teamId || '');
  const opponentAbbr = normalizeScheduleKey(opponentTeam?.abbreviation || opponentTeam?.teamId || opponentTeamId);
  const myTeamLabel = myTeam?.abbreviation || myTeam?.name || 'My Team';
  const opponentLabel = opponentTeam?.abbreviation || opponentTeam?.name || opponentTeamId || 'CPU';
  const gameContextLabel = game
    ? isCupGame
      ? `NBA Cup · ${game.groupId || 'Group Play'} · Game ${game.sequence} · ${game.status}`
      : isPlayoffGame
        ? `Playoffs · Game ${game.playoffGame || game.sequence} · ${game.status}`
      : `Week ${game.week} · Game ${game.sequence} · ${game.status}`
    : '';
  const isLeagueAdmin = Boolean(
    uid
    && league
    && (
      league.commissionerId === uid
      || (league.coCommissioners || []).includes(uid)
    ),
  );
  const leftAbbr = myTeam
    ? myTeamAbbr
    : normalizeScheduleKey(awayTeam?.abbreviation || awayTeam?.teamId || game?.awayTeamId || '');
  const rightAbbr = myTeam
    ? opponentAbbr
    : normalizeScheduleKey(homeTeam?.abbreviation || homeTeam?.teamId || game?.homeTeamId || '');
  const leftLabel = myTeam ? myTeamLabel : awayTeam?.abbreviation || awayTeam?.name || game?.awayTeamId || 'Away';
  const rightLabel = myTeam ? opponentLabel : homeTeam?.abbreviation || homeTeam?.name || game?.homeTeamId || 'Home';
  const matchupJoinLabel = myTeam ? 'VS' : 'AT';
  const awayLabel = awayTeam?.abbreviation || awayTeam?.name || game?.awayTeamId || 'Away';
  const homeLabel = homeTeam?.abbreviation || homeTeam?.name || game?.homeTeamId || 'Home';
  const presets = useMemo(() => {
    const byId = new Map<string, CoachingPreset>();
    [...COACHING_PRESETS, ...(myTeam?.coachingPresets || [])].forEach(preset => byId.set(preset.id, preset));
    return [...byId.values()];
  }, [myTeam?.coachingPresets]);

  useEffect(() => {
    if (myTeam?.defaultCoachingPresetId) setSelectedPresetId(myTeam.defaultCoachingPresetId);
  }, [myTeam?.defaultCoachingPresetId]);

  useEffect(() => {
    setAwayScoreInput(typeof game?.awayScore === 'number' ? String(game.awayScore) : '');
    setHomeScoreInput(typeof game?.homeScore === 'number' ? String(game.homeScore) : '');
  }, [game?.awayScore, game?.homeScore, game?.id]);

  const resetGameLocally = async () => {
    if (!leagueId || !league || !game || !schedule || !uid) throw new Error('Game is not ready to reset.');
    const scheduleId = league.scheduleId || String(league.currentYear || 2025);
    const nextGames = scheduledGames.map((item) => {
      if (item.id !== game.id) return item;
      const {
        requestedByUid,
        requestedAtMs,
        responseDeadlineMs,
        acceptedByUid,
        acceptedAtMs,
        preparationDeadlineMs,
        expiredAtMs,
        simulationStartedByUid,
        simulationStartedAtMs,
        homeScore,
        awayScore,
        winnerTeamId,
        loserTeamId,
        finalAtMs,
        liveTimeline,
        liveMode,
        arenaTheme,
        ...baseGame
      } = item as any;
      void requestedByUid;
      void requestedAtMs;
      void responseDeadlineMs;
      void acceptedByUid;
      void acceptedAtMs;
      void preparationDeadlineMs;
      void expiredAtMs;
      void simulationStartedByUid;
      void simulationStartedAtMs;
      void homeScore;
      void awayScore;
      void winnerTeamId;
      void loserTeamId;
      void finalAtMs;
      void liveTimeline;
      void liveMode;
      void arenaTheme;
      return {
        ...baseGame,
        status: 'scheduled',
        resetByUid: uid,
        resetAtMs: Date.now(),
      };
    });
    await updateDoc(doc(db, 'leagues', leagueId, 'schedules', scheduleId), isCupGame ? {
      'nbaCup.games': nextGames,
    } : isPlayoffGame ? {
      playoffs: {
        ...(schedule.playoffs || {}),
        rounds: schedule.playoffs?.rounds?.map(round => ({
          ...round,
          series: round.series?.map(series => ({
            ...series,
            games: series.games?.map(item => nextGames.find(next => next.id === item.id) || item) || [],
          })) || [],
        })) || [],
      },
    } : {
      games: nextGames,
    });
  };

  const simulatedScore = () => {
    if (!game) return { homeScore: 100, awayScore: 98 };
    const seed = `${game.id}:${game.homeTeamId}:${game.awayTeamId}:${Date.now()}`;
    const hash = (value: string) => {
      let h = 2166136261;
      for (let index = 0; index < value.length; index += 1) {
        h ^= value.charCodeAt(index);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    };
    let homeScore = 88 + (hash(`${seed}:home`) % 45);
    let awayScore = 88 + (hash(`${seed}:away`) % 45);
    if (homeScore === awayScore) homeScore += (hash(`${seed}:ot`) % 2) + 1;
    return { homeScore, awayScore };
  };

  const simulateGameLocally = async () => {
    if (!leagueId || !league || !game || !schedule || !uid) throw new Error('Game is not ready to simulate.');
    const scheduleId = league.scheduleId || String(league.currentYear || 2025);
    const { homeScore, awayScore } = simulatedScore();
    const nowMs = Date.now();
    const nextGames = scheduledGames.map((item) => (
      item.id === game.id
        ? {
          ...item,
          status: 'final',
          homeScore,
          awayScore,
          winnerTeamId: homeScore > awayScore ? item.homeTeamId : item.awayTeamId,
          loserTeamId: homeScore > awayScore ? item.awayTeamId : item.homeTeamId,
          simulationStartedByUid: uid,
          simulationStartedAtMs: nowMs,
          finalAtMs: nowMs,
        }
        : item
    ));
    await updateDoc(doc(db, 'leagues', leagueId, 'schedules', scheduleId), isCupGame ? {
      'nbaCup.games': nextGames,
    } : isPlayoffGame ? {
      playoffs: {
        ...(schedule.playoffs || {}),
        rounds: schedule.playoffs?.rounds?.map(round => ({
          ...round,
          series: round.series?.map(series => ({
            ...series,
            games: series.games?.map(item => nextGames.find(next => next.id === item.id) || item) || [],
          })) || [],
        })) || [],
      },
    } : {
      games: nextGames,
    });
  };

  const submitScoreLocally = async (homeScore: number, awayScore: number) => {
    if (!leagueId || !league || !game || !schedule || !uid) throw new Error('Game is not ready for score entry.');
    const scheduleId = league.scheduleId || String(league.currentYear || 2025);
    const nowMs = Date.now();
    const nextGames = scheduledGames.map((item) => (
      item.id === game.id
        ? {
          ...item,
          status: 'final',
          homeScore,
          awayScore,
          winnerTeamId: homeScore > awayScore ? item.homeTeamId : item.awayTeamId,
          loserTeamId: homeScore > awayScore ? item.awayTeamId : item.homeTeamId,
          finalScoreSubmittedByUid: uid,
          finalAtMs: nowMs,
        }
        : item
    ));
    await updateDoc(doc(db, 'leagues', leagueId, 'schedules', scheduleId), isCupGame ? {
      'nbaCup.games': nextGames,
    } : isPlayoffGame ? {
      playoffs: {
        ...(schedule.playoffs || {}),
        rounds: schedule.playoffs?.rounds?.map(round => ({
          ...round,
          series: round.series?.map(series => ({
            ...series,
            games: series.games?.map(item => nextGames.find(next => next.id === item.id) || item) || [],
          })) || [],
        })) || [],
      },
    } : {
      games: nextGames,
    });
  };

  const call = async (name: string) => {
    if (!leagueId || !gameId) return;
    setWorking(true);
    try {
      const fn = httpsCallable(functions, name);
      const response = await fn({ leagueId, gameId, competition: competitionParam });
      const responseData = response.data as any;
      if (name === 'simulateScheduledGame' && isLeagueAdmin && responseData?.status !== 'final') {
        await simulateGameLocally();
        router.replace({ pathname: '/screens/season/game-result', params: { leagueId, gameId, competition: competitionParam } });
        return;
      }
      if (name === 'simulateScheduledGame') {
        router.replace({ pathname: '/screens/season/live-mode', params: { leagueId, gameId, competition: competitionParam } });
        return;
      }
      if (name === 'requestMatchup' && responseData?.status === 'final' && responseData?.liveTimeline) {
        router.replace({ pathname: '/screens/season/live-mode', params: { leagueId, gameId, competition: competitionParam } });
      }
    } catch (error: any) {
      if (name === 'simulateScheduledGame' && isMissingCallable(error) && isLeagueAdmin) {
        try {
          await simulateGameLocally();
          router.replace({ pathname: '/screens/season/game-result', params: { leagueId, gameId, competition: competitionParam } });
          return;
        } catch (fallbackError: any) {
          Alert.alert('Matchup action failed', fallbackError.message || 'Please try again.');
          return;
        }
      }
      if (name === 'resetScheduledGame' && isMissingCallable(error)) {
        try {
          await resetGameLocally();
          return;
        } catch (fallbackError: any) {
          Alert.alert('Matchup action failed', fallbackError.message || 'Please try again.');
          return;
        }
      }
      Alert.alert('Matchup action failed', error.message || 'Please try again.');
    } finally {
      setWorking(false);
    }
  };

  const submitFinalScore = async () => {
    if (!leagueId || !gameId) return;
    const awayScore = Number(awayScoreInput);
    const homeScore = Number(homeScoreInput);
    if (!Number.isInteger(awayScore) || !Number.isInteger(homeScore) || awayScore < 0 || homeScore < 0 || awayScore === homeScore) {
      Alert.alert('Score needed', 'Enter valid non-tied final scores.');
      return;
    }
    setWorking(true);
    try {
      const fn = httpsCallable(functions, 'reportGameScore');
      await fn({ leagueId, gameId, competition: isCupGame ? 'nbaCup' : isPlayoffGame ? 'playoffs' : 'regular', awayScore, homeScore });
    } catch (error: any) {
      if (isMissingCallable(error) && isLeagueAdmin) {
        try {
          await submitScoreLocally(homeScore, awayScore);
          return;
        } catch (fallbackError: any) {
          Alert.alert('Score failed', fallbackError.message || 'Please try again.');
          return;
        }
      }
      Alert.alert('Score failed', error.message || 'Please try again.');
    } finally {
      setWorking(false);
    }
  };

  const confirmResetGame = () => {
    if (!game) return;
    Alert.alert(
      'Reset game?',
      `This will move ${isCupGame ? `NBA Cup ${game.groupId || 'Group Play'}, Game ${game.sequence}` : isPlayoffGame ? `Playoff Game ${game.playoffGame || game.sequence}` : `Week ${game.week}, Game ${game.sequence}`} back to scheduled.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Game',
          style: 'destructive',
          onPress: () => call('resetScheduledGame'),
        },
      ],
    );
  };

  const savePrivatePrep = async () => {
    if (!leagueId || !league || !game || !myTeam) return;
    const preset = presets.find(item => item.id === selectedPresetId) || presets[0];
    setWorking(true);
    try {
      const scheduleId = league.scheduleId || String(league.currentYear || 2025);
      await updateDoc(doc(db, 'leagues', leagueId, 'schedules', scheduleId, 'preparation', `${game.id}_${myTeam.id}`), {
        teamId: myTeam.id,
        gameId: game.id,
        presetSnapshot: buildCoachingSnapshot(preset, myTeam.id, game.id),
        updatedAt: serverTimestamp(),
      });
      Alert.alert('Saved', 'Your private game prep has been saved.');
    } catch (error: any) {
      Alert.alert('Save failed', error.message || 'Please try again.');
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator color="#00e58b" size="large" /></View>;

  const canAccept = Boolean(myTeam && game?.status === 'requested' && game?.requestedByUid !== uid);
  const canRequest = Boolean(myTeam && game?.status === 'scheduled');
  const canSimulate = Boolean(myTeam && game && ['scheduled', 'preparing'].includes(game.status));
  const canReportScore = Boolean((myTeam || isLeagueAdmin) && game && ['scheduled', 'preparing', 'simulating'].includes(game.status));
  const canReset = Boolean(isLeagueAdmin && game && game.status !== 'scheduled');
  const hasFinalScore = game?.status === 'final' && typeof game.homeScore === 'number' && typeof game.awayScore === 'number';
  const topPerformers = [
    ...(game?.boxScore?.home?.players || []),
    ...(game?.boxScore?.away?.players || []),
  ].sort((left, right) => Number(right.points || 0) - Number(left.points || 0)).slice(0, 4);

  return (
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.content}
        data={myTeam ? presets : []}
        keyExtractor={item => item.id}
        ListHeaderComponent={(
          <>
            <View style={styles.header}>
              <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                <Ionicons color="#ffffff" name="chevron-back" size={24} />
              </TouchableOpacity>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>{league?.name || 'League'}</Text>
                <Text style={styles.title}>Matchup</Text>
              </View>
            </View>
            {!game || (!myTeam && !isLeagueAdmin) ? (
              <Text style={styles.empty}>This matchup is not available for your team.</Text>
            ) : (
              <>
                <View style={styles.summary}>
                  <View style={styles.matchupVisual}>
                    <View style={styles.matchupTeam}>
                      <View style={styles.matchupLogoDisc}>
                        <SportTeamLogo sport="nba" abbr={leftAbbr} era={league?.currentYear} style={styles.matchupLogo} fontSize={12} />
                      </View>
                      <Text style={styles.matchupTeamLabel} numberOfLines={1}>{leftLabel}</Text>
                    </View>
                    <View style={styles.vsBadge}>
                      <Text style={styles.vsText}>{matchupJoinLabel}</Text>
                    </View>
                    <View style={styles.matchupTeam}>
                      <View style={styles.matchupLogoDisc}>
                        <SportTeamLogo sport="nba" abbr={rightAbbr} era={league?.currentYear} style={styles.matchupLogo} fontSize={12} />
                      </View>
                      <Text style={styles.matchupTeamLabel} numberOfLines={1}>{rightLabel}</Text>
                    </View>
                  </View>
                  {hasFinalScore ? (
                    <View style={styles.scoreRow}>
                      <Text style={styles.scoreText}>{game.awayScore}</Text>
                      <Text style={styles.scoreDivider}>-</Text>
                      <Text style={styles.scoreText}>{game.homeScore}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.summaryMeta}>{gameContextLabel}</Text>
                </View>
                {hasFinalScore && (game.story || game.quarters?.length || game.boxScore) ? (
                  <View style={styles.resultCard}>
                    {game.story ? <Text style={styles.storyText}>{game.story}</Text> : null}
                    {game.quarters?.length ? (
                      <View style={styles.quarterRow}>
                        {game.quarters.map(quarter => (
                          <View key={quarter.quarter} style={styles.quarterCell}>
                            <Text style={styles.quarterLabel}>Q{quarter.quarter}</Text>
                            <Text style={styles.quarterScore}>{quarter.away}-{quarter.home}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {game.boxScore && topPerformers.length > 0 ? (
                      <View style={styles.performerList}>
                        <Text style={styles.resultSectionTitle}>Top Performers</Text>
                        {topPerformers.map(player => (
                          <Text key={player.playerId || player.name} style={styles.performerLine}>
                            {player.name || player.playerId}: {Number(player.points || 0)} PTS · {Number(player.rebounds || 0)} REB · {Number(player.assists || 0)} AST
                          </Text>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ) : null}
                <View style={styles.actionRow}>
                  {canRequest && (
                    <TouchableOpacity disabled={working} onPress={() => call('requestMatchup')} style={styles.actionButton}>
                      <Text style={styles.actionText}>Request</Text>
                    </TouchableOpacity>
                  )}
                  {canAccept && (
                    <TouchableOpacity disabled={working} onPress={() => call('acceptMatchup')} style={styles.actionButton}>
                      <Text style={styles.actionText}>Accept</Text>
                    </TouchableOpacity>
                  )}
                  {canSimulate && (
                    <TouchableOpacity disabled={working} onPress={() => call('simulateScheduledGame')} style={styles.actionButtonAlt}>
                      <Text style={styles.actionTextAlt}>Simulate</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {canReset && (
                  <TouchableOpacity disabled={working} onPress={confirmResetGame} style={styles.resetButton}>
                    <Ionicons color="#ff6b6b" name="refresh" size={16} />
                    <Text style={styles.resetText}>
                      {isCupGame ? `Reset NBA Cup, Game ${game.sequence}` : `Reset Week ${game.week}, Game ${game.sequence}`}
                    </Text>
                  </TouchableOpacity>
                )}
                {canReportScore && (
                  <View style={styles.scoreEntry}>
                    <View style={styles.scoreInputGroup}>
                      <Text style={styles.scoreInputLabel}>Away · {awayLabel}</Text>
                      <TextInput
                        value={awayScoreInput}
                        onChangeText={setAwayScoreInput}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor="#555"
                        style={styles.scoreInput}
                      />
                    </View>
                    <View style={styles.scoreInputGroup}>
                      <Text style={styles.scoreInputLabel}>Home · {homeLabel}</Text>
                      <TextInput
                        value={homeScoreInput}
                        onChangeText={setHomeScoreInput}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor="#555"
                        style={styles.scoreInput}
                      />
                    </View>
                    <TouchableOpacity disabled={working} onPress={submitFinalScore} style={styles.scoreSubmit}>
                      <Text style={styles.scoreSubmitText}>Save Final Score</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {myTeam && <Text style={styles.sectionTitle}>Private Game Prep</Text>}
              </>
            )}
          </>
        )}
        renderItem={({ item }) => {
          const selected = item.id === selectedPresetId;
          return (
            <TouchableOpacity style={[styles.presetRow, selected && styles.presetRowActive]} onPress={() => setSelectedPresetId(item.id)}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.presetName, selected && styles.presetNameActive]}>{item.name}</Text>
                <Text style={styles.presetMeta}>{item.offense.replace(/_/g, ' ')} · {item.defense.replace(/_/g, ' ')}</Text>
              </View>
              {selected && <Ionicons color="#00e58b" name="checkmark-circle" size={22} />}
            </TouchableOpacity>
          );
        }}
        ListFooterComponent={game && myTeam ? (
          <TouchableOpacity disabled={working} onPress={savePrivatePrep} style={styles.saveButton}>
            <Text style={styles.saveText}>Save Private Prep</Text>
          </TouchableOpacity>
        ) : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050505' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#050505' },
  content: { padding: 18, paddingTop: 58, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  iconButton: { width: 42, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#151515' },
  headerCopy: { flex: 1 },
  eyebrow: { color: '#777', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  title: { color: '#fff', fontSize: 28, fontWeight: '900' },
  empty: { color: '#aaa', fontSize: 14, lineHeight: 20, marginBottom: 16 },
  summary: { backgroundColor: '#101410', borderWidth: 1, borderColor: '#1f3328', borderRadius: 8, padding: 14, marginBottom: 14 },
  matchupVisual: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  matchupTeam: { flex: 1, minWidth: 0, alignItems: 'center', gap: 7 },
  matchupLogoDisc: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: '#171717', borderWidth: 1, borderColor: '#2d2d2d' },
  matchupLogo: { width: 55, height: 55 },
  matchupTeamLabel: { color: '#fff', fontSize: 13, fontWeight: '900', maxWidth: '100%' },
  vsBadge: { width: 38, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: '#080808', borderWidth: 1, borderColor: '#00e58b55' },
  vsText: { color: '#00e58b', fontSize: 11, fontWeight: '900' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 12 },
  scoreText: { color: '#fff', fontSize: 24, fontWeight: '900' },
  scoreDivider: { color: '#777', fontSize: 18, fontWeight: '900' },
  summaryMeta: { color: '#777', fontSize: 12, fontWeight: '700', marginTop: 10, textAlign: 'center', textTransform: 'capitalize' },
  resultCard: { backgroundColor: '#101010', borderRadius: 8, borderWidth: 1, borderColor: '#202020', padding: 12, marginBottom: 18 },
  storyText: { color: '#ddd', fontSize: 12, fontWeight: '800', lineHeight: 18, marginBottom: 10 },
  quarterRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  quarterCell: { flex: 1, minHeight: 44, borderRadius: 7, borderWidth: 1, borderColor: '#2a2a2a', backgroundColor: '#080808', alignItems: 'center', justifyContent: 'center' },
  quarterLabel: { color: '#777', fontSize: 9, fontWeight: '900' },
  quarterScore: { color: '#fff', fontSize: 12, fontWeight: '900', marginTop: 2 },
  performerList: { gap: 5 },
  resultSectionTitle: { color: '#00e58b', fontSize: 10, fontWeight: '900', textTransform: 'uppercase', marginBottom: 2 },
  performerLine: { color: '#aaa', fontSize: 11, fontWeight: '800' },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  actionButton: { flex: 1, backgroundColor: '#00e58b', borderRadius: 8, alignItems: 'center', paddingVertical: 12 },
  actionButtonAlt: { flex: 1, backgroundColor: '#191919', borderRadius: 8, alignItems: 'center', paddingVertical: 12, borderWidth: 1, borderColor: '#00e58b55' },
  actionText: { color: '#06130c', fontSize: 13, fontWeight: '900' },
  actionTextAlt: { color: '#00e58b', fontSize: 13, fontWeight: '900' },
  resetButton: { minHeight: 42, borderRadius: 8, borderWidth: 1, borderColor: '#ff6b6b55', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 18, backgroundColor: '#1a0d0d' },
  resetText: { color: '#ff6b6b', fontSize: 12, fontWeight: '900' },
  scoreEntry: { backgroundColor: '#101010', borderRadius: 8, borderWidth: 1, borderColor: '#202020', padding: 12, marginBottom: 18 },
  scoreInputGroup: { marginBottom: 10 },
  scoreInputLabel: { color: '#888', fontSize: 10, fontWeight: '900', marginBottom: 6, textTransform: 'uppercase' },
  scoreInput: { minHeight: 42, borderRadius: 8, backgroundColor: '#181818', borderWidth: 1, borderColor: '#2a2a2a', color: '#fff', fontSize: 18, fontWeight: '900', textAlign: 'center' },
  scoreSubmit: { minHeight: 42, borderRadius: 8, backgroundColor: '#00e58b', alignItems: 'center', justifyContent: 'center' },
  scoreSubmitText: { color: '#06130c', fontSize: 12, fontWeight: '900' },
  sectionTitle: { color: '#888', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', marginBottom: 10 },
  presetRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#111', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#202020', marginBottom: 8 },
  presetRowActive: { backgroundColor: '#0a1d14', borderColor: '#00e58b' },
  presetName: { color: '#fff', fontSize: 14, fontWeight: '900' },
  presetNameActive: { color: '#00e58b' },
  presetMeta: { color: '#777', fontSize: 11, fontWeight: '700', marginTop: 3, textTransform: 'capitalize' },
  saveButton: { backgroundColor: '#00e58b', borderRadius: 8, alignItems: 'center', paddingVertical: 14, marginTop: 12 },
  saveText: { color: '#06130c', fontSize: 13, fontWeight: '900' },
});
