import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import PlayerCard, { leagueDateFromRecord } from '@/components/PlayerCard';
import SportTeamLogo from '@/components/SportTeamLogo';
import { db } from '@/constants/firebase';
import { buildBasketballPlayerLeaderboard, type BasketballPlayerLeaderboardRow, type BasketballPlayerLeaderboardStat } from '@/domain/nba/playerLeaderboards';
import type { NbaScheduleGame } from '@/domain/nba/schedule';
import { isLiveResultRevealed } from '@/domain/nba/scheduleView';
import { buildNbaCupGroupStandings, buildNbaStandings, type StandingsRow } from '@/domain/nba/standings';

type Team = {
  id: string;
  teamId?: string;
  name?: string;
  abbreviation?: string;
  gmId?: string;
  players?: any[];
};

type StandingsViewMode = 'regular' | 'cup';
type StandingsContentMode = 'teams' | 'players';

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

function gamesBehindText(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '-';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

const PLAYER_STAT_TABS: { key: BasketballPlayerLeaderboardStat; label: string }[] = [
  { key: 'ppg', label: 'PPG' },
  { key: 'rpg', label: 'RPG' },
  { key: 'apg', label: 'APG' },
  { key: 'spg', label: 'SPG' },
  { key: 'bpg', label: 'BPG' },
];

export default function StandingsScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const router = useRouter();
  const [league, setLeague] = useState<any>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [schedule, setSchedule] = useState<ScheduleDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<StandingsViewMode>('regular');
  const [contentMode, setContentMode] = useState<StandingsContentMode>('teams');
  const [playerStat, setPlayerStat] = useState<BasketballPlayerLeaderboardStat>('ppg');
  const [selectedPlayerRow, setSelectedPlayerRow] = useState<BasketballPlayerLeaderboardRow | null>(null);
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
  const playerLeaders = useMemo(() => buildBasketballPlayerLeaderboard({
    teams,
    stat: playerStat,
    limit: 75,
  }), [playerStat, teams]);
  const visibleSections = contentMode === 'players'
    ? [{ id: `players-${playerStat}`, title: `${playerStat.toUpperCase()} Leaders`, data: playerLeaders }]
    : sections;
  const completedGames = useMemo(() => standingsGames.filter(game => game.status === 'final').length, [standingsGames]);
  const leagueDate = useMemo(() => leagueDateFromRecord(league || {}), [league]);

  if (loading) return <View style={styles.loading}><ActivityIndicator color="#00e58b" size="large" /></View>;

  return (
    <View style={styles.screen}>
      <SectionList<any, any>
        contentContainerStyle={styles.content}
        sections={visibleSections}
        stickySectionHeadersEnabled={false}
        keyExtractor={(item: any, index) => contentMode === 'players' ? `${item.playerId}-${index}` : `${item.teamId}-${index}`}
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
              <Text style={styles.summaryText}>{contentMode === 'players' ? 'Player stat leaders' : selectedViewMode === 'cup' ? 'NBA Cup standings' : 'Regular season standings'}</Text>
              <Text style={styles.summaryMeta}>
                {contentMode === 'players'
                  ? `Sorted by ${playerStat.toUpperCase()} · Tap any player for their card`
                  : `${completedGames} final games recorded · GB tracks the leader like NBA standings`}
              </Text>
            </View>
            <View style={styles.segment}>
              <TouchableOpacity
                style={[styles.segmentButton, contentMode === 'teams' && styles.segmentButtonActive]}
                onPress={() => setContentMode('teams')}
              >
                <Text style={[styles.segmentText, contentMode === 'teams' && styles.segmentTextActive]}>Teams</Text>
                <Text style={styles.segmentCount}>{standings.length}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segmentButton, contentMode === 'players' && styles.segmentButtonActive]}
                onPress={() => setContentMode('players')}
              >
                <Text style={[styles.segmentText, contentMode === 'players' && styles.segmentTextActive]}>Players</Text>
                <Text style={styles.segmentCount}>{playerLeaders.length}</Text>
              </TouchableOpacity>
            </View>
            {contentMode === 'teams' ? (
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
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.playerStatScroll}>
                <View style={styles.playerStatTabs}>
                  {PLAYER_STAT_TABS.map(tab => (
                    <TouchableOpacity
                      key={tab.key}
                      style={[styles.playerStatTab, playerStat === tab.key && styles.playerStatTabActive]}
                      onPress={() => setPlayerStat(tab.key)}
                    >
                      <Text style={[styles.playerStatTabText, playerStat === tab.key && styles.playerStatTabTextActive]}>{tab.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}
            {contentMode === 'teams' ? (
              <View style={styles.tableHeader}>
                <Text style={[styles.headerCell, { flex: 1 }]}>Team</Text>
                <Text style={styles.headerCell}>W</Text>
                <Text style={styles.headerCell}>L</Text>
                <Text style={styles.headerCell}>GB</Text>
              </View>
            ) : (
              <View style={styles.tableHeader}>
                <Text style={[styles.headerCell, { flex: 1 }]}>Player</Text>
                <Text style={styles.headerCell}>Team</Text>
                <Text style={styles.headerCell}>GP</Text>
                <Text style={styles.headerCell}>{playerStat.toUpperCase()}</Text>
              </View>
            )}
          </>
        )}
        renderSectionHeader={({ section }) => (
          contentMode === 'teams' && selectedViewMode === 'cup' && cupSections.length > 0 ? (
            <Text style={styles.groupHeader}>{section.title}</Text>
          ) : null
        )}
        renderItem={({ item, index }) => (
          contentMode === 'players' ? (
            <TouchableOpacity style={styles.row} onPress={() => setSelectedPlayerRow(item as unknown as BasketballPlayerLeaderboardRow)} activeOpacity={0.78}>
              <Text style={styles.rank}>{index + 1}</Text>
              <View style={styles.playerLeaderBadge}>
                <Text style={styles.playerLeaderInitial}>{String((item as unknown as BasketballPlayerLeaderboardRow).name || '?')[0]}</Text>
              </View>
              <View style={styles.teamCopy}>
                <Text style={styles.teamName} numberOfLines={1}>{(item as unknown as BasketballPlayerLeaderboardRow).name}</Text>
                <Text style={styles.teamMeta}>{(item as unknown as BasketballPlayerLeaderboardRow).position} · {(item as unknown as BasketballPlayerLeaderboardRow).teamName}</Text>
              </View>
              <Text style={styles.value}>{(item as unknown as BasketballPlayerLeaderboardRow).teamAbbreviation}</Text>
              <Text style={styles.value}>{(item as unknown as BasketballPlayerLeaderboardRow).games}</Text>
              <Text style={[styles.value, styles.statValue]}>{(item as unknown as BasketballPlayerLeaderboardRow).valueText}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.row}>
              <Text style={styles.rank}>{index + 1}</Text>
              <View style={styles.logoDisc}>
                <SportTeamLogo sport="nba" abbr={(item as StandingsRow).abbreviation} era={league?.currentYear} style={styles.logo} fontSize={9} />
              </View>
              <View style={styles.teamCopy}>
                <Text style={styles.teamName} numberOfLines={1}>{(item as StandingsRow).name}</Text>
                <Text style={styles.teamMeta}>{(item as StandingsRow).abbreviation} · {((item as StandingsRow).pct * 100).toFixed(0)}%</Text>
              </View>
              <Text style={styles.value}>{(item as StandingsRow).wins}</Text>
              <Text style={styles.value}>{(item as StandingsRow).losses}</Text>
              <Text style={styles.value}>{gamesBehindText((item as StandingsRow).gamesBehind || 0)}</Text>
            </View>
          )
        )}
        ListEmptyComponent={<Text style={styles.empty}>{contentMode === 'players' ? 'No player stats yet. Sim games to populate player leaders.' : selectedViewMode === 'cup' ? 'No NBA Cup standings yet. Complete or simulate Cup games to start the table.' : 'No standings yet. Complete or simulate games to start the table.'}</Text>}
      />
      {selectedPlayerRow ? (
        <PlayerCard
          player={selectedPlayerRow.player}
          era={league?.era || 'current'}
          sport={league?.sport || 'nba'}
          leagueId={String(leagueId || '')}
          teamId={selectedPlayerRow.teamId}
          leagueDate={leagueDate}
          visible={!!selectedPlayerRow}
          onClose={() => setSelectedPlayerRow(null)}
        />
      ) : null}
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
  playerStatScroll: { marginBottom: 14 },
  playerStatTabs: { flexDirection: 'row', gap: 8 },
  playerStatTab: { minWidth: 58, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: '#121212', borderWidth: 1, borderColor: '#252525' },
  playerStatTabActive: { backgroundColor: '#0a1d14', borderColor: '#00e58b' },
  playerStatTabText: { color: '#777', fontSize: 11, fontWeight: '900' },
  playerStatTabTextActive: { color: '#00e58b' },
  tableHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, marginBottom: 8, gap: 8 },
  headerCell: { width: 42, color: '#777', fontSize: 10, fontWeight: '900', textAlign: 'center', textTransform: 'uppercase' },
  groupHeader: { color: '#fff', fontSize: 13, fontWeight: '900', marginTop: 8, marginBottom: 8, paddingHorizontal: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#111', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#202020', marginBottom: 8 },
  rank: { width: 22, color: '#777', fontSize: 12, fontWeight: '900', textAlign: 'center' },
  logoDisc: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#181818', borderWidth: 1, borderColor: '#2a2a2a' },
  logo: { width: 29, height: 29 },
  playerLeaderBadge: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a1d14', borderWidth: 1, borderColor: '#00e58b55' },
  playerLeaderInitial: { color: '#00e58b', fontSize: 15, fontWeight: '900' },
  teamCopy: { flex: 1, minWidth: 0 },
  teamName: { color: '#fff', fontSize: 13, fontWeight: '900' },
  teamMeta: { color: '#777', fontSize: 10, fontWeight: '800', marginTop: 3 },
  value: { width: 42, color: '#fff', fontSize: 13, fontWeight: '900', textAlign: 'center' },
  statValue: { color: '#00e58b' },
  empty: { color: '#aaa', fontSize: 14, lineHeight: 20, marginTop: 12 },
});
