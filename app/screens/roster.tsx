import { router, useLocalSearchParams } from 'expo-router';
import { doc, getDoc, updateDoc, arrayUnion, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import { auth, db } from '@/constants/firebase';
import GlobalNav from '@/components/GlobalNav';

const POSITIONS: Record<string, string[]> = {
  nfl: ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DE', 'DT', 'LB', 'CB', 'S'],
  nba: ['ALL', 'PG', 'SG', 'SF', 'PF', 'C', 'G', 'F'],
  mlb: ['ALL', 'LEGEND'],
};

export default function RosterScreen() {
  const { leagueId, sport, teamId } = useLocalSearchParams<{
    leagueId: string;
    sport: string;
    teamId: string;
  }>();

  const [players, setPlayers] = useState<any[]>([]);
  const [myPlayers, setMyPlayers] = useState<string[]>([]);
  const [tradeBlock, setTradeBlock] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState('ALL');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const sportKey = (sport as string)?.toLowerCase() === 'madden' ? 'nfl' : (sport as string)?.toLowerCase();

  useEffect(() => {
    const load = async () => {
      try {
        // Load roster from Firestore
        const rosterSnap = await getDoc(doc(db, 'rosters', sportKey));
        if (rosterSnap.exists()) {
          setPlayers(rosterSnap.data().players || []);
        }

        // Load team data to get owned players and trade block
        if (teamId) {
          const teamSnap = await getDoc(doc(db, 'leagues', leagueId, 'teams', teamId));
          if (teamSnap.exists()) {
            setMyPlayers(teamSnap.data().players || []);
            setTradeBlock(teamSnap.data().tradeBlock || []);
          }
        }
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    };
    load();
  }, [leagueId, sportKey, teamId]);

  const filtered = useMemo(() => {
    return players.filter(p => {
      const matchesSearch = !search || p.full_name?.toLowerCase().includes(search.toLowerCase());
      const matchesPos = posFilter === 'ALL' || p.position === posFilter;
      return matchesSearch && matchesPos;
    });
  }, [players, search, posFilter]);

  const handleAddToRoster = async (player: any) => {
    const user = auth.currentUser;
    if (!user || !teamId) return;

    if (myPlayers.includes(player.player_id)) {
      Alert.alert('Already on roster', `${player.full_name} is already on your team.`);
      return;
    }

    setActionLoading(player.player_id);
    try {
      // Add to team roster
      await updateDoc(doc(db, 'leagues', leagueId, 'teams', teamId), {
        players: arrayUnion(player.player_id),
      });

      // Log activity
      await addDoc(collection(db, 'leagues', leagueId, 'activity'), {
        type: 'pickup',
        playerId: player.player_id,
        playerName: player.full_name,
        playerPosition: player.position,
        playerTeam: player.team,
        uid: user.uid,
        message: `picked up ${player.full_name} (${player.position})`,
        createdAt: serverTimestamp(),
      });

      setMyPlayers(prev => [...prev, player.player_id]);
      Alert.alert('Added!', `${player.full_name} has been added to your roster.`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setActionLoading(null);
  };

  const handleTradeBlock = async (player: any) => {
    const user = auth.currentUser;
    if (!user || !teamId) return;

    if (!myPlayers.includes(player.player_id)) {
      Alert.alert('Not on roster', 'You can only put your own players on the trade block.');
      return;
    }

    const isOnBlock = tradeBlock.includes(player.player_id);
    setActionLoading(player.player_id + '_trade');

    try {
      const teamRef = doc(db, 'leagues', leagueId, 'teams', teamId);
      if (isOnBlock) {
        // Remove from trade block
        const teamSnap = await getDoc(teamRef);
        const current = teamSnap.data()?.tradeBlock || [];
        await updateDoc(teamRef, {
          tradeBlock: current.filter((id: string) => id !== player.player_id),
        });
        setTradeBlock(prev => prev.filter(id => id !== player.player_id));
      } else {
        // Add to trade block
        await updateDoc(teamRef, {
          tradeBlock: arrayUnion(player.player_id),
        });

        // Log activity
        await addDoc(collection(db, 'leagues', leagueId, 'activity'), {
          type: 'tradeblock',
          playerId: player.player_id,
          playerName: player.full_name,
          playerPosition: player.position,
          uid: user.uid,
          message: `put ${player.full_name} on the trade block`,
          createdAt: serverTimestamp(),
        });

        setTradeBlock(prev => [...prev, player.player_id]);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setActionLoading(null);
  };

  const renderPlayer = ({ item }: { item: any }) => {
    const isOwned = myPlayers.includes(item.player_id);
    const isOnBlock = tradeBlock.includes(item.player_id);
    const isLoading = actionLoading === item.player_id;
    const isTradeLoading = actionLoading === item.player_id + '_trade';

    return (
      <View style={[styles.playerCard, isOwned && styles.playerCardOwned]}>
        <View style={styles.playerLeft}>
          <View style={styles.photoContainer}>
            <Image
              source={{ uri: item.photo_url }}
              style={styles.playerPhoto}
              defaultSource={require('@/assets/images/icon.png')}
            />
            {item.is_legend && (
              <View style={styles.legendBadge}>
                <Text style={styles.legendBadgeText}>LEGEND</Text>
              </View>
            )}
          </View>
          <View style={styles.playerInfo}>
            <View style={styles.playerNameRow}>
              <Text style={styles.playerName}>{item.full_name}</Text>
              {isOwned && <View style={styles.ownedDot} />}
            </View>
            <View style={styles.playerMetaRow}>
              <View style={styles.posBadge}>
                <Text style={styles.posBadgeText}>{item.position}</Text>
              </View>
              <Text style={styles.playerTeam}>{item.team !== 'LEGEND' ? item.team : 'Classic'}</Text>
            </View>
            <Text style={styles.playerStats}>
              {[item.height && `${item.height}"`, item.age && `Age ${item.age}`, item.weight && `${item.weight}lbs`]
                .filter(Boolean).join('  ·  ')}
            </Text>
            {item.injury_status && (
              <View style={styles.injuryBadge}>
                <Text style={styles.injuryText}>{item.injury_status}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.playerActions}>
          {isOwned ? (
            <TouchableOpacity
              style={[styles.tradeBlockBtn, isOnBlock && styles.tradeBlockBtnActive]}
              onPress={() => handleTradeBlock(item)}
              disabled={!!isTradeLoading}
            >
              {isTradeLoading
                ? <ActivityIndicator size="small" color="#00ff87" />
                : <Text style={[styles.tradeBlockBtnText, isOnBlock && styles.tradeBlockBtnTextActive]}>
                    {isOnBlock ? 'On Block' : 'Trade Block'}
                  </Text>
              }
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => handleAddToRoster(item)}
              disabled={!!isLoading}
            >
              {isLoading
                ? <ActivityIndicator size="small" color="#000" />
                : <Text style={styles.addBtnText}>+ Add</Text>
              }
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00ff87" />
        <Text style={styles.loadingText}>Loading roster...</Text>
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
        <Text style={styles.headerTitle}>Player Roster</Text>
        <Text style={styles.headerCount}>{filtered.length} players</Text>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search players..."
          placeholderTextColor="#555"
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
      </View>

      {/* Position Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
      >
        {(POSITIONS[sportKey] || POSITIONS.nfl).map(pos => (
          <TouchableOpacity
            key={pos}
            style={[styles.filterChip, posFilter === pos && styles.filterChipActive]}
            onPress={() => setPosFilter(pos)}
          >
            <Text style={[styles.filterChipText, posFilter === pos && styles.filterChipTextActive]}>
              {pos}
            </Text>
          </TouchableOpacity>
        ))}
            <GlobalNav />
    </ScrollView>

      {/* Player List */}
      <FlatList
        data={filtered}
        keyExtractor={item => item.player_id}
        renderItem={renderPlayer}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No players found</Text>
          </View>
        }
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={5}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  loadingContainer: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#888', fontSize: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 },
  backText: { color: '#00ff87', fontSize: 15, fontWeight: '600' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#ffffff' },
  headerCount: { fontSize: 13, color: '#555' },
  searchContainer: { paddingHorizontal: 20, marginBottom: 12 },
  searchInput: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14, color: '#ffffff', fontSize: 15, borderWidth: 1, borderColor: '#2a2a2a' },
  filterScroll: { maxHeight: 44, marginBottom: 12 },
  filterRow: { paddingHorizontal: 20, gap: 8 },
  filterChip: { backgroundColor: '#1a1a1a', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#2a2a2a' },
  filterChipActive: { backgroundColor: '#0a2a1a', borderColor: '#00ff87' },
  filterChipText: { color: '#888', fontSize: 13, fontWeight: '600' },
  filterChipTextActive: { color: '#00ff87' },
  listContent: { paddingHorizontal: 20, paddingBottom: 40 },
  playerCard: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#2a2a2a', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  playerCardOwned: { borderColor: '#005533', backgroundColor: '#0a1a0f' },
  playerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  photoContainer: { position: 'relative' },
  playerPhoto: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#2a2a2a' },
  legendBadge: { position: 'absolute', bottom: -4, left: 0, right: 0, backgroundColor: '#FFD700', borderRadius: 4, alignItems: 'center' },
  legendBadgeText: { fontSize: 8, fontWeight: '800', color: '#000', letterSpacing: 0.5 },
  playerInfo: { flex: 1 },
  playerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  playerName: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
  ownedDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#00ff87' },
  playerMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  posBadge: { backgroundColor: '#2a2a2a', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  posBadgeText: { color: '#aaa', fontSize: 11, fontWeight: '700' },
  playerTeam: { color: '#666', fontSize: 13 },
  playerStats: { color: '#555', fontSize: 12 },
  injuryBadge: { backgroundColor: '#2a0a0a', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', marginTop: 3 },
  injuryText: { color: '#ff6666', fontSize: 11, fontWeight: '600' },
  playerActions: { marginLeft: 8 },
  addBtn: { backgroundColor: '#00ff87', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText: { color: '#000', fontSize: 13, fontWeight: '700' },
  tradeBlockBtn: { backgroundColor: '#1a1a1a', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: '#333' },
  tradeBlockBtnActive: { borderColor: '#ff9900', backgroundColor: '#1a1200' },
  tradeBlockBtnText: { color: '#666', fontSize: 12, fontWeight: '600' },
  tradeBlockBtnTextActive: { color: '#ff9900' },
  emptyContainer: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: '#555', fontSize: 15 },
});
