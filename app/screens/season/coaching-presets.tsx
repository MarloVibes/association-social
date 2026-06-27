import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';
import { COACHING_PRESETS, coachingPresetInfoText, validateCoachingPreset, type CoachingModifiers, type CoachingPreset, type DefensiveStyle, type OffensiveStyle } from '@/domain/nba/coaching';

type Team = {
  id: string;
  name?: string;
  coachingPresets?: CoachingPreset[];
  defaultCoachingPresetId?: string;
};

const OFFENSE_OPTIONS: Array<{ value: OffensiveStyle; label: string }> = [
  { value: 'balanced', label: 'Balanced' },
  { value: 'pace_and_space', label: 'Pace' },
  { value: 'post_heavy', label: 'Post' },
  { value: 'pick_and_roll', label: 'Pick Roll' },
  { value: 'isolation', label: 'Iso' },
];

const DEFENSE_OPTIONS: Array<{ value: DefensiveStyle; label: string }> = [
  { value: 'drop', label: 'Drop' },
  { value: 'switch_heavy', label: 'Switch' },
  { value: 'zone', label: 'Zone' },
  { value: 'pressure', label: 'Pressure' },
  { value: 'protect_paint', label: 'Paint' },
];

const MODIFIER_LABELS: Record<keyof CoachingModifiers, string> = {
  pace: 'Pace',
  threePointRate: '3PT',
  rimPressure: 'Rim',
  midrangeRate: 'Mid',
  turnovers: 'TO',
  fouls: 'Fouls',
  rebounding: 'Boards',
  fatigue: 'Fatigue',
};

function baseCustomPreset(): CoachingPreset {
  return {
    id: 'custom_gameplan',
    name: 'Custom Gameplan',
    description: 'Your custom game plan uses the exact offensive, defensive, and modifier settings you tune here.',
    boostSummary: 'Custom plans apply your modifier sliders. Built-in plans add roster-fit grade boosts on top of their style identity.',
    offense: 'balanced',
    defense: 'drop',
    modifiers: {
      pace: 0,
      threePointRate: 0,
      rimPressure: 0,
      midrangeRate: 0,
      turnovers: 0,
      fouls: 0,
      rebounding: 0,
      fatigue: 0,
    },
    counters: ['pressure'],
  };
}

function clampModifier(value: number) {
  return Math.max(-10, Math.min(10, value));
}

export default function CoachingPresetsScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const router = useRouter();
  const uid = auth.currentUser?.uid;
  const [leagueSport, setLeagueSport] = useState('nba');
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [customPreset, setCustomPreset] = useState<CoachingPreset>(baseCustomPreset);

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

  useEffect(() => {
    const savedCustom = team?.coachingPresets?.find(preset => preset.id === 'custom_gameplan');
    if (savedCustom) setCustomPreset({ ...savedCustom, modifiers: { ...savedCustom.modifiers }, counters: [...savedCustom.counters] });
  }, [team?.coachingPresets]);

  const updateCustomStyle = (field: 'offense' | 'defense', value: OffensiveStyle | DefensiveStyle) => {
    setCustomPreset(current => ({
      ...current,
      [field]: value,
      counters: field === 'defense' ? [value as DefensiveStyle] : current.counters,
    }));
  };

  const updateModifier = (key: keyof CoachingModifiers, delta: number) => {
    setCustomPreset(current => ({
      ...current,
      modifiers: {
        ...current.modifiers,
        [key]: clampModifier(current.modifiers[key] + delta),
      },
    }));
  };

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

  const showPresetInfo = (preset: CoachingPreset) => {
    Alert.alert(preset.name, coachingPresetInfoText(preset));
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
              <View style={styles.builder}>
                <View style={styles.builderTop}>
                  <TextInput
                    style={styles.nameInput}
                    value={customPreset.name}
                    onChangeText={name => setCustomPreset(current => ({ ...current, name }))}
                    placeholder="Custom Gameplan"
                    placeholderTextColor="#555"
                  />
                  <TouchableOpacity disabled={savingId === customPreset.id} onPress={() => savePreset(customPreset)} style={styles.customSave}>
                    <Ionicons color="#06130c" name="save-outline" size={15} />
                    <Text style={styles.customSaveText}>Save</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.optionStrip}>
                  {OFFENSE_OPTIONS.map(option => (
                    <TouchableOpacity
                      key={option.value}
                      onPress={() => updateCustomStyle('offense', option.value)}
                      style={[styles.optionChip, customPreset.offense === option.value && styles.optionChipActive]}
                    >
                      <Text style={[styles.optionText, customPreset.offense === option.value && styles.optionTextActive]}>{option.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.optionStrip}>
                  {DEFENSE_OPTIONS.map(option => (
                    <TouchableOpacity
                      key={option.value}
                      onPress={() => updateCustomStyle('defense', option.value)}
                      style={[styles.optionChip, customPreset.defense === option.value && styles.optionChipActive]}
                    >
                      <Text style={[styles.optionText, customPreset.defense === option.value && styles.optionTextActive]}>{option.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.tunerGrid}>
                  {(Object.keys(customPreset.modifiers) as Array<keyof CoachingModifiers>).map(key => (
                    <View key={key} style={styles.tuner}>
                      <Text style={styles.tunerLabel}>{MODIFIER_LABELS[key]}</Text>
                      <View style={styles.tunerControls}>
                        <TouchableOpacity onPress={() => updateModifier(key, -1)} style={styles.tunerButton}>
                          <Ionicons color="#fff" name="remove" size={14} />
                        </TouchableOpacity>
                        <Text style={styles.tunerValue}>{customPreset.modifiers[key] > 0 ? `+${customPreset.modifiers[key]}` : customPreset.modifiers[key]}</Text>
                        <TouchableOpacity onPress={() => updateModifier(key, 1)} style={styles.tunerButton}>
                          <Ionicons color="#fff" name="add" size={14} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}
        renderItem={({ item }) => {
          const selected = team?.defaultCoachingPresetId === item.id;
          return (
            <View style={[styles.card, selected && styles.cardSelected]}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <View style={styles.presetTitleRow}>
                    <Text style={styles.presetName}>{item.name}</Text>
                    <TouchableOpacity
                      accessibilityLabel={`${item.name} coaching info`}
                      onPress={() => showPresetInfo(item)}
                      style={styles.infoButton}
                    >
                      <Ionicons color="#00e58b" name="information-circle-outline" size={19} />
                    </TouchableOpacity>
                  </View>
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
  builder: { backgroundColor: '#101410', borderWidth: 1, borderColor: '#1f3328', borderRadius: 8, padding: 12, marginBottom: 16 },
  builderTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  nameInput: { flex: 1, minHeight: 42, borderRadius: 8, backgroundColor: '#181818', borderWidth: 1, borderColor: '#2a2a2a', color: '#fff', paddingHorizontal: 12, fontSize: 14, fontWeight: '800' },
  customSave: { minHeight: 42, borderRadius: 8, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#00e58b' },
  customSaveText: { color: '#06130c', fontSize: 12, fontWeight: '900' },
  optionStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 9 },
  optionChip: { minHeight: 32, borderRadius: 8, borderWidth: 1, borderColor: '#2a2a2a', paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#181818' },
  optionChipActive: { borderColor: '#00e58b', backgroundColor: '#0a2a1a' },
  optionText: { color: '#888', fontSize: 11, fontWeight: '900' },
  optionTextActive: { color: '#00e58b' },
  tunerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tuner: { width: '48%', borderRadius: 8, backgroundColor: '#181818', borderWidth: 1, borderColor: '#242424', padding: 8 },
  tunerLabel: { color: '#888', fontSize: 10, fontWeight: '900', marginBottom: 7, textTransform: 'uppercase' },
  tunerControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  tunerButton: { width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: '#242424' },
  tunerValue: { color: '#fff', fontSize: 13, fontWeight: '900', minWidth: 28, textAlign: 'center' },
  card: { backgroundColor: '#111', borderRadius: 8, padding: 14, borderWidth: 1, borderColor: '#202020', marginBottom: 12 },
  cardSelected: { borderColor: '#00e58b', backgroundColor: '#0a1d14' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  presetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  presetName: { color: '#fff', fontSize: 16, fontWeight: '900' },
  infoButton: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#122018' },
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
