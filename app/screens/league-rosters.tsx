import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { getTeamColors, getTeamLogoUrl } from '@/constants/teamColors';

const firebaseConfig = {
  apiKey: "AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY",
  projectId: "association-social",
};
if (!getApps().length) initializeApp(firebaseConfig);
const db = getFirestore();

// Adjust hex color brightness by percentage. Negative = darker, positive = lighter.
function adjustColor(hex: string, percent: number): string {
  const clean = hex.replace('#', '');
  let r = parseInt(clean.substring(0, 2), 16);
  let g = parseInt(clean.substring(2, 4), 16);
  let b = parseInt(clean.substring(4, 6), 16);
  const amt = Math.floor(255 * (percent / 100));
  r = Math.max(0, Math.min(255, r + amt));
  g = Math.max(0, Math.min(255, g + amt));
  b = Math.max(0, Math.min(255, b + amt));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

const auth = getAuth();

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
        // Sort: my team first, then owned (alphabetical), then unowned (alphabetical)
        const myUid = auth.currentUser?.uid;
        list.sort((a, b) => {
          const aIsMine = a.gmId === myUid;
          const bIsMine = b.gmId === myUid;
          if (aIsMine && !bIsMine) return -1;
          if (!aIsMine && bIsMine) return 1;
          const aOwned = !!a.gmId;
          const bOwned = !!b.gmId;
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
        const isOwned = !!team.gmId;
        // Luminance check for text contrast on bold solid team-color background
        const hex = (colors[0] || '#222').replace('#', '');
        const r = parseInt(hex.substring(0,2), 16) / 255;
        const g = parseInt(hex.substring(2,4), 16) / 255;
        const b = parseInt(hex.substring(4,6), 16) / 255;
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const textColor = lum < 0.5 ? '#ffffff' : '#0a0a0a';
        const subColor = lum < 0.5 ? '#ffffffcc' : '#0a0a0acc';
        return (
          <TouchableOpacity
            key={team.id}
            style={[styles.teamCardWrapper, { shadowColor: colors[0] }]}
            onPress={() => router.push({ pathname: '/screens/team-roster', params: { leagueId, teamId: team.id } })}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={[adjustColor(colors[0], 12), colors[0], adjustColor(colors[0], -18)]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={[styles.teamCard, { borderColor: adjustColor(colors[0], -25) }]}
            >
              <LinearGradient
                colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 0.6 }}
                style={styles.glossOverlay}
                pointerEvents="none"
              />
              <Image source={{ uri: logo }} style={styles.teamLogo} />
              <View style={styles.teamInfo}>
                <View style={styles.teamNameRow}>
                  <Text style={[styles.teamName, { color: textColor }]}>{team.name || team.abbr}</Text>
                  {team.gmId === auth.currentUser?.uid ? (
                    <View style={styles.yourTeamBadge}><Text style={styles.yourTeamBadgeText}>YOUR TEAM</Text></View>
                  ) : null}
                </View>
                <Text style={[styles.teamMeta, { color: subColor }]}>
                  {team.wins || 0}–{team.losses || 0} · {isOwned ? '🧑 ' + (team.gmName || 'GM') : '🤖 Unowned'}
                </Text>
                <Text style={[styles.rosterCount, { color: subColor }]}>{(team.players || []).length} players</Text>
              </View>
              <Text style={[styles.chevron, { color: textColor }]}>›</Text>
            </LinearGradient>
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
  teamCardWrapper: {
    marginBottom: 12,
    borderRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
  },
  teamCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  glossOverlay: { position: 'absolute', top: 0, left: 0, right: 0, height: '60%', borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  teamLogo: { width: 40, height: 40, marginRight: 12 },
  teamInfo: { flex: 1 },
  teamName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  teamNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  yourTeamBadge: { backgroundColor: '#0a2a1a', borderWidth: 1, borderColor: '#00ff87', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  yourTeamBadgeText: { color: '#00ff87', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  teamMeta: { color: '#ccc', fontSize: 12, marginTop: 2 },
  rosterCount: { color: '#888', fontSize: 11, marginTop: 1 },
  chevron: { color: '#666', fontSize: 22, fontWeight: '400' },
});
