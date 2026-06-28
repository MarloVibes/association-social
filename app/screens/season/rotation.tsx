import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, FlatList, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db, functions } from '@/constants/firebase';
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

function extractBrefId(player: Player): string {
  if (player?.bref_id) return String(player.bref_id);
  const raw = String(player?.player_id || player?.id || '');
  if (!raw) return '';
  if (raw.startsWith('pool_')) return raw.split('_').slice(2).join('_');
  if (raw.startsWith('current_')) return raw.replace(/^current_/, '');
  return raw.includes('_') ? raw.split('_').pop() || '' : raw;
}

async function enrichRotationPlayers(players: Player[]): Promise<Player[]> {
  const ids = [...new Set(players.map(extractBrefId).filter(Boolean))];
  if (ids.length === 0) return players;

  try {
    const profiles = await Promise.all(ids.map(id => getDoc(doc(db, 'players', id))));
    const profileById = new Map<string, any>();
    profiles.forEach((snapshot, index) => {
      if (snapshot.exists()) profileById.set(ids[index], snapshot.data());
    });

    return players.map(player => {
      const profile = profileById.get(extractBrefId(player));
      return profile ? { ...profile, ...player } : player;
    });
  } catch (error) {
    console.warn('rotation profile enrich skipped', error);
    return players;
  }
}

function playerId(player: Player): string {
  return String(player.player_id || player.id || player.bref_id || player.full_name || player.name || '');
}

function playerName(player?: Player): string {
  return player?.full_name || player?.name || 'Unnamed player';
}

function roleLabel(slot: RotationSlot) {
  if (slot.starter) return 'Starter';
  if (slot.role === 'sixth_man') return '6th Man';
  if (slot.role === 'primary') return 'Primary';
  if (slot.role === 'secondary') return 'Secondary';
  if (slot.role === 'reserve') return 'Reserve';
  if (slot.role === 'bench') return 'Bench';
  return slot.role || 'Bench';
}

function roleForIndex(index: number): RotationSlot['role'] {
  if (index < 2) return 'primary';
  if (index < 5) return 'starter';
  if (index === 5) return 'sixth_man';
  if (index < 10) return 'bench';
  return 'reserve';
}

function normalizeOrder(slots: RotationSlot[]) {
  return slots.map((slot, index) => ({
    ...slot,
    starter: index < 5,
    closing: index < 5,
    benchOrder: index >= 5 ? index - 4 : undefined,
    role: roleForIndex(index),
    status: index < 10 ? 'active' as const : 'inactive' as const,
    minutes: index < 10 ? slot.minutes : 0,
  }));
}

function clampIndex(value: number, length: number) {
  return Math.max(0, Math.min(length - 1, value));
}

function RotationRow({
  item,
  index,
  total,
  player,
  onReorder,
  onUpdateMinutes,
}: {
  item: RotationSlot;
  index: number;
  total: number;
  player?: Player;
  onReorder: (from: number, to: number) => void;
  onUpdateMinutes: (playerId: string, delta: number) => void;
}) {
  const dragY = useRef(new Animated.Value(0)).current;
  const [dragging, setDragging] = useState(false);
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 4,
    onPanResponderGrant: () => setDragging(true),
    onPanResponderMove: (_, gesture) => {
      dragY.setValue(gesture.dy);
    },
    onPanResponderRelease: (_, gesture) => {
      const rowStep = 72;
      const target = clampIndex(index + Math.round(gesture.dy / rowStep), total);
      setDragging(false);
      Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start();
      if (target !== index) onReorder(index, target);
    },
    onPanResponderTerminate: () => {
      setDragging(false);
      Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start();
    },
  }), [dragY, index, onReorder, total]);

  return (
    <Animated.View style={[styles.row, dragging && styles.rowDragging, { transform: [{ translateY: dragY }] }]}>
      <View style={styles.rankBadge}><Text style={styles.rankText}>{index + 1}</Text></View>
      <View style={styles.playerCopy}>
        <Text style={styles.playerName}>{playerName(player)}</Text>
        <Text style={styles.playerMeta}>
          {[player?.position, roleLabel(item)].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <View {...panResponder.panHandlers} style={styles.dragHandle}>
        <Ionicons color="#8a8a8a" name="reorder-three" size={22} />
      </View>
      <View style={styles.controls}>
        <TouchableOpacity onPress={() => onUpdateMinutes(item.playerId, -1)} style={styles.controlButton}>
          <Ionicons color="#ffffff" name="remove" size={16} />
        </TouchableOpacity>
        <Text style={styles.minutes}>{item.minutes}</Text>
        <TouchableOpacity onPress={() => onUpdateMinutes(item.playerId, 1)} style={styles.controlButton}>
          <Ionicons color="#ffffff" name="add" size={16} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
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
    const unsubscribeTeams = onSnapshot(collection(db, 'leagues', leagueId, 'teams'), async snapshot => {
      const mine = snapshot.docs.find(item => item.data().gmId === uid);
      if (!mine) {
        setTeam(null);
        setRotation([]);
        setLoading(false);
        return;
      }
      const rawTeam = { id: mine.id, ...mine.data() } as Team;
      const enrichedPlayers = await enrichRotationPlayers(rawTeam.players || []);
      const nextTeam = { ...rawTeam, players: enrichedPlayers };
      setTeam(nextTeam);
      setRotation(Array.isArray(nextTeam.rotation) && nextTeam.rotation.length > 0
        ? normalizeOrder(nextTeam.rotation)
        : buildCpuRotation(enrichedPlayers));
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

  const autoAdjustRotation = () => {
    if (!team) return;
    setRotation(buildCpuRotation(team.players || []));
  };

  const updateMinutes = (playerIdValue: string, delta: number) => {
    setRotation(current => current.map(slot => (
      slot.playerId === playerIdValue
        ? { ...slot, minutes: Math.max(0, Math.min(48, slot.minutes + delta)) }
        : slot
    )));
  };

  const reorderSlot = (from: number, to: number) => {
    setRotation(current => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      if (!moved) return current;
      next.splice(to, 0, moved);
      return normalizeOrder(next);
    });
  };

  const save = async () => {
    if (!leagueId || !team) return;
    if (!validation.valid) {
      Alert.alert('Rotation needs work', validationMessages.join('\n'));
      return;
    }
    setSaving(true);
    try {
      await httpsCallable(functions, 'saveTeamRotation')({ leagueId, rotation: normalizeOrder(rotation) });
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
                  <TouchableOpacity onPress={autoAdjustRotation} style={styles.autoButton}>
                    <Ionicons color="#00e58b" name="sparkles" size={15} />
                    <Text style={styles.autoText}>Auto Adjust</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </>
        )}
        renderItem={({ item, index }) => {
          const player = playersById.get(item.playerId);
          return (
            <RotationRow
              item={item}
              index={index}
              total={rotation.length}
              player={player}
              onReorder={reorderSlot}
              onUpdateMinutes={updateMinutes}
            />
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#111', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#202020', marginBottom: 8 },
  rowDragging: { borderColor: '#00e58b', backgroundColor: '#132018', zIndex: 5 },
  rankBadge: { width: 30, height: 30, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1d1d1d' },
  rankText: { color: '#888', fontWeight: '900' },
  playerCopy: { flex: 1 },
  playerName: { color: '#fff', fontSize: 14, fontWeight: '800' },
  playerMeta: { color: '#777', fontSize: 11, marginTop: 3 },
  dragHandle: { width: 32, height: 38, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: '#181818', borderWidth: 1, borderColor: '#282828' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  controlButton: { width: 28, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#222' },
  minutes: { color: '#fff', fontSize: 14, fontWeight: '900', minWidth: 24, textAlign: 'center' },
});
