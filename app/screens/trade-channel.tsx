import { router, useLocalSearchParams } from 'expo-router';
import PlayerCard, { leagueDateFromRecord } from '@/components/PlayerCard';
import FranchisePlayerRow, { formatFranchisePlayerMoney } from '@/components/FranchisePlayerRow';
import PlayerHeadshot from '@/components/PlayerHeadshot';
import { getSportArchetypeForYear } from '@/constants/sportArchetype';
import { addDoc, collection, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, getDoc, where, arrayUnion } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';
import GlobalNav from '@/components/GlobalNav';
import { getPositionFilters } from '@/domain/sports/playerFields';
import { compareRosterPlayersByValue, matchesRosterPosition } from '@/domain/nba/rotation';
import { selectRosterRatingProfile } from '@/domain/nba/rosterProfile';
import { displayScheduleTeamLabel } from '@/domain/nba/scheduleView';
import { isTradeRoomExpired } from '@/domain/tradeRoomExpiry';


function PlaystyleBadge({
  player,
  eraKey,
  sport,
  currentYear,
  leagueDate,
}: {
  player: any;
  eraKey?: string;
  sport?: string;
  currentYear?: number | string | null;
  leagueDate?: string | Date | null;
}) {
  const profile = selectRosterRatingProfile(player, {}, { era: eraKey, currentYear, leagueDate });
  const year = typeof currentYear === 'number' ? currentYear : Number(currentYear) || undefined;
  const style = getSportArchetypeForYear(player, profile, year, sport);
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

function PlayerSlot({ player, onPress, empty, style, eraKey, sport, currentYear, leagueDate }: { player?: any; onPress?: () => void; empty?: boolean; style?: any; eraKey?: string; sport?: string; currentYear?: number | string | null; leagueDate?: string | Date | null }) {
  if (empty) {
    return (
      <TouchableOpacity style={[styles.playerSlot, styles.playerSlotEmpty, style]} onPress={onPress}>
        <Text style={styles.addItemText}>+ ADD PLAYER</Text>
      </TouchableOpacity>
    );
  }
  const fallback = (
    <View style={styles.playerSlotPhotoPlaceholder}>
      <Text style={styles.playerSlotInitial}>{(player?.full_name || '?')[0]}</Text>
    </View>
  );
  return (
    <TouchableOpacity style={[styles.playerSlot, style]} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.playerSlotInner}>
        <PlayerHeadshot player={player} sport={sport} imageStyle={styles.playerSlotPhoto} fallback={fallback} />
        <View style={styles.playerSlotInfo}>
          <Text style={styles.playerSlotPos}>{player?.position || '?'}</Text>
          <Text style={styles.playerSlotName} numberOfLines={1}>{player?.full_name}</Text>
          <PlaystyleBadge player={player} eraKey={eraKey} sport={sport} currentYear={currentYear} leagueDate={leagueDate} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function TradeChannelScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string; channelId: string }>();
  const [activeTab, setActiveTab] = useState<'block' | 'available' | 'propose'>('block');
  const [myTeam, setMyTeam] = useState<any>(null);
  const [league, setLeague] = useState<any>(null);
  const [sport, setSport] = useState<string>('nba');
  const [myTeamId, setMyTeamId] = useState('');
  const [myRoster, setMyRoster] = useState<any[]>([]);
  const [tradeBlock, setTradeBlock] = useState<string[]>([]);
  const [untouchables, setUntouchables] = useState<string[]>([]);
  const [allTeams, setAllTeams] = useState<any[]>([]);
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rosterModal, setRosterModal] = useState<'block' | 'untouchable' | 'target' | null>(null);
  const [selectedAvailPlayer, setSelectedAvailPlayer] = useState<{ player: any; uid: string; teamId: string; teamName: string } | null>(null);
  const [blockSort, setBlockSort] = useState<string>('team');
  const [targetSearch, setTargetSearch] = useState('');
  const [targetPosFilter, setTargetPosFilter] = useState('ALL');
  const [activeRooms, setActiveRooms] = useState<any[]>([]);
  const user = auth.currentUser;
  const positionFilters = getPositionFilters(sport);
  const tradePositionFilters = positionFilters.filter(position => position !== 'ALL');
  const leagueEra = league?.era || 'current';
  const leagueYear = league?.currentYear || league?.seasonYear || null;
  const leagueDate = leagueDateFromRecord(league);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const q = query(
      collection(db, 'leagues', leagueId, 'channels', 'trade-center', 'messages'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, snap => {
      setListings(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((m: any) => m.type === 'trade_listing' && m.status === 'available'));
    }, err => { if (err.code !== 'permission-denied') console.error(err); });
    return () => unsub();
  }, [leagueId]);

  // Active Trade Rooms: rooms I'm host or guest of, in active states
  useEffect(() => {
    if (!leagueId || !user?.uid) return;
    const ACTIVE = ['open', 'live', 'pushed', 'countered'];
    const hostQ = query(
      collection(db, 'leagues', leagueId, 'trade_rooms'),
      where('hostUid', '==', user.uid),
      limit(20)
    );
    const guestQ = query(
      collection(db, 'leagues', leagueId, 'trade_rooms'),
      where('guestUid', '==', user.uid),
      limit(20)
    );
    let hostRooms: any[] = [];
    let guestRooms: any[] = [];
    const merge = () => {
      const all = [...hostRooms, ...guestRooms].filter(r => ACTIVE.includes(r.status) && !isTradeRoomExpired(r));
      // Priority: pushed-to-me=0, live=1, pushed-by-me/countered=2, open=3
      const priority = (r: any) => {
        if ((r.status === 'pushed' || r.status === 'countered') && r.senderUid && r.senderUid !== user.uid) return 0;
        if (r.status === 'live') return 1;
        if (r.status === 'pushed' || r.status === 'countered') return 2;
        return 3;
      };
      all.sort((a, b) => {
        const pa = priority(a);
        const pb = priority(b);
        if (pa !== pb) return pa - pb;
        const ta = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
        const tb = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
        return tb - ta;
      });
      setActiveRooms(all);
    };
    const unsubHost = onSnapshot(hostQ, snap => {
      hostRooms = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      merge();
    }, err => { if (err.code !== 'permission-denied') console.error(err); });
    const unsubGuest = onSnapshot(guestQ, snap => {
      guestRooms = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      merge();
    }, err => { if (err.code !== 'permission-denied') console.error(err); });
    return () => { unsubHost(); unsubGuest(); };
  }, [leagueId, user?.uid]);

  const loadData = async () => {
    setLoading(true);
    try {
      const teamsSnap = await getDocs(collection(db, 'leagues', leagueId, 'teams'));
      const teams = teamsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      const teamsByRosterValue = teams.map((team: any) => ({
        ...team,
        players: [...(team.players || [])].sort(compareRosterPlayersByValue),
      }));
      setAllTeams(teamsByRosterValue);
      // League sport drives archetype labels (NBA playstyle vs MLB/NFL archetypes).
      let leagueSport = 'nba';
      try {
        const lSnap = await getDoc(doc(db, 'leagues', leagueId));
        if (lSnap.exists()) {
          const leagueData = lSnap.data() as any;
          setLeague({ id: lSnap.id, ...leagueData });
          leagueSport = leagueData.sport || 'nba';
        }
      } catch {}
      setSport(leagueSport);
      const isNBA = leagueSport === 'nba';
      // Note: allTeams are used for tradeBlock display - they get enriched inline
      const mine = teamsByRosterValue.find((t: any) => t.gmId === user?.uid);
      if (mine) {
        setMyTeam(mine);
        setMyTeamId(mine.id);
        setTradeBlock(mine.tradeBlock || []);
        setUntouchables(mine.untouchables || []);

        // Load era stats to enrich players (NBA only — MLB/NFL pools carry their own).
        const eraKey = mine.era || 'current';
        const statsMap: Record<string, any> = {};
        if (isNBA) {
          const statsSnap = await getDoc(doc(db, 'era_stats', eraKey));
          if (statsSnap.exists()) {
            (statsSnap.data().players || []).forEach((p: any) => {
              statsMap[p.name] = p;
            });
          }
        }

        const enrichedRoster = (mine.players || []).map((p: any) => ({
          ...p,
          ...(statsMap[p.full_name] || {}),
        }));
        setMyRoster(enrichedRoster.sort(compareRosterPlayersByValue));
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const getPlayerById = (pid: string) => myRoster.find((p: any) => (p.player_id || p.full_name) === pid);
  const playerSalary = (player: any) => player?.salary ?? player?.contract?.salary ?? player?.currentSalary ?? 0;

  const tradeBlockPlayers = tradeBlock.map(pid => getPlayerById(pid)).filter(Boolean).sort(compareRosterPlayersByValue);
  const untouchablePlayers = untouchables.map(pid => getPlayerById(pid)).filter(Boolean).sort(compareRosterPlayersByValue);
  const allTradeBlockAcrossLeague = allTeams.flatMap((t: any) => {
    const tb = t.tradeBlock || [];
    return (t.players || []).filter((p: any) => tb.includes(p.player_id || p.full_name)).map((p: any) => ({
      ...p,
      teamName: displayScheduleTeamLabel(t.name || t.abbreviation, t.teamId || t.id || ''),
      teamId: t.id,
      gmId: t.gmId,
    }));
  }).sort((a: any, b: any) => (a.teamName || '').localeCompare(b.teamName || '') || compareRosterPlayersByValue(a, b));
  const claimedTradeTeams = allTeams
    .filter((t: any) => t.gmId && t.gmId !== user?.uid)
    .sort((a: any, b: any) => (a.name || a.abbreviation || '').localeCompare(b.name || b.abbreviation || ''));

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

      {/* Active Trade Rooms */}
      {activeRooms.length > 0 && (
        <View style={styles.activeRoomsBanner}>
          <Text style={styles.activeRoomsTitle}>ACTIVE TRADE ROOMS ({activeRooms.length})</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12 }}>
              {activeRooms.map((r: any) => {
                const otherIsHost = r.hostUid !== user?.uid;
                const oUid = otherIsHost ? r.hostUid : r.guestUid;
                const oTeamId = otherIsHost ? r.hostTeamId : r.guestTeamId;
                const oTeamName = otherIsHost ? r.hostTeamName : r.guestTeamName;
                let label = 'Idle';
                let labelColor = '#888';
                if ((r.status === 'pushed' || r.status === 'countered') && r.senderUid && r.senderUid !== user?.uid) { label = 'Offer Received'; labelColor = '#F5A623'; }
                else if (r.status === 'live') { label = 'Live'; labelColor = '#00ff87'; }
                else if (r.status === 'pushed' || r.status === 'countered') { label = 'Offer Sent'; labelColor = '#8888ff'; }
                return (
                  <TouchableOpacity
                    key={r.id}
                    style={styles.activeRoomCard}
                    onPress={() => router.push({
                      pathname: '/screens/trade-room',
                      params: { leagueId, otherUid: oUid, otherTeamId: oTeamId, otherTeamName: oTeamName || 'Opponent' },
                    })}
                  >
                    <Text style={styles.activeRoomTeam} numberOfLines={1}>{oTeamName || 'Opponent'}</Text>
                    <View style={styles.activeRoomStatusRow}>
                      <View style={[styles.activeRoomDot, { backgroundColor: labelColor }]} />
                      <Text style={[styles.activeRoomStatus, { color: labelColor }]}>{label}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tab, activeTab === 'block' && styles.tabActive]} onPress={() => setActiveTab('block')}>
          <Text style={[styles.tabText, activeTab === 'block' && styles.tabTextActive]}>MY TEAM</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'available' && styles.tabActive]} onPress={() => setActiveTab('available')}>
          <Text style={[styles.tabText, activeTab === 'available' && styles.tabTextActive]}>BLOCK FEED ({listings.filter((l: any) => l.fromUid !== user?.uid).length + allTradeBlockAcrossLeague.filter((p: any) => p.gmId !== user?.uid).length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'propose' && styles.tabActive]} onPress={() => setActiveTab('propose')}>
          <Text style={[styles.tabText, activeTab === 'propose' && styles.tabTextActive]}>TRADE</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'block' ? (
        <ScrollView contentContainerStyle={[styles.blockContent, { paddingBottom: 90 }]}>
          {/* 3 Column Layout */}
          <View style={styles.threeCol}>
            {/* Trading Block */}
            <View style={styles.col}>
              <Text style={styles.colTitle}>TRADING BLOCK</Text>
              {[0,1,2,3,4,5].map(i => {
                const p = tradeBlockPlayers[i];
                return p
                  ? <PlayerSlot key={i} player={p} eraKey={leagueEra} sport={sport} currentYear={leagueYear} leagueDate={leagueDate} onPress={() => setRosterModal('block')} style={styles.blockSlot} />
                  : <PlayerSlot key={i} empty onPress={() => setRosterModal('block')} />;
              })}
            </View>
            {/* Target List (players from other teams you're watching) */}
            <View style={styles.col}>
              <Text style={styles.colTitle}>TARGET LIST</Text>
              {[0,1,2,3,4,5].map(i => {
                const targetIds: string[] = myTeam?.targetList || [];
                const pid = targetIds[i];
                // Find player across all teams
                let targetPlayer: any = null;
                if (pid) {
                  for (const t of allTeams) {
                    const found = (t.players || []).find((p: any) => (p.player_id || p.full_name) === pid);
                    if (found) {
                      targetPlayer = found;
                      break;
                    }
                  }
                }
                return targetPlayer ? (
                  <PlayerSlot key={i} player={targetPlayer} eraKey={leagueEra} sport={sport} currentYear={leagueYear} leagueDate={leagueDate} onPress={() => setRosterModal('target')} />
                ) : (
                  <PlayerSlot key={i} empty onPress={() => setRosterModal('target')} />
                );
              })}
            </View>
            {/* Untouchables */}
            <View style={styles.col}>
              <Text style={styles.colTitle}>UNTOUCHABLES</Text>
              {[0,1,2,3,4,5].map(i => {
                const p = untouchablePlayers[i];
                return p
                  ? <PlayerSlot key={i} player={p} eraKey={leagueEra} sport={sport} currentYear={leagueYear} leagueDate={leagueDate} style={styles.untouchableSlot} onPress={() => setRosterModal('untouchable')} />
                  : <PlayerSlot key={i} empty onPress={() => setRosterModal('untouchable')} />;
              })}
            </View>
          </View>
        </ScrollView>
      ) : activeTab === 'available' ? (
        <>
        {/* Filter Controls */}
        <View style={styles.sortRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16 }}>
              <Text style={styles.sortLabel}>Team:</Text>
              {['All', ...allTeams.filter((t: any) => t.gmId !== user?.uid).map((t: any) => displayScheduleTeamLabel(t.abbreviation || t.name, t.teamId || t.id).slice(0, 3).toUpperCase())].map(tm => (
                <TouchableOpacity key={tm} style={[styles.sortBtn, (blockSort === tm || (tm === 'All' && blockSort === 'team')) && styles.sortBtnActive]} onPress={() => setBlockSort(tm === 'All' ? 'team' : tm)}>
                  <Text style={[styles.sortBtnText, (blockSort === tm || (tm === 'All' && blockSort === 'team')) && styles.sortBtnTextActive]}>{tm}</Text>
                </TouchableOpacity>
              ))}
              <View style={{ width: 1, backgroundColor: '#333', marginHorizontal: 4 }} />
              <Text style={styles.sortLabel}>Pos:</Text>
              {tradePositionFilters.map(pos => (
                <TouchableOpacity key={pos} style={[styles.sortBtn, blockSort === pos && styles.sortBtnActive]} onPress={() => setBlockSort(blockSort === pos ? 'team' : pos)}>
                  <Text style={[styles.sortBtnText, blockSort === pos && styles.sortBtnTextActive]}>{pos}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
        <ScrollView contentContainerStyle={styles.availableContent}>
          {/* Combined & Sorted Trade Block */}
          {(() => {
            const allAvail = [
              ...listings.filter((l: any) => l.fromUid !== user?.uid).map((l: any) => ({
                key: l.id, teamName: displayScheduleTeamLabel(l.fromTeamName, l.fromTeamId), teamId: l.fromTeamId, player: l.player, uid: l.fromUid,
                onOffer: () => router.push({ pathname: '/screens/trade-room', params: { leagueId, otherUid: l.fromUid, otherTeamId: l.fromTeamId, otherTeamName: l.fromTeamName || '', prefillPlayer: JSON.stringify(l.player || {}) } }),
                onDM: () => router.push({ pathname: '/screens/dm', params: { uid: l.fromUid, name: l.fromTeamName } }),
              })),
              ...allTradeBlockAcrossLeague.filter((p: any) => p.gmId !== user?.uid).map((p: any, i: number) => ({
                key: 'tb_' + i, teamName: displayScheduleTeamLabel(p.teamName, p.teamId), teamId: p.teamId, player: p, uid: p.gmId,
                onOffer: () => router.push({ pathname: '/screens/trade-room', params: { leagueId, otherUid: p.gmId, otherTeamId: p.teamId, otherTeamName: p.teamName || '', prefillPlayer: JSON.stringify(p) } }),
                onDM: () => router.push({ pathname: '/screens/dm', params: { uid: p.gmId, name: p.teamName } }),
              })),
            ];
            const isPositionFilter = tradePositionFilters.includes(blockSort);
            const isTeamFilter = !isPositionFilter && blockSort !== 'team';
            const filtered = allAvail.filter(item => {
              if (isPositionFilter) return matchesRosterPosition(item.player || {}, blockSort);
              if (isTeamFilter) {
                const abbr = item.teamName?.slice(0,3).toUpperCase();
                const fullMatch = item.teamName?.toUpperCase().includes(blockSort.toUpperCase());
                return abbr === blockSort || fullMatch;
              }
              return true;
            });
            const sorted = [...filtered].sort((a, b) => (
              compareRosterPlayersByValue(a.player || {}, b.player || {})
              || (a.teamName || '').localeCompare(b.teamName || '')
            ));
            return sorted.map(item => (
              <View key={item.key} style={styles.listingCard}>
                <Text style={styles.listingTeam}>{item.teamName}</Text>
                <View style={styles.listingRow}>
                  <View style={styles.listingPlayerCardWrap}>
                    <FranchisePlayerRow
                      player={item.player}
                      sport={sport}
                      era={leagueEra}
                      currentYear={leagueYear}
                      leagueDate={leagueDate}
                      salary={playerSalary(item.player)}
                      salaryLabel={`${formatFranchisePlayerMoney(playerSalary(item.player))} salary`}
                      meta={[item.player?.position, item.teamName].filter(Boolean).join(' · ')}
                      gradeCount={3}
                      action={{ label: 'Offer', onPress: item.onOffer, variant: 'primary' }}
                      onPress={() => setSelectedAvailPlayer({ player: item.player, uid: item.uid, teamId: item.teamId || item.player?.teamId || '', teamName: item.teamName || '' })}
                    />
                  </View>
                  <View style={styles.listingBtns}>
                    <TouchableOpacity style={styles.dmBtn} onPress={item.onDM}>
                      <Text style={styles.dmBtnText}>💬 DM</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ));
          })()}
          {listings.filter((l: any) => l.fromUid !== user?.uid).length === 0 && allTradeBlockAcrossLeague.filter((p: any) => p.gmId !== user?.uid).length === 0 && (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📢</Text>
              <Text style={styles.emptyText}>No players available for trade yet</Text>
            </View>
          )}
        </ScrollView>
        </>
      ) : (
        <ScrollView contentContainerStyle={styles.proposeContent}>
          {!myTeam ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🏆</Text>
              <Text style={styles.emptyText}>Claim a team before opening trade rooms</Text>
            </View>
          ) : claimedTradeTeams.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🤝</Text>
              <Text style={styles.emptyText}>No other managers have claimed a team yet</Text>
            </View>
          ) : (
            claimedTradeTeams.map((team: any) => (
              <TouchableOpacity
                key={team.id}
                style={styles.proposeTeamCard}
                onPress={() => router.push({
                  pathname: '/screens/trade-room',
                  params: {
                    leagueId,
                    otherUid: team.gmId,
                    otherTeamId: team.id,
                    otherTeamName: displayScheduleTeamLabel(team.name || team.abbreviation, team.teamId || team.id || ''),
                  },
                })}
              >
                <View style={styles.proposeTeamAvatar}>
                  <Text style={styles.proposeTeamAvatarText}>{displayScheduleTeamLabel(team.abbreviation || team.name || '?', team.teamId || team.id || '?').slice(0, 3).toUpperCase()}</Text>
                </View>
                <View style={styles.proposeTeamInfo}>
                  <Text style={styles.proposeTeamName}>{displayScheduleTeamLabel(team.name || team.abbreviation, team.teamId || team.id || 'Team')}</Text>
                  <Text style={styles.proposeTeamMeta}>{(team.players || []).length} players · Start trade room</Text>
                </View>
                <Text style={styles.proposeTeamChevron}>›</Text>
              </TouchableOpacity>
            ))
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
            <Text style={styles.modalTitle}>{rosterModal === 'block' ? 'Set Trade Block' : rosterModal === 'target' ? 'Set Target List' : 'Set Untouchables'}</Text>
            <View style={{ width: 50 }} />
          </View>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalHint}>Tap players to toggle them {rosterModal === 'block' ? 'on/off trade block' : rosterModal === 'target' ? 'on/off your target list' : 'as untouchable'}</Text>
            {rosterModal === 'target' && (
              <View style={styles.modalSearchRow}>
                <TextInput
                  style={styles.modalSearchInput}
                  placeholder='Search players...'
                  placeholderTextColor='#555'
                  value={targetSearch}
                  onChangeText={setTargetSearch}
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 36 }}>
                  <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 8 }}>
                    {positionFilters.map(p => (
                      <TouchableOpacity key={p} style={[styles.sortBtn, targetPosFilter === p && styles.sortBtnActive]} onPress={() => setTargetPosFilter(p)}>
                        <Text style={[styles.sortBtnText, targetPosFilter === p && styles.sortBtnTextActive]}>{p}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}
            {(() => {
              const otherTeams = allTeams.filter((t: any) => t.gmId !== user?.uid && t.id !== myTeamId);
              const allLeaguePlayers = rosterModal === 'target'
                ? otherTeams.flatMap((t: any) => (t.players || []).map((p: any) => ({ ...p, teamName: displayScheduleTeamLabel(t.name || t.abbreviation, t.teamId || t.id || 'Unknown') })))
                    .filter((p: any) => {
                      const matchSearch = !targetSearch || (p.full_name || '').toLowerCase().includes(targetSearch.toLowerCase());
                      const matchPos = matchesRosterPosition(p, targetPosFilter);
                      return matchSearch && matchPos;
                    })
                    .sort((a: any, b: any) => compareRosterPlayersByValue(a, b) || (a.teamName || '').localeCompare(b.teamName || ''))
                : [...myRoster].sort(compareRosterPlayersByValue);
              return allLeaguePlayers.map((p: any, i: number) => {
              const pid = p.player_id || p.full_name;
              const isSelected = rosterModal === 'block' ? tradeBlock.includes(pid) : rosterModal === 'target' ? (myTeam?.targetList || []).includes(pid) : untouchables.includes(pid);
              const selectedLabel = rosterModal === 'block' ? 'On Block' : rosterModal === 'target' ? 'Targeted' : 'Locked';
              const togglePlayer = async () => {
                if (rosterModal === 'block') {
                  const wasOnBlock = tradeBlock.includes(pid);
                  const newList = wasOnBlock ? tradeBlock.filter(x => x !== pid) : [...tradeBlock, pid];
                  setTradeBlock(newList);
                  await updateDoc(doc(db, 'leagues', leagueId, 'teams', myTeamId), { tradeBlock: newList });

                  // On ADD only: log to activity + notify all league members
                  if (!wasOnBlock) {
                    const player = allLeaguePlayers.find((p: any) => (p.player_id || p.full_name) === pid);
                    const playerName = player?.full_name || player?.name || 'a player';
                    const myTeamName = myTeam?.name || 'A GM';

                    // Activity log
                    try {
                      await addDoc(collection(db, 'leagues', leagueId, 'activity'), {
                        type: 'tradeblock',
                        message: myTeamName + ' added ' + playerName + ' to the trade block',
                        leagueId,
                        uid: user?.uid,
                        createdAt: serverTimestamp(),
                      });
                    } catch (e) { console.warn('activity log failed', e); }

                    // Notify all league members
                    try {
                      const leagueSnap = await getDoc(doc(db, 'leagues', leagueId));
                      const memberIds: string[] = leagueSnap.data()?.members || [];
                      const leagueNameFetched = leagueSnap.data()?.name || '';
                      for (const memberId of memberIds) {
                        if (memberId === user?.uid) continue;
                        try {
                          await updateDoc(doc(db, 'users', memberId), {
                            notifications: arrayUnion({
                              type: 'tradeblock',
                              leagueId,
                              leagueName: leagueNameFetched,
                              message: myTeamName + ' added ' + playerName + ' to the trade block',
                              createdAt: new Date().toISOString(),
                            })
                          });
                        } catch (innerErr) {
                          console.warn('tradeblock notify failed for', memberId, innerErr);
                        }
                      }
                    } catch (e) { console.warn('tradeblock notify outer fail', e); }
                  }
                } else if (rosterModal === 'target') {
                  const currentTargets = myTeam?.targetList || [];
                  const isAdding = !currentTargets.includes(pid);
                  const newTargets = isAdding ? [...currentTargets, pid] : currentTargets.filter((x: string) => x !== pid);
                  await updateDoc(doc(db, 'leagues', leagueId, 'teams', myTeamId), { targetList: newTargets });
                  setMyTeam((prev: any) => ({ ...prev, targetList: newTargets }));

                  // On ADD only: notify owning team's GM if player is on a team (not free agent)
                  if (isAdding) {
                    const player = allLeaguePlayers.find((p: any) => (p.player_id || p.full_name) === pid);
                    const ownerTeam = allTeams.find((t: any) =>
                      (t.players || []).some((p: any) => (p.player_id || p.full_name) === pid)
                    );
                    if (ownerTeam && ownerTeam.gmId && ownerTeam.gmId !== user?.uid) {
                      try {
                        await updateDoc(doc(db, 'users', ownerTeam.gmId), {
                          notifications: arrayUnion({
                            type: 'target_interest',
                            leagueId,
                            fromTeamId: myTeamId,
                            fromTeamName: myTeam?.name || 'A team',
                            playerName: player?.full_name || 'a player',
                            createdAt: new Date().toISOString(),
                            message: (myTeam?.name || 'A team') + ' is interested in ' + (player?.full_name || 'a player'),
                            read: false,
                          }),
                        });
                      } catch (e) {
                        console.warn('Failed to notify target owner', e);
                      }
                    }
                  }
                } else {
                  const newList = untouchables.includes(pid) ? untouchables.filter((x: string) => x !== pid) : [...untouchables, pid];
                  setUntouchables(newList);
                  await updateDoc(doc(db, 'leagues', leagueId, 'teams', myTeamId), { untouchables: newList });
                }
              };
              return (
                <FranchisePlayerRow
                  key={pid || i}
                  player={p}
                  index={i}
                  sport={sport}
                  era={leagueEra}
                  currentYear={leagueYear}
                  leagueDate={leagueDate}
                  salary={playerSalary(p)}
                  salaryLabel={`${formatFranchisePlayerMoney(playerSalary(p))} salary`}
                  meta={[p.position, p.teamName].filter(Boolean).join(' · ')}
                  selected={isSelected}
                  gradeCount={3}
                  statusLabels={isSelected ? [{ label: selectedLabel, tone: rosterModal === 'untouchable' ? 'danger' : 'good' }] : []}
                  action={{ label: isSelected ? 'Remove' : 'Add', onPress: togglePlayer, variant: isSelected ? 'neutral' : 'primary' }}
                  onPress={togglePlayer}
                />
              );
            });})()}
          </ScrollView>
        </View>
      </Modal>
      <PlayerCard
        player={selectedAvailPlayer?.player || null}
        era={league?.era || 'current'}
        sport={sport}
        leagueId={leagueId}
        teamId={selectedAvailPlayer?.teamId || ''}
        leagueDate={leagueDate}
        visible={!!selectedAvailPlayer}
        onClose={() => setSelectedAvailPlayer(null)}
        isOwned={selectedAvailPlayer ? false : undefined}
        onOfferTrade={selectedAvailPlayer ? () => {
          const sel = selectedAvailPlayer;
          setSelectedAvailPlayer(null);
          router.push({ pathname: '/screens/trade-room', params: { leagueId, otherUid: sel.uid, otherTeamId: sel.teamId, otherTeamName: sel.teamName, prefillPlayer: JSON.stringify(sel.player || {}) } });
        } : undefined}
      />

      {/* Trade Modal */}
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
  activeRoomsBanner: { paddingVertical: 10, backgroundColor: '#0d0d0d', borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  activeRoomsTitle: { color: '#888', fontSize: 10, fontWeight: '800', letterSpacing: 1, paddingHorizontal: 16, marginBottom: 8 },
  activeRoomCard: { backgroundColor: '#1a1a1a', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#2a2a2a', minWidth: 140 },
  activeRoomTeam: { color: '#fff', fontSize: 13, fontWeight: '700', marginBottom: 4 },
  activeRoomStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  activeRoomDot: { width: 6, height: 6, borderRadius: 3 },
  activeRoomStatus: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#00ff87' },
  tabText: { color: '#555', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  tabTextActive: { color: '#00ff87' },
  blockContent: { padding: 12, paddingBottom: 100 },
  threeCol: { flexDirection: 'row', gap: 8 },
  col: { flex: 1, gap: 6 },
  colTitle: { color: '#888', fontSize: 9, fontWeight: '800', letterSpacing: 1, textAlign: 'center', marginBottom: 4, textTransform: 'uppercase' },
  playerSlot: { backgroundColor: '#1a1a1a', borderRadius: 8, borderWidth: 1, borderColor: '#2a2a2a', overflow: 'hidden', marginBottom: 4, minHeight: 80 },
  blockSlot: { minHeight: 80 },
  playerSlotEmpty: { borderStyle: 'dashed', borderColor: '#333', alignItems: 'center', justifyContent: 'center', height: 80 },
  addItemText: { color: '#333', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  playerSlotInner: { flexDirection: 'row', alignItems: 'center', padding: 6, gap: 6 },
  playerSlotPhoto: { width: 44, height: 44, borderRadius: 4, backgroundColor: '#111' },
  playerSlotPhotoPlaceholder: { width: 44, height: 44, borderRadius: 4, backgroundColor: '#1a1a2a', alignItems: 'center', justifyContent: 'center' },
  playerSlotInitial: { color: '#8888ff', fontSize: 18, fontWeight: '800' },
  playerSlotInfo: { flex: 1 },
  playerSlotPos: { color: '#888', fontSize: 8, fontWeight: '700', letterSpacing: 1 },
  playerSlotName: { color: '#fff', fontSize: 10, fontWeight: '700', marginBottom: 2 },

  untouchableSlot: { borderColor: '#ff4444', backgroundColor: '#1a0a0a' },
  targetSlot: { borderColor: '#4444ff', backgroundColor: '#0a0a1a' },
  availableContent: { padding: 16, paddingBottom: 100 },
  proposeContent: { padding: 16, paddingBottom: 100 },
  listingCard: { backgroundColor: '#111', borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#222' },
  listingTeam: { color: '#888', fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  listingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  listingPlayerCardWrap: { flex: 1, minWidth: 0 },
  listingBtns: { gap: 6 },
  dmBtn: { backgroundColor: '#1a1a2a', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: '#4444ff', alignItems: 'center' },
  dmBtnText: { color: '#8888ff', fontSize: 11, fontWeight: '700' },
  proposeTeamCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#222', gap: 12 },
  proposeTeamAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#00ff8755', alignItems: 'center', justifyContent: 'center' },
  proposeTeamAvatarText: { color: '#00ff87', fontSize: 11, fontWeight: '900' },
  proposeTeamInfo: { flex: 1 },
  proposeTeamName: { color: '#fff', fontSize: 15, fontWeight: '800' },
  proposeTeamMeta: { color: '#666', fontSize: 12, marginTop: 3, fontWeight: '700' },
  proposeTeamChevron: { color: '#555', fontSize: 24, fontWeight: '700' },
  emptyContainer: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptySubtext: { color: '#333', fontSize: 12, textAlign: 'center' },
  teamTradeCard: { backgroundColor: '#111', borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#1e1e1e' },
  teamTradeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  teamTradeName: { color: '#ffffff', fontSize: 15, fontWeight: '800', flex: 1 },
  teamTradeActions: { flexDirection: 'row', gap: 6 },
  teamTradeSubLabel: { color: '#555', fontSize: 9, fontWeight: '800', letterSpacing: 1, marginBottom: 6, marginTop: 4 },
  teamPlayerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  availableSlot: { width: 90 },
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
  offerRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: '#2a2a2a', gap: 8 },
  offerRowSelected: { borderColor: '#00ff87', backgroundColor: '#0a2a1a' },
  offerPos: { color: '#888', fontSize: 11, fontWeight: '700', width: 28 },
  offerName: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },
  offerCheck: { color: '#00ff87', fontSize: 16, fontWeight: '700' },

  sortRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#111' },
  sortLabel: { color: '#555', fontSize: 12 },
  sortBtn: { minWidth: 54, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: '#2a2a2a', backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sortBtnActive: { borderColor: '#F5A623', backgroundColor: '#2a1a00' },
  sortBtnText: { color: '#666', fontSize: 12, fontWeight: '600', textAlign: 'center', flexShrink: 0 },
  sortBtnTextActive: { color: '#F5A623', fontWeight: '700' },

  modalSearchRow: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  modalSearchInput: { backgroundColor: '#1a1a1a', borderRadius: 10, padding: 10, color: '#ffffff', fontSize: 14, borderWidth: 1, borderColor: '#2a2a2a' },
});
