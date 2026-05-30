import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs, orderBy } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY',
  projectId: 'association-social',
};
if (!getApps().length) initializeApp(firebaseConfig);
const db = getFirestore();
const auth = getAuth();

const POS_COLORS: Record<string, string> = {
  PG: '#1d4ed8', SG: '#0891b2', SF: '#16a34a', PF: '#ca8a04', C: '#dc2626',
};

export default function MVPPlayersScreen() {
  const router = useRouter();
  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubFocus = router.canGoBack ? load() : load();
    return () => {};
  }, []);

  async function load() {
    setLoading(true);
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) { setPlayers([]); setLoading(false); return; }
      const q = query(collection(db, 'mvp_players'), where('ownerUid', '==', uid), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setPlayers(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    } catch (e) {
      console.warn('load mvp players failed', e);
      setPlayers([]);
    }
    setLoading(false);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.backLink}>← Back</Text></TouchableOpacity>
        <Text style={styles.title}>My Players</Text>
        <TouchableOpacity onPress={() => router.push('/screens/mvp-player-edit')}>
          <Text style={styles.addLink}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={[styles.center, { flex: 1 }]}><ActivityIndicator color='#22c55e' /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
          {players.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🏀</Text>
              <Text style={styles.emptyTitle}>No MVP cards yet</Text>
              <Text style={styles.emptyDesc}>Tap + Add to create your first player card.</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/screens/mvp-player-edit')}>
                <Text style={styles.emptyBtnText}>+ Add Player Card</Text>
              </TouchableOpacity>
            </View>
          ) : (
            players.map(p => (
              <TouchableOpacity
                key={p.id}
                style={styles.playerCard}
                onPress={() => router.push({ pathname: '/screens/mvp-player-edit', params: { playerId: p.id } })}
              >
                <View style={[styles.ovrCircle, { backgroundColor: POS_COLORS[p.position] || '#666' }]}>
                  <Text style={styles.ovrText}>{p.overall}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={styles.playerName}>{p.playerName || 'Unnamed'}</Text>
                  <Text style={styles.playerMeta}>{p.position} · {p.archetype || 'No archetype'}</Text>
                  <Text style={styles.playerGT}>{p.ownerGamerTag || ''}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  backLink: { color: '#22c55e', fontSize: 16, fontWeight: '600' },
  addLink: { color: '#22c55e', fontSize: 16, fontWeight: '700' },
  title: { color: '#fff', fontSize: 18, fontWeight: '800' },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 56, marginBottom: 12 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  emptyDesc: { color: '#888', fontSize: 14, marginBottom: 20, textAlign: 'center', paddingHorizontal: 32 },
  emptyBtn: { backgroundColor: '#22c55e', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  emptyBtnText: { color: '#000', fontSize: 15, fontWeight: '700' },
  playerCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0a0a0a', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#1a1a1a', marginBottom: 10 },
  ovrCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  ovrText: { color: '#fff', fontSize: 22, fontWeight: '900' },
  playerName: { color: '#fff', fontSize: 17, fontWeight: '700', marginBottom: 2 },
  playerMeta: { color: '#aaa', fontSize: 13, marginBottom: 2 },
  playerGT: { color: '#666', fontSize: 12 },
  chevron: { color: '#888', fontSize: 24, fontWeight: '300' },
});
