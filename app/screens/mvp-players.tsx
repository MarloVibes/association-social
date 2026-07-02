import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { isMutuallyBlocked } from '@/utils/blockCheck';
import { auth, db } from '@/constants/firebase';

const POS_COLORS: Record<string, string> = {
  PG: '#1d4ed8', SG: '#0891b2', SF: '#16a34a', PF: '#ca8a04', C: '#dc2626',
};

export default function MVPPlayersScreen() {
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId?: string }>();
  const targetUid = userId || auth.currentUser?.uid || '';
  const isOwnList = targetUid === auth.currentUser?.uid;
  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [ownerName, setOwnerName] = useState('');
  const [blockedState, setBlockedState] = useState<'unknown' | 'blocked' | 'ok'>('unknown');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (!targetUid) { setPlayers([]); setLoading(false); return; }

      // Silent block check: if viewing someone else's list and either party blocked, bail
      if (!isOwnList && auth.currentUser) {
        const blocked = await isMutuallyBlocked(auth.currentUser.uid, targetUid);
        if (blocked) {
          setBlockedState('blocked');
          setPlayers([]);
          setLoading(false);
          return;
        }
      }
      setBlockedState('ok');

      const q = query(collection(db, 'mvp_players'), where('ownerUid', '==', targetUid), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      setPlayers(list);
      if (!isOwnList && list.length > 0) {
        setOwnerName(list[0].ownerGamerTag || list[0].ownerUsername || '');
      }
    } catch (e) {
      console.warn('load mvp players failed', e);
      setPlayers([]);
    }
    setLoading(false);
  }, [isOwnList, targetUid]);

  useEffect(() => {
    load();
  }, [load]);

  // Silent block: render generic 'not available' state if mutually blocked
  if (blockedState === 'blocked') {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 30 }}>
        <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
          <Text style={{ color: '#666', fontSize: 36 }}>?</Text>
        </View>
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 6 }}>User not available</Text>
        <Text style={{ color: '#666', fontSize: 13, textAlign: 'center', marginBottom: 24 }}>This list is not available right now.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ backgroundColor: '#1a1a1a', paddingHorizontal: 22, paddingVertical: 11, borderRadius: 8 }}>
          <Text style={{ color: '#22c55e', fontSize: 14, fontWeight: '700' }}>← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.backLink}>← Back</Text></TouchableOpacity>
        <Text style={styles.title}>{isOwnList ? 'My Players' : (ownerName ? ownerName + "'s Players" : 'Players')}</Text>
        {isOwnList ? (
          <TouchableOpacity onPress={() => router.push('/screens/mvp-player-edit')}>
            <Text style={styles.addLink}>+ Add</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 60 }} />
        )}
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
                onPress={() => router.push({ pathname: isOwnList ? '/screens/mvp-player-edit' : '/screens/mvp-player-view', params: { playerId: p.id } })}
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
