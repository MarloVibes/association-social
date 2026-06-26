import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import SportTeamLogo from '@/components/SportTeamLogo';
import { auth, db } from '@/constants/firebase';
import type { NbaScheduleGame } from '@/domain/nba/schedule';
import { advancePlayoffSeries, buildPlayoffBracket, type PlayoffBracket, type PlayoffFormat, type PlayoffSeries } from '@/domain/nba/playoffs';
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
  participants?: Array<{
    scheduleTeamId?: string;
    sourceTeamDocId?: string | null;
    gmId?: string | null;
    abbreviation?: string;
    name?: string;
  }>;
  playoffs?: PlayoffBracket | null;
};

function formatSeries(series: PlayoffSeries) {
  return `${series.homeSeed}. ${series.homeTeamName || series.homeTeamId} vs ${series.awaySeed}. ${series.awayTeamName || series.awayTeamId}`;
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
  const series = useMemo(() => (
    bracket?.rounds.flatMap(round => round.series.map(item => ({ ...item, roundLabel: round.label }))) || []
  ), [bracket?.rounds]);

  const startPlayoffs = async () => {
    if (!leagueId || !league || !schedule) return;
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
              <Text style={styles.summaryText}>{bracket ? `${bracket.bestOf}-game series` : 'Start a bracket'}</Text>
              <Text style={styles.summaryMeta}>{bracket ? `${bracket.rounds.length} round${bracket.rounds.length === 1 ? '' : 's'} created` : 'Seeded from current regular season standings'}</Text>
            </View>
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
                <TouchableOpacity disabled={starting} style={[styles.startButton, starting && styles.disabled]} onPress={startPlayoffs}>
                  {starting ? <ActivityIndicator color="#06130c" /> : <Text style={styles.startText}>Start Playoffs</Text>}
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
                <Text style={styles.teamName} numberOfLines={1}>{item.homeTeamName || item.homeTeamId}</Text>
              </View>
              <Text style={styles.vs}>VS</Text>
              <View style={styles.teamSide}>
                <View style={styles.logoDisc}>
                  <SportTeamLogo sport="nba" abbr={item.awayTeamId} era={league?.currentYear} style={styles.logo} fontSize={9} />
                </View>
                <Text style={styles.seed}>{item.awaySeed}</Text>
                <Text style={styles.teamName} numberOfLines={1}>{item.awayTeamName || item.awayTeamId}</Text>
              </View>
            </View>
            <Text style={styles.seriesMeta}>{formatSeries(item)} · Best of {bracket?.bestOf || 7}</Text>
            {item.winnerTeamId ? (
              <Text style={styles.winnerText}>Winner: {item.winnerTeamId}</Text>
            ) : isLeagueAdmin ? (
              <View style={styles.winnerActions}>
                <TouchableOpacity
                  disabled={advancingSeries === item.id}
                  onPress={() => markSeriesWinner(item.id, item.homeTeamId)}
                  style={[styles.winnerButton, advancingSeries === item.id && styles.disabled]}
                >
                  <Text style={styles.winnerButtonText}>{item.homeTeamId} wins</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={advancingSeries === item.id}
                  onPress={() => markSeriesWinner(item.id, item.awayTeamId)}
                  style={[styles.winnerButton, advancingSeries === item.id && styles.disabled]}
                >
                  <Text style={styles.winnerButtonText}>{item.awayTeamId} wins</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>{bracket ? 'No playoff series are available.' : 'No playoff bracket has been started yet.'}</Text>}
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
  startCard: { backgroundColor: '#101010', borderRadius: 8, borderWidth: 1, borderColor: '#202020', padding: 12, marginBottom: 14 },
  segment: { flexDirection: 'row', backgroundColor: '#080808', borderRadius: 8, borderWidth: 1, borderColor: '#202020', padding: 4, marginBottom: 12, gap: 4 },
  segmentButton: { flex: 1, minHeight: 38, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  segmentButtonActive: { backgroundColor: '#0a1d14', borderWidth: 1, borderColor: '#00e58b55' },
  segmentText: { color: '#777', fontSize: 12, fontWeight: '900' },
  segmentTextActive: { color: '#00e58b' },
  startButton: { minHeight: 42, borderRadius: 8, backgroundColor: '#00e58b', alignItems: 'center', justifyContent: 'center' },
  startText: { color: '#06130c', fontSize: 12, fontWeight: '900' },
  disabled: { opacity: 0.5 },
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
  empty: { color: '#aaa', fontSize: 14, lineHeight: 20, marginTop: 12 },
});
