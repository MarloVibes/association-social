import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';
import { buildCpuRotation, rotationValidationMessages, validateRotation, type RotationSlot } from '@/domain/nba/rotation';

type Player = {
  player_id?: string;
  id?: string;
  bref_id?: string;
  full_name?: string;
  name?: string;
  position?: string;
  value?: number;
  rating?: number;
  overall?: number;
};

type Team = {
  id: string;
  name?: string;
  players?: Player[];
  rotation?: RotationSlot[];
};

function playerId(player: Player): string {
  return String(player.player_id || player.id || player.bref_id || player.full_name || player.name || '');
}

function playerName(player?: Player): string {
  return player?.full_name || player?.name || 'Unnamed player';
}

export default function RotationScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const router = useRouter();
  const uid = auth.currentUser?.uid;
  const [leagueSport, setLeagueSport] = useState('nba');
  const [team, setTeam] = useState<Team | null>(null);
  const [rotation, setRotation] = useState<RotationSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!leagueId) return;
    const unsubscribeLeague = onSnapshot(doc(db, 'leagues', leagueId), snapshot => {
      if (snapshot.exists()) setLeagueSport((snapshot.data() as any).sport || 'nba');
    });
    const unsubscribeTeams = onSnapshot(collection(db, 'leagues', leagueId, 'teams'), snapshot => {
      const mine = snapshot.docs.find(item => item.data().gmId === uid);
      if (!mine) {
        setTeam(null);
        setRotation([]);
        setLoading(false);
        return;
      }
      const nextTeam = { id: mine.id, ...mine.data() } as Team;
      setTeam(nextTeam);
      setRotation(Array.isArray(nextTeam.rotation) && nextTeam.rotation.length > 0
        ? nextTeam.rotation
        : buildCpuRotation(nextTeam.players || []));
      setLoading(false);
    });
    return () => {
      unsubscribeLeague();
      unsubscribeTeams();
    };
  }, [leagueId, uid]);

  const playersById = useMemo(
    () => new Map((team?.players || []).map(player => [playerId(player), player])),
    [team?.players],
  );
  const validation = useMemo(() => validateRotation(rotation), [rotation]);
  const validationMessages = useMemo(() => rotationValidationMessages(validation), [validation]);

  const autoBuildRotation = () => {
    if (!team) return;
    setRotation(buildCpuRotation(team.players || []));
  };

  const autoApplyRotation = async () => {
    if (!leagueId || !team) return;
    const nextRotation = buildCpuRotation(team.players || []);
    const nextValidation = validateRotation(nextRotation);
    if (!nextValidation.valid) {
      Alert.alert('Auto rotation needs work', rotationValidationMessages(nextValidation).join('\n'));
      return;
    }
    setSaving(true);
    try {
      setRotation(nextRotation);
      await updateDoc(doc(db, 'leagues', leagueId, 'teams', team.id), {
        rotation: nextRotation,
        rotationUpdatedAt: serverTimestamp(),
        rotationAutoAppliedAt: serverTimestamp(),
      });
      Alert.alert('Auto Applied', 'Minutes, starters, bench order, and closing lineup were saved.');
    } catch (error: any) {
      Alert.alert('Auto apply failed', error.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const updateMinutes = (playerIdValue: string, delta: number) => {
    setRotation(current => current.map(slot => (
      slot.playerId === playerIdValue
        ? { ...slot, minutes: Math.max(0, Math.min(48, slot.minutes + delta)) }
        : slot
    )));
  };

  const toggle = (playerIdValue: string, field: 'starter' | 'closing') => {
    setRotation(current => current.map(slot => (
      slot.playerId === playerIdValue ? { ...slot, [field]: !slot[field] } : slot
    )));
  };

  const save = async () => {
    if (!leagueId || !team) return;
    if (!validation.valid) {
      Alert.alert('Rotation needs work', validationMessages.join('\n'));
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'leagues', leagueId, 'teams', team.id), {
        rotation,
        rotationUpdatedAt: serverTimestamp(),
      });
      Alert.alert('Saved', 'Rotation saved for this team.');
    } catch (error: any) {
      Alert.alert('Save failed', error.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator color="#00e58b" size="large" /></View>;

  return (
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.content}
        data={rotation}
        keyExtractor={item => item.playerId}
        ListHeaderComponent={(
          <>
            <View style={styles.header}>
              <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                <Ionicons color="#ffffff" name="chevron-back" size={24} />
              </TouchableOpacity>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>{team?.name || 'Your Team'}</Text>
                <Text style={styles.title}>Rotation</Text>
              </View>
              <TouchableOpacity disabled={saving || !validation.valid} onPress={save} style={[styles.saveButton, (!validation.valid || saving) && styles.disabled]}>
                <Text style={styles.saveText}>Save</Text>
              </TouchableOpacity>
            </View>
            {leagueSport !== 'nba' ? (
              <Text style={styles.empty}>Rotations are only available for NBA leagues.</Text>
            ) : !team ? (
              <Text style={styles.empty}>Claim a team before setting a rotation.</Text>
            ) : (
              <View style={styles.summary}>
                <Text style={styles.summaryText}>{validation.totalMinutes}/240 minutes</Text>
                <Text style={[styles.summaryStatus, { color: validation.valid ? '#00e58b' : '#f4b942' }]}>
                  {validationMessages.join(' / ')}
                </Text>
                <View style={styles.autoRow}>
                  <TouchableOpacity onPress={autoBuildRotation} style={styles.autoButton}>
                    <Ionicons color="#00e58b" name="sparkles" size={15} />
                    <Text style={styles.autoText}>Auto Minutes</Text>
                  </TouchableOpacity>
                  <TouchableOpacity disabled={saving} onPress={autoApplyRotation} style={styles.autoApplyButton}>
                    <Ionicons color="#06130c" name="flash" size={15} />
                    <Text style={styles.autoApplyText}>Auto Apply</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </>
        )}
        renderItem={({ item, index }) => {
          const player = playersById.get(item.playerId);
          return (
            <View style={styles.row}>
              <View style={styles.rankBadge}><Text style={styles.rankText}>{index + 1}</Text></View>
              <View style={styles.playerCopy}>
                <Text style={styles.playerName}>{playerName(player)}</Text>
                <Text style={styles.playerMeta}>
                  {[player?.position, item.starter ? 'Starter' : item.role, item.closing ? 'Closing' : null]
                    .filter(Boolean).join(' · ')}
                </Text>
              </View>
              <View style={styles.controls}>
                <TouchableOpacity onPress={() => updateMinutes(item.playerId, -1)} style={styles.controlButton}>
                  <Ionicons color="#ffffff" name="remove" size={16} />
                </TouchableOpacity>
                <Text style={styles.minutes}>{item.minutes}</Text>
                <TouchableOpacity onPress={() => updateMinutes(item.playerId, 1)} style={styles.controlButton}>
                  <Ionicons color="#ffffff" name="add" size={16} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={() => toggle(item.playerId, 'starter')} style={[styles.chip, item.starter && styles.chipActive]}>
                <Text style={[styles.chipText, item.starter && styles.chipTextActive]}>S</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => toggle(item.playerId, 'closing')} style={[styles.chip, item.closing && styles.chipActive]}>
                <Text style={[styles.chipText, item.closing && styles.chipTextActive]}>C</Text>
              </TouchableOpacity>
            </View>
          );
        }}
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
  saveButton: { backgroundColor: '#00e58b', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 11 },
  saveText: { color: '#06130c', fontSize: 13, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  empty: { color: '#aaa', fontSize: 14, lineHeight: 20, marginBottom: 16 },
  summary: { backgroundColor: '#101410', borderWidth: 1, borderColor: '#1f3328', borderRadius: 8, padding: 14, marginBottom: 14 },
  summaryText: { color: '#fff', fontSize: 17, fontWeight: '900' },
  summaryStatus: { fontSize: 12, fontWeight: '800', marginTop: 4 },
  autoRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  autoButton: { flex: 1, minHeight: 38, borderRadius: 8, borderWidth: 1, borderColor: '#00e58b55', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#08160f' },
  autoText: { color: '#00e58b', fontSize: 12, fontWeight: '900' },
  autoApplyButton: { flex: 1, minHeight: 38, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#00e58b' },
  autoApplyText: { color: '#06130c', fontSize: 12, fontWeight: '900' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#111', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#202020', marginBottom: 8 },
  rankBadge: { width: 30, height: 30, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1d1d1d' },
  rankText: { color: '#888', fontWeight: '900' },
  playerCopy: { flex: 1 },
  playerName: { color: '#fff', fontSize: 14, fontWeight: '800' },
  playerMeta: { color: '#777', fontSize: 11, marginTop: 3 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  controlButton: { width: 28, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#222' },
  minutes: { color: '#fff', fontSize: 14, fontWeight: '900', minWidth: 24, textAlign: 'center' },
  chip: { width: 28, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#191919', borderWidth: 1, borderColor: '#2a2a2a' },
  chipActive: { backgroundColor: '#0a2a1a', borderColor: '#00e58b' },
  chipText: { color: '#777', fontSize: 12, fontWeight: '900' },
  chipTextActive: { color: '#00e58b' },
});
