import { router, useLocalSearchParams } from 'expo-router';
import { arrayUnion, doc, getDoc, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';
import GlobalNav from '@/components/GlobalNav';

export default function InviteMembersScreen() {
  const { leagueId, leagueName } = useLocalSearchParams<{ leagueId: string; leagueName: string }>();
  const [friends, setFriends] = useState<any[]>([]);
  const [members, setMembers] = useState<string[]>([]);
  const [invited, setInvited] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);

  const user = auth.currentUser;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [myDoc, leagueDoc] = await Promise.all([
        getDoc(doc(db, 'users', user.uid)),
        getDoc(doc(db, 'leagues', leagueId)),
      ]);

      if (!myDoc.exists() || !leagueDoc.exists()) return;

      const myData = myDoc.data();
      const leagueData = leagueDoc.data();

      setMembers(leagueData.members || []);
      setInvited(leagueData.invites || []);

      const friendIds: string[] = myData.friends || [];
      const friendProfiles = await Promise.all(
        friendIds.map(async uid => {
          const snap = await getDoc(doc(db, 'users', uid));
          return snap.exists() ? { uid, ...snap.data() } : null;
        })
      );
      setFriends(friendProfiles.filter(Boolean));
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const sendInvite = async (friendUid: string, friendName: string) => {
    setSending(friendUid);
    try {
      // Add to league invites list
      await updateDoc(doc(db, 'leagues', leagueId), {
        invites: arrayUnion(friendUid),
      });
      // Add notification to friend's profile
      await updateDoc(doc(db, 'users', friendUid), {
        leagueInvites: arrayUnion({
          leagueId,
          leagueName,
          invitedBy: user!.uid,
          invitedAt: new Date().toISOString(),
        }),
      });
      setInvited(prev => [...prev, friendUid]);
      Alert.alert('Invite Sent!', `${friendName} has been invited to ${leagueName}.`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setSending(null);
  };

  const getStatus = (uid: string) => {
    if (members.includes(uid)) return 'member';
    if (invited.includes(uid)) return 'invited';
    return 'none';
  };

  const renderFriend = ({ item }: { item: any }) => {
    const status = getStatus(item.uid);
    return (
      <View style={styles.userCard}>
        <View style={styles.userAvatar}>
          <Text style={styles.userAvatarText}>{item.displayName?.[0]?.toUpperCase() || '?'}</Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{item.displayName}</Text>
          <Text style={styles.userUsername}>@{item.username}</Text>
          {item.gamerTag ? <Text style={styles.userGamerTag}>{item.gamerTag}</Text> : null}
        </View>
        {status === 'member' ? (
          <View style={styles.memberBadge}>
            <Text style={styles.memberBadgeText}>In League</Text>
          </View>
        ) : status === 'invited' ? (
          <View style={styles.invitedBadge}>
            <Text style={styles.invitedBadgeText}>Invited</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.inviteBtn, sending === item.uid && styles.inviteBtnDisabled]}
            onPress={() => sendInvite(item.uid, item.displayName)}
            disabled={sending === item.uid}
          >
            {sending === item.uid
              ? <ActivityIndicator size="small" color="#000" />
              : <Text style={styles.inviteBtnText}>Invite</Text>
            }
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Invite Friends</Text>
        <View style={{ width: 60 }} />
      </View>

      <Text style={styles.subtitle}>Invite your friends to {leagueName}</Text>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#00ff87" />
        </View>
      ) : (
        <FlatList
          data={friends}
          keyExtractor={item => item.uid}
          renderItem={renderFriend}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No friends to invite yet</Text>
              <TouchableOpacity style={styles.findBtn} onPress={() => router.push('/screens/search-users')}>
                <Text style={styles.findBtnText}>Find GMs to add</Text>
              </TouchableOpacity>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 8 },
  backText: { color: '#00ff87', fontSize: 15, fontWeight: '600' },
  title: { fontSize: 17, fontWeight: '700', color: '#ffffff' },
  subtitle: { color: '#666', fontSize: 14, paddingHorizontal: 20, marginBottom: 20 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: 20, paddingBottom: 40 },
  userCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#2a2a2a' },
  userAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#2a2a2a', borderWidth: 2, borderColor: '#00ff87', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  userAvatarText: { color: '#00ff87', fontSize: 18, fontWeight: '700' },
  userInfo: { flex: 1 },
  userName: { color: '#ffffff', fontSize: 15, fontWeight: '700', marginBottom: 2 },
  userUsername: { color: '#666', fontSize: 13 },
  userGamerTag: { color: '#555', fontSize: 12, marginTop: 2 },
  inviteBtn: { backgroundColor: '#00ff87', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  inviteBtnDisabled: { opacity: 0.5 },
  inviteBtnText: { color: '#000', fontSize: 13, fontWeight: '700' },
  memberBadge: { backgroundColor: '#0a2a1a', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#00ff87' },
  memberBadgeText: { color: '#00ff87', fontSize: 12, fontWeight: '600' },
  invitedBadge: { backgroundColor: '#1a1a1a', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#555' },
  invitedBadgeText: { color: '#555', fontSize: 12, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', paddingTop: 60, gap: 16 },
  emptyText: { color: '#555', fontSize: 15 },
  findBtn: { backgroundColor: '#00ff87', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 },
  findBtnText: { color: '#000', fontSize: 14, fontWeight: '700' },
});
