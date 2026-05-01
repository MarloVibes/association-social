import { router, useLocalSearchParams } from 'expo-router';
import { addDoc, arrayUnion, collection, doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useMemo, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';
import GlobalNav from '@/components/GlobalNav';

const POSITIONS = ['ALL', 'PG', 'SG', 'SF', 'PF', 'C', 'G', 'F'];

export default function RosterScreen() {
  const { leagueId, sport, teamId, era } = useLocalSearchParams<{
    leagueId: string; sport: string; teamId: string; era?: string;
  }>();

  const [team, setTeam] = useState<any>(null);
  const [allPlayers, setAllPlayers] = useState<any[]>([]);
  const [myPlayerIds, setMyPlayerIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState('ALL');
  const [activeTab, setActiveTab] = useState<'my_team' | 'browse'>('my_team');

  const eraKey = (era && era !== 'null' && era !== '') ? era : 'current';

  useEffect(() => { loadData(); }, [teamId, eraKey]);

  const loadData = async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      // Load my team doc from league
      const teamSnap = await getDoc(doc(db, 'leagues', leagueId, 'teams', teamId));
      if (teamSnap.exists()) {
        const data = teamSnap.data();
        setTeam(data);
        // players array contains full player objects
        const players = data.players || [];
        setMyPlayerIds(players.map((p: any) => p.player_id || p));

        // If team already has full player objects use them
        if (players.length > 0 && typeof players[0] === 'object' && players[0].player_id) {
          setAllPlayers(players);
          setLoading(false);
          return;
        }
      }

      // Load era roster for this team to get all available players
      // First find the team doc in era_rosters
      if (eraKey !== 'current') {
        // Get all teams for this era and find matching abbreviation
        const leagueSnap = await getDoc(doc(db, 'leagues', leagueId));
        const leagueData = leagueSnap.data();
        const myTeamSnap = await getDoc(doc(db, 'leagues', leagueId, 'teams', teamId));
        if (myTeamSnap.exists()) {
          const myTeamData = myTeamSnap.data();
          const eraTeamSnap = await getDoc(doc(db, 'era_rosters', eraKey, 'teams', myTeamData.teamId));
          if (eraTeamSnap.exists()) {
            const eraTeam = eraTeamSnap.data();
            setAllPlayers(eraTeam.players || []);
          }
        }
      } else {
        // Current era - load from rosters/{sport}
        const sportKey = sport === 'madden' ? 'nfl' : sport === 'mlb' ? 'mlb' : 'nba';
        const rosterSnap = await getDoc(doc(db, 'rosters', sportKey));
        if (rosterSnap.exists()) {
          setAllPlayers(rosterSnap.data().players || []);
        }
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const filteredPlayers = useMemo(() => {
    return allPlayers.filter(p => {
      const matchesSearch = !search || (p.full_name || p.name || '').toLowerCase().includes(search.toLowerCase());
      const pos = p.position || '';
      const matchesPos = posFilter === 'ALL' || pos.includes(posFilter);
      return matchesSearch && matchesPos;
    });
  }, [allPlayers, search, posFilter]);

  const myTeamPlayers = useMemo(() => {
    if (!team) return [];
    const players = team.players || [];
    if (players.length > 0 && typeof players[0] === 'object') return players;
    return allPlayers.filter(p => myPlayerIds.includes(p.player_id));
  }, [team, allPlayers, myPlayerIds]);

  const handleAddPlayer = async (player: any) => {
    const pid = player.player_id || player.id;
    if (myPlayerIds.includes(pid)) {
      Alert.alert('Already on roster', `${player.full_name || player.name} is already on your team.`);
      return;
    }
    try {
      await updateDoc(doc(db, 'leagues', leagueId, 'teams', teamId), {
        players: arrayUnion(player),
      });
      await addDoc(collection(db, 'leagues', leagueId, 'activity'), {
        type: 'pickup',
        playerName: player.full_name || player.name,
        uid: auth.currentUser?.uid,
        message: `picked up ${player.full_name || player.name}`,
        createdAt: serverTimestamp(),
      });
      setMyPlayerIds(prev => [...prev, pid]);
      setTeam((prev: any) => ({ ...prev, players: [...(prev?.players || []), player] }));
      Alert.alert('Added!', `${player.full_name || player.name} added to your roster.`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleDropPlayer = async (player: any) => {
    Alert.alert('Drop Player', `Remove ${player.full_name || player.name} from your roster?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Drop', style: 'destructive', onPress: async () => {
        try {
          const pid = player.player_id || player.id;
          const newPlayers = (team?.players || []).filter((p: any) => (p.player_id || p.id) !== pid);
          await updateDoc(doc(db, 'leagues', leagueId, 'teams', teamId), { players: newPlayers });
          setMyPlayerIds(prev => prev.filter(id => id !== pid));
          setTeam((prev: any) => ({ ...prev, players: newPlayers }));
        } catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size='large' color='#00ff87' />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{team?.name || 'Roster'}</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'my_team' && styles.tabActive]}
          onPress={() => setActiveTab('my_team')}
        >
          <Text style={[styles.tabText, activeTab === 'my_team' && styles.tabTextActive]}>
            My Team ({myTeamPlayers.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'browse' && styles.tabActive]}
          onPress={() => setActiveTab('browse')}
        >
          <Text style={[styles.tabText, activeTab === 'browse' && styles.tabTextActive]}>
            Browse Players
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'browse' && (
        <>
          <TextInput
            style={styles.searchInput}
            placeholder='Search players...'
            placeholderTextColor='#555'
            value={search}
            onChangeText={setSearch}
          />
          <View style={styles.posFilters}>
            {POSITIONS.map(pos => (
              <TouchableOpacity
                key={pos}
                style={[styles.posBtn, posFilter === pos && styles.posBtnActive]}
                onPress={() => setPosFilter(pos)}
              >
                <Text style={[styles.posBtnText, posFilter === pos && styles.posBtnTextActive]}>{pos}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      <FlatList
        data={activeTab === 'my_team' ? myTeamPlayers : filteredPlayers}
        keyExtractor={(item) => String(item.player_id || item.id)}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {activeTab === 'my_team' ? 'No players on your roster yet.' : 'No players found.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const pid = item.player_id || item.id;
          const onMyTeam = myPlayerIds.includes(pid);
          return (
            <View style={styles.playerCard}>
              <View style={styles.playerAvatar}>
                <Text style={styles.playerAvatarText}>{item.position || '?'}</Text>
              </View>
              <View style={styles.playerInfo}>
                <Text style={styles.playerName}>{item.full_name || item.name}</Text>
                <Text style={styles.playerMeta}>
                  {[item.position, item.jersey_number ? '#' + item.jersey_number : null, item.team || item.team_abbr].filter(Boolean).join(' · ')}
                </Text>
              </View>
              {activeTab === 'my_team' ? (
                <TouchableOpacity style={styles.dropBtn} onPress={() => handleDropPlayer(item)}>
                  <Text style={styles.dropBtnText}>Drop</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.addBtn, onMyTeam && styles.addBtnDisabled]}
                  onPress={() => handleAddPlayer(item)}
                  disabled={onMyTeam}
                >
                  <Text style={[styles.addBtnText, onMyTeam && styles.addBtnTextDisabled]}>
                    {onMyTeam ? 'On Team' : '+ Add'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />
      <GlobalNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  loadingContainer: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  backText: { color: '#00ff87', fontSize: 15, fontWeight: '600', width: 60 },
  title: { fontSize: 17, fontWeight: '700', color: '#ffffff' },
  tabRow: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12, gap: 8 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a' },
  tabActive: { backgroundColor: '#0a2a1a', borderColor: '#00ff87' },
  tabText: { color: '#666', fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: '#00ff87' },
  searchInput: { marginHorizontal: 20, backgroundColor: '#1a1a1a', borderRadius: 10, padding: 12, color: '#ffffff', fontSize: 14, borderWidth: 1, borderColor: '#2a2a2a', marginBottom: 10 },
  posFilters: { flexDirection: 'row', paddingHorizontal: 20, gap: 6, marginBottom: 10, flexWrap: 'wrap' },
  posBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a' },
  posBtnActive: { backgroundColor: '#0a2a1a', borderColor: '#00ff87' },
  posBtnText: { color: '#666', fontSize: 12, fontWeight: '600' },
  posBtnTextActive: { color: '#00ff87' },
  listContent: { paddingHorizontal: 20, paddingBottom: 100 },
  emptyContainer: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: '#555', fontSize: 15 },
  playerCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#2a2a2a', gap: 12 },
  playerAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#2a2a2a', borderWidth: 1, borderColor: '#00ff87', alignItems: 'center', justifyContent: 'center' },
  playerAvatarText: { color: '#00ff87', fontSize: 11, fontWeight: '700' },
  playerInfo: { flex: 1 },
  playerName: { color: '#ffffff', fontSize: 14, fontWeight: '700', marginBottom: 2 },
  playerMeta: { color: '#666', fontSize: 12 },
  addBtn: { backgroundColor: '#00ff87', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  addBtnDisabled: { backgroundColor: '#1a2a1a', borderWidth: 1, borderColor: '#2a4a2a' },
  addBtnText: { color: '#000', fontSize: 13, fontWeight: '700' },
  addBtnTextDisabled: { color: '#4a8a4a' },
  dropBtn: { backgroundColor: '#2a0a0a', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#ff3333' },
  dropBtnText: { color: '#ff3333', fontSize: 13, fontWeight: '700' },
});