import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { getTeamColors, getTeamLogoUrl } from '@/constants/teamColors';

const firebaseConfig = {
  apiKey: "AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY",
  projectId: "association-social",
};
if (!getApps().length) initializeApp(firebaseConfig);
const db = getFirestore();

export default function LeagueRostersScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentYear, setCurrentYear] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!leagueId) return;
    (async () => {
      try {
        const leagueSnap = await getDoc(doc(db, 'leagues', leagueId));
        if (leagueSnap.exists()) {
          const d = leagueSnap.data() as any;
          if (d.currentYear) setCurrentYear(d.currentYear);
        }
        const teamsSnap = await getDocs(collection(db, 'leagues', leagueId, 'teams'));
        const list = teamsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        // Sort: owned teams first, then alphabetical
        list.sort((a, b) => {
          const aOwned = !!a.ownerUid;
          const bOwned = !!b.ownerUid;
          if (aOwned && !bOwned) return -1;
          if (!aOwned && bOwned) return 1;
          return (a.name || '').localeCompare(b.name || '');
        });
        setTeams(list);
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [leagueId]);

  if (loading) {
    return <View style={styles.loadingContainer}><ActivityIndicator color="#00ff87" /></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.inner}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>League Rosters</Text>
        <View style={{ width: 60 }} />
      </View>

      <Text style={styles.subtitle}>{teams.length} teams · tap to view roster</Text>

      {teams.map(team => {
        const colors = getTeamColors(team.abbr || 'ATL', currentYear);
        const logo = getTeamLogoUrl(team.abbr || 'ATL', currentYear);
        const isOwned = !!team.ownerUid;
        return (
          <TouchableOpacity
            key={team.id}
            style={[styles.teamCard, { borderColor: colors[0], backgroundColor: colors[0] + '11' }]}
            onPress={() => router.push({ pathname: '/screens/team-roster', params: { leagueId, teamId: team.id } })}
          >
            <Image source={{ uri: logo }} style={styles.teamLogo} />
            <View style={styles.teamInfo}>
              <Text style={styles.teamName}>{team.name || team.abbr}</Text>
              <Text style={styles.teamMeta}>
                {team.wins || 0}–{team.losses || 0} · {isOwned ? '🧑 ' + (team.gmName || 'GM') : '🤖 Unowned'}
              </Text>
              <Text style={styles.rosterCount}>{(team.players || []).length} players</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        );
      })}

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  loadingContainer: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' },
  inner: { padding: 20, paddingTop: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  backText: { color: '#00ff87', fontSize: 15, fontWeight: '600' },
  title: { color: '#fff', fontSize: 20, fontWeight: '800' },
  subtitle: { color: '#666', fontSize: 12, marginBottom: 16 },
  teamCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  teamLogo: { width: 40, height: 40, marginRight: 12 },
  teamInfo: { flex: 1 },
  teamName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  teamMeta: { color: '#ccc', fontSize: 12, marginTop: 2 },
  rosterCount: { color: '#888', fontSize: 11, marginTop: 1 },
  chevron: { color: '#666', fontSize: 22, fontWeight: '400' },
});
