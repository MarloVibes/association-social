import { router, useLocalSearchParams } from 'expo-router';
import { addDoc, arrayUnion, collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';
import GlobalNav from '@/components/GlobalNav';

const ERA_LABELS: Record<string, string> = {
  magic_bird: '🏀 Magic/Bird Era (83-84)',
  jordan: '🐐 Jordan Era (91-92)',
  kobe: '🦋 Kobe Era (02-03)',
  lebron: '👑 LeBron Era (10-11)',
  steph: '🍀 Steph Era (16-17)',
  current: '📅 Current Rosters (25-26)',
};

export default function JoinLeagueScreen() {
  const { leagueId, leagueName } = useLocalSearchParams<{ leagueId?: string; leagueName?: string }>();
  const [leagues, setLeagues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterSport, setFilterSport] = useState('all');
  const [filterEra, setFilterEra] = useState('all');
  const [selectedLeague, setSelectedLeague] = useState<any>(null);
  const [leagueRules, setLeagueRules] = useState('');
  const [alreadyRequested, setAlreadyRequested] = useState<Set<string>>(new Set());
  const [alreadyMember, setAlreadyMember] = useState<Set<string>>(new Set());
  const [joining, setJoining] = useState(false);
  const user = auth.currentUser;

  useEffect(() => {
    if (leagueId) {
      // Direct link to specific league
      loadSpecificLeague();
    } else {
      loadAllLeagues();
    }
  }, []);

  const loadAllLeagues = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'leagues'));
      const allLeagues = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Get user's memberships and requests
      const memberSet = new Set<string>();
      const requestSet = new Set<string>();
      for (const league of allLeagues) {
        if ((league as any).members?.includes(user?.uid)) memberSet.add(league.id);
        const reqSnap = await getDoc(doc(db, 'leagues', league.id, 'join_requests', user!.uid));
        if (reqSnap.exists()) requestSet.add(league.id);
      }
      setAlreadyMember(memberSet);
      setAlreadyRequested(requestSet);

      // Load commissioner names
      const enriched = await Promise.all(allLeagues.map(async (league: any) => {
        try {
          const commSnap = await getDoc(doc(db, 'users', league.commissionerId));
          const commData = commSnap.data() || {};
          return { ...league, commDisplayName: commData.displayName || '', commUsername: commData.username || '' };
        } catch { return league; }
      }));
      setLeagues(enriched);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const loadSpecificLeague = async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'leagues', leagueId!));
      if (snap.exists()) setSelectedLeague({ id: snap.id, ...snap.data() });
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const loadLeagueRules = async (id: string) => {
    try {
      const snap = await getDoc(doc(db, 'leagues', id, 'channels', 'league-rules'));
      setLeagueRules(snap.exists() ? snap.data()?.content || '' : '');
    } catch (e) { setLeagueRules(''); }
  };

  const joinLeague = async (league: any) => {
    if (!user) return;
    setJoining(true);
    try {
      const myProfile = await getDoc(doc(db, 'users', user.uid));
      const myData = myProfile.data() || {};

      if (league.privacy === 'public') {
        // Auto join
        await updateDoc(doc(db, 'leagues', league.id), { members: arrayUnion(user.uid) });
        await updateDoc(doc(db, 'users', user.uid), { leagues: arrayUnion(league.id) });
        // Notify commissioner
        await updateDoc(doc(db, 'users', league.commissionerId), {
          notifications: arrayUnion({
            type: 'join_accepted',
            leagueId: league.id,
            leagueName: league.name,
            message: (myData.displayName || 'A GM') + ' joined your league',
            createdAt: new Date().toISOString(),
          }),
        });
        setAlreadyMember(prev => new Set([...prev, league.id]));
        Alert.alert('Joined!', 'Pick your team to start playing.', [{ text: 'Pick Team', onPress: () => {
          setSelectedLeague(null);
          router.push({
            pathname: '/screens/team-select',
            params: {
              leagueId: league.id,
              eraKey: league.era || 'current',
              isDraft: 'false',
            },
          });
        }}]);
      } else {
        // Send join request
        await addDoc(collection(db, 'leagues', league.id, 'join_requests'), {
          uid: user.uid,
          displayName: myData.displayName || user.email,
          username: myData.username || '',
          leagueId: league.id,
          leagueName: league.name,
          requestedAt: serverTimestamp(),
          status: 'pending',
        });
        await updateDoc(doc(db, 'users', league.commissionerId), {
          notifications: arrayUnion({
            type: 'join_request',
            leagueId: league.id,
            leagueName: league.name,
            fromUid: user.uid,
            fromName: myData.displayName || user.email,
            fromUsername: myData.username || '',
            createdAt: new Date().toISOString(),
          }),
        });
        setAlreadyRequested(prev => new Set([...prev, league.id]));
        Alert.alert('Request Sent!', 'The commissioner will review your request.');
        setSelectedLeague(null);
      }
    } catch (e: any) { Alert.alert('Error', e.message); }
    setJoining(false);
  };

  const filteredLeagues = leagues.filter(l => {
    const matchSearch = !search ||
      l.name?.toLowerCase().includes(search.toLowerCase()) ||
      l.commDisplayName?.toLowerCase().includes(search.toLowerCase()) ||
      l.commUsername?.toLowerCase().includes(search.toLowerCase());
    const matchSport = filterSport === 'all' || l.sport === filterSport;
    const matchEra = filterEra === 'all' || l.era === filterEra;
    return matchSearch && matchSport && matchEra;
  });

  const privacyLabel = (l: any) => l.privacy === 'public' ? '🟢 Public' : '🔒 Private';
  const privacyColor = (l: any) => l.privacy === 'public' ? '#00cc66' : '#F5A623';

  const renderLeagueCard = ({ item }: { item: any }) => {
    const isMember = alreadyMember.has(item.id);
    const requested = alreadyRequested.has(item.id);
    const members = item.members?.length || 1;
    const sport = item.sport?.toUpperCase() || 'NBA';
    const era = ERA_LABELS[item.era] || item.era || '';
    return (
      <TouchableOpacity
        style={styles.leagueCard}
        onPress={() => { setSelectedLeague(item); loadLeagueRules(item.id); }}
        activeOpacity={0.8}
      >
        <View style={styles.leagueCardTop}>
          <Text style={styles.leagueName}>{item.name}</Text>
          <View style={[styles.privacyBadge, { borderColor: privacyColor(item) }]}>
            <Text style={[styles.privacyText, { color: privacyColor(item) }]}>{privacyLabel(item)}</Text>
          </View>
        </View>
        <View style={styles.leagueMeta}>
          <Text style={styles.leagueMetaText}>{sport}</Text>
          <Text style={styles.leagueMetaDot}>·</Text>
          <Text style={styles.leagueMetaText}>{era}</Text>
          <Text style={styles.leagueMetaDot}>·</Text>
          <Text style={styles.leagueMetaText}>{item.mode} mode</Text>
        </View>
        <View style={styles.commRow}>
          <Text style={styles.commLabel}>Commissioner: </Text>
          <Text style={styles.commName}>{item.commDisplayName || 'Unknown'}</Text>
          {item.commUsername ? <Text style={styles.commUsername}> @{item.commUsername}</Text> : null}
        </View>
        <View style={styles.leagueFooter}>
          <Text style={styles.leagueMemberCount}>👥 {members} member{members !== 1 ? 's' : ''}</Text>
          {isMember ? (
            <View style={styles.memberBadge}><Text style={styles.memberBadgeText}>✓ Member</Text></View>
          ) : requested ? (
            <View style={styles.requestedBadge}><Text style={styles.requestedBadgeText}>⏳ Pending</Text></View>
          ) : (
            <Text style={styles.tapToView}>Tap to view →</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Find a League</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Search */}
      <TextInput
        style={styles.searchInput}
        placeholder='Search leagues...'
        placeholderTextColor='#555'
        value={search}
        onChangeText={setSearch}
      />

      {/* Filters */}
      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16 }}>
            {['all','nba','madden','mlb'].map(s => (
              <TouchableOpacity key={s} style={[styles.filterChip, filterSport === s && styles.filterChipActive]} onPress={() => setFilterSport(s)}>
                <Text style={[styles.filterChipText, filterSport === s && styles.filterChipTextActive]}>{s === 'all' ? 'All Sports' : s.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
            <View style={styles.filterDivider} />
            {['all','current','jordan','kobe','lebron','steph','magic_bird'].map(e => (
              <TouchableOpacity key={e} style={[styles.filterChip, filterEra === e && styles.filterChipActive]} onPress={() => setFilterEra(e)}>
                <Text style={[styles.filterChipText, filterEra === e && styles.filterChipTextActive]}>{e === 'all' ? 'All Eras' : e === 'magic_bird' ? 'Magic/Bird' : e.charAt(0).toUpperCase() + e.slice(1)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator size='large' color='#00ff87' style={{ marginTop: 60 }} />
      ) : (
        <FlatList contentContainerStyle={{ paddingTop: 60, paddingBottom: 90 }}
          data={filteredLeagues}
          keyExtractor={item => item.id}
          renderItem={renderLeagueCard}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🏀</Text>
              <Text style={styles.emptyText}>No leagues found</Text>
            </View>
          }
        />
      )}

      {/* League Detail Modal */}
      <Modal visible={!!selectedLeague} animationType='slide' presentationStyle='pageSheet'>
        {selectedLeague && (
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setSelectedLeague(null)}>
                <Text style={styles.modalClose}>← Back</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{selectedLeague.name}</Text>
              <View style={{ width: 60 }} />
            </View>
            <ScrollView contentContainerStyle={styles.modalContent}>
              {/* League info */}
              <View style={styles.modalInfoCard}>
                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalInfoLabel}>Sport</Text>
                  <Text style={styles.modalInfoValue}>{selectedLeague.sport?.toUpperCase()}</Text>
                </View>
                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalInfoLabel}>Era</Text>
                  <Text style={styles.modalInfoValue}>{ERA_LABELS[selectedLeague.era] || selectedLeague.era}</Text>
                </View>
                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalInfoLabel}>Mode</Text>
                  <Text style={styles.modalInfoValue}>{selectedLeague.mode}</Text>
                </View>
                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalInfoLabel}>Commissioner</Text>
                  <Text style={styles.modalInfoValue}>{selectedLeague.commDisplayName || 'Unknown'}{selectedLeague.commUsername ? ' (@' + selectedLeague.commUsername + ')' : ''}</Text>
                </View>
                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalInfoLabel}>Members</Text>
                  <Text style={styles.modalInfoValue}>{selectedLeague.members?.length || 1} GMs</Text>
                </View>
                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalInfoLabel}>Access</Text>
                  <Text style={[styles.modalInfoValue, { color: privacyColor(selectedLeague) }]}>{privacyLabel(selectedLeague)}</Text>
                </View>
              </View>

              {/* League Rules */}
              {leagueRules ? (
                <View style={styles.rulesSection}>
                  <Text style={styles.rulesSectionTitle}>📋 League Rules</Text>
                  <View style={styles.rulesCard}>
                    {leagueRules.split('\n').filter(l => l.trim()).map((line, i) => (
                      <View key={i} style={styles.ruleRow}>
                        <Text style={styles.ruleNum}>{i + 1}.</Text>
                        <Text style={styles.ruleText}>{line.replace(/^\d+\.\s*/, '')}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : (
                <View style={styles.noRules}>
                  <Text style={styles.noRulesText}>No league rules posted yet</Text>
                </View>
              )}

              {/* Join button */}
              {alreadyMember.has(selectedLeague.id) ? (
                <TouchableOpacity style={styles.viewLeagueBtn} onPress={() => {
                  setSelectedLeague(null);
                  router.push({ pathname: '/screens/league', params: { leagueId: selectedLeague.id } });
                }}>
                  <Text style={styles.viewLeagueBtnText}>View League →</Text>
                </TouchableOpacity>
              ) : alreadyRequested.has(selectedLeague.id) ? (
                <View style={styles.pendingCard}>
                  <Text style={styles.pendingIcon}>⏳</Text>
                  <Text style={styles.pendingText}>Join request pending approval</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.joinBtn, joining && { opacity: 0.6 }]}
                  onPress={() => joinLeague(selectedLeague)}
                  disabled={joining}
                >
                  {joining ? <ActivityIndicator color='#000' /> : (
                    <Text style={styles.joinBtnText}>
                      {selectedLeague.privacy === 'public' ? '🟢 Join League' : '🔒 Request to Join'}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        )}
      </Modal>
      <GlobalNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  backText: { color: '#00ff87', fontSize: 15, fontWeight: '600', width: 60 },
  title: { fontSize: 18, fontWeight: '800', color: '#ffffff' },
  searchInput: { marginHorizontal: 16, marginTop: 12, backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14, color: '#ffffff', fontSize: 15, borderWidth: 1, borderColor: '#2a2a2a' },
  filterRow: { paddingVertical: 12 },
  filterChip: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: '#2a2a2a', backgroundColor: '#1a1a1a' },
  filterChipActive: { backgroundColor: '#0a2a1a', borderColor: '#00ff87' },
  filterChipText: { color: '#666', fontSize: 12, fontWeight: '600' },
  filterChipTextActive: { color: '#00ff87' },
  filterDivider: { width: 1, backgroundColor: '#2a2a2a', marginHorizontal: 4 },
  listContent: { padding: 16, paddingBottom: 100 },
  leagueCard: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#2a2a2a' },
  leagueCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  leagueName: { color: '#ffffff', fontSize: 17, fontWeight: '800', flex: 1, marginRight: 8 },
  privacyBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  privacyText: { fontSize: 11, fontWeight: '700' },
  leagueMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' },
  leagueMetaText: { color: '#888', fontSize: 12 },
  leagueMetaDot: { color: '#444', fontSize: 12 },
  leagueFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  leagueMemberCount: { color: '#666', fontSize: 12 },
  memberBadge: { backgroundColor: '#0a2a1a', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  memberBadgeText: { color: '#00ff87', fontSize: 11, fontWeight: '700' },
  requestedBadge: { backgroundColor: '#2a1a00', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  requestedBadgeText: { color: '#F5A623', fontSize: 11, fontWeight: '700' },
  commRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' },
  commLabel: { color: '#555', fontSize: 11 },
  commName: { color: '#aaa', fontSize: 11, fontWeight: '600' },
  commUsername: { color: '#666', fontSize: 11 },
  tapToView: { color: '#00ff87', fontSize: 12, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyIcon: { fontSize: 48 },
  emptyText: { color: '#555', fontSize: 15 },
  modalContainer: { flex: 1, backgroundColor: '#0a0a0a' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  modalClose: { color: '#00ff87', fontSize: 15, fontWeight: '600' },
  modalTitle: { color: '#ffffff', fontSize: 17, fontWeight: '800', flex: 1, textAlign: 'center' },
  modalContent: { padding: 20, paddingBottom: 60 },
  modalInfoCard: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#2a2a2a', gap: 12 },
  modalInfoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalInfoLabel: { color: '#666', fontSize: 13 },
  modalInfoValue: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  rulesSection: { marginBottom: 20 },
  rulesSectionTitle: { color: '#ffffff', fontSize: 16, fontWeight: '800', marginBottom: 12 },
  rulesCard: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#2a2a2a', gap: 10 },
  ruleRow: { flexDirection: 'row', gap: 10 },
  ruleNum: { color: '#F5A623', fontSize: 14, fontWeight: '800', width: 20 },
  ruleText: { flex: 1, color: '#cccccc', fontSize: 14, lineHeight: 20 },
  noRules: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 20, marginBottom: 20, alignItems: 'center' },
  noRulesText: { color: '#555', fontSize: 14 },
  joinBtn: { backgroundColor: '#00ff87', borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginTop: 8 },
  joinBtnText: { color: '#000', fontSize: 16, fontWeight: '800' },
  viewLeagueBtn: { backgroundColor: '#1a2a1a', borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginTop: 8, borderWidth: 1, borderColor: '#00ff87' },
  viewLeagueBtnText: { color: '#00ff87', fontSize: 16, fontWeight: '700' },
  pendingCard: { backgroundColor: '#1a1a00', borderRadius: 14, padding: 20, alignItems: 'center', gap: 8, marginTop: 8, borderWidth: 1, borderColor: '#F5A623' },
  pendingIcon: { fontSize: 32 },
  pendingText: { color: '#F5A623', fontSize: 14, fontWeight: '600', textAlign: 'center' },
});