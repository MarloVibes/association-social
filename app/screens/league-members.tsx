import { router, useLocalSearchParams } from 'expo-router';
import { arrayRemove, arrayUnion, collection, doc, getDoc, getDocs, updateDoc } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';
import GlobalNav from '@/components/GlobalNav';

function sportIconForLeague(sport?: string | null) {
  if (sport === 'madden' || sport === 'nfl') return '🏈';
  if (sport === 'mlb') return '⚾';
  return '🏀';
}

export default function LeagueMembersScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const [members, setMembers] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [league, setLeague] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [commissionerId, setCommissionerId] = useState('');
  const user = auth.currentUser;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const leagueSnap = await getDoc(doc(db, 'leagues', leagueId));
      if (!leagueSnap.exists()) return;
      const leagueData: any = { id: leagueSnap.id, ...leagueSnap.data() };
      setLeague(leagueData);
      setCommissionerId(leagueData.commissionerId || '');

      const memberIds = leagueData.members || [];
      const memberProfiles = await Promise.all(
        memberIds.map((uid: string) => getDoc(doc(db, 'users', uid)))
      );
      setMembers(memberProfiles.filter((d: any) => d.exists()).map((d: any) => ({ uid: d.id, ...d.data() })));

      const teamsSnap = await getDocs(collection(db, 'leagues', leagueId, 'teams'));
      setTeams(teamsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [leagueId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const coComms: string[] = league?.coCommissioners || [];
  const isFounder = commissionerId === user?.uid || league?.commissionerId === user?.uid;
  const isCommissioner = isFounder || coComms.includes(user?.uid || '');

  const bootMember = (member: any) => {
    if (member.uid === user?.uid) { Alert.alert('Cannot boot yourself'); return; }
    if (member.uid === league?.commissionerId) { Alert.alert('Cannot boot the league founder.'); return; }
    if (coComms.includes(member.uid) && !isFounder) {
      Alert.alert('Only the founder can remove a co-commissioner', 'Ask the league founder to demote or remove them.');
      return;
    }
    Alert.alert(
      'Boot ' + member.displayName + '?',
      'This will remove them from the league and release their team.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Boot', style: 'destructive', onPress: async () => {
          try {
            await updateDoc(doc(db, 'leagues', leagueId), {
              members: arrayRemove(member.uid),
            });
            await updateDoc(doc(db, 'users', member.uid), {
              leagues: arrayRemove(leagueId),
            });
            const memberTeam = teams.find(t => t.gmId === member.uid);
            if (memberTeam) {
              await updateDoc(doc(db, 'leagues', leagueId, 'teams', memberTeam.id), {
                gmId: '',
                players: [],
              });
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

  const promoteToCoComm = (member: any) => {
    if (member.uid === league?.commissionerId) { Alert.alert('Already the commissioner.'); return; }
    Alert.alert(
      'Promote ' + (member.displayName || '@' + member.username) + '?',
      'They will have commissioner-level permissions in this league.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Promote', onPress: async () => {
          try {
            await updateDoc(doc(db, 'leagues', leagueId), { coCommissioners: arrayUnion(member.uid) });
            await updateDoc(doc(db, 'users', member.uid), {
              notifications: arrayUnion({
                type: 'cocomm_promoted',
                leagueId,
                leagueName: league?.name || '',
                message: 'You were promoted to Co-Commissioner in ' + (league?.name || 'the league') + '.',
                createdAt: new Date().toISOString(),
              }),
            });
            setLeague((prev: any) => ({ ...prev, coCommissioners: [...(prev?.coCommissioners || []), member.uid] }));
          } catch (e: any) { Alert.alert('Error', e.message); }
        }},
      ]
    );
  };

  const demoteCoComm = (member: any) => {
    Alert.alert(
      'Demote ' + (member.displayName || '@' + member.username) + '?',
      'They will lose commissioner permissions.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Demote', style: 'destructive', onPress: async () => {
          try {
            await updateDoc(doc(db, 'leagues', leagueId), { coCommissioners: arrayRemove(member.uid) });
            await updateDoc(doc(db, 'users', member.uid), {
              notifications: arrayUnion({
                type: 'cocomm_demoted',
                leagueId,
                leagueName: league?.name || '',
                message: 'You are no longer Co-Commissioner in ' + (league?.name || 'the league') + '.',
                createdAt: new Date().toISOString(),
              }),
            });
            setLeague((prev: any) => ({ ...prev, coCommissioners: (prev?.coCommissioners || []).filter((u: string) => u !== member.uid) }));
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
        <>
          <FlatList
            data={members}
            keyExtractor={item => item.uid}
            contentContainerStyle={[styles.listContent, { paddingTop: 60 }]}
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
                      {!isComm && coComms.includes(item.uid) && <View style={styles.coCommBadge}><Text style={styles.coCommBadgeText}>Co-Commissioner</Text></View>}
                    </View>
                    <Text style={styles.memberUsername}>@{item.username}</Text>
                    {team && <Text style={styles.memberTeam}>{sportIconForLeague(league?.sport)} {team.name}</Text>}
                  </View>
                  <View style={styles.memberActions}>
                    <TouchableOpacity
                      style={styles.dmBtn}
                      onPress={(e) => { e.stopPropagation?.(); router.push({ pathname: '/screens/dm', params: { uid: item.uid, name: item.displayName } }); }}
                    >
                      <Text style={styles.dmBtnText}>💬</Text>
                    </TouchableOpacity>
                    {isCommissioner && !isComm && !coComms.includes(item.uid) && (
                      <TouchableOpacity
                        style={styles.promoteBtn}
                        onPress={(e) => { e.stopPropagation?.(); promoteToCoComm(item); }}
                      >
                        <Text style={styles.promoteBtnText}>🏛️</Text>
                      </TouchableOpacity>
                    )}
                    {isFounder && coComms.includes(item.uid) && (
                      <TouchableOpacity
                        style={styles.demoteBtn}
                        onPress={(e) => { e.stopPropagation?.(); demoteCoComm(item); }}
                      >
                        <Text style={styles.demoteBtnText}>⬇️</Text>
                      </TouchableOpacity>
                    )}
                    {isCommissioner && !isComm && (isFounder || !coComms.includes(item.uid)) && (
                      <TouchableOpacity
                        style={styles.bootBtn}
                        onPress={(e) => { e.stopPropagation?.(); bootMember(item); }}
                      >
                        <Text style={styles.bootBtnText}>👢</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
              );
            }}
          />
          <GlobalNav />
        </>
      )}
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
  coCommBadge: { backgroundColor: '#2a2200', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#F5A623' },
  coCommBadgeText: { color: '#F5A623', fontSize: 10, fontWeight: '700' },
  promoteBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2a2200', borderWidth: 1, borderColor: '#F5A623', alignItems: 'center', justifyContent: 'center' },
  promoteBtnText: { fontSize: 16 },
  demoteBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1a1a00', borderWidth: 1, borderColor: '#888800', alignItems: 'center', justifyContent: 'center' },
  demoteBtnText: { fontSize: 16 },
});
