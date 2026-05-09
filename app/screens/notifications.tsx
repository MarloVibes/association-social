import { router } from 'expo-router';
import { addDoc, arrayRemove, arrayUnion, collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where, deleteDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';
import GlobalNav from '@/components/GlobalNav';

export default function NotificationsScreen() {
  const [invites, setInvites] = useState<any[]>([]);
  const [joinRequests, setJoinRequests] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const user = auth.currentUser;

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) {
        const data = snap.data();
        setInvites(data.leagueInvites || []);
        setNotifications((data.notifications || []).reverse());
      }
      // Load join requests for leagues where user is commissioner
      const leaguesSnap = await getDocs(query(collection(db, 'leagues'), where('commissionerId', '==', user.uid)));
      const allRequests: any[] = [];
      for (const leagueDoc of leaguesSnap.docs) {
        const reqSnap = await getDocs(collection(db, 'leagues', leagueDoc.id, 'join_requests'));
        reqSnap.docs.forEach(r => {
          const data = r.data();
          if (data.status === 'pending') {
            allRequests.push({ id: r.id, leagueDocId: leagueDoc.id, ...data });
          }
        });
      }
      setJoinRequests(allRequests);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const acceptInvite = async (invite: any) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'leagues', invite.leagueId), {
        members: arrayUnion(user.uid),
      });
      await updateDoc(doc(db, 'users', user.uid), {
        leagues: arrayUnion(invite.leagueId),
        leagueInvites: (await getDoc(doc(db, 'users', user.uid))).data()?.leagueInvites?.filter((i: any) => i.leagueId !== invite.leagueId) || [],
      });
      setInvites(prev => prev.filter(i => i.leagueId !== invite.leagueId));
      router.push({ pathname: '/screens/league', params: { leagueId: invite.leagueId } });
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const denyInvite = async (invite: any) => {
    if (!user) return;
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      const current = snap.data()?.leagueInvites || [];
      await updateDoc(doc(db, 'users', user.uid), {
        leagueInvites: current.filter((i: any) => i.leagueId !== invite.leagueId),
      });
      setInvites(prev => prev.filter(i => i.leagueId !== invite.leagueId));
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const acceptJoinRequest = async (req: any) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'leagues', req.leagueDocId), {
        members: arrayUnion(req.uid),
      });
      await updateDoc(doc(db, 'users', req.uid), {
        leagues: arrayUnion(req.leagueDocId),
        notifications: arrayUnion({
          type: 'join_accepted',
          leagueId: req.leagueDocId,
          leagueName: req.leagueName,
          createdAt: new Date().toISOString(),
        }),
      });
      await deleteDoc(doc(db, 'leagues', req.leagueDocId, 'join_requests', req.id));
      setJoinRequests(prev => prev.filter(r => r.id !== req.id));
      Alert.alert('Accepted!', req.displayName + ' has been added to ' + req.leagueName);
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const denyJoinRequest = async (req: any) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', req.uid), {
        notifications: arrayUnion({
          type: 'join_denied',
          leagueId: req.leagueDocId,
          leagueName: req.leagueName,
          createdAt: new Date().toISOString(),
        }),
      });
      await deleteDoc(doc(db, 'leagues', req.leagueDocId, 'join_requests', req.id));
      setJoinRequests(prev => prev.filter(r => r.id !== req.id));
    } catch (e: any) { Alert.alert('Error', e.message); }
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
          <ActivityIndicator size='large' color='#00ff87' />
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>

          {/* Join Requests - Commissioner Only */}
          {joinRequests.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Join Requests</Text>
              {joinRequests.map((req: any) => (
                <View key={req.id} style={styles.joinRequestCard}>
                  <View style={styles.joinRequestInfo}>
                    <Text style={styles.joinRequestName}>{req.displayName}</Text>
                    <Text style={styles.joinRequestMeta}>@{req.username} wants to join</Text>
                    <Text style={styles.joinRequestLeague}>🏆 {req.leagueName}</Text>
                  </View>
                  <View style={styles.joinRequestActions}>
                    <TouchableOpacity style={styles.acceptBtn} onPress={() => acceptJoinRequest(req)}>
                      <Text style={styles.acceptBtnText}>✓</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.denyBtn} onPress={() => denyJoinRequest(req)}>
                      <Text style={styles.denyBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </>
          )}

          {/* League Invites */}
          {invites.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>League Invites</Text>
              {invites.map((invite: any, i: number) => (
                <View key={i} style={styles.inviteCard}>
                  <View style={styles.inviteInfo}>
                    <Text style={styles.inviteName}>{invite.leagueName}</Text>
                    <Text style={styles.inviteMeta}>Invited by {invite.inviterName}</Text>
                  </View>
                  <View style={styles.joinRequestActions}>
                    <TouchableOpacity style={styles.acceptBtn} onPress={() => acceptInvite(invite)}>
                      <Text style={styles.acceptBtnText}>✓</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.denyBtn} onPress={() => denyInvite(invite)}>
                      <Text style={styles.denyBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </>
          )}

          {/* General Notifications */}
          {notifications.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Activity</Text>
              {notifications.map((n: any, i: number) => (
                <View key={i} style={styles.notifCard}>
                  <Text style={styles.notifIcon}>
                    {n.type === 'join_accepted' ? '✅' : n.type === 'join_denied' ? '❌' : '🔔'}
                  </Text>
                  <View style={styles.notifInfo}>
                    {n.type === 'join_accepted' && <Text style={styles.notifText}>Your request to join <Text style={styles.notifBold}>{n.leagueName}</Text> was accepted!</Text>}
                    {n.type === 'join_denied' && <Text style={styles.notifText}>Your request to join <Text style={styles.notifBold}>{n.leagueName}</Text> was denied.</Text>}
                    {n.type === 'trade_listing' && (
                      <TouchableOpacity onPress={() => router.push({ pathname: '/screens/trade-channel', params: { leagueId: n.leagueId, channelId: 'trade-talk' } })}>
                        <Text style={styles.notifText}>{n.message}</Text>
                        <Text style={styles.notifLink}>View trade talks →</Text>
                      </TouchableOpacity>
                    )}
                    {n.type !== 'join_accepted' && n.type !== 'join_denied' && n.type !== 'trade_listing' && <Text style={styles.notifText}>{n.message || n.type}</Text>}
                    <Text style={styles.notifTime}>{n.createdAt ? new Date(n.createdAt).toLocaleDateString() : ''}</Text>
                  </View>
                </View>
              ))}
            </>
          )}

          {joinRequests.length === 0 && invites.length === 0 && notifications.length === 0 && (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🔔</Text>
              <Text style={styles.emptyText}>No notifications yet</Text>
            </View>
          )}
        </ScrollView>
      )}
      <GlobalNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  backText: { color: '#00ff87', fontSize: 15, fontWeight: '600', width: 60 },
  title: { fontSize: 18, fontWeight: '800', color: '#ffffff' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingBottom: 100 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#ffffff', marginBottom: 12, marginTop: 8 },
  joinRequestCard: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#2a2a2a', flexDirection: 'row', alignItems: 'center', gap: 12 },
  joinRequestInfo: { flex: 1 },
  joinRequestName: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  joinRequestMeta: { color: '#888', fontSize: 12, marginTop: 2 },
  joinRequestLeague: { color: '#00ff87', fontSize: 12, fontWeight: '600', marginTop: 4 },
  joinRequestActions: { flexDirection: 'row', gap: 8 },
  acceptBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#0a2a1a', borderWidth: 1, borderColor: '#00ff87', alignItems: 'center', justifyContent: 'center' },
  acceptBtnText: { color: '#00ff87', fontSize: 16, fontWeight: '700' },
  denyBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2a0a0a', borderWidth: 1, borderColor: '#ff4444', alignItems: 'center', justifyContent: 'center' },
  denyBtnText: { color: '#ff4444', fontSize: 16, fontWeight: '700' },
  inviteCard: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#2a2a2a', flexDirection: 'row', alignItems: 'center', gap: 12 },
  inviteInfo: { flex: 1 },
  inviteName: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  inviteMeta: { color: '#888', fontSize: 12, marginTop: 2 },
  notifCard: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#2a2a2a', flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  notifIcon: { fontSize: 22 },
  notifInfo: { flex: 1 },
  notifText: { color: '#cccccc', fontSize: 14, lineHeight: 20 },
  notifBold: { color: '#ffffff', fontWeight: '700' },
  notifTime: { color: '#555', fontSize: 11, marginTop: 4 },
  notifPreview: { color: '#888', fontSize: 12, fontStyle: 'italic', marginTop: 2 },
  notifLink: { color: '#ff9900', fontSize: 11, marginTop: 2, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', paddingTop: 80, gap: 16 },
  emptyIcon: { fontSize: 48 },
  emptyText: { color: '#555', fontSize: 15 },
});