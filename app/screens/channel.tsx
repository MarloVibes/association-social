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

    // Load team data for each member
    const teamsSnap = await getDocs(collection(db, 'leagues', leagueId, 'teams'));
    const teamsByGm: Record<string, any> = {};
    teamsSnap.docs.forEach(d => {
      const td = d.data();
      if (td.gmId) teamsByGm[td.gmId] = td;
    });

    const profiles = await Promise.all(
      memberIds.map(async uid => {
        const snap = await getDoc(doc(db, 'users', uid));
        const team = teamsByGm[uid];
        return snap.exists()
          ? { uid, ...snap.data(), teamName: team?.name || '', teamAbbr: team?.abbreviation || '' }
          : { uid, displayName: 'Unknown GM', teamName: '', teamAbbr: '' };
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

  const sendMessage = async (overrideText?: string, gifUrl?: string, photoUrl?: string) => {
    if (!user) return;
    const content = overrideText ?? text.trim();
    if (!content && !gifUrl && !photoUrl) return;
    setSending(true);
    setText('');
    try {
      await addDoc(collection(db, 'leagues', leagueId, 'channels', channelId, 'messages'), {
        uid: user.uid,
        text: content || '',
        gifUrl: gifUrl || null,
        photoUrl: photoUrl || null,
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
    const senderName = sender?.displayName || 'GM';
    const teamName = sender?.teamName || '';
    const label = teamName ? senderName + ' (' + teamName + ')' : senderName;
    return (
      <TouchableOpacity onLongPress={() => { if (!isMe) blockAndReport(item.uid, senderName); }} activeOpacity={1}>
        <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
          <View style={[styles.msgContent, isMe && styles.msgContentMe]}>
            {!isMe && <Text style={styles.msgSender}>{label}</Text>}
            <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
              {item.text ? <Text style={[styles.msgText, isMe && styles.msgTextMe]}>{item.text}</Text> : null}
              {item.gifUrl ? <Image source={{ uri: item.gifUrl }} style={styles.gifImage} resizeMode='cover' /> : null}
              {item.photoUrl ? <Image source={{ uri: item.photoUrl }} style={styles.chatPhoto} resizeMode='cover' /> : null}
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
      const storageRef = ref(storage, 'chat_photos/' + user?.uid + '_' + Date.now() + '.jpg');
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      await sendMessage('', undefined, url);
    } catch (e: any) { Alert.alert('Upload failed', e.message); }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* Basketball Court Background */}
      <View style={styles.courtBg} pointerEvents='none'>
        <View style={styles.courtFloor} />
        <View style={styles.courtLine} />
        <View style={styles.centerCircle} />
        <View style={styles.centerDot} />
        <View style={styles.paintTop} />
        <View style={styles.paintBottom} />
        <View style={styles.ftCircleTop} />
        <View style={styles.ftCircleBottom} />
        <View style={styles.threeTop} />
        <View style={styles.threeBottom} />
        <View style={styles.courtDark} />
      </View>

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerIcon}>{channelIcon || '💬'}</Text>
          <View>
            <Text style={styles.headerTitle}>{channelLabel || 'League Chat'}</Text>
            <Text style={styles.headerSub}>{leagueName}</Text>
          </View>
        </View>
        <View style={{ width: 60 }} />
      </View>

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

      {canPost && (
        <View style={styles.inputBar}>
          <TouchableOpacity style={styles.inputAction} onPress={() => { setShowGiphy(true); setShowEmoji(false); }}>
            <View style={styles.gifBtnBox}><Text style={styles.gifBtnText}>GIF</Text></View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.inputAction} onPress={pickPhoto}>
            <Text style={styles.inputActionIcon}>📷</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder='Message...'
            placeholderTextColor='#555'
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!text.trim() && !sending) && styles.sendBtnDisabled]}
            onPress={() => sendMessage()}
            disabled={!text.trim() || sending}
          >
            <Text style={styles.sendBtnText}>↑</Text>
          </TouchableOpacity>
        </View>
      )}

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
          {giphyLoading ? <ActivityIndicator color='#F5A623' style={{ marginTop: 20 }} /> : (
            <FlatList
              data={gifs}
              numColumns={2}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.gifGrid}
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
      <GlobalNav />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0600' },

  // Court background
  courtBg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  courtFloor: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#8B4513', opacity: 0.45 },
  courtDark: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000000', opacity: 0.60 },
  courtLine: { position: 'absolute', top: '48%', left: 20, right: 20, height: 2, backgroundColor: '#ffffff', opacity: 0.35 },
  centerCircle: { position: 'absolute', alignSelf: 'center', top: '38%', width: 150, height: 150, borderRadius: 75, borderWidth: 2, borderColor: '#ffffff', opacity: 0.3 },
  centerDot: { position: 'absolute', alignSelf: 'center', top: '46%', width: 20, height: 20, borderRadius: 10, backgroundColor: '#ffffff', opacity: 0.2 },
  paintTop: { position: 'absolute', alignSelf: 'center', top: 0, width: 160, height: 200, borderWidth: 2, borderColor: '#ffffff', opacity: 0.22, backgroundColor: 'rgba(255,255,255,0.03)' },
  paintBottom: { position: 'absolute', alignSelf: 'center', bottom: 0, width: 160, height: 200, borderWidth: 2, borderColor: '#ffffff', opacity: 0.22, backgroundColor: 'rgba(255,255,255,0.03)' },
  ftCircleTop: { position: 'absolute', alignSelf: 'center', top: 140, width: 120, height: 120, borderRadius: 60, borderWidth: 2, borderColor: '#ffffff', opacity: 0.2 },
  ftCircleBottom: { position: 'absolute', alignSelf: 'center', bottom: 140, width: 120, height: 120, borderRadius: 60, borderWidth: 2, borderColor: '#ffffff', opacity: 0.2 },
  threeTop: { position: 'absolute', alignSelf: 'center', top: -120, width: 340, height: 340, borderRadius: 170, borderWidth: 2, borderColor: '#ffffff', opacity: 0.2 },
  threeBottom: { position: 'absolute', alignSelf: 'center', bottom: -120, width: 340, height: 340, borderRadius: 170, borderWidth: 2, borderColor: '#ffffff', opacity: 0.2 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, backgroundColor: 'rgba(0,0,0,0.7)', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  backText: { color: '#F5A623', fontSize: 15, fontWeight: '600', width: 60 },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIcon: { fontSize: 20 },
  headerTitle: { color: '#ffffff', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  headerSub: { color: '#888', fontSize: 11, textAlign: 'center' },

  // Messages
  messageList: { paddingHorizontal: 12, paddingVertical: 16, paddingBottom: 80, flexGrow: 1 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { color: 'rgba(255,255,255,0.3)', fontSize: 14 },
  msgRow: { flexDirection: 'row', marginBottom: 14, alignItems: 'flex-end' },
  msgRowMe: { flexDirection: 'row-reverse' },
  msgContent: { flex: 1, maxWidth: '78%' },
  msgContentMe: { alignItems: 'flex-end' },
  msgMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3, paddingLeft: 4 },
  msgSender: { color: '#F5A623', fontSize: 11, fontWeight: '700', marginBottom: 3, marginLeft: 4 },
  msgTeamBadge: { fontSize: 10, fontWeight: '800' },
  bubble: { borderRadius: 18, padding: 10, borderWidth: 1 },
  bubbleMe: { backgroundColor: '#1a1000', borderColor: '#F5A62355', borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: 'rgba(30,30,30,0.92)', borderColor: 'rgba(255,255,255,0.1)', borderBottomLeftRadius: 4 },
  msgText: { color: '#ffffff', fontSize: 15, lineHeight: 20 },
  msgTextMe: { color: '#fff3e0' },
  msgTime: { color: 'rgba(255,255,255,0.35)', fontSize: 10, marginTop: 4, textAlign: 'right' },
  msgTimeMe: { color: 'rgba(245,166,35,0.5)' },
  gifImage: { width: 200, height: 150, borderRadius: 10 },
  chatPhoto: { width: 200, height: 200, borderRadius: 10, marginTop: 4 },

  // Input
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 10, paddingBottom: Platform.OS === 'ios' ? 30 : 10, backgroundColor: 'rgba(0,0,0,0.85)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', gap: 8 },
  inputAction: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  inputActionIcon: { fontSize: 20 },
  gifBtnBox: { backgroundColor: '#1a1000', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4, borderWidth: 1, borderColor: '#F5A623' },
  gifBtnText: { color: '#F5A623', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  input: { flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: '#ffffff', fontSize: 15, maxHeight: 100, borderWidth: 1, borderColor: 'rgba(245,166,35,0.25)' },
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F5A623', alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#000', fontSize: 18, fontWeight: '800' },

  // GIF Modal
  giphyModal: { flex: 1, backgroundColor: '#0a0a0a' },
  giphyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: 56, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  giphyClose: { color: '#ff4444', fontSize: 18, fontWeight: '700', width: 40 },
  giphyTitle: { color: '#ffffff', fontSize: 17, fontWeight: '800' },
  giphyInput: { margin: 16, backgroundColor: '#1a1a1a', borderRadius: 12, padding: 12, color: '#ffffff', fontSize: 15, borderWidth: 1, borderColor: '#2a2a2a' },
  gifGrid: { padding: 8 },
  gifItem: { flex: 1, margin: 4 },
  gifThumb: { width: '100%', height: 120, borderRadius: 8 },
});
