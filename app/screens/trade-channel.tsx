import { router, useLocalSearchParams } from 'expo-router';
import PlayerCard, { leagueDateFromRecord } from '@/components/PlayerCard';
import FranchisePlayerRow, { formatFranchisePlayerMoney } from '@/components/FranchisePlayerRow';
import PlayerHeadshot from '@/components/PlayerHeadshot';
import { addDoc, collection, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, getDoc, where, arrayUnion } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';
import GlobalNav from '@/components/GlobalNav';
import { getPositionFilters } from '@/domain/sports/playerFields';
import { compareSportRosterPlayersByValue, matchesSportRosterPosition } from '@/domain/sports/rosterValue';
import { selectRosterRatingProfile } from '@/domain/nba/rosterProfile';
import { displayScheduleTeamLabel } from '@/domain/nba/scheduleView';
import { isTradeRoomExpired } from '@/domain/tradeRoomExpiry';
import { matchesNbaClassificationFilter, type NbaArchetype, type NbaPlayerTier, type VisibleNbaIdentity } from '@/domain/nba/identity';

const NBA_TRADE_TIER_FILTERS: Array<NbaPlayerTier | 'ALL'> = ['ALL', 'Legend', 'Superstar', 'Star', 'High-Impact Contributor', 'Valuable Rotation Player', 'Specialist / Depth Piece', 'Prospect'];
const NBA_TRADE_ARCHETYPE_FILTERS: Array<NbaArchetype | 'ALL'> = ['ALL', '3-and-D Wing', 'Perimeter Defender', 'Stretch Big', 'Rim Protector', 'Defensive Anchor', 'Primary Creator', 'Floor General', 'Spot-Up Shooter', 'Catch-and-Shoot Specialist', 'Versatile Connector', 'Athletic Finisher', 'Roll Big', 'Microwave Scorer'];

function tradeVisibleIdentity(player: any, profile: any): VisibleNbaIdentity | null {
  const identity = profile?.identity || player?.identity || profile?.visibleIdentity || player?.visibleIdentity;
  if (!identity || typeof identity !== 'object' || identity.overall !== undefined) return null;
  if (!identity.tier || !Array.isArray(identity.archetypes)) return null;
  return identity as VisibleNbaIdentity;
}

const TRADE_TIER_COLORS: Record<string, string> = {
  Legend: '#f5d76e',
  Superstar: '#f5c400',
  Star: '#f5a623',
  'High-Impact Contributor': '#8bffb5',
  'Valuable Rotation Player': '#00ff87',
  'Specialist / Depth Piece': '#69a7ff',
  Prospect: '#b388ff',
  'Depth Piece': '#888888',
};

function tradeSlotIdentity(player: any, {
  eraKey,
  currentYear,
  leagueDate,
  sport,
}: {
  eraKey?: string;
  currentYear?: number | string | null;
  leagueDate?: string | Date | null;
  sport?: string;
}) {
  if (sport && sport !== 'nba') {
    return { tier: player?.position || 'Player', archetypes: [] as string[], color: '#69a7ff' };
  }
  const profile = selectRosterRatingProfile(player, {}, { era: eraKey, currentYear, leagueDate });
  const identity = tradeVisibleIdentity(player, profile);
  const tier = identity?.tier || 'Depth Piece';
  return {
    tier,
    archetypes: identity?.archetypes || [],
    color: TRADE_TIER_COLORS[tier] || '#00ff87',
  };
}

function TierBadge({
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
  const identity = tradeSlotIdentity(player, { eraKey, sport, currentYear, leagueDate });
  return (
    <View style={[badgeStyles.badge, { borderColor: identity.color + '88', backgroundColor: identity.color + '16' }]}>
      <Text style={[badgeStyles.badgeText, { color: identity.color }]} numberOfLines={2}>{identity.tier}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: { borderRadius: 4, borderWidth: 1, paddingHorizontal: 4, paddingVertical: 1, alignSelf: 'flex-start', marginTop: 2 },
  badgeText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
});

function BoardPlayerCard({
  player,
  sport,
  eraKey,
  currentYear,
  leagueDate,
  accent,
  status,
  teamName,
  onPress,
}: {
  player: any;
  sport?: string;
  eraKey?: string;
  currentYear?: number | string | null;
  leagueDate?: string | Date | null;
  accent: string;
  status: string;
  teamName?: string;
  onPress: () => void;
}) {
  const identity = tradeSlotIdentity(player, { eraKey, sport, currentYear, leagueDate });
  const playerName = player?.full_name || player?.name || 'Player';
  const playerMeta = [player?.position, player?.height || player?.height_text, teamName].filter(Boolean).join(' · ');
  const fallback = (
    <View style={styles.boardPhotoFallback}>
      <Text style={styles.boardPhotoInitial}>{playerName[0]}</Text>
    </View>
  );
  return (
    <TouchableOpacity style={styles.boardPlayerCard} onPress={onPress} activeOpacity={0.86}>
      <View style={[styles.boardCardAccent, { backgroundColor: accent }]} />
      <PlayerHeadshot player={player} sport={sport} imageStyle={styles.boardPhoto} fallback={fallback} />
      <View style={styles.boardPlayerInfo}>
        <View style={styles.boardPlayerTopRow}>
          <Text style={styles.boardPlayerName} numberOfLines={1}>{playerName}</Text>
          <View style={[styles.boardStatusPill, { borderColor: accent + 'aa', backgroundColor: accent + '18' }]}>
            <Text style={[styles.boardStatusText, { color: accent }]} numberOfLines={1}>{status}</Text>
          </View>
        </View>
        <Text style={styles.boardPlayerMeta} numberOfLines={1}>{playerMeta}</Text>
        <View style={styles.boardPlayerBottomRow}>
          <View style={[styles.boardTierBadge, { borderColor: identity.color + '88', backgroundColor: identity.color + '16' }]}>
            <Text style={[styles.boardTierText, { color: identity.color }]} numberOfLines={1}>{identity.tier}</Text>
          </View>
          <Text style={styles.boardSalary} numberOfLines={1}>{formatFranchisePlayerMoney(player?.salary ?? player?.contract?.salary ?? player?.currentSalary ?? 0)}</Text>
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
  const [tradeTierFilter, setTradeTierFilter] = useState<NbaPlayerTier | 'ALL'>('ALL');
  const [tradeArchetypeFilter, setTradeArchetypeFilter] = useState<NbaArchetype | 'ALL'>('ALL');
  const [targetSearch, setTargetSearch] = useState('');
  const [targetPosFilter, setTargetPosFilter] = useState('ALL');
  const [activeRooms, setActiveRooms] = useState<any[]>([]);
  const user = auth.currentUser;
  const positionFilters = getPositionFilters(sport);
  const tradePositionFilters = positionFilters.filter(position => position !== 'ALL');
  const rosterComparator = useMemo(() => compareSportRosterPlayersByValue(sport), [sport]);
  const leagueEra = league?.era || 'current';
  const leagueYear = league?.currentYear || league?.seasonYear || null;
  const leagueDate = leagueDateFromRecord(league);
  const matchesTradeClassification = useCallback((player: any) => {
    if (sport !== 'nba') return true;
    if (tradeTierFilter === 'ALL' && tradeArchetypeFilter === 'ALL') return true;
    const profile = selectRosterRatingProfile(player, {}, { era: leagueEra, currentYear: leagueYear, leagueDate });
    return matchesNbaClassificationFilter(tradeVisibleIdentity(player, profile), {
      tier: tradeTierFilter,
      archetype: tradeArchetypeFilter,
    });
  }, [sport, tradeTierFilter, tradeArchetypeFilter, leagueEra, leagueYear, leagueDate]);

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

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const teamsSnap = await getDocs(collection(db, 'leagues', leagueId, 'teams'));
      const teams = teamsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
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
      const teamComparator = compareSportRosterPlayersByValue(leagueSport);
      const teamsByRosterValue = teams.map((team: any) => ({
        ...team,
        players: [...(team.players || [])].sort(teamComparator),
      }));
      setAllTeams(teamsByRosterValue);
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
        setMyRoster(enrichedRoster.sort(teamComparator));
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [leagueId, user?.uid]);

  useEffect(() => { loadData(); }, [loadData]);

  const getPlayerById = (pid: string) => myRoster.find((p: any) => (p.player_id || p.full_name) === pid);
  const playerSalary = (player: any) => player?.salary ?? player?.contract?.salary ?? player?.currentSalary ?? 0;

  const tradeBlockPlayers = tradeBlock.map(pid => getPlayerById(pid)).filter(Boolean).sort(rosterComparator);
  const untouchablePlayers = untouchables.map(pid => getPlayerById(pid)).filter(Boolean).sort(rosterComparator);
  const targetPlayers = (myTeam?.targetList || []).map((pid: string) => {
    for (const team of allTeams) {
      const player = (team.players || []).find((p: any) => (p.player_id || p.full_name) === pid);
      if (player) {
        return {
          ...player,
          teamName: displayScheduleTeamLabel(team.name || team.abbreviation, team.teamId || team.id || '', sport),
        };
      }
    }
    return null;
  }).filter(Boolean).sort((a: any, b: any) => rosterComparator(a, b) || (a.teamName || '').localeCompare(b.teamName || ''));
  const allTradeBlockAcrossLeague = allTeams.flatMap((t: any) => {
    const tb = t.tradeBlock || [];
    return (t.players || []).filter((p: any) => tb.includes(p.player_id || p.full_name)).map((p: any) => ({
      ...p,
      teamName: displayScheduleTeamLabel(t.name || t.abbreviation, t.teamId || t.id || '', sport),
      teamId: t.id,
      gmId: t.gmId,
    }));
  }).sort((a: any, b: any) => (a.teamName || '').localeCompare(b.teamName || '') || rosterComparator(a, b));
  const claimedTradeTeams = allTeams
    .filter((t: any) => t.gmId && t.gmId !== user?.uid)
    .sort((a: any, b: any) => (a.name || a.abbreviation || '').localeCompare(b.name || b.abbreviation || ''));
  const renderBoardSection = ({
    title,
    count,
    players,
    accent,
    status,
    emptyLabel,
    onManage,
  }: {
    title: string;
    count: number;
    players: any[];
    accent: string;
    status: string;
    emptyLabel: string;
    onManage: () => void;
  }) => (
    <View style={styles.boardSection}>
      <View style={styles.boardSectionHeader}>
        <View>
          <Text style={styles.boardSectionTitle}>{title}</Text>
          <Text style={styles.boardSectionCount}>{count} player{count === 1 ? '' : 's'}</Text>
        </View>
        <TouchableOpacity style={[styles.addSectionButton, { borderColor: accent + 'aa', backgroundColor: accent + '14' }]} onPress={onManage}>
          <Text style={[styles.addSectionButtonText, { color: accent }]}>Manage</Text>
        </TouchableOpacity>
      </View>
      {players.length > 0 ? (
        <View style={styles.boardPlayerStack}>
          {players.map((player: any, index: number) => (
            <BoardPlayerCard
              key={(player?.player_id || player?.full_name || title) + '_' + index}
              player={player}
              sport={sport}
              eraKey={leagueEra}
              currentYear={leagueYear}
              leagueDate={leagueDate}
              accent={accent}
              status={status}
              teamName={player?.teamName}
              onPress={onManage}
            />
          ))}
        </View>
      ) : (
        <TouchableOpacity style={styles.boardEmptyState} onPress={onManage}>
          <Text style={styles.boardEmptyLabel}>{emptyLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );

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
          <View style={styles.boardHero}>
            <View style={styles.boardHeroTextBlock}>
              <Text style={styles.boardEyebrow} numberOfLines={1}>{myTeam?.abbreviation || sport.toUpperCase()} OPERATIONS</Text>
              <Text style={styles.boardTitle} numberOfLines={1}>Front Office Trade Board</Text>
            </View>
            <Text style={styles.boardTeamLabel} numberOfLines={1}>{myTeam?.name || 'My Team'}</Text>
          </View>
          <View style={styles.boardSummaryStrip}>
            <View style={styles.boardSummaryItem}>
              <Text style={styles.boardSummaryValue}>{myRoster.length}</Text>
              <Text style={styles.boardSummaryLabel}>Roster</Text>
            </View>
            <View style={styles.boardSummaryItem}>
              <Text style={styles.boardSummaryValue}>{tradeBlockPlayers.length}</Text>
              <Text style={styles.boardSummaryLabel}>Shopping</Text>
            </View>
            <View style={styles.boardSummaryItem}>
              <Text style={styles.boardSummaryValue}>{targetPlayers.length}</Text>
              <Text style={styles.boardSummaryLabel}>Targets</Text>
            </View>
            <View style={styles.boardSummaryItem}>
              <Text style={styles.boardSummaryValue}>{untouchablePlayers.length}</Text>
              <Text style={styles.boardSummaryLabel}>Protected</Text>
            </View>
          </View>
          {renderBoardSection({
            title: 'Shopping',
            count: tradeBlockPlayers.length,
            players: tradeBlockPlayers,
            accent: '#2bd4ff',
            status: 'Available',
            emptyLabel: '+ Add player to block',
            onManage: () => setRosterModal('block'),
          })}
          {renderBoardSection({
            title: 'Targets',
            count: targetPlayers.length,
            players: targetPlayers,
            accent: '#f5a623',
            status: 'Target',
            emptyLabel: '+ Add target',
            onManage: () => setRosterModal('target'),
          })}
          {renderBoardSection({
            title: 'Protected',
            count: untouchablePlayers.length,
            players: untouchablePlayers,
            accent: '#ff4d5e',
            status: 'Locked',
            emptyLabel: '+ Add protected player',
            onManage: () => setRosterModal('untouchable'),
          })}
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
              {sport === 'nba' ? (
                <>
                  <View style={{ width: 1, backgroundColor: '#333', marginHorizontal: 4 }} />
                  <Text style={styles.sortLabel}>Tier:</Text>
                  {NBA_TRADE_TIER_FILTERS.map(tier => (
                    <TouchableOpacity key={tier} style={[styles.sortBtn, tradeTierFilter === tier && styles.sortBtnActive]} onPress={() => setTradeTierFilter(tier)}>
                      <Text style={[styles.sortBtnText, tradeTierFilter === tier && styles.sortBtnTextActive]}>{tier === 'ALL' ? 'All' : tier}</Text>
                    </TouchableOpacity>
                  ))}
                  <View style={{ width: 1, backgroundColor: '#333', marginHorizontal: 4 }} />
                  <Text style={styles.sortLabel}>Type:</Text>
                  {NBA_TRADE_ARCHETYPE_FILTERS.map(archetype => (
                    <TouchableOpacity key={archetype} style={[styles.sortBtn, tradeArchetypeFilter === archetype && styles.sortBtnActive]} onPress={() => setTradeArchetypeFilter(archetype)}>
                      <Text style={[styles.sortBtnText, tradeArchetypeFilter === archetype && styles.sortBtnTextActive]}>{archetype === 'ALL' ? 'All' : archetype}</Text>
                    </TouchableOpacity>
                  ))}
                </>
              ) : null}
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
              if (!matchesTradeClassification(item.player || {})) return false;
              if (isPositionFilter) return matchesSportRosterPosition(item.player || {}, blockSort, sport);
              if (isTeamFilter) {
                const abbr = item.teamName?.slice(0,3).toUpperCase();
                const fullMatch = item.teamName?.toUpperCase().includes(blockSort.toUpperCase());
                return abbr === blockSort || fullMatch;
              }
              return true;
            });
            const sorted = [...filtered].sort((a, b) => (
              (a.teamName || '').localeCompare(b.teamName || '')
              || rosterComparator(a.player || {}, b.player || {})
            ));
            const tradeBlockTeamSections = [...sorted.reduce((map, item) => {
              const sectionKey = item.teamId || item.teamName || 'team';
              const section = map.get(sectionKey) || {
                key: sectionKey,
                teamName: item.teamName || 'Team',
                uid: item.uid,
                teamId: item.teamId,
                onDM: item.onDM,
                players: [] as typeof sorted,
              };
              section.players.push(item);
              map.set(sectionKey, section);
              return map;
            }, new Map<string, { key: string; teamName: string; uid: string; teamId: string; onDM: () => void; players: typeof sorted }>()).values()];
            return tradeBlockTeamSections.map(section => (
              <View key={section.key} style={styles.blockTeamSection}>
                <View style={styles.blockTeamHeader}>
                  <View>
                    <Text style={styles.blockTeamName}>{section.teamName}</Text>
                    <Text style={styles.blockTeamCount}>{section.players.length} player{section.players.length === 1 ? '' : 's'} available</Text>
                  </View>
                  <TouchableOpacity style={styles.blockTeamDmBtn} onPress={section.onDM}>
                    <Text style={styles.blockTeamDmText}>💬 DM</Text>
                  </TouchableOpacity>
                </View>
                {section.players.map(item => {
                  const identity = tradeSlotIdentity(item.player, { eraKey: leagueEra, sport, currentYear: leagueYear, leagueDate });
                  const playerName = item.player?.full_name || item.player?.name || 'Player';
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={styles.blockPlayerRow}
                      activeOpacity={0.82}
                      onPress={() => setSelectedAvailPlayer({ player: item.player, uid: item.uid, teamId: item.teamId || item.player?.teamId || '', teamName: item.teamName || '' })}
                    >
                      <PlayerHeadshot
                        player={item.player}
                        sport={sport}
                        imageStyle={styles.blockPlayerPhoto}
                        fallback={(
                          <View style={styles.blockPlayerFallback}>
                            <Text style={styles.blockPlayerInitial}>{playerName[0]}</Text>
                          </View>
                        )}
                      />
                      <View style={styles.blockPlayerInfo}>
                        <View style={styles.blockPlayerTopLine}>
                          <Text style={styles.blockPlayerName} numberOfLines={1}>{playerName}</Text>
                          <Text style={styles.blockPlayerMoney}>{formatFranchisePlayerMoney(playerSalary(item.player))}</Text>
                        </View>
                        <View style={styles.blockPlayerMetaRow}>
                          <Text style={styles.blockPlayerMeta} numberOfLines={1}>
                            {[item.player?.position, identity.archetypes[0]].filter(Boolean).join(' · ') || identity.tier}
                          </Text>
                          <View style={[styles.blockTierBadge, { borderColor: identity.color + '88', backgroundColor: identity.color + '16' }]}>
                            <Text style={[styles.blockTierText, { color: identity.color }]} numberOfLines={1}>{identity.tier}</Text>
                          </View>
                        </View>
                      </View>
                      <TouchableOpacity style={styles.blockOfferBtn} onPress={item.onOffer}>
                        <Text style={styles.blockOfferText}>Open Trade</Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })}
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
                    otherTeamName: displayScheduleTeamLabel(team.name || team.abbreviation, team.teamId || team.id || '', sport),
                  },
                })}
              >
                <View style={styles.proposeTeamAvatar}>
                  <Text style={styles.proposeTeamAvatarText}>{displayScheduleTeamLabel(team.abbreviation || team.name || '?', team.teamId || team.id || '?').slice(0, 3).toUpperCase()}</Text>
                </View>
                <View style={styles.proposeTeamInfo}>
                  <Text style={styles.proposeTeamName}>{displayScheduleTeamLabel(team.name || team.abbreviation, team.teamId || team.id || 'Team', sport)}</Text>
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
                ? otherTeams.flatMap((t: any) => (t.players || []).map((p: any) => ({ ...p, teamName: displayScheduleTeamLabel(t.name || t.abbreviation, t.teamId || t.id || 'Unknown', sport) })))
                    .filter((p: any) => {
                      const matchSearch = !targetSearch || (p.full_name || '').toLowerCase().includes(targetSearch.toLowerCase());
                      const matchPos = matchesSportRosterPosition(p, targetPosFilter, sport);
                      return matchSearch && matchPos;
                    })
                    .sort((a: any, b: any) => rosterComparator(a, b) || (a.teamName || '').localeCompare(b.teamName || ''))
                : [...myRoster].sort(rosterComparator);
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
  blockContent: { padding: 14, paddingBottom: 100, gap: 12 },
  boardHero: { borderRadius: 8, borderWidth: 1, borderColor: '#2a2a2a', backgroundColor: '#141414', padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, overflow: 'hidden' },
  boardHeroTextBlock: { flex: 1, minWidth: 0 },
  boardEyebrow: { color: '#777', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  boardTitle: { color: '#fff', fontSize: 19, fontWeight: '900', marginTop: 3 },
  boardTeamLabel: { color: '#aaa', fontSize: 12, fontWeight: '800', width: 96, textAlign: 'right' },
  boardSummaryStrip: { flexDirection: 'row', borderRadius: 8, borderWidth: 1, borderColor: '#222', backgroundColor: '#101010', overflow: 'hidden' },
  boardSummaryItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRightWidth: 1, borderRightColor: '#1f1f1f' },
  boardSummaryValue: { color: '#fff', fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
  boardSummaryLabel: { color: '#777', fontSize: 9, fontWeight: '900', letterSpacing: 0.6, marginTop: 2, textTransform: 'uppercase' },
  boardSection: { borderRadius: 8, borderWidth: 1, borderColor: '#242424', backgroundColor: '#111', padding: 12, gap: 10 },
  boardSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  boardSectionTitle: { color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 0.4 },
  boardSectionCount: { color: '#666', fontSize: 10, fontWeight: '800', marginTop: 2, textTransform: 'uppercase' },
  boardPlayerStack: { gap: 8 },
  boardPlayerCard: { minHeight: 74, borderRadius: 8, borderWidth: 1, borderColor: '#292929', backgroundColor: '#181818', overflow: 'hidden', flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingRight: 10, gap: 10 },
  boardCardAccent: { alignSelf: 'stretch', width: 4 },
  boardPhoto: { width: 50, height: 50, borderRadius: 7, backgroundColor: '#0a0a0a' },
  boardPhotoFallback: { width: 50, height: 50, borderRadius: 7, backgroundColor: '#1a1a2a', alignItems: 'center', justifyContent: 'center' },
  boardPhotoInitial: { color: '#8888ff', fontSize: 18, fontWeight: '900' },
  boardPlayerInfo: { flex: 1, minWidth: 0, gap: 3 },
  boardPlayerTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  boardPlayerName: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '900' },
  boardStatusPill: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2, maxWidth: 82 },
  boardStatusText: { fontSize: 8, fontWeight: '900', letterSpacing: 0.5, textTransform: 'uppercase' },
  boardPlayerMeta: { color: '#888', fontSize: 11, fontWeight: '800' },
  boardPlayerBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  boardTierBadge: { flex: 1, maxWidth: 160, borderRadius: 5, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  boardTierText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.3 },
  boardSalary: { color: '#00ff87', fontSize: 11, fontWeight: '900' },
  addSectionButton: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  addSectionButtonText: { fontSize: 11, fontWeight: '900' },
  boardEmptyState: { minHeight: 52, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: '#303030', backgroundColor: '#151515', alignItems: 'center', justifyContent: 'center' },
  boardEmptyLabel: { color: '#555', fontSize: 12, fontWeight: '900', letterSpacing: 0.4 },
  availableContent: { padding: 16, paddingBottom: 100 },
  proposeContent: { padding: 16, paddingBottom: 100 },
  blockTeamSection: { backgroundColor: '#111', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#222', gap: 8 },
  blockTeamHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  blockTeamName: { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 0.4, textTransform: 'uppercase' },
  blockTeamCount: { color: '#666', fontSize: 10, fontWeight: '800', marginTop: 2 },
  blockTeamDmBtn: { borderRadius: 8, paddingVertical: 7, paddingHorizontal: 10, borderWidth: 1, borderColor: '#4444ff', backgroundColor: '#151528' },
  blockTeamDmText: { color: '#8888ff', fontSize: 10, fontWeight: '900' },
  blockPlayerRow: { minHeight: 62, borderRadius: 10, borderWidth: 1, borderColor: '#242424', backgroundColor: '#171717', padding: 8, flexDirection: 'row', alignItems: 'center', gap: 9 },
  blockPlayerPhoto: { width: 42, height: 42, borderRadius: 6, backgroundColor: '#0a0a0a' },
  blockPlayerFallback: { width: 42, height: 42, borderRadius: 6, backgroundColor: '#1a1a2a', alignItems: 'center', justifyContent: 'center' },
  blockPlayerInitial: { color: '#8888ff', fontSize: 16, fontWeight: '900' },
  blockPlayerInfo: { flex: 1, minWidth: 0 },
  blockPlayerTopLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  blockPlayerName: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '900' },
  blockPlayerMoney: { color: '#00ff87', fontSize: 10, fontWeight: '900' },
  blockPlayerMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  blockPlayerMeta: { flex: 1, color: '#888', fontSize: 10, fontWeight: '800' },
  blockTierBadge: { maxWidth: 116, borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  blockTierText: { fontSize: 8, fontWeight: '900', letterSpacing: 0.3 },
  blockOfferBtn: { borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: '#00ff87', backgroundColor: '#062417' },
  blockOfferText: { color: '#00ff87', fontSize: 10, fontWeight: '900' },
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
