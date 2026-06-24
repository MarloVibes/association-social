import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';
import type { NbaScheduleGame } from '@/domain/nba/schedule';

type Team = {
  id: string;
  name?: string;
  abbreviation?: string;
  gmId?: string;
};

type ScheduleDoc = {
  games?: NbaScheduleGame[];
  gamesPerTeam?: number;
  locked?: boolean;
};

export default function CalendarScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const router = useRouter();
  const uid = auth.currentUser?.uid;
  const [league, setLeague] = useState<any>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [schedule, setSchedule] = useState<ScheduleDoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!leagueId) return;
    const unsubscribeLeague = onSnapshot(doc(db, 'leagues', leagueId), snapshot => {
      if (!snapshot.exists()) {
        setLoading(false);
        return;
      }
      const nextLeague = { id: snapshot.id, ...snapshot.data() } as any;
      setLeague(nextLeague);
      const scheduleId = nextLeague.scheduleId || String(nextLeague.currentYear || 2025);
      const unsubscribeSchedule = onSnapshot(
        doc(db, 'leagues', leagueId, 'schedules', scheduleId),
        scheduleSnapshot => {
          setSchedule(scheduleSnapshot.exists() ? scheduleSnapshot.data() as ScheduleDoc : null);
          setLoading(false);
        },
      );
      return unsubscribeSchedule;
    });
    const unsubscribeTeams = onSnapshot(collection(db, 'leagues', leagueId, 'teams'), snapshot => {
      setTeams(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as Team)));
    });
    return () => {
      unsubscribeLeague();
      unsubscribeTeams();
    };
  }, [leagueId]);

  const myTeam = teams.find(team => team.gmId === uid);
  const teamNames = useMemo(
    () => new Map(teams.map(team => [team.id, team.abbreviation || team.name || team.id])),
    [teams],
  );
  const games = useMemo(() => {
    const allGames = [...(schedule?.games || [])].sort((a, b) => a.sequence - b.sequence);
    return myTeam
      ? allGames.filter(game => game.homeTeamId === myTeam.id || game.awayTeamId === myTeam.id)
      : allGames;
  }, [myTeam, schedule?.games]);

  if (loading) return <View style={styles.loading}><ActivityIndicator color="#00e58b" size="large" /></View>;

  return (
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.content}
        data={games}
        keyExtractor={item => item.id}
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
              <View style={styles.summary}>
                <Text style={styles.summaryText}>{schedule.gamesPerTeam || 0} games per team</Text>
                <Text style={styles.summaryMeta}>{myTeam ? 'Showing your team games' : 'Showing league schedule'}</Text>
              </View>
            )}
          </>
        )}
        renderItem={({ item }) => {
          const home = teamNames.get(item.homeTeamId) || item.homeTeamId;
          const away = teamNames.get(item.awayTeamId) || item.awayTeamId;
          const mine = myTeam && (item.homeTeamId === myTeam.id || item.awayTeamId === myTeam.id);
          return (
            <View style={[styles.gameRow, mine && styles.myGame]}>
              <View style={styles.weekBadge}>
                <Text style={styles.weekLabel}>W{item.week}</Text>
              </View>
              <View style={styles.gameCopy}>
                <Text style={styles.matchup}>{away} at {home}</Text>
                <Text style={styles.gameMeta}>Game {item.sequence} · {item.status}</Text>
              </View>
              {item.status === 'scheduled' && mine ? (
                <Text style={styles.selectable}>Ready</Text>
              ) : null}
            </View>
          );
        }}
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
  summaryText: { color: '#fff', fontSize: 17, fontWeight: '900' },
  summaryMeta: { color: '#777', fontSize: 12, fontWeight: '700', marginTop: 4 },
  gameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#111', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#202020', marginBottom: 8 },
  myGame: { borderColor: '#00e58b55', backgroundColor: '#0a1d14' },
  weekBadge: { width: 42, height: 34, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1d1d1d' },
  weekLabel: { color: '#aaa', fontSize: 11, fontWeight: '900' },
  gameCopy: { flex: 1 },
  matchup: { color: '#fff', fontSize: 14, fontWeight: '900' },
  gameMeta: { color: '#777', fontSize: 11, fontWeight: '700', marginTop: 3, textTransform: 'capitalize' },
  selectable: { color: '#00e58b', fontSize: 12, fontWeight: '900' },
});
