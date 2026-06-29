import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '@/constants/firebase';

const CONSOLES = [
  { key: 'ps', name: 'PlayStation', icon: '🎮', colors: ['#003791', '#0070d1'] as const },
  { key: 'xbox', name: 'Xbox', icon: '🟢', colors: ['#107c10', '#52b043'] as const },
];

function formatTimeAgo(ms: number): string {
  if (!ms) return '';
  const diff = Date.now() - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'now';
  const min = Math.floor(sec / 60);
  if (min < 60) return min + 'm';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + 'h';
  const day = Math.floor(hr / 24);
  return day + 'd';
}

export default function MVPLockerRoomScreen() {
  const router = useRouter();
  const [groupChats, setGroupChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    loadGroupChats();
  }, []));

  async function loadGroupChats() {
    setLoading(true);
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) { setGroupChats([]); setLoading(false); return; }
      const q = query(collection(db, 'locker_groups'), where('members', 'array-contains', uid));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      list.sort((a: any, b: any) => {
        const aT = a.lastMessageAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
        const bT = b.lastMessageAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
        return bT - aT;
      });
      setGroupChats(list);
    } catch (e) {
      console.warn('group chats load failed', e);
      setGroupChats([]);
    }
    setLoading(false);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.backLink}>← Back</Text></TouchableOpacity>
        <Text style={styles.title}>The Locker Room</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        <Text style={styles.sectionLabel}>CONSOLE ROOMS</Text>
        {CONSOLES.map(c => (
          <TouchableOpacity
            key={c.key}
            onPress={() => router.push({ pathname: '/screens/locker-console-chat', params: { console: c.key } })}
            activeOpacity={0.85}
            style={[styles.consoleShadow, { shadowColor: c.colors[0] }]}
          >
            <LinearGradient colors={c.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.consoleCard}>
              <LinearGradient
                colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 0.6 }}
                style={styles.gloss}
                pointerEvents='none'
              />
              <Text style={styles.consoleIcon}>{c.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.consoleName}>{c.name}</Text>
                <Text style={styles.consoleDesc}>Tap to chat with {c.name} players</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </LinearGradient>
          </TouchableOpacity>
        ))}

        <View style={styles.groupHeader}>
          <Text style={styles.sectionLabel}>YOUR GROUP CHATS</Text>
          <TouchableOpacity onPress={() => router.push('/screens/locker-group-create')}>
            <Text style={styles.newLink}>+ New</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingBox}><ActivityIndicator color='#22c55e' /></View>
        ) : groupChats.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyTitle}>No group chats yet</Text>
            <Text style={styles.emptyDesc}>Create a chat to invite friends for pickup games.</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/screens/locker-group-create')}>
              <Text style={styles.emptyBtnText}>+ Create Group Chat</Text>
            </TouchableOpacity>
          </View>
        ) : (
          groupChats.map(g => (
            <TouchableOpacity
              key={g.id}
              style={styles.groupCard}
              onPress={() => router.push({ pathname: '/screens/locker-group-chat', params: { chatId: g.id } })}
            >
              <View style={styles.groupAvatar}>
                <Text style={styles.groupAvatarText}>{(g.name || '?').charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.groupName} numberOfLines={1}>{g.name || 'Unnamed Chat'}</Text>
                <Text style={styles.groupMeta} numberOfLines={1}>
                  {g.memberCount || g.members?.length || 0} members
                  {g.lastMessage ? ' · ' + g.lastMessage : ''}
                </Text>
              </View>
              <Text style={styles.groupTime}>{formatTimeAgo(g.lastMessageAt?.toMillis?.() || 0)}</Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  backLink: { color: '#22c55e', fontSize: 16, fontWeight: '600' },
  title: { color: '#fff', fontSize: 18, fontWeight: '800' },
  sectionLabel: { color: '#888', fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginBottom: 12, marginTop: 6 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24 },
  newLink: { color: '#22c55e', fontSize: 14, fontWeight: '700' },
  consoleShadow: { marginBottom: 12, borderRadius: 14, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 6 },
  consoleCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  gloss: { position: 'absolute', top: 0, left: 0, right: 0, height: '60%', borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  consoleIcon: { fontSize: 30, marginRight: 14 },
  consoleName: { color: '#fff', fontSize: 17, fontWeight: '900', letterSpacing: 0.5, marginBottom: 2 },
  consoleDesc: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '500' },
  chevron: { color: '#fff', fontSize: 24, fontWeight: '300' },
  loadingBox: { paddingVertical: 30, alignItems: 'center' },
  empty: { alignItems: 'center', paddingVertical: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 10 },
  emptyTitle: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 6 },
  emptyDesc: { color: '#888', fontSize: 13, marginBottom: 18, textAlign: 'center', paddingHorizontal: 30 },
  emptyBtn: { backgroundColor: '#22c55e', paddingHorizontal: 22, paddingVertical: 12, borderRadius: 10 },
  emptyBtnText: { color: '#000', fontSize: 14, fontWeight: '700' },
  groupCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0a0a0a', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#1a1a1a', marginBottom: 8 },
  groupAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#22c55e', alignItems: 'center', justifyContent: 'center' },
  groupAvatarText: { color: '#000', fontSize: 18, fontWeight: '900' },
  groupName: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 2 },
  groupMeta: { color: '#888', fontSize: 12 },
  groupTime: { color: '#666', fontSize: 11, fontWeight: '600' },
});
