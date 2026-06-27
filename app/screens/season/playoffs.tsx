import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import SportTeamLogo from '@/components/SportTeamLogo';
import { auth, db, functions } from '@/constants/firebase';
import { buildPlayoffPicture, regularSeasonCompletion } from '@/domain/nba/playoffPicture';
import type { NbaScheduleGame } from '@/domain/nba/schedule';
import { advancePlayoffSeries, buildPlayoffBracket, syncPlayoffSeriesFromGames, type PlayoffBracket, type PlayoffFormat, type PlayoffSeries } from '@/domain/nba/playoffs';
import { displayScheduleAbbr } from '@/domain/nba/scheduleView';
import { buildNbaStandings } from '@/domain/nba/standings';

type Team = {
  id: string;
  teamId?: string;
  abbreviation?: string;
  name?: string;
  gmId?: string;
};

type ScheduleDoc = {
  games?: NbaScheduleGame[];
  participants?: {
    scheduleTeamId?: string;
    sourceTeamDocId?: string | null;
    gmId?: string | null;
    abbreviation?: string;
    name?: string;
  }[];
  playoffs?: PlayoffBracket | null;
};

function formatSeries(series: PlayoffSeries) {
  return `${series.homeSeed}. ${series.homeTeamName || displayScheduleAbbr(series.homeTeamId)} vs ${series.awaySeed}. ${series.awayTeamName || displayScheduleAbbr(series.awayTeamId)}`;
}

function teamLabel(teamId: string, teamName?: string | null) {
  return teamName || displayScheduleAbbr(teamId);
}

export default function PlayoffsScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const router = useRouter();
  const uid = auth.currentUser?.uid;
  const [league, setLeague] = useState<any>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [schedule, setSchedule] = useState<ScheduleDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [startingOffseason, setStartingOffseason] = useState(false);
  const [advancingSeries, setAdvancingSeries] = useState('');
  const [format, setFormat] = useState<PlayoffFormat>('short_8');

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

  const isLeagueAdmin = Boolean(
    uid
    && league
    && (
      league.commissionerId === uid
      || (league.coCommissioners || []).includes(uid)
    ),
  );
  const standings = useMemo(() => buildNbaStandings({
    games: schedule?.games || [],
    participants: schedule?.participants || [],
    teams,
  }), [schedule?.games, schedule?.participants, teams]);
  const bracket = schedule?.playoffs || null;
  const completion = useMemo(() => regularSeasonCompletion(schedule?.games || []), [schedule?.games]);
  const picture = useMemo(() => buildPlayoffPicture({
    standings,
    format,
    completion,
    bracketExists: Boolean(bracket),
  }), [standings, format, completion, bracket]);
  const series = useMemo(() => (
    bracket?.rounds.flatMap(round => round.series.map(item => ({ ...item, roundLabel: round.label }))) || []
  ), [bracket?.rounds]);
  const finalSeries = useMemo(() => (
    bracket?.rounds
      .flatMap(round => round.series)
      .find(item => item.round === 'final') || null
  ), [bracket?.rounds]);
  const championTeamId = finalSeries?.winnerTeamId || null;
  const offseasonStarted = Boolean(league?.offseason && league.offseason.stage !== 'regular_season');

  const startPlayoffs = async () => {
    if (!leagueId || !league || !schedule) return;
    if (!picture.readyToStartPostseason) {
      Alert.alert(
        'Season not complete',
        picture.bracketLocked
          ? 'The playoff bracket already exists.'
          : `${picture.completion.remainingGames} regular season game${picture.completion.remainingGames === 1 ? '' : 's'} still need to be finalized.`,
      );
      return;
    }
    setStarting(true);
    try {
      const scheduleId = league.scheduleId || String(league.currentYear || 2025);
      const nextBracket = buildPlayoffBracket({
        standings,
        format,
        seasonYear: Number(league.currentYear || 2025),
        seed: `${leagueId}:${league.currentYear || 2025}:playoffs`,
      });
      await updateDoc(doc(db, 'leagues', leagueId, 'schedules', scheduleId), {
        playoffs: nextBracket,
      });
    } catch (error: any) {
      Alert.alert('Playoffs not started', error.message || 'Finish the season and try again.');
    } finally {
      setStarting(false);
    }
  };

  const markSeriesWinner = async (seriesId: string, winnerTeamId: string) => {
    if (!leagueId || !league || !bracket) return;
    setAdvancingSeries(seriesId);
    try {
      const scheduleId = league.scheduleId || String(league.currentYear || 2025);
      const nextBracket = advancePlayoffSeries({ bracket, seriesId, winnerTeamId });
      await updateDoc(doc(db, 'leagues', leagueId, 'schedules', scheduleId), {
        playoffs: nextBracket,
      });
    } catch (error: any) {
      Alert.alert('Series not advanced', error.message || 'Please try again.');
    } finally {
      setAdvancingSeries('');
    }
  };

  const syncCompletedGames = async () => {
    if (!leagueId || !league || !bracket) return;
    setSyncing(true);
    try {
      const scheduleId = league.scheduleId || String(league.currentYear || 2025);
      const games = bracket.rounds.flatMap(round => round.series.flatMap(item => item.games));
      const nextBracket = syncPlayoffSeriesFromGames({ bracket, games });
      await updateDoc(doc(db, 'leagues', leagueId, 'schedules', scheduleId), {
        playoffs: nextBracket,
      });
    } catch (error: any) {
      Alert.alert('Playoffs not synced', error.message || 'Please try again.');
    } finally {
      setSyncing(false);
    }
  };

  const openGame = (game: NbaScheduleGame) => {
    const destination = game.status === 'final' ? '/screens/season/game-result' : '/screens/season/matchup';
    router.push({ pathname: destination as any, params: { leagueId, gameId: game.id, competition: 'playoffs' } });
  };

  const startOffseason = () => {
    if (!leagueId || !championTeamId || offseasonStarted || startingOffseason) return;
    Alert.alert(
      'Advance to offseason?',
      'Once offseason starts, each stage lasts 10 minutes, league pages move forward, and there is no going back.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start Offseason',
          style: 'destructive',
          onPress: async () => {
            setStartingOffseason(true);
            try {
              const advance = httpsCallable(functions, 'advanceOffseasonStage');
              await advance({
                leagueId,
                expectedStage: 'awards_recap',
                expectedVersion: 0,
              });
              router.push({ pathname: '/screens/offseason', params: { leagueId } });
            } catch (error: any) {
              Alert.alert('Offseason not started', error.message || 'Please try again.');
            } finally {
              setStartingOffseason(false);
            }
          },
        },
      ],
    );
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator color="#00e58b" size="large" /></View>;

  return (
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.content}
        data={series}
        keyExtractor={item => item.id}
        ListHeaderComponent={(
          <>
            <View style={styles.header}>
              <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                <Ionicons color="#ffffff" name="chevron-back" size={24} />
              </TouchableOpacity>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>{league?.name || 'League'}</Text>
                <Text style={styles.title}>Playoffs</Text>
              </View>
            </View>
            <View style={styles.summary}>
              <Text style={styles.summaryText}>{bracket ? `${bracket.bestOf}-game series` : picture.label}</Text>
              <Text style={styles.summaryMeta}>
                {bracket
                  ? `${bracket.rounds.length} round${bracket.rounds.length === 1 ? '' : 's'} created`
                  : `${picture.completion.finalGames}/${picture.completion.totalGames} games final · ${picture.completion.remainingGames} remaining`}
              </Text>
            </View>
            {!bracket ? (
              <View style={styles.pictureCard}>
                <Text style={styles.pictureTitle}>Playoff Field</Text>
                {picture.playoffSeeds.map(seed => (
                  <View key={seed.teamId} style={styles.pictureRow}>
                    <Text style={styles.pictureSeed}>{seed.seed}</Text>
                    <Text style={styles.pictureTeam} numberOfLines={1}>{seed.name}</Text>
                    <Text style={styles.pictureRecord}>{seed.wins}-{seed.losses}</Text>
                  </View>
                ))}
                {picture.playInSeeds.length > 0 ? (
                  <>
                    <Text style={styles.pictureTitle}>Play-In</Text>
                    {picture.playInSeeds.map(seed => (
                      <View key={seed.teamId} style={styles.pictureRow}>
                        <Text style={styles.pictureSeed}>{seed.seed}</Text>
                        <Text style={styles.pictureTeam} numberOfLines={1}>{seed.name}</Text>
                        <Text style={styles.pictureRecord}>{seed.wins}-{seed.losses}</Text>
                      </View>
                    ))}
                  </>
                ) : null}
                {picture.bubble.length > 0 ? (
                  <>
                    <Text style={styles.pictureTitle}>Outside Looking In</Text>
                    {picture.bubble.map(seed => (
                      <View key={seed.teamId} style={styles.pictureRowMuted}>
                        <Text style={styles.pictureSeed}>{seed.seed}</Text>
                        <Text style={styles.pictureTeam} numberOfLines={1}>{seed.name}</Text>
                        <Text style={styles.pictureRecord}>{seed.wins}-{seed.losses}</Text>
                      </View>
                    ))}
                  </>
                ) : null}
              </View>
            ) : null}
            {!bracket && isLeagueAdmin ? (
              <View style={styles.startCard}>
                <View style={styles.segment}>
                  {[
                    { value: 'short_8', label: '8 Teams' },
                    { value: 'traditional_16', label: '16 Teams' },
                    { value: 'play_in_16', label: 'Play-In' },
                  ].map(option => (
                    <TouchableOpacity
                      key={option.value}
                      style={[styles.segmentButton, format === option.value && styles.segmentButtonActive]}
                      onPress={() => setFormat(option.value as PlayoffFormat)}
                    >
                      <Text style={[styles.segmentText, format === option.value && styles.segmentTextActive]}>{option.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  disabled={starting || !picture.readyToStartPostseason}
                  style={[styles.startButton, (starting || !picture.readyToStartPostseason) && styles.disabled]}
                  onPress={startPlayoffs}
                >
                  {starting ? <ActivityIndicator color="#06130c" /> : <Text style={styles.startText}>{picture.readyToStartPostseason ? 'Start Playoffs' : 'Finish Regular Season'}</Text>}
                </TouchableOpacity>
              </View>
            ) : null}
            {bracket && isLeagueAdmin ? (
              <TouchableOpacity disabled={syncing} style={[styles.syncButton, syncing && styles.disabled]} onPress={syncCompletedGames}>
                {syncing ? <ActivityIndicator color="#06130c" /> : <Text style={styles.startText}>Sync Completed Games</Text>}
              </TouchableOpacity>
            ) : null}
            {bracket && championTeamId && isLeagueAdmin ? (
              <View style={styles.offseasonCard}>
                <Text style={styles.offseasonTitle}>
                  Champion: {teamLabel(championTeamId, finalSeries?.homeTeamId === championTeamId ? finalSeries?.homeTeamName : finalSeries?.awayTeamName)}
                </Text>
                <Text style={styles.offseasonWarning}>
                  Starting offseason opens 10-minute stages for awards, lottery, progression, contracts, draft, free agency, and ready period. There is no going back.
                </Text>
                <TouchableOpacity
                  disabled={startingOffseason || offseasonStarted}
                  onPress={startOffseason}
                  style={[styles.startButton, (startingOffseason || offseasonStarted) && styles.disabled]}
                >
                  {startingOffseason ? (
                    <ActivityIndicator color="#06130c" />
                  ) : (
                    <Text style={styles.startText}>
                      {offseasonStarted ? 'Offseason Started' : 'Advance to Offseason'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : null}
          </>
        )}
        renderItem={({ item }) => (
          <View style={styles.seriesCard}>
            <Text style={styles.roundLabel}>{item.roundLabel}</Text>
            <View style={styles.matchupRow}>
              <View style={styles.teamSide}>
                <View style={styles.logoDisc}>
                  <SportTeamLogo sport="nba" abbr={item.homeTeamId} era={league?.currentYear} style={styles.logo} fontSize={9} />
                </View>
                <Text style={styles.seed}>{item.homeSeed}</Text>
                <Text style={styles.teamName} numberOfLines={1}>{teamLabel(item.homeTeamId, item.homeTeamName)}</Text>
              </View>
              <Text style={styles.vs}>VS</Text>
              <View style={styles.teamSide}>
                <View style={styles.logoDisc}>
                  <SportTeamLogo sport="nba" abbr={item.awayTeamId} era={league?.currentYear} style={styles.logo} fontSize={9} />
                </View>
                <Text style={styles.seed}>{item.awaySeed}</Text>
                <Text style={styles.teamName} numberOfLines={1}>{teamLabel(item.awayTeamId, item.awayTeamName)}</Text>
              </View>
            </View>
            <Text style={styles.seriesMeta}>{formatSeries(item)} · Best of {bracket?.bestOf || 7}</Text>
            {item.winnerTeamId ? (
              <Text style={styles.winnerText}>Winner: {teamLabel(item.winnerTeamId, item.winnerTeamId === item.homeTeamId ? item.homeTeamName : item.awayTeamName)}</Text>
            ) : isLeagueAdmin ? (
              <View style={styles.winnerActions}>
                <TouchableOpacity
                  disabled={advancingSeries === item.id}
                  onPress={() => markSeriesWinner(item.id, item.homeTeamId)}
                  style={[styles.winnerButton, advancingSeries === item.id && styles.disabled]}
                >
                  <Text style={styles.winnerButtonText}>{displayScheduleAbbr(item.homeTeamId)} wins</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={advancingSeries === item.id}
                  onPress={() => markSeriesWinner(item.id, item.awayTeamId)}
                  style={[styles.winnerButton, advancingSeries === item.id && styles.disabled]}
                >
                  <Text style={styles.winnerButtonText}>{displayScheduleAbbr(item.awayTeamId)} wins</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            <View style={styles.gamesGrid}>
              {item.games.map(game => (
                <TouchableOpacity key={game.id} style={[styles.gameButton, game.status === 'final' && styles.gameButtonFinal]} onPress={() => openGame(game)}>
                  <Text style={[styles.gameButtonText, game.status === 'final' && styles.gameButtonTextFinal]}>
                    G{game.playoffGame}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
        ListEmptyComponent={bracket ? <Text style={styles.empty}>No playoff series are available.</Text> : null}
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
  summary: { backgroundColor: '#101410', borderWidth: 1, borderColor: '#1f3328', borderRadius: 8, padding: 14, marginBottom: 14 },
  summaryText: { color: '#fff', fontSize: 17, fontWeight: '900' },
  summaryMeta: { color: '#777', fontSize: 12, fontWeight: '700', marginTop: 4 },
  pictureCard: { backgroundColor: '#101010', borderRadius: 8, borderWidth: 1, borderColor: '#202020', padding: 12, marginBottom: 14 },
  pictureTitle: { color: '#00e58b', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', marginTop: 8, marginBottom: 8 },
  pictureRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: '#1d1d1d' },
  pictureRowMuted: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: 0.65, borderBottomWidth: 1, borderBottomColor: '#1d1d1d' },
  pictureSeed: { width: 24, color: '#888', fontSize: 12, fontWeight: '900', textAlign: 'center' },
  pictureTeam: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '800' },
  pictureRecord: { color: '#777', fontSize: 12, fontWeight: '800' },
  startCard: { backgroundColor: '#101010', borderRadius: 8, borderWidth: 1, borderColor: '#202020', padding: 12, marginBottom: 14 },
  segment: { flexDirection: 'row', backgroundColor: '#080808', borderRadius: 8, borderWidth: 1, borderColor: '#202020', padding: 4, marginBottom: 12, gap: 4 },
  segmentButton: { flex: 1, minHeight: 38, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  segmentButtonActive: { backgroundColor: '#0a1d14', borderWidth: 1, borderColor: '#00e58b55' },
  segmentText: { color: '#777', fontSize: 12, fontWeight: '900' },
  segmentTextActive: { color: '#00e58b' },
  startButton: { minHeight: 42, borderRadius: 8, backgroundColor: '#00e58b', alignItems: 'center', justifyContent: 'center' },
  syncButton: { minHeight: 42, borderRadius: 8, backgroundColor: '#00e58b', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  startText: { color: '#06130c', fontSize: 12, fontWeight: '900' },
  disabled: { opacity: 0.5 },
  offseasonCard: { backgroundColor: '#171006', borderRadius: 8, borderWidth: 1, borderColor: '#ffaa00', padding: 12, marginBottom: 14, gap: 10 },
  offseasonTitle: { color: '#ffffff', fontSize: 15, fontWeight: '900' },
  offseasonWarning: { color: '#ffaa00', fontSize: 12, fontWeight: '700', lineHeight: 17 },
  seriesCard: { backgroundColor: '#111', borderRadius: 8, borderWidth: 1, borderColor: '#202020', padding: 12, marginBottom: 10 },
  roundLabel: { color: '#888', fontSize: 10, fontWeight: '900', textTransform: 'uppercase', marginBottom: 10 },
  matchupRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  teamSide: { flex: 1, minWidth: 0, alignItems: 'center', gap: 5 },
  logoDisc: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#181818', borderWidth: 1, borderColor: '#2a2a2a' },
  logo: { width: 31, height: 31 },
  seed: { color: '#00e58b', fontSize: 11, fontWeight: '900' },
  teamName: { color: '#fff', fontSize: 12, fontWeight: '900', maxWidth: '100%' },
  vs: { color: '#777', fontSize: 10, fontWeight: '900' },
  seriesMeta: { color: '#666', fontSize: 11, fontWeight: '800', marginTop: 10, textAlign: 'center' },
  winnerText: { color: '#00e58b', fontSize: 11, fontWeight: '900', marginTop: 10, textAlign: 'center' },
  winnerActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  winnerButton: { flex: 1, minHeight: 38, borderRadius: 8, borderWidth: 1, borderColor: '#00e58b55', backgroundColor: '#0a1d14', alignItems: 'center', justifyContent: 'center' },
  winnerButtonText: { color: '#00e58b', fontSize: 11, fontWeight: '900' },
  gamesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  gameButton: { width: 38, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#181818', borderWidth: 1, borderColor: '#2a2a2a' },
  gameButtonFinal: { backgroundColor: '#0a1d14', borderColor: '#00e58b55' },
  gameButtonText: { color: '#aaa', fontSize: 11, fontWeight: '900' },
  gameButtonTextFinal: { color: '#00e58b' },
  empty: { color: '#aaa', fontSize: 14, lineHeight: 20, marginTop: 12 },
});
