import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';
import { COACHING_PRESETS, validateCoachingPreset, type CoachingPreset } from '@/domain/nba/coaching';

type Team = {
  id: string;
  name?: string;
  coachingPresets?: CoachingPreset[];
  defaultCoachingPresetId?: string;
};

export default function CoachingPresetsScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const router = useRouter();
  const uid = auth.currentUser?.uid;
  const [leagueSport, setLeagueSport] = useState('nba');
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!leagueId) return;
    const unsubscribeLeague = onSnapshot(doc(db, 'leagues', leagueId), snapshot => {
      if (snapshot.exists()) setLeagueSport((snapshot.data() as any).sport || 'nba');
    });
    const unsubscribeTeams = onSnapshot(collection(db, 'leagues', leagueId, 'teams'), snapshot => {
      const mine = snapshot.docs.find(item => item.data().gmId === uid);
      setTeam(mine ? { id: mine.id, ...mine.data() } as Team : null);
      setLoading(false);
    });
    return () => {
      unsubscribeLeague();
      unsubscribeTeams();
    };
  }, [leagueId, uid]);

  const presets = useMemo(() => {
    const byId = new Map<string, CoachingPreset>();
    [...COACHING_PRESETS, ...(team?.coachingPresets || [])].forEach(preset => byId.set(preset.id, preset));
    return [...byId.values()];
  }, [team?.coachingPresets]);

  const savePreset = async (preset: CoachingPreset) => {
    if (!leagueId || !team) return;
    const validation = validateCoachingPreset(preset);
    if (!validation.valid) {
      Alert.alert('Preset is invalid', validation.errors.join(', '));
      return;
    }
    setSavingId(preset.id);
    try {
      await updateDoc(doc(db, 'leagues', leagueId, 'teams', team.id), {
        coachingPresets: [...presets.filter(item => item.id !== preset.id), preset],
        defaultCoachingPresetId: preset.id,
        coachingUpdatedAt: serverTimestamp(),
      });
      Alert.alert('Saved', `${preset.name} is now your default coaching preset.`);
    } catch (error: any) {
      Alert.alert('Save failed', error.message || 'Please try again.');
    } finally {
      setSavingId(null);
    }
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator color="#00e58b" size="large" /></View>;

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
                <Text style={styles.eyebrow}>{team?.name || 'Your Team'}</Text>
                <Text style={styles.title}>Coaching</Text>
              </View>
            </View>
            {leagueSport !== 'nba' ? (
              <Text style={styles.empty}>Coaching presets are only available for NBA leagues.</Text>
            ) : !team ? (
              <Text style={styles.empty}>Claim a team before saving coaching presets.</Text>
            ) : (
              <Text style={styles.helper}>Choose a default. Game prep will copy the preset snapshot so later edits do not change active matchups.</Text>
            )}
          </>
        )}
        renderItem={({ item }) => {
          const selected = team?.defaultCoachingPresetId === item.id;
          return (
            <View style={[styles.card, selected && styles.cardSelected]}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.presetName}>{item.name}</Text>
                  <Text style={styles.presetMeta}>{item.offense.replace(/_/g, ' ')} · {item.defense.replace(/_/g, ' ')}</Text>
                </View>
                <TouchableOpacity
                  disabled={!team || savingId === item.id}
                  onPress={() => savePreset(item)}
                  style={[styles.selectButton, selected && styles.selectButtonActive]}
                >
                  <Text style={[styles.selectText, selected && styles.selectTextActive]}>{selected ? 'Default' : 'Use'}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.modGrid}>
                {Object.entries(item.modifiers).map(([key, value]) => (
                  <View key={key} style={styles.modItem}>
                    <Text style={styles.modValue}>{value > 0 ? `+${value}` : value}</Text>
                    <Text style={styles.modLabel}>{key.replace(/([A-Z])/g, ' $1')}</Text>
                  </View>
                ))}
              </View>
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
  empty: { color: '#aaa', fontSize: 14, lineHeight: 20, marginBottom: 16 },
  helper: { color: '#aaa', fontSize: 13, lineHeight: 19, marginBottom: 16 },
  card: { backgroundColor: '#111', borderRadius: 8, padding: 14, borderWidth: 1, borderColor: '#202020', marginBottom: 12 },
  cardSelected: { borderColor: '#00e58b', backgroundColor: '#0a1d14' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  presetName: { color: '#fff', fontSize: 16, fontWeight: '900' },
  presetMeta: { color: '#777', fontSize: 12, fontWeight: '700', marginTop: 3, textTransform: 'capitalize' },
  selectButton: { borderRadius: 8, borderWidth: 1, borderColor: '#333', paddingHorizontal: 14, paddingVertical: 9, backgroundColor: '#191919' },
  selectButtonActive: { borderColor: '#00e58b', backgroundColor: '#00e58b' },
  selectText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  selectTextActive: { color: '#06130c' },
  modGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modItem: { width: '23%', minHeight: 54, borderRadius: 8, backgroundColor: '#181818', padding: 8, alignItems: 'center', justifyContent: 'center' },
  modValue: { color: '#fff', fontSize: 14, fontWeight: '900' },
  modLabel: { color: '#777', fontSize: 9, fontWeight: '800', marginTop: 3, textAlign: 'center', textTransform: 'uppercase' },
});
