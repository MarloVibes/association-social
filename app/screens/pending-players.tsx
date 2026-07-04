import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Image, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, getDocs, getDoc, doc, deleteDoc, setDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/constants/firebase';
import { playerStatSummary } from '@/domain/sports/playerStatSummary';

export default function PendingPlayersScreen() {
  const params = useLocalSearchParams<{ leagueId: string }>();
  const router = useRouter();
  const leagueId = params.leagueId;
  const [pending, setPending] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCommissioner, setIsCommissioner] = useState(false);
  const [leagueSport, setLeagueSport] = useState('nba');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const leagueSnap = await getDoc(doc(db, 'leagues', leagueId));
      if (leagueSnap.exists()) {
        const ld = leagueSnap.data() as any;
        setLeagueSport(ld.sport || 'nba');
        const myUid = auth.currentUser?.uid;
        const commUids = [ld.commissionerId, ...(ld.coCommissioners || [])].filter(Boolean);
        setIsCommissioner(myUid ? commUids.includes(myUid) : false);
      }
      const snap = await getDocs(collection(db, 'leagues', leagueId, 'pending_players'));
      const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      setPending(list);
    } catch (e) {
      console.error('pending load failed', e);
    }
    setLoading(false);
  }, [leagueId]);

  useEffect(() => { load(); }, [load]);

  async function approve(p: any) {
    Alert.alert('Approve Player', `Approve ${p.full_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', style: 'default', onPress: async () => {
          try {
            const { id, submittedBy, submittedAt, status, ...rest } = p;
            // Phase 4: write approved custom players to vault
            await setDoc(doc(db, 'players', id), {
              ...rest,
              sport: p.sport || leagueSport,
              bref_id: id,
              is_custom: true,
              created_by_league: leagueId,
              created_by_uid: submittedBy || '',
              available_in: ['all'],
              eras: ['all'],
            });
            await deleteDoc(doc(db, 'leagues', leagueId, 'pending_players', id));
            if (submittedBy) {
              await addDoc(collection(db, 'users', submittedBy, 'notifications'), {
                type: 'custom_player_approved',
                leagueId,
                playerName: p.full_name,
                createdAt: serverTimestamp(),
                read: false,
              });
            }
            Alert.alert('Approved', `${p.full_name} added to the league.`);
            load();
          } catch (e) { console.error(e); Alert.alert('Error', 'Failed to approve.'); }
      }},
    ]);
  }

  async function deny(p: any) {
    Alert.alert('Deny Player', `Deny ${p.full_name}? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Deny', style: 'destructive', onPress: async () => {
          try {
            await deleteDoc(doc(db, 'leagues', leagueId, 'pending_players', p.id));
            if (p.submittedBy) {
              await addDoc(collection(db, 'users', p.submittedBy, 'notifications'), {
                type: 'custom_player_denied',
                leagueId,
                playerName: p.full_name,
                createdAt: serverTimestamp(),
                read: false,
              });
            }
            Alert.alert('Denied', `${p.full_name} removed.`);
            load();
          } catch (e) { console.error(e); Alert.alert('Error', 'Failed to deny.'); }
      }},
    ]);
  }

  function edit(p: any) {
    router.push({
      pathname: '/screens/create-player',
      params: { leagueId, era: p.seasons?.[0]?.season || '2024-25', sport: leagueSport, pendingId: p.id },
    });
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size='large' color='#00ff87' /></View>;
  }

  if (!isCommissioner) {
    return (
      <View style={styles.container}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Text style={styles.backText}>← Back</Text></TouchableOpacity>
        <Text style={styles.errorText}>Only commissioners can review pending players.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Text style={styles.backText}>← Back</Text></TouchableOpacity>
      <Text style={styles.title}>Pending Player Reviews</Text>
      <Text style={styles.subtitle}>{pending.length} pending</Text>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {pending.length === 0 ? (
          <Text style={styles.emptyText}>No pending submissions.</Text>
        ) : (
          pending.map(p => {
            return (
              <View key={p.id} style={styles.card}>
                <View style={styles.cardRow}>
                  {p.photo_url || p.photoUrl ? (
                    <Image source={{ uri: p.photo_url || p.photoUrl }} style={styles.photo} />
                  ) : (
                    <View style={styles.photoPlaceholder}><Text style={styles.photoInitial}>{(p.full_name || '?')[0]}</Text></View>
                  )}
                  <View style={styles.cardInfo}>
                    <Text style={styles.playerName}>{p.full_name}</Text>
                    <Text style={styles.playerMeta}>{p.position} · Age {p.age} · {p.height}</Text>
                    <Text style={styles.statsLine}>{playerStatSummary(p, leagueSport)}</Text>
                  </View>
                </View>
                <View style={styles.actionRow}>
                  <TouchableOpacity style={[styles.actionBtn, styles.approveBtn]} onPress={() => approve(p)}>
                    <Text style={styles.actionBtnText}>✓ Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, styles.editBtn]} onPress={() => edit(p)}>
                    <Text style={[styles.actionBtnText, { color: '#3B82F6' }]}>✎ Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, styles.denyBtn]} onPress={() => deny(p)}>
                    <Text style={[styles.actionBtnText, { color: '#ff4444' }]}>✗ Deny</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', paddingTop: 60 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  backBtn: { paddingHorizontal: 16, paddingBottom: 8 },
  backText: { color: '#00ff87', fontSize: 16, fontWeight: '600' },
  title: { color: '#fff', fontSize: 22, fontWeight: '800', paddingHorizontal: 16 },
  subtitle: { color: '#888', fontSize: 13, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  emptyText: { color: '#666', textAlign: 'center', marginTop: 40, fontSize: 15 },
  errorText: { color: '#ff4444', textAlign: 'center', marginTop: 40, fontSize: 15 },
  card: { backgroundColor: '#111', borderRadius: 10, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#222' },
  cardRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  photo: { width: 56, height: 56, borderRadius: 28, marginRight: 12 },
  photoPlaceholder: { width: 56, height: 56, borderRadius: 28, marginRight: 12, backgroundColor: '#333', alignItems: 'center', justifyContent: 'center' },
  photoInitial: { color: '#fff', fontSize: 24, fontWeight: '700' },
  cardInfo: { flex: 1 },
  playerName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  playerMeta: { color: '#888', fontSize: 12, marginTop: 2 },
  statsLine: { color: '#aaa', fontSize: 12, marginTop: 4 },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: { flex: 1, paddingVertical: 10, borderRadius: 6, alignItems: 'center', borderWidth: 1 },
  approveBtn: { backgroundColor: '#0a2a1a', borderColor: '#00ff87' },
  editBtn: { backgroundColor: '#0a1a2a', borderColor: '#3B82F6' },
  denyBtn: { backgroundColor: '#2a0a0a', borderColor: '#ff4444' },
  actionBtnText: { color: '#00ff87', fontSize: 13, fontWeight: '700' },
});
