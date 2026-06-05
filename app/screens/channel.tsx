import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  addDoc, collection, doc, getDoc, onSnapshot,
  orderBy, query, serverTimestamp, updateDoc, arrayUnion, getDocs, where } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView,
  Modal, Platform, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { auth, db } from '@/constants/firebase';
import { blockAndReport } from '@/constants/moderation';

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

  const [members, setMembers] = useState<Record<string, any>>({});
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGiphy, setShowGiphy] = useState(false);
  const [giphySearch, setGiphySearch] = useState('');
  const [gifs, setGifs] = useState<any[]>([]);
  const [giphyLoading, setGiphyLoading] = useState(false);
  const [pendingGif, setPendingGif] = useState<string | null>(null);
  const [rulesContent, setRulesContent] = useState('');
  const [editingRules, setEditingRules] = useState(false);
  const [rulesText, setRulesText] = useState('');
  const [polls, setPolls] = useState<any[]>([]);
  const [showCreatePoll, setShowCreatePoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [banList, setBanList] = useState<any[]>([]);
  const [newBanEntry, setNewBanEntry] = useState('');
  const [banPlatform, setBanPlatform] = useState('PSN');
  const [banReason, setBanReason] = useState('');
  const [banSeverity, setBanSeverity] = useState('Banned');
  const [expandedBan, setExpandedBan] = useState<string | null>(null);
  const [showBanForm, setShowBanForm] = useState(false);
  const [editingBan, setEditingBan] = useState<any>(null);
  const [banProfileSearch, setBanProfileSearch] = useState('');
  const [banProfileResults, setBanProfileResults] = useState<any[]>([]);
  const [banLinkedProfile, setBanLinkedProfile] = useState<any>(null);
  const [resetRequests, setResetRequests] = useState<any[]>([]);
  const [newResetRequest, setNewResetRequest] = useState('');
  const [showResetForm, setShowResetForm] = useState(false);
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputingReq, setDisputingReq] = useState<any>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [highlights, setHighlights] = useState<any[]>([]);
  const [showHighlightForm, setShowHighlightForm] = useState(false);
  const [highlightType, setHighlightType] = useState<'highlight'|'boxscore'|'clip'>('highlight');
  const [hlCaption, setHlCaption] = useState('');
  const [hlMediaUrl, setHlMediaUrl] = useState('');
  const [hlClipUrl, setHlClipUrl] = useState('');
  const [hlMyScore, setHlMyScore] = useState('');
  const [hlOppScore, setHlOppScore] = useState('');
  const [hlOpponent, setHlOpponent] = useState('');
  const [hlResult, setHlResult] = useState<'W'|'L'>('W');
  const [hlUploading, setHlUploading] = useState(false);
  const [resetGameDate, setResetGameDate] = useState('');
  const [resetOpponent, setResetOpponent] = useState('');
  const [resetReason, setResetReason] = useState('');
  const [resetCustomReason, setResetCustomReason] = useState('');
  const [resetProofUrl, setResetProofUrl] = useState('');
  const [leagueTeams, setLeagueTeams] = useState<any[]>([]);
  const [bulletinEditMode, setBulletinEditMode] = useState(false);
  const [bulletinLoaded, setBulletinLoaded] = useState(false);
  const [selectedBulletins, setSelectedBulletins] = useState<string[]>([]);
  const flatListRef = useRef<FlatList>(null);

  const user = auth.currentUser;
  const coComms: string[] = coCommissioners ? JSON.parse(coCommissioners) : [];
  const isCommOrCoComm = user?.uid === commissionerId || coComms.includes(user?.uid || '');

  // Channels that use chat-style messages
  const isChatChannel = ['league-chat', 'trade-talk', 'trade-block', 'announcements'].includes(channelId);
  const canPost = channelId === 'announcements' ? isCommOrCoComm : true;

  useEffect(() => {
    loadMembers();

    if (isChatChannel) {
      const q = query(
        collection(db, 'leagues', leagueId, 'channels', channelId, 'messages'),
        orderBy('createdAt', 'asc')
      );
      const unsub = onSnapshot(q, snap => {
        const newMsgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setMessages(newMsgs);
        setBulletinLoaded(true);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      }, err => { if (err.code !== 'permission-denied') console.error(err); });


  return () => unsub();
    }

    if (channelId === 'league-rules') loadRules();
    if (channelId === 'polls') loadPolls();
    if (channelId === 'ban-list') loadBanList();
    if (channelId === 'highlights') {
      const q = query(collection(db, 'leagues', leagueId, 'channels', 'highlights', 'posts'), orderBy('createdAt', 'desc'));
      const unsub = onSnapshot(q, snap => setHighlights(snap.docs.map(d => ({ id: d.id, ...d.data() }))), err => { if (err.code !== 'permission-denied') console.error(err); });
      return () => unsub();
    }
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
    // Load league teams for reset form opponent picker
    const teamsForReset = await getDocs(collection(db, 'leagues', leagueId, 'teams'));
    setLeagueTeams(teamsForReset.docs.map(d => ({ id: d.id, ...d.data() })).filter((t: any) => t.gmId && t.gmId !== user?.uid));
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

    // Notify all league members of new poll
    try {
      const leagueSnap = await getDoc(doc(db, 'leagues', leagueId));
      const memberIds: string[] = leagueSnap.data()?.members || [];
      for (const memberId of memberIds) {
        if (memberId === user?.uid) continue;
        try {
          await updateDoc(doc(db, 'users', memberId), {
            notifications: arrayUnion({
              type: 'new_poll',
              leagueId,
              leagueName: leagueName || '',
              message: 'New poll posted',
              preview: pollQuestion.trim().slice(0, 60),
              createdAt: new Date().toISOString(),
            }),
          });
        } catch (innerErr) {
          console.warn('poll notify failed for', memberId, innerErr);
        }
      }
    } catch (e) { console.warn('poll notify failed', e); }

    // Log to league activity feed
    try {
      await addDoc(collection(db, 'leagues', leagueId, 'activity'), {
        type: 'new_poll',
        message: '🗳 New poll posted: ' + pollQuestion.trim().slice(0, 60),
        createdAt: serverTimestamp(),
      });
    } catch (e: any) { console.error('POLL ACTIVITY FAILED:', e?.code, e?.message); Alert.alert('Activity log failed', e?.code + ': ' + e?.message); }

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
        platform: banPlatform,
        reason: banReason,
        severity: banSeverity,
        linkedProfile: banLinkedProfile ? { uid: banLinkedProfile.uid, displayName: banLinkedProfile.displayName, username: banLinkedProfile.username, photoUrl: banLinkedProfile.photoUrl || '' } : null,
      gamertag: newBanEntry.trim(),
      addedBy: user?.uid,
      addedAt: serverTimestamp(),
    });

    // Log to league activity feed
    try {
      await addDoc(collection(db, 'leagues', leagueId, 'activity'), {
        type: 'ban_added',
        message: '🚫 New entry added to ban list: ' + newBanEntry.trim().slice(0, 60),
        createdAt: serverTimestamp(),
      });
    } catch (e: any) { console.error('BAN ACTIVITY FAILED:', e?.code, e?.message); Alert.alert('Activity log failed', e?.code + ': ' + e?.message); }

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
        gameDate: resetGameDate,
        opponent: resetOpponent,
        reason: resetReason === 'Other' ? resetCustomReason : resetReason,
        proofUrl: resetProofUrl || null,
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

      // Notify all league members when an announcement or rule update is posted
      if (channelId === 'announcements' || channelId === 'league-rules') {
        const leagueSnap = await getDoc(doc(db, 'leagues', leagueId));
        const memberIds: string[] = leagueSnap.data()?.members || [];
        const senderName = members[user.uid]?.displayName || 'Commissioner';
        const teamName = members[user.uid]?.teamName || '';
        const isRules = channelId === 'league-rules';
        for (const memberId of memberIds) {
          if (memberId === user.uid) continue;
          await updateDoc(doc(db, 'users', memberId), {
            notifications: arrayUnion({
              type: isRules ? 'rules_updated' : 'announcement',
              leagueId,
              leagueName: leagueName || '',
              message: isRules ? 'Rules have been updated' : ((teamName ? teamName : senderName) + ' posted a new announcement'),
              preview: isRules ? 'Tap to view rules' : (content ? content.slice(0, 60) : 'New bulletin posted'),
              createdAt: new Date().toISOString(),
            }),
          });
        }

        // Log to league activity feed
        try {
          const isRules = channelId === 'league-rules';
          await addDoc(collection(db, 'leagues', leagueId, 'activity'), {
            type: isRules ? 'rules_updated' : 'announcement',
            message: isRules ? '📋 League rules have been updated' : '📰 News posted inside the league',
            createdAt: serverTimestamp(),
          });
        } catch (e) {
          console.warn('Failed to log to activity', e);
        }
      }
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
    setPendingGif(gifUrl);
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
      <View style={styles.chalkContainer}>
        {/* Chalkboard header */}
        <View style={styles.chalkHeader}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.chalkBack}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.chalkTitle}>📋 League Rules</Text>
          <View style={styles.chalkHeaderBtns}>
            {isCommOrCoComm && !editingRules && (
              <TouchableOpacity style={styles.chalkEditBtn} onPress={() => { setEditingRules(true); setRulesText(rulesContent); }}>
                <Text style={styles.chalkEditBtnText}>✏️ Edit</Text>
              </TouchableOpacity>
            )}
            {editingRules && (
              <>
                <TouchableOpacity style={styles.chalkCancelBtn} onPress={() => setEditingRules(false)}>
                  <Text style={styles.chalkCancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.chalkSaveBtn} onPress={async () => { await saveRules(); setEditingRules(false); }}>
                  <Text style={styles.chalkSaveBtnText}>💾 Save</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Chalk tray decoration */}
        <View style={styles.chalkTray}>
          {['○', '○', '○', '●', '○', '●', '○', '○', '○'].map((s, i) => (
            <Text key={i} style={styles.chalkTrayItem}>{s}</Text>
          ))}
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.chalkContent}>
          {editingRules ? (
            <View style={styles.chalkEditArea}>
              <Text style={styles.chalkEditLabel}>Write your rules below:</Text>
              <TextInput
                style={styles.chalkInput}
                value={rulesText}
                onChangeText={setRulesText}
                multiline
                autoFocus
                placeholderTextColor="rgba(255,255,255,0.3)"
                placeholder={'1. No tanking\n2. Must make trades active\n3. ...'}
              />
            </View>
          ) : rulesContent ? (
            <View style={styles.chalkBoard}>
              {/* Chalk lines */}
              <Text style={styles.chalkHeading}>LEAGUE RULES</Text>
              <View style={styles.chalkDivider} />
              {rulesContent.split('\n').filter(l => l.trim()).map((line, i) => (
                <View key={i} style={styles.chalkRuleLine}>
                  <Text style={styles.chalkRuleNum}>{i + 1}.</Text>
                  <Text style={styles.chalkRuleText}>{line.replace(/^\d+\.\s*/, '')}</Text>
                </View>
              ))}
              {isCommOrCoComm && (
                <Text style={styles.chalkEditHint}>Tap ✏️ Edit to update rules</Text>
              )}
            </View>
          ) : (
            <View style={styles.chalkEmpty}>
              <Text style={styles.chalkEmptyText}>No rules written yet</Text>
              {isCommOrCoComm && (
                <TouchableOpacity style={styles.chalkWriteBtn} onPress={() => setEditingRules(true)}>
                  <Text style={styles.chalkWriteBtnText}>✏️ Write Rules</Text>
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
    const totalMembers = Object.keys(members).length;
    return (
      <View style={styles.voteContainer}>
        {/* Vote room header */}
        <View style={styles.voteHeader}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.voteBack}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.voteHeaderCenter}>
            <Text style={styles.voteHeaderIcon}>🗳️</Text>
            <Text style={styles.voteHeaderTitle}>GM VOTE</Text>
          </View>
          {isCommOrCoComm ? (
            <TouchableOpacity style={styles.voteNewBtn} onPress={() => setShowCreatePoll(true)}>
              <Text style={styles.voteNewBtnText}>+ New</Text>
            </TouchableOpacity>
          ) : <View style={{ width: 60 }} />}
        </View>

        {/* Podium decoration */}
        <View style={styles.votePodium}>
          <Text style={styles.votePodiumText}>OFFICIAL LEAGUE BALLOT</Text>
        </View>

        <ScrollView contentContainerStyle={styles.voteContent}>
          {polls.length === 0 ? (
            <View style={styles.voteEmpty}>
              <Text style={styles.voteEmptyIcon}>🗳️</Text>
              <Text style={styles.voteEmptyText}>No active votes</Text>
              {isCommOrCoComm && (
                <TouchableOpacity style={styles.voteStartBtn} onPress={() => setShowCreatePoll(true)}>
                  <Text style={styles.voteStartBtnText}>Start a Vote</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            polls.map(poll => {
              const votes = poll.votes || {};
              const totalVotes = Object.keys(votes).length;
              const myVote = votes[user?.uid || ''];
              const hasVoted = myVote !== undefined;
              const isClosed = poll.closed;
              const showResults = hasVoted || isClosed || isCommOrCoComm;

              return (
                <View key={poll.id} style={[styles.voteCard, isClosed && styles.voteCardClosed]}>
                  {/* Status badge */}
                  <View style={styles.voteCardTop}>
                    <View style={[styles.voteStatusBadge, isClosed ? styles.voteStatusClosed : styles.voteStatusOpen]}>
                      <Text style={styles.voteStatusText}>{isClosed ? '🔒 CLOSED' : '🟢 LIVE'}</Text>
                    </View>
                    <Text style={styles.voteTurnout}>{totalVotes}/{totalMembers} voted</Text>
                    {isCommOrCoComm && (
                      <TouchableOpacity onPress={() => {
                        Alert.alert(poll.closed ? 'Reopen Poll?' : 'Close Poll?', '', [
                          { text: 'Cancel', style: 'cancel' },
                          { text: poll.closed ? 'Reopen' : 'Close', onPress: async () => {
                            await updateDoc(doc(db, 'leagues', leagueId, 'channels', 'polls', 'votes', poll.id), { closed: !poll.closed });
                          }},
                          { text: 'Delete', style: 'destructive', onPress: async () => {
                            const { deleteDoc } = await import('firebase/firestore');
                            await deleteDoc(doc(db, 'leagues', leagueId, 'channels', 'polls', 'votes', poll.id));
                          }},
                        ]);
                      }}>
                        <Text style={styles.voteManageBtn}>⚙️</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <Text style={styles.voteQuestion}>{poll.question}</Text>

                  {/* Options with animated bars */}
                  <View style={styles.voteOptions}>
                    {(poll.options || []).map((opt: string, i: number) => {
                      const count = Object.values(votes).filter(v => v === i).length;
                      const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                      const isMyChoice = myVote === i;
                      const isWinning = showResults && count === Math.max(...(poll.options || []).map((_: any, idx: number) => Object.values(votes).filter(v => v === idx).length));

                      return (
                        <TouchableOpacity
                          key={i}
                          style={[styles.voteOption, isMyChoice && styles.voteOptionMine, isClosed && { opacity: 0.85 }]}
                          onPress={() => !isClosed && votePoll(poll.id, i)}
                          disabled={isClosed}
                        >
                          {/* Progress bar */}
                          {showResults && (
                            <View style={[styles.voteOptionBar, { width: pct + '%' as any, backgroundColor: isWinning ? '#F5A623' : '#2a2a4a' }]} />
                          )}
                          <View style={styles.voteOptionContent}>
                            <View style={[styles.voteRadio, isMyChoice && styles.voteRadioSelected]}>
                              {isMyChoice && <View style={styles.voteRadioDot} />}
                            </View>
                            <Text style={[styles.voteOptionText, isMyChoice && styles.voteOptionTextMine]}>{opt}</Text>
                            {showResults && (
                              <Text style={[styles.voteOptionPct, isWinning && { color: '#F5A623', fontWeight: '800' }]}>{pct}%</Text>
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Who voted (shown after voting or if comm) */}
                  {showResults && totalVotes > 0 && (
                    <View style={styles.voteVoters}>
                      <Text style={styles.voteVotersLabel}>Voted: </Text>
                      {Object.keys(votes).map(uid => (
                        <Text key={uid} style={styles.voteVoterName}>
                          {members[uid]?.teamName || members[uid]?.displayName || 'GM'}
                        </Text>
                      ))}
                    </View>
                  )}

                  {!hasVoted && !isClosed && (
                    <Text style={styles.votePrompt}>Tap an option to cast your vote</Text>
                  )}
                  {hasVoted && !isClosed && (
                    <Text style={styles.votePrompt}>✅ Vote cast · Results shown after voting</Text>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>

        {/* Create Poll Modal */}
        <Modal visible={showCreatePoll} animationType='slide' presentationStyle='pageSheet'>
          <View style={styles.voteModalContainer}>
            <View style={styles.voteModalHeader}>
              <TouchableOpacity onPress={() => setShowCreatePoll(false)}>
                <Text style={styles.voteModalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.voteModalTitle}>New Vote</Text>
              <TouchableOpacity onPress={createPoll}>
                <Text style={styles.voteModalCreate}>Create</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.voteModalContent}>
              <Text style={styles.voteModalLabel}>QUESTION</Text>
              <TextInput
                style={styles.voteModalInput}
                placeholder='What should the league decide?'
                placeholderTextColor='#555'
                value={pollQuestion}
                onChangeText={setPollQuestion}
                autoFocus
              />
              <Text style={styles.voteModalLabel}>OPTIONS</Text>
              {pollOptions.map((opt, i) => (
                <View key={i} style={styles.voteModalOptionRow}>
                  <Text style={styles.voteModalOptionNum}>{i + 1}</Text>
                  <TextInput
                    style={styles.voteModalOptionInput}
                    placeholder={'Option ' + (i + 1)}
                    placeholderTextColor='#555'
                    value={opt}
                    onChangeText={val => {
                      const updated = [...pollOptions];
                      updated[i] = val;
                      setPollOptions(updated);
                    }}
                  />
                  {i >= 2 && (
                    <TouchableOpacity onPress={() => setPollOptions(prev => prev.filter((_, idx) => idx !== i))}>
                      <Text style={styles.voteModalRemove}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {pollOptions.length < 6 && (
                <TouchableOpacity style={styles.voteAddOption} onPress={() => setPollOptions(prev => [...prev, ''])}>
                  <Text style={styles.voteAddOptionText}>+ Add Option</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </Modal>
      </View>
    );
  }

  const searchBanProfile = async (text: string) => {
    setBanProfileSearch(text);
    setBanLinkedProfile(null);
    if (text.trim().length < 2) { setBanProfileResults([]); return; }
    try {
      const q = query(collection(db, 'users'), where('username', '>=', text.toLowerCase()), where('username', '<=', text.toLowerCase() + '\uf8ff'));
      const snap = await getDocs(q);
      setBanProfileResults(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
    } catch(e) { console.error(e); }
  };

  // ── Ban List ──────────────────────────────────────────────────
  if (channelId === 'ban-list') {
    const severityConfig: Record<string, { color: string; icon: string; bg: string }> = {
      'Warning':      { color: '#FFD700', icon: '⚠️', bg: '#2a2000' },
      'Banned':       { color: '#ff8800', icon: '🚫', bg: '#2a1000' },
      'Perma-banned': { color: '#ff2222', icon: '☠️', bg: '#2a0000' },
    };

    return (
      <View style={styles.wantedContainer}>
        {/* Header */}
        <View style={styles.wantedHeader}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.wantedBack}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.wantedHeaderCenter}>
            <Text style={styles.wantedHeaderTitle}>☠️ WANTED</Text>
            <Text style={styles.wantedHeaderSub}>GAMERTAG BAN LIST</Text>
          </View>
          {isCommOrCoComm ? (
            <TouchableOpacity style={styles.wantedAddBtn} onPress={() => setShowBanForm(true)}>
              <Text style={styles.wantedAddBtnText}>+ Add</Text>
            </TouchableOpacity>
          ) : <View style={{ width: 60 }} />}
        </View>

        {/* Wanted watermark strip */}
        <View style={styles.wantedStrip}>
          {['WANTED','•','WANTED','•','WANTED','•','WANTED','•'].map((t,i) => (
            <Text key={i} style={styles.wantedStripText}>{t}</Text>
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.wantedContent}>
          {banList.length === 0 ? (
            <View style={styles.wantedEmpty}>
              <Text style={styles.wantedEmptyIcon}>🏆</Text>
              <Text style={styles.wantedEmptyText}>No banned gamertags</Text>
              <Text style={styles.wantedEmptyHint}>Keep it clean out there</Text>
            </View>
          ) : (
            banList.map(entry => {
              const sev = severityConfig[entry.severity || 'Banned'];
              const isExpanded = expandedBan === entry.id;
              return (
                <TouchableOpacity
                  key={entry.id}
                  style={[styles.wantedCard, { backgroundColor: sev.bg, borderColor: sev.color + '44' }]}
                  onPress={() => setExpandedBan(isExpanded ? null : entry.id)}
                  activeOpacity={0.85}
                >
                  <View style={styles.wantedCardTop}>
                    <View style={[styles.wantedSeverityBadge, { backgroundColor: sev.color + '22', borderColor: sev.color }]}>
                      <Text style={[styles.wantedSeverityText, { color: sev.color }]}>{sev.icon} {entry.severity || 'Banned'}</Text>
                    </View>
                    <Text style={[styles.wantedPlatform, { color: sev.color }]}>{entry.platform || 'PSN'}</Text>
                    {isCommOrCoComm && (
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity onPress={() => {
                          setEditingBan(entry);
                          setNewBanEntry(entry.gamertag);
                          setBanPlatform(entry.platform || 'PSN');
                          setBanReason(entry.reason || '');
                          setBanSeverity(entry.severity || 'Banned');
                          setBanLinkedProfile(entry.linkedProfile || null);
                          setShowBanForm(true);
                        }}>
                          <Text style={styles.wantedEdit}>✏️</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={async () => {
                          Alert.alert('Remove ' + entry.gamertag + '?', '', [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Remove', style: 'destructive', onPress: async () => {
                              const { deleteDoc } = await import('firebase/firestore');
                              await deleteDoc(doc(db, 'leagues', leagueId, 'channels', 'ban-list', 'entries', entry.id));
                              setBanList(prev => prev.filter(e => e.id !== entry.id));
                            }},
                          ]);
                        }}>
                          <Text style={styles.wantedRemove}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                  <Text style={styles.wantedGamertag}>{entry.gamertag}</Text>
                  {entry.linkedProfile && (
                    <TouchableOpacity style={styles.wantedProfileBadge} onPress={() => router.push({ pathname: '/screens/profile', params: { uid: entry.linkedProfile.uid } })}>
                      <Text style={styles.wantedProfileBadgeText}>👤 {entry.linkedProfile.displayName} (@{entry.linkedProfile.username}) →</Text>
                    </TouchableOpacity>
                  )}
                  <Text style={styles.wantedAddedBy}>
                    Reported by {members[entry.addedBy]?.displayName || 'Commissioner'} · {entry.addedAt ? new Date(entry.addedAt.seconds * 1000).toLocaleDateString() : ''}
                  </Text>
                  {isExpanded && entry.reason && (
                    <View style={styles.wantedReason}>
                      <Text style={styles.wantedReasonLabel}>REASON:</Text>
                      <Text style={styles.wantedReasonText}>{entry.reason}</Text>
                    </View>
                  )}
                  {!isExpanded && <Text style={styles.wantedTapHint}>Tap to {entry.reason ? 'see reason' : 'expand'}</Text>}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>

        {/* Add Ban Modal */}
        <Modal visible={showBanForm} animationType='slide' presentationStyle='pageSheet'>
          <View style={styles.wantedModal}>
            <View style={styles.wantedModalHeader}>
              <TouchableOpacity onPress={() => { setShowBanForm(false); setBanLinkedProfile(null); setBanProfileSearch(''); setBanProfileResults([]); }}>
                <Text style={styles.wantedModalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.wantedModalTitle}>{editingBan ? 'Edit Ban Entry' : 'Add to Ban List'}</Text>
              <TouchableOpacity onPress={async () => {
                if (!newBanEntry.trim()) return;
                if (editingBan) {
                  // Update existing ban
                  await updateDoc(doc(db, 'leagues', leagueId, 'channels', 'ban-list', 'entries', editingBan.id), {
                    gamertag: newBanEntry.trim(),
                    platform: banPlatform,
                    reason: banReason,
                    severity: banSeverity,
                    linkedProfile: banLinkedProfile || null,
                  });
                  setBanList(prev => prev.map(e => e.id === editingBan.id ? { ...e, gamertag: newBanEntry.trim(), platform: banPlatform, reason: banReason, severity: banSeverity, linkedProfile: banLinkedProfile || null } : e));
                  setEditingBan(null);
                } else {
                  await addBanEntry();
                }
                setShowBanForm(false);
                setNewBanEntry('');
                setBanReason('');
                setBanSeverity('Banned');
                setBanPlatform('PSN');
                setBanLinkedProfile(null);
              }}>
                <Text style={styles.wantedModalPost}>{editingBan ? 'Update' : 'Ban'}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.wantedModalContent}>
              <Text style={styles.wantedModalLabel}>GAMERTAG</Text>
              <TextInput style={styles.wantedModalInput} placeholder='Enter gamertag...' placeholderTextColor='#555' value={newBanEntry} onChangeText={setNewBanEntry} autoCapitalize='none' autoFocus />
              <Text style={styles.wantedModalLabel}>PLATFORM</Text>
              <View style={styles.wantedPlatformRow}>
                {['PSN', 'Xbox', 'PC', 'EA'].map(p => (
                  <TouchableOpacity key={p} style={[styles.wantedPlatformBtn, banPlatform === p && styles.wantedPlatformBtnActive]} onPress={() => setBanPlatform(p)}>
                    <Text style={[styles.wantedPlatformBtnText, banPlatform === p && styles.wantedPlatformBtnTextActive]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.wantedModalLabel}>SEVERITY</Text>
              <View style={styles.wantedPlatformRow}>
                {['Warning', 'Banned', 'Perma-banned'].map(s => (
                  <TouchableOpacity key={s} style={[styles.wantedSeverityBtn, banSeverity === s && { borderColor: s === 'Warning' ? '#FFD700' : s === 'Banned' ? '#ff8800' : '#ff2222', backgroundColor: s === 'Warning' ? '#2a2000' : s === 'Banned' ? '#2a1000' : '#2a0000' }]} onPress={() => setBanSeverity(s)}>
                    <Text style={[styles.wantedSeverityBtnText, banSeverity === s && { color: s === 'Warning' ? '#FFD700' : s === 'Banned' ? '#ff8800' : '#ff2222' }]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.wantedModalLabel}>REASON (optional)</Text>
              <TextInput style={[styles.wantedModalInput, { minHeight: 80, textAlignVertical: 'top' }]} placeholder='Why are they being banned?' placeholderTextColor='#555' value={banReason} onChangeText={setBanReason} multiline />
              <Text style={styles.wantedModalLabel}>LINK PROFILE (optional)</Text>
              {banLinkedProfile ? (
                <View style={styles.wantedLinkedProfile}>
                  <View style={styles.wantedLinkedAvatar}>
                    <Text style={styles.wantedLinkedAvatarText}>{banLinkedProfile.displayName?.[0]?.toUpperCase() || '?'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.wantedLinkedName}>{banLinkedProfile.displayName}</Text>
                    <Text style={styles.wantedLinkedUsername}>@{banLinkedProfile.username}</Text>
                  </View>
                  <TouchableOpacity onPress={() => { setBanLinkedProfile(null); setBanProfileSearch(''); setBanProfileResults([]); }}>
                    <Text style={styles.wantedRemove}>✕</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <TextInput style={styles.wantedModalInput} placeholder='Search by username...' placeholderTextColor='#555' value={banProfileSearch} onChangeText={searchBanProfile} autoCapitalize='none' />
                  {banProfileResults.slice(0, 4).map(u => (
                    <TouchableOpacity key={u.uid} style={styles.wantedProfileResult} onPress={() => { setBanLinkedProfile(u); setBanProfileResults([]); setBanProfileSearch(''); }}>
                      <Text style={styles.wantedProfileResultName}>{u.displayName}</Text>
                      <Text style={styles.wantedProfileResultUser}>@{u.username}</Text>
                    </TouchableOpacity>
                  ))}
                </>
              )}
            </ScrollView>
          </View>
        </Modal>
      </View>
    );
  }

  // ── Reset Requests ────────────────────────────────────────────
  if (channelId === 'reset-requests') {
    const REASONS = ['Disconnected', 'Game Glitch', 'Opponent Quit', 'Sim Error', 'Wrong Score', 'Other'];
    const statusConfig: Record<string, { color: string; bg: string; icon: string }> = {
      pending:  { color: '#F5A623', bg: '#2a1a00', icon: '⏳' },
      approved: { color: '#00cc66', bg: '#002a14', icon: '✅' },
      denied:   { color: '#ff4444', bg: '#2a0000', icon: '❌' },
    };

    return (
      <View style={styles.resetContainer}>
        <View style={styles.resetHeader}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.resetBack}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.resetHeaderCenter}>
            <Text style={styles.resetHeaderTitle}>🔁 Game Resets</Text>
            <Text style={styles.resetHeaderSub}>{resetRequests.length} request{resetRequests.length !== 1 ? 's' : ''}</Text>
          </View>
          <TouchableOpacity style={styles.resetNewBtn} onPress={() => setShowResetForm(true)}>
            <Text style={styles.resetNewBtnText}>+ Request</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.resetContent}>
          {resetRequests.length === 0 ? (
            <View style={styles.resetEmpty}>
              <Text style={styles.resetEmptyIcon}>🎮</Text>
              <Text style={styles.resetEmptyText}>No reset requests yet</Text>
            </View>
          ) : (
            resetRequests.map(req => {
              const sc = statusConfig[req.status || 'pending'];
              const isMe = req.requestedBy === user?.uid;
              return (
                <View key={req.id} style={[styles.resetCard, { borderColor: sc.color + '44', backgroundColor: sc.bg }]}>
                  <View style={styles.resetCardTop}>
                    <View style={[styles.resetStatusBadge, { borderColor: sc.color, backgroundColor: sc.color + '22' }]}>
                      <Text style={[styles.resetStatusText, { color: sc.color }]}>{sc.icon} {(req.status || 'pending').toUpperCase()}</Text>
                    </View>
                    <Text style={styles.resetCardGM}>{members[req.requestedBy]?.displayName || 'GM'}</Text>
                  </View>
                  <View style={styles.resetCardInfo}>
                    <View style={styles.resetInfoRow}>
                      <Text style={styles.resetInfoLabel}>📅 DATE</Text>
                      <Text style={styles.resetInfoValue}>{req.gameDate || 'Not specified'}</Text>
                    </View>
                    <View style={styles.resetInfoRow}>
                      <Text style={styles.resetInfoLabel}>🏀 VS</Text>
                      <Text style={styles.resetInfoValue}>{req.opponent || 'Not specified'}</Text>
                    </View>
                    <View style={styles.resetInfoRow}>
                      <Text style={styles.resetInfoLabel}>📝 REASON</Text>
                      <Text style={styles.resetInfoValue}>{req.reason || req.description || 'No reason given'}</Text>
                    </View>
                  </View>
                  {req.proofUrl && (
                    <Image source={{ uri: req.proofUrl }} style={styles.resetProofImage} resizeMode='cover' />
                  )}
                  {req.dispute && (
                    <View style={styles.resetDisputeBox}>
                      <Text style={styles.resetDisputeLabel}>⚠️ DISPUTED</Text>
                      <Text style={styles.resetDisputeText}>{req.dispute}</Text>
                    </View>
                  )}
                  <View style={styles.resetActions}>
                    {isCommOrCoComm && req.status === 'pending' && (
                      <>
                        <TouchableOpacity style={styles.resetApproveBtn} onPress={() => approveResetRequest(req.id)}>
                          <Text style={styles.resetApproveBtnText}>✅ Approve</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.resetDenyBtn} onPress={async () => {
                          await updateDoc(doc(db, 'leagues', leagueId, 'channels', 'reset-requests', 'requests', req.id), { status: 'denied' });
                          await updateDoc(doc(db, 'users', req.requestedBy), {
                            notifications: arrayUnion({ type: 'reset_denied', leagueId, message: 'Your game reset request was denied', createdAt: new Date().toISOString() })
                          });
                          loadResetRequests();
                        }}>
                          <Text style={styles.resetDenyBtnText}>❌ Deny</Text>
                        </TouchableOpacity>
                      </>
                    )}
                    {isMe && req.status === 'pending' && (
                      <TouchableOpacity style={styles.resetCancelBtn} onPress={() => {
                        Alert.alert('Cancel Request?', 'Are you sure you want to cancel this reset request?', [
                          { text: 'No', style: 'cancel' },
                          { text: 'Yes, Cancel', style: 'destructive', onPress: async () => {
                            const { deleteDoc } = await import('firebase/firestore');
                            await deleteDoc(doc(db, 'leagues', leagueId, 'channels', 'reset-requests', 'requests', req.id));
                            loadResetRequests();
                          }},
                        ]);
                      }}>
                        <Text style={styles.resetCancelBtnText}>🗑 Cancel Request</Text>
                      </TouchableOpacity>
                    )}
                    {!isMe && req.status === 'pending' && !req.dispute && (
                      <TouchableOpacity style={styles.resetDisputeBtn} onPress={() => { setDisputingReq(req); setShowDisputeModal(true); }}>
                        <Text style={styles.resetDisputeBtnText}>⚠️ Dispute</Text>
                      </TouchableOpacity>
                    )}
                    {req.dispute && req.disputedBy === user?.uid && (
                      <TouchableOpacity style={styles.resetCancelBtn} onPress={() => {
                        Alert.alert('Cancel Dispute?', 'Remove your dispute on this request?', [
                          { text: 'No', style: 'cancel' },
                          { text: 'Yes', style: 'destructive', onPress: async () => {
                            await updateDoc(doc(db, 'leagues', leagueId, 'channels', 'reset-requests', 'requests', req.id), {
                              dispute: null, disputedBy: null
                            });
                            loadResetRequests();
                          }},
                        ]);
                      }}>
                        <Text style={styles.resetCancelBtnText}>↩ Cancel Dispute</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        {/* Submit Reset Modal */}
        <Modal visible={showResetForm} animationType='slide' presentationStyle='pageSheet'>
          <View style={styles.resetModal}>
            <View style={styles.resetModalHeader}>
              <TouchableOpacity onPress={() => setShowResetForm(false)}>
                <Text style={styles.resetModalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.resetModalTitle}>Request Game Reset</Text>
              <TouchableOpacity onPress={async () => {
                if (!resetGameDate || !resetOpponent || !resetReason) {
                  Alert.alert('Required', 'Please fill in date, opponent and reason.');
                  return;
                }
                const reasonText = resetReason === 'Other' ? resetCustomReason : resetReason;
                if (!user) return;
                await addDoc(collection(db, 'leagues', leagueId, 'channels', 'reset-requests', 'requests'), {
                  gameDate: resetGameDate,
                  opponent: resetOpponent,
                  reason: reasonText,
                  proofUrl: resetProofUrl || null,
                  requestedBy: user.uid,
                  status: 'pending',
                  createdAt: serverTimestamp(),
                });
                // Notify commissioner and opponent
                const leagueSnap = await getDoc(doc(db, 'leagues', leagueId));
                const commId = leagueSnap.data()?.commissionerId;
                const myName = members[user?.uid || '']?.displayName || 'A GM';
                const notifMsg = myName + ' requested a game reset vs ' + resetOpponent;
                if (commId) {
                  await updateDoc(doc(db, 'users', commId), {
                    notifications: arrayUnion({ type: 'reset_request', leagueId, message: notifMsg, createdAt: new Date().toISOString() })
                  });
                }
                // Notify opponent GM
                const teamsSnap = await getDocs(collection(db, 'leagues', leagueId, 'teams'));
                const oppTeam = teamsSnap.docs.find(d => d.data().name === resetOpponent);
                if (oppTeam && oppTeam.data().gmId && oppTeam.data().gmId !== commId) {
                  await updateDoc(doc(db, 'users', oppTeam.data().gmId), {
                    notifications: arrayUnion({
                      type: 'reset_request_opponent',
                      leagueId,
                      message: myName + ' submitted a reset request for your game',
                      createdAt: new Date().toISOString(),
                    })
                  });
                }
                setShowResetForm(false);
                setResetGameDate('');
                setResetOpponent('');
                setResetReason('');
                setResetCustomReason('');
                setResetProofUrl('');
                loadResetRequests();
              }}>
                <Text style={styles.resetModalSubmit}>Submit</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.resetModalContent}>
              <Text style={styles.resetModalLabel}>GAME DATE *</Text>
              <TextInput
                style={styles.resetModalInput}
                placeholder='MM/DD/YY'
                placeholderTextColor='#555'
                value={resetGameDate}
                keyboardType='number-pad'
                maxLength={8}
                onChangeText={(text) => {
                  // Auto-insert slashes
                  const digits = text.replace(/\D/g, '');
                  let formatted = digits;
                  if (digits.length >= 3) formatted = digits.slice(0,2) + '/' + digits.slice(2);
                  if (digits.length >= 5) formatted = digits.slice(0,2) + '/' + digits.slice(2,4) + '/' + digits.slice(4,6);
                  setResetGameDate(formatted);
                }}
              />

              <Text style={styles.resetModalLabel}>OPPONENT TEAM *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {leagueTeams.map((t: any) => (
                    <TouchableOpacity key={t.id} style={[styles.resetTeamChip, resetOpponent === t.name && styles.resetTeamChipActive]} onPress={() => setResetOpponent(t.name)}>
                      <Text style={[styles.resetTeamChipText, resetOpponent === t.name && styles.resetTeamChipTextActive]}>{t.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <Text style={styles.resetModalLabel}>REASON *</Text>
              <View style={styles.resetReasonGrid}>
                {REASONS.map(r => (
                  <TouchableOpacity key={r} style={[styles.resetReasonChip, resetReason === r && styles.resetReasonChipActive]} onPress={() => setResetReason(r)}>
                    <Text style={[styles.resetReasonChipText, resetReason === r && styles.resetReasonChipTextActive]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {resetReason === 'Other' && (
                <TextInput style={[styles.resetModalInput, { marginTop: 8 }]} placeholder='Describe the issue...' placeholderTextColor='#555' value={resetCustomReason} onChangeText={setResetCustomReason} multiline />
              )}

              <Text style={styles.resetModalLabel}>PROOF (optional)</Text>
              <TouchableOpacity style={styles.resetProofBtn} onPress={async () => {
                const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (!perm.granted) return;
                const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
                if (result.canceled || !result.assets?.[0]) return;
                try {
                  const blob = await (await fetch(result.assets[0].uri)).blob();
                  const { getStorage, ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
                  const storage = getStorage();
                  const storageRef = ref(storage, 'reset_proof/' + user?.uid + '_' + Date.now() + '.jpg');
                  await uploadBytes(storageRef, blob);
                  setResetProofUrl(await getDownloadURL(storageRef));
                } catch(e: any) { Alert.alert('Upload failed', e.message); }
              }}>
                {resetProofUrl ? (
                  <Image source={{ uri: resetProofUrl }} style={styles.resetProofPreview} />
                ) : (
                  <Text style={styles.resetProofBtnText}>📸 Attach Screenshot</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </Modal>
        {/* Dispute Modal */}
        <Modal visible={showDisputeModal} animationType='slide' presentationStyle='pageSheet'>
          <View style={styles.resetModal}>
            <View style={styles.resetModalHeader}>
              <TouchableOpacity onPress={() => { setShowDisputeModal(false); setDisputeReason(''); }}>
                <Text style={styles.resetModalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.resetModalTitle}>Dispute Request</Text>
              <TouchableOpacity onPress={async () => {
                if (!disputeReason.trim() || !disputingReq) return;
                await updateDoc(doc(db, 'leagues', leagueId, 'channels', 'reset-requests', 'requests', disputingReq.id), {
                  dispute: disputeReason.trim(),
                  disputedBy: user?.uid,
                });
                // Notify commissioner
                const leagueSnap = await getDoc(doc(db, 'leagues', leagueId));
                const commId = leagueSnap.data()?.commissionerId;
                if (commId) {
                  await updateDoc(doc(db, 'users', commId), {
                    notifications: arrayUnion({
                      type: 'reset_disputed',
                      leagueId,
                      message: (members[user?.uid || '']?.displayName || 'A GM') + ' disputed a game reset request',
                      createdAt: new Date().toISOString(),
                    })
                  });
                }
                setShowDisputeModal(false);
                setDisputeReason('');
                setDisputingReq(null);
                loadResetRequests();
              }}>
                <Text style={styles.resetModalSubmit}>Submit</Text>
              </TouchableOpacity>
            </View>
            <View style={{ padding: 20 }}>
              <Text style={styles.resetModalLabel}>WHY ARE YOU DISPUTING?</Text>
              <TextInput
                style={[styles.resetModalInput, { minHeight: 120, textAlignVertical: 'top' }]}
                placeholder='Explain why this reset should not be approved...'
                placeholderTextColor='#555'
                value={disputeReason}
                onChangeText={setDisputeReason}
                multiline
                autoFocus
              />
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // ── League News Bulletin Board ──────────────────────────────
  if (channelId === 'announcements') {
    return (
      <View style={styles.bulletinContainer}>
        <View style={styles.bulletinHeader}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.bulletinBack}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.bulletinHeaderCenter}>
            <Text style={styles.bulletinHeaderTitle}>📰 League News</Text>
          </View>
          <View style={styles.bulletinHeaderBtns}>
            {isCommOrCoComm && (
              <TouchableOpacity style={styles.bulletinEditBtn} onPress={() => { setBulletinEditMode(!bulletinEditMode); setSelectedBulletins([]); }}>
                <Text style={styles.bulletinEditBtnText}>{bulletinEditMode ? 'Done' : 'Edit'}</Text>
              </TouchableOpacity>
            )}
            {isCommOrCoComm && bulletinEditMode && (
              <TouchableOpacity
                style={[styles.bulletinDeleteBtn, selectedBulletins.length === 0 && { opacity: 0.4 }]}
                onPress={async () => {
                  if (selectedBulletins.length === 0) return;
                  Alert.alert('Delete ' + selectedBulletins.length + ' bulletin(s)?', '', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: async () => {
                      const { deleteDoc } = await import('firebase/firestore');
                      for (const id of selectedBulletins) {
                        await deleteDoc(doc(db, 'leagues', leagueId, 'channels', channelId, 'messages', id));
                      }
                      setSelectedBulletins([]);
                      setBulletinEditMode(false);
                    }},
                  ]);
                }}
              >
                <Text style={styles.bulletinDeleteBtnText}>{selectedBulletins.length > 0 ? '🗑 (' + selectedBulletins.length + ')' : '🗑 Select'}</Text>
              </TouchableOpacity>
            )}
            {isCommOrCoComm && !bulletinEditMode && (
              <TouchableOpacity style={styles.bulletinPostBtn} onPress={() => setShowCreatePoll(true)}>
                <Text style={styles.bulletinPostBtnText}>+ Post</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.bulletinContent}>
          {!bulletinLoaded ? (
            <View style={styles.bulletinEmpty}>
              <ActivityIndicator color='#FFD700' size='large' />
            </View>
          ) : messages.length === 0 ? (
            <View style={styles.bulletinEmpty}>
              <Text style={styles.bulletinEmptyIcon}>📌</Text>
              <Text style={styles.bulletinEmptyText}>No announcements yet</Text>
              {isCommOrCoComm && <Text style={styles.bulletinEmptyHint}>Tap + Post to pin a bulletin</Text>}
            </View>
          ) : (
            messages.slice().reverse().map((item, i) => {
              const sender = members[item.uid];
              const colors = ['#f5e6c8','#ffd6d6','#d6f5d6','#d6e8ff','#fff3cd','#f0d6ff'];
              const cardColor = colors[i % colors.length];
              const isSelected = selectedBulletins.includes(item.id);
              return (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.85}
                  style={[styles.bulletinCard, { backgroundColor: cardColor }, isSelected && styles.bulletinCardSelected]}
                  onPress={() => {
                    if (!bulletinEditMode) return;
                    setSelectedBulletins(prev =>
                      prev.includes(item.id) ? prev.filter(x => x !== item.id) : [...prev, item.id]
                    );
                  }}
                >
                  {bulletinEditMode && (
                    <View style={[styles.bulletinCheckbox, isSelected && styles.bulletinCheckboxChecked]}>
                      {isSelected && <Text style={styles.bulletinCheckMark}>✓</Text>}
                    </View>
                  )}
                  <View style={styles.bulletinPin} />
                  <Text style={styles.bulletinCardText}>{item.text}</Text>
                  {item.photoUrl && <Image source={{ uri: item.photoUrl }} style={styles.bulletinPhoto} />}
                  <View style={styles.bulletinCardFooter}>
                    <Text style={styles.bulletinCardAuthor}>— {sender?.displayName || 'Commissioner'}{sender?.teamName ? ' · ' + sender.teamName : ''}</Text>
                    <Text style={styles.bulletinCardTime}>{formatTime(item.createdAt)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
        {isCommOrCoComm && showCreatePoll && (
          <View style={styles.bulletinModal}>
            <View style={styles.bulletinModalInner}>
              <Text style={styles.bulletinModalTitle}>📌 New Bulletin</Text>
              <TextInput style={styles.bulletinModalInput} placeholder="Write your announcement..." placeholderTextColor="#888" value={pollQuestion} onChangeText={setPollQuestion} multiline autoFocus />
              <View style={styles.bulletinModalBtns}>
                <TouchableOpacity style={styles.bulletinModalCancel} onPress={() => { setShowCreatePoll(false); setPollQuestion(''); }}>
                  <Text style={styles.bulletinModalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.bulletinModalPost} onPress={async () => {
                  if (!pollQuestion.trim()) return;
                  await sendMessage(pollQuestion.trim());
                  setPollQuestion('');
                  setShowCreatePoll(false);
                }}>
                  <Text style={styles.bulletinModalPostText}>📌 Pin It</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>
    );
  }

  // ── Highlights & Box Scores ──────────────────────────────────
  if (channelId === 'highlights') {
    const uploadMedia = async () => {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission needed'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]) return;
      setHlUploading(true);
      try {
        const asset = result.assets[0];
        const blob = await (await fetch(asset.uri)).blob();
        const { getStorage, ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
        const storage = getStorage();
        const ext = asset.type === 'video' ? '.mp4' : '.jpg';
        const storageRef = ref(storage, 'highlights/' + user?.uid + '_' + Date.now() + ext);
        await uploadBytes(storageRef, blob);
        setHlMediaUrl(await getDownloadURL(storageRef));
      } catch(e: any) { Alert.alert('Upload failed', e.message); }
      setHlUploading(false);
    };

    const submitHighlight = async () => {
      if (highlightType === 'boxscore' && (!hlMyScore || !hlOppScore || !hlOpponent)) {
        Alert.alert('Required', 'Please fill in scores and opponent.');
        return;
      }
      if (highlightType !== 'boxscore' && !hlMediaUrl && !hlClipUrl) {
        Alert.alert('Required', 'Please upload media or paste a clip URL.');
        return;
      }
      try {
        const myTeam = leagueTeams.find((t: any) => t.gmId === user?.uid) || {};
        await addDoc(collection(db, 'leagues', leagueId, 'channels', 'highlights', 'posts'), {
          type: highlightType,
          caption: hlCaption,
          mediaUrl: hlMediaUrl || null,
          clipUrl: hlClipUrl || null,
          myScore: hlMyScore,
          oppScore: hlOppScore,
          opponent: hlOpponent,
          result: hlResult,
          postedBy: user?.uid,
          teamName: myTeam.name || '',
          teamAbbr: myTeam.abbreviation || '',
          createdAt: serverTimestamp(),
          featured: false,
        });
        setShowHighlightForm(false);
        setHlCaption(''); setHlMediaUrl(''); setHlClipUrl('');
        setHlMyScore(''); setHlOppScore(''); setHlOpponent('');
      } catch(e: any) { Alert.alert('Error', e.message); }
    };

    return (
      <View style={styles.hlContainer}>
        {/* Broadcast header */}
        <View style={styles.hlHeader}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.hlBack}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.hlHeaderCenter}>
            <Text style={styles.hlLive}>● LIVE</Text>
            <Text style={styles.hlHeaderTitle}>HIGHLIGHTS</Text>
          </View>
          <TouchableOpacity style={styles.hlPostBtn} onPress={() => setShowHighlightForm(true)}>
            <Text style={styles.hlPostBtnText}>+ Post</Text>
          </TouchableOpacity>
        </View>

        {/* Ticker */}
        <View style={styles.hlTicker}>
          <Text style={styles.hlTickerLabel}>NOW SHOWING</Text>
          <Text style={styles.hlTickerText}> · TOP PLAYS · BOX SCORES · HIGHLIGHTS · LEAGUE ACTION · </Text>
        </View>

        <ScrollView contentContainerStyle={styles.hlContent}>
          {highlights.length === 0 ? (
            <View style={styles.hlEmpty}>
              <Text style={styles.hlEmptyIcon}>🎬</Text>
              <Text style={styles.hlEmptyText}>No highlights yet</Text>
              <Text style={styles.hlEmptyHint}>Be the first to post a clip or box score</Text>
            </View>
          ) : (
            highlights.map(item => {
              const isMe = item.postedBy === user?.uid;
              const sender = members[item.postedBy];
              return (
                <View key={item.id} style={[styles.hlCard, item.featured && styles.hlCardFeatured]}>
                  {item.featured && <View style={styles.hlFeaturedBanner}><Text style={styles.hlFeaturedText}>⭐ TOP PLAY</Text></View>}

                  {/* Card header */}
                  <View style={styles.hlCardHeader}>
                    <Text style={styles.hlCardTeam}>{item.teamName || sender?.displayName || 'GM'}</Text>
                    <Text style={styles.hlCardTime}>{item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000).toLocaleDateString() : ''}</Text>
                    {isCommOrCoComm && (
                      <TouchableOpacity onPress={async () => {
                        await updateDoc(doc(db, 'leagues', leagueId, 'channels', 'highlights', 'posts', item.id), { featured: !item.featured });
                      }}>
                        <Text style={styles.hlFeatureBtn}>{item.featured ? '★' : '☆'}</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Box Score */}
                  {item.type === 'boxscore' && (
                    <View style={styles.hlScoreboard}>
                      <View style={styles.hlScoreTeam}>
                        <Text style={styles.hlScoreTeamName}>{item.teamName || 'My Team'}</Text>
                        <Text style={[styles.hlScoreNum, { color: item.result === 'W' ? '#00cc66' : '#ff4444' }]}>{item.myScore}</Text>
                      </View>
                      <View style={styles.hlScoreVs}>
                        <Text style={styles.hlScoreVsText}>FINAL</Text>
                        <Text style={[styles.hlResultBadge, { color: item.result === 'W' ? '#00cc66' : '#ff4444' }]}>{item.result}</Text>
                      </View>
                      <View style={styles.hlScoreTeam}>
                        <Text style={styles.hlScoreTeamName}>{item.opponent}</Text>
                        <Text style={styles.hlScoreNum}>{item.oppScore}</Text>
                      </View>
                    </View>
                  )}

                  {/* Photo highlight */}
                  {item.mediaUrl && (
                    <Image source={{ uri: item.mediaUrl }} style={styles.hlMedia} resizeMode='cover' />
                  )}

                  {/* Clip URL */}
                  {item.clipUrl && (
                    <TouchableOpacity style={styles.hlClipCard} onPress={() => { const { Linking } = require('react-native'); Linking.openURL(item.clipUrl); }}>
                      <Text style={styles.hlClipIcon}>▶️</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.hlClipLabel}>VIDEO CLIP</Text>
                        <Text style={styles.hlClipUrl} numberOfLines={1}>{item.clipUrl}</Text>
                      </View>
                      <Text style={styles.hlClipArrow}>→</Text>
                    </TouchableOpacity>
                  )}

                  {/* Caption */}
                  {item.caption ? <Text style={styles.hlCaption}>{item.caption}</Text> : null}
                </View>
              );
            })
          )}
        </ScrollView>

        {/* Post Modal */}
        <Modal visible={showHighlightForm} animationType='slide' presentationStyle='pageSheet'>
          <View style={styles.hlModal}>
            <View style={styles.hlModalHeader}>
              <TouchableOpacity onPress={() => setShowHighlightForm(false)}>
                <Text style={styles.hlModalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.hlModalTitle}>New Post</Text>
              <TouchableOpacity onPress={submitHighlight}>
                <Text style={styles.hlModalPost}>Post</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.hlModalContent}>
              {/* Type selector */}
              <Text style={styles.hlModalLabel}>POST TYPE</Text>
              <View style={styles.hlTypeRow}>
                {[['highlight','🖼️ Photo'],['boxscore','📊 Box Score'],['clip','🎬 Clip URL']].map(([type, label]) => (
                  <TouchableOpacity key={type} style={[styles.hlTypeBtn, highlightType === type && styles.hlTypeBtnActive]} onPress={() => setHighlightType(type as any)}>
                    <Text style={[styles.hlTypeBtnText, highlightType === type && styles.hlTypeBtnTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {highlightType === 'highlight' && (
                <>
                  <Text style={styles.hlModalLabel}>PHOTO/VIDEO</Text>
                  <TouchableOpacity style={styles.hlUploadBtn} onPress={uploadMedia}>
                    {hlUploading ? <ActivityIndicator color='#ff4444' /> :
                     hlMediaUrl ? <Image source={{ uri: hlMediaUrl }} style={styles.hlUploadPreview} /> :
                     <Text style={styles.hlUploadBtnText}>📸 Upload Photo or Video</Text>}
                  </TouchableOpacity>
                </>
              )}

              {highlightType === 'clip' && (
                <>
                  <Text style={styles.hlModalLabel}>CLIP URL (YouTube, Twitch, etc)</Text>
                  <TextInput style={styles.hlModalInput} placeholder='https://...' placeholderTextColor='#555' value={hlClipUrl} onChangeText={setHlClipUrl} autoCapitalize='none' keyboardType='url' />
                </>
              )}

              {highlightType === 'boxscore' && (
                <>
                  <Text style={styles.hlModalLabel}>RESULT</Text>
                  <View style={styles.hlResultRow}>
                    <TouchableOpacity style={[styles.hlResultBtn, hlResult === 'W' && styles.hlResultBtnW]} onPress={() => setHlResult('W')}>
                      <Text style={[styles.hlResultBtnText, hlResult === 'W' && { color: '#00cc66' }]}>WIN</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.hlResultBtn, hlResult === 'L' && styles.hlResultBtnL]} onPress={() => setHlResult('L')}>
                      <Text style={[styles.hlResultBtnText, hlResult === 'L' && { color: '#ff4444' }]}>LOSS</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.hlModalLabel}>FINAL SCORE</Text>
                  <View style={styles.hlScoreInputRow}>
                    <TextInput style={[styles.hlModalInput, { flex: 1, textAlign: 'center', fontSize: 24, fontWeight: '800' }]} placeholder='0' placeholderTextColor='#555' value={hlMyScore} onChangeText={setHlMyScore} keyboardType='numeric' />
                    <Text style={styles.hlScoreDash}>—</Text>
                    <TextInput style={[styles.hlModalInput, { flex: 1, textAlign: 'center', fontSize: 24, fontWeight: '800' }]} placeholder='0' placeholderTextColor='#555' value={hlOppScore} onChangeText={setHlOppScore} keyboardType='numeric' />
                  </View>
                  <Text style={styles.hlModalLabel}>OPPONENT</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {leagueTeams.map((t: any) => (
                        <TouchableOpacity key={t.id} style={[styles.resetTeamChip, hlOpponent === t.name && styles.resetTeamChipActive]} onPress={() => setHlOpponent(t.name)}>
                          <Text style={[styles.resetTeamChipText, hlOpponent === t.name && styles.resetTeamChipTextActive]}>{t.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </>
              )}

              <Text style={styles.hlModalLabel}>CAPTION (optional)</Text>
              <TextInput style={styles.hlModalInput} placeholder='Add a caption...' placeholderTextColor='#555' value={hlCaption} onChangeText={setHlCaption} multiline />
            </ScrollView>
          </View>
        </Modal>
      </View>
    );
  }

  // ── Chat Channels (league-chat, trade-talk, trade-block, announcements) ──
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
        data={messages.filter((m: any) => !blockSet.has(m.uid))}
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
        <View>
          {pendingGif && (
            <View style={styles.pendingGifRow}>
              <Image source={{ uri: pendingGif }} style={styles.pendingGifThumb} resizeMode='cover' />
              <TouchableOpacity style={styles.pendingGifRemove} onPress={() => setPendingGif(null)}>
                <Text style={styles.pendingGifRemoveText}>✕</Text>
              </TouchableOpacity>
              <Text style={styles.pendingGifLabel}>GIF ready · Add a caption or send</Text>
            </View>
          )}
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
            style={[styles.sendBtn, (!text.trim() && !pendingGif && !sending) && styles.sendBtnDisabled]}
            onPress={() => { sendMessage(undefined, pendingGif || undefined); setPendingGif(null); }}
            disabled={(!text.trim() && !pendingGif) || sending}
          >
            <Text style={styles.sendBtnText}>↑</Text>
          </TouchableOpacity>
        </View>
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

  bulletinContainer: { flex: 1, backgroundColor: '#8B6914' },
  bulletinHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, backgroundColor: '#5C3D11', borderBottomWidth: 3, borderBottomColor: '#3a2408' },
  bulletinBack: { color: '#FFD700', fontSize: 15, fontWeight: '700', width: 60 },
  bulletinHeaderCenter: { flex: 1, alignItems: 'center' },
  bulletinHeaderTitle: { color: '#FFD700', fontSize: 18, fontWeight: '900' },
  bulletinHeaderBtns: { flexDirection: 'row', gap: 8, alignItems: 'center', width: 120, justifyContent: 'flex-end' },
  bulletinEditBtn: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  bulletinEditBtnText: { color: '#FFD700', fontSize: 12, fontWeight: '700' },
  bulletinDeleteBtn: { backgroundColor: '#cc2222', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  bulletinDeleteBtnText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  bulletinPostBtn: { backgroundColor: '#FFD700', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  bulletinPostBtnText: { color: '#3a2408', fontSize: 13, fontWeight: '800' },
  bulletinContent: { padding: 16, paddingBottom: 100, gap: 16 },
  bulletinEmpty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  bulletinEmptyIcon: { fontSize: 48 },
  bulletinEmptyText: { color: '#f5e6c8', fontSize: 16, fontWeight: '700' },
  bulletinEmptyHint: { color: '#c8a87a', fontSize: 13 },
  bulletinCard: { borderRadius: 4, padding: 20, shadowColor: '#000', shadowOffset: { width: 2, height: 4 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 6, position: 'relative' },
  bulletinCardSelected: { borderWidth: 3, borderColor: '#cc2222' },
  bulletinCheckbox: { position: 'absolute', top: 10, right: 10, width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#5C3D11', backgroundColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  bulletinCheckboxChecked: { backgroundColor: '#cc2222', borderColor: '#cc2222' },
  bulletinCheckMark: { color: '#fff', fontSize: 14, fontWeight: '800' },
  bulletinPin: { position: 'absolute', top: -8, left: '50%', width: 16, height: 16, borderRadius: 8, backgroundColor: '#cc2222', borderWidth: 2, borderColor: '#ff4444', marginLeft: -8, zIndex: 1 },
  bulletinCardText: { color: '#2a1a00', fontSize: 16, lineHeight: 24, marginTop: 8 },
  bulletinPhoto: { width: '100%', height: 200, borderRadius: 4, marginTop: 12 },
  bulletinCardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.1)', paddingTop: 8 },
  bulletinCardAuthor: { color: '#5C3D11', fontSize: 12, fontWeight: '700', fontStyle: 'italic' },
  bulletinCardTime: { color: '#8B6914', fontSize: 11 },
  bulletinModal: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24 },
  bulletinModalInner: { backgroundColor: '#f5e6c8', borderRadius: 8, padding: 20 },
  bulletinModalTitle: { fontSize: 18, fontWeight: '800', color: '#3a2408', marginBottom: 16 },
  bulletinModalInput: { backgroundColor: '#fff', borderRadius: 6, padding: 14, fontSize: 15, color: '#2a1a00', minHeight: 100, textAlignVertical: 'top', borderWidth: 1, borderColor: '#c8a87a' },
  bulletinModalBtns: { flexDirection: 'row', gap: 12, marginTop: 16 },
  bulletinModalCancel: { flex: 1, padding: 14, alignItems: 'center', borderRadius: 6, borderWidth: 1, borderColor: '#8B6914' },
  bulletinModalCancelText: { color: '#8B6914', fontWeight: '700' },
  bulletinModalPost: { flex: 1, padding: 14, alignItems: 'center', borderRadius: 6, backgroundColor: '#5C3D11' },
  bulletinModalPostText: { color: '#FFD700', fontWeight: '800', fontSize: 15 },

  chalkContainer: { flex: 1, backgroundColor: '#2d5a27' },
  chalkHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, backgroundColor: '#1a3d16', borderBottomWidth: 3, borderBottomColor: '#0d2409' },
  chalkBack: { color: '#a8d5a2', fontSize: 15, fontWeight: '700', width: 60 },
  chalkTitle: { color: '#ffffff', fontSize: 17, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 },
  chalkHeaderBtns: { flexDirection: 'row', gap: 8, width: 120, justifyContent: 'flex-end' },
  chalkEditBtn: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  chalkEditBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  chalkCancelBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  chalkCancelBtnText: { color: '#ffaaaa', fontSize: 12, fontWeight: '600' },
  chalkSaveBtn: { backgroundColor: '#f5c518', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  chalkSaveBtnText: { color: '#1a3d16', fontSize: 12, fontWeight: '800' },
  chalkTray: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 6, backgroundColor: '#8B7355', borderBottomWidth: 2, borderBottomColor: '#5c4a2a' },
  chalkTrayItem: { color: '#e8e0d0', fontSize: 14, opacity: 0.7 },
  chalkContent: { padding: 20, paddingBottom: 100 },
  chalkBoard: { padding: 4 },
  chalkHeading: { color: '#ffffff', fontSize: 22, fontWeight: '900', textAlign: 'center', letterSpacing: 4, marginBottom: 8, textShadowColor: 'rgba(255,255,255,0.3)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 },
  chalkDivider: { height: 2, backgroundColor: 'rgba(255,255,255,0.3)', marginBottom: 20, marginHorizontal: 20 },
  chalkRuleLine: { flexDirection: 'row', gap: 10, marginBottom: 16, alignItems: 'flex-start' },
  chalkRuleNum: { color: '#f5c518', fontSize: 18, fontWeight: '800', width: 24, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 },
  chalkRuleText: { flex: 1, color: 'rgba(255,255,255,0.92)', fontSize: 17, lineHeight: 26, fontFamily: Platform.OS === 'ios' ? 'Chalkboard SE' : 'monospace', textShadowColor: 'rgba(255,255,255,0.15)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 4 },
  chalkEditHint: { color: 'rgba(255,255,255,0.3)', fontSize: 11, textAlign: 'center', marginTop: 32, fontStyle: 'italic' },
  chalkEditArea: { gap: 12 },
  chalkEditLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontStyle: 'italic' },
  chalkInput: { color: '#ffffff', fontSize: 16, lineHeight: 28, minHeight: 300, fontFamily: Platform.OS === 'ios' ? 'Chalkboard SE' : 'monospace', padding: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.2)' },
  chalkEmpty: { alignItems: 'center', paddingTop: 80, gap: 20 },
  chalkEmptyText: { color: 'rgba(255,255,255,0.4)', fontSize: 18, fontStyle: 'italic' },
  chalkWriteBtn: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingVertical: 14, paddingHorizontal: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  chalkWriteBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },

  voteContainer: { flex: 1, backgroundColor: '#0d0d1a' },
  voteHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, backgroundColor: '#0a0a14', borderBottomWidth: 1, borderBottomColor: '#1a1a2a' },
  voteBack: { color: '#8888ff', fontSize: 15, fontWeight: '700', width: 60 },
  voteHeaderCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  voteHeaderIcon: { fontSize: 22 },
  voteHeaderTitle: { color: '#ffffff', fontSize: 18, fontWeight: '900', letterSpacing: 2 },
  voteNewBtn: { backgroundColor: '#F5A623', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  voteNewBtnText: { color: '#000', fontSize: 13, fontWeight: '800' },
  votePodium: { backgroundColor: '#1a1a2a', paddingVertical: 8, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: '#F5A623' },
  votePodiumText: { color: '#F5A623', fontSize: 11, fontWeight: '900', letterSpacing: 3 },
  voteContent: { padding: 16, paddingBottom: 100 },
  voteEmpty: { alignItems: 'center', paddingTop: 80, gap: 16 },
  voteEmptyIcon: { fontSize: 56 },
  voteEmptyText: { color: '#555', fontSize: 16 },
  voteStartBtn: { backgroundColor: '#F5A623', borderRadius: 10, paddingVertical: 14, paddingHorizontal: 28 },
  voteStartBtnText: { color: '#000', fontSize: 15, fontWeight: '800' },
  voteCard: { backgroundColor: '#111122', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#2a2a4a' },
  voteCardClosed: { opacity: 0.75, borderColor: '#333' },
  voteCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  voteStatusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  voteStatusOpen: { backgroundColor: '#0a2a0a' },
  voteStatusClosed: { backgroundColor: '#2a1a1a' },
  voteStatusText: { fontSize: 11, fontWeight: '800', color: '#ffffff' },
  voteTurnout: { flex: 1, color: '#666', fontSize: 11 },
  voteManageBtn: { fontSize: 18 },
  voteQuestion: { color: '#ffffff', fontSize: 18, fontWeight: '800', marginBottom: 16, lineHeight: 24 },
  voteOptions: { gap: 8 },
  voteOption: { borderRadius: 10, borderWidth: 1, borderColor: '#2a2a4a', overflow: 'hidden', backgroundColor: '#1a1a2a', position: 'relative' },
  voteOptionMine: { borderColor: '#F5A623' },
  voteOptionBar: { position: 'absolute', top: 0, left: 0, bottom: 0, opacity: 0.25 },
  voteOptionContent: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  voteRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#4444ff', alignItems: 'center', justifyContent: 'center' },
  voteRadioSelected: { borderColor: '#F5A623' },
  voteRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#F5A623' },
  voteOptionText: { flex: 1, color: '#cccccc', fontSize: 15 },
  voteOptionTextMine: { color: '#ffffff', fontWeight: '700' },
  voteOptionPct: { color: '#666', fontSize: 14, fontWeight: '600' },
  voteVoters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#1a1a2a' },
  voteVotersLabel: { color: '#555', fontSize: 11 },
  voteVoterName: { color: '#8888ff', fontSize: 11, fontWeight: '600', backgroundColor: '#1a1a2a', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  votePrompt: { color: '#444', fontSize: 11, textAlign: 'center', marginTop: 10, fontStyle: 'italic' },
  voteModalContainer: { flex: 1, backgroundColor: '#0d0d1a' },
  voteModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 56, borderBottomWidth: 1, borderBottomColor: '#1a1a2a' },
  voteModalCancel: { color: '#ff4444', fontSize: 15, fontWeight: '600' },
  voteModalTitle: { color: '#ffffff', fontSize: 17, fontWeight: '800' },
  voteModalCreate: { color: '#F5A623', fontSize: 15, fontWeight: '700' },
  voteModalContent: { padding: 20, paddingBottom: 60 },
  voteModalLabel: { color: '#555', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 8, marginTop: 16 },
  voteModalInput: { backgroundColor: '#1a1a2a', borderRadius: 10, padding: 14, color: '#ffffff', fontSize: 15, borderWidth: 1, borderColor: '#2a2a4a' },
  voteModalOptionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  voteModalOptionNum: { color: '#F5A623', fontSize: 16, fontWeight: '800', width: 20 },
  voteModalOptionInput: { flex: 1, backgroundColor: '#1a1a2a', borderRadius: 10, padding: 12, color: '#ffffff', fontSize: 15, borderWidth: 1, borderColor: '#2a2a4a' },
  voteModalRemove: { color: '#ff4444', fontSize: 18, fontWeight: '700' },
  voteAddOption: { marginTop: 8, padding: 12, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#2a2a4a', borderStyle: 'dashed' },
  voteAddOptionText: { color: '#555', fontSize: 14 },

  wantedContainer: { flex: 1, backgroundColor: '#1a0000' },
  wantedHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, backgroundColor: '#0d0000', borderBottomWidth: 2, borderBottomColor: '#440000' },
  wantedBack: { color: '#ff6666', fontSize: 15, fontWeight: '700', width: 60 },
  wantedHeaderCenter: { alignItems: 'center' },
  wantedHeaderTitle: { color: '#ff2222', fontSize: 22, fontWeight: '900', letterSpacing: 3 },
  wantedHeaderSub: { color: '#aa4444', fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  wantedAddBtn: { backgroundColor: '#ff2222', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  wantedAddBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  wantedStrip: { flexDirection: 'row', backgroundColor: '#ff2222', paddingVertical: 4, gap: 8, paddingHorizontal: 8, overflow: 'hidden' },
  wantedStripText: { color: 'rgba(0,0,0,0.4)', fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  wantedContent: { padding: 16, paddingBottom: 100 },
  wantedEmpty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  wantedEmptyIcon: { fontSize: 56 },
  wantedEmptyText: { color: '#aa4444', fontSize: 18, fontWeight: '700' },
  wantedEmptyHint: { color: '#553333', fontSize: 13 },
  wantedCard: { borderRadius: 8, padding: 16, marginBottom: 12, borderWidth: 1 },
  wantedCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  wantedSeverityBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  wantedSeverityText: { fontSize: 11, fontWeight: '800' },
  wantedPlatform: { flex: 1, fontSize: 11, fontWeight: '700' },
  wantedEdit: { fontSize: 16 },
  wantedRemove: { color: '#ff4444', fontSize: 18, fontWeight: '700' },
  wantedGamertag: { color: '#ffffff', fontSize: 22, fontWeight: '900', letterSpacing: 1, marginBottom: 4 },
  wantedAddedBy: { color: '#886666', fontSize: 11, marginBottom: 4 },
  wantedReason: { marginTop: 10, padding: 10, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 6, borderLeftWidth: 3, borderLeftColor: '#ff2222' },
  wantedReasonLabel: { color: '#ff6666', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  wantedReasonText: { color: '#ccaaaa', fontSize: 13, lineHeight: 18 },
  wantedTapHint: { color: '#553333', fontSize: 10, fontStyle: 'italic', marginTop: 4 },
  wantedModal: { flex: 1, backgroundColor: '#0d0000' },
  wantedModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 56, borderBottomWidth: 1, borderBottomColor: '#330000' },
  wantedModalCancel: { color: '#888', fontSize: 15, fontWeight: '600' },
  wantedModalTitle: { color: '#ff2222', fontSize: 17, fontWeight: '900' },
  wantedModalPost: { color: '#ff2222', fontSize: 15, fontWeight: '800' },
  wantedModalContent: { padding: 20, paddingBottom: 60 },
  wantedModalLabel: { color: '#aa4444', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 8, marginTop: 16 },
  wantedModalInput: { backgroundColor: '#1a0a0a', borderRadius: 10, padding: 14, color: '#ffffff', fontSize: 15, borderWidth: 1, borderColor: '#440000' },
  wantedPlatformRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  wantedPlatformBtn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#440000', backgroundColor: '#1a0a0a' },
  wantedPlatformBtnActive: { backgroundColor: '#330000', borderColor: '#ff2222' },
  wantedPlatformBtnText: { color: '#886666', fontSize: 13, fontWeight: '600' },
  wantedPlatformBtnTextActive: { color: '#ff6666' },
  wantedSeverityBtn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#440000', backgroundColor: '#1a0a0a' },
  wantedSeverityBtnText: { color: '#886666', fontSize: 13, fontWeight: '600' },

  wantedLinkedProfile: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#1a0a0a', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#ff2222' },
  wantedLinkedAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#330000', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ff2222' },
  wantedLinkedAvatarText: { color: '#ff6666', fontSize: 16, fontWeight: '800' },
  wantedLinkedName: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  wantedLinkedUsername: { color: '#886666', fontSize: 12 },
  wantedProfileResult: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1a0a0a', borderRadius: 8, padding: 12, marginTop: 6, borderWidth: 1, borderColor: '#330000' },
  wantedProfileResultName: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  wantedProfileResultUser: { color: '#886666', fontSize: 12 },
  wantedProfileBadge: { backgroundColor: '#330000', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginTop: 4, alignSelf: 'flex-start' },
  wantedProfileBadgeText: { color: '#ff9999', fontSize: 12, fontWeight: '600' },

  resetContainer: { flex: 1, backgroundColor: '#0a0a14' },
  resetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, backgroundColor: '#060610', borderBottomWidth: 1, borderBottomColor: '#1a1a2a' },
  resetBack: { color: '#8888ff', fontSize: 15, fontWeight: '700', width: 60 },
  resetHeaderCenter: { alignItems: 'center' },
  resetHeaderTitle: { color: '#ffffff', fontSize: 18, fontWeight: '900' },
  resetHeaderSub: { color: '#555', fontSize: 11 },
  resetNewBtn: { backgroundColor: '#4444ff', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  resetNewBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  resetContent: { padding: 16, paddingBottom: 100 },
  resetEmpty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  resetEmptyIcon: { fontSize: 56 },
  resetEmptyText: { color: '#444', fontSize: 16 },
  resetCard: { borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1 },
  resetCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  resetStatusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  resetStatusText: { fontSize: 11, fontWeight: '800' },
  resetCardGM: { flex: 1, color: '#888', fontSize: 12, fontWeight: '600' },
  resetCardInfo: { gap: 8, marginBottom: 10 },
  resetInfoRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  resetInfoLabel: { color: '#555', fontSize: 10, fontWeight: '800', width: 70 },
  resetInfoValue: { color: '#ffffff', fontSize: 14, fontWeight: '600', flex: 1 },
  resetProofImage: { width: '100%', height: 160, borderRadius: 8, marginBottom: 10 },
  resetActions: { flexDirection: 'row', gap: 8 },
  resetApproveBtn: { flex: 1, backgroundColor: '#002a14', borderRadius: 8, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#00cc66' },
  resetApproveBtnText: { color: '#00cc66', fontSize: 13, fontWeight: '700' },
  resetDenyBtn: { flex: 1, backgroundColor: '#2a0000', borderRadius: 8, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#ff4444' },
  resetDenyBtnText: { color: '#ff4444', fontSize: 13, fontWeight: '700' },
  resetModal: { flex: 1, backgroundColor: '#0a0a14' },
  resetModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 56, borderBottomWidth: 1, borderBottomColor: '#1a1a2a' },
  resetModalCancel: { color: '#888', fontSize: 15, fontWeight: '600' },
  resetModalTitle: { color: '#ffffff', fontSize: 17, fontWeight: '800' },
  resetModalSubmit: { color: '#4444ff', fontSize: 15, fontWeight: '800' },
  resetModalContent: { padding: 20, paddingBottom: 60 },
  resetModalLabel: { color: '#555', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 8, marginTop: 16 },
  resetModalInput: { backgroundColor: '#1a1a2a', borderRadius: 10, padding: 14, color: '#ffffff', fontSize: 15, borderWidth: 1, borderColor: '#2a2a4a' },
  resetTeamChip: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#2a2a4a', backgroundColor: '#1a1a2a' },
  resetTeamChipActive: { borderColor: '#4444ff', backgroundColor: '#1a1a3a' },
  resetTeamChipText: { color: '#666', fontSize: 13 },
  resetTeamChipTextActive: { color: '#8888ff', fontWeight: '700' },
  resetReasonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  resetReasonChip: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#2a2a4a', backgroundColor: '#1a1a2a' },
  resetReasonChipActive: { borderColor: '#F5A623', backgroundColor: '#2a1a00' },
  resetReasonChipText: { color: '#666', fontSize: 13 },
  resetReasonChipTextActive: { color: '#F5A623', fontWeight: '700' },
  resetProofBtn: { backgroundColor: '#1a1a2a', borderRadius: 10, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a4a', borderStyle: 'dashed' },
  resetProofBtnText: { color: '#555', fontSize: 14 },
  resetProofPreview: { width: '100%', height: 180, borderRadius: 8 },

  hlContainer: { flex: 1, backgroundColor: '#0a0000' },
  hlHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, backgroundColor: '#000000', borderBottomWidth: 2, borderBottomColor: '#cc0000' },
  hlBack: { color: '#ff6666', fontSize: 15, fontWeight: '700', width: 60 },
  hlHeaderCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hlLive: { color: '#ff2222', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  hlHeaderTitle: { color: '#ffffff', fontSize: 20, fontWeight: '900', letterSpacing: 3 },
  hlPostBtn: { backgroundColor: '#cc0000', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  hlPostBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  hlTicker: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#cc0000', paddingVertical: 5, paddingHorizontal: 8, gap: 6 },
  hlTickerLabel: { color: '#ffffff', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  hlTickerText: { color: 'rgba(255,255,255,0.8)', fontSize: 9, fontWeight: '600', letterSpacing: 1 },
  hlContent: { padding: 12, paddingBottom: 100 },
  hlEmpty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  hlEmptyIcon: { fontSize: 56 },
  hlEmptyText: { color: '#555', fontSize: 16, fontWeight: '700' },
  hlEmptyHint: { color: '#444', fontSize: 13 },
  hlCard: { backgroundColor: '#111', borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#222', overflow: 'hidden' },
  hlCardFeatured: { borderColor: '#FFD700', borderWidth: 2 },
  hlFeaturedBanner: { backgroundColor: '#FFD700', paddingVertical: 4, alignItems: 'center' },
  hlFeaturedText: { color: '#000', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  hlCardHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  hlCardTeam: { flex: 1, color: '#888', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  hlCardTime: { color: '#444', fontSize: 11 },
  hlFeatureBtn: { fontSize: 20, color: '#FFD700', marginLeft: 8 },
  hlScoreboard: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 8 },
  hlScoreTeam: { flex: 1, alignItems: 'center', gap: 4 },
  hlScoreTeamName: { color: '#aaa', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  hlScoreNum: { color: '#ffffff', fontSize: 36, fontWeight: '900' },
  hlScoreVs: { alignItems: 'center', gap: 4 },
  hlScoreVsText: { color: '#555', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  hlResultBadge: { fontSize: 16, fontWeight: '900' },
  hlMedia: { width: '100%', height: 220 },
  hlClipCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: '#1a0000', borderTopWidth: 1, borderTopColor: '#330000' },
  hlClipIcon: { fontSize: 24 },
  hlClipLabel: { color: '#ff6666', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  hlClipUrl: { color: '#888', fontSize: 12 },
  hlClipArrow: { color: '#ff4444', fontSize: 18 },
  hlCaption: { color: '#cccccc', fontSize: 14, padding: 12, paddingTop: 8, lineHeight: 20 },
  hlModal: { flex: 1, backgroundColor: '#0a0000' },
  hlModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 56, borderBottomWidth: 1, borderBottomColor: '#330000' },
  hlModalCancel: { color: '#888', fontSize: 15, fontWeight: '600' },
  hlModalTitle: { color: '#ffffff', fontSize: 17, fontWeight: '800' },
  hlModalPost: { color: '#ff4444', fontSize: 15, fontWeight: '800' },
  hlModalContent: { padding: 20, paddingBottom: 60 },
  hlModalLabel: { color: '#555', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 8, marginTop: 16 },
  hlModalInput: { backgroundColor: '#1a0a0a', borderRadius: 10, padding: 14, color: '#ffffff', fontSize: 15, borderWidth: 1, borderColor: '#330000' },
  hlTypeRow: { flexDirection: 'row', gap: 8 },
  hlTypeBtn: { flex: 1, padding: 10, alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: '#330000', backgroundColor: '#1a0a0a' },
  hlTypeBtnActive: { borderColor: '#cc0000', backgroundColor: '#2a0000' },
  hlTypeBtnText: { color: '#666', fontSize: 12, fontWeight: '600' },
  hlTypeBtnTextActive: { color: '#ff6666', fontWeight: '800' },
  hlUploadBtn: { backgroundColor: '#1a0a0a', borderRadius: 10, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: '#330000', borderStyle: 'dashed', minHeight: 120, justifyContent: 'center' },
  hlUploadBtnText: { color: '#555', fontSize: 14 },
  hlUploadPreview: { width: '100%', height: 180, borderRadius: 8 },
  hlResultRow: { flexDirection: 'row', gap: 12 },
  hlResultBtn: { flex: 1, padding: 14, alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: '#330000', backgroundColor: '#1a0a0a' },
  hlResultBtnW: { borderColor: '#00cc66', backgroundColor: '#002a14' },
  hlResultBtnL: { borderColor: '#ff4444', backgroundColor: '#2a0000' },
  hlResultBtnText: { color: '#666', fontSize: 15, fontWeight: '800' },
  hlScoreInputRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hlScoreDash: { color: '#555', fontSize: 24, fontWeight: '800' },

  pendingGifRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: 'rgba(0,0,0,0.8)', borderTopWidth: 1, borderTopColor: 'rgba(245,166,35,0.3)' },
  pendingGifThumb: { width: 60, height: 45, borderRadius: 6 },
  pendingGifRemove: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#ff4444', alignItems: 'center', justifyContent: 'center' },
  pendingGifRemoveText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  pendingGifLabel: { flex: 1, color: '#888', fontSize: 11 },

  resetDisputeBox: { backgroundColor: '#2a1a00', borderRadius: 8, padding: 10, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#F5A623' },
  resetDisputeLabel: { color: '#F5A623', fontSize: 10, fontWeight: '800', marginBottom: 4 },
  resetDisputeText: { color: '#ccaa88', fontSize: 13 },
  resetDisputeBtn: { flex: 1, backgroundColor: '#2a1a00', borderRadius: 8, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#F5A623' },
  resetDisputeBtnText: { color: '#F5A623', fontSize: 13, fontWeight: '700' },

  resetCancelBtn: { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 8, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#444' },
  resetCancelBtnText: { color: '#888', fontSize: 13, fontWeight: '700' },
});
