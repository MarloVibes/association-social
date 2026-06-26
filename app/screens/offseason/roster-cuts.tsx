import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import GlobalNav from '@/components/GlobalNav';
import { auth, db, functions } from '@/constants/firebase';
import { rosterCompliance, rosterPayroll } from '@/domain/offseason/rosterCuts';
import type { OffseasonState } from '@/domain/offseason/types';

type Player = {
  id?: string;
  player_id?: string;
  full_name?: string;
  name?: string;
  position?: string;
  salary?: number;
  overall?: number;
  contractType?: string;
  contract_type?: string;
  rosterSlot?: string;
  slot?: string;
};

type Team = {
  id: string;
  name?: string;
  gmId?: string;
  players?: Player[];
  salaryCap?: number;
  budget?: number;
};

type League = {
  name?: string;
  sport?: string;
  salaryCap?: number;
  teamBudget?: number;
  offseason?: OffseasonState;
};

function playerId(player: Player): string {
  return String(player.player_id || player.id || player.full_name || player.name || '');
}

function playerName(player: Player): string {
  return player.full_name || player.name || 'Unnamed player';
}

function money(value: number): string {
  return value >= 1000000 ? `$${(value / 1000000).toFixed(1)}M` : `$${Math.round(value / 1000)}K`;
}

function isTwoWayPlayer(player: Player): boolean {
  const type = String(player.contractType || player.contract_type || player.rosterSlot || player.slot || '').trim().toLowerCase();
  return type === 'two_way' || type === 'two-way' || type === 'twoway' || type === 'two way';
}

export default function RosterCutsScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const router = useRouter();
  const uid = auth.currentUser?.uid;
  const [league, setLeague] = useState<League | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!leagueId) return;
    const unsubscribeLeague = onSnapshot(doc(db, 'leagues', leagueId), snapshot => {
      if (!snapshot.exists()) {
        router.back();
        return;
      }
      setLeague(snapshot.data() as League);
      setLoading(false);
    });
    const unsubscribeTeams = onSnapshot(
      collection(db, 'leagues', leagueId, 'teams'),
      snapshot => {
        const mine = snapshot.docs.find(item => item.data().gmId === uid);
        setTeam(mine ? { id: mine.id, ...mine.data() } as Team : null);
      },
    );
    return () => {
      unsubscribeLeague();
      unsubscribeTeams();
    };
  }, [leagueId, router, uid]);

  const players = useMemo(
    () => [...(team?.players || [])].sort((left, right) => (
      String(left.position || '').localeCompare(String(right.position || ''))
      || playerName(left).localeCompare(playerName(right))
    )),
    [team?.players],
  );
  const financeLimit = league?.sport === 'mlb'
    ? team?.budget ?? league?.teamBudget ?? league?.salaryCap
    : team?.salaryCap ?? league?.salaryCap;
  const payroll = rosterPayroll(players);
  const standardPlayers = players.filter(player => !isTwoWayPlayer(player));
  const twoWayPlayers = players.filter(isTwoWayPlayer);
  const compliance = rosterCompliance(league?.sport || 'nba', {
    standard: standardPlayers.length,
    twoWay: twoWayPlayers.length,
    payroll,
    limit: financeLimit,
  });
  const isNba = (league?.sport || 'nba') === 'nba';
  const completed = Boolean(
    team && league?.offseason?.completedTeamIds?.includes(team.id),
  );

  const call = async (name: string, data: Record<string, unknown>) => {
    if (!leagueId || !league?.offseason) return;
    setWorking(true);
    try {
      await httpsCallable(functions, name)({
        leagueId,
        expectedVersion: league.offseason.version,
        ...data,
      });
    } catch (error: any) {
      Alert.alert('Roster action failed', error.message || 'Please try again.');
    } finally {
      setWorking(false);
    }
  };

  const cutPlayer = (player: Player) => {
    Alert.alert('Release player?', playerName(player), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Release',
        style: 'destructive',
        onPress: () => call('cutRosterPlayer', { playerId: playerId(player) }),
      },
    ]);
  };

  const complete = () => call('completeOffseasonTeamAction', {
    expectedStage: 'roster_cuts',
  });

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator color="#00e58b" size="large" /></View>;
  }

  return (
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.content}
        data={players}
        keyExtractor={playerId}
        ListHeaderComponent={(
          <>
            <View style={styles.header}>
              <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                <Ionicons color="#ffffff" name="chevron-back" size={24} />
              </TouchableOpacity>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>{league?.name || 'League'}</Text>
                <Text style={styles.title}>Roster Cuts</Text>
              </View>
              <View style={styles.iconButton} />
            </View>
            {!team ? (
              <Text style={styles.empty}>Claim a team to manage roster cuts.</Text>
            ) : (
              <>
                <View style={styles.summary}>
                  <View>
                    <Text style={styles.teamName}>{team.name || 'Your Team'}</Text>
                    <Text style={styles.summaryMeta}>
                      {isNba
                        ? `${standardPlayers.length}/${compliance.rosterLimit} standard · ${twoWayPlayers.length}/${compliance.twoWayLimit} Two-way`
                        : `${players.length}/${compliance.rosterLimit} players`}
                      {' · '}{money(payroll)}
                      {Number.isFinite(financeLimit) ? ` / ${money(Number(financeLimit))}` : ''}
                    </Text>
                  </View>
                  <Ionicons
                    color={compliance.valid ? '#00e58b' : '#f4b942'}
                    name={compliance.valid ? 'checkmark-circle' : 'warning'}
                    size={24}
                  />
                </View>
                {!compliance.valid && (
                  <Text style={styles.warning}>
                    {compliance.errors.includes('standard_roster_limit') ? 'Reduce standard roster spots. ' : ''}
                    {compliance.errors.includes('two_way_limit') ? 'Reduce two-way slots. ' : ''}
                    {compliance.errors.includes('roster_limit') ? 'Reduce your roster size. ' : ''}
                    {compliance.errors.includes('financial_limit') ? 'Reduce team payroll. ' : ''}
                    {compliance.errors.includes('invalid_limit') ? 'A commissioner must set the sport finance limit.' : ''}
                  </Text>
                )}
                <TouchableOpacity
                  disabled={!compliance.valid || completed || working}
                  onPress={complete}
                  style={[styles.completeButton, (!compliance.valid || completed) && styles.disabled]}
                >
                  <Ionicons color="#07130d" name={completed ? 'checkmark' : 'flag'} size={19} />
                  <Text style={styles.completeText}>{completed ? 'Roster complete' : 'Finish roster cuts'}</Text>
                </TouchableOpacity>
                <Text style={styles.sectionTitle}>Players</Text>
              </>
            )}
          </>
        )}
        renderItem={({ item }) => (
          <View style={styles.playerRow}>
            <View style={styles.positionBadge}>
              <Text style={styles.positionText}>{item.position || '?'}</Text>
            </View>
            <View style={styles.playerCopy}>
              <Text style={styles.playerName}>{playerName(item)}</Text>
              <Text style={styles.playerMeta}>
                {[item.overall ? `${item.overall} OVR` : null, Number.isFinite(item.salary) ? money(Number(item.salary)) : null]
                  .filter(Boolean).join(' · ')}
              </Text>
            </View>
            <TouchableOpacity
              accessibilityLabel={`Release ${playerName(item)}`}
              disabled={working}
              onPress={() => cutPlayer(item)}
              style={styles.cutButton}
            >
              <Ionicons color="#d86d6d" name="remove-circle-outline" size={23} />
            </TouchableOpacity>
          </View>
        )}
      />
      <GlobalNav />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#090b0a' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#090b0a' },
  content: { paddingBottom: 130 },
  header: {
    minHeight: 96,
    paddingTop: 42,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#242825',
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, alignItems: 'center' },
  eyebrow: { color: '#777f79', fontSize: 12, fontWeight: '600' },
  title: { color: '#ffffff', fontSize: 20, fontWeight: '800' },
  empty: { color: '#777f79', fontSize: 14, padding: 28, textAlign: 'center' },
  summary: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#1d211e',
  },
  teamName: { color: '#ffffff', fontSize: 21, fontWeight: '800' },
  summaryMeta: { color: '#7d857f', fontSize: 12, marginTop: 5 },
  warning: { color: '#d7bd78', fontSize: 13, lineHeight: 19, paddingHorizontal: 20, paddingTop: 14 },
  completeButton: {
    minHeight: 48,
    margin: 16,
    borderRadius: 7,
    backgroundColor: '#00e58b',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  completeText: { color: '#07130d', fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.35 },
  sectionTitle: { color: '#ffffff', fontSize: 16, fontWeight: '800', paddingHorizontal: 20, paddingVertical: 14 },
  playerRow: {
    minHeight: 68,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1b1f1c',
  },
  positionBadge: {
    width: 38,
    height: 38,
    borderRadius: 6,
    backgroundColor: '#18251e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  positionText: { color: '#00e58b', fontSize: 11, fontWeight: '800' },
  playerCopy: { flex: 1 },
  playerName: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  playerMeta: { color: '#69706b', fontSize: 12, marginTop: 3 },
  cutButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
});
