import { router, useLocalSearchParams } from 'expo-router';
import { arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';
import GlobalNav from '@/components/GlobalNav';

export default function InviteMembersScreen() {
  const { leagueId, leagueName, tab } = useLocalSearchParams<{ leagueId: string; leagueName: string; tab?: string }>();
  const [friends, setFriends] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [invited, setInvited] = useState<string[]>([]);
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);
  const [joinRequests, setJoinRequests] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [league, setLeague] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'invite' | 'invitations'>(tab === 'invitations' || tab === 'pending' ? 'invitations' : 'invite');
  const user = auth.currentUser;

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (tab === 'invitations' || tab === 'pending') setActiveTab('invitations');
  }, [tab]);

  // Real-time listener for sent invites
  useEffect(() => {
    if (!leagueId) return;
    const unsub = onSnapshot(collection(db, 'leagues', leagueId, 'sent_invites'), async (snap) => {
      const sentDocs = snap.docs.map(d => ({ uid: d.id, ...d.data() } as any)).filter((d: any) => !d.status || d.status === 'pending');
      const hydrated = await Promise.all(
        sentDocs.map(async (s: any) => {
          if (s.displayName && s.username) return s;
          const u = await getDoc(doc(db, 'users', s.uid));
          return { uid: s.uid, displayName: u.data()?.displayName, username: u.data()?.username, ...s };
        })
      );
      setPendingInvites(hydrated);
      setInvited(hydrated.map((i: any) => i.uid));
    }, err => { if (err.code !== 'permission-denied') console.error(err); });
    return () => unsub();
  }, [leagueId]);

  // Real-time listener for incoming join requests
  useEffect(() => {
    if (!leagueId) return;
    const unsub = onSnapshot(collection(db, 'leagues', leagueId, 'join_requests'), (snap) => {
      const requests = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter((r: any) => !r.status || r.status === 'pending');
      setJoinRequests(requests);
    }, err => { if (err.code !== 'permission-denied') console.error(err); });
    return () => unsub();
  }, [leagueId]);

  // Live league members → drop accepted/added users out of the pending lists
  useEffect(() => {
    if (!leagueId) return;
    const unsub = onSnapshot(doc(db, 'leagues', leagueId), (snap) => {
      setMembers(snap.data()?.members || []);
    }, err => { if (err.code !== 'permission-denied') console.error(err); });
    return () => unsub();
  }, [leagueId]);

  // History: resolved items (accepted/declined/rescinded) from both subcollections
  useEffect(() => {
    if (!leagueId) return;
    const RESOLVED = ['accepted', 'declined', 'rescinded'];
    let received: any[] = [];
    let sent: any[] = [];
    const merge = () => {
      const all = [...received, ...sent].sort((a, b) => {
        const ta = a.resolvedAt?.toMillis ? a.resolvedAt.toMillis() : 0;
        const tb = b.resolvedAt?.toMillis ? b.resolvedAt.toMillis() : 0;
        return tb - ta;
      });
      setHistory(all);
    };
    const unsubR = onSnapshot(collection(db, 'leagues', leagueId, 'join_requests'), (snap) => {
      received = snap.docs
        .map(d => ({ id: d.id, kind: 'received', ...d.data() } as any))
        .filter((r: any) => RESOLVED.includes(r.status));
      merge();
    }, err => { if (err.code !== 'permission-denied') console.error(err); });
    const unsubS = onSnapshot(collection(db, 'leagues', leagueId, 'sent_invites'), (snap) => {
      sent = snap.docs
        .map(d => ({ id: d.id, kind: 'sent', ...d.data() } as any))
        .filter((r: any) => RESOLVED.includes(r.status));
      merge();
    }, err => { if (err.code !== 'permission-denied') console.error(err); });
    return () => { unsubR(); unsubS(); };
  }, [leagueId]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [myDoc, leagueDoc] = await Promise.all([
        getDoc(doc(db, 'users', user.uid)),
        getDoc(doc(db, 'leagues', leagueId)),
      ]);
      const myData = myDoc.data() || {};
      const leagueData = leagueDoc.data() || {};
      setLeague({ id: leagueDoc.id, ...leagueData });
      setMembers(leagueData.members || []);

      const friendIds = myData.friends || [];
      const friendProfiles = await Promise.all(
        friendIds.map((uid: string) => getDoc(doc(db, 'users', uid)))
      );
      setFriends(friendProfiles.filter(d => d.exists()).map(d => ({ uid: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleSearch = async (text: string) => {
    setSearch(text);
    if (text.trim().length < 2) { setSearchResults([]); return; }
    try {
      const q = query(
        collection(db, 'users'),
        where('usernameLower', '>=', text.toLowerCase()),
        where('usernameLower', '<=', text.toLowerCase() + '')
      );
      const snap = await getDocs(q);
      const results = snap.docs
        .map(d => ({ uid: d.id, ...d.data() }))
        .filter((u: any) => u.uid !== user?.uid && !members.includes(u.uid));
      setSearchResults(results);
    } catch (e) { console.error(e); }
  };

  const sendInvite = async (targetUid: string, displayName: string) => {
    setSending(targetUid);
    try {
      const myData = (await getDoc(doc(db, 'users', user!.uid))).data() || {};
      const targetData = (await getDoc(doc(db, 'users', targetUid))).data() || {};
      await updateDoc(doc(db, 'users', targetUid), {
        leagueInvites: arrayUnion({
          leagueId,
          leagueName: leagueName || 'League',
          inviterId: user!.uid,
          inviterName: myData.displayName || user!.email,
        }),
      });
      await setDoc(doc(db, 'leagues', leagueId, 'sent_invites', targetUid), {
        uid: targetUid,
        displayName: targetData.displayName || displayName,
        username: targetData.username || '',
        inviterId: user!.uid,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      Alert.alert('Invite Sent!', displayName + ' has been invited to ' + (leagueName || 'the league'));
    } catch (e: any) { Alert.alert('Error', e.message); }
    setSending(null);
  };

  const rescindInvite = async (targetUid: string, displayName: string) => {
    Alert.alert('Rescind Invite', 'Remove invite for ' + displayName + '?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Rescind', style: 'destructive', onPress: async () => {
        try {
          const userSnap = await getDoc(doc(db, 'users', targetUid));
          const invites = userSnap.data()?.leagueInvites || [];
          const invite = invites.find((i: any) => i.leagueId === leagueId);
          if (invite) {
            await updateDoc(doc(db, 'users', targetUid), {
              leagueInvites: arrayRemove(invite),
            });
          }
          await updateDoc(doc(db, 'leagues', leagueId, 'sent_invites', targetUid), {
            status: 'rescinded',
            resolvedAt: serverTimestamp(),
          });
        } catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  const acceptRequest = async (req: any) => {
    try {
      await updateDoc(doc(db, 'leagues', leagueId), { members: arrayUnion(req.uid) });
      await updateDoc(doc(db, 'users', req.uid), {
        leagues: arrayUnion(leagueId),
        notifications: arrayUnion({
          type: 'join_accepted',
          leagueId,
          leagueName: league?.name || leagueName || '',
          createdAt: new Date().toISOString(),
        }),
      });
      await updateDoc(doc(db, 'leagues', leagueId, 'join_requests', req.id), {
        status: 'accepted',
        resolvedAt: serverTimestamp(),
        resolvedBy: user?.uid || '',
      });
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const denyRequest = async (req: any) => {
    try {
      await updateDoc(doc(db, 'users', req.uid), {
        notifications: arrayUnion({
          type: 'join_denied',
          leagueId,
          leagueName: league?.name || leagueName || '',
          createdAt: new Date().toISOString(),
        }),
      });
      await updateDoc(doc(db, 'leagues', leagueId, 'join_requests', req.id), {
        status: 'declined',
        resolvedAt: serverTimestamp(),
        resolvedBy: user?.uid || '',
      });
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const confirmAcceptRequest = (req: any) => {
    const who = req.username ? '@' + req.username : (req.displayName || 'this user');
    Alert.alert(
      'Accept Request',
      'Accept ' + who + ' request to join ' + (league?.name || leagueName || 'this league') + '?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Accept', onPress: () => acceptRequest(req) },
      ]
    );
  };

  const confirmDenyRequest = (req: any) => {
    const who = req.username ? '@' + req.username : (req.displayName || 'this user');
    Alert.alert(
      'Decline Request',
      'Decline ' + who + ' request to join ' + (league?.name || leagueName || 'this league') + '?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Decline', style: 'destructive', onPress: () => denyRequest(req) },
      ]
    );
  };

  const displayList = search.length >= 2 ? searchResults : friends;
  // Hide any pending entries for users who are already league members.
  // Covers orphaned sent_invites / join_requests left at status:'pending'
  // after an invite or request was accepted elsewhere.
  const visibleRequests = useMemo(
    () => joinRequests.filter((r: any) => !members.includes(r.uid)),
    [joinRequests, members]
  );
  const visiblePending = useMemo(
    () => pendingInvites.filter((p: any) => !members.includes(p.uid)),
    [pendingInvites, members]
  );
  const totalInvitations = visibleRequests.length + visiblePending.length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Invite GMs</Text>
        <TouchableOpacity onPress={() => router.push({ pathname: '/screens/league-waitlist', params: { leagueId, leagueName: leagueName || '' } })}>
          <Text style={styles.waitlistLink}>Waitlist</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tab, activeTab === 'invite' && styles.tabActive]} onPress={() => setActiveTab('invite')}>
          <Text style={[styles.tabText, activeTab === 'invite' && styles.tabTextActive]}>Invite</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'invitations' && styles.tabActive]} onPress={() => setActiveTab('invitations')}>
          <Text style={[styles.tabText, activeTab === 'invitations' && styles.tabTextActive]}>Invitations ({totalInvitations})</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'invite' ? (
        <>
          <TextInput
            style={styles.searchInput}
            placeholder='Search by username...'
            placeholderTextColor='#555'
            value={search}
            onChangeText={handleSearch}
          />
          {loading ? <ActivityIndicator color='#00ff87' style={{ marginTop: 20 }} /> : (
            <FlatList
              data={displayList}
              keyExtractor={item => item.uid}
              contentContainerStyle={styles.listContent}
              ListHeaderComponent={
                search.length < 2 ? <Text style={styles.listLabel}>Your Friends</Text> : null
              }
              ListEmptyComponent={
                <Text style={styles.emptyText}>
                  {search.length >= 2 ? 'No users found' : 'No friends yet. Search by username above.'}
                </Text>
              }
              renderItem={({ item }) => {
                const isInvited = invited.includes(item.uid);
                const isMember = members.includes(item.uid);
                return (
                  <View style={styles.userRow}>
                    <View style={styles.userAvatar}>
                      <Text style={styles.userAvatarText}>{item.displayName?.[0]?.toUpperCase() || '?'}</Text>
                    </View>
                    <View style={styles.userInfo}>
                      <Text style={styles.userName}>{item.displayName}</Text>
                      <Text style={styles.userUsername}>@{item.username}</Text>
                    </View>
                    {isMember ? (
                      <View style={styles.memberBadge}><Text style={styles.memberBadgeText}>Member</Text></View>
                    ) : isInvited ? (
                      <TouchableOpacity style={styles.rescindBtn} onPress={() => rescindInvite(item.uid, item.displayName)}>
                        <Text style={styles.rescindBtnText}>Rescind</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={styles.inviteBtn}
                        onPress={() => sendInvite(item.uid, item.displayName)}
                        disabled={sending === item.uid}
                      >
                        {sending === item.uid
                          ? <ActivityIndicator size='small' color='#000' />
                          : <Text style={styles.inviteBtnText}>Invite</Text>
                        }
                      </TouchableOpacity>
                    )}
                  </View>
                );
              }}
            />
          )}
        </>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          {totalInvitations === 0 ? (
            <Text style={styles.emptyText}>No invitations yet</Text>
          ) : (
            <>
              {visibleRequests.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>📥 Received ({visibleRequests.length})</Text>
                  {visibleRequests.map((req: any) => (
                    <View key={req.id} style={styles.userRow}>
                      <View style={styles.userAvatar}>
                        <Text style={styles.userAvatarText}>{(req.displayName || req.username || '?')[0]?.toUpperCase()}</Text>
                      </View>
                      <View style={styles.userInfo}>
                        <Text style={styles.userName}>{req.displayName || req.username}</Text>
                        {req.username ? <Text style={styles.userUsername}>@{req.username}</Text> : null}
                      </View>
                      <View style={styles.actionBtns}>
                        <TouchableOpacity style={styles.acceptBtn} onPress={() => confirmAcceptRequest(req)}>
                          <Text style={styles.acceptBtnText}>✓</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.denyBtn} onPress={() => confirmDenyRequest(req)}>
                          <Text style={styles.denyBtnText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </>
              )}
              {visiblePending.length > 0 && (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: visibleRequests.length > 0 ? 20 : 0 }]}>📤 Sent ({visiblePending.length})</Text>
                  {visiblePending.map((item: any) => (
                    <View key={item.uid} style={styles.userRow}>
                      <View style={styles.userAvatar}>
                        <Text style={styles.userAvatarText}>{item.displayName?.[0]?.toUpperCase() || '?'}</Text>
                      </View>
                      <View style={styles.userInfo}>
                        <Text style={styles.userName}>{item.displayName}</Text>
                        <Text style={styles.userUsername}>@{item.username}</Text>
                      </View>
                      <View style={styles.pendingBadge}><Text style={styles.pendingBadgeText}>Pending</Text></View>
                      <TouchableOpacity style={styles.rescindBtn} onPress={() => rescindInvite(item.uid, item.displayName)}>
                        <Text style={styles.rescindBtnText}>Rescind</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </>
              )}
              {history.length > 0 && (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: (visibleRequests.length > 0 || visiblePending.length > 0) ? 20 : 0 }]}>🕓 History ({history.length})</Text>
                  {history.map((item: any) => {
                    const name = item.displayName || item.username || 'Unknown';
                    const isReceived = item.kind === 'received';
                    let badge = { label: 'Resolved', color: '#888', bg: '#1a1a1a', border: '#333' };
                    if (item.status === 'accepted') badge = { label: '✓ Accepted', color: '#00ff87', bg: '#0a2a1a', border: '#00ff87' };
                    else if (item.status === 'declined') badge = { label: '✕ Declined', color: '#ff4444', bg: '#2a0a0a', border: '#ff4444' };
                    else if (item.status === 'rescinded') badge = { label: '↩ Rescinded', color: '#F5A623', bg: '#2a1a00', border: '#F5A623' };
                    const when = item.resolvedAt?.toMillis ? new Date(item.resolvedAt.toMillis()).toLocaleDateString() : '';
                    return (
                      <View key={item.id} style={[styles.userRow, { opacity: 0.85 }]}>
                        <View style={styles.userAvatar}>
                          <Text style={styles.userAvatarText}>{name[0]?.toUpperCase() || '?'}</Text>
                        </View>
                        <View style={styles.userInfo}>
                          <Text style={styles.userName}>{name}</Text>
                          <Text style={styles.userUsername}>{isReceived ? 'Requested to join' : 'Invited'} · {when}</Text>
                        </View>
                        <View style={[styles.pendingBadge, { backgroundColor: badge.bg, borderWidth: 1, borderColor: badge.border }]}>
                          <Text style={[styles.pendingBadgeText, { color: badge.color }]}>{badge.label}</Text>
                        </View>
                      </View>
                    );
                  })}
                </>
              )}
            </>
          )}
        </ScrollView>
      )}
      <GlobalNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  backText: { color: '#00ff87', fontSize: 15, fontWeight: '600', width: 60 },
  waitlistLink: { color: '#F5A623', fontSize: 14, fontWeight: '700', width: 60, textAlign: 'right' },
  cpuTradesBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#15203a', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 14, borderWidth: 1, borderColor: '#3B82F6' },
  cpuTradesBannerText: { color: '#7da7ff', fontSize: 14, fontWeight: '800' },
  cpuTradesBannerArrow: { color: '#7da7ff', fontSize: 20, fontWeight: '400' },
  title: { fontSize: 18, fontWeight: '800', color: '#ffffff' },
  tabRow: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12, gap: 8 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a' },
  tabActive: { backgroundColor: '#0a2a1a', borderColor: '#00ff87' },
  tabText: { color: '#666', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#00ff87' },
  searchInput: { marginHorizontal: 20, backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14, color: '#ffffff', fontSize: 15, borderWidth: 1, borderColor: '#2a2a2a', marginBottom: 8 },
  listContent: { paddingHorizontal: 20, paddingBottom: 100 },
  listLabel: { color: '#666', fontSize: 12, fontWeight: '600', marginBottom: 10, textTransform: 'uppercase' },
  sectionLabel: { color: '#F5A623', fontSize: 13, fontWeight: '800', marginBottom: 10, marginTop: 4 },
  emptyText: { color: '#555', fontSize: 14, textAlign: 'center', paddingTop: 40 },
  userRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#2a2a2a', gap: 12 },
  userAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#2a2a2a', borderWidth: 1, borderColor: '#00ff87', alignItems: 'center', justifyContent: 'center' },
  userAvatarText: { color: '#00ff87', fontSize: 16, fontWeight: '800' },
  userInfo: { flex: 1 },
  userName: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  userUsername: { color: '#666', fontSize: 12, marginTop: 2 },
  inviteBtn: { backgroundColor: '#00ff87', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  inviteBtnText: { color: '#000', fontSize: 13, fontWeight: '800' },
  rescindBtn: { backgroundColor: '#2a0a0a', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: '#ff4444' },
  rescindBtnText: { color: '#ff4444', fontSize: 12, fontWeight: '700' },
  memberBadge: { backgroundColor: '#0a2a1a', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  memberBadgeText: { color: '#00ff87', fontSize: 12, fontWeight: '600' },
  pendingBadge: { backgroundColor: '#1a1a2a', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  pendingBadgeText: { color: '#8888ff', fontSize: 12, fontWeight: '600' },
  actionBtns: { flexDirection: 'row', gap: 6 },
  acceptBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#0a2a1a', borderWidth: 1, borderColor: '#00ff87', alignItems: 'center', justifyContent: 'center' },
  acceptBtnText: { color: '#00ff87', fontSize: 16, fontWeight: '700' },
  denyBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2a0a0a', borderWidth: 1, borderColor: '#ff4444', alignItems: 'center', justifyContent: 'center' },
  denyBtnText: { color: '#ff4444', fontSize: 16, fontWeight: '700' },
});
