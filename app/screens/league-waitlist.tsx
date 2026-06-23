import { router, useLocalSearchParams } from 'expo-router';
import { arrayUnion, collection, deleteDoc, doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';
import { getSportRules } from '@/domain/sports/rules';
import GlobalNav from '@/components/GlobalNav';

export default function LeagueWaitlistScreen() {
  const { leagueId, leagueName } = useLocalSearchParams<{ leagueId: string; leagueName: string }>();
  const [entries, setEntries] = useState<any[]>([]);
  const [members, setMembers] = useState<string[]>([]);
  const [invitedUids, setInvitedUids] = useState<string[]>([]);
  const [league, setLeague] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const user = auth.currentUser;

  // League doc → members + admin check
  useEffect(() => {
    if (!leagueId) return;
    const unsub = onSnapshot(doc(db, 'leagues', leagueId), (snap) => {
      const d = (snap.data() || {}) as any;
      setLeague({ id: snap.id, ...d });
      setMembers(d.members || []);
      setLoading(false);
    }, err => { if (err.code !== 'permission-denied') console.error(err); });
    return () => unsub();
  }, [leagueId]);

  // Waitlist entries, ordered by joinedAt (first to apply = #1)
  useEffect(() => {
    if (!leagueId) return;
    const unsub = onSnapshot(collection(db, 'leagues', leagueId, 'waitlist'), (snap) => {
      const list = snap.docs.map(d => ({ uid: d.id, ...d.data() } as any));
      list.sort((a, b) => {
        const ta = a.joinedAt?.toMillis ? a.joinedAt.toMillis() : 0;
        const tb = b.joinedAt?.toMillis ? b.joinedAt.toMillis() : 0;
        return ta - tb;
      });
      setEntries(list);
    }, err => { if (err.code !== 'permission-denied') console.error(err); });
    return () => unsub();
  }, [leagueId]);

  // Who already has a pending invite (so we can show an "Invited" badge)
  useEffect(() => {
    if (!leagueId) return;
    const unsub = onSnapshot(collection(db, 'leagues', leagueId, 'sent_invites'), (snap) => {
      setInvitedUids(
        snap.docs
          .filter(d => { const s: any = d.data(); return !s.status || s.status === 'pending'; })
          .map(d => d.id)
      );
    }, err => { if (err.code !== 'permission-denied') console.error(err); });
    return () => unsub();
  }, [leagueId]);

  const isAdmin = !!user && !!league && (
    league.commissionerId === user.uid || (league.coCommissioners || []).includes(user.uid)
  );

  const MAX = typeof league?.maxMembers === 'number'
    ? league.maxMembers
    : getSportRules(league?.sport).teamCount;
  const openSlots = Math.max(0, MAX - members.length);

  // Hide anyone who has since become a member
  const visible = useMemo(
    () => entries.filter((e: any) => !members.includes(e.uid)),
    [entries, members]
  );

  const inviteFromWaitlist = async (entry: any) => {
    if (!user) return;
    setBusy(entry.uid);
    try {
      const myData = (await getDoc(doc(db, 'users', user.uid))).data() || {};
      await updateDoc(doc(db, 'users', entry.uid), {
        leagueInvites: arrayUnion({
          leagueId,
          leagueName: leagueName || league?.name || 'League',
          inviterId: user.uid,
          inviterName: myData.displayName || user.email,
        }),
      });
      await setDoc(doc(db, 'leagues', leagueId, 'sent_invites', entry.uid), {
        uid: entry.uid,
        displayName: entry.displayName || '',
        username: entry.username || '',
        inviterId: user.uid,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      Alert.alert('Invite Sent', (entry.displayName || 'They') + ' has been invited to join.');
    } catch (e: any) { Alert.alert('Error', e.message); }
    setBusy(null);
  };

  const removeFromWaitlist = (entry: any) => {
    Alert.alert('Remove from Waitlist', 'Remove ' + (entry.displayName || 'this user') + ' from the waitlist?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await deleteDoc(doc(db, 'leagues', leagueId, 'waitlist', entry.uid)); }
        catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Waitlist</Text>
        <View style={{ width: 60 }} />
      </View>

      <Text style={styles.subtitle}>
        {members.length}/{MAX} GMs · {openSlots > 0 ? (openSlots + ' open slot' + (openSlots !== 1 ? 's' : '')) : 'League full'}
      </Text>

      {loading ? (
        <ActivityIndicator color='#00ff87' style={{ marginTop: 20 }} />
      ) : !isAdmin ? (
        <Text style={styles.emptyText}>Only the commissioner can view the waitlist.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          {visible.length === 0 ? (
            <Text style={styles.emptyText}>No one on the waitlist yet.</Text>
          ) : visible.map((entry: any, i: number) => {
            const invited = invitedUids.includes(entry.uid);
            const initial = (entry.displayName || entry.username || '?')[0]?.toUpperCase();
            return (
              <View key={entry.uid} style={styles.row}>
                <Text style={styles.position}>{i + 1}</Text>
                <TouchableOpacity
                  style={styles.avatar}
                  onPress={() => router.push({ pathname: '/screens/profile', params: { uid: entry.uid } })}
                >
                  <Text style={styles.avatarText}>{initial}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.info}
                  onPress={() => router.push({ pathname: '/screens/profile', params: { uid: entry.uid } })}
                >
                  <Text style={styles.name}>{entry.displayName || entry.username}</Text>
                  {entry.username ? <Text style={styles.username}>@{entry.username}</Text> : null}
                </TouchableOpacity>
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={styles.dmBtn}
                    onPress={() => router.push({ pathname: '/screens/dm', params: { uid: entry.uid, name: entry.displayName || entry.username || 'GM' } })}
                  >
                    <Text style={styles.dmBtnText}>DM</Text>
                  </TouchableOpacity>
                  {invited ? (
                    <View style={styles.invitedBadge}><Text style={styles.invitedBadgeText}>Invited</Text></View>
                  ) : (
                    <TouchableOpacity
                      style={styles.inviteBtn}
                      onPress={() => inviteFromWaitlist(entry)}
                      disabled={busy === entry.uid}
                    >
                      {busy === entry.uid
                        ? <ActivityIndicator size='small' color='#000' />
                        : <Text style={styles.inviteBtnText}>Invite</Text>}
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.removeBtn} onPress={() => removeFromWaitlist(entry)}>
                    <Text style={styles.removeBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
          {visible.length > 0 ? (
            <Text style={styles.footnote}>Listed in the order they applied. Invite opens a normal league invite they can accept once there's room.</Text>
          ) : null}
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
  title: { fontSize: 18, fontWeight: '800', color: '#ffffff' },
  subtitle: { color: '#888', fontSize: 12, fontWeight: '600', paddingHorizontal: 20, paddingTop: 12 },
  listContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 100 },
  emptyText: { color: '#555', fontSize: 14, textAlign: 'center', paddingTop: 40 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#2a2a2a', gap: 10 },
  position: { color: '#F5A623', fontSize: 15, fontWeight: '800', width: 22, textAlign: 'center' },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#2a2a2a', borderWidth: 1, borderColor: '#00ff87', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#00ff87', fontSize: 16, fontWeight: '800' },
  info: { flex: 1 },
  name: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  username: { color: '#666', fontSize: 12, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dmBtn: { backgroundColor: '#15203a', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: '#3B82F6' },
  dmBtnText: { color: '#7da7ff', fontSize: 12, fontWeight: '700' },
  inviteBtn: { backgroundColor: '#00ff87', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  inviteBtnText: { color: '#000', fontSize: 12, fontWeight: '800' },
  invitedBadge: { backgroundColor: '#1a1a2a', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  invitedBadgeText: { color: '#8888ff', fontSize: 12, fontWeight: '600' },
  removeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#2a0a0a', borderWidth: 1, borderColor: '#ff4444', alignItems: 'center', justifyContent: 'center' },
  removeBtnText: { color: '#ff4444', fontSize: 14, fontWeight: '700' },
  footnote: { color: '#555', fontSize: 11, marginTop: 14, lineHeight: 16 },
});
