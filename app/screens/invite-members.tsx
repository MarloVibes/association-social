import { router, useLocalSearchParams } from 'expo-router';
import { arrayRemove, arrayUnion, collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';
import GlobalNav from '@/components/GlobalNav';

export default function InviteMembersScreen() {
  const { leagueId, leagueName } = useLocalSearchParams<{ leagueId: string; leagueName: string }>();
  const [friends, setFriends] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [invited, setInvited] = useState<string[]>([]);
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'invite' | 'pending'>('invite');
  const user = auth.currentUser;

  useEffect(() => { loadData(); }, []);

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
      setMembers(leagueData.members || []);

      // Load friends
      const friendIds = myData.friends || [];
      const friendProfiles = await Promise.all(
        friendIds.map((uid: string) => getDoc(doc(db, 'users', uid)))
      );
      setFriends(friendProfiles.filter(d => d.exists()).map(d => ({ uid: d.id, ...d.data() })));

      // Load pending invites
      const allInvited: any[] = [];
      const allUserIds = [...new Set([...friendIds, ...(leagueData.members || [])])];
      for (const uid of allUserIds) {
        const userSnap = await getDoc(doc(db, 'users', uid));
        if (userSnap.exists()) {
          const invites = userSnap.data()?.leagueInvites || [];
          const myInvite = invites.find((i: any) => i.leagueId === leagueId);
          if (myInvite) {
            allInvited.push({ uid, displayName: userSnap.data()?.displayName, username: userSnap.data()?.username });
          }
        }
      }
      setPendingInvites(allInvited);
      setInvited(allInvited.map((i: any) => i.uid));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleSearch = async (text: string) => {
    setSearch(text);
    if (text.trim().length < 2) { setSearchResults([]); return; }
    try {
      const q = query(
        collection(db, 'users'),
        where('username', '>=', text.toLowerCase()),
        where('username', '<=', text.toLowerCase() + '\uf8ff')
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
      await updateDoc(doc(db, 'users', targetUid), {
        leagueInvites: arrayUnion({
          leagueId,
          leagueName: leagueName || 'League',
          inviterId: user!.uid,
          inviterName: myData.displayName || user!.email,
        }),
      });
      setInvited(prev => [...prev, targetUid]);
      setPendingInvites(prev => [...prev, { uid: targetUid, displayName }]);
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
          setInvited(prev => prev.filter(uid => uid !== targetUid));
          setPendingInvites(prev => prev.filter(i => i.uid !== targetUid));
        } catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  const displayList = search.length >= 2 ? searchResults : friends;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Invite GMs</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tab, activeTab === 'invite' && styles.tabActive]} onPress={() => setActiveTab('invite')}>
          <Text style={[styles.tabText, activeTab === 'invite' && styles.tabTextActive]}>Invite</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'pending' && styles.tabActive]} onPress={() => setActiveTab('pending')}>
          <Text style={[styles.tabText, activeTab === 'pending' && styles.tabTextActive]}>Pending ({pendingInvites.length})</Text>
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
        <FlatList
          data={pendingInvites}
          keyExtractor={item => item.uid}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>No pending invites</Text>}
          renderItem={({ item }) => (
            <View style={styles.userRow}>
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
          )}
        />
      )}
      <GlobalNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  backText: { color: '#00ff87', fontSize: 15, fontWeight: '600', width: 60 },
  title: { fontSize: 18, fontWeight: '800', color: '#ffffff' },
  tabRow: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12, gap: 8 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a' },
  tabActive: { backgroundColor: '#0a2a1a', borderColor: '#00ff87' },
  tabText: { color: '#666', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#00ff87' },
  searchInput: { marginHorizontal: 20, backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14, color: '#ffffff', fontSize: 15, borderWidth: 1, borderColor: '#2a2a2a', marginBottom: 8 },
  listContent: { paddingHorizontal: 20, paddingBottom: 100 },
  listLabel: { color: '#666', fontSize: 12, fontWeight: '600', marginBottom: 10, textTransform: 'uppercase' },
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
});