import { router, useLocalSearchParams } from 'expo-router';
import { arrayRemove, collection, doc, getDoc, getDocs, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';
import GlobalNav from '@/components/GlobalNav';

export default function LeagueMembersScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const [members, setMembers] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [league, setLeague] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const user = auth.currentUser;

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const leagueSnap = await getDoc(doc(db, 'leagues', leagueId));
      if (!leagueSnap.exists()) return;
      const leagueData = { id: leagueSnap.id, ...leagueSnap.data() };
      setLeague(leagueData);

      const memberIds = leagueData.members || [];
      const memberProfiles = await Promise.all(
        memberIds.map((uid: string) => getDoc(doc(db, 'users', uid)))
      );
      setMembers(memberProfiles.filter(d => d.exists()).map(d => ({ uid: d.id, ...d.data() })));

      const teamsSnap = await getDocs(collection(db, 'leagues', leagueId, 'teams'));
      setTeams(teamsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const isCommissioner = league?.commissionerId === user?.uid;

  const bootMember = (member: any) => {
    if (member.uid === user?.uid) { Alert.alert('Cannot boot yourself'); return; }
    Alert.alert(
      'Boot ' + member.displayName + '?',
      'This will remove them from the league and release their team.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Boot', style: 'destructive', onPress: async () => {
          try {
            // Remove from league members
            await updateDoc(doc(db, 'leagues', leagueId), {
              members: arrayRemove(member.uid),
            });
            // Remove league from user
            await updateDoc(doc(db, 'users', member.uid), {
              leagues: arrayRemove(leagueId),
            });
            // Delete their team
            const memberTeam = teams.find(t => t.gmId === member.uid);
            if (memberTeam) {
              await updateDoc(doc(db, 'leagues', leagueId, 'teams', memberTeam.id), {
                gmId: '',
                players: [],
              });
              // Remove from takenTeams
              await updateDoc(doc(db, 'leagues', leagueId), {
                takenTeams: arrayRemove(memberTeam.teamId),
              });
            }
            setMembers(prev => prev.filter(m => m.uid !== member.uid));
            Alert.alert('Booted', member.displayName + ' has been removed from the league.');
          } catch (e: any) { Alert.alert('Error', e.message); }
        }},
      ]
    );
  };

  const getMemberTeam = (uid: string) => teams.find(t => t.gmId === uid);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Members ({members.length})</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <ActivityIndicator size='large' color='#00ff87' style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={members}
          keyExtractor={item => item.uid}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const team = getMemberTeam(item.uid);
            const isComm = item.uid === league?.commissionerId;
            return (
              <TouchableOpacity
                style={styles.memberCard}
                onPress={() => router.push({ pathname: '/screens/profile', params: { uid: item.uid } })}
                activeOpacity={0.8}
              >
                {item.photoUrl ? (
                  <Image source={{ uri: item.photoUrl }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarText}>{item.displayName?.[0]?.toUpperCase() || '?'}</Text>
                  </View>
                )}
                <View style={styles.memberInfo}>
                  <View style={styles.memberNameRow}>
                    <Text style={styles.memberName}>{item.displayName}</Text>
                    {isComm && <View style={styles.commBadge}><Text style={styles.commBadgeText}>Commissioner</Text></View>}
                  </View>
                  <Text style={styles.memberUsername}>@{item.username}</Text>
                  {team && <Text style={styles.memberTeam}>🏀 {team.name}</Text>}
                </View>
                <View style={styles.memberActions}>
                  <TouchableOpacity
                    style={styles.dmBtn}
                    onPress={(e) => { e.stopPropagation?.(); router.push({ pathname: '/screens/dm', params: { uid: item.uid, name: item.displayName } }); }}
                  >
                    <Text style={styles.dmBtnText}>💬</Text>
                  </TouchableOpacity>
                  {isCommissioner && !isComm && (
                    <TouchableOpacity
                      style={styles.bootBtn}
                      onPress={(e) => { e.stopPropagation?.(); bootMember(item); }}
                    >
                      <Text style={styles.bootBtnText}>🧹</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
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
  listContent: { padding: 20, paddingBottom: 100 },
  memberCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#2a2a2a', gap: 12 },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#2a2a2a' },
  avatarPlaceholder: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#1a1a2a', borderWidth: 2, borderColor: '#00ff87', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#00ff87', fontSize: 20, fontWeight: '800' },
  memberInfo: { flex: 1 },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  memberName: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  commBadge: { backgroundColor: '#0a2a1a', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#00ff87' },
  commBadgeText: { color: '#00ff87', fontSize: 10, fontWeight: '700' },
  memberUsername: { color: '#666', fontSize: 12, marginTop: 2 },
  memberTeam: { color: '#888', fontSize: 12, marginTop: 3 },
  memberActions: { flexDirection: 'row', gap: 6 },
  dmBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1a1a2a', borderWidth: 1, borderColor: '#4444ff', alignItems: 'center', justifyContent: 'center' },
  dmBtnText: { fontSize: 16 },
  bootBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2a0a0a', borderWidth: 1, borderColor: '#ff4444', alignItems: 'center', justifyContent: 'center' },
  bootBtnText: { fontSize: 16 },
});