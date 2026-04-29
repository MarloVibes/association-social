import { router } from 'expo-router';
import { arrayUnion, collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';
import { blockAndReport } from '@/constants/moderation';

export default function SearchUsersScreen() {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [sentRequests, setSentRequests] = useState<string[]>([]);
  const [friends, setFriends] = useState<string[]>([]);
  const [blocked, setBlocked] = useState<string[]>([]);

  const user = auth.currentUser;

  const handleSearch = async (text: string) => {
    setSearch(text);
    if (text.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const q = query(
        collection(db, 'users'),
        where('username', '>=', text.toLowerCase()),
        where('username', '<=', text.toLowerCase() + '\uf8ff')
      );
      const snap = await getDocs(q);
      const users = snap.docs
        .map(d => ({ uid: d.id, ...d.data() }))
        .filter((u: any) => u.uid !== user?.uid);
      setResults(users);

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
        activeOpacity={1}
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
          {state === 'friends' ? (
            <View style={styles.friendsBadge}><Text style={styles.friendsBadgeText}>Friends</Text></View>
          ) : state === 'sent' ? (
            <View style={styles.sentBadge}><Text style={styles.sentBadgeText}>Sent</Text></View>
          ) : (
            <TouchableOpacity style={styles.addBtn} onPress={() => sendFriendRequest(item.uid)}>
              <Text style={styles.addBtnText}>+ Add</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/(tabs)/dashboard')}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Find GMs</Text>
        <View style={{ width: 60 }} />
      </View>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by username..."
          placeholderTextColor="#555"
          value={search}
          onChangeText={handleSearch}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
        />
      </View>
      {loading && <View style={styles.loadingContainer}><ActivityIndicator color="#00ff87" /></View>}
      <FlatList
        data={results}
        keyExtractor={item => item.uid}
        renderItem={renderUser}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          search.length >= 2 && !loading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No GMs found for "{search}"</Text>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.hintText}>Long press any GM to block or report</Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 },
  backText: { color: '#00ff87', fontSize: 15, fontWeight: '600' },
  title: { fontSize: 17, fontWeight: '700', color: '#ffffff' },
  searchContainer: { paddingHorizontal: 20, marginBottom: 16 },
  searchInput: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14, color: '#ffffff', fontSize: 15, borderWidth: 1, borderColor: '#2a2a2a' },
  loadingContainer: { padding: 20, alignItems: 'center' },
  listContent: { paddingHorizontal: 20, paddingBottom: 40 },
  userCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#2a2a2a' },
  userAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#2a2a2a', borderWidth: 2, borderColor: '#00ff87', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  userAvatarText: { color: '#00ff87', fontSize: 18, fontWeight: '700' },
  userInfo: { flex: 1 },
  userName: { color: '#ffffff', fontSize: 15, fontWeight: '700', marginBottom: 2 },
  userUsername: { color: '#666', fontSize: 13 },
  userGamerTag: { color: '#555', fontSize: 12, marginTop: 2 },
  addBtn: { backgroundColor: '#00ff87', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText: { color: '#000', fontSize: 13, fontWeight: '700' },
  friendsBadge: { backgroundColor: '#0a2a1a', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#00ff87' },
  friendsBadgeText: { color: '#00ff87', fontSize: 13, fontWeight: '600' },
  sentBadge: { backgroundColor: '#1a1a1a', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#555' },
  sentBadgeText: { color: '#555', fontSize: 13, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', paddingTop: 40 },
  emptyText: { color: '#555', fontSize: 15 },
  hintText: { color: '#333', fontSize: 13 },
});
