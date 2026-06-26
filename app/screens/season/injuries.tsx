import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, db, functions } from '@/constants/firebase';
import type { InjuryEvent, InjurySeverity } from '@/domain/nba/injuries';

type Player = {
  id?: string;
  player_id?: string;
  playerId?: string;
  full_name?: string;
  name?: string;
};

type Team = {
  id: string;
  teamId?: string;
  abbreviation?: string;
  name?: string;
  gmId?: string;
  players?: Player[];
  injuries?: InjuryEvent[];
};

function playerId(player: Player) {
  return String(player.id || player.player_id || player.playerId || player.full_name || player.name || '');
}

function playerName(player: Player) {
  return String(player.full_name || player.name || playerId(player) || 'Player');
}

function teamLabel(team?: Team | null) {
  return team?.abbreviation || team?.name || team?.teamId || team?.id || 'Team';
}

export default function InjuriesScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const router = useRouter();
  const uid = auth.currentUser?.uid;
  const [league, setLeague] = useState<any>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [severity, setSeverity] = useState<InjurySeverity>('minor');
  const [gamesRemaining, setGamesRemaining] = useState('1');
  const [label, setLabel] = useState('Minor injury');
  const [working, setWorking] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!leagueId) return undefined;
    const unsubscribeLeague = onSnapshot(doc(db, 'leagues', leagueId), snapshot => {
      setLeague(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
    });
    const unsubscribeTeams = onSnapshot(collection(db, 'leagues', leagueId, 'teams'), snapshot => {
      const nextTeams = snapshot.docs.map(item => ({ id: item.id, ...item.data() } as Team));
      setTeams(nextTeams);
      setLoading(false);
    }, error => {
      Alert.alert('Unable to load injuries', error.message);
      setLoading(false);
    });
    return () => {
      unsubscribeLeague();
      unsubscribeTeams();
    };
  }, [leagueId]);

  const isLeagueAdmin = Boolean(
    uid
    && league
    && (
      league.commissionerId === uid
      || (league.coCommissioners || []).includes(uid)
    ),
  );
  const selectedTeam = useMemo(() => (
    teams.find(team => team.id === selectedTeamId)
    || teams.find(team => team.gmId === uid)
    || teams[0]
    || null
  ), [selectedTeamId, teams, uid]);
  const selectedPlayer = useMemo(() => (
    (selectedTeam?.players || []).find(player => playerId(player) === selectedPlayerId)
    || selectedTeam?.players?.[0]
    || null
  ), [selectedPlayerId, selectedTeam]);

  useEffect(() => {
    if (selectedTeam && !selectedTeamId) setSelectedTeamId(selectedTeam.id);
    if (selectedPlayer && !selectedPlayerId) setSelectedPlayerId(playerId(selectedPlayer));
  }, [selectedPlayer, selectedPlayerId, selectedTeam, selectedTeamId]);

  const manageInjury = async (action: any) => {
    if (!leagueId || !selectedTeam || !isLeagueAdmin) return;
    setWorking(true);
    try {
      const manageTeamInjury = httpsCallable(functions, 'manageTeamInjury');
      await manageTeamInjury({ leagueId, teamId: selectedTeam.id, action });
    } catch (error: any) {
      Alert.alert('Injury update failed', error.message || 'Please try again.');
    } finally {
      setWorking(false);
    }
  };

  const addInjury = () => {
    if (!selectedPlayer) return;
    const games = Number(gamesRemaining);
    if (!Number.isInteger(games) || games < 0) {
      Alert.alert('Games needed', 'Enter a valid number of games remaining.');
      return;
    }
    manageInjury({
      type: 'add',
      injury: {
        id: `manual-${playerId(selectedPlayer)}-${Date.now()}`,
        playerId: playerId(selectedPlayer),
        playerName: playerName(selectedPlayer),
        severity,
        gamesRemaining: games,
        label: label.trim() || (severity === 'minor' ? 'Minor injury' : 'Severe injury'),
        recoveryTag: severity === 'minor' ? 'day-to-day' : 'out',
      },
    });
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator color="#00e58b" size="large" /></View>;

  return (
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.content}
        data={selectedTeam?.injuries || []}
        keyExtractor={(item, index) => item.id || `${item.playerId}-${index}`}
        ListHeaderComponent={(
          <>
            <View style={styles.header}>
              <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                <Ionicons color="#ffffff" name="chevron-back" size={24} />
              </TouchableOpacity>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>{league?.name || 'League'}</Text>
                <Text style={styles.title}>Injuries</Text>
              </View>
            </View>
            {!isLeagueAdmin ? (
              <View style={styles.warning}>
                <Text style={styles.warningText}>Only commissioners can manage injuries.</Text>
              </View>
            ) : null}
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Team</Text>
              <View style={styles.chips}>
                {teams.map(team => (
                  <TouchableOpacity key={team.id} style={[styles.chip, selectedTeam?.id === team.id && styles.chipActive]} onPress={() => {
                    setSelectedTeamId(team.id);
                    setSelectedPlayerId('');
                  }}>
                    <Text style={[styles.chipText, selectedTeam?.id === team.id && styles.chipTextActive]}>{teamLabel(team)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            {isLeagueAdmin && selectedTeam ? (
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Add Injury</Text>
                <View style={styles.chips}>
                  {(selectedTeam.players || []).slice(0, 15).map(player => {
                    const id = playerId(player);
                    return (
                      <TouchableOpacity key={id} style={[styles.chip, selectedPlayer && playerId(selectedPlayer) === id && styles.chipActive]} onPress={() => setSelectedPlayerId(id)}>
                        <Text style={[styles.chipText, selectedPlayer && playerId(selectedPlayer) === id && styles.chipTextActive]}>{playerName(player)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={styles.segment}>
                  {(['minor', 'severe'] as InjurySeverity[]).map(option => (
                    <TouchableOpacity key={option} style={[styles.segmentButton, severity === option && styles.segmentButtonActive]} onPress={() => {
                      setSeverity(option);
                      setLabel(option === 'minor' ? 'Minor injury' : 'Severe injury');
                      setGamesRemaining(option === 'minor' ? '1' : '6');
                    }}>
                      <Text style={[styles.segmentText, severity === option && styles.segmentTextActive]}>{option === 'minor' ? 'Minor' : 'Severe'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput value={label} onChangeText={setLabel} placeholder="Injury label" placeholderTextColor="#666" style={styles.input} />
                <TextInput value={gamesRemaining} onChangeText={setGamesRemaining} keyboardType="number-pad" placeholder="Games remaining" placeholderTextColor="#666" style={styles.input} />
                <TouchableOpacity disabled={working || !selectedPlayer} style={[styles.actionButton, (working || !selectedPlayer) && styles.disabled]} onPress={addInjury}>
                  {working ? <ActivityIndicator color="#06130c" /> : <Text style={styles.actionText}>Add Injury</Text>}
                </TouchableOpacity>
              </View>
            ) : null}
            <Text style={styles.sectionTitle}>{teamLabel(selectedTeam)} Active Injuries</Text>
          </>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No active injuries for this team.</Text>}
        renderItem={({ item }) => (
          <View style={styles.injuryRow}>
            <View style={styles.injuryCopy}>
              <Text style={styles.injuryName}>{item.playerName || item.playerId || 'Player'}</Text>
              <Text style={styles.injuryMeta}>{item.label} · {item.gamesRemaining} games · {item.severity}</Text>
            </View>
            {isLeagueAdmin ? (
              <View style={styles.rowActions}>
                <TouchableOpacity disabled={working} style={styles.smallButton} onPress={() => manageInjury({ type: 'update', injuryId: item.id, patch: { gamesRemaining: Math.max(0, Number(item.gamesRemaining || 0) - 1) } })}>
                  <Ionicons color="#00e58b" name="remove" size={16} />
                </TouchableOpacity>
                <TouchableOpacity disabled={working} style={styles.smallButton} onPress={() => manageInjury({ type: 'remove', injuryId: item.id })}>
                  <Ionicons color="#ff6b6b" name="close" size={16} />
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050505' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#050505' },
  content: { padding: 18, paddingTop: 58, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  iconButton: { width: 42, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#151515' },
  headerCopy: { flex: 1 },
  eyebrow: { color: '#777', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  title: { color: '#fff', fontSize: 28, fontWeight: '900' },
  warning: { borderRadius: 8, borderWidth: 1, borderColor: '#6f5420', backgroundColor: '#171207', padding: 12, marginBottom: 12 },
  warningText: { color: '#d7bd78', fontSize: 12, fontWeight: '800' },
  panel: { borderRadius: 8, borderWidth: 1, borderColor: '#202020', backgroundColor: '#101010', padding: 12, marginBottom: 12 },
  panelTitle: { color: '#fff', fontSize: 14, fontWeight: '900', marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 34, borderRadius: 8, borderWidth: 1, borderColor: '#2a2a2a', paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  chipActive: { borderColor: '#00e58b66', backgroundColor: '#0a1d14' },
  chipText: { color: '#aaa', fontSize: 11, fontWeight: '900' },
  chipTextActive: { color: '#00e58b' },
  segment: { flexDirection: 'row', gap: 6, marginTop: 12, marginBottom: 10 },
  segmentButton: { flex: 1, minHeight: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#2a2a2a' },
  segmentButtonActive: { borderColor: '#00e58b66', backgroundColor: '#0a1d14' },
  segmentText: { color: '#aaa', fontSize: 12, fontWeight: '900' },
  segmentTextActive: { color: '#00e58b' },
  input: { minHeight: 42, borderRadius: 8, borderWidth: 1, borderColor: '#252525', backgroundColor: '#080808', color: '#fff', paddingHorizontal: 12, marginBottom: 8, fontSize: 13, fontWeight: '800' },
  actionButton: { minHeight: 42, borderRadius: 8, backgroundColor: '#00e58b', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  actionText: { color: '#06130c', fontSize: 12, fontWeight: '900' },
  disabled: { opacity: 0.55 },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: '900', marginBottom: 10 },
  empty: { color: '#777', fontSize: 14, lineHeight: 20 },
  injuryRow: { minHeight: 64, borderRadius: 8, borderWidth: 1, borderColor: '#202020', backgroundColor: '#111', padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  injuryCopy: { flex: 1, minWidth: 0 },
  injuryName: { color: '#fff', fontSize: 14, fontWeight: '900' },
  injuryMeta: { color: '#888', fontSize: 11, fontWeight: '800', marginTop: 4 },
  rowActions: { flexDirection: 'row', gap: 6 },
  smallButton: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#181818', borderWidth: 1, borderColor: '#2a2a2a' },
});
