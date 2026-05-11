import { router } from 'expo-router';
import { arrayUnion, collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';
import { blockAndReport } from '@/constants/moderation';
import GlobalNav from '@/components/GlobalNav';

export default function SearchUsersScreen() {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [sentRequests, setSentRequests] = useState<string[]>([]);
  const [friends, setFriends] = useState<string[]>([]);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [gmLeagues, setGmLeagues] = useState<Record<string, any[]>>({});

  const user = auth.currentUser;

  const handleSearch = async (text: string) => {
    setSearch(text);
    if (text.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const searchText = text.toLowerCase().trim();
      // Search by username
      const q = query(
        collection(db, 'users'),
        where('usernameLower', '>=', searchText),
        where('usernameLower', '<=', searchText + '\uf8ff')
      );
      const snap = await getDocs(q);
      let users = snap.docs.map(d => ({ uid: d.id, ...d.data() }));

      // Also search by email if input looks like email
      if (searchText.includes('@')) {
        const emailQ = query(collection(db, 'users'), where('email', '==', searchText));
        const emailSnap = await getDocs(emailQ);
        const emailUsers = emailSnap.docs.map(d => ({ uid: d.id, ...d.data() }));
        const existingIds = new Set(users.map((u: any) => u.uid));
        emailUsers.forEach((u: any) => { if (!existingIds.has(u.uid)) users.push(u); });
      }

      setResults(users.filter((u: any) => u.uid !== user?.uid));
      if (user) {
        const myDoc = await getDoc(doc(db, 'users', user.uid));
        if (myDoc.exists()) {
          const data = myDoc.data();
          setFriends(data.friends || []);
          setSentRequests(data.friendRequestsSent || []);
          setBlocked(data.blockedUsers || []);
        }
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const sendFriendRequest = async (targetUid: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), { friendRequestsSent: arrayUnion(targetUid) });
      await updateDoc(doc(db, 'users', targetUid), { friendRequestsReceived: arrayUnion(user.uid) });
      setSentRequests(prev => [...prev, targetUid]);
    } catch (e) { console.error(e); }
  };

  const loadGMLeagues = async (uid: string) => {
    if (gmLeagues[uid] !== undefined) {
      // Toggle off if already loaded
      setGmLeagues(prev => { const n = { ...prev }; delete n[uid]; return n; });
      return;
    }
    try {
      const q = query(collection(db, 'leagues'), where('commissionerId', '==', uid));
      const snap = await getDocs(q);
      const leagues = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setGmLeagues(prev => ({ ...prev, [uid]: leagues }));
    } catch (e) { console.error(e); }
  };

  const getButtonState = (uid: string) => {
    if (blocked.includes(uid)) return 'blocked';
    if (friends.includes(uid)) return 'friends';
    if (sentRequests.includes(uid)) return 'sent';
    return 'none';
  };

  const renderUser = ({ item }: { item: any }) => {
    const state = getButtonState(item.uid);
    if (state === 'blocked') return null;
    return (
      <TouchableOpacity
        onLongPress={() => blockAndReport(item.uid, item.displayName, () => {
          setBlocked(prev => [...prev, item.uid]);
          setResults(prev => prev.filter(u => u.uid !== item.uid));
        })}
        onPress={() => router.push({ pathname: '/screens/profile', params: { uid: item.uid } })}
        activeOpacity={0.8}
      >
        <View style={styles.userCard}>
          <View style={styles.userAvatar}>
            <Text style={styles.userAvatarText}>{item.displayName?.[0]?.toUpperCase() || '?'}</Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{item.displayName}</Text>
            <Text style={styles.userUsername}>@{item.username}</Text>
            {item.gamerTag && <Text style={styles.userGamerTag}>{item.gamerTag}</Text>}
          </View>
          <View style={styles.actionBtns}>
            {state === 'friends' ? (
              <View style={styles.friendsBadge}><Text style={styles.friendsBadgeText}>Friends</Text></View>
            ) : state === 'sent' ? (
              <View style={styles.sentBadge}><Text style={styles.sentBadgeText}>Sent</Text></View>
            ) : (
              <TouchableOpacity style={styles.addBtn} onPress={(e) => { e.stopPropagation?.(); sendFriendRequest(item.uid); }}>
                <Text style={styles.addBtnText}>+ Add</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.leaguesBtn}
              onPress={(e) => { e.stopPropagation?.(); loadGMLeagues(item.uid); }}
            >
              <Text style={styles.leaguesBtnText}>🏆 Leagues</Text>
            </TouchableOpacity>
          </View>
        </View>
        {gmLeagues[item.uid] !== undefined && (
          <View style={styles.leaguesDropdown}>
            {gmLeagues[item.uid].length === 0 ? (
              <Text style={styles.noLeaguesText}>No active leagues</Text>
            ) : (
              gmLeagues[item.uid].map((league: any) => (
                <View key={league.id} style={styles.leagueRow}>
                  <View style={styles.leagueRowInfo}>
                    <Text style={styles.leagueRowName}>{league.name}</Text>
                    <Text style={styles.leagueRowMeta}>{league.sport?.toUpperCase()} · {league.members?.length || 1} members</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.joinLeagueBtn}
                    onPress={() => router.push({ pathname: '/screens/join-league', params: { leagueId: league.id, leagueName: league.name } })}
                  >
                    <Text style={styles.joinLeagueBtnText}>Join</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Search GMs</Text>
        <View style={{ width: 60 }} />
      </View>
      <TextInput
        style={styles.searchInput}
        placeholder='Search by username...'
        placeholderTextColor='#555'
        value={search}
        onChangeText={handleSearch}
        autoFocus
      />
      {loading && <ActivityIndicator color='#00ff87' style={{ marginTop: 20 }} />}
      <FlatList
        data={results}
        keyExtractor={item => item.uid}
        renderItem={renderUser}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          !loading && search.length >= 2 ? (
            <Text style={styles.emptyText}>No GMs found for '{search}'</Text>
          ) : null
        }
      />
      <GlobalNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12 },
  backText: { color: '#00ff87', fontSize: 15, fontWeight: '600', width: 60 },
  title: { fontSize: 18, fontWeight: '800', color: '#ffffff' },
  searchInput: { marginHorizontal: 20, backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14, color: '#ffffff', fontSize: 15, borderWidth: 1, borderColor: '#2a2a2a', marginBottom: 8 },
  listContent: { paddingHorizontal: 20, paddingBottom: 100 },
  emptyText: { color: '#555', fontSize: 14, textAlign: 'center', paddingTop: 40 },
  userCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14, marginBottom: 4, borderWidth: 1, borderColor: '#2a2a2a', gap: 12 },
  userAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#2a2a2a', borderWidth: 1, borderColor: '#00ff87', alignItems: 'center', justifyContent: 'center' },
  userAvatarText: { color: '#00ff87', fontSize: 18, fontWeight: '800' },
  userInfo: { flex: 1 },
  userName: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  userUsername: { color: '#666', fontSize: 12, marginTop: 2 },
  userGamerTag: { color: '#888', fontSize: 11, marginTop: 2 },
  actionBtns: { flexDirection: 'column', gap: 6, alignItems: 'flex-end' },
  addBtn: { backgroundColor: '#0a2a1a', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#00ff87' },
  addBtnText: { color: '#00ff87', fontSize: 12, fontWeight: '700' },
  friendsBadge: { backgroundColor: '#1a2a1a', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  friendsBadgeText: { color: '#00ff87', fontSize: 11, fontWeight: '600' },
  sentBadge: { backgroundColor: '#1a1a2a', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  sentBadgeText: { color: '#888', fontSize: 11, fontWeight: '600' },
  leaguesBtn: { backgroundColor: '#1a1a2a', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#4444ff' },
  leaguesBtnText: { color: '#8888ff', fontSize: 11, fontWeight: '700' },
  leaguesDropdown: { backgroundColor: '#111', borderRadius: 12, marginHorizontal: 4, marginTop: -2, marginBottom: 8, padding: 12, borderWidth: 1, borderColor: '#1a1a2a', gap: 10 },
  noLeaguesText: { color: '#555', fontSize: 13, textAlign: 'center', paddingVertical: 4 },
  leagueRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  leagueRowInfo: { flex: 1 },
  leagueRowName: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  leagueRowMeta: { color: '#666', fontSize: 12 },
  joinLeagueBtn: { backgroundColor: '#00ff87', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  joinLeagueBtnText: { color: '#000', fontSize: 12, fontWeight: '800' },
});