import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, collection, query, orderBy, limit, onSnapshot, addDoc, serverTimestamp, doc, getDoc, updateDoc, where, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY',
  projectId: 'association-social',
};
if (!getApps().length) initializeApp(firebaseConfig);
const db = getFirestore();
const auth = getAuth();

const SEND_COOLDOWN_MS = 1000;

function formatTime(ts: any): string {
  if (!ts?.toDate) return '';
  const d = ts.toDate();
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function LockerGroupChatScreen() {
  const router = useRouter();
  const { chatId } = useLocalSearchParams<{ chatId: string }>();

  const [chat, setChat] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [blockSet, setBlockSet] = useState<Set<string>>(new Set());

  // Load block sets: who I blocked + who blocked me. Filter their messages out.
  useEffect(() => {
    const myUid = auth.currentUser?.uid;
    if (!myUid) return;
    (async () => {
      try {
        const meSnap = await getDoc(doc(db, 'users', myUid));
        const myBlocked: string[] = meSnap.exists() ? (meSnap.data().blockedUsers || []) : [];
        const blockerQ = query(collection(db, 'users'), where('blockedUsers', 'array-contains', myUid));
        const blockerSnap = await getDocs(blockerQ);
        const blockerUids = blockerSnap.docs.map(d => d.id);
        setBlockSet(new Set([...myBlocked, ...blockerUids]));
      } catch (e) {
        console.warn('block sets load failed', e);
      }
    })();
  }, []);

  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [userInfo, setUserInfo] = useState<any>(null);
  const lastSentRef = useRef<number>(0);

  useEffect(() => {
    if (!chatId || !auth.currentUser) return;

    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', auth.currentUser!.uid));
        if (snap.exists()) setUserInfo(snap.data());
      } catch { /* ignore */ }
    })();

    const unsubChat = onSnapshot(doc(db, 'locker_groups', chatId), (snap) => {
      if (!snap.exists()) {
        Alert.alert('Chat not found', 'This group chat no longer exists.');
        router.back();
        return;
      }
      const data = snap.data() as any;
      // Verify user is still a member
      if (!data.members?.includes(auth.currentUser?.uid)) {
        Alert.alert('Removed', 'You are no longer a member of this chat.');
        router.back();
        return;
      }
      setChat({ id: snap.id, ...data });
    });

    const q = query(
      collection(db, 'locker_groups', chatId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(100)
    );
    const unsubMsgs = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
      setLoading(false);
    }, (err) => {
      console.warn('group chat listener', err);
      setLoading(false);
    });

    return () => { unsubChat(); unsubMsgs(); };
  }, [chatId]);

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || !chatId) return;
    const now = Date.now();
    if (now - lastSentRef.current < SEND_COOLDOWN_MS) return;
    if (!auth.currentUser) { Alert.alert('Sign in required'); return; }
    setSending(true);
    lastSentRef.current = now;
    try {
      await addDoc(collection(db, 'locker_groups', chatId, 'messages'), {
        text: trimmed,
        uid: auth.currentUser.uid,
        username: userInfo?.username || '',
        gamerTag: userInfo?.gamerTag || '',
        photoUrl: userInfo?.photoUrl || '',
        createdAt: serverTimestamp(),
      });
      // Update parent doc with last message preview
      try {
        await updateDoc(doc(db, 'locker_groups', chatId), {
          lastMessage: trimmed.length > 40 ? trimmed.slice(0, 40) + '...' : trimmed,
          lastMessageAt: serverTimestamp(),
        });
      } catch { /* non-critical */ }
      setText('');
    } catch (e: any) {
      Alert.alert('Send failed', e.message);
    }
    setSending(false);
  }

  function renderItem({ item }: { item: any }) {
    const isMine = item.uid === auth.currentUser?.uid;
    return (
      <View style={[styles.msgRow, isMine && styles.msgRowMine]}>
        {!isMine && (
          <TouchableOpacity
            style={styles.avatar}
            onPress={() => router.push({ pathname: '/screens/profile', params: { uid: item.uid } })}
          >
            <Text style={styles.avatarText}>{(item.gamerTag || item.username || '?').charAt(0).toUpperCase()}</Text>
          </TouchableOpacity>
        )}
        <View style={[styles.bubbleCol, isMine && { alignItems: 'flex-end' }]}>
          {!isMine && (
            <TouchableOpacity onPress={() => router.push({ pathname: '/screens/profile', params: { uid: item.uid } })}>
              <Text style={styles.author}>{item.gamerTag || item.username || 'Anonymous'}</Text>
            </TouchableOpacity>
          )}
          <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
            <Text style={[styles.bubbleText, isMine && { color: '#000' }]}>{item.text}</Text>
          </View>
          <Text style={styles.timeStamp}>{formatTime(item.createdAt)}</Text>
        </View>
      </View>
    );
  }

  if (!chat && loading) {
    return <View style={[styles.container, styles.center]}><ActivityIndicator color='#22c55e' /></View>;
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.backLink}>← Back</Text></TouchableOpacity>
        <TouchableOpacity
          style={styles.titleWrap}
          onPress={() => router.push({ pathname: '/screens/locker-group-info', params: { chatId } })}
        >
          <Text style={styles.title} numberOfLines={1}>{chat?.name || 'Group Chat'}</Text>
          <Text style={styles.subTitle}>{chat?.memberCount || chat?.members?.length || 0} members · Info ›</Text>
        </TouchableOpacity>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color='#22c55e' /></View>
      ) : messages.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>💬</Text>
          <Text style={styles.emptyTitle}>No messages yet</Text>
          <Text style={styles.emptyDesc}>Be the first to say something.</Text>
        </View>
      ) : (
        <FlatList
          data={messages.filter((m: any) => !blockSet.has(m.uid))}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          inverted
          contentContainerStyle={{ padding: 12 }}
        />
      )}

      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder='Type a message...'
          placeholderTextColor='#555'
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
        >
          <Text style={styles.sendBtnText}>{sending ? '...' : 'Send'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  backLink: { color: '#22c55e', fontSize: 16, fontWeight: '600' },
  titleWrap: { flex: 1, alignItems: 'center' },
  title: { color: '#fff', fontSize: 16, fontWeight: '800', maxWidth: 220 },
  subTitle: { color: '#888', fontSize: 11, marginTop: 2 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginBottom: 4 },
  emptyDesc: { color: '#888', fontSize: 13, textAlign: 'center' },
  msgRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  msgRowMine: { justifyContent: 'flex-end' },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#22c55e', alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  avatarText: { color: '#000', fontSize: 14, fontWeight: '900' },
  bubbleCol: { maxWidth: '78%' },
  author: { color: '#888', fontSize: 11, fontWeight: '700', marginBottom: 3 },
  bubble: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  bubbleMine: { backgroundColor: '#22c55e', borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: '#1a1a1a', borderBottomLeftRadius: 4 },
  bubbleText: { color: '#fff', fontSize: 14, lineHeight: 19 },
  timeStamp: { color: '#555', fontSize: 10, marginTop: 3 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', padding: 10, borderTopWidth: 1, borderTopColor: '#1a1a1a', backgroundColor: '#000' },
  input: { flex: 1, backgroundColor: '#0a0a0a', color: '#fff', padding: 12, borderRadius: 20, borderWidth: 1, borderColor: '#1a1a1a', fontSize: 15, maxHeight: 100 },
  sendBtn: { backgroundColor: '#22c55e', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 20, marginLeft: 8 },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#000', fontSize: 14, fontWeight: '800' },
});
