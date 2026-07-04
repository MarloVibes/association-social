import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import SportTeamLogo from '@/components/SportTeamLogo';
import { auth, db } from '@/constants/firebase';
import type { NbaScheduleGame } from '@/domain/nba/schedule';
import { buildNbaScoutingReport } from '@/domain/nba/scouting';
import { displayScheduleAbbr, normalizeScheduleKey, teamScheduleKeys } from '@/domain/nba/scheduleView';

type Team = {
  id: string;
  teamId?: string;
  abbreviation?: string;
  name?: string;
  gmId?: string;
};

type ScheduleDoc = {
  games?: NbaScheduleGame[];
};

type ScoutingPerformer = {
  playerId: string;
  name: string;
  teamSide: 'team' | 'opponent';
  minutes: number;
  points?: number;
  rebounds?: number;
  assists?: number;
  passingYards?: number;
  passingTouchdowns?: number;
  rushingYards?: number;
  receivingYards?: number;
  sacks?: number;
  interceptions?: number;
  hits?: number;
  rbi?: number;
  homeRuns?: number;
  inningsPitched?: number;
  strikeouts?: number;
  earnedRuns?: number;
};

function normalizeSport(value: unknown): 'nba' | 'madden' | 'mlb' {
  const sport = String(value || 'nba').toLowerCase();
  if (sport === 'nfl' || sport === 'madden') return 'madden';
  if (sport === 'mlb') return 'mlb';
  return 'nba';
}

function performerLine(player: ScoutingPerformer, sport: 'nba' | 'madden' | 'mlb') {
  if (sport === 'madden') {
    const yards = Number(player.passingYards || 0) + Number(player.rushingYards || 0) + Number(player.receivingYards || 0);
    const touchdowns = Number(player.passingTouchdowns || 0);
    if (yards > 0) return `${yards} yds, ${touchdowns} td`;
    return `${Number(player.sacks || 0)} sacks, ${Number(player.interceptions || 0)} int`;
  }
  if (sport === 'mlb') {
    if (Number(player.inningsPitched || 0) > 0 || Number(player.strikeouts || 0) > 0) {
      return `${Number(player.inningsPitched || 0)} IP, ${Number(player.strikeouts || 0)} K, ${Number(player.earnedRuns || 0)} ER`;
    }
    return `${Number(player.hits || 0)} H, ${Number(player.rbi || 0)} RBI, ${Number(player.homeRuns || 0)} HR`;
  }
  return `${player.points} pts, ${player.rebounds} reb, ${player.assists} ast`;
}

export default function ScoutingScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const router = useRouter();
  const uid = auth.currentUser?.uid;
  const [league, setLeague] = useState<any>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [schedule, setSchedule] = useState<ScheduleDoc | null>(null);
  const [loading, setLoading] = useState(true);

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

  const sport = normalizeSport(league?.sport);
  const myTeam = teams.find(team => team.gmId === uid);
  const scoutingTeamId = myTeam
    ? [...teamScheduleKeys(myTeam)][0] || normalizeScheduleKey(myTeam.abbreviation || myTeam.teamId || myTeam.id)
    : '';
  const report = useMemo(() => buildNbaScoutingReport({
    sport,
    teamId: scoutingTeamId,
    games: schedule?.games || [],
  }), [schedule?.games, scoutingTeamId, sport]);

  if (loading) return <View style={styles.loading}><ActivityIndicator color="#00e58b" size="large" /></View>;

  return (
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.content}
        data={report.games}
        keyExtractor={item => item.gameId}
        ListHeaderComponent={(
          <>
            <View style={styles.header}>
              <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                <Ionicons color="#ffffff" name="chevron-back" size={24} />
              </TouchableOpacity>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>{league?.name || 'League'}</Text>
                <Text style={styles.title}>Scouting</Text>
              </View>
            </View>
            <View style={styles.summary}>
              <Text style={styles.summaryText}>{myTeam?.name || 'Your Team'}</Text>
              <Text style={styles.summaryMeta}>Historical results and styles only. Active game plans stay hidden.</Text>
            </View>
          </>
        )}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.logoDisc}>
                <SportTeamLogo sport={sport} abbr={displayScheduleAbbr(item.opponentTeamId)} era={league?.currentYear} style={styles.logo} fontSize={9} />
              </View>
              <View style={styles.copy}>
                <Text style={styles.opponent}>vs {displayScheduleAbbr(item.opponentTeamId)}</Text>
                <Text style={styles.meta}>
                  {item.result} · {item.teamScore}-{item.opponentScore}
                </Text>
              </View>
              <Text style={[styles.result, item.result === 'W' ? styles.win : styles.loss]}>{item.result}</Text>
            </View>
            <Text style={styles.styleText}>
              Your style: {item.coachingStyle || 'Unknown'} · Opponent: {item.opponentCoachingStyle || 'Unknown'}
            </Text>
            {item.topPerformers.length > 0 ? (
              <View style={styles.detailBlock}>
                <Text style={styles.detailTitle}>Top Performers</Text>
                {item.topPerformers.map(player => (
                  <Text key={`${item.gameId}-${player.playerId}-top`} style={styles.detailLine} numberOfLines={1}>
                    {player.teamSide === 'team' ? 'You' : 'Opp'} · {player.name}: {performerLine(player, sport)}
                  </Text>
                ))}
              </View>
            ) : null}
            {item.minuteLeaders.length > 0 ? (
              <View style={styles.detailBlock}>
                <Text style={styles.detailTitle}>Minute Trends</Text>
                <Text style={styles.detailLine} numberOfLines={2}>
                  {item.minuteLeaders.map(player => `${player.teamSide === 'team' ? 'You' : 'Opp'} ${player.name} ${player.minutes}m`).join(' · ')}
                </Text>
              </View>
            ) : null}
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>{myTeam ? 'No completed games to scout yet.' : 'Claim a team before scouting.'}</Text>}
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
  card: { backgroundColor: '#111', borderRadius: 8, borderWidth: 1, borderColor: '#202020', padding: 12, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoDisc: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#181818', borderWidth: 1, borderColor: '#2a2a2a' },
  logo: { width: 31, height: 31 },
  copy: { flex: 1, minWidth: 0 },
  opponent: { color: '#fff', fontSize: 14, fontWeight: '900' },
  meta: { color: '#777', fontSize: 11, fontWeight: '800', marginTop: 3 },
  result: { fontSize: 16, fontWeight: '900' },
  win: { color: '#00e58b' },
  loss: { color: '#ff6b6b' },
  styleText: { color: '#888', fontSize: 11, fontWeight: '800', marginTop: 10 },
  detailBlock: { marginTop: 10, borderTopWidth: 1, borderTopColor: '#202020', paddingTop: 9, gap: 4 },
  detailTitle: { color: '#fff', fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  detailLine: { color: '#bdbdbd', fontSize: 11, fontWeight: '800', lineHeight: 16 },
  empty: { color: '#aaa', fontSize: 14, lineHeight: 20, marginTop: 12 },
});
