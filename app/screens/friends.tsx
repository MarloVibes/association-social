import { router } from 'expo-router';
import { arrayRemove, arrayUnion, doc, getDoc, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';
import { blockAndReport } from '@/constants/moderation';
import GlobalNav from '@/components/GlobalNav';

export default function FriendsScreen() {
  const [friends, setFriends] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'friends' | 'requests'>('friends');

  const user = auth.currentUser;

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const myDoc = await getDoc(doc(db, 'users', user.uid));
      if (!myDoc.exists()) return;
      const data = myDoc.data();
      const friendIds: string[] = data.friends || [];
      const requestIds: string[] = data.friendRequestsReceived || [];
      const blockedIds: string[] = data.blockedUsers || [];

      const [friendProfiles, requestProfiles] = await Promise.all([
        Promise.all(friendIds.map(async uid => {
          const snap = await getDoc(doc(db, 'users', uid));
          return snap.exists() ? { uid, ...snap.data() } : null;
        })),
        Promise.all(requestIds.map(async uid => {
          const snap = await getDoc(doc(db, 'users', uid));
          return snap.exists() ? { uid, ...snap.data() } : null;
        })),
      ]);

      setFriends(friendProfiles.filter((f): f is any => !!f && !blockedIds.includes(f.uid)));
      setRequests(requestProfiles.filter((r): r is any => !!r && !blockedIds.includes(r.uid)));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const acceptRequest = async (fromUid: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        friends: arrayUnion(fromUid),
        friendRequestsReceived: arrayRemove(fromUid),
      });
      await updateDoc(doc(db, 'users', fromUid), {
        friends: arrayUnion(user.uid),
        friendRequestsSent: arrayRemove(user.uid),
      });
      await loadData();
    } catch (e) { console.error(e); }
  };

  const declineRequest = async (fromUid: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), { friendRequestsReceived: arrayRemove(fromUid) });
      await updateDoc(doc(db, 'users', fromUid), { friendRequestsSent: arrayRemove(user.uid) });
      await loadData();
    } catch (e) { console.error(e); }
  };

  const removeFriend = (friendUid: string, friendName: string) => {
    Alert.alert(
      `Remove ${friendName}?`,
      'They will be removed from your friends list.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'users', user!.uid), { friends: arrayRemove(friendUid) });
              await updateDoc(doc(db, 'users', friendUid), { friends: arrayRemove(user!.uid) });
              await loadData();
            } catch (e) { console.error(e); }
          },
        },
      ]
    );
  };

  const renderFriend = ({ item }: { item: any }) => (
    <TouchableOpacity
      onPress={() => router.push({ pathname: '/screens/profile', params: { uid: item.uid } })}
      onLongPress={() =>
        Alert.alert(item.displayName, 'What would you like to do?', [
          { text: 'View Profile', onPress: () => router.push({ pathname: '/screens/profile', params: { uid: item.uid } }) },
          { text: 'Remove Friend', style: 'destructive', onPress: () => removeFriend(item.uid, item.displayName) },
          { text: 'Block / Report', style: 'destructive', onPress: () => blockAndReport(item.uid, item.displayName, () => loadData()) },
          { text: 'Cancel', style: 'cancel' },
        ])
      }
      activeOpacity={0.8}
    >
      <View style={styles.userCard}>
        <View style={styles.userAvatar}>
          <Text style={styles.userAvatarText}>{item.displayName?.[0]?.toUpperCase() || '?'}</Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{item.displayName}</Text>
          <Text style={styles.userUsername}>@{item.username}</Text>
          {item.gamerTag ? <Text style={styles.userGamerTag}>{item.gamerTag}</Text> : null}
        </View>
        <TouchableOpacity
          style={styles.dmBtn}
          onPress={() => router.push({ pathname: '/screens/dm', params: { uid: item.uid, name: item.displayName } })}
        >
          <Text style={styles.dmBtnText}>DM</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const renderRequest = ({ item }: { item: any }) => (
    <View style={styles.userCard}>
      <View style={styles.userAvatar}>
        <Text style={styles.userAvatarText}>{item.displayName?.[0]?.toUpperCase() || '?'}</Text>
      </View>
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{item.displayName}</Text>
        <Text style={styles.userUsername}>@{item.username}</Text>
      </View>
      <View style={styles.requestActions}>
        <TouchableOpacity style={styles.acceptBtn} onPress={() => acceptRequest(item.uid)}>
          <Text style={styles.acceptBtnText}>✓</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.declineBtn} onPress={() => declineRequest(item.uid)}>
          <Text style={styles.declineBtnText}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Friends</Text>
        <TouchableOpacity onPress={() => router.push('/screens/search-users')}>
          <Text style={styles.addText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tab, tab === 'friends' && styles.tabActive]} onPress={() => setTab('friends')}>
          <Text style={[styles.tabText, tab === 'friends' && styles.tabTextActive]}>
            Friends{friends.length > 0 ? ` (${friends.length})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'requests' && styles.tabActive]} onPress={() => setTab('requests')}>
          <Text style={[styles.tabText, tab === 'requests' && styles.tabTextActive]}>
            Requests{requests.length > 0 ? ` (${requests.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.hint}>Long press a friend to remove or block/report</Text>

      {loading ? (
        <View style={styles.loadingContainer}><ActivityIndicator color="#00ff87" /></View>
      ) : tab === 'friends' ? (
        <FlatList
          data={friends}
          keyExtractor={item => item.uid}
          renderItem={renderFriend}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No friends yet</Text>
              <TouchableOpacity style={styles.findBtn} onPress={() => router.push('/screens/search-users')}>
                <Text style={styles.findBtnText}>Find GMs to add</Text>
              </TouchableOpacity>
            </View>
          }
        />
      ) : (
        <FlatList
          data={requests}
          keyExtractor={item => item.uid}
          renderItem={renderRequest}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No pending requests</Text>
            </View>
          }
        />
      )}
          <GlobalNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 },
  backText: { color: '#00ff87', fontSize: 15, fontWeight: '600' },
  title: { fontSize: 17, fontWeight: '700', color: '#ffffff' },
  addText: { color: '#00ff87', fontSize: 15, fontWeight: '600' },
  hint: { color: '#333', fontSize: 12, textAlign: 'center', marginBottom: 12 },
  tabRow: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 8, gap: 8 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a' },
  tabActive: { backgroundColor: '#0a2a1a', borderColor: '#00ff87' },
  tabText: { color: '#666', fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: '#00ff87' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: 20, paddingBottom: 40 },
  userCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#2a2a2a' },
  userAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#2a2a2a', borderWidth: 2, borderColor: '#00ff87', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  userAvatarText: { color: '#00ff87', fontSize: 18, fontWeight: '700' },
  userInfo: { flex: 1 },
  userName: { color: '#ffffff', fontSize: 15, fontWeight: '700', marginBottom: 2 },
  userUsername: { color: '#666', fontSize: 13 },
  userGamerTag: { color: '#555', fontSize: 12, marginTop: 2 },
  dmBtn: { backgroundColor: '#1a1a2a', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#4444ff' },
  dmBtnText: { color: '#8888ff', fontSize: 13, fontWeight: '700' },
  requestActions: { flexDirection: 'row', gap: 8 },
  acceptBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#0a2a1a', borderWidth: 1, borderColor: '#00ff87', alignItems: 'center', justifyContent: 'center' },
  acceptBtnText: { color: '#00ff87', fontSize: 16, fontWeight: '700' },
  declineBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2a0a0a', borderWidth: 1, borderColor: '#ff3333', alignItems: 'center', justifyContent: 'center' },
  declineBtnText: { color: '#ff3333', fontSize: 16, fontWeight: '700' },
  emptyContainer: { alignItems: 'center', paddingTop: 60, gap: 16 },
  emptyText: { color: '#555', fontSize: 15 },
  findBtn: { backgroundColor: '#00ff87', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 },
  findBtnText: { color: '#000', fontSize: 14, fontWeight: '700' },
});
