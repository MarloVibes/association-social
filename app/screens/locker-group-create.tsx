import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY',
  projectId: 'association-social',
};
if (!getApps().length) initializeApp(firebaseConfig);
const db = getFirestore();
const auth = getAuth();

export default function LockerGroupCreateScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [friends, setFriends] = useState<any[]>([]);
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => { loadFriends(); }, []);

  async function loadFriends() {
    setLoading(true);
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) { setLoading(false); return; }
      const me = await getDoc(doc(db, 'users', uid));
      const friendUids: string[] = me.exists() ? (me.data().friends || []) : [];
      if (friendUids.length === 0) {
        setFriends([]);
        setLoading(false);
        return;
      }
      // Fetch each friend's user doc. Small N (<200 typical).
      const fetched = await Promise.all(
        friendUids.map(async (fuid) => {
          try {
            const snap = await getDoc(doc(db, 'users', fuid));
            if (!snap.exists()) return null;
            return { uid: fuid, ...(snap.data() as any) };
          } catch { return null; }
        })
      );
      setFriends(fetched.filter(Boolean) as any[]);
    } catch (e) {
      console.warn('friends load failed', e);
      setFriends([]);
    }
    setLoading(false);
  }

  function toggleFriend(uid: string) {
    const next = new Set(selectedUids);
    if (next.has(uid)) next.delete(uid);
    else next.add(uid);
    setSelectedUids(next);
  }

  async function handleCreate() {
    const trimmedName = name.trim();
    if (!trimmedName) { Alert.alert('Required', 'Group chat name is required.'); return; }
    if (selectedUids.size === 0) {
      Alert.alert('Add friends', 'Select at least one friend to invite.');
      return;
    }
    if (!auth.currentUser) return;
    setCreating(true);
    try {
      const uid = auth.currentUser.uid;
      const members = [uid, ...Array.from(selectedUids)];
      const docRef = await addDoc(collection(db, 'locker_groups'), {
        name: trimmedName,
        creatorUid: uid,
        members,
        memberCount: members.length,
        lastMessage: '',
        lastMessageAt: null,
        createdAt: serverTimestamp(),
      });
      router.replace({ pathname: '/screens/locker-group-chat', params: { chatId: docRef.id } });
    } catch (e: any) {
      Alert.alert('Create failed', e.message);
      setCreating(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.backLink}>← Back</Text></TouchableOpacity>
        <Text style={styles.title}>New Group Chat</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <Text style={styles.label}>Chat Name *</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder='e.g. Saturday Run'
          placeholderTextColor='#555'
          maxLength={40}
        />

        <View style={styles.inviteHeader}>
          <Text style={styles.label}>Invite Friends ({selectedUids.size})</Text>
        </View>

        {loading ? (
          <View style={styles.loadingBox}><ActivityIndicator color='#22c55e' /></View>
        ) : friends.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No friends yet</Text>
            <Text style={styles.emptyDesc}>Add friends first to invite them to group chats.</Text>
          </View>
        ) : (
          friends.map(f => {
            const sel = selectedUids.has(f.uid);
            return (
              <TouchableOpacity
                key={f.uid}
                style={[styles.friendRow, sel && styles.friendRowSelected]}
                onPress={() => toggleFriend(f.uid)}
              >
                <View style={styles.fAvatar}>
                  <Text style={styles.fAvatarText}>{(f.gamerTag || f.username || '?').charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.fName}>{f.gamerTag || f.username || 'Unknown'}</Text>
                  {f.username && f.gamerTag && f.username !== f.gamerTag && (
                    <Text style={styles.fSub}>@{f.username}</Text>
                  )}
                </View>
                <View style={[styles.checkbox, sel && styles.checkboxSelected]}>
                  {sel && <Text style={styles.checkmark}>✓</Text>}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.createBtn, (!name.trim() || selectedUids.size === 0 || creating) && styles.createBtnDisabled]}
          onPress={handleCreate}
          disabled={!name.trim() || selectedUids.size === 0 || creating}
        >
          <Text style={styles.createBtnText}>{creating ? 'Creating...' : `Create Chat (${selectedUids.size + 1})`}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  backLink: { color: '#22c55e', fontSize: 16, fontWeight: '600' },
  title: { color: '#fff', fontSize: 18, fontWeight: '800' },
  label: { color: '#888', fontSize: 12, fontWeight: '800', letterSpacing: 1, marginBottom: 8, marginTop: 12 },
  input: { backgroundColor: '#0a0a0a', color: '#fff', padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#1a1a1a', fontSize: 16, marginBottom: 8 },
  inviteHeader: { marginTop: 8 },
  loadingBox: { paddingVertical: 30, alignItems: 'center' },
  empty: { paddingVertical: 30, alignItems: 'center' },
  emptyTitle: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 6 },
  emptyDesc: { color: '#888', fontSize: 13, textAlign: 'center', paddingHorizontal: 30 },
  friendRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0a0a0a', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#1a1a1a', marginBottom: 8 },
  friendRowSelected: { borderColor: '#22c55e', backgroundColor: '#0a1a0a' },
  fAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#22c55e', alignItems: 'center', justifyContent: 'center' },
  fAvatarText: { color: '#000', fontSize: 15, fontWeight: '900' },
  fName: { color: '#fff', fontSize: 15, fontWeight: '700' },
  fSub: { color: '#666', fontSize: 12, marginTop: 2 },
  checkbox: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#333', alignItems: 'center', justifyContent: 'center' },
  checkboxSelected: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  checkmark: { color: '#000', fontSize: 14, fontWeight: '900' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 30, backgroundColor: '#000', borderTopWidth: 1, borderTopColor: '#1a1a1a' },
  createBtn: { backgroundColor: '#22c55e', padding: 16, borderRadius: 12, alignItems: 'center' },
  createBtnDisabled: { opacity: 0.4 },
  createBtnText: { color: '#000', fontSize: 15, fontWeight: '800' },
});
