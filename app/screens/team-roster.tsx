import { useEffect, useState } from 'react';
import { loadSalaryOverrides, getEffectiveSalary } from '@/utils/salaryOverrides';
import PlayerCard from '@/components/PlayerCard';
import { getPlaystyle, getPlaystyleForYear, comparePlayersByTierForYear } from '@/constants/playstyle';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getTeamColors, getTeamLogoUrl } from '@/constants/teamColors';

const firebaseConfig = {
  apiKey: "AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY",
  projectId: "association-social",
};
if (!getApps().length) initializeApp(firebaseConfig);
const db = getFirestore();
const auth = getAuth();

const getPlayerKey = (p: any) => p?.player_id || p?.bref_id || p?.full_name || '';

export default function TeamRosterScreen() {
  const { leagueId, teamId } = useLocalSearchParams<{ leagueId: string; teamId: string }>();
  const [team, setTeam] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentYear, setCurrentYear] = useState<number | undefined>(undefined);
  const [leagueEra, setLeagueEra] = useState<string>('');
  const [lockedKeys, setLockedKeys] = useState<Set<string>>(new Set());
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const [profilesByName, setProfilesByName] = useState<Record<string, any>>({});
  const [isLeagueCommissioner, setIsLeagueCommissioner] = useState(false);
  const myUid = auth.currentUser?.uid;

  useEffect(() => {
    if (!leagueId || !teamId) return;
    (async () => {
      try {
        const [leagueSnap, teamSnap] = await Promise.all([
          getDoc(doc(db, 'leagues', leagueId)),
          getDoc(doc(db, 'leagues', leagueId, 'teams', teamId)),
        ]);
        if (leagueSnap.exists()) {
          const d = leagueSnap.data() as any;
          if (d.currentYear) setCurrentYear(d.currentYear);
          setLeagueEra(d.era || 'current');
          const myUid_ = auth.currentUser?.uid;
          const commUids_ = [d.commissionerId, ...(d.coCommissioners || [])].filter(Boolean);
          setIsLeagueCommissioner(!!myUid_ && commUids_.includes(myUid_));
        }
        if (teamSnap.exists()) {
          setTeam({ id: teamSnap.id, ...teamSnap.data() });
        }
        // Compute which of this team's players are locked in active trades
        const targetUid = teamSnap.data()?.gmId;
        if (targetUid) {
          const ACTIVE = ['open', 'live', 'pushed', 'countered'];
          const hostQ = query(collection(db, 'leagues', leagueId, 'trade_rooms'), where('hostUid', '==', targetUid));
          const guestQ = query(collection(db, 'leagues', leagueId, 'trade_rooms'), where('guestUid', '==', targetUid));
          const [hostSnap, guestSnap] = await Promise.all([getDocs(hostQ), getDocs(guestQ)]);
          const locked = new Set<string>();
          [...hostSnap.docs, ...guestSnap.docs].forEach(d => {
            const data = d.data() as any;
            if (!ACTIVE.includes(data.status)) return;
            const theirOffer = data.hostUid === targetUid ? (data.hostOffer || []) : (data.guestOffer || []);
            theirOffer.forEach((p: any) => locked.add(getPlayerKey(p)));
          });
          setLockedKeys(locked);
        }

        // Enrich team players with era_stats so playstyles compute correctly
        try {
          const eraKey = leagueSnap.exists() ? ((leagueSnap.data() as any).era || 'current') : 'current';
          const statsSnap = await getDoc(doc(db, 'era_stats', eraKey));
          const statsMap: Record<string, any> = {};
          if (statsSnap.exists()) {
            (statsSnap.data().players || []).forEach((p: any) => { statsMap[p.name] = p; });
          }
          if (teamSnap.exists()) {
            const teamData = teamSnap.data() as any;
            const enrichedPlayers = (teamData.players || []).map((p: any) => ({
              ...p, ...(statsMap[p.full_name] || {}),
            }));
            enrichedPlayers.sort(comparePlayersByTierForYear({}, currentYear));
        const _overrides = await loadSalaryOverrides(leagueId);
        const _playersWithOverrides = (enrichedPlayers || []).map((_p: any) => ({ ..._p, salary: getEffectiveSalary(_p, _overrides) }));
        setTeam({ id: teamSnap.id, ...teamData, players: _playersWithOverrides });

            // Fetch player_profiles for year-specific tier badges
            const brefIds: string[] = enrichedPlayers
              .map((p: any) => p.bref_id || (p.player_id ? String(p.player_id).match(/^(?:current|pool_\d+)_([a-z0-9]+)$/i)?.[1] : null))
              .filter(Boolean);
            const profileSnaps = await Promise.all(brefIds.map(bid => getDoc(doc(db, 'player_profiles', bid as string))));
            const profMap: Record<string, any> = {};
            profileSnaps.forEach((snap, i) => {
              if (snap.exists()) {
                const data = snap.data() as any;
                profMap[data.full_name] = data;
              }
            });
            setProfilesByName(profMap);
          }
        } catch (e) { console.error('team enrich failed', e); }
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [leagueId, teamId]);

  if (loading || !team) {
    return <View style={styles.loadingContainer}><ActivityIndicator color="#00ff87" /></View>;
  }

  const colors = getTeamColors(team.abbr || 'ATL', currentYear);
  const logo = getTeamLogoUrl(team.abbr || 'ATL', currentYear);
  const isOwned = !!team.gmId;
  const isMyTeam = team.gmId === myUid;
  const untouchables: string[] = team.untouchables || [];
  const tradeBlock: string[] = team.tradeBlock || [];
  const players: any[] = team.players || [];

  const handleDeleteCustomPlayer = async (p: any) => {
    try {
      const scan = await scanCustomPlayerReferences(leagueId, p);
      const refLines: string[] = [];
      if (scan.references.length > 0) {
        scan.references.forEach(r => {
          const flags = [
            r.onRoster && 'roster',
            r.onBlock && 'trade block',
            r.untouchable && 'untouchables',
            r.onTargetList && 'targets',
          ].filter(Boolean).join(', ');
          refLines.push('\u2022 ' + r.teamName + ' (' + flags + ')');
        });
      }
      if (scan.activeTradeRooms > 0) {
        refLines.push('\u2022 ' + scan.activeTradeRooms + ' active trade room' + (scan.activeTradeRooms === 1 ? '' : 's'));
      }
      const msg = refLines.length > 0
        ? 'This player is referenced in:\n\n' + refLines.join('\n') + '\n\nThey will be removed from all of these. Cannot be undone.'
        : 'This player has no roster or trade references. Cannot be undone.';
      Alert.alert(
        'Delete ' + p.full_name + '?',
        msg,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: async () => {
            try {
              await executeCustomPlayerDelete(leagueId, p);
              Alert.alert('Deleted', p.full_name + ' has been removed.');
              router.back();
            } catch (e: any) { Alert.alert('Error', e.message); }
          }},
        ]
      );
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleProposeTrade = (player: any) => {
    const pid = getPlayerKey(player);
    if (untouchables.includes(pid)) {
      Alert.alert('Untouchable', (team.gmName || 'The owner') + ' has marked ' + player.full_name + ' as untouchable. They will not consider trades for this player.');
      return;
    }
    if (lockedKeys.has(pid)) {
      Alert.alert('In Trade', player.full_name + ' is currently in an active trade negotiation. Try again later.');
      return;
    }
    if (!team.gmId) {
      Alert.alert('Unowned Team', 'This team has no GM. Trading with unowned teams is not yet supported.');
      return;
    }
    if (isMyTeam) {
      Alert.alert('Your Team', 'You cannot propose a trade with yourself.');
      return;
    }
    // Open trade room with this player preloaded on the opponent side
    router.push({
      pathname: '/screens/trade-room',
      params: {
        leagueId,
        otherUid: team.gmId,
        otherTeamId: team.id,
        otherTeamName: team.name || '',
        prefillPlayer: pid,
      } as any,
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.inner}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={{ width: 60 }} />
      </View>

      <View style={[styles.teamHeader, { backgroundColor: colors[0] + '80', borderColor: colors[0] }]}>
        <Image source={{ uri: logo }} style={styles.teamLogo} />
        <View style={{ flex: 1 }}>
          <Text style={styles.teamName}>{team.name || team.abbr}</Text>
          <Text style={styles.teamMeta}>{team.wins || 0}–{team.losses || 0}</Text>
          <Text style={styles.teamGm}>{isOwned ? '🧑 ' + (team.gmName || 'GM') : '🤖 Unowned'}</Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>ROSTER ({players.length})</Text>

      {players.length === 0 ? (
        <Text style={styles.empty}>No players on this roster.</Text>
      ) : players.map((p: any, i: number) => {
        const pid = getPlayerKey(p);
        const isUntouchable = untouchables.includes(pid);
        const isLocked = lockedKeys.has(pid);
        const isOnBlock = tradeBlock.includes(pid);
        // Extract bref_id from various player_id patterns: current_X, pool_YYYY_X, etc.
            let brefId = p.bref_id || '';
            if (!brefId && p.player_id) {
              const pid = String(p.player_id);
              const m = pid.match(/^(?:current|pool_\d+)_([a-z0-9]+)$/i);
              if (m) brefId = m[1];
            }
        const canTrade = isOwned && !isMyTeam && !isUntouchable && !isLocked;
        return (
          <TouchableOpacity key={pid + i} style={[styles.playerRow, isUntouchable && styles.playerRowUntouchable, !isUntouchable && isOnBlock && styles.playerRowOnBlock, isLocked && !isUntouchable && !isOnBlock && styles.playerRowLocked]} onPress={() => setSelectedPlayer(p)} activeOpacity={0.7}>
            {brefId ? (
              <Image source={{ uri: 'https://www.basketball-reference.com/req/202106291/images/headshots/' + brefId + '.jpg' }} style={styles.photo} />
            ) : (
              <View style={styles.photoFallback}><Text style={styles.photoInitial}>{(p.full_name || '?')[0]}</Text></View>
            )}
            <View style={styles.playerInfo}>
              <View style={styles.playerHeaderRow}>
                <Text style={styles.playerPos}>{p.position || '?'}</Text>
                {(() => {
                  const ps = getPlaystyleForYear(p, profilesByName[p.full_name], currentYear);
                  return (
                    <View style={[styles.tierBadge, { borderColor: ps.color + '88' }]}>
                      <Text style={[styles.tierBadgeText, { color: ps.color }]}>{ps.label}</Text>
                    </View>
                  );
                })()}
              </View>
              <Text style={styles.playerName}>{p.full_name}</Text>
              {p.salary && leagueEra === 'current' ? (
                <Text style={styles.playerSalary}>{p.salary <= 1272870 ? '$Min' : '$' + (p.salary / 1000000).toFixed(1) + 'M'}</Text>
              ) : null}
              {isUntouchable ? <Text style={styles.lockReason}>🔒 Untouchable</Text> : null}
              {isOnBlock && !isUntouchable ? <Text style={styles.onBlockReason}>💼 On Block</Text> : null}
              {isLocked && !isUntouchable && !isOnBlock ? <Text style={styles.lockReason}>⏳ In active trade</Text> : null}
            </View>
            {canTrade ? (
              <TouchableOpacity style={styles.tradeBtn} onPress={(e) => { e.stopPropagation?.(); handleProposeTrade(p); }}>
                <Text style={styles.tradeBtnText}>Propose Trade</Text>
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>
        );
      })}

      <View style={{ height: 60 }} />
      <PlayerCard
        player={selectedPlayer}
        era={leagueEra}
        leagueId={leagueId}
        teamId={team?.id || ''}
        visible={!!selectedPlayer}
        onClose={() => setSelectedPlayer(null)}
        isOwned={selectedPlayer ? (team?.gmId === myUid) : undefined}
        onOfferTrade={selectedPlayer && team?.gmId && team.gmId !== myUid ? () => {
          const p = selectedPlayer;
          setSelectedPlayer(null);
          handleProposeTrade(p);
        } : undefined}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  loadingContainer: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' },
  inner: { padding: 20, paddingTop: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  backText: { color: '#00ff87', fontSize: 15, fontWeight: '600' },
  teamHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 20, gap: 14 },
  teamLogo: { width: 60, height: 60 },
  teamName: { color: '#fff', fontSize: 22, fontWeight: '800' },
  teamMeta: { color: '#ccc', fontSize: 13, marginTop: 2 },
  teamGm: { color: '#888', fontSize: 12, marginTop: 2 },
  sectionLabel: { color: '#666', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 10 },
  empty: { color: '#666', textAlign: 'center', padding: 20 },
  playerRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, marginBottom: 6, backgroundColor: '#111', borderWidth: 1, borderColor: '#1a1a1a' },
  playerRowUntouchable: { borderColor: '#ff4444', backgroundColor: '#1a0a0a' },
  playerRowLocked: { borderColor: '#F5A623', backgroundColor: '#1a1306' },
  playerRowOnBlock: { borderColor: '#3B82F6', backgroundColor: '#0a1530' },
  onBlockReason: { color: '#3B82F6', fontSize: 10, fontWeight: '700', marginTop: 2 },
  photo: { width: 44, height: 44, borderRadius: 22, marginRight: 10 },
  photoFallback: { width: 44, height: 44, borderRadius: 22, marginRight: 10, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  photoInitial: { color: '#888', fontSize: 18, fontWeight: '700' },
  playerInfo: { flex: 1 },
  playerPos: { color: '#888', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  playerHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tierBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 0 },
  tierBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  playerName: { color: '#fff', fontSize: 14, fontWeight: '700', marginTop: 1 },
  playerSalary: { color: '#00ff87', fontSize: 11, fontWeight: '700', marginTop: 1 },
  lockReason: { color: '#ff4444', fontSize: 10, fontWeight: '700', marginTop: 2 },
  tradeBtn: { backgroundColor: '#0a2a1a', borderWidth: 1, borderColor: '#00ff87', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  tradeBtnText: { color: '#00ff87', fontSize: 11, fontWeight: '700' },
});
