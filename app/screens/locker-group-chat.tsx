import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Image, Modal, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, collection, query, orderBy, limit, onSnapshot, addDoc, serverTimestamp, doc, getDoc, updateDoc, deleteDoc, deleteField, where, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY',
  projectId: 'association-social',
};
if (!getApps().length) initializeApp(firebaseConfig);
const db = getFirestore();
const auth = getAuth();

const MESSAGE_REACTIONS = ['👍', '❤️', '😂', '😱', '‼️', '💯', '🤯'];

const GIPHY_KEY = process.env.EXPO_PUBLIC_GIPHY_API_KEY;
const EMOJI_LIST = [
  '😂','🔥','💯','👀','😤','🏆','💪','🎯','👑','😎',
  '🤝','💀','😭','🙏','⚡','🎮','🏀','🏈','⚾','👏',
  '😅','🤣','😬','🫡','💥','🎉','🔒','💸','🤯','🥶',
];

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
  const [showGiphy, setShowGiphy] = useState(false);
  const [giphySearch, setGiphySearch] = useState('');
  const [gifs, setGifs] = useState<any[]>([]);
  const [giphyLoading, setGiphyLoading] = useState(false);
  const [pendingGif, setPendingGif] = useState<string | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [reactionMsg, setReactionMsg] = useState<any | null>(null);
  const [editingMsg, setEditingMsg] = useState<any | null>(null);
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
    }, err => { if (err.code !== 'permission-denied') console.error(err); });

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
    }, err => { if (err.code !== 'permission-denied') console.error(err); });

    return () => { unsubChat(); unsubMsgs(); };
  }, [chatId]);

  async function handleSend(gifUrl?: string, imageUrl?: string) {
    const trimmed = text.trim();
    if ((!trimmed && !gifUrl && !imageUrl) || !chatId) return;
    const now = Date.now();
    if (now - lastSentRef.current < SEND_COOLDOWN_MS) return;
    if (!auth.currentUser) { Alert.alert('Sign in required'); return; }
    setSending(true);
    lastSentRef.current = now;
    try {
      await addDoc(collection(db, 'locker_groups', chatId, 'messages'), {
        text: trimmed,
        gifUrl: gifUrl || null,
        imageUrl: imageUrl || null,
        uid: auth.currentUser.uid,
        username: userInfo?.username || '',
        gamerTag: userInfo?.gamerTag || '',
        avatarUrl: userInfo?.photoUrl || '',
        createdAt: serverTimestamp(),
      });
      // Update parent doc with last message preview
      try {
        const preview = trimmed || (gifUrl ? '🎞️ GIF' : '📷 Photo');
        await updateDoc(doc(db, 'locker_groups', chatId), {
          lastMessage: preview.length > 40 ? preview.slice(0, 40) + '...' : preview,
          lastMessageAt: serverTimestamp(),
        });
      } catch { /* non-critical */ }
      setText('');
      setPendingGif(null);
      setShowEmoji(false);
    } catch (e: any) {
      Alert.alert('Send failed', e.message);
    }
    setSending(false);
  }

  const searchGiphy = async (q: string) => {
    setGiphySearch(q);
    if (!GIPHY_KEY) { setGifs([]); return; }
    if (q.trim().length < 2) { setGifs([]); return; }
    setGiphyLoading(true);
    try {
      const res = await fetch(
        `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q)}&limit=20&rating=pg-13`
      );
      const data = await res.json();
      setGifs(data.data || []);
    } catch (e) { /* ignore */ }
    setGiphyLoading(false);
  };

  const sendGif = (gifUrl: string) => {
    setShowGiphy(false);
    setGiphySearch('');
    setGifs([]);
    setPendingGif(gifUrl);
  };

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Please allow photo library access.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false, quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;
    try {
      const uri = result.assets[0].uri;
      const blob = await (await fetch(uri)).blob();
      const { getStorage, ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
      const storage = getStorage();
      const storageRef = ref(storage, 'chat_photos/' + auth.currentUser?.uid + '_' + Date.now() + '.jpg');
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      await handleSend('', url);
    } catch (e: any) { Alert.alert('Upload failed', e.message); }
  };

  const setMsgReaction = async (msg: any, emoji: string) => {
    if (!auth.currentUser || !chatId) return;
    const uid = auth.currentUser.uid;
    const mine = (msg.reactions || {})[uid];
    try {
      await updateDoc(doc(db, 'locker_groups', chatId, 'messages', msg.id), {
        ['reactions.' + uid]: mine === emoji ? deleteField() : emoji,
      });
    } catch (e: any) { Alert.alert('Error', e.message); }
    setReactionMsg(null);
  };

  const EDIT_WINDOW_MS = 30 * 60 * 1000;
  const msgEditable = (msg: any) => {
    const ms = msg.createdAt?.toMillis ? msg.createdAt.toMillis()
      : (msg.createdAt?.seconds ? msg.createdAt.seconds * 1000 : 0);
    return !!ms && (Date.now() - ms) < EDIT_WINDOW_MS;
  };

  const onMessageLongPress = (msg: any) => {
    const isMine = msg.uid === auth.currentUser?.uid;
    const isOwner = chat?.creatorUid === auth.currentUser?.uid;
    const editable = msgEditable(msg);
    const opts: any[] = [];
    if (isMine && msg.text && editable) opts.push({ text: 'Edit', onPress: () => { setEditingMsg(msg); setText(msg.text || ''); } });
    opts.push({ text: 'Add Reaction', onPress: () => setReactionMsg(msg) });
    if ((isMine && editable) || isOwner) opts.push({ text: 'Delete', style: 'destructive', onPress: () => confirmDeleteMessage(msg) });
    opts.push({ text: 'Cancel', style: 'cancel' });
    if (opts.length === 2) { setReactionMsg(msg); return; }
    Alert.alert('Message', undefined, opts);
  };

  const confirmDeleteMessage = (msg: any) => {
    Alert.alert('Delete message?', 'This permanently removes the message for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await deleteDoc(doc(db, 'locker_groups', chatId!, 'messages', msg.id)); }
        catch (e: any) { Alert.alert('Error', e.message); }
      } },
    ]);
  };

  const saveEdit = async () => {
    if (!editingMsg || !chatId) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      await updateDoc(doc(db, 'locker_groups', chatId, 'messages', editingMsg.id), {
        text: trimmed, edited: true,
      });
    } catch (e: any) { Alert.alert('Error', e.message); }
    setEditingMsg(null);
    setText('');
  };

  const cancelEdit = () => { setEditingMsg(null); setText(''); };

  const reactionChip = (msg: any) => {
    const map: Record<string, number> = {};
    Object.values(msg.reactions || {}).forEach((e: any) => { map[e] = (map[e] || 0) + 1; });
    const emojis = Object.keys(map).sort((a, b) => map[b] - map[a]);
    const total = Object.values(map).reduce((s, n) => s + n, 0);
    if (total === 0) return null;
    const mine = !!(auth.currentUser && (msg.reactions || {})[auth.currentUser.uid]);
    return { emojis: emojis.slice(0, 4).join(''), total, mine };
  };

  function renderItem({ item }: { item: any }) {
    const isMine = item.uid === auth.currentUser?.uid;
    const chip = reactionChip(item);
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
          <TouchableOpacity activeOpacity={0.85} onLongPress={() => onMessageLongPress(item)} delayLongPress={250}>
            <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
              {item.text ? <Text style={[styles.bubbleText, isMine && { color: '#000' }]}>{item.text}</Text> : null}
              {item.gifUrl ? <Image source={{ uri: item.gifUrl }} style={styles.msgMedia} resizeMode='cover' /> : null}
              {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.msgMedia} resizeMode='cover' /> : null}
            </View>
          </TouchableOpacity>
          {chip && (
            <TouchableOpacity style={[styles.reactChip, chip.mine && styles.reactChipMine]} onPress={() => setReactionMsg(item)}>
              <Text style={styles.reactChipEmoji}>{chip.emojis}</Text>
              <Text style={styles.reactChipCount}>{chip.total}</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.timeStamp}>{item.edited ? 'edited · ' : ''}{formatTime(item.createdAt)}</Text>
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

      {editingMsg && (
        <View style={styles.editBanner}>
          <Text style={styles.editBannerText}>✏️ Editing message</Text>
          <TouchableOpacity onPress={cancelEdit}><Text style={styles.editBannerCancel}>Cancel</Text></TouchableOpacity>
        </View>
      )}

      {pendingGif && !editingMsg && (
        <View style={styles.pendingGifRow}>
          <Image source={{ uri: pendingGif }} style={styles.pendingGifThumb} resizeMode='cover' />
          <Text style={styles.pendingGifLabel}>GIF ready · add a caption or send</Text>
          <TouchableOpacity style={styles.pendingGifRemove} onPress={() => setPendingGif(null)}>
            <Text style={styles.pendingGifRemoveText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {showEmoji && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.emojiRow} contentContainerStyle={{ paddingHorizontal: 8 }}>
          {EMOJI_LIST.map(e => (
            <TouchableOpacity key={e} style={styles.emojiBtn} onPress={() => setText(prev => prev + e)}>
              <Text style={styles.emojiText}>{e}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <View style={styles.inputBar}>
        {GIPHY_KEY ? (
          <TouchableOpacity style={styles.iconBtn} onPress={() => { setShowGiphy(true); setShowEmoji(false); }}>
            <View style={styles.gifBtnBox}><Text style={styles.gifBtnText}>GIF</Text></View>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.iconBtn} onPress={pickPhoto}>
          <Text style={styles.iconBtnText}>📷</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={() => setShowEmoji(v => !v)}>
          <Text style={styles.iconBtnText}>😀</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={editingMsg ? 'Edit your message...' : 'Type a message...'}
          placeholderTextColor='#555'
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!text.trim() && !pendingGif && !sending) && styles.sendBtnDisabled]}
          onPress={() => { if (editingMsg) { saveEdit(); } else { handleSend(pendingGif || undefined); } }}
          disabled={(!text.trim() && !pendingGif) || sending}
        >
          <Text style={styles.sendBtnText}>{sending ? '...' : (editingMsg ? 'Save' : 'Send')}</Text>
        </TouchableOpacity>
      </View>

      {/* GIF Modal */}
      <Modal visible={showGiphy} animationType='slide' presentationStyle='pageSheet'>
        <View style={styles.giphyModal}>
          <View style={styles.giphyHeader}>
            <TouchableOpacity onPress={() => { setShowGiphy(false); setGifs([]); setGiphySearch(''); }}>
              <Text style={styles.giphyClose}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.giphyTitle}>Search GIFs</Text>
            <View style={{ width: 40 }} />
          </View>
          <TextInput
            style={styles.giphyInput}
            value={giphySearch}
            onChangeText={searchGiphy}
            placeholder='Search GIPHY...'
            placeholderTextColor='#555'
            autoFocus
          />
          {giphyLoading ? <ActivityIndicator color='#22c55e' style={{ marginTop: 20 }} /> : (
            <FlatList
              data={gifs}
              numColumns={2}
              keyExtractor={item => item.id}
              contentContainerStyle={{ padding: 8 }}
              renderItem={({ item }) => {
                const url = item.images?.fixed_height?.url;
                if (!url) return null;
                return (
                  <TouchableOpacity onPress={() => sendGif(url)} style={styles.gifItem}>
                    <Image source={{ uri: url }} style={styles.gifThumb} />
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </Modal>

      {/* Reaction picker (long-press) */}
      <Modal visible={!!reactionMsg} transparent animationType='fade' onRequestClose={() => setReactionMsg(null)}>
        <TouchableOpacity style={styles.reactBackdrop} activeOpacity={1} onPress={() => setReactionMsg(null)}>
          <View style={styles.reactBar}>
            {MESSAGE_REACTIONS.map(emoji => {
              const mine = reactionMsg && (reactionMsg.reactions || {})[auth.currentUser?.uid || ''] === emoji;
              return (
                <TouchableOpacity
                  key={emoji}
                  style={[styles.reactOption, mine && styles.reactOptionActive]}
                  onPress={() => setMsgReaction(reactionMsg, emoji)}
                >
                  <Text style={styles.reactOptionEmoji}>{emoji}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
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
  msgMedia: { width: 200, height: 150, borderRadius: 10, marginTop: 6, backgroundColor: '#000' },
  reactChip: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, backgroundColor: '#1a1a1a', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#2a2a2a' },
  reactChipMine: { borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.15)' },
  reactChipEmoji: { fontSize: 13 },
  reactChipCount: { color: '#ccc', fontSize: 12, fontWeight: '700' },
  reactBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  reactBar: { flexDirection: 'row', backgroundColor: '#1a1a1a', borderRadius: 26, paddingHorizontal: 8, paddingVertical: 8, gap: 2, borderWidth: 1, borderColor: '#2a2a2a' },
  reactOption: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  reactOptionActive: { backgroundColor: '#0a2a1a', borderWidth: 1, borderColor: '#22c55e' },
  reactOptionEmoji: { fontSize: 24 },
  editBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: 'rgba(34,197,94,0.12)', borderTopWidth: 1, borderTopColor: 'rgba(34,197,94,0.4)' },
  editBannerText: { color: '#22c55e', fontSize: 13, fontWeight: '700' },
  editBannerCancel: { color: '#ff6666', fontSize: 13, fontWeight: '700' },
  timeStamp: { color: '#555', fontSize: 10, marginTop: 3 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', padding: 10, borderTopWidth: 1, borderTopColor: '#1a1a1a', backgroundColor: '#000', gap: 6 },
  iconBtn: { paddingHorizontal: 4, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  iconBtnText: { fontSize: 20 },
  gifBtnBox: { borderWidth: 1.5, borderColor: '#22c55e', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  gifBtnText: { color: '#22c55e', fontSize: 12, fontWeight: '900' },
  emojiRow: { maxHeight: 52, borderTopWidth: 1, borderTopColor: '#1a1a1a', backgroundColor: '#0a0a0a' },
  emojiBtn: { padding: 8 },
  emojiText: { fontSize: 24 },
  pendingGifRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#0a0a0a', borderTopWidth: 1, borderTopColor: '#1a1a1a' },
  pendingGifThumb: { width: 56, height: 42, borderRadius: 6 },
  pendingGifLabel: { color: '#888', fontSize: 12, flex: 1 },
  pendingGifRemove: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#2a0a0a', borderWidth: 1, borderColor: '#ff4444', alignItems: 'center', justifyContent: 'center' },
  pendingGifRemoveText: { color: '#ff4444', fontSize: 12, fontWeight: '800' },
  giphyModal: { flex: 1, backgroundColor: '#0a0a0a', paddingTop: 50 },
  giphyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  giphyClose: { color: '#fff', fontSize: 20, fontWeight: '700', width: 40 },
  giphyTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  giphyInput: { marginHorizontal: 16, backgroundColor: '#1a1a1a', borderRadius: 12, padding: 12, color: '#fff', fontSize: 15, marginBottom: 8 },
  gifItem: { flex: 1, margin: 4, borderRadius: 8, overflow: 'hidden' },
  gifThumb: { width: '100%', height: 120, backgroundColor: '#1a1a1a' },
  input: { flex: 1, backgroundColor: '#0a0a0a', color: '#fff', padding: 12, borderRadius: 20, borderWidth: 1, borderColor: '#1a1a1a', fontSize: 15, maxHeight: 100 },
  sendBtn: { backgroundColor: '#22c55e', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 20, marginLeft: 8 },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#000', fontSize: 14, fontWeight: '800' },
});
