import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import PlayerCard, { leagueDateFromRecord } from '@/components/PlayerCard';
import SportTeamLogo from '@/components/SportTeamLogo';
import { auth, db } from '@/constants/firebase';
import type { NbaScheduleGame } from '@/domain/nba/schedule';
import { isLiveResultRevealed } from '@/domain/nba/scheduleView';
import { buildNbaCupGroupStandings, buildNbaStandings, type StandingsRow } from '@/domain/nba/standings';
import {
  buildSportPlayerLeaderboard,
  playerLeaderboardTabsForSport,
  type SportPlayerLeaderboardRow,
  type SportPlayerLeaderboardStat,
} from '@/domain/sports/playerLeaderboards';

type Team = {
  id: string;
  teamId?: string;
  name?: string;
  abbreviation?: string;
  gmId?: string;
  players?: any[];
};

type StandingsViewMode = 'regular' | 'cup';
type StandingsContentMode = 'standings' | 'teamPlayers' | 'leaguePlayers';

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

function normalizeSport(value: unknown): 'nba' | 'madden' | 'mlb' {
  if (value === 'nfl' || value === 'madden') return 'madden';
  if (value === 'mlb') return 'mlb';
  return 'nba';
}

function teamName(team?: Team) {
  return team?.name || team?.abbreviation || 'Team';
}

export default function StandingsScreen() {
  const { leagueId, mode } = useLocalSearchParams<{ leagueId: string; mode?: StandingsContentMode }>();
  const router = useRouter();
  const [league, setLeague] = useState<any>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [schedule, setSchedule] = useState<ScheduleDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<StandingsViewMode>('regular');
  const initialContentMode: StandingsContentMode = mode === 'teamPlayers' || mode === 'leaguePlayers' ? mode : 'standings';
  const [contentMode, setContentMode] = useState<StandingsContentMode>(initialContentMode);
  const [playerStat, setPlayerStat] = useState<SportPlayerLeaderboardStat>('ppg');
  const [selectedPlayerRow, setSelectedPlayerRow] = useState<SportPlayerLeaderboardRow | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    setContentMode(initialContentMode);
    setSelectedPlayerRow(null);
  }, [initialContentMode]);

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
  const sport = normalizeSport(league?.sport);
  const supportsCup = sport === 'nba';
  const playerStatTabs = useMemo(() => playerLeaderboardTabsForSport(sport), [sport]);
  const activePlayerStat = playerStatTabs.some(tab => tab.key === playerStat) ? playerStat : playerStatTabs[0].key;
  const activeContentMode: StandingsContentMode = contentMode;
  const cupGames = useMemo(() => (
    supportsCup ? (schedule?.nbaCup?.games || []).filter(game => isLiveResultRevealed(game, nowMs)) : []
  ), [nowMs, schedule?.nbaCup?.games, supportsCup]);
  const hasNbaCup = supportsCup && cupGames.length > 0 && schedule?.nbaCup?.enabled !== false;
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
  const myTeam = useMemo(() => teams.find(team => team.gmId === auth.currentUser?.uid) || teams[0], [teams]);
  const teamScopedPlayerLeaders = useMemo(() => (
    buildSportPlayerLeaderboard({
      sport,
      teams: myTeam ? [myTeam] : [],
      stat: activePlayerStat,
      limit: 75,
    })
  ), [activePlayerStat, myTeam, sport]);
  const leaguePlayerLeaders = useMemo(() => (
    buildSportPlayerLeaderboard({
      sport,
      teams,
      stat: activePlayerStat,
      limit: 75,
    })
  ), [activePlayerStat, sport, teams]);
  const activePlayerLeaders = activeContentMode === 'teamPlayers' ? teamScopedPlayerLeaders : leaguePlayerLeaders;
  const visibleSections = activeContentMode === 'teamPlayers' || activeContentMode === 'leaguePlayers'
    ? [{ id: `players-${activePlayerStat}`, title: `${activePlayerStat.toUpperCase()} Leaders`, data: activePlayerLeaders }]
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
        keyExtractor={(item: any, index) => activeContentMode === 'teamPlayers' || activeContentMode === 'leaguePlayers' ? `${item.playerId}-${index}` : `${item.teamId}-${index}`}
        ListHeaderComponent={(
          <>
            <View style={styles.header}>
              <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                <Ionicons color="#ffffff" name="chevron-back" size={24} />
              </TouchableOpacity>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>{league?.name || 'League'}</Text>
                <Text style={styles.title}>
                  {activeContentMode === 'teamPlayers' ? 'Player Stats' : activeContentMode === 'leaguePlayers' ? 'League Stats' : 'Standings'}
                </Text>
              </View>
            </View>
            <View style={styles.summary}>
              <Text style={styles.summaryText}>{activeContentMode === 'teamPlayers' ? `${teamName(myTeam)} player stats` : activeContentMode === 'leaguePlayers' ? 'League-wide player stat leaders' : selectedViewMode === 'cup' ? 'NBA Cup standings' : 'Regular season standings'}</Text>
              <Text style={styles.summaryMeta}>
                {activeContentMode === 'teamPlayers'
                  ? `Team roster sorted by ${activePlayerStat.toUpperCase()}`
                  : activeContentMode === 'leaguePlayers'
                  ? `Sorted by ${activePlayerStat.toUpperCase()} · Tap any player for their card`
                  : `${completedGames} final games recorded · GB tracks the leader`}
              </Text>
            </View>
            <View style={styles.segment}>
              <TouchableOpacity
                style={[styles.segmentButton, activeContentMode === 'standings' && styles.segmentButtonActive]}
                onPress={() => setContentMode('standings')}
              >
                <Text style={[styles.segmentText, activeContentMode === 'standings' && styles.segmentTextActive]}>Standings</Text>
                <Text style={styles.segmentCount}>{standings.length}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segmentButton, activeContentMode === 'teamPlayers' && styles.segmentButtonActive]}
                onPress={() => setContentMode('teamPlayers')}
              >
                <Text style={[styles.segmentText, activeContentMode === 'teamPlayers' && styles.segmentTextActive]}>Player Stats</Text>
                <Text style={styles.segmentCount}>{teamScopedPlayerLeaders.length}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segmentButton, activeContentMode === 'leaguePlayers' && styles.segmentButtonActive]}
                onPress={() => setContentMode('leaguePlayers')}
              >
                <Text style={[styles.segmentText, activeContentMode === 'leaguePlayers' && styles.segmentTextActive]}>League Stats</Text>
                <Text style={styles.segmentCount}>{leaguePlayerLeaders.length}</Text>
              </TouchableOpacity>
            </View>
            {activeContentMode === 'standings' ? (
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
                  {playerStatTabs.map(tab => (
                    <TouchableOpacity
                      key={tab.key}
                      style={[styles.playerStatTab, activePlayerStat === tab.key && styles.playerStatTabActive]}
                      onPress={() => setPlayerStat(tab.key)}
                    >
                      <Text style={[styles.playerStatTabText, activePlayerStat === tab.key && styles.playerStatTabTextActive]}>{tab.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}
            {activeContentMode === 'standings' ? (
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
                <Text style={styles.headerCell}>{activePlayerStat.toUpperCase()}</Text>
              </View>
            )}
          </>
        )}
        renderSectionHeader={({ section }) => (
          activeContentMode === 'standings' && selectedViewMode === 'cup' && cupSections.length > 0 ? (
            <Text style={styles.groupHeader}>{section.title}</Text>
          ) : null
        )}
        renderItem={({ item, index }) => (
          activeContentMode === 'teamPlayers' || activeContentMode === 'leaguePlayers' ? (
            <TouchableOpacity style={styles.row} onPress={() => setSelectedPlayerRow(item as unknown as SportPlayerLeaderboardRow)} activeOpacity={0.78}>
              <Text style={styles.rank}>{index + 1}</Text>
              <View style={styles.playerLeaderBadge}>
                <Text style={styles.playerLeaderInitial}>{String((item as unknown as SportPlayerLeaderboardRow).name || '?')[0]}</Text>
              </View>
              <View style={styles.teamCopy}>
                <Text style={styles.teamName} numberOfLines={1}>{(item as unknown as SportPlayerLeaderboardRow).name}</Text>
                <Text style={styles.teamMeta}>{(item as unknown as SportPlayerLeaderboardRow).position} · {(item as unknown as SportPlayerLeaderboardRow).teamName}</Text>
              </View>
              <Text style={styles.value}>{(item as unknown as SportPlayerLeaderboardRow).teamAbbreviation}</Text>
              <Text style={styles.value}>{(item as unknown as SportPlayerLeaderboardRow).games}</Text>
              <Text style={[styles.value, styles.statValue]}>{(item as unknown as SportPlayerLeaderboardRow).valueText}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.row}>
              <Text style={styles.rank}>{index + 1}</Text>
              <View style={styles.logoDisc}>
                <SportTeamLogo sport={sport} abbr={(item as StandingsRow).abbreviation} era={league?.currentYear} style={styles.logo} fontSize={9} />
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
        ListEmptyComponent={<Text style={styles.empty}>{activeContentMode === 'teamPlayers' ? 'No team player stats yet. Sim games with this team to populate player stats.' : activeContentMode === 'leaguePlayers' ? 'No league player stats yet. Sim games to populate league leaders.' : selectedViewMode === 'cup' ? 'No NBA Cup standings yet. Complete or simulate Cup games to start the table.' : 'No standings yet. Complete or simulate games to start the table.'}</Text>}
      />
      {selectedPlayerRow ? (
        <PlayerCard
          player={selectedPlayerRow.player}
          era={league?.era || 'current'}
          sport={sport}
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
