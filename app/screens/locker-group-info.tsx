import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY',
  projectId: 'association-social',
};
if (!getApps().length) initializeApp(firebaseConfig);
const db = getFirestore();
const auth = getAuth();

export default function LockerGroupInfoScreen() {
  const router = useRouter();
  const { chatId } = useLocalSearchParams<{ chatId: string }>();

  const [chat, setChat] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [showAddFriends, setShowAddFriends] = useState(false);
  const [friends, setFriends] = useState<any[]>([]);
  const [selectedToAdd, setSelectedToAdd] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const myUid = auth.currentUser?.uid;
  const isCreator = chat?.creatorUid === myUid;

  useEffect(() => { load(); }, [chatId]);

  async function load() {
    if (!chatId) return;
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'locker_groups', chatId));
      if (!snap.exists()) {
        Alert.alert('Not found', 'This chat no longer exists.');
        router.back();
        return;
      }
      const data = snap.data() as any;
      setChat({ id: snap.id, ...data });
      setEditName(data.name || '');

      // Fetch member user docs
      const memberDocs = await Promise.all(
        (data.members || []).map(async (uid: string) => {
          try {
            const u = await getDoc(doc(db, 'users', uid));
            if (!u.exists()) return { uid, username: 'Unknown', gamerTag: '' };
            return { uid, ...(u.data() as any) };
          } catch {
            return { uid, username: 'Unknown', gamerTag: '' };
          }
        })
      );
      setMembers(memberDocs);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setLoading(false);
  }

  async function loadFriendsForAdd() {
    if (!myUid) return;
    setBusy(true);
    try {
      const me = await getDoc(doc(db, 'users', myUid));
      const friendUids: string[] = me.exists() ? (me.data().friends || []) : [];
      const memberUids = new Set(chat?.members || []);
      const eligible = friendUids.filter(fuid => !memberUids.has(fuid));
      const fetched = await Promise.all(
        eligible.map(async (fuid) => {
          try {
            const snap = await getDoc(doc(db, 'users', fuid));
            if (!snap.exists()) return null;
            return { uid: fuid, ...(snap.data() as any) };
          } catch { return null; }
        })
      );
      setFriends(fetched.filter(Boolean) as any[]);
      setShowAddFriends(true);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setBusy(false);
  }

  async function handleSaveName() {
    const trimmed = editName.trim();
    if (!trimmed) { Alert.alert('Required', 'Name cannot be empty.'); return; }
    if (!chatId) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, 'locker_groups', chatId), { name: trimmed });
      setChat({ ...chat, name: trimmed });
      setEditingName(false);
    } catch (e: any) {
      Alert.alert('Save failed', e.message);
    }
    setBusy(false);
  }

  async function handleAddMembers() {
    if (selectedToAdd.size === 0) { setShowAddFriends(false); return; }
    if (!chatId) return;
    setBusy(true);
    try {
      const toAdd = Array.from(selectedToAdd);
      await updateDoc(doc(db, 'locker_groups', chatId), {
        members: arrayUnion(...toAdd),
        memberCount: (chat?.members?.length || 0) + toAdd.length,
      });
      setSelectedToAdd(new Set());
      setShowAddFriends(false);
      await load();
    } catch (e: any) {
      Alert.alert('Add failed', e.message);
    }
    setBusy(false);
  }

  function handleLeave() {
    Alert.alert('Leave chat?', 'You will no longer receive messages from this group.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: doLeave },
    ]);
  }

  async function doLeave() {
    if (!chatId || !myUid) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, 'locker_groups', chatId), {
        members: arrayRemove(myUid),
        memberCount: Math.max(0, (chat?.members?.length || 1) - 1),
      });
      router.replace('/screens/mvp-locker-room');
    } catch (e: any) {
      Alert.alert('Leave failed', e.message);
      setBusy(false);
    }
  }

  function handleDelete() {
    Alert.alert('Delete chat?', 'This permanently deletes the chat for everyone. Cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: doDelete },
    ]);
  }

  async function doDelete() {
    if (!chatId) return;
    setBusy(true);
    try {
      await deleteDoc(doc(db, 'locker_groups', chatId));
      router.replace('/screens/mvp-locker-room');
    } catch (e: any) {
      Alert.alert('Delete failed', e.message);
      setBusy(false);
    }
  }

  function toggleFriendToAdd(uid: string) {
    const next = new Set(selectedToAdd);
    if (next.has(uid)) next.delete(uid);
    else next.add(uid);
    setSelectedToAdd(next);
  }

  if (loading || !chat) {
    return <View style={[styles.container, styles.center]}><ActivityIndicator color='#22c55e' /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.backLink}>← Back</Text></TouchableOpacity>
        <Text style={styles.title}>Group Info</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        <View style={styles.bigAvatar}>
          <Text style={styles.bigAvatarText}>{(chat.name || '?').charAt(0).toUpperCase()}</Text>
        </View>

        {editingName ? (
          <View style={{ alignItems: 'center' }}>
            <TextInput
              style={styles.nameInput}
              value={editName}
              onChangeText={setEditName}
              maxLength={40}
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <TouchableOpacity style={styles.miniBtn} onPress={() => { setEditingName(false); setEditName(chat.name); }}>
                <Text style={styles.miniBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.miniBtn, styles.miniBtnPrimary]} onPress={handleSaveName} disabled={busy}>
                <Text style={[styles.miniBtnText, { color: '#000' }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.chatName}>{chat.name}</Text>
            {isCreator && (
              <TouchableOpacity onPress={() => setEditingName(true)}>
                <Text style={styles.editName}>Edit name</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <Text style={styles.memberCountText}>{members.length} member{members.length !== 1 ? 's' : ''}</Text>

        <View style={styles.membersHeader}>
          <Text style={styles.sectionLabel}>MEMBERS</Text>
          <TouchableOpacity onPress={loadFriendsForAdd} disabled={busy}>
            <Text style={styles.addLink}>+ Add</Text>
          </TouchableOpacity>
        </View>

        {members.map(m => (
          <TouchableOpacity
            key={m.uid}
            style={styles.memberRow}
            onPress={() => router.push({ pathname: '/screens/profile', params: { uid: m.uid } })}
          >
            <View style={styles.mAvatar}>
              <Text style={styles.mAvatarText}>{(m.gamerTag || m.username || '?').charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.mName}>{m.gamerTag || m.username || 'Unknown'}</Text>
              {m.uid === chat.creatorUid && <Text style={styles.mTag}>Creator</Text>}
              {m.uid === myUid && <Text style={styles.mTag}>You</Text>}
            </View>
          </TouchableOpacity>
        ))}

        <View style={{ marginTop: 24 }}>
          {!isCreator && (
            <TouchableOpacity style={styles.dangerBtn} onPress={handleLeave} disabled={busy}>
              <Text style={styles.dangerBtnText}>Leave Chat</Text>
            </TouchableOpacity>
          )}
          {isCreator && (
            <TouchableOpacity style={styles.dangerBtn} onPress={handleDelete} disabled={busy}>
              <Text style={styles.dangerBtnText}>Delete Chat</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Add Members overlay */}
      {showAddFriends && (
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => { setShowAddFriends(false); setSelectedToAdd(new Set()); }}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Add Friends</Text>
            <TouchableOpacity onPress={handleAddMembers} disabled={busy}>
              <Text style={styles.modalSave}>{busy ? '...' : 'Add'}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {friends.length === 0 ? (
              <Text style={styles.modalEmpty}>No friends to add. All your friends are already in this chat.</Text>
            ) : (
              friends.map(f => {
                const sel = selectedToAdd.has(f.uid);
                return (
                  <TouchableOpacity
                    key={f.uid}
                    style={[styles.memberRow, sel && { borderColor: '#22c55e', backgroundColor: '#0a1a0a' }]}
                    onPress={() => toggleFriendToAdd(f.uid)}
                  >
                    <View style={styles.mAvatar}>
                      <Text style={styles.mAvatarText}>{(f.gamerTag || f.username || '?').charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.mName}>{f.gamerTag || f.username || 'Unknown'}</Text>
                    </View>
                    <View style={[styles.checkbox, sel && styles.checkboxSelected]}>
                      {sel && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  backLink: { color: '#22c55e', fontSize: 16, fontWeight: '600' },
  title: { color: '#fff', fontSize: 18, fontWeight: '800' },
  bigAvatar: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#22c55e', alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginTop: 10, marginBottom: 16 },
  bigAvatarText: { color: '#000', fontSize: 38, fontWeight: '900' },
  chatName: { color: '#fff', fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 4 },
  editName: { color: '#22c55e', fontSize: 13, fontWeight: '700' },
  nameInput: { backgroundColor: '#0a0a0a', color: '#fff', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#22c55e', fontSize: 18, textAlign: 'center', minWidth: 200, fontWeight: '700' },
  miniBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: '#1a1a1a' },
  miniBtnPrimary: { backgroundColor: '#22c55e' },
  miniBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  memberCountText: { color: '#888', fontSize: 13, textAlign: 'center', marginTop: 8 },
  sectionLabel: { color: '#888', fontSize: 12, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
  membersHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 4 },
  addLink: { color: '#22c55e', fontSize: 14, fontWeight: '700' },
  memberRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0a0a0a', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#1a1a1a', marginBottom: 8 },
  mAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#22c55e', alignItems: 'center', justifyContent: 'center' },
  mAvatarText: { color: '#000', fontSize: 15, fontWeight: '900' },
  mName: { color: '#fff', fontSize: 15, fontWeight: '700' },
  mTag: { color: '#22c55e', fontSize: 11, fontWeight: '700', marginTop: 2 },
  dangerBtn: { backgroundColor: '#2a0a0a', padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#ff4444' },
  dangerBtnText: { color: '#ff4444', fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#333', alignItems: 'center', justifyContent: 'center' },
  checkboxSelected: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  checkmark: { color: '#000', fontSize: 13, fontWeight: '900' },
  modal: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  modalCancel: { color: '#888', fontSize: 15, fontWeight: '600' },
  modalSave: { color: '#22c55e', fontSize: 15, fontWeight: '800' },
  modalTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  modalEmpty: { color: '#888', fontSize: 14, textAlign: 'center', paddingVertical: 30 },
});
