import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { auth, db } from '@/constants/firebase';
import { doc, getDoc, updateDoc, arrayRemove } from 'firebase/firestore';

export default function BlockedUsersScreen() {
  const router = useRouter();
  const [blockedList, setBlockedList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) { setBlockedList([]); setLoading(false); return; }
      const meSnap = await getDoc(doc(db, 'users', uid));
      const uids: string[] = meSnap.exists() ? (meSnap.data().blockedUsers || []) : [];
      if (uids.length === 0) {
        setBlockedList([]);
        setLoading(false);
        return;
      }
      const fetched = await Promise.all(
        uids.map(async (bUid) => {
          try {
            const snap = await getDoc(doc(db, 'users', bUid));
            if (!snap.exists()) return { uid: bUid, username: 'Unknown', gamerTag: '' };
            return { uid: bUid, ...(snap.data() as any) };
          } catch {
            return { uid: bUid, username: 'Unknown', gamerTag: '' };
          }
        })
      );
      setBlockedList(fetched);
    } catch (e: any) {
      console.warn('blocked list load failed', e);
      setBlockedList([]);
    }
    setLoading(false);
  }

  function confirmUnblock(target: any) {
    const name = target.gamerTag || target.username || 'this user';
    Alert.alert(
      `Unblock ${name}?`,
      'They will be able to message you and find your profile again.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unblock', onPress: () => doUnblock(target.uid) },
      ]
    );
  }

  async function doUnblock(targetUid: string) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setBusyUid(targetUid);
    try {
      await updateDoc(doc(db, 'users', uid), {
        blockedUsers: arrayRemove(targetUid),
      });
      setBlockedList(prev => prev.filter(b => b.uid !== targetUid));
    } catch (e: any) {
      Alert.alert('Unblock failed', e.message);
    }
    setBusyUid(null);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.backLink}>← Back</Text></TouchableOpacity>
        <Text style={styles.title}>Blocked Users</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color='#22c55e' /></View>
      ) : blockedList.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>🛡️</Text>
          <Text style={styles.emptyTitle}>No blocked users</Text>
          <Text style={styles.emptyDesc}>People you block will appear here. Tap a user on their profile to block them.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Text style={styles.subLabel}>{blockedList.length} user{blockedList.length !== 1 ? 's' : ''} blocked</Text>
          {blockedList.map(b => (
            <View key={b.uid} style={styles.row}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(b.gamerTag || b.username || '?').charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.name}>{b.gamerTag || b.username || 'Unknown'}</Text>
                {b.username && b.gamerTag && b.username !== b.gamerTag && (
                  <Text style={styles.sub}>@{b.username}</Text>
                )}
              </View>
              <TouchableOpacity
                style={[styles.unblockBtn, busyUid === b.uid && { opacity: 0.5 }]}
                onPress={() => confirmUnblock(b)}
                disabled={busyUid === b.uid}
              >
                <Text style={styles.unblockText}>{busyUid === b.uid ? '...' : 'Unblock'}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  backLink: { color: '#22c55e', fontSize: 16, fontWeight: '600' },
  title: { color: '#fff', fontSize: 18, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyIcon: { fontSize: 56, marginBottom: 12 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptyDesc: { color: '#888', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  subLabel: { color: '#666', fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 10, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0a0a0a', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#1a1a1a', marginBottom: 8 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#444', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 17, fontWeight: '900' },
  name: { color: '#fff', fontSize: 15, fontWeight: '700' },
  sub: { color: '#666', fontSize: 12, marginTop: 2 },
  unblockBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: '#22c55e' },
  unblockText: { color: '#000', fontSize: 13, fontWeight: '800' },
});
