import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { addDoc, arrayUnion, collection, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, query, where } from 'firebase/firestore';
import { useCallback, useMemo, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';
import GlobalNav from '@/components/GlobalNav';
import FranchisePlayerRow from '@/components/FranchisePlayerRow';
import PlayerCard, { leagueDateFromRecord } from '@/components/PlayerCard';
import { getPositionFilters } from '@/domain/sports/playerFields';
import { getFreeAgentAction } from '@/domain/offseason/viewModel';
import { compareSportRosterPlayersByValue, matchesSportRosterPosition } from '@/domain/sports/rosterValue';
import { displayScheduleTeamLabel } from '@/domain/nba/scheduleView';
import { scanCustomPlayerReferences, executeCustomPlayerDelete } from '@/utils/deleteCustomPlayer';

export default function RosterScreen() {
  const { leagueId, sport, teamId, era } = useLocalSearchParams<{
    leagueId: string; sport: string; teamId: string; era?: string;
  }>();

  const [team, setTeam] = useState<any>(null);
  const [allEraPlayers, setAllEraPlayers] = useState<any[]>([]);
  const [takenPlayerIds, setTakenPlayerIds] = useState<Set<string>>(new Set());
  const [takenPlayerNames, setTakenPlayerNames] = useState<Set<string>>(new Set());
  const [droppedPlayerNames, setDroppedPlayerNames] = useState<Set<string>>(new Set());
  const [myPlayerIds, setMyPlayerIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState('ALL');
  const [activeTab, setActiveTab] = useState<'my_team' | 'free_agents'>('my_team');
  const [league, setLeague] = useState<any>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const [profilesByName, setProfilesByName] = useState<Record<string, any>>({});
  const [isLeagueCommissioner, setIsLeagueCommissioner] = useState(false);
  const [currentYear, setCurrentYear] = useState<number | undefined>(undefined);

  const eraKey = (era && era !== 'null' && era !== '') ? era : 'current';
  const authoritativeSport = league?.sport || sport || 'nba';
  const positionFilters = getPositionFilters(authoritativeSport);
  const rosterComparator = useMemo(() => compareSportRosterPlayersByValue(authoritativeSport), [authoritativeSport]);
  const activityTeamLabel = () => displayScheduleTeamLabel(
    team?.name || team?.abbreviation,
    team?.teamId || teamId || 'Team',
    authoritativeSport,
  );

  useEffect(() => { loadData(); }, [teamId, eraKey]);

  // Refresh when returning to this screen (e.g., after creating a player)
  useFocusEffect(
    useCallback(() => { loadData(); }, [teamId, eraKey])
  );

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

      const leagueSnap = await getDoc(doc(db, 'leagues', leagueId));
      if (leagueSnap.exists()) {
        const ldata = leagueSnap.data();
        setLeague(ldata);
        if (ldata.currentYear) setCurrentYear(ldata.currentYear);
        const myUid_ = auth.currentUser?.uid;
        const commUids_ = [ldata.commissionerId, ...(ldata.coCommissioners || [])].filter(Boolean);
        setIsLeagueCommissioner(!!myUid_ && commUids_.includes(myUid_));
      }

      // Authoritative sport from the league doc — the nav param can be mismapped
      // via SPORT_KEY (madden->nfl), so read the source of truth here.
      const docSport = (leagueSnap.exists() && (leagueSnap.data() as any).sport) || 'nba';
      const isNBADoc = docSport === 'nba';
      const docPoolKey = isNBADoc ? eraKey : docSport;

      const allTeamsSnap = await getDocs(collection(db, 'leagues', leagueId, 'teams'));
      const claimedPlayerIds = new Set<string>();
      const claimedPlayerNames = new Set<string>();
      allTeamsSnap.docs.forEach(d => {
        const teamData = d.data();
        (teamData.players || []).forEach((p: any) => {
          const pid = p.player_id;
          if (pid) claimedPlayerIds.add(pid);
          if (p.full_name) claimedPlayerNames.add(p.full_name);
        });
      });
      // Note: 'taken' and 'takenNames' are populated after we load the pool + free agents below.
      // We defer this until pool data is available.

      // Load era player pool
      let poolPlayers: any[] = [];
      const poolSnap = await getDoc(doc(db, 'era_player_pools', docPoolKey));
      if (poolSnap.exists()) {
        poolPlayers = poolSnap.data().players || [];
      } else {
        const sportKey = docSport === 'madden' ? 'nfl' : docSport === 'mlb' ? 'mlb' : 'nba';
        const rosterSnap = await getDoc(doc(db, 'rosters', sportKey));
        if (rosterSnap.exists()) {
          poolPlayers = rosterSnap.data().players || [];
        }
      }

      // Load league free agents (dropped players + draft classes unlocked by season advancement)
      const freeAgentsSnap = await getDocs(collection(db, 'leagues', leagueId, 'free_agents'));
      const leagueFreeAgents: any[] = [];
      const freeAgentIds = new Set<string>();
      const freeAgentNames = new Set<string>();
      freeAgentsSnap.docs.forEach(d => {
        const players = d.data().players || [];
        leagueFreeAgents.push(...players);
        players.forEach((p: any) => {
          if (p.player_id) freeAgentIds.add(p.player_id);
          if (p.full_name) freeAgentNames.add(p.full_name);
        });
      });

      // ALSO: load vault-tagged free agents (NBA only — the 'players' vault is
      // basketball; MLB/NFL free agents come from their own sport pool above).
      if (isNBADoc) {
      const vaultEra = (leagueSnap.exists() && (leagueSnap.data() as any).era) || 'current';
      try {
        const vaultFAQ = query(collection(db, 'players'), where('free_in_eras', 'array-contains', vaultEra));
        const vaultFASnap = await getDocs(vaultFAQ);
        vaultFASnap.docs.forEach(d => {
          const data = d.data() as any;
          // Map vault doc to the player shape roster expects
          const player = {
            player_id: vaultEra + '_' + d.id,
            bref_id: d.id,
            full_name: data.full_name,
            first_name: data.first_name || '',
            last_name: data.last_name || '',
            position: data.position || '',
            team: '',     // free agent has no team
            jersey_number: data.jersey_number || '',
            age: 0,
            birth_year: null,
            salary: 0,
            from_vault: true,
          };
          // Skip if this name is already in pool or leagueFreeAgents (avoid dupes)
          if (!freeAgentNames.has(player.full_name)) {
            leagueFreeAgents.push(player);
            freeAgentIds.add(player.player_id);
            freeAgentNames.add(player.full_name);
          }
        });
      } catch (e) {
        console.warn('vault free agents fetch failed', e);
      }
      } // end isNBA vault free agents

      // MLB/NFL: load the sport free-agent pool (fringe/depth players not on a
      // real roster) so GMs have signable players from day one.
      if (!isNBADoc) {
        try {
          const faSnap = await getDoc(doc(db, 'era_player_pools', docPoolKey + '_fa'));
          const faPlayers = faSnap.data()?.players || [];
          faPlayers.forEach((p: any) => {
            if (!freeAgentNames.has(p.full_name || '')) {
              leagueFreeAgents.push({ ...p, team: '', from_fa_pool: true });
              if (p.player_id) freeAgentIds.add(p.player_id);
              if (p.full_name) freeAgentNames.add(p.full_name);
            }
          });
        } catch (e) { console.warn('FA pool load failed', e); }
      }

      // Build 'taken' set from pool: every pool player is taken EXCEPT free agents.
      // Then force-add anyone on a claimed team (in case trades moved them).
      const taken = new Set<string>();
      const takenNames = new Set<string>();
      poolPlayers.forEach((p: any) => {
        const pid = p.player_id;
        if (pid && !freeAgentIds.has(pid) && !freeAgentNames.has(p.full_name || '')) {
          taken.add(pid);
          if (p.full_name) takenNames.add(p.full_name);
        }
      });
      claimedPlayerIds.forEach(pid => taken.add(pid));
      claimedPlayerNames.forEach(n => takenNames.add(n));
      setTakenPlayerIds(taken);
      setTakenPlayerNames(takenNames);

      // Load custom players created in this league (now in vault per Phase 4)
      // Dual-read: vault first, fall back to old subcollection during migration
      let customPlayers: any[] = [];
      try {
        const vaultCustomQ = isNBADoc
          ? query(
              collection(db, 'players'),
              where('is_custom', '==', true),
              where('created_by_league', '==', leagueId)
            )
          : query(
              collection(db, 'players'),
              where('is_custom', '==', true),
              where('created_by_league', '==', leagueId),
              where('sport', '==', docSport)
            );
        const vaultCustomSnap = await getDocs(vaultCustomQ);
        customPlayers = vaultCustomSnap.docs
          .map(d => ({ ...d.data() } as any))
          .filter(p => isNBADoc ? !p.sport || p.sport === 'nba' : p.sport === docSport);
      } catch (e) {
        console.warn('vault custom players fetch failed, falling back', e);
        const customSnap = await getDocs(collection(db, 'leagues', leagueId, 'custom_players'));
        customPlayers = customSnap.docs
          .map(d => ({ ...d.data() } as any))
          .filter(p => isNBADoc ? !p.sport || p.sport === 'nba' : p.sport === docSport);
      }

      // Enrich players with era_stats so playstyles compute correctly (NBA only;
      // MLB/NFL pools already carry their own stats from the enrichment scripts).
      try {
        const statsMap: Record<string, any> = {};
        if (isNBADoc) {
          const statsEraKey = (leagueSnap.exists() && (leagueSnap.data() as any).era) || 'current';
          const statsSnap = await getDoc(doc(db, 'era_stats', statsEraKey));
          if (statsSnap.exists()) {
            (statsSnap.data().players || []).forEach((p: any) => { statsMap[p.name] = p; });
          }
        }
        const enrichedPool = [...poolPlayers, ...leagueFreeAgents, ...customPlayers].map(p => ({
          ...p, ...(statsMap[p.full_name] || {}),
        }));
        setAllEraPlayers(enrichedPool);

        // Fetch profiles for tier-by-year computation
        try {
          // Use teamSnap from earlier in the function (already loaded at the top)
          const teamSnapData = await getDoc(doc(db, 'leagues', leagueId, 'teams', teamId));
          const myPlayerObjs = (teamSnapData.exists() ? (teamSnapData.data() as any).players : []) || [];
          const brefIds: string[] = myPlayerObjs
            .map((p: any) => p.bref_id || (p.player_id ? String(p.player_id).match(/^(?:current|pool_\d+)_([a-z0-9]+)$/i)?.[1] : null))
            .filter(Boolean);
          if (brefIds.length > 0) {
            // Dual-read pattern: vault first, profile fallback during migration
            const vaultSnaps = await Promise.all(brefIds.map(bid => getDoc(doc(db, 'players', bid as string))));
            const profMap: Record<string, any> = {};
            const missingBrefIds: string[] = [];

            vaultSnaps.forEach((snap, i) => {
              if (snap.exists()) {
                const pdata = snap.data() as any;
                profMap[pdata.full_name] = pdata;
              } else {
                missingBrefIds.push(brefIds[i] as string);
              }
            });

            setProfilesByName(profMap);
          }
        } catch (e) { console.error('profile fetch failed', e); }
      } catch (e) {
        console.error('era_stats enrich failed', e);
        setAllEraPlayers([...poolPlayers, ...leagueFreeAgents, ...customPlayers]);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const myTeamPlayers = useMemo(() => {
    if (!team) return [];
    const players = team.players || [];
    let list: any[];
    if (players.length > 0 && typeof players[0] === 'object') {
      // Enrich team players with era_stats too
      list = players.map((p: any) => {
        const enriched = allEraPlayers.find(ep => ep.full_name === p.full_name);
        return enriched ? { ...p, ...enriched } : p;
      });
    } else {
      list = allEraPlayers.filter(p => myPlayerIds.includes(p.player_id));
    }
    return [...list]
      .filter(p => matchesSportRosterPosition(p, posFilter, authoritativeSport))
      .sort(rosterComparator);
  }, [team, allEraPlayers, myPlayerIds, posFilter, rosterComparator, authoritativeSport]);

  const freeAgents = useMemo(() => {
    const isDraftMode = league?.mode === 'draft';
    const isRandomMode = league?.mode === 'random' || league?.mode === 'current';
    return allEraPlayers.filter(p => {
      const pid = p.player_id || p.id;
      const q = search.toLowerCase().trim();
      const matchesSearch = !q
        || (p.full_name || '').toLowerCase().startsWith(q)
        || (p.first_name || '').toLowerCase().startsWith(q)
        || (p.last_name || '').toLowerCase().startsWith(q);
      const matchesPos = matchesSportRosterPosition(p, posFilter, authoritativeSport);
      // In draft mode - show ALL players not already on a roster
      if (isDraftMode) {
        const isTaken = takenPlayerIds.has(pid) || takenPlayerNames.has(p.full_name || '');
        return matchesSearch && matchesPos && !isTaken;
      }
      // In random/current mode - show all untaken players
      if (isRandomMode) {
        const isTaken = takenPlayerIds.has(pid) || takenPlayerNames.has(p.full_name || '');
        return matchesSearch && matchesPos && !isTaken;
      }
      // Legacy - teamless or dropped players
      const hasNoTeam = !p.team || p.team === '';
      const wasDropped = !takenPlayerNames.has(p.full_name || '') && !takenPlayerIds.has(pid) && p.team && droppedPlayerNames.has(p.full_name || '');
      return matchesSearch && matchesPos && (hasNoTeam || wasDropped);
    }).sort(rosterComparator);
  }, [allEraPlayers, takenPlayerIds, takenPlayerNames, droppedPlayerNames, league?.mode, search, posFilter, rosterComparator, authoritativeSport]);

  const handlePlayerAction = (player: any, isOwned: boolean | undefined = true) => {
    if (isOwned === undefined) {
      // Free agent
      Alert.alert(player.full_name || player.name, 'Free Agent', [
        { text: '✍️ Sign Player', onPress: () => handleAddPlayer(player) },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    if (isOwned) {
      // My player — trade, block, untouchable, drop
      Alert.alert(player.full_name || player.name, 'What would you like to do?', [
        { text: '🤝 Trade Player', onPress: () => tradeMyPlayer(player) },
        { text: '🔄 Trade Block', onPress: () => toggleTradeBlock(player) },
        { text: '🔒 Untouchable', onPress: () => toggleUntouchable(player) },
        { text: '❌ Drop', style: 'destructive', onPress: () => handleDropPlayer(player) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else {
      // Opponent's player — target or propose trade
      Alert.alert(player.full_name || player.name, 'What would you like to do?', [
        { text: '🎯 Add to Target List', onPress: () => addToTargetList(player) },
        { text: '🤝 Offer Trade', onPress: () => offerTrade(player) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const toggleUntouchable = async (player: any) => {
    const user = auth.currentUser;
    if (!user || !teamId) return;
    try {
      const teamSnap = await getDoc(doc(db, 'leagues', leagueId, 'teams', teamId));
      const current = teamSnap.data()?.untouchables || [];
      const pid = player.player_id || player.full_name;
      const updated = current.includes(pid) ? current.filter((x: string) => x !== pid) : [...current, pid];
      await updateDoc(doc(db, 'leagues', leagueId, 'teams', teamId), { untouchables: updated });
      Alert.alert(current.includes(pid) ? 'Removed from Untouchables' : 'Added to Untouchables', player.full_name);
    } catch(e: any) { Alert.alert('Error', e.message); }
  };

  const addToTargetList = async (player: any) => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      // Find my team and all teams (to determine player's owner)
      const teamsSnap = await getDocs(collection(db, 'leagues', leagueId, 'teams'));
      const allTeams = teamsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      const myTeam = allTeams.find(t => t.gmId === user.uid);
      if (!myTeam) { Alert.alert('No team', 'You need a team to add targets.'); return; }
      const current = myTeam.targetList || [];
      const pid = player.player_id || player.full_name;
      if (current.includes(pid)) { Alert.alert('Already targeted', player.full_name + ' is already on your target list.'); return; }
      await updateDoc(doc(db, 'leagues', leagueId, 'teams', myTeam.id), { targetList: [...current, pid] });

      // Find which team owns this player
      const ownerTeam = allTeams.find((t: any) =>
        (t.players || []).some((p: any) => (p.player_id || p.full_name) === pid)
      );

      // If owned by ANOTHER team, notify that team's GM only (no public activity)
      if (ownerTeam && ownerTeam.gmId && ownerTeam.gmId !== user.uid) {
        try {
          await updateDoc(doc(db, 'users', ownerTeam.gmId), {
            notifications: arrayUnion({
              type: 'target_interest',
              leagueId,
              fromTeamId: myTeam.id,
              fromTeamName: myTeam.name || 'A team',
              playerName: player.full_name || player.name,
              createdAt: new Date().toISOString(),
              message: (myTeam.name || 'A team') + ' is interested in ' + (player.full_name || player.name),
              read: false,
            }),
          });
        } catch (e) {
          console.warn('Failed to notify target owner', e);
        }
      }
      // Free agent or own team: no notification, no activity log

      Alert.alert('🎯 Added to Target List', player.full_name);
    } catch(e: any) { Alert.alert('Error', e.message); }
  };

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
              loadData();
            } catch (e: any) { Alert.alert('Error', e.message); }
          }},
        ]
      );
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const tradeMyPlayer = async (player: any) => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      const teamsSnap = await getDocs(collection(db, 'leagues', leagueId, 'teams'));
      const teams = teamsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      const otherTeams = teams.filter((t: any) => t.gmId && t.gmId !== user.uid);
      if (otherTeams.length === 0) {
        Alert.alert('No teams to trade with', 'There are no other teams with GMs in this league.');
        return;
      }
      const buttons: any[] = otherTeams.map((t: any) => ({
        text: displayScheduleTeamLabel(t.name || t.abbreviation, t.teamId || t.id || 'Team', authoritativeSport),
        onPress: () => {
          router.push({
            pathname: '/screens/trade-room',
            params: {
              leagueId,
              otherUid: t.gmId,
              otherTeamId: t.id,
              otherTeamName: displayScheduleTeamLabel(t.name || t.abbreviation, t.teamId || t.id || 'Opponent', authoritativeSport),
              prefillMyPlayer: JSON.stringify(player),
            },
          });
        },
      }));
      buttons.push({ text: 'Cancel', style: 'cancel' });
      Alert.alert('Trade ' + (player.full_name || player.name) + ' to...', 'Pick a team', buttons);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const offerTrade = async (player: any) => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      // Find which team in this league owns this player
      const teamsSnap = await getDocs(collection(db, 'leagues', leagueId, 'teams'));
      const teams = teamsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      const pid = player.player_id || player.full_name;
      const ownerTeam = teams.find((t: any) => (t.players || []).some((p: any) => (p.player_id || p.full_name) === pid));
      if (!ownerTeam) {
        Alert.alert('Free Agent', 'This player is not on a team. Sign them instead of trading.');
        return;
      }
      if (ownerTeam.gmId === user.uid) {
        Alert.alert('Your player', 'You already own this player.');
        return;
      }
      if (!ownerTeam.gmId) {
        Alert.alert('No GM', 'This team has no GM yet.');
        return;
      }
      router.push({
        pathname: '/screens/trade-room',
        params: {
          leagueId,
          otherUid: ownerTeam.gmId,
          otherTeamId: ownerTeam.id,
          otherTeamName: ownerTeam.name || 'Opponent',
          prefillPlayer: JSON.stringify(player),
        },
      });
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const toggleTradeBlock = async (player: any) => {
    const pid = player.player_id || player.id;
    try {
      const teamSnap = await getDoc(doc(db, 'leagues', leagueId, 'teams', teamId));
      const teamData = teamSnap.data() || {};
      const tradeBlock = teamData.tradeBlock || [];
      const isOnBlock = tradeBlock.includes(pid);
      await updateDoc(doc(db, 'leagues', leagueId, 'teams', teamId), {
        tradeBlock: isOnBlock ? tradeBlock.filter((p: string) => p !== pid) : [...tradeBlock, pid],
      });
      // Post to league activity feed
      if (!isOnBlock) {
        await addDoc(collection(db, 'leagues', leagueId, 'activity'), {
          type: 'tradeblock',
          message: (teamData.name || 'A GM') + ' added ' + (player.full_name || player.name) + ' to the trade block',
          leagueId,
          uid: auth.currentUser?.uid,
          createdAt: serverTimestamp(),
        });
        // Notify all league members
        const leagueSnap = await getDoc(doc(db, 'leagues', leagueId));
        const memberIds: string[] = leagueSnap.data()?.members || [];
        const leagueNameFetched = leagueSnap.data()?.name || '';
        for (const memberId of memberIds) {
          if (memberId === auth.currentUser?.uid) continue;
          try {
            await updateDoc(doc(db, 'users', memberId), {
              notifications: arrayUnion({
                type: 'tradeblock',
                leagueId,
                leagueName: leagueNameFetched,
                message: (teamData.name || 'A GM') + ' added ' + (player.full_name || player.name) + ' to the trade block',
                createdAt: new Date().toISOString(),
              })
            });
          } catch (innerErr: any) {
            console.error('TRADEBLOCK NOTIFY FAILED:', memberId, innerErr?.code, innerErr?.message);
            Alert.alert('Notify failed', memberId + ' — ' + (innerErr?.code || 'unknown') + ': ' + (innerErr?.message || String(innerErr)));
          }
        }
      }
      Alert.alert(
        isOnBlock ? 'Removed' : 'Added to Trade Block',
        (player.full_name || player.name) + (isOnBlock ? ' removed from trade block.' : ' added to trade block.')
      );
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleAddPlayer = (player: any) => {
    const freeAgentAction = getFreeAgentAction(league?.offseason?.stage);
    if (freeAgentAction === 'offer') {
      router.push({ pathname: '/screens/offseason/free-agency', params: { leagueId } });
      return;
    }
    if (freeAgentAction === 'closed') {
      Alert.alert('Signings closed', 'Free-agent signings are not available during this offseason stage.');
      return;
    }
    Alert.alert(
      '✍️ Sign ' + (player.full_name || player.name) + '?',
      'Add this player to your roster?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign', onPress: () => confirmAddPlayer(player) },
      ]
    );
  };

  const confirmAddPlayer = async (player: any) => {
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
        teamName: activityTeamLabel(),
        message: activityTeamLabel() + ' signed ' + (player.full_name || player.name),
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
          await setDoc(doc(db, 'leagues', leagueId, 'free_agents', `drops_${currentYear || eraKey}`), {
            players: arrayUnion({ ...player, team: '', releasedAt: new Date().toISOString(), playerUpgradeCredits: player.playerUpgradeCredits || {} }),
          }, { merge: true });
          // Post to activity feed
          await addDoc(collection(db, 'leagues', leagueId, 'activity'), {
            type: 'drop',
            playerName: player.full_name || player.name,
            uid: auth.currentUser?.uid,
            teamName: activityTeamLabel(),
            message: activityTeamLabel() + ' dropped ' + (player.full_name || player.name),
            createdAt: serverTimestamp(),
          });
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

      {(activeTab === 'my_team' || activeTab === 'free_agents') && (
        <>
          {activeTab === 'free_agents' ? (
            <>
              <TouchableOpacity
                style={styles.createPlayerBanner}
                onPress={() => router.push({
                  pathname: '/screens/create-player',
                  params: { leagueId, era: league?.currentSeason || '', sport: authoritativeSport },
                })}
                activeOpacity={0.85}
              >
                <Text style={styles.createPlayerBannerIcon}>+</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.createPlayerBannerTitle}>Create Player</Text>
                  <Text style={styles.createPlayerBannerSub}>Add a custom player to the free agent pool</Text>
                </View>
                <Text style={styles.createPlayerBannerArrow}>›</Text>
              </TouchableOpacity>
              <TextInput
                style={styles.searchInput}
                placeholder='Search free agents...'
                placeholderTextColor='#555'
                value={search}
                onChangeText={setSearch}
              />
            </>
          ) : null}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.posFilterScroll}
            contentContainerStyle={styles.posFilterContent}
          >
            <View style={styles.posFilters}>
              {positionFilters.map(pos => (
                <TouchableOpacity
                  key={pos}
                  style={[styles.posBtn, posFilter === pos && styles.posBtnActive]}
                  onPress={() => setPosFilter(pos)}
                >
                  <Text
                    style={[styles.posBtnText, posFilter === pos && styles.posBtnTextActive]}
                    numberOfLines={1}
                    allowFontScaling={false}
                  >
                    {String(pos).toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </>
      )}

      <FlatList
        data={currentData}
        keyExtractor={(item) => String(item.player_id || item.id)}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            {activeTab === 'my_team' ? (
              <Text style={styles.emptyText}>No players on your roster yet.</Text>
            ) : (
              <>
                <Text style={styles.emptyText}>
                  {league?.era === 'magic_bird'
                    ? 'Free agency was extremely limited in the 1983-84 era.'
                    : league?.era === 'jordan'
                    ? 'Free agency was limited in the 1991-92 era.'
                    : 'No free agents available right now.'}
                </Text>
                {(league?.era === 'magic_bird' || league?.era === 'jordan') && (
                  <Text style={[styles.emptyText, { fontSize: 13, marginTop: 8, color: '#666' }]}>
                    Players become available when teams drop them or when the season advances and a new draft class arrives.
                  </Text>
                )}
              </>
            )}
          </View>
        }
        renderItem={({ item, index }) => {
          const pid = item.player_id || item.id;
          const isMine = activeTab === 'my_team';
          const myUntouchables: string[] = (team?.untouchables || []) as string[];
          const myTradeBlock: string[] = (team?.tradeBlock || []) as string[];
          const isUntouchable = isMine && myUntouchables.includes(pid);
          const isOnBlock = isMine && !isUntouchable && myTradeBlock.includes(pid);
          const isRetiring = item.retirement_year && item.birth_year && item.age && item.age >= (item.retirement_year - item.birth_year - 1);
          const statusLabels = [
            isUntouchable ? { label: 'Untouchable', tone: 'danger' as const } : null,
            isOnBlock ? { label: 'On Block', tone: 'info' as const } : null,
            isRetiring ? { label: 'Retiring', tone: 'danger' as const } : null,
          ].filter(Boolean) as { label: string; tone: 'danger' | 'info' }[];
          return (
            <FranchisePlayerRow
              player={item}
              index={index}
              sport={authoritativeSport}
              era={eraKey}
              currentYear={currentYear}
              leagueDate={leagueDateFromRecord(league)}
              profilesByName={profilesByName}
              salary={item.salary || item.contract?.salary || item.currentSalary}
              meta={[item.position, item.jersey_number ? '#' + item.jersey_number : null, item.age ? 'Age ' + item.age : null].filter(Boolean).join(' · ')}
              statusLabels={statusLabels}
              selected={isUntouchable || isOnBlock}
              gradeCount={6}
              onPress={() => setSelectedPlayer(item)}
              onLongPress={() => {
                const onMyTeam = myPlayerIds.includes(item.player_id || item.id);
                const isOpponent = !onMyTeam && (item.teamName || (item.team && item.team !== ''));
                handlePlayerAction(item, !isOpponent);
              }}
              action={activeTab === 'my_team'
                ? {
                    label: '⇄',
                    variant: 'neutral',
                    onPress: () => handlePlayerAction(item, true),
                  }
                : {
                    label: '+ Sign',
                    variant: 'primary',
                    onPress: () => handleAddPlayer(item),
                  }}
            />
          );
        }}
      />
      <PlayerCard
        player={selectedPlayer}
        era={eraKey}
        sport={authoritativeSport}
        leagueId={leagueId}
        teamId={teamId}
        leagueDate={leagueDateFromRecord(league)}
        visible={!!selectedPlayer}
        onClose={() => setSelectedPlayer(null)}
        isOwned={selectedPlayer ? (() => {
          const pid = selectedPlayer.player_id || selectedPlayer.id;
          if (myPlayerIds.includes(pid)) return true;
          // Check if on another team's roster
          const isFreeAgent = activeTab === 'free_agents';
          if (isFreeAgent) return undefined;
          // On someone else's team
          return false;
        })() : undefined}
        onDrop={selectedPlayer && myPlayerIds.includes(selectedPlayer.player_id || selectedPlayer.id) ? () => {
          setSelectedPlayer(null);
          handleDropPlayer(selectedPlayer);
        } : undefined}
        onSign={selectedPlayer && !myPlayerIds.includes(selectedPlayer.player_id || selectedPlayer.id) && !selectedPlayer.team && !selectedPlayer.teamName ? () => {
          setSelectedPlayer(null);
          handleAddPlayer(selectedPlayer);
        } : undefined}
        onAddToTargetList={selectedPlayer ? () => {
          setSelectedPlayer(null);
          addToTargetList(selectedPlayer);
        } : undefined}
        onOfferTrade={selectedPlayer ? () => {
          setSelectedPlayer(null);
          offerTrade(selectedPlayer);
        } : undefined}
        onEditCustom={selectedPlayer?.isCustom && (selectedPlayer.createdBy === auth.currentUser?.uid || isLeagueCommissioner) ? () => {
          const pid = selectedPlayer.player_id;
          setSelectedPlayer(null);
          router.push({
            pathname: '/screens/create-player',
            params: { leagueId, era: (league as any)?.era || '2024-25', sport: authoritativeSport, customId: pid },
          });
        } : undefined}
        onDeleteCustom={selectedPlayer?.isCustom && (selectedPlayer.createdBy === auth.currentUser?.uid || isLeagueCommissioner) ? () => {
          const p = selectedPlayer;
          setSelectedPlayer(null);
          handleDeleteCustomPlayer(p);
        } : undefined}
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
  posFilterScroll: { marginBottom: 10 },
  posFilterContent: { paddingHorizontal: 20 },
  posFilters: { flexDirection: 'row', gap: 8 },
  posBtn: { minWidth: 54, height: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: '#141414', borderWidth: 1, borderColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  posBtnActive: { backgroundColor: '#092817', borderColor: '#00ff87' },
  posBtnText: { color: '#777', fontSize: 12, fontWeight: '900', textAlign: 'center', letterSpacing: 0 },
  posBtnTextActive: { color: '#00ff87' },
  createPlayerBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0a2a1a', borderWidth: 1, borderColor: '#00ff87', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginHorizontal: 16, marginTop: 4, marginBottom: 10, gap: 12 },
  createPlayerBannerIcon: { color: '#00ff87', fontSize: 28, fontWeight: '900', width: 30, textAlign: 'center' },
  createPlayerBannerTitle: { color: '#00ff87', fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
  createPlayerBannerSub: { color: '#88bb99', fontSize: 11, marginTop: 2 },
  createPlayerBannerArrow: { color: '#00ff87', fontSize: 22, fontWeight: '300' },
  listContent: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 100 },
  emptyContainer: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: '#555', fontSize: 15 },
  playerCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#141414', borderRadius: 14, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#252525', gap: 12 },
  playerCardUntouchable: { borderWidth: 1, borderColor: '#ff4444', backgroundColor: '#1a0a0a' },
  playerCardOnBlock: { borderWidth: 1, borderColor: '#3B82F6', backgroundColor: '#0a1530' },
  playerStatusRed: { color: '#ff4444', fontSize: 10, fontWeight: '700', marginTop: 2 },
  playerStatusBlue: { color: '#3B82F6', fontSize: 10, fontWeight: '700', marginTop: 2 },
  playerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  tierBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  tierBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  playerPortraitWrap: { width: 54, alignItems: 'center', justifyContent: 'center' },
  playerAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#2a2a2a', borderWidth: 1, borderColor: '#00ff87', alignItems: 'center', justifyContent: 'center' },
  playerHeadshot: { width: 48, height: 48, borderRadius: 24 },
  playerAvatarText: { color: '#00ff87', fontSize: 11, fontWeight: '700' },
  bestGradeBadge: { marginTop: -8, backgroundColor: '#050505', borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  bestGradeText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.4 },
  playerInfo: { flex: 1 },
  playerName: { color: '#ffffff', fontSize: 15, fontWeight: '800', marginBottom: 3 },
  playerMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  playerMeta: { color: '#666', fontSize: 12 },
  gradeChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 9 },
  gradeChip: { minWidth: 47, borderWidth: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 4 },
  gradeChipLabel: { color: '#777', fontSize: 8, fontWeight: '900', letterSpacing: 0.5 },
  gradeChipValue: { fontSize: 12, fontWeight: '900', marginTop: 1 },
  gradeFallback: { color: '#777', fontSize: 11, fontWeight: '600', marginTop: 8 },
  addBtn: { backgroundColor: '#00ff87', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  addBtnText: { color: '#000', fontSize: 13, fontWeight: '700' },
  moveBtn: { backgroundColor: '#1a1a2a', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#4444ff' },
  moveBtnText: { color: '#8888ff', fontSize: 18, fontWeight: '700' },
  dropBtn: { backgroundColor: '#2a0a0a', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#ff3333' },
  dropBtnText: { color: '#ff3333', fontSize: 13, fontWeight: '700' },
  retireBadge: { backgroundColor: '#2a0a0a', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#ff4444' },
  retireBadgeText: { color: '#ff4444', fontSize: 10, fontWeight: '700' },
});
