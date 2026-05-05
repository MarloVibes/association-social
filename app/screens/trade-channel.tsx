import { router, useLocalSearchParams } from 'expo-router';
import { addDoc, collection, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, updateDoc, getDoc, writeBatch } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';
import GlobalNav from '@/components/GlobalNav';

function getPlaystyle(player: any): { label: string; color: string } {
  const ppg = parseFloat(player?.ppg) || 0;
  const apg = parseFloat(player?.apg) || 0;
  const rpg = parseFloat(player?.rpg) || 0;
  const spg = parseFloat(player?.spg) || 0;
  const bpg = parseFloat(player?.bpg) || 0;
  const fg3 = parseFloat(player?.fg3_pct) || 0;
  const pos = player?.position || '';

  // Check accolades for Hall of Fame or jersey retirement
  const accolades = player?.accolades || [];
  const isLegend = accolades.some((a: string) => {
    const t = a.toLowerCase();
    return t.includes('hall of fame') || t.includes('retired') || t.includes('jersey') || t.includes('50 greatest') || t.includes('75th anniversary');
  });
  if (isLegend) return { label: 'LEGEND', color: '#ff00ff' };

  // Fallback: check retirement year as proxy for career significance
  const retiredYear = player?.retirement_year;
  const birthYear = player?.birth_year;
  const seasons = retiredYear && birthYear ? retiredYear - birthYear - 18 : 0;
  if (seasons >= 15 && ppg >= 18) return { label: 'LEGEND', color: '#ff00ff' };

  if (ppg >= 25) return { label: 'SUPERSTAR', color: '#FFD700' };
  if (ppg >= 20) return { label: 'STAR', color: '#FFA500' };
  if (apg >= 7) return { label: 'PLAYMAKER', color: '#00ccff' };
  if (rpg >= 10) return { label: 'REBOUNDER', color: '#aa44ff' };
  if (bpg >= 2) return { label: 'SHOT BLOCKER', color: '#ff6644' };
  if (spg >= 2) return { label: 'LOCKDOWN', color: '#ff4444' };
  if (fg3 >= 0.38 && (pos.includes('SF') || pos.includes('SG') || pos.includes('PF'))) return { label: '3&D', color: '#00ff87' };
  if (fg3 >= 0.38) return { label: 'SHARPSHOOTER', color: '#44ffaa' };
  if (ppg >= 15 && (spg >= 1.2 || bpg >= 1.2)) return { label: 'TWO-WAY', color: '#88ff44' };
  if (pos.includes('C') || pos.includes('PF')) return { label: 'INTERIOR', color: '#aa88ff' };
  if (pos.includes('PG')) return { label: 'FLOOR GENERAL', color: '#44aaff' };
  return { label: 'ROLE PLAYER', color: '#888888' };
}

function PlaystyleBadge({ player }: { player: any }) {
  const style = getPlaystyle(player);
  return (
    <View style={[badgeStyles.badge, { borderColor: style.color + '88' }]}>
      <Text style={[badgeStyles.badgeText, { color: style.color }]}>{style.label}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: { borderRadius: 4, borderWidth: 1, paddingHorizontal: 4, paddingVertical: 1, alignSelf: 'flex-start', marginTop: 2 },
  badgeText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
});

function PlayerSlot({ player, onPress, empty, style }: { player?: any; onPress?: () => void; empty?: boolean; style?: any }) {
  if (empty) {
    return (
      <TouchableOpacity style={[styles.playerSlot, styles.playerSlotEmpty, style]} onPress={onPress}>
        <Text style={styles.addItemText}>+ ADD PLAYER</Text>
      </TouchableOpacity>
    );
  }
  const brefId = player?.bref_id || player?.player_id?.split('_').slice(2).join('_') || '';
  return (
    <TouchableOpacity style={[styles.playerSlot, style]} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.playerSlotInner}>
        {brefId ? (
          <Image
            source={{ uri: 'https://www.basketball-reference.com/req/202106291/images/headshots/' + brefId + '.jpg' }}
            style={styles.playerSlotPhoto}
          />
        ) : (
          <View style={styles.playerSlotPhotoPlaceholder}>
            <Text style={styles.playerSlotInitial}>{(player?.full_name || '?')[0]}</Text>
          </View>
        )}
        <View style={styles.playerSlotInfo}>
          <Text style={styles.playerSlotPos}>{player?.position || '?'}</Text>
          <Text style={styles.playerSlotName} numberOfLines={1}>{player?.full_name}</Text>
          <PlaystyleBadge player={player} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function TradeChannelScreen() {
  const { leagueId, channelId } = useLocalSearchParams<{ leagueId: string; channelId: string }>();
  const [activeTab, setActiveTab] = useState<'block' | 'available'>('block');
  const [myTeam, setMyTeam] = useState<any>(null);
  const [myTeamId, setMyTeamId] = useState('');
  const [myRoster, setMyRoster] = useState<any[]>([]);
  const [tradeBlock, setTradeBlock] = useState<string[]>([]);
  const [untouchables, setUntouchables] = useState<string[]>([]);
  const [allTeams, setAllTeams] = useState<any[]>([]);
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [proposeModal, setProposeModal] = useState<any>(null);
  const [selectedOffers, setSelectedOffers] = useState<any[]>([]);
  const [rosterModal, setRosterModal] = useState<'block' | 'untouchable' | 'list' | null>(null);
  const user = auth.currentUser;

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const q = query(
      collection(db, 'leagues', leagueId, 'channels', 'trade-talk', 'messages'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, snap => {
      setListings(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((m: any) => m.type === 'trade_listing' && m.status === 'available'));
    });
    return () => unsub();
  }, [leagueId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const teamsSnap = await getDocs(collection(db, 'leagues', leagueId, 'teams'));
      const teams = teamsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAllTeams(teams);
      // Note: allTeams are used for tradeBlock display - they get enriched inline
      const mine = teams.find((t: any) => t.gmId === user?.uid);
      if (mine) {
        setMyTeam(mine);
        setMyTeamId(mine.id);
        setTradeBlock(mine.tradeBlock || []);
        setUntouchables(mine.untouchables || []);

        // Load era stats to enrich players with ppg/rpg/apg etc
        const eraKey = mine.era || 'current';
        const statsSnap = await getDoc(doc(db, 'era_stats', eraKey));
        const statsMap: Record<string, any> = {};
        if (statsSnap.exists()) {
          (statsSnap.data().players || []).forEach((p: any) => {
            statsMap[p.name] = p;
          });
        }

        const enrichedRoster = (mine.players || []).map((p: any) => ({
          ...p,
          ...(statsMap[p.full_name] || {}),
        }));
        setMyRoster(enrichedRoster);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const getPlayerById = (pid: string) => myRoster.find((p: any) => (p.player_id || p.full_name) === pid);

  const toggleUntouchable = async (pid: string) => {
    const newList = untouchables.includes(pid) ? untouchables.filter(p => p !== pid) : [...untouchables, pid];
    setUntouchables(newList);
    await updateDoc(doc(db, 'leagues', leagueId, 'teams', myTeamId), { untouchables: newList });
  };

  const handleProposeTrade = async () => {
    if (!proposeModal || selectedOffers.length === 0) {
      Alert.alert('Select players to offer');
      return;
    }
    try {
      await addDoc(collection(db, 'leagues', leagueId, 'trade_proposals'), {
        fromUid: user?.uid,
        fromTeamId: myTeamId,
        fromTeamName: myTeam?.name,
        toUid: proposeModal.fromUid || proposeModal.gmId,
        toTeamId: proposeModal.fromTeamId || proposeModal.teamId,
        toTeamName: proposeModal.fromTeamName || proposeModal.teamName,
        offeredPlayers: selectedOffers,
        requestedPlayer: proposeModal.player || proposeModal,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'users', proposeModal.fromUid || proposeModal.gmId), {
        notifications: [{ type: 'trade_proposal', leagueId, fromName: myTeam?.name, playerName: (proposeModal.player || proposeModal)?.full_name, createdAt: new Date().toISOString() }],
      });
      Alert.alert('Trade Proposed!', 'Your offer has been sent.');
      setProposeModal(null);
      setSelectedOffers([]);
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const tradeBlockPlayers = tradeBlock.map(pid => getPlayerById(pid)).filter(Boolean);
  const untouchablePlayers = untouchables.map(pid => getPlayerById(pid)).filter(Boolean);
  const allTradeBlockAcrossLeague = allTeams.flatMap((t: any) => {
    const tb = t.tradeBlock || [];
    return (t.players || []).filter((p: any) => tb.includes(p.player_id || p.full_name)).map((p: any) => ({ ...p, teamName: t.name, teamId: t.id, gmId: t.gmId }));
  });

  if (loading) return <View style={styles.container}><ActivityIndicator size='large' color='#00ff87' style={{ marginTop: 100 }} /></View>;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>🔁 Trade Center</Text>
        <Text style={styles.teamName}>{myTeam?.name || ''}</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tab, activeTab === 'block' && styles.tabActive]} onPress={() => setActiveTab('block')}>
          <Text style={[styles.tabText, activeTab === 'block' && styles.tabTextActive]}>MY TRADE BLOCK</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'available' && styles.tabActive]} onPress={() => setActiveTab('available')}>
          <Text style={[styles.tabText, activeTab === 'available' && styles.tabTextActive]}>AVAILABLE ({listings.length + allTradeBlockAcrossLeague.filter((p: any) => p.gmId !== user?.uid).length})</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'block' ? (
        <ScrollView contentContainerStyle={styles.blockContent}>
          {/* 3 Column Layout */}
          <View style={styles.threeCol}>
            {/* Trading Block */}
            <View style={styles.col}>
              <Text style={styles.colTitle}>TRADING BLOCK</Text>
              {[0,1,2,3,4,5].map(i => {
                const p = tradeBlockPlayers[i];
                return p
                  ? <PlayerSlot key={i} player={p} onPress={() => setRosterModal('block')} style={styles.blockSlot} />
                  : <PlayerSlot key={i} empty onPress={() => setRosterModal('block')} />;
              })}
            </View>
            {/* Interested In (listings you posted) */}
            <View style={styles.col}>
              <Text style={styles.colTitle}>LISTED FOR TRADE</Text>
              {[0,1,2,3,4,5].map(i => {
                const myListings = listings.filter((l: any) => l.fromUid === user?.uid);
                const l = myListings[i];
                return l ? (
                  <PlayerSlot key={i} player={l.player} onPress={() =>
                    Alert.alert('Remove listing?', l.player?.full_name, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: async () => {
                        await updateDoc(doc(db, 'leagues', leagueId, 'channels', 'trade-talk', 'messages', l.id), { status: 'cancelled' });
                      }},
                    ])
                  } />
                ) : (
                  <PlayerSlot key={i} empty onPress={() => setRosterModal('list')} />
                );
              })}
            </View>
            {/* Untouchables */}
            <View style={styles.col}>
              <Text style={styles.colTitle}>UNTOUCHABLES</Text>
              {[0,1,2,3,4,5].map(i => {
                const p = untouchablePlayers[i];
                return p
                  ? <PlayerSlot key={i} player={p} style={styles.untouchableSlot} onPress={() => setRosterModal('untouchable')} />
                  : <PlayerSlot key={i} empty onPress={() => setRosterModal('untouchable')} />;
              })}
            </View>
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.availableContent}>
          {/* Trade Listings from other GMs */}
          {listings.filter((l: any) => l.fromUid !== user?.uid).map((item: any) => (
            <View key={item.id} style={styles.listingCard}>
              <Text style={styles.listingTeam}>{item.fromTeamName}</Text>
              <View style={styles.listingRow}>
                <PlayerSlot player={item.player} style={{ flex: 1 }} />
                <View style={styles.listingBtns}>
                  <TouchableOpacity style={styles.proposeBtn} onPress={() => { setProposeModal(item); setSelectedOffers([]); }}>
                    <Text style={styles.proposeBtnText}>🤝 Propose</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.dmBtn} onPress={() => router.push({ pathname: '/screens/dm', params: { uid: item.fromUid, name: item.fromTeamName } })}>
                    <Text style={styles.dmBtnText}>💬 DM</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
          {/* Trade Block from other teams */}
          {allTradeBlockAcrossLeague.filter((p: any) => p.gmId !== user?.uid).map((item: any, i: number) => (
            <View key={i} style={styles.listingCard}>
              <Text style={styles.listingTeam}>{item.teamName} · Trade Block</Text>
              <View style={styles.listingRow}>
                <PlayerSlot player={item} style={{ flex: 1 }} />
                <View style={styles.listingBtns}>
                  <TouchableOpacity style={styles.proposeBtn} onPress={() => { setProposeModal({ ...item, fromUid: item.gmId, fromTeamId: item.teamId, fromTeamName: item.teamName }); setSelectedOffers([]); }}>
                    <Text style={styles.proposeBtnText}>🤝 Offer</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.dmBtn} onPress={() => router.push({ pathname: '/screens/dm', params: { uid: item.gmId, name: item.teamName } })}>
                    <Text style={styles.dmBtnText}>💬 DM</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
          {listings.filter((l: any) => l.fromUid !== user?.uid).length === 0 && allTradeBlockAcrossLeague.filter((p: any) => p.gmId !== user?.uid).length === 0 && (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📢</Text>
              <Text style={styles.emptyText}>No players available for trade yet</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Roster Picker Modal for Trade Block / Untouchables */}
      <Modal visible={!!rosterModal} animationType='slide' presentationStyle='pageSheet'>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setRosterModal(null)}>
              <Text style={styles.modalCancel}>Done</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{rosterModal === 'block' ? 'Set Trade Block' : rosterModal === 'list' ? 'List for Trade' : 'Set Untouchables'}</Text>
            <View style={{ width: 50 }} />
          </View>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalHint}>Tap players to toggle them {rosterModal === 'block' ? 'on/off trade block' : rosterModal === 'list' ? 'on/off the trade listing' : 'as untouchable'}</Text>
            {myRoster.map((p: any, i: number) => {
              const pid = p.player_id || p.full_name;
              const isSelected = rosterModal === 'block' ? tradeBlock.includes(pid) : rosterModal === 'list' ? listings.some((l: any) => l.fromUid === user?.uid && (l.player?.player_id || l.player?.full_name) === pid && l.status === 'available') : untouchables.includes(pid);
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.rosterRow, isSelected && (rosterModal === 'block' ? styles.rosterRowBlock : rosterModal === 'list' ? styles.rosterRowBlock : styles.rosterRowUntouchable)]}
                  onPress={async () => {
                    if (rosterModal === 'block') {
                      const newList = tradeBlock.includes(pid) ? tradeBlock.filter(x => x !== pid) : [...tradeBlock, pid];
                      setTradeBlock(newList);
                      await updateDoc(doc(db, 'leagues', leagueId, 'teams', myTeamId), { tradeBlock: newList });
                    } else if (rosterModal === 'list') {
                      // Post or remove from trade channel
                      const existing = listings.find((l: any) => l.fromUid === user?.uid && (l.player?.player_id || l.player?.full_name) === pid);
                      if (existing) {
                        await updateDoc(doc(db, 'leagues', leagueId, 'channels', 'trade-talk', 'messages', existing.id), { status: 'cancelled' });
                      } else {
                        await addDoc(collection(db, 'leagues', leagueId, 'channels', 'trade-talk', 'messages'), {
                          type: 'trade_listing',
                          player: p,
                          fromUid: user?.uid,
                          fromTeamId: myTeamId,
                          fromTeamName: myTeam?.name || '',
                          createdAt: serverTimestamp(),
                          status: 'available',
                        });
                      }
                    } else {
                      toggleUntouchable(pid);
                    }
                  }}
                >
                  <Text style={styles.rosterRowPos}>{p.position}</Text>
                  <Text style={styles.rosterRowName}>{p.full_name}</Text>
                  <PlaystyleBadge player={p} />
                  {isSelected && <Text style={styles.rosterCheck}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

      {/* Propose Trade Modal */}
      <Modal visible={!!proposeModal} animationType='slide' presentationStyle='pageSheet'>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => { setProposeModal(null); setSelectedOffers([]); }}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Propose Trade</Text>
            <TouchableOpacity onPress={handleProposeTrade}>
              <Text style={styles.modalSend}>Send</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalLabel}>YOU WANT</Text>
            <View style={styles.wantCard}>
              <Text style={styles.wantName}>{(proposeModal?.player || proposeModal)?.full_name}</Text>
              <Text style={styles.wantTeam}>{proposeModal?.fromTeamName || proposeModal?.teamName}</Text>
            </View>
            <Text style={styles.modalLabel}>YOU OFFER (select from your roster)</Text>
            {myRoster.map((p: any, i: number) => {
              const selected = selectedOffers.some(o => (o.player_id || o.full_name) === (p.player_id || p.full_name));
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.offerRow, selected && styles.offerRowSelected]}
                  onPress={() => selected
                    ? setSelectedOffers(prev => prev.filter(o => (o.player_id || o.full_name) !== (p.player_id || p.full_name)))
                    : setSelectedOffers(prev => [...prev, p])
                  }
                >
                  <Text style={styles.offerPos}>{p.position}</Text>
                  <Text style={styles.offerName}>{p.full_name}</Text>
                  <PlaystyleBadge player={p} />
                  {selected && <Text style={styles.offerCheck}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

      <GlobalNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 10, backgroundColor: '#111', borderBottomWidth: 1, borderBottomColor: '#222' },
  backText: { color: '#00ff87', fontSize: 14, fontWeight: '600', width: 50 },
  title: { fontSize: 16, fontWeight: '900', color: '#fff', letterSpacing: 1 },
  teamName: { color: '#888', fontSize: 11, width: 80, textAlign: 'right' },
  tabRow: { flexDirection: 'row', backgroundColor: '#111', borderBottomWidth: 1, borderBottomColor: '#222' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#00ff87' },
  tabText: { color: '#555', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  tabTextActive: { color: '#00ff87' },
  blockContent: { padding: 12, paddingBottom: 100 },
  threeCol: { flexDirection: 'row', gap: 8 },
  col: { flex: 1, gap: 6 },
  colTitle: { color: '#888', fontSize: 9, fontWeight: '800', letterSpacing: 1, textAlign: 'center', marginBottom: 4, textTransform: 'uppercase' },
  playerSlot: { backgroundColor: '#1a1a1a', borderRadius: 8, borderWidth: 1, borderColor: '#2a2a2a', overflow: 'hidden', marginBottom: 4 },
  playerSlotEmpty: { borderStyle: 'dashed', borderColor: '#333', alignItems: 'center', justifyContent: 'center', height: 72 },
  addItemText: { color: '#333', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  playerSlotInner: { flexDirection: 'row', alignItems: 'center', padding: 6, gap: 6 },
  playerSlotPhoto: { width: 44, height: 44, borderRadius: 4, backgroundColor: '#111' },
  playerSlotPhotoPlaceholder: { width: 44, height: 44, borderRadius: 4, backgroundColor: '#1a1a2a', alignItems: 'center', justifyContent: 'center' },
  playerSlotInitial: { color: '#8888ff', fontSize: 18, fontWeight: '800' },
  playerSlotInfo: { flex: 1 },
  playerSlotPos: { color: '#888', fontSize: 8, fontWeight: '700', letterSpacing: 1 },
  playerSlotName: { color: '#fff', fontSize: 10, fontWeight: '700', marginBottom: 2 },

  untouchableSlot: { borderColor: '#ff4444', backgroundColor: '#1a0a0a' },
  availableContent: { padding: 16, paddingBottom: 100 },
  listingCard: { backgroundColor: '#111', borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#222' },
  listingTeam: { color: '#888', fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  listingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  listingBtns: { gap: 6 },
  proposeBtn: { backgroundColor: '#0a2a1a', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: '#00ff87', alignItems: 'center' },
  proposeBtnText: { color: '#00ff87', fontSize: 11, fontWeight: '700' },
  dmBtn: { backgroundColor: '#1a1a2a', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: '#4444ff', alignItems: 'center' },
  dmBtnText: { color: '#8888ff', fontSize: 11, fontWeight: '700' },
  emptyContainer: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyIcon: { fontSize: 48 },
  emptyText: { color: '#444', fontSize: 14 },
  modalContainer: { flex: 1, backgroundColor: '#0a0a0a' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 56, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  modalCancel: { color: '#ff4444', fontSize: 14, fontWeight: '600' },
  modalTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  modalSend: { color: '#00ff87', fontSize: 14, fontWeight: '700' },
  modalContent: { padding: 20, paddingBottom: 60 },
  modalHint: { color: '#666', fontSize: 12, marginBottom: 16 },
  modalLabel: { color: '#888', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 8, marginTop: 16 },
  wantCard: { backgroundColor: '#1a1a1a', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#00ff87' },
  wantName: { color: '#fff', fontSize: 16, fontWeight: '800' },
  wantTeam: { color: '#666', fontSize: 12, marginTop: 2 },
  rosterRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: '#2a2a2a', gap: 8 },
  rosterRowBlock: { borderColor: '#00ff87', backgroundColor: '#0a2a1a' },
  rosterRowUntouchable: { borderColor: '#ff4444', backgroundColor: '#2a0a0a' },
  rosterRowPos: { color: '#888', fontSize: 11, fontWeight: '700', width: 28 },
  rosterRowName: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },
  rosterCheck: { color: '#00ff87', fontSize: 16, fontWeight: '700' },
  offerRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: '#2a2a2a', gap: 8 },
  offerRowSelected: { borderColor: '#00ff87', backgroundColor: '#0a2a1a' },
  offerPos: { color: '#888', fontSize: 11, fontWeight: '700', width: 28 },
  offerName: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },
  offerCheck: { color: '#00ff87', fontSize: 16, fontWeight: '700' },
});