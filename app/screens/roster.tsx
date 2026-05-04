import { router, useLocalSearchParams } from 'expo-router';
import { addDoc, arrayUnion, collection, doc, getDoc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useMemo, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';
import GlobalNav from '@/components/GlobalNav';
import PlayerCard from '@/components/PlayerCard';

const POSITIONS = ['ALL', 'PG', 'SG', 'SF', 'PF', 'C', 'G', 'F'];

export default function RosterScreen() {
  const { leagueId, sport, teamId, era } = useLocalSearchParams<{
    leagueId: string; sport: string; teamId: string; era?: string;
  }>();

  const [team, setTeam] = useState<any>(null);
  const [allEraPlayers, setAllEraPlayers] = useState<any[]>([]);
  const [takenPlayerIds, setTakenPlayerIds] = useState<Set<string>>(new Set());
  const [takenPlayerNames, setTakenPlayerNames] = useState<Set<string>>(new Set());
  const [claimedTeamAbbrs, setClaimedTeamAbbrs] = useState<Set<string>>(new Set());
  const [droppedPlayerNames, setDroppedPlayerNames] = useState<Set<string>>(new Set());
  const [myPlayerIds, setMyPlayerIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState('ALL');
  const [activeTab, setActiveTab] = useState<'my_team' | 'free_agents'>('my_team');
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);

  const eraKey = (era && era !== 'null' && era !== '') ? era : 'current';

  useEffect(() => { loadData(); }, [teamId, eraKey]);

  const loadData = async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      const teamSnap = await getDoc(doc(db, 'leagues', leagueId, 'teams', teamId));
      if (teamSnap.exists()) {
        const data = teamSnap.data();
        setTeam(data);
        const players = data.players || [];
        setMyPlayerIds(players.map((p: any) => p.player_id || p));
      }

      const allTeamsSnap = await getDocs(collection(db, 'leagues', leagueId, 'teams'));
      const taken = new Set<string>();
      const takenNames = new Set<string>();
      const claimedAbbrs = new Set<string>();
      allTeamsSnap.docs.forEach(d => {
        const teamData = d.data();
        if (teamData.abbreviation) claimedAbbrs.add(teamData.abbreviation);
        const players = teamData.players || [];
        players.forEach((p: any) => {
          const pid = p.player_id || p;
          if (pid) taken.add(pid);
          if (p.full_name) takenNames.add(p.full_name);
        });
      });
      setTakenPlayerIds(taken);
      setTakenPlayerNames(takenNames);
      setClaimedTeamAbbrs(claimedAbbrs);

      // Load era player pool
      let poolPlayers: any[] = [];
      const poolSnap = await getDoc(doc(db, 'era_player_pools', eraKey));
      if (poolSnap.exists()) {
        poolPlayers = poolSnap.data().players || [];
      } else {
        const sportKey = sport === 'madden' ? 'nfl' : sport === 'mlb' ? 'mlb' : 'nba';
        const rosterSnap = await getDoc(doc(db, 'rosters', sportKey));
        if (rosterSnap.exists()) {
          poolPlayers = rosterSnap.data().players || [];
        }
      }

      // Load league free agents (dropped players + draft classes unlocked by season advancement)
      const freeAgentsSnap = await getDocs(collection(db, 'leagues', leagueId, 'free_agents'));
      const leagueFreeAgents: any[] = [];
      freeAgentsSnap.docs.forEach(d => {
        const players = d.data().players || [];
        leagueFreeAgents.push(...players);
      });

      setAllEraPlayers([...poolPlayers, ...leagueFreeAgents]);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const myTeamPlayers = useMemo(() => {
    if (!team) return [];
    const players = team.players || [];
    if (players.length > 0 && typeof players[0] === 'object') return players;
    return allEraPlayers.filter(p => myPlayerIds.includes(p.player_id));
  }, [team, allEraPlayers, myPlayerIds]);

  const freeAgents = useMemo(() => {
    return allEraPlayers.filter(p => {
      const pid = p.player_id || p.id;
      const matchesSearch = !search || (p.full_name || '').toLowerCase().includes(search.toLowerCase());
      const pos = p.position || '';
      const matchesPos = posFilter === 'ALL' || pos.includes(posFilter);
      // Only show players who have NO team in this era (truly unaffiliated)
      // OR players explicitly on active rosters who were dropped (not on any team)
      const hasNoTeam = !p.team || p.team === '';
      // Also show players who were dropped (on no active roster but had a team)
      const wasDropped = !takenPlayerNames.has(p.full_name || '') && !takenPlayerIds.has(pid) && p.team && droppedPlayerNames.has(p.full_name || '');
      return matchesSearch && matchesPos && (hasNoTeam || wasDropped);
    });
  }, [allEraPlayers, takenPlayerIds, takenPlayerNames, droppedPlayerNames, search, posFilter]);

  const handleAddPlayer = async (player: any) => {
    const pid = player.player_id || player.id;
    if (myPlayerIds.includes(pid)) {
      Alert.alert('Already on roster', player.full_name + ' is already on your team.');
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
        message: 'picked up ' + (player.full_name || player.name),
        createdAt: serverTimestamp(),
      });
      setMyPlayerIds(prev => [...prev, pid]);
      setTakenPlayerIds(prev => new Set([...prev, pid]));
      setTakenPlayerNames(prev => new Set([...prev, player.full_name || '']));
      setTeam((prev: any) => ({ ...prev, players: [...(prev?.players || []), player] }));
      Alert.alert('Added!', (player.full_name || player.name) + ' added to your roster.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleDropPlayer = async (player: any) => {
    Alert.alert('Drop Player', 'Remove ' + (player.full_name || player.name) + ' from your roster?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Drop', style: 'destructive', onPress: async () => {
        try {
          const pid = player.player_id || player.id;
          const newPlayers = (team?.players || []).filter((p: any) => (p.player_id || p.id) !== pid);
          await updateDoc(doc(db, 'leagues', leagueId, 'teams', teamId), { players: newPlayers });
          setMyPlayerIds(prev => prev.filter(id => id !== pid));
          setTakenPlayerIds(prev => { const s = new Set(prev); s.delete(pid); return s; });
          setTakenPlayerNames(prev => { const s = new Set(prev); s.delete(player.full_name || ''); return s; });
          setTeam((prev: any) => ({ ...prev, players: newPlayers }));
          setDroppedPlayerNames(prev => new Set([...prev, player.full_name || '']));
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

  const currentData = activeTab === 'my_team' ? myTeamPlayers : freeAgents;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{team?.name || 'Roster'}</Text>
        <View style={{ width: 60 }} />
      </View>

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
          style={[styles.tab, activeTab === 'free_agents' && styles.tabActive]}
          onPress={() => setActiveTab('free_agents')}
        >
          <Text style={[styles.tabText, activeTab === 'free_agents' && styles.tabTextActive]}>
            Free Agents ({freeAgents.length})
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'free_agents' && (
        <>
          <TextInput
            style={styles.searchInput}
            placeholder='Search free agents...'
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
        data={currentData}
        keyExtractor={(item) => String(item.player_id || item.id)}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {activeTab === 'my_team' ? 'No players on your roster yet.' : 'No free agents available.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const onMyTeam = myPlayerIds.includes(item.player_id || item.id);
          return (
            <TouchableOpacity style={styles.playerCard} onPress={() => setSelectedPlayer(item)} activeOpacity={0.7}>
              <View style={styles.playerAvatar}>
                <Text style={styles.playerAvatarText}>{item.position || '?'}</Text>
              </View>
              <View style={styles.playerInfo}>
                <Text style={styles.playerName}>{item.full_name || item.name}</Text>
                <View style={styles.playerMetaRow}>
                  <Text style={styles.playerMeta}>
                    {[item.position, item.jersey_number ? '#' + item.jersey_number : null, item.age ? 'Age ' + item.age : null].filter(Boolean).join(' · ')}
                  </Text>
                  {item.retirement_year && item.birth_year && item.age && item.age >= (item.retirement_year - item.birth_year - 1) && (
                    <View style={styles.retireBadge}>
                      <Text style={styles.retireBadgeText}>Retiring</Text>
                    </View>
                  )}
                </View>
              </View>
              {activeTab === 'my_team' ? (
                <TouchableOpacity style={styles.dropBtn} onPress={(e) => { e.stopPropagation?.(); handleDropPlayer(item); }}>
                  <Text style={styles.dropBtnText}>Drop</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.addBtn} onPress={(e) => { e.stopPropagation?.(); handleAddPlayer(item); }}>
                  <Text style={styles.addBtnText}>+ Add</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          );
        }}
      />
      <PlayerCard
        player={selectedPlayer}
        era={eraKey}
        leagueId={leagueId}
        teamId={teamId}
        visible={!!selectedPlayer}
        onClose={() => setSelectedPlayer(null)}
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
  tabText: { color: '#666', fontSize: 13, fontWeight: '600' },
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
  playerName: { color: '#ffffff', fontSize: 14, fontWeight: '700', marginBottom: 3 },
  playerMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  playerMeta: { color: '#666', fontSize: 12 },
  addBtn: { backgroundColor: '#00ff87', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  addBtnText: { color: '#000', fontSize: 13, fontWeight: '700' },
  dropBtn: { backgroundColor: '#2a0a0a', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#ff3333' },
  dropBtnText: { color: '#ff3333', fontSize: 13, fontWeight: '700' },
  retireBadge: { backgroundColor: '#2a0a0a', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#ff4444' },
  retireBadgeText: { color: '#ff4444', fontSize: 10, fontWeight: '700' },
});