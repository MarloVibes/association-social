import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView,
  Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView,
} from 'react-native';
import { auth, db } from '@/constants/firebase';
import { blockAndReport } from '@/constants/moderation';
import GlobalNav from '@/components/GlobalNav';

const GIPHY_KEY = process.env.EXPO_PUBLIC_GIPHY_API_KEY;

const EMOJI_LIST = [
  '😂','🔥','💯','👀','😤','🏆','💪','🎯','👑','😎',
  '🤝','💀','😭','🙏','⚡','🎮','🏀','🏈','⚾','👏',
  '😅','🤣','😬','🫡','💥','🎉','😤','🔒','💸','🤯',
];

export default function DMScreen() {
  const { uid: otherUid, name } = useLocalSearchParams<{ uid: string; name: string }>();
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGiphy, setShowGiphy] = useState(false);
  const [giphySearch, setGiphySearch] = useState('');
  const [gifs, setGifs] = useState<any[]>([]);
  const [giphyLoading, setGiphyLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const user = auth.currentUser;
  const dmId = user && otherUid ? [user.uid, otherUid].sort().join('_') : null;

  useEffect(() => {
    if (!dmId) return;
    const q = query(collection(db, 'dms', dmId, 'messages'), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    });
    return () => unsubscribe();
  }, [dmId]);

  const sendMessage = async (overrideText?: string, photoUrl?: string, gifUrl?: string) => {
    if (!user || !dmId) return;
    const content = overrideText ?? text.trim();
    if (!content && !photoUrl && !gifUrl) return;
    setSending(true);
    setText('');
    try {
      await addDoc(collection(db, 'dms', dmId, 'messages'), {
        uid: user.uid,
        text: content || '',
        photoUrl: photoUrl || null,
        gifUrl: gifUrl || null,
        createdAt: serverTimestamp(),
      });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setSending(false);
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      Alert.alert('Photo selected', 'Photo sharing requires Firebase Storage setup. Coming soon!');
    }
  };

  const searchGiphy = async (q: string) => {
    setGiphySearch(q);
    if (q.length < 2) { setGifs([]); return; }
    setGiphyLoading(true);
    try {
      const res = await fetch(
        `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q)}&limit=20&rating=pg-13`
      );
      const data = await res.json();
      setGifs(data.data || []);
    } catch (e) { console.error(e); }
    setGiphyLoading(false);
  };

  const sendGif = (gifUrl: string) => {
    setShowGiphy(false);
    setGiphySearch('');
    setGifs([]);
    sendMessage('', undefined, gifUrl);
  };

  const handleMore = () => {
    blockAndReport(otherUid, name, () => router.back());
  };

  const formatTime = (ts: any) => {
    if (!ts?.seconds) return '';
    return new Date(ts.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderMessage = ({ item }: { item: any }) => {
    const isMe = item.uid === user?.uid;
    return (
      <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
          {item.text ? <Text style={[styles.msgText, isMe && styles.msgTextMe]}>{item.text}</Text> : null}
          {item.gifUrl ? <Image source={{ uri: item.gifUrl }} style={styles.gifImage} resizeMode="cover" /> : null}
          {item.photoUrl ? <Image source={{ uri: item.photoUrl }} style={styles.photoImage} resizeMode="cover" /> : null}
          <Text style={[styles.msgTime, isMe && styles.msgTimeMe]}>{formatTime(item.createdAt)}</Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>{name?.[0]?.toUpperCase() || '?'}</Text>
          </View>
          <Text style={styles.headerName}>{name}</Text>
        </View>
        <TouchableOpacity style={styles.moreBtn} onPress={handleMore}>
          <Text style={styles.moreBtnText}>⋯</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        ListEmptyComponent={
          <View style={styles.emptyMessages}>
            <Text style={styles.emptyMessagesText}>Start a conversation with {name}</Text>
          </View>
        }
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
      />

      {showEmoji && (
        <View style={styles.emojiPanel}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.emojiGrid}>
              {EMOJI_LIST.map(e => (
                <TouchableOpacity
                  key={e}
                  style={styles.emojiBtn}
                  onPress={() => { setText(prev => prev + e); setShowEmoji(false); }}
                >
                  <Text style={styles.emojiText}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      <View style={styles.inputBar}>
        <TouchableOpacity style={styles.inputAction} onPress={pickImage}>
          <Text style={styles.inputActionText}>📷</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.inputAction} onPress={() => { setShowEmoji(!showEmoji); setShowGiphy(false); }}>
          <Text style={styles.inputActionText}>😊</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.inputAction} onPress={() => { setShowGiphy(true); setShowEmoji(false); }}>
          <Text style={styles.inputActionText}>GIF</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder="Message..."
          placeholderTextColor="#555"
          value={text}
          onChangeText={setText}
          multiline
          maxLength={1000}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
          onPress={() => sendMessage()}
          disabled={!text.trim() || sending}
        >
          {sending
            ? <ActivityIndicator size="small" color="#000" />
            : <Text style={styles.sendBtnText}>↑</Text>
          }
        </TouchableOpacity>
      </View>

      <Modal visible={showGiphy} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.giphyModal}>
          <View style={styles.giphyHeader}>
            <Text style={styles.giphyTitle}>Search GIFs</Text>
            <TouchableOpacity onPress={() => { setShowGiphy(false); setGiphySearch(''); setGifs([]); }}>
              <Text style={styles.giphyClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.giphyInput}
            placeholder="Search Giphy..."
            placeholderTextColor="#555"
            value={giphySearch}
            onChangeText={searchGiphy}
            autoFocus
            autoCorrect={false}
          />
          {giphyLoading && <ActivityIndicator color="#00ff87" style={{ marginTop: 20 }} />}
          <FlatList
            data={gifs}
            keyExtractor={item => item.id}
            numColumns={2}
            contentContainerStyle={styles.gifGrid}
            renderItem={({ item }) => {
              const url = item.images?.fixed_height?.url;
              if (!url) return null;
              return (
                <TouchableOpacity style={styles.gifItem} onPress={() => sendGif(url)}>
                  <Image source={{ uri: url }} style={styles.gifThumb} resizeMode="cover" />
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              giphySearch.length >= 2 && !giphyLoading
                ? <Text style={styles.giphyEmpty}>No GIFs found</Text>
                : null
            }
          />
        </View>
      </Modal>
          <GlobalNav />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  backText: { color: '#00ff87', fontSize: 15, fontWeight: '600', width: 60 },
  headerInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#2a2a2a', borderWidth: 1, borderColor: '#00ff87', alignItems: 'center', justifyContent: 'center' },
  headerAvatarText: { color: '#00ff87', fontSize: 14, fontWeight: '700' },
  headerName: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  moreBtn: { width: 60, alignItems: 'flex-end' },
  moreBtnText: { color: '#888', fontSize: 22, fontWeight: '700' },
  messageList: { paddingHorizontal: 16, paddingVertical: 12, flexGrow: 1 },
  emptyMessages: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyMessagesText: { color: '#444', fontSize: 14 },
  msgRow: { marginBottom: 8, alignItems: 'flex-start' },
  msgRowMe: { alignItems: 'flex-end' },
  bubble: { maxWidth: '78%', backgroundColor: '#1a1a1a', borderRadius: 18, borderBottomLeftRadius: 4, padding: 12 },
  bubbleMe: { backgroundColor: '#00ff87', borderRadius: 18, borderBottomRightRadius: 4 },
  bubbleThem: {},
  msgText: { color: '#ffffff', fontSize: 15, lineHeight: 20 },
  msgTextMe: { color: '#000000' },
  msgTime: { color: '#555', fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  msgTimeMe: { color: '#00662a' },
  gifImage: { width: 200, height: 150, borderRadius: 12, marginTop: 4 },
  photoImage: { width: 200, height: 200, borderRadius: 12, marginTop: 4 },
  emojiPanel: { backgroundColor: '#1a1a1a', borderTopWidth: 1, borderTopColor: '#2a2a2a', paddingVertical: 8 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, gap: 4 },
  emojiBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  emojiText: { fontSize: 24 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 10, paddingBottom: Platform.OS === 'ios' ? 28 : 10, borderTopWidth: 1, borderTopColor: '#1a1a1a', backgroundColor: '#0a0a0a', gap: 8 },
  inputAction: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  inputActionText: { fontSize: 20 },
  input: { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: '#ffffff', fontSize: 15, maxHeight: 100, borderWidth: 1, borderColor: '#2a2a2a' },
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#00ff87', alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#000', fontSize: 18, fontWeight: '800' },
  giphyModal: { flex: 1, backgroundColor: '#0a0a0a', paddingTop: 20 },
  giphyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 16 },
  giphyTitle: { color: '#ffffff', fontSize: 18, fontWeight: '700' },
  giphyClose: { color: '#888', fontSize: 20 },
  giphyInput: { marginHorizontal: 20, backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14, color: '#ffffff', fontSize: 15, borderWidth: 1, borderColor: '#2a2a2a', marginBottom: 12 },
  gifGrid: { paddingHorizontal: 12, paddingBottom: 40 },
  gifItem: { flex: 1, margin: 4, borderRadius: 10, overflow: 'hidden' },
  gifThumb: { width: '100%', height: 140 },
  giphyEmpty: { color: '#555', textAlign: 'center', marginTop: 40, fontSize: 14 },
});
