import { Fragment, useEffect, useState } from 'react';
import { loadSalaryOverrides, getEffectiveSalary } from '@/utils/salaryOverrides';
import { scanCustomPlayerReferences, executeCustomPlayerDelete } from '@/utils/deleteCustomPlayer';
import FranchisePlayerRow from '@/components/FranchisePlayerRow';
import PlayerCard, { leagueDateFromRecord } from '@/components/PlayerCard';
import { comparePlayersByTierForYear } from '@/constants/playstyle';
import { getPositionGroups, groupForPosition } from '@/constants/positionGroups';
import { getPositionFilters } from '@/domain/sports/playerFields';
import { compareRosterPlayersByValue, matchesRosterPosition } from '@/domain/nba/rotation';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '@/constants/firebase';
import { getTeamColors } from '@/constants/teamColors';
import { getSportTeamTheme } from '@/constants/sportTeams';
import SportTeamLogo from '@/components/SportTeamLogo';
import { pickLabel } from '@/constants/draftPicks';
import { displayScheduleTeamLabel } from '@/domain/nba/scheduleView';

const getPlayerKey = (p: any) => p?.player_id || p?.bref_id || p?.full_name || '';

function formatRosterMoney(value: any) {
  const salary = Number(value);
  if (!Number.isFinite(salary) || salary <= 0) return '';
  if (salary <= 1_500_000) return '$Min';
  return '$' + (salary / 1_000_000).toFixed(salary >= 10_000_000 ? 0 : 1) + 'M';
}

function contractSummary(player: any) {
  const salary = formatRosterMoney(player?.salary || player?.contract?.salary || player?.currentSalary);
  const years = Number(player?.contractYears ?? player?.contract?.years);
  const role = String(player?.contractRole || player?.contract?.role || '').replace(/_/g, ' ');
  const parts = [
    salary,
    Number.isFinite(years) && years > 0 ? `${years}Y` : '',
    role ? role.replace(/\b\w/g, char => char.toUpperCase()) : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Contract not listed';
}

function rosterStatusBadges({ isUntouchable, isOnBlock, isLocked }: { isUntouchable: boolean; isOnBlock: boolean; isLocked: boolean }) {
  if (isUntouchable) return [{ label: 'Untouchable', color: '#ff6464' }];
  if (isLocked) return [{ label: 'In Trade', color: '#F5A623' }];
  if (isOnBlock) return [{ label: 'Block Feed', color: '#5b9bff' }];
  return [];
}

export default function TeamRosterScreen() {
  const { leagueId, teamId, eraTeamId, abbr: cpuAbbr, isCpu } = useLocalSearchParams<{ leagueId: string; teamId: string; eraTeamId?: string; abbr?: string; isCpu?: string }>();
  const [team, setTeam] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentYear, setCurrentYear] = useState<number | undefined>(undefined);
  const [leagueDate, setLeagueDate] = useState<string | Date | null>(null);
  const [leagueEra, setLeagueEra] = useState<string>('');
  const [sport, setSport] = useState<string>('nba');
  const [lockedKeys, setLockedKeys] = useState<Set<string>>(new Set());
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const [profilesByName, setProfilesByName] = useState<Record<string, any>>({});
  const [isLeagueCommissioner, setIsLeagueCommissioner] = useState(false);
  const [posFilter, setPosFilter] = useState('ALL');
  const [rosterViewMode, setRosterViewMode] = useState<'roster' | 'picks'>('roster');
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
          setSport(d.sport || 'nba');
          setLeagueDate(leagueDateFromRecord(d));
          const myUid_ = auth.currentUser?.uid;
          const commUids_ = [d.commissionerId, ...(d.coCommissioners || [])].filter(Boolean);
          setIsLeagueCommissioner(!!myUid_ && commUids_.includes(myUid_));
        }
        if (teamSnap.exists()) {
          setTeam({ id: teamSnap.id, ...teamSnap.data() });
        } else if (isCpu === '1' || eraTeamId || cpuAbbr) {
          // Vacant CPU team — build a read-only roster from the era pool
          const ld2 = leagueSnap.exists() ? (leagueSnap.data() as any) : {};
          const eraKey = ld2.era || 'current';
          const poolKey = (ld2.sport && ld2.sport !== 'nba') ? ld2.sport : eraKey;
          const poolSnap = await getDoc(doc(db, 'era_player_pools', poolKey));
          const poolPlayers = poolSnap.exists() ? ((poolSnap.data() as any).players || []) : [];
          let cpuName = cpuAbbr || 'CPU Team';
          try {
            const eraTeamsSnap = await getDocs(collection(db, 'era_rosters', eraKey, 'teams'));
            const et = eraTeamsSnap.docs.map(d => d.data() as any).find((t: any) => String(t.id) === String(eraTeamId) || t.abbreviation === cpuAbbr);
            if (et) cpuName = et.full_name;
          } catch {}
          const cpuPlayers = poolPlayers.filter((p: any) => p.team === cpuAbbr);
          setTeam({ id: teamId, abbreviation: cpuAbbr, name: cpuName, players: cpuPlayers, gmId: null, isCpu: true, vacant: true });
        }
        // Compute which of this team's players are locked in active trades.
        // Trade rooms are private to their two participants, so this can only be
        // computed for your own team — skip it for others (the query would be
        // denied by security rules and isn't readable anyway).
        const targetUid = teamSnap.data()?.gmId;
        if (targetUid && targetUid === auth.currentUser?.uid) {
          try {
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
          } catch (e) { console.warn('trade-lock check skipped', e); }
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

            // Fetch vault data for year-specific tier badges
            const brefIds: string[] = enrichedPlayers
              .map((p: any) => p.bref_id || (p.player_id ? String(p.player_id).match(/^(?:current|pool_\d+)_([a-z0-9]+)$/i)?.[1] : null))
              .filter(Boolean);
            // Dual-read pattern: vault first, profile fallback during migration
            const vaultSnaps = await Promise.all(brefIds.map(bid => getDoc(doc(db, 'players', bid as string))));
            const profMap: Record<string, any> = {};
            const missingBrefIds: string[] = [];

            vaultSnaps.forEach((snap, i) => {
              if (snap.exists()) {
                const data = snap.data() as any;
                profMap[data.full_name] = data;
              } else {
                missingBrefIds.push(brefIds[i] as string);
              }
            });

            setProfilesByName(profMap);
          }
        } catch (e) { console.error('team enrich failed', e); }
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [leagueId, teamId]);

  // Resolve the owner's display name (team docs only store gmId)
  useEffect(() => {
    if (!team?.gmId || team.gmName) return;
    (async () => {
      try {
        const u = await getDoc(doc(db, 'users', team.gmId));
        const ud = u.data() as any;
        if (ud) setTeam((prev: any) => prev ? { ...prev, gmName: ud.displayName || (ud.username ? '@' + ud.username : 'GM') } : prev);
      } catch {}
    })();
  }, [team?.gmId, team?.gmName]);

  if (loading || !team) {
    return <View style={styles.loadingContainer}><ActivityIndicator color="#00ff87" /></View>;
  }

  const abbr = team.abbreviation || 'ATL';
  const isNBARoster = !sport || sport === 'nba';
  const sportTheme = getSportTeamTheme(sport || 'nba', abbr);
  const colors = isNBARoster ? getTeamColors(abbr, currentYear) : [sportTheme.tintColor, sportTheme.titleColor];
  const isOwned = !!team.gmId;
  const isMyTeam = team.gmId === myUid;
  const untouchables: string[] = team.untouchables || [];
  const tradeBlock: string[] = team.tradeBlock || [];
  const players: any[] = team.players || [];
  const positionFilters = getPositionFilters(sport);

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
      // CPU / vacant team → commissioner-approved CPU trade flow
      router.push({ pathname: '/screens/cpu-trade', params: {
        leagueId,
        cpuTeamId: String(eraTeamId || team.teamId || ''),
        cpuAbbr: team.abbreviation || '',
        cpuName: team.name || '',
        prefillGet: pid,
      } });
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
        <SportTeamLogo sport={sport || 'nba'} abbr={abbr} era={currentYear} style={styles.teamLogo} textColor="#ffffff" fontSize={16} />
        <View style={{ flex: 1 }}>
          <Text style={styles.teamName}>{displayScheduleTeamLabel(team.name || team.abbreviation, team.teamId || team.id || eraTeamId)}</Text>
          <Text style={styles.teamMeta}>{team.wins || 0}–{team.losses || 0}</Text>
          <Text style={styles.teamGm}>{isOwned ? (team.gmName || 'GM') : 'Unowned'}</Text>
        </View>
      </View>

      {team.picks && team.picks.length > 0 ? (
        <View style={styles.viewTabs}>
          <TouchableOpacity
            style={[styles.viewTab, rosterViewMode === 'roster' && styles.viewTabActive]}
            onPress={() => setRosterViewMode('roster')}
          >
            <Text style={[styles.viewTabText, rosterViewMode === 'roster' && styles.viewTabTextActive]}>
              ROSTER ({players.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewTab, rosterViewMode === 'picks' && styles.viewTabActive]}
            onPress={() => setRosterViewMode('picks')}
          >
            <Text style={[styles.viewTabText, rosterViewMode === 'picks' && styles.viewTabTextActive]}>
              PICKS ({team.picks.length})
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {rosterViewMode === 'picks' ? (
        <>
          <Text style={styles.sectionLabel}>PICKS ({team.picks.length})</Text>
          <View style={styles.picksList}>
            {[...team.picks].sort((a: any, b: any) => (a.year - b.year) || (a.round - b.round)).map((pk: any, i: number) => (
              <View key={pk.id || i} style={styles.pickCard}>
                <Text style={styles.pickYear}>{pk.year}</Text>
                <View style={styles.pickInfo}>
                  <Text style={styles.pickTitle}>{pickLabel(pk).replace(String(pk.year), '').trim()}</Text>
                  <Text style={styles.pickMeta}>{pk.originalTeam && pk.originalTeam !== abbr ? `via ${pk.originalTeam}` : 'Own pick'}</Text>
                </View>
              </View>
            ))}
          </View>
        </>
      ) : (
        <>
          <Text style={styles.sectionLabel}>ROSTER ({players.length})</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.posFilterScroll}>
            <View style={styles.posFilters}>
              {positionFilters.map(pos => (
                <TouchableOpacity
                  key={pos}
                  style={[styles.posBtn, posFilter === pos && styles.posBtnActive]}
                  onPress={() => setPosFilter(pos)}
                >
                  <Text style={[styles.posBtnText, posFilter === pos && styles.posBtnTextActive]}>{pos}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {players.length === 0 ? (
        <Text style={styles.empty}>No players on this roster.</Text>
      ) : (() => {
        // For MLB/NFL, order by position group so the roster reads like a depth chart.
        const groups = getPositionGroups(sport);
        const displayPlayers = [...players]
          .filter((p: any) => matchesRosterPosition(p, posFilter))
          .sort((a: any, b: any) => groups
            ? groupForPosition(sport, a.position).index - groupForPosition(sport, b.position).index || compareRosterPlayersByValue(a, b)
            : compareRosterPlayersByValue(a, b));
        return displayPlayers.map((p: any, i: number) => {
        const grpLabel = groups ? groupForPosition(sport, p.position).label : '';
        const showHeader = !!groups && (i === 0 || grpLabel !== groupForPosition(sport, displayPlayers[i - 1].position).label);
        const pid = getPlayerKey(p);
        const isUntouchable = untouchables.includes(pid);
        const isLocked = lockedKeys.has(pid);
        const isOnBlock = tradeBlock.includes(pid);
        const canTrade = isOwned && !isMyTeam && !isUntouchable && !isLocked;
        const canCpuTrade = !team.gmId && !isMyTeam;
        const statuses = rosterStatusBadges({ isUntouchable, isOnBlock, isLocked });
        return (
          <Fragment key={pid + i}>
            {showHeader ? <Text style={styles.posGroupHeader}>{grpLabel}</Text> : null}
            <FranchisePlayerRow
              player={p}
              index={i}
              sport={sport || 'nba'}
              era={leagueEra}
              currentYear={currentYear}
              leagueDate={leagueDate}
              profilesByName={profilesByName}
              salary={p.salary || p.contract?.salary || p.currentSalary}
              salaryLabel={contractSummary(p)}
              statusLabels={statuses}
              selected={isUntouchable || isOnBlock || isLocked}
              gradeCount={6}
              onPress={() => setSelectedPlayer(p)}
              action={(canTrade || canCpuTrade)
                ? {
                    label: 'Trade',
                    variant: 'primary',
                    onPress: () => handleProposeTrade(p),
                  }
                : {
                    label: '›',
                    variant: 'ghost',
                    onPress: () => setSelectedPlayer(p),
                  }}
            />
          </Fragment>
        );
       });
      })()}
        </>
      )}

      <View style={{ height: 60 }} />
      <PlayerCard
        player={selectedPlayer}
        era={leagueEra}
        sport={sport || 'nba'}
        leagueId={leagueId}
        teamId={team?.id || ''}
        leagueDate={leagueDate}
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
  posFilterScroll: { marginBottom: 10 },
  posFilters: { flexDirection: 'row', gap: 6, paddingRight: 10 },
  posBtn: { minWidth: 44, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#141414', borderWidth: 1, borderColor: '#2a2a2a', alignItems: 'center' },
  posBtnActive: { backgroundColor: '#092817', borderColor: '#00ff87' },
  posBtnText: { color: '#777', fontSize: 11, fontWeight: '800' },
  posBtnTextActive: { color: '#00ff87' },
  viewTabs: { flexDirection: 'row', gap: 8, padding: 4, borderRadius: 12, backgroundColor: '#101010', borderWidth: 1, borderColor: '#242424', marginBottom: 16 },
  viewTab: { flex: 1, minHeight: 42, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  viewTabActive: { backgroundColor: '#071f14', borderColor: '#00ff87' },
  viewTabText: { color: '#777', fontSize: 12, fontWeight: '900' },
  viewTabTextActive: { color: '#00ff87' },
  picksList: { gap: 10, marginBottom: 18 },
  pickCard: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 62, backgroundColor: '#101c14', borderWidth: 1, borderColor: '#1f5f3a', borderRadius: 12, padding: 12 },
  pickYear: { width: 52, color: '#00ff87', fontSize: 16, fontWeight: '900' },
  pickInfo: { flex: 1 },
  pickTitle: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  pickMeta: { color: '#777', fontSize: 11, fontWeight: '700', marginTop: 2 },
  picksRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  pickChip: { backgroundColor: '#101c14', borderWidth: 1, borderColor: '#1f5f3a', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  pickChipText: { color: '#00ff87', fontSize: 12, fontWeight: '700' },
  pickChipOrigin: { color: '#6a6a6a', fontSize: 10, marginTop: 2 },
  posGroupHeader: { color: '#00ff87', fontSize: 12, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 14, marginBottom: 8 },
  empty: { color: '#666', textAlign: 'center', padding: 20 },
  playerRow: { position: 'relative', overflow: 'hidden', flexDirection: 'row', alignItems: 'center', padding: 12, paddingLeft: 14, borderRadius: 12, marginBottom: 10, backgroundColor: '#111', borderWidth: 1, borderColor: '#242424', gap: 10 },
  playerAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  playerRowUntouchable: { borderColor: '#ff4444', backgroundColor: '#1a0a0a' },
  playerRowLocked: { borderColor: '#F5A623', backgroundColor: '#1a1306' },
  playerRowOnBlock: { borderColor: '#3B82F6', backgroundColor: '#0a1530' },
  playerRankBadge: { width: 28, height: 34, borderRadius: 8, backgroundColor: '#1d1d1d', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#2d2d2d' },
  playerRankText: { color: '#777', fontSize: 12, fontWeight: '900' },
  photo: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, backgroundColor: '#171717' },
  photoFallback: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  photoInitial: { color: '#888', fontSize: 18, fontWeight: '700' },
  playerInfo: { flex: 1 },
  playerPos: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  playerHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tierBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, maxWidth: 132 },
  tierBadgeText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.3 },
  playerName: { color: '#fff', fontSize: 16, fontWeight: '900', marginTop: 2 },
  playerSalary: { color: '#9a9a9a', fontSize: 11, fontWeight: '700', marginTop: 2, textTransform: 'capitalize' },
  gradePreviewRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 },
  gradePill: { minWidth: 58, borderWidth: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5 },
  gradePillLabel: { fontSize: 9, fontWeight: '900' },
  gradePillValue: { fontSize: 10, fontWeight: '900' },
  statusRow: { flexDirection: 'row', gap: 8, marginTop: 7 },
  statusText: { fontSize: 10, fontWeight: '900' },
  lockReason: { color: '#ff4444', fontSize: 10, fontWeight: '700', marginTop: 2 },
  tradeBtn: { backgroundColor: '#0a2a1a', borderWidth: 1, borderColor: '#00ff87', paddingHorizontal: 11, paddingVertical: 8, borderRadius: 8 },
  tradeBtnText: { color: '#00ff87', fontSize: 11, fontWeight: '900' },
  openCardHint: { color: '#555', fontSize: 26, fontWeight: '300', paddingHorizontal: 2 },
});
