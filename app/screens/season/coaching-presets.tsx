import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db, functions } from '@/constants/firebase';
import { coachingPresetInfoText, validateCoachingPreset, type CoachingPreset } from '@/domain/nba/coaching';
import { defaultPresetsForSport, normalizeSport, type FranchiseSport } from '@/domain/sports/coachingPresets';

type Team = {
  id: string;
  name?: string;
  coachingPresets?: CoachingPreset[];
  defaultCoachingPresetId?: string;
  defaultSecondHalfCoachingPresetId?: string;
};

function tendencyRows(preset: CoachingPreset, sport: FranchiseSport) {
  if (sport === 'madden') {
    return [
      { label: 'Tempo', value: preset.modifiers.pace },
      { label: 'Pass', value: preset.modifiers.threePointRate },
      { label: 'Run', value: preset.modifiers.rimPressure },
      { label: 'Control', value: preset.modifiers.midrangeRate },
      { label: 'Pressure', value: preset.modifiers.turnovers },
      { label: 'Physical', value: preset.modifiers.rebounding },
    ];
  }
  if (sport === 'mlb') {
    return [
      { label: 'Pace', value: preset.modifiers.pace },
      { label: 'Power', value: preset.modifiers.rimPressure },
      { label: 'Contact', value: preset.modifiers.midrangeRate },
      { label: 'Pressure', value: preset.modifiers.turnovers },
      { label: 'Control', value: preset.modifiers.fouls },
      { label: 'Defense', value: preset.modifiers.rebounding },
    ];
  }
  return [
    { label: 'Tempo', value: preset.modifiers.pace },
    { label: 'Spacing', value: preset.modifiers.threePointRate },
    { label: 'Paint', value: preset.modifiers.rimPressure },
    { label: 'Mid', value: preset.modifiers.midrangeRate },
    { label: 'Pressure', value: preset.modifiers.turnovers },
    { label: 'Boards', value: preset.modifiers.rebounding },
  ];
}

function tendencyWidth(value: number) {
  return `${Math.max(12, Math.min(100, Math.abs(value) * 10))}%` as const;
}

export default function CoachingPresetsScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const router = useRouter();
  const uid = auth.currentUser?.uid;
  const [leagueSport, setLeagueSport] = useState('nba');
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [firstHalfPresetId, setFirstHalfPresetId] = useState('balanced');
  const [secondHalfPresetId, setSecondHalfPresetId] = useState('balanced');
  const sport = normalizeSport(leagueSport);
  const phaseLabels = sport === 'mlb' ? ['Early Game', 'Late Game'] : ['Opening Plan', 'Adjustment Plan'];

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
    [...defaultPresetsForSport(sport), ...(team?.coachingPresets || [])].forEach(preset => byId.set(preset.id, preset));
    return [...byId.values()];
  }, [sport, team?.coachingPresets]);
  const selectedPreset = useMemo(() => (
    presets.find(preset => preset.id === firstHalfPresetId) || presets.find(preset => preset.id === team?.defaultCoachingPresetId) || presets[0]
  ), [firstHalfPresetId, presets, team?.defaultCoachingPresetId]);
  const secondHalfPreset = useMemo(() => (
    presets.find(preset => preset.id === secondHalfPresetId) || selectedPreset
  ), [presets, secondHalfPresetId, selectedPreset]);

  const defaultFirstHalfPresetId = team?.defaultCoachingPresetId;
  const defaultSecondHalfPresetId = team?.defaultSecondHalfCoachingPresetId;

  useEffect(() => {
    if (!team) return;
    const first = defaultFirstHalfPresetId || 'balanced';
    setFirstHalfPresetId(first);
    setSecondHalfPresetId(defaultSecondHalfPresetId || first);
  }, [team, defaultFirstHalfPresetId, defaultSecondHalfPresetId]);

  const savePreset = async (preset: CoachingPreset) => {
    if (!leagueId || !team) return;
    const validation = validateCoachingPreset(preset);
    if (!validation.valid) {
      Alert.alert('Preset is invalid', validation.errors.join(', '));
      return;
    }
    setSavingId(preset.id);
    try {
      await httpsCallable(functions, 'saveTeamCoachingPreset')({ leagueId, preset, secondHalfPresetId });
      Alert.alert('Saved', `${preset.name} will open games. ${secondHalfPreset?.name || preset.name} is saved as the matchup adjustment.`);
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
            {!team ? (
              <Text style={styles.empty}>Claim a team before saving coaching presets.</Text>
            ) : (
              <>
                <View style={styles.systemBoard}>
                  <View style={styles.systemTop}>
                    <View>
                      <Text style={styles.systemKicker}>Active System</Text>
                      <Text style={styles.systemTitle}>{selectedPreset.name}</Text>
                      <Text style={styles.systemMeta}>{selectedPreset.offense.replace(/_/g, ' ')} · {selectedPreset.defense.replace(/_/g, ' ')}</Text>
                    </View>
                    <TouchableOpacity onPress={() => showPresetInfo(selectedPreset)} style={styles.systemInfoButton}>
                      <Ionicons color="#00e58b" name="information-circle-outline" size={22} />
                    </TouchableOpacity>
                  </View>
                  {sport === 'nba' ? (
                    <View style={styles.courtPanel}>
                      <View style={styles.halfCourtPreview}>
                        <View style={styles.courtThreeArc} />
                        <View style={styles.courtPaint} />
                        <View style={styles.courtFreeThrowCircle} />
                        <View style={styles.courtRim} />
                        <View style={[styles.courtNode, styles.courtNodeOne]} />
                        <View style={[styles.courtNode, styles.courtNodeTwo]} />
                        <View style={[styles.courtNode, styles.courtNodeThree]} />
                        <View style={[styles.courtNode, styles.courtNodeFour]} />
                        <View style={[styles.courtNode, styles.courtNodeFive]} />
                      </View>
                    </View>
                  ) : null}
                  <View style={styles.tendencyList}>
                    {tendencyRows(selectedPreset, sport).map(row => (
                      <View key={row.label} style={styles.tendencyRow}>
                        <Text style={styles.tendencyLabel}>{row.label}</Text>
                        <View style={styles.tendencyTrack}>
                          <View style={[
                            styles.tendencyFill,
                            row.value < 0 && styles.tendencyFillNegative,
                            { width: tendencyWidth(row.value) },
                          ]} />
                        </View>
                        <Text style={styles.tendencyValue}>{row.value > 0 ? `+${row.value}` : row.value}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                <View style={styles.builder}>
                  <View style={styles.gamePlanHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.gamePlanTitle}>Game Plan</Text>
                      <Text style={styles.gamePlanMeta}>Pick a starting identity and a matchup adjustment.</Text>
                    </View>
                    <TouchableOpacity disabled={savingId === firstHalfPresetId || !selectedPreset} onPress={() => selectedPreset && savePreset(selectedPreset)} style={styles.customSave}>
                      <Ionicons color="#06130c" name="save-outline" size={15} />
                      <Text style={styles.customSaveText}>Save Game Plan</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.halfLabel}>{phaseLabels[0]}</Text>
                  <View style={styles.optionStrip}>
                    {presets.map(preset => (
                      <TouchableOpacity
                        key={`first-${preset.id}`}
                        onPress={() => setFirstHalfPresetId(preset.id)}
                        style={[styles.optionChip, firstHalfPresetId === preset.id && styles.optionChipActive]}
                      >
                        <Text style={[styles.optionText, firstHalfPresetId === preset.id && styles.optionTextActive]}>{preset.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.halfLabel}>{phaseLabels[1]}</Text>
                  <View style={styles.optionStrip}>
                    {presets.map(preset => (
                      <TouchableOpacity
                        key={`second-${preset.id}`}
                        onPress={() => setSecondHalfPresetId(preset.id)}
                        style={[styles.optionChip, secondHalfPresetId === preset.id && styles.optionChipActive]}
                      >
                        <Text style={[styles.optionText, secondHalfPresetId === preset.id && styles.optionTextActive]}>{preset.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </>
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
              {item.description ? <Text style={styles.presetDesc}>{item.description}</Text> : null}
              {item.boostSummary ? (
                <View style={styles.boostBox}>
                  <Ionicons color="#00e58b" name="pulse-outline" size={15} />
                  <Text style={styles.boostText}>{item.boostSummary}</Text>
                </View>
              ) : null}
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
  systemBoard: { backgroundColor: '#101410', borderWidth: 1, borderColor: '#1f3328', borderRadius: 8, padding: 14, marginBottom: 14 },
  systemTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
  systemKicker: { color: '#00e58b', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  systemTitle: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 2 },
  systemMeta: { color: '#777', fontSize: 11, fontWeight: '800', marginTop: 3, textTransform: 'capitalize' },
  systemInfoButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#122018' },
  courtPanel: { height: 128, borderRadius: 8, borderWidth: 2, borderColor: '#d8e0dc44', backgroundColor: '#16221c', overflow: 'hidden', marginBottom: 12 },
  halfCourtPreview: { flex: 1, position: 'relative' },
  courtPaint: { position: 'absolute', top: 0, left: '34%', width: '32%', height: 64, borderWidth: 2, borderTopWidth: 0, borderColor: '#d8e0dc55' },
  courtFreeThrowCircle: { position: 'absolute', top: 44, left: '38%', width: '24%', height: 46, borderRadius: 50, borderWidth: 2, borderColor: '#d8e0dc44' },
  courtRim: { position: 'absolute', top: 9, left: '47%', width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#d8e0dc77' },
  courtThreeArc: { position: 'absolute', top: 18, left: '11%', width: '78%', height: 144, borderTopLeftRadius: 160, borderTopRightRadius: 160, borderWidth: 2, borderBottomWidth: 0, borderColor: '#d8e0dc33' },
  courtNode: { position: 'absolute', width: 25, height: 25, borderRadius: 13, backgroundColor: '#00e58b', borderWidth: 3, borderColor: '#f4c542' },
  courtNodeOne: { left: '46%', bottom: 16 },
  courtNodeTwo: { left: '22%', top: 35 },
  courtNodeThree: { right: '22%', top: 35 },
  courtNodeFour: { left: '34%', top: 68 },
  courtNodeFive: { right: '34%', top: 68 },
  tendencyList: { gap: 8 },
  tendencyRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  tendencyLabel: { width: 60, color: '#999', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  tendencyTrack: { flex: 1, height: 8, borderRadius: 999, backgroundColor: '#242424', overflow: 'hidden' },
  tendencyFill: { height: 8, borderRadius: 999, backgroundColor: '#00e58b' },
  tendencyFillNegative: { backgroundColor: '#ff6b6b' },
  tendencyValue: { width: 32, color: '#fff', fontSize: 10, fontWeight: '900', textAlign: 'right' },
  builder: { backgroundColor: '#101410', borderWidth: 1, borderColor: '#1f3328', borderRadius: 8, padding: 12, marginBottom: 16 },
  gamePlanHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  gamePlanTitle: { color: '#fff', fontSize: 17, fontWeight: '900' },
  gamePlanMeta: { color: '#7d897f', fontSize: 11, fontWeight: '800', lineHeight: 15, marginTop: 2 },
  customSave: { minHeight: 42, borderRadius: 8, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#00e58b' },
  customSaveText: { color: '#06130c', fontSize: 12, fontWeight: '900' },
  halfLabel: { color: '#d9e5dd', fontSize: 11, fontWeight: '900', marginBottom: 8, textTransform: 'uppercase' },
  optionStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 9 },
  optionChip: { minHeight: 32, borderRadius: 8, borderWidth: 1, borderColor: '#2a2a2a', paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#181818' },
  optionChipActive: { borderColor: '#00e58b', backgroundColor: '#0a2a1a' },
  optionText: { color: '#888', fontSize: 11, fontWeight: '900' },
  optionTextActive: { color: '#00e58b' },
  card: { backgroundColor: '#111', borderRadius: 8, padding: 14, borderWidth: 1, borderColor: '#202020', marginBottom: 12 },
  cardSelected: { borderColor: '#00e58b', backgroundColor: '#0a1d14' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  presetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  presetName: { color: '#fff', fontSize: 16, fontWeight: '900' },
  infoButton: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#122018' },
  presetMeta: { color: '#777', fontSize: 12, fontWeight: '700', marginTop: 3, textTransform: 'capitalize' },
  presetDesc: { color: '#bbb', fontSize: 12, lineHeight: 18, fontWeight: '700', marginBottom: 10 },
  boostBox: { flexDirection: 'row', gap: 8, borderRadius: 8, borderWidth: 1, borderColor: '#1f3328', backgroundColor: '#0b1510', padding: 10, marginBottom: 12 },
  boostText: { flex: 1, color: '#8faaa0', fontSize: 11, lineHeight: 16, fontWeight: '700' },
  selectButton: { borderRadius: 8, borderWidth: 1, borderColor: '#333', paddingHorizontal: 14, paddingVertical: 9, backgroundColor: '#191919' },
  selectButtonActive: { borderColor: '#00e58b', backgroundColor: '#00e58b' },
  selectText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  selectTextActive: { color: '#06130c' },
  modGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modItem: { width: '23%', minHeight: 54, borderRadius: 8, backgroundColor: '#181818', padding: 8, alignItems: 'center', justifyContent: 'center' },
  modValue: { color: '#fff', fontSize: 14, fontWeight: '900' },
  modLabel: { color: '#777', fontSize: 9, fontWeight: '800', marginTop: 3, textAlign: 'center', textTransform: 'uppercase' },
});
