import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import SportTeamLogo from '@/components/SportTeamLogo';
import { db } from '@/constants/firebase';
import type { NbaScheduleGame } from '@/domain/nba/schedule';
import { isLiveResultRevealed } from '@/domain/nba/scheduleView';
import { buildNbaCupGroupStandings, buildNbaStandings, type StandingsRow } from '@/domain/nba/standings';

type Team = {
  id: string;
  teamId?: string;
  name?: string;
  abbreviation?: string;
  gmId?: string;
};

type StandingsViewMode = 'regular' | 'cup';

type ScheduleDoc = {
  games?: NbaScheduleGame[];
  nbaCup?: {
    enabled?: boolean;
    games?: NbaScheduleGame[];
    groups?: {
      id: string;
      teamIds: string[];
    }[];
  } | null;
  participants?: {
    scheduleTeamId?: string;
    sourceTeamDocId?: string | null;
    gmId?: string | null;
    abbreviation?: string;
    name?: string;
  }[];
};

export default function StandingsScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const router = useRouter();
  const [league, setLeague] = useState<any>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [schedule, setSchedule] = useState<ScheduleDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<StandingsViewMode>('regular');
  const [nowMs, setNowMs] = useState(Date.now());

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

  const regularGames = useMemo(() => (
    (schedule?.games || []).filter(game => isLiveResultRevealed(game, nowMs))
  ), [nowMs, schedule?.games]);
  const cupGames = useMemo(() => (
    (schedule?.nbaCup?.games || []).filter(game => isLiveResultRevealed(game, nowMs))
  ), [nowMs, schedule?.nbaCup?.games]);
  const hasNbaCup = cupGames.length > 0 && schedule?.nbaCup?.enabled !== false;
  const selectedViewMode: StandingsViewMode = viewMode === 'cup' && hasNbaCup ? 'cup' : 'regular';
  const standingsGames = selectedViewMode === 'cup' ? cupGames : regularGames;
  const standings = useMemo<StandingsRow[]>(() => buildNbaStandings({
    games: standingsGames,
    participants: schedule?.participants || [],
    teams,
  }), [standingsGames, schedule?.participants, teams]);
  const cupSections = useMemo(() => buildNbaCupGroupStandings({
    games: cupGames,
    groups: schedule?.nbaCup?.groups || [],
    participants: schedule?.participants || [],
    teams,
  }).map(group => ({
    id: group.id,
    title: group.id,
    data: group.rows,
  })), [cupGames, schedule?.nbaCup?.groups, schedule?.participants, teams]);
  const sections = selectedViewMode === 'cup' && cupSections.length > 0
    ? cupSections
    : [{ id: 'regular', title: 'League', data: standings }];
  const completedGames = useMemo(() => standingsGames.filter(game => game.status === 'final').length, [standingsGames]);

  if (loading) return <View style={styles.loading}><ActivityIndicator color="#00e58b" size="large" /></View>;

  return (
    <View style={styles.screen}>
      <SectionList
        contentContainerStyle={styles.content}
        sections={sections}
        stickySectionHeadersEnabled={false}
        keyExtractor={(item, index) => `${item.teamId}-${index}`}
        ListHeaderComponent={(
          <>
            <View style={styles.header}>
              <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                <Ionicons color="#ffffff" name="chevron-back" size={24} />
              </TouchableOpacity>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>{league?.name || 'League'}</Text>
                <Text style={styles.title}>Standings</Text>
              </View>
            </View>
            <View style={styles.summary}>
              <Text style={styles.summaryText}>{selectedViewMode === 'cup' ? 'NBA Cup standings' : 'Regular season standings'}</Text>
              <Text style={styles.summaryMeta}>{completedGames} finals recorded · Sorted by win percentage, wins, then point differential</Text>
            </View>
            <View style={styles.segment}>
              <TouchableOpacity
                style={[styles.segmentButton, selectedViewMode === 'regular' && styles.segmentButtonActive]}
                onPress={() => setViewMode('regular')}
              >
                <Text style={[styles.segmentText, selectedViewMode === 'regular' && styles.segmentTextActive]}>Season</Text>
                <Text style={styles.segmentCount}>{regularGames.filter(game => game.status === 'final').length}</Text>
              </TouchableOpacity>
              {hasNbaCup ? (
                <TouchableOpacity
                  style={[styles.segmentButton, selectedViewMode === 'cup' && styles.segmentButtonActive]}
                  onPress={() => setViewMode('cup')}
                >
                  <Text style={[styles.segmentText, selectedViewMode === 'cup' && styles.segmentTextActive]}>NBA Cup</Text>
                  <Text style={styles.segmentCount}>{cupGames.filter(game => game.status === 'final').length}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={styles.tableHeader}>
              <Text style={[styles.headerCell, { flex: 1 }]}>Team</Text>
              <Text style={styles.headerCell}>W</Text>
              <Text style={styles.headerCell}>L</Text>
              <Text style={styles.headerCell}>Diff</Text>
            </View>
          </>
        )}
        renderSectionHeader={({ section }) => (
          selectedViewMode === 'cup' && cupSections.length > 0 ? (
            <Text style={styles.groupHeader}>{section.title}</Text>
          ) : null
        )}
        renderItem={({ item, index }) => (
          <View style={styles.row}>
            <Text style={styles.rank}>{index + 1}</Text>
            <View style={styles.logoDisc}>
              <SportTeamLogo sport="nba" abbr={item.abbreviation} era={league?.currentYear} style={styles.logo} fontSize={9} />
            </View>
            <View style={styles.teamCopy}>
              <Text style={styles.teamName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.teamMeta}>{item.abbreviation} · {(item.pct * 100).toFixed(0)}%</Text>
            </View>
            <Text style={styles.value}>{item.wins}</Text>
            <Text style={styles.value}>{item.losses}</Text>
            <Text style={[styles.value, item.pointDiff > 0 && styles.positive, item.pointDiff < 0 && styles.negative]}>
              {item.pointDiff > 0 ? `+${item.pointDiff}` : item.pointDiff}
            </Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>{selectedViewMode === 'cup' ? 'No NBA Cup standings yet. Complete or simulate Cup games to start the table.' : 'No standings yet. Complete or simulate games to start the table.'}</Text>}
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
  segment: { flexDirection: 'row', backgroundColor: '#101010', borderRadius: 8, borderWidth: 1, borderColor: '#202020', padding: 4, marginBottom: 14, gap: 4 },
  segmentButton: { flex: 1, minHeight: 42, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  segmentButtonActive: { backgroundColor: '#0a1d14', borderWidth: 1, borderColor: '#00e58b55' },
  segmentText: { color: '#777', fontSize: 12, fontWeight: '900' },
  segmentTextActive: { color: '#00e58b' },
  segmentCount: { color: '#555', fontSize: 10, fontWeight: '800', marginTop: 2 },
  tableHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, marginBottom: 8, gap: 8 },
  headerCell: { width: 42, color: '#777', fontSize: 10, fontWeight: '900', textAlign: 'center', textTransform: 'uppercase' },
  groupHeader: { color: '#fff', fontSize: 13, fontWeight: '900', marginTop: 8, marginBottom: 8, paddingHorizontal: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#111', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#202020', marginBottom: 8 },
  rank: { width: 22, color: '#777', fontSize: 12, fontWeight: '900', textAlign: 'center' },
  logoDisc: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#181818', borderWidth: 1, borderColor: '#2a2a2a' },
  logo: { width: 29, height: 29 },
  teamCopy: { flex: 1, minWidth: 0 },
  teamName: { color: '#fff', fontSize: 13, fontWeight: '900' },
  teamMeta: { color: '#777', fontSize: 10, fontWeight: '800', marginTop: 3 },
  value: { width: 42, color: '#fff', fontSize: 13, fontWeight: '900', textAlign: 'center' },
  positive: { color: '#00e58b' },
  negative: { color: '#ff6b6b' },
  empty: { color: '#aaa', fontSize: 14, lineHeight: 20, marginTop: 12 },
});
