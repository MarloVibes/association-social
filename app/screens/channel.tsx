import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  addDoc, collection, doc, getDoc, onSnapshot,
  orderBy, query, serverTimestamp, updateDoc, arrayUnion, getDocs
} from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView,
  Modal, Platform, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
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

export default function ChannelScreen() {
  const { leagueId, leagueName, channelId, channelLabel, channelIcon, commissionerId, coCommissioners } =
    useLocalSearchParams<{
      leagueId: string;
      leagueName: string;
      channelId: string;
      channelLabel: string;
      channelIcon: string;
      commissionerId: string;
      coCommissioners: string;
    }>();

  const [messages, setMessages] = useState<any[]>([]);
  const [members, setMembers] = useState<Record<string, any>>({});
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGiphy, setShowGiphy] = useState(false);
  const [giphySearch, setGiphySearch] = useState('');
  const [gifs, setGifs] = useState<any[]>([]);
  const [giphyLoading, setGiphyLoading] = useState(false);
  const [rulesContent, setRulesContent] = useState('');
  const [editingRules, setEditingRules] = useState(false);
  const [rulesText, setRulesText] = useState('');
  const [polls, setPolls] = useState<any[]>([]);
  const [showCreatePoll, setShowCreatePoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [banList, setBanList] = useState<any[]>([]);
  const [newBanEntry, setNewBanEntry] = useState('');
  const [resetRequests, setResetRequests] = useState<any[]>([]);
  const [newResetRequest, setNewResetRequest] = useState('');
  const flatListRef = useRef<FlatList>(null);

  const user = auth.currentUser;
  const coComms: string[] = coCommissioners ? JSON.parse(coCommissioners) : [];
  const isCommOrCoComm = user?.uid === commissionerId || coComms.includes(user?.uid || '');

  // Channels that use chat-style messages
  const isChatChannel = ['league-chat', 'trade-talk', 'announcements', 'trade-block', 'highlights'].includes(channelId);
  const canPost = channelId === 'announcements' ? isCommOrCoComm : true;

  useEffect(() => {
    loadMembers();

    if (isChatChannel) {
      const q = query(
        collection(db, 'leagues', leagueId, 'channels', channelId, 'messages'),
        orderBy('createdAt', 'asc')
      );
      const unsub = onSnapshot(q, snap => {
        setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      });
      return () => unsub();
    }

    if (channelId === 'league-rules') loadRules();
    if (channelId === 'polls') loadPolls();
    if (channelId === 'ban-list') loadBanList();
    if (channelId === 'reset-requests') loadResetRequests();
  }, [channelId, leagueId]);

  const loadMembers = async () => {
    const leagueSnap = await getDoc(doc(db, 'leagues', leagueId));
    if (!leagueSnap.exists()) return;
    const memberIds: string[] = leagueSnap.data().members || [];
    const profiles = await Promise.all(
      memberIds.map(async uid => {
        const snap = await getDoc(doc(db, 'users', uid));
        return snap.exists() ? { uid, ...snap.data() } : { uid, displayName: 'Unknown GM' };
      })
    );
    const map: Record<string, any> = {};
    profiles.forEach(p => { map[p.uid] = p; });
    setMembers(map);
  };

  const loadRules = async () => {
    const snap = await getDoc(doc(db, 'leagues', leagueId, 'channels', 'league-rules'));
    if (snap.exists()) {
      setRulesContent(snap.data().content || '');
      setRulesText(snap.data().content || '');
    }
  };

  const saveRules = async () => {
    await updateDoc(doc(db, 'leagues', leagueId, 'channels', 'league-rules'), {
      content: rulesText,
      updatedAt: serverTimestamp(),
      updatedBy: user?.uid,
    }).catch(async () => {
      // Doc doesn't exist yet, create it
      const { setDoc } = await import('firebase/firestore');
      await setDoc(doc(db, 'leagues', leagueId, 'channels', 'league-rules'), {
        content: rulesText,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid,
      });
    });
    setRulesContent(rulesText);
    setEditingRules(false);
  };

  const loadPolls = async () => {
    const snap = await getDocs(collection(db, 'leagues', leagueId, 'channels', 'polls', 'items'));
    setPolls(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const createPoll = async () => {
    const validOptions = pollOptions.filter(o => o.trim());
    if (!pollQuestion.trim() || validOptions.length < 2) {
      Alert.alert('Invalid poll', 'Please add a question and at least 2 options.');
      return;
    }
    await addDoc(collection(db, 'leagues', leagueId, 'channels', 'polls', 'items'), {
      question: pollQuestion.trim(),
      options: validOptions,
      votes: {},
      createdBy: user?.uid,
      createdAt: serverTimestamp(),
    });
    setPollQuestion('');
    setPollOptions(['', '']);
    setShowCreatePoll(false);
    loadPolls();
  };

  const votePoll = async (pollId: string, optionIndex: number) => {
    const ref = doc(db, 'leagues', leagueId, 'channels', 'polls', 'items', pollId);
    await updateDoc(ref, { [`votes.${user?.uid}`]: optionIndex });
    loadPolls();
  };

  const loadBanList = async () => {
    const snap = await getDocs(collection(db, 'leagues', leagueId, 'channels', 'ban-list', 'entries'));
    setBanList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const addBanEntry = async () => {
    if (!newBanEntry.trim()) return;
    await addDoc(collection(db, 'leagues', leagueId, 'channels', 'ban-list', 'entries'), {
      gamertag: newBanEntry.trim(),
      addedBy: user?.uid,
      addedAt: serverTimestamp(),
    });
    setNewBanEntry('');
    loadBanList();
  };

  const loadResetRequests = async () => {
    const snap = await getDocs(collection(db, 'leagues', leagueId, 'channels', 'reset-requests', 'requests'));
    setResetRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const submitResetRequest = async () => {
    if (!newResetRequest.trim()) return;
    await addDoc(collection(db, 'leagues', leagueId, 'channels', 'reset-requests', 'requests'), {
      description: newResetRequest.trim(),
      requestedBy: user?.uid,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
    setNewResetRequest('');
    loadResetRequests();
  };

  const approveResetRequest = async (requestId: string) => {
    await updateDoc(
      doc(db, 'leagues', leagueId, 'channels', 'reset-requests', 'requests', requestId),
      { status: 'approved', reviewedBy: user?.uid }
    );
    loadResetRequests();
  };

  const sendMessage = async (overrideText?: string, gifUrl?: string) => {
    if (!user) return;
    const content = overrideText ?? text.trim();
    if (!content && !gifUrl) return;
    setSending(true);
    setText('');
    try {
      await addDoc(collection(db, 'leagues', leagueId, 'channels', channelId, 'messages'), {
        uid: user.uid,
        text: content || '',
        gifUrl: gifUrl || null,
        createdAt: serverTimestamp(),
      });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setSending(false);
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
    sendMessage('', gifUrl);
  };

  const formatTime = (ts: any) => {
    if (!ts?.seconds) return '';
    return new Date(ts.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderMessage = ({ item }: { item: any }) => {
    const isMe = item.uid === user?.uid;
    const sender = members[item.uid];
    return (
      <TouchableOpacity
        onLongPress={() => {
          if (!isMe) blockAndReport(item.uid, sender?.displayName || 'this user');
        }}
        activeOpacity={1}
      >
        <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
          {!isMe && (
            <View style={styles.msgAvatar}>
              <Text style={styles.msgAvatarText}>{sender?.displayName?.[0]?.toUpperCase() || '?'}</Text>
            </View>
          )}
          <View style={styles.msgContent}>
            {!isMe && <Text style={styles.msgSender}>{sender?.displayName || 'GM'}</Text>}
            <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
              {item.text ? <Text style={[styles.msgText, isMe && styles.msgTextMe]}>{item.text}</Text> : null}
              {item.gifUrl ? <Image source={{ uri: item.gifUrl }} style={styles.gifImage} resizeMode="cover" /> : null}
              <Text style={[styles.msgTime, isMe && styles.msgTimeMe]}>{formatTime(item.createdAt)}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // ── League Rules ──────────────────────────────────────────────
  if (channelId === 'league-rules') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>📋 League Rules</Text>
          {isCommOrCoComm && !editingRules && (
            <TouchableOpacity onPress={() => setEditingRules(true)}>
              <Text style={styles.editText}>Edit</Text>
            </TouchableOpacity>
          )}
          {editingRules && (
            <TouchableOpacity onPress={saveRules}>
              <Text style={styles.saveText}>Save</Text>
            </TouchableOpacity>
          )}
          {!isCommOrCoComm && <View style={{ width: 40 }} />}
        </View>
        <ScrollView style={styles.rulesScroll} contentContainerStyle={styles.rulesContent}>
          {editingRules ? (
            <TextInput
              style={styles.rulesInput}
              value={rulesText}
              onChangeText={setRulesText}
              multiline
              autoFocus
              placeholderTextColor="#555"
              placeholder="Write your league rules here..."
            />
          ) : rulesContent ? (
            <Text style={styles.rulesText}>{rulesContent}</Text>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No rules set yet.</Text>
              {isCommOrCoComm && (
                <TouchableOpacity style={styles.actionBtn} onPress={() => setEditingRules(true)}>
                  <Text style={styles.actionBtnText}>Add League Rules</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  // ── Voting Polls ──────────────────────────────────────────────
  if (channelId === 'polls') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>🗳️ Voting Polls</Text>
          <TouchableOpacity onPress={() => setShowCreatePoll(true)}>
            <Text style={styles.editText}>+ Poll</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.pollList}>
          {polls.length === 0 && (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No polls yet</Text>
              <TouchableOpacity style={styles.actionBtn} onPress={() => setShowCreatePoll(true)}>
                <Text style={styles.actionBtnText}>Create First Poll</Text>
              </TouchableOpacity>
            </View>
          )}
          {polls.map(poll => {
            const totalVotes = Object.keys(poll.votes || {}).length;
            const myVote = poll.votes?.[user?.uid || ''];
            return (
              <View key={poll.id} style={styles.pollCard}>
                <Text style={styles.pollQuestion}>{poll.question}</Text>
                <Text style={styles.pollMeta}>{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</Text>
                {(poll.options || []).map((opt: string, i: number) => {
                  const voteCount = Object.values(poll.votes || {}).filter(v => v === i).length;
                  const pct = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
                  const isMyVote = myVote === i;
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[styles.pollOption, isMyVote && styles.pollOptionSelected]}
                      onPress={() => votePoll(poll.id, i)}
                    >
                      <View style={[styles.pollBar, { width: `${pct}%` as any }]} />
                      <Text style={[styles.pollOptionText, isMyVote && styles.pollOptionTextSelected]}>{opt}</Text>
                      <Text style={styles.pollPct}>{pct}%</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
        <Modal visible={showCreatePoll} animationType="slide" presentationStyle="pageSheet">
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Poll</Text>
              <TouchableOpacity onPress={() => setShowCreatePoll(false)}>
                <Text style={styles.giphyClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={styles.modalLabel}>Question</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="What do you want to vote on?"
                placeholderTextColor="#555"
                value={pollQuestion}
                onChangeText={setPollQuestion}
              />
              <Text style={styles.modalLabel}>Options</Text>
              {pollOptions.map((opt, i) => (
                <TextInput
                  key={i}
                  style={styles.modalInput}
                  placeholder={`Option ${i + 1}`}
                  placeholderTextColor="#555"
                  value={opt}
                  onChangeText={val => {
                    const updated = [...pollOptions];
                    updated[i] = val;
                    setPollOptions(updated);
                  }}
                />
              ))}
              <TouchableOpacity style={styles.addOptionBtn} onPress={() => setPollOptions(prev => [...prev, ''])}>
                <Text style={styles.addOptionBtnText}>+ Add Option</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={createPoll}>
                <Text style={styles.actionBtnText}>Create Poll</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </Modal>
      </View>
    );
  }

  // ── Ban List ──────────────────────────────────────────────────
  if (channelId === 'ban-list') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>🚫 Ban List</Text>
          <View style={{ width: 40 }} />
        </View>
        {isCommOrCoComm && (
          <View style={styles.banInputRow}>
            <TextInput
              style={styles.banInput}
              placeholder="Enter gamertag to ban..."
              placeholderTextColor="#555"
              value={newBanEntry}
              onChangeText={setNewBanEntry}
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.banAddBtn} onPress={addBanEntry}>
              <Text style={styles.banAddBtnText}>Ban</Text>
            </TouchableOpacity>
          </View>
        )}
        <ScrollView contentContainerStyle={styles.banList}>
          {banList.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No banned gamertags</Text>
            </View>
          ) : (
            banList.map(entry => (
              <View key={entry.id} style={styles.banEntry}>
                <Text style={styles.banEntryText}>🚫 {entry.gamertag}</Text>
                <Text style={styles.banEntryMeta}>
                  Added by {members[entry.addedBy]?.displayName || 'Commissioner'}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    );
  }

  // ── Reset Requests ────────────────────────────────────────────
  if (channelId === 'reset-requests') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>🔁 Reset Requests</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.banInputRow}>
          <TextInput
            style={styles.banInput}
            placeholder="Describe why you need a reset..."
            placeholderTextColor="#555"
            value={newResetRequest}
            onChangeText={setNewResetRequest}
          />
          <TouchableOpacity style={styles.banAddBtn} onPress={submitResetRequest}>
            <Text style={styles.banAddBtnText}>Submit</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.banList}>
          {resetRequests.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No reset requests</Text>
            </View>
          ) : (
            resetRequests.map(req => (
              <View key={req.id} style={[styles.resetCard, req.status === 'approved' && styles.resetCardApproved]}>
                <Text style={styles.resetDesc}>{req.description}</Text>
                <Text style={styles.resetMeta}>
                  By {members[req.requestedBy]?.displayName || 'A GM'} · {req.status}
                </Text>
                {isCommOrCoComm && req.status === 'pending' && (
                  <TouchableOpacity style={styles.approveBtn} onPress={() => approveResetRequest(req.id)}>
                    <Text style={styles.approveBtnText}>✓ Approve</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}
        </ScrollView>
      </View>
    );
  }

  // ── Chat Channels (league-chat, trade-talk, announcements, trade-block, highlights) ──
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
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{channelIcon} {channelLabel}</Text>
          <Text style={styles.headerSub}>{leagueName}</Text>
        </View>
        <View style={{ width: 60 }} />
      </View>

      {channelId === 'announcements' && !isCommOrCoComm && (
        <View style={styles.readOnlyBanner}>
          <Text style={styles.readOnlyText}>📣 Read only — only commissioners can post here</Text>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No messages yet. Start the conversation!</Text>
          </View>
        }
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
      />

      {showEmoji && (
        <View style={styles.emojiPanel}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.emojiGrid}>
              {EMOJI_LIST.map(e => (
                <TouchableOpacity key={e} style={styles.emojiBtn} onPress={() => { setText(prev => prev + e); setShowEmoji(false); }}>
                  <Text style={styles.emojiText}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {canPost && (
        <View style={styles.inputBar}>
          <TouchableOpacity style={styles.inputAction} onPress={() => { setShowEmoji(!showEmoji); setShowGiphy(false); }}>
            <Text style={styles.inputActionText}>😊</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.inputAction} onPress={() => { setShowGiphy(true); setShowEmoji(false); }}>
            <Text style={styles.inputActionText}>GIF</Text>
          </TouchableOpacity>
          {channelId === 'highlights' && (
            <TouchableOpacity style={styles.inputAction} onPress={async () => {
              await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images });
              Alert.alert('Coming soon', 'Photo uploads require Firebase Storage setup.');
            }}>
              <Text style={styles.inputActionText}>📷</Text>
            </TouchableOpacity>
          )}
          <TextInput
            style={styles.input}
            placeholder={channelId === 'highlights' ? 'Share a highlight or box score...' : 'Message...'}
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
            {sending ? <ActivityIndicator size="small" color="#000" /> : <Text style={styles.sendBtnText}>↑</Text>}
          </TouchableOpacity>
        </View>
      )}

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
            ListEmptyComponent={giphySearch.length >= 2 && !giphyLoading ? <Text style={styles.giphyEmpty}>No GIFs found</Text> : null}
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
  headerCenter: { alignItems: 'center', flex: 1 },
  headerTitle: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  headerSub: { color: '#555', fontSize: 12, marginTop: 2 },
  editText: { color: '#00ff87', fontSize: 14, fontWeight: '600' },
  saveText: { color: '#00ff87', fontSize: 14, fontWeight: '700' },
  readOnlyBanner: { backgroundColor: '#1a1500', paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#2a2500' },
  readOnlyText: { color: '#888855', fontSize: 13 },
  messageList: { paddingHorizontal: 16, paddingVertical: 12, flexGrow: 1 },
  emptyContainer: { alignItems: 'center', paddingTop: 60, gap: 16 },
  emptyText: { color: '#444', fontSize: 14 },
  msgRow: { marginBottom: 12, flexDirection: 'row', alignItems: 'flex-end' },
  msgRowMe: { flexDirection: 'row-reverse' },
  msgAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#2a2a2a', borderWidth: 1, borderColor: '#00ff87', alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  msgAvatarText: { color: '#00ff87', fontSize: 11, fontWeight: '700' },
  msgContent: { maxWidth: '78%' },
  msgSender: { color: '#666', fontSize: 11, marginBottom: 4, marginLeft: 4 },
  bubble: { backgroundColor: '#1a1a1a', borderRadius: 18, borderBottomLeftRadius: 4, padding: 12 },
  bubbleMe: { backgroundColor: '#00ff87', borderRadius: 18, borderBottomRightRadius: 4 },
  bubbleThem: {},
  msgText: { color: '#ffffff', fontSize: 15, lineHeight: 20 },
  msgTextMe: { color: '#000000' },
  msgTime: { color: '#555', fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  msgTimeMe: { color: '#00662a' },
  gifImage: { width: 200, height: 150, borderRadius: 12, marginTop: 4 },
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
  rulesScroll: { flex: 1 },
  rulesContent: { padding: 20 },
  rulesText: { color: '#cccccc', fontSize: 15, lineHeight: 24 },
  rulesInput: { color: '#ffffff', fontSize: 15, lineHeight: 24, backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#2a2a2a', minHeight: 300, textAlignVertical: 'top' },
  pollList: { padding: 20, gap: 16 },
  pollCard: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 18, borderWidth: 1, borderColor: '#2a2a2a' },
  pollQuestion: { color: '#ffffff', fontSize: 16, fontWeight: '700', marginBottom: 6 },
  pollMeta: { color: '#555', fontSize: 12, marginBottom: 14 },
  pollOption: { backgroundColor: '#111', borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#2a2a2a', flexDirection: 'row', alignItems: 'center', overflow: 'hidden', position: 'relative' },
  pollOptionSelected: { borderColor: '#00ff87' },
  pollBar: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#0a2a1a', borderRadius: 10 },
  pollOptionText: { color: '#aaa', fontSize: 14, flex: 1, zIndex: 1 },
  pollOptionTextSelected: { color: '#00ff87', fontWeight: '600' },
  pollPct: { color: '#555', fontSize: 12, zIndex: 1 },
  modalContainer: { flex: 1, backgroundColor: '#0a0a0a' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  modalTitle: { color: '#ffffff', fontSize: 18, fontWeight: '700' },
  modalContent: { padding: 20, gap: 12 },
  modalLabel: { color: '#aaa', fontSize: 13, fontWeight: '600', textTransform: 'uppercase', marginBottom: 4 },
  modalInput: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14, color: '#ffffff', fontSize: 15, borderWidth: 1, borderColor: '#2a2a2a' },
  addOptionBtn: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#333' },
  addOptionBtnText: { color: '#888', fontSize: 14 },
  actionBtn: { backgroundColor: '#00ff87', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  actionBtnText: { color: '#000', fontSize: 15, fontWeight: '700' },
  banInputRow: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  banInput: { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 12, padding: 12, color: '#ffffff', fontSize: 14, borderWidth: 1, borderColor: '#2a2a2a' },
  banAddBtn: { backgroundColor: '#ff3333', borderRadius: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  banAddBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  banList: { padding: 20, gap: 10 },
  banEntry: { backgroundColor: '#1a0a0a', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#3a1a1a' },
  banEntryText: { color: '#ff6666', fontSize: 15, fontWeight: '600', marginBottom: 4 },
  banEntryMeta: { color: '#555', fontSize: 12 },
  resetCard: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#2a2a2a', gap: 8 },
  resetCardApproved: { borderColor: '#00ff87', backgroundColor: '#0a1a0a' },
  resetDesc: { color: '#ffffff', fontSize: 14 },
  resetMeta: { color: '#555', fontSize: 12 },
  approveBtn: { backgroundColor: '#0a2a1a', borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#00ff87' },
  approveBtnText: { color: '#00ff87', fontSize: 13, fontWeight: '700' },
});
