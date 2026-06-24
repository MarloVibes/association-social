import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db, functions } from '@/constants/firebase';
import { COACHING_PRESETS, buildCoachingSnapshot, type CoachingPreset } from '@/domain/nba/coaching';
import type { NbaScheduleGame } from '@/domain/nba/schedule';

type Team = {
  id: string;
  name?: string;
  abbreviation?: string;
  gmId?: string;
  coachingPresets?: CoachingPreset[];
  defaultCoachingPresetId?: string;
};

type ScheduleDoc = {
  games?: MatchupGame[];
};

type MatchupGame = Omit<NbaScheduleGame, 'status'> & {
  status: NbaScheduleGame['status'] | 'requested' | 'preparing' | 'expired' | 'simulating';
  requestedByUid?: string;
  preparationDeadlineMs?: number;
};

export default function MatchupScreen() {
  const { leagueId, gameId } = useLocalSearchParams<{ leagueId: string; gameId: string }>();
  const router = useRouter();
  const uid = auth.currentUser?.uid;
  const [league, setLeague] = useState<any>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [schedule, setSchedule] = useState<ScheduleDoc | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState('balanced');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!leagueId) return;
    const unsubscribeLeague = onSnapshot(doc(db, 'leagues', leagueId), snapshot => {
      if (!snapshot.exists()) {
        setLoading(false);
        return;
      }
      const nextLeague = { id: snapshot.id, ...snapshot.data() } as any;
      setLeague(nextLeague);
      const scheduleId = nextLeague.scheduleId || String(nextLeague.currentYear || 2025);
      const unsubscribeSchedule = onSnapshot(doc(db, 'leagues', leagueId, 'schedules', scheduleId), scheduleSnapshot => {
        setSchedule(scheduleSnapshot.exists() ? scheduleSnapshot.data() as ScheduleDoc : null);
        setLoading(false);
      });
      return unsubscribeSchedule;
    });
    const unsubscribeTeams = onSnapshot(collection(db, 'leagues', leagueId, 'teams'), snapshot => {
      setTeams(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as Team)));
    });
    return () => {
      unsubscribeLeague();
      unsubscribeTeams();
    };
  }, [leagueId]);

  const game = useMemo<MatchupGame | null>(
    () => (schedule?.games || []).find(item => item.id === gameId) || null,
    [gameId, schedule?.games],
  );
  const myTeam = teams.find(team => team.gmId === uid && game && [game.homeTeamId, game.awayTeamId].includes(team.id));
  const opponentTeam = teams.find(team => game && team.id === (game.homeTeamId === myTeam?.id ? game.awayTeamId : game.homeTeamId));
  const presets = useMemo(() => {
    const byId = new Map<string, CoachingPreset>();
    [...COACHING_PRESETS, ...(myTeam?.coachingPresets || [])].forEach(preset => byId.set(preset.id, preset));
    return [...byId.values()];
  }, [myTeam?.coachingPresets]);

  useEffect(() => {
    if (myTeam?.defaultCoachingPresetId) setSelectedPresetId(myTeam.defaultCoachingPresetId);
  }, [myTeam?.defaultCoachingPresetId]);

  const call = async (name: string) => {
    if (!leagueId || !gameId) return;
    setWorking(true);
    try {
      const fn = httpsCallable(functions, name);
      await fn({ leagueId, gameId });
    } catch (error: any) {
      Alert.alert('Matchup action failed', error.message || 'Please try again.');
    } finally {
      setWorking(false);
    }
  };

  const savePrivatePrep = async () => {
    if (!leagueId || !league || !game || !myTeam) return;
    const preset = presets.find(item => item.id === selectedPresetId) || presets[0];
    setWorking(true);
    try {
      const scheduleId = league.scheduleId || String(league.currentYear || 2025);
      await updateDoc(doc(db, 'leagues', leagueId, 'schedules', scheduleId, 'preparation', `${game.id}_${myTeam.id}`), {
        teamId: myTeam.id,
        gameId: game.id,
        presetSnapshot: buildCoachingSnapshot(preset, myTeam.id, game.id),
        updatedAt: serverTimestamp(),
      });
      Alert.alert('Saved', 'Your private game prep has been saved.');
    } catch (error: any) {
      Alert.alert('Save failed', error.message || 'Please try again.');
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator color="#00e58b" size="large" /></View>;

  const canAccept = game?.status === 'requested' && game?.requestedByUid !== uid;
  const canRequest = game?.status === 'scheduled';
  const canSimulate = game && ['scheduled', 'preparing'].includes(game.status);

  return (
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.content}
        data={presets}
        keyExtractor={item => item.id}
        ListHeaderComponent={(
          <>
            <View style={styles.header}>
              <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                <Ionicons color="#ffffff" name="chevron-back" size={24} />
              </TouchableOpacity>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>{league?.name || 'League'}</Text>
                <Text style={styles.title}>Matchup</Text>
              </View>
            </View>
            {!game || !myTeam ? (
              <Text style={styles.empty}>This matchup is not available for your team.</Text>
            ) : (
              <>
                <View style={styles.summary}>
                  <Text style={styles.matchup}>{myTeam.abbreviation || myTeam.name} vs {opponentTeam?.abbreviation || opponentTeam?.name || 'Opponent'}</Text>
                  <Text style={styles.summaryMeta}>Status: {game.status}</Text>
                </View>
                <View style={styles.actionRow}>
                  {canRequest && (
                    <TouchableOpacity disabled={working} onPress={() => call('requestMatchup')} style={styles.actionButton}>
                      <Text style={styles.actionText}>Request</Text>
                    </TouchableOpacity>
                  )}
                  {canAccept && (
                    <TouchableOpacity disabled={working} onPress={() => call('acceptMatchup')} style={styles.actionButton}>
                      <Text style={styles.actionText}>Accept</Text>
                    </TouchableOpacity>
                  )}
                  {canSimulate && (
                    <TouchableOpacity disabled={working} onPress={() => call('simulateScheduledGame')} style={styles.actionButtonAlt}>
                      <Text style={styles.actionTextAlt}>Simulate</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={styles.sectionTitle}>Private Game Prep</Text>
              </>
            )}
          </>
        )}
        renderItem={({ item }) => {
          const selected = item.id === selectedPresetId;
          return (
            <TouchableOpacity style={[styles.presetRow, selected && styles.presetRowActive]} onPress={() => setSelectedPresetId(item.id)}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.presetName, selected && styles.presetNameActive]}>{item.name}</Text>
                <Text style={styles.presetMeta}>{item.offense.replace(/_/g, ' ')} · {item.defense.replace(/_/g, ' ')}</Text>
              </View>
              {selected && <Ionicons color="#00e58b" name="checkmark-circle" size={22} />}
            </TouchableOpacity>
          );
        }}
        ListFooterComponent={game && myTeam ? (
          <TouchableOpacity disabled={working} onPress={savePrivatePrep} style={styles.saveButton}>
            <Text style={styles.saveText}>Save Private Prep</Text>
          </TouchableOpacity>
        ) : null}
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
  empty: { color: '#aaa', fontSize: 14, lineHeight: 20, marginBottom: 16 },
  summary: { backgroundColor: '#101410', borderWidth: 1, borderColor: '#1f3328', borderRadius: 8, padding: 14, marginBottom: 14 },
  matchup: { color: '#fff', fontSize: 18, fontWeight: '900' },
  summaryMeta: { color: '#777', fontSize: 12, fontWeight: '700', marginTop: 4, textTransform: 'capitalize' },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  actionButton: { flex: 1, backgroundColor: '#00e58b', borderRadius: 8, alignItems: 'center', paddingVertical: 12 },
  actionButtonAlt: { flex: 1, backgroundColor: '#191919', borderRadius: 8, alignItems: 'center', paddingVertical: 12, borderWidth: 1, borderColor: '#00e58b55' },
  actionText: { color: '#06130c', fontSize: 13, fontWeight: '900' },
  actionTextAlt: { color: '#00e58b', fontSize: 13, fontWeight: '900' },
  sectionTitle: { color: '#888', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', marginBottom: 10 },
  presetRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#111', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#202020', marginBottom: 8 },
  presetRowActive: { backgroundColor: '#0a1d14', borderColor: '#00e58b' },
  presetName: { color: '#fff', fontSize: 14, fontWeight: '900' },
  presetNameActive: { color: '#00e58b' },
  presetMeta: { color: '#777', fontSize: 11, fontWeight: '700', marginTop: 3, textTransform: 'capitalize' },
  saveButton: { backgroundColor: '#00e58b', borderRadius: 8, alignItems: 'center', paddingVertical: 14, marginTop: 12 },
  saveText: { color: '#06130c', fontSize: 13, fontWeight: '900' },
});
