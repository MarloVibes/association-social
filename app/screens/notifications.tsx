import { router } from 'expo-router';
import { arrayRemove, arrayUnion, doc, getDoc, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';
import GlobalNav from '@/components/GlobalNav';

export default function NotificationsScreen() {
  const [invites, setInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const user = auth.currentUser;

  useEffect(() => { loadInvites(); }, []);

  const loadInvites = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) {
        setInvites(snap.data().leagueInvites || []);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const acceptInvite = async (invite: any) => {
    if (!user) return;
    setActing(invite.leagueId);
    try {
      // Add user to league members
      await updateDoc(doc(db, 'leagues', invite.leagueId), {
        members: arrayUnion(user.uid),
        invites: arrayRemove(user.uid),
      });
      // Add league to user's leagues
      await updateDoc(doc(db, 'users', user.uid), {
        leagues: arrayUnion(invite.leagueId),
        leagueInvites: (await getDoc(doc(db, 'users', user.uid)))
          .data()?.leagueInvites?.filter((i: any) => i.leagueId !== invite.leagueId) || [],
      });
      Alert.alert('Joined!', `Welcome to ${invite.leagueName}!`, [
        { text: 'Go to League', onPress: () => router.push({ pathname: '/screens/league', params: { leagueId: invite.leagueId } }) },
        { text: 'Stay Here', style: 'cancel' },
      ]);
      loadInvites();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setActing(null);
  };

  const declineInvite = async (invite: any) => {
    if (!user) return;
    setActing(invite.leagueId);
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      const current = snap.data()?.leagueInvites || [];
      await updateDoc(doc(db, 'users', user.uid), {
        leagueInvites: current.filter((i: any) => i.leagueId !== invite.leagueId),
      });
      // Remove from league invites list
      await updateDoc(doc(db, 'leagues', invite.leagueId), {
        invites: arrayRemove(user.uid),
      });
      loadInvites();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setActing(null);
  };

  const renderInvite = ({ item }: { item: any }) => {
    const isActing = acting === item.leagueId;
    return (
      <View style={styles.inviteCard}>
        <View style={styles.inviteIcon}>
          <Text style={styles.inviteIconText}>🏆</Text>
        </View>
        <View style={styles.inviteInfo}>
          <Text style={styles.inviteTitle}>League Invite</Text>
          <Text style={styles.inviteLeague}>{item.leagueName}</Text>
          <Text style={styles.inviteMeta}>
            Invited {new Date(item.invitedAt).toLocaleDateString()}
          </Text>
        </View>
        <View style={styles.inviteActions}>
          {isActing ? (
            <ActivityIndicator color="#00ff87" />
          ) : (
            <>
              <TouchableOpacity style={styles.acceptBtn} onPress={() => acceptInvite(item)}>
                <Text style={styles.acceptBtnText}>✓</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.declineBtn} onPress={() => declineInvite(item)}>
                <Text style={styles.declineBtnText}>✕</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Notifications</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#00ff87" />
        </View>
      ) : (
        <FlatList
          data={invites}
          keyExtractor={item => item.leagueId}
          renderItem={renderInvite}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🔔</Text>
              <Text style={styles.emptyText}>No notifications</Text>
              <Text style={styles.emptySubtext}>League invites and updates will appear here</Text>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  backText: { color: '#00ff87', fontSize: 15, fontWeight: '600', width: 60 },
  title: { fontSize: 17, fontWeight: '700', color: '#ffffff' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 20, gap: 12 },
  inviteCard: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#2a2a2a', flexDirection: 'row', alignItems: 'center', gap: 12 },
  inviteIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#0a2a1a', borderWidth: 1, borderColor: '#00ff87', alignItems: 'center', justifyContent: 'center' },
  inviteIconText: { fontSize: 20 },
  inviteInfo: { flex: 1 },
  inviteTitle: { fontSize: 12, color: '#666', marginBottom: 2 },
  inviteLeague: { fontSize: 16, fontWeight: '700', color: '#ffffff', marginBottom: 2 },
  inviteMeta: { fontSize: 12, color: '#555' },
  inviteActions: { flexDirection: 'row', gap: 8 },
  acceptBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#0a2a1a', borderWidth: 1, borderColor: '#00ff87', alignItems: 'center', justifyContent: 'center' },
  acceptBtnText: { color: '#00ff87', fontSize: 16, fontWeight: '700' },
  declineBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2a0a0a', borderWidth: 1, borderColor: '#ff3333', alignItems: 'center', justifyContent: 'center' },
  declineBtnText: { color: '#ff3333', fontSize: 16, fontWeight: '700' },
  emptyContainer: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 18, fontWeight: '700', color: '#ffffff' },
  emptySubtext: { fontSize: 14, color: '#555', textAlign: 'center' },
});
