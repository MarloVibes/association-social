import { router, useLocalSearchParams } from 'expo-router';
import { addDoc, arrayRemove, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';

const SPORT_KEY: Record<string, string> = {
  nba: 'nba', madden: 'nfl', mlb: 'mlb',
};

export default function LeagueScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const [league, setLeague] = useState<any>(null);
  const [myTeam, setMyTeam] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteInput, setDeleteInput] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const user = auth.currentUser;
  const isCommissioner = league?.commissionerId === user?.uid;

  useEffect(() => {
    if (!leagueId) return;

    const loadLeague = async () => {
      const leagueSnap = await getDoc(doc(db, 'leagues', leagueId));
      if (!leagueSnap.exists()) {
        Alert.alert('Not found', 'This league no longer exists.');
        router.back();
        return;
      }
      const leagueData = { id: leagueSnap.id, ...leagueSnap.data() };
      setLeague(leagueData);

      // Load member profiles
      const memberProfiles = await Promise.all(
        (leagueData.members || []).map(async (uid: string) => {
          const snap = await getDoc(doc(db, 'users', uid));
          return snap.exists() ? { uid, ...snap.data() } : { uid, displayName: 'Unknown GM' };
        })
      );
      setMembers(memberProfiles);

      // Find my team
      const teamsSnap = await getDocs(collection(db, 'leagues', leagueId, 'teams'));
      const myT = teamsSnap.docs.find(d => d.data().gmId === user?.uid);
      if (myT) setMyTeam({ id: myT.id, ...myT.data() });

      setLoading(false);
    };

    loadLeague();

    // Live activity feed
    const activityQuery = query(
      collection(db, 'leagues', leagueId, 'activity'),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(activityQuery, snap => {
      setActivity(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => unsubscribe();
  }, [leagueId]);

  const handleDeleteLeague = async () => {
    if (deleteInput.trim() !== league.name) {
      Alert.alert('Name mismatch', 'League name does not match. Please type it exactly.');
      return;
    }

    setDeleting(true);
    try {
      const batch = writeBatch(db);

      // Remove leagueId from all members' profiles
      for (const member of members) {
        batch.update(doc(db, 'users', member.uid), {
          leagues: arrayRemove(leagueId),
        });
      }

      // Delete league doc
      batch.delete(doc(db, 'leagues', leagueId));

      await batch.commit();

      Alert.alert('Deleted', 'The league has been permanently deleted.', [
        { text: 'OK', onPress: () => router.replace('/(tabs)/dashboard') },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
      setDeleting(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete League',
      `This will permanently delete "${league?.name}" and remove all members. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => setShowDeleteConfirm(true),
        },
      ]
    );
  };

  const handleLeaveLeague = async () => {
    if (!user) return;
    Alert.alert(
      'Leave League',
      'Are you sure you want to leave this league?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'leagues', leagueId), {
                members: arrayRemove(user.uid),
              });
              await updateDoc(doc(db, 'users', user.uid), {
                leagues: arrayRemove(leagueId),
              });
              router.replace('/(tabs)/dashboard');
            } catch (e: any) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00ff87" />
      </View>
    );
  }

  if (showDeleteConfirm) {
    return (
      <View style={styles.deleteScreen}>
        <View style={styles.deleteCard}>
          <Text style={styles.deleteTitle}>Final Confirmation</Text>
          <Text style={styles.deleteSubtitle}>
            Type the league name to confirm deletion:
          </Text>
          <Text style={styles.deleteName}>"{league.name}"</Text>
          <TextInput
            style={styles.deleteInput}
            placeholder="Type league name here"
            placeholderTextColor="#555"
            value={deleteInput}
            onChangeText={setDeleteInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={[
              styles.deleteConfirmBtn,
              deleteInput.trim() !== league.name && styles.deleteConfirmBtnDisabled,
            ]}
            onPress={handleDeleteLeague}
            disabled={deleteInput.trim() !== league.name || deleting}
          >
            {deleting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.deleteConfirmBtnText}>Permanently Delete League</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteCancelBtn}
            onPress={() => { setShowDeleteConfirm(false); setDeleteInput(''); }}
          >
            <Text style={styles.deleteCancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.inner}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.replace('/(tabs)/dashboard')}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          {isCommissioner && (
            <View style={styles.commBadge}>
              <Text style={styles.commBadgeText}>Commissioner</Text>
            </View>
          )}
        </View>

        <Text style={styles.leagueName}>{league.name}</Text>
        <View style={styles.leagueMeta}>
          <View style={styles.sportChip}>
            <Text style={styles.sportChipText}>{league.sport?.toUpperCase()}</Text>
          </View>
          <Text style={styles.metaText}>{league.mode} mode</Text>
          <View style={styles.codeChip}>
            <Text style={styles.codeChipText}>Code: {league.code}</Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.rosterBtn}
            onPress={() => router.push({
              pathname: '/(tabs)/roster',
              params: {
                leagueId,
                sport: SPORT_KEY[league.sport] || league.sport,
                teamId: myTeam?.id || '',
              },
            })}
          >
            <Text style={styles.rosterBtnText}>Browse Roster</Text>
          </TouchableOpacity>
          {myTeam && (
            <View style={styles.myTeamChip}>
              <Text style={styles.myTeamChipText}>My Team: {myTeam.name || 'Unnamed'}</Text>
            </View>
          )}
        </View>

        {/* Activity Feed */}
        <Text style={styles.sectionTitle}>League Activity</Text>
        {activity.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No activity yet. Pick up your first player!</Text>
          </View>
        ) : (
          activity.slice(0, 20).map(item => (
            <View key={item.id} style={styles.activityItem}>
              <View style={[styles.activityDot, item.type === 'tradeblock' && styles.activityDotTrade]} />
              <View style={styles.activityContent}>
                <Text style={styles.activityMessage}>
                  <Text style={styles.activityBold}>
                    {members.find(m => m.uid === item.uid)?.displayName || 'A GM'}
                  </Text>
                  {' '}{item.message}
                </Text>
                {item.createdAt && (
                  <Text style={styles.activityTime}>
                    {new Date(item.createdAt.seconds * 1000).toLocaleDateString()}
                  </Text>
                )}
              </View>
            </View>
          ))
        )}

        {/* Members */}
        <Text style={styles.sectionTitle}>Members ({members.length})</Text>
        <View style={styles.membersCard}>
          {members.map(member => (
            <View key={member.uid} style={styles.memberRow}>
              <View style={styles.memberAvatar}>
                <Text style={styles.memberAvatarText}>
                  {member.displayName?.[0]?.toUpperCase() || '?'}
                </Text>
              </View>
              <View>
                <Text style={styles.memberName}>{member.displayName}</Text>
                {member.uid === league.commissionerId && (
                  <Text style={styles.memberRole}>Commissioner</Text>
                )}
              </View>
            </View>
          ))}
        </View>

        {/* Commissioner Controls */}
        {isCommissioner && (
          <View style={styles.commSection}>
            <Text style={styles.sectionTitle}>Commissioner Controls</Text>
            <TouchableOpacity style={styles.deleteBtn} onPress={confirmDelete}>
              <Text style={styles.deleteBtnText}>Delete League</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Leave League (non-commissioner) */}
        {!isCommissioner && (
          <TouchableOpacity style={styles.leaveBtn} onPress={handleLeaveLeague}>
            <Text style={styles.leaveBtnText}>Leave League</Text>
          </TouchableOpacity>
        )}

        <View style={styles.spacer} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  loadingContainer: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' },
  inner: { padding: 24, paddingTop: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  backText: { color: '#00ff87', fontSize: 15, fontWeight: '600' },
  commBadge: { backgroundColor: '#0a2a1a', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#00ff87' },
  commBadgeText: { color: '#00ff87', fontSize: 12, fontWeight: '600' },
  leagueName: { fontSize: 28, fontWeight: '800', color: '#ffffff', marginBottom: 12 },
  leagueMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' },
  sportChip: { backgroundColor: '#1a1a1a', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#333' },
  sportChipText: { color: '#aaa', fontSize: 12, fontWeight: '700' },
  metaText: { color: '#666', fontSize: 13 },
  codeChip: { backgroundColor: '#111', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  codeChipText: { color: '#555', fontSize: 12, fontWeight: '600', letterSpacing: 1 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 32 },
  rosterBtn: { backgroundColor: '#00ff87', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20 },
  rosterBtnText: { color: '#000', fontSize: 14, fontWeight: '700' },
  myTeamChip: { backgroundColor: '#1a1a1a', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#2a2a2a', flex: 1 },
  myTeamChipText: { color: '#888', fontSize: 13 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#ffffff', marginBottom: 14 },
  emptyCard: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: '#2a2a2a' },
  emptyText: { color: '#666', fontSize: 14, textAlign: 'center' },
  activityItem: { flexDirection: 'row', gap: 12, marginBottom: 14, alignItems: 'flex-start' },
  activityDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#00ff87', marginTop: 5 },
  activityDotTrade: { backgroundColor: '#ff9900' },
  activityContent: { flex: 1 },
  activityMessage: { color: '#cccccc', fontSize: 14, lineHeight: 20 },
  activityBold: { color: '#ffffff', fontWeight: '700' },
  activityTime: { color: '#555', fontSize: 12, marginTop: 2 },
  membersCard: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16, marginBottom: 32, borderWidth: 1, borderColor: '#2a2a2a', gap: 14 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  memberAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2a2a2a', borderWidth: 1, borderColor: '#00ff87', alignItems: 'center', justifyContent: 'center' },
  memberAvatarText: { color: '#00ff87', fontSize: 14, fontWeight: '700' },
  memberName: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  memberRole: { color: '#00ff87', fontSize: 12 },
  commSection: { marginBottom: 16 },
  deleteBtn: { backgroundColor: '#1a0a0a', borderRadius: 12, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: '#ff3333' },
  deleteBtnText: { color: '#ff3333', fontSize: 15, fontWeight: '700' },
  leaveBtn: { backgroundColor: '#1a1a1a', borderRadius: 12, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: '#444', marginBottom: 16 },
  leaveBtnText: { color: '#888', fontSize: 15, fontWeight: '600' },
  spacer: { height: 60 },
  // Delete confirmation screen
  deleteScreen: { flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', padding: 24 },
  deleteCard: { backgroundColor: '#1a0a0a', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: '#ff3333' },
  deleteTitle: { fontSize: 22, fontWeight: '800', color: '#ff3333', marginBottom: 8 },
  deleteSubtitle: { fontSize: 14, color: '#888', marginBottom: 12 },
  deleteName: { fontSize: 15, fontWeight: '700', color: '#ffffff', marginBottom: 20 },
  deleteInput: { backgroundColor: '#0a0a0a', borderRadius: 12, padding: 16, color: '#ffffff', fontSize: 15, borderWidth: 1, borderColor: '#333', marginBottom: 16 },
  deleteConfirmBtn: { backgroundColor: '#ff3333', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginBottom: 12 },
  deleteConfirmBtnDisabled: { opacity: 0.3 },
  deleteConfirmBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  deleteCancelBtn: { paddingVertical: 12, alignItems: 'center' },
  deleteCancelBtnText: { color: '#888', fontSize: 15 },
});
