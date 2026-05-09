import { router } from 'expo-router';
import { arrayUnion, collection, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';
import GlobalNav from '@/components/GlobalNav';

const NBA_ERAS = [
  { label: 'Current Rosters', value: 'current', desc: 'Start with todays NBA rosters', icon: '📅' },
  { label: 'Steph Era', value: 'steph', desc: '2016-17 · Warriors dynasty, KD, Curry, Klay, Draymond', icon: '🍿' },
  { label: 'LeBron Era', value: 'lebron', desc: '2010-11 · LeBron, Wade & Bosh form the Heatles', icon: '👑' },
  { label: 'Kobe Era', value: 'kobe', desc: '2002-03 · Shaq & Kobe Lakers three-peat window', icon: '🐍' },
  { label: 'Jordan Era', value: 'jordan', desc: '1991-92 · MJ & the Bulls dynasty', icon: '🐐' },
  { label: 'Magic vs Bird Era', value: 'magic_bird', desc: '1983-84 · Showtime Lakers vs Celtics rivalry', icon: '✨' },
];

const TEAM_MODES = [
  { label: 'Current Rosters', value: 'current', desc: 'Each GM picks from current teams', icon: '🏆' },
  { label: 'Randomize Teams', value: 'random', desc: 'Teams randomly assigned to GMs', icon: '🎲' },
  { label: 'Fantasy Draft', value: 'draft', desc: 'GMs draft players from scratch', icon: '🎯' },
];

const MADDEN_MODES = [
  { label: 'Current Rosters', value: 'current', desc: 'Start with current NFL rosters', icon: '📅' },
  { label: 'Randomize Teams', value: 'random', desc: 'Teams randomly assigned to GMs', icon: '🎲' },
  { label: 'Fantasy Draft', value: 'draft', desc: 'Draft players from scratch before the season', icon: '🎯' },
];

const MLB_MODES = [
  { label: 'Current Rosters', value: 'current', desc: 'Start with todays MLB rosters', icon: '📅' },
  { label: 'Randomize Teams', value: 'random', desc: 'Teams randomly assigned to GMs', icon: '🎲' },
  { label: 'Fantasy Draft', value: 'draft', desc: 'Draft players from scratch before the season', icon: '🎯' },
];

export default function CreateLeagueScreen() {
  const [step, setStep] = useState(1);
  const [leagueName, setLeagueName] = useState('');
  const [sport, setSport] = useState('');
  const [mode, setMode] = useState('');
  const [era, setEra] = useState('');
  const [teamMode, setTeamMode] = useState('');
  const [loading, setLoading] = useState(false);

  const sports = [
    { label: 'NBA 2K', value: 'nba', emoji: '🏀' },
    { label: 'Madden NFL', value: 'madden', emoji: '🏈' },
    { label: 'MLB The Show', value: 'mlb', emoji: '⚾' },
  ];

  // NBA has 4 steps: Name+Sport -> Era -> Team Mode -> Review
  // Others have 3 steps: Name+Sport -> Mode -> Review
  const totalSteps = sport === 'nba' ? 4 : 3;

  const getModeOptions = () => {
    if (sport === 'madden') return MADDEN_MODES;
    if (sport === 'mlb') return MLB_MODES;
    return [];
  };

  const handleCreate = async () => {
    const user = auth.currentUser;
    if (!user) { router.replace('/(tabs)/auth'); return; }
    setLoading(true);
    try {
      const leagueId = doc(collection(db, 'leagues')).id;
      const finalMode = sport === 'nba' ? teamMode : mode;
      const finalEra = sport === 'nba' ? era : null;

      await setDoc(doc(db, 'leagues', leagueId), {
        name: leagueName.trim(),
        privacy: 'private',
        currentYear: sport === 'nba' ? (era === 'magic_bird' ? 1983 : era === 'jordan' ? 1991 : era === 'kobe' ? 2002 : era === 'lebron' ? 2010 : era === 'steph' ? 2016 : 2024) : 2024,
        currentSeason: sport === 'nba' ? (era === 'magic_bird' ? '1983-84' : era === 'jordan' ? '1991-92' : era === 'kobe' ? '2002-03' : era === 'lebron' ? '2010-11' : era === 'steph' ? '2016-17' : '2024-25') : '2024-25',
        sport,
        mode: finalMode,
        era: finalEra,
        commissionerId: user.uid,
        coCommissioners: [],
        members: [user.uid],
        invites: [],
        createdAt: serverTimestamp(),
        status: 'active',
      });

      await updateDoc(doc(db, 'users', user.uid), {
        leagues: arrayUnion(leagueId),
      });

      router.push({ pathname: '/screens/team-select', params: { leagueId, sport, era: finalEra || '', mode: finalMode } });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setLoading(false);
  };

  const getSummaryMode = () => {
    if (sport === 'nba') {
      const e = NBA_ERAS.find(x => x.value === era);
      const t = TEAM_MODES.find(x => x.value === teamMode);
      return (e ? e.label : '') + (t ? ' · ' + t.label : '');
    }
    const m = getModeOptions().find(x => x.value === mode);
    return m ? m.label : '';
  };

  const canAdvanceStep2 = sport === 'nba' ? !!era : !!mode;
  const canAdvanceStep3 = sport === 'nba' ? !!teamMode : true;

  const StepDots = () => (
    <View style={styles.stepIndicator}>
      {Array.from({ length: totalSteps }, (_, i) => i + 1).map((s, i) => (
        <View key={s} style={{ flexDirection: 'row', alignItems: 'center', flex: i < totalSteps - 1 ? 1 : 0 }}>
          <View style={[styles.stepDot, step === s && styles.stepDotActive, step > s && styles.stepDotDone]} />
          {i < totalSteps - 1 && <View style={[styles.stepLine, step > s && styles.stepLineDone]} />}
        </View>
      ))}
    </View>
  );

  const handleBack = () => {
    if (step === 1) router.back();
    else setStep(step - 1);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.inner}>
        <TouchableOpacity onPress={handleBack} style={styles.topBack}>
          <Text style={styles.topBackText}>← Back</Text>
        </TouchableOpacity>

        <StepDots />

        {step === 1 && (
          <>
            <Text style={styles.title}>Name Your League</Text>
            <Text style={styles.subtitle}>What do you want to call your association?</Text>
            <Text style={styles.label}>League Name</Text>
            <TextInput
              style={styles.input}
              placeholder='e.g. Friday Night Association'
              placeholderTextColor='#555'
              value={leagueName}
              onChangeText={setLeagueName}
              autoFocus
            />
            <Text style={styles.label}>Select Sport</Text>
            <View style={styles.optionList}>
              {sports.map(s => (
                <TouchableOpacity
                  key={s.value}
                  style={[styles.sportCard, sport === s.value && styles.sportCardActive]}
                  onPress={() => { setSport(s.value); setMode(''); setEra(''); setTeamMode(''); }}
                >
                  <Text style={styles.sportCardEmoji}>{s.emoji}</Text>
                  <Text style={[styles.sportCardLabel, sport === s.value && styles.sportCardLabelActive]}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.primaryButton, (!leagueName.trim() || !sport) && styles.primaryButtonDisabled]}
              onPress={() => setStep(2)}
              disabled={!leagueName.trim() || !sport}
            >
              <Text style={styles.primaryButtonText}>Next</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 2 && sport === 'nba' && (
          <>
            <Text style={styles.title}>Choose Your Era</Text>
            <Text style={styles.subtitle}>Which era of NBA history will your league be set in?</Text>
            <View style={styles.optionList}>
              {NBA_ERAS.map(m => (
                <TouchableOpacity
                  key={m.value}
                  style={[styles.modeCard, era === m.value && styles.modeCardActive]}
                  onPress={() => setEra(m.value)}
                >
                  <View style={styles.modeCardInner}>
                    <Text style={styles.modeCardEmoji}>{m.icon}</Text>
                    <View style={[styles.modeRadio, era === m.value && styles.modeRadioActive]}>
                      {era === m.value && <View style={styles.modeRadioDot} />}
                    </View>
                    <View style={styles.modeCardText}>
                      <Text style={[styles.modeCardTitle, era === m.value && styles.modeCardTitleActive]}>{m.label}</Text>
                      <Text style={styles.modeCardDesc}>{m.desc}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.primaryButton, !era && styles.primaryButtonDisabled]}
              onPress={() => setStep(3)}
              disabled={!era}
            >
              <Text style={styles.primaryButtonText}>Next</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 2 && sport !== 'nba' && (
          <>
            <Text style={styles.title}>League Mode</Text>
            <Text style={styles.subtitle}>How will teams be set up?</Text>
            <View style={styles.optionList}>
              {getModeOptions().map(m => (
                <TouchableOpacity
                  key={m.value}
                  style={[styles.modeCard, mode === m.value && styles.modeCardActive]}
                  onPress={() => setMode(m.value)}
                >
                  <View style={styles.modeCardInner}>
                    <Text style={styles.modeCardEmoji}>{m.icon}</Text>
                    <View style={[styles.modeRadio, mode === m.value && styles.modeRadioActive]}>
                      {mode === m.value && <View style={styles.modeRadioDot} />}
                    </View>
                    <View style={styles.modeCardText}>
                      <Text style={[styles.modeCardTitle, mode === m.value && styles.modeCardTitleActive]}>{m.label}</Text>
                      <Text style={styles.modeCardDesc}>{m.desc}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.primaryButton, !mode && styles.primaryButtonDisabled]}
              onPress={() => setStep(3)}
              disabled={!mode}
            >
              <Text style={styles.primaryButtonText}>Next</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 3 && sport === 'nba' && (
          <>
            <Text style={styles.title}>Team Assignment</Text>
            <Text style={styles.subtitle}>How will teams be assigned to GMs?</Text>
            <View style={styles.optionList}>
              {TEAM_MODES.map(m => (
                <TouchableOpacity
                  key={m.value}
                  style={[styles.modeCard, teamMode === m.value && styles.modeCardActive]}
                  onPress={() => setTeamMode(m.value)}
                >
                  <View style={styles.modeCardInner}>
                    <Text style={styles.modeCardEmoji}>{m.icon}</Text>
                    <View style={[styles.modeRadio, teamMode === m.value && styles.modeRadioActive]}>
                      {teamMode === m.value && <View style={styles.modeRadioDot} />}
                    </View>
                    <View style={styles.modeCardText}>
                      <Text style={[styles.modeCardTitle, teamMode === m.value && styles.modeCardTitleActive]}>{m.label}</Text>
                      <Text style={styles.modeCardDesc}>{m.desc}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.primaryButton, !teamMode && styles.primaryButtonDisabled]}
              onPress={() => setStep(4)}
              disabled={!teamMode}
            >
              <Text style={styles.primaryButtonText}>Next</Text>
            </TouchableOpacity>
          </>
        )}

        {((step === 3 && sport !== 'nba') || (step === 4 && sport === 'nba')) && (
          <>
            <Text style={styles.title}>Review & Create</Text>
            <Text style={styles.subtitle}>Everything look good?</Text>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>League Summary</Text>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Name</Text>
                <Text style={styles.summaryValue}>{leagueName}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Sport</Text>
                <Text style={styles.summaryValue}>{sports.find(s => s.value === sport)?.label}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Setup</Text>
                <Text style={styles.summaryValue}>{getSummaryMode()}</Text>
              </View>
            </View>
            <View style={styles.infoCard}>
              <Text style={styles.infoText}>Once created you will go straight to your league. Invite friends from the league screen.</Text>
            </View>
            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
              onPress={handleCreate}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color='#000' /> : <Text style={styles.primaryButtonText}>Create League</Text>}
            </TouchableOpacity>
          </>
        )}

        <View style={{ height: 100 }} />
      </View>
      <GlobalNav />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  inner: { padding: 24, paddingTop: 60 },
  topBack: { marginBottom: 16 },
  topBackText: { color: '#00ff87', fontSize: 15, fontWeight: '600' },
  stepIndicator: { flexDirection: 'row', alignItems: 'center', marginBottom: 32 },
  stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2a2a2a', borderWidth: 1, borderColor: '#444' },
  stepDotActive: { backgroundColor: '#00ff87', borderColor: '#00ff87' },
  stepDotDone: { backgroundColor: '#005533', borderColor: '#00ff87' },
  stepLine: { flex: 1, height: 1, backgroundColor: '#2a2a2a' },
  stepLineDone: { backgroundColor: '#005533' },
  title: { fontSize: 30, fontWeight: '800', color: '#ffffff', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#888888', marginBottom: 28 },
  label: { fontSize: 13, fontWeight: '600', color: '#aaaaaa', marginBottom: 8, textTransform: 'uppercase' },
  input: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, color: '#ffffff', fontSize: 15, marginBottom: 24, borderWidth: 1, borderColor: '#2a2a2a' },
  optionList: { gap: 10, marginBottom: 32 },
  sportCard: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 18, borderWidth: 1, borderColor: '#2a2a2a', flexDirection: 'row', alignItems: 'center', gap: 14 },
  sportCardActive: { borderColor: '#00ff87', backgroundColor: '#0a2a1a' },
  sportCardEmoji: { fontSize: 24 },
  sportCardLabel: { color: '#888888', fontSize: 16, fontWeight: '600' },
  sportCardLabelActive: { color: '#00ff87' },
  modeCard: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#2a2a2a', marginBottom: 2 },
  modeCardActive: { borderColor: '#00ff87', backgroundColor: '#0a2a1a' },
  modeCardInner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  modeCardEmoji: { fontSize: 22, marginTop: 2 },
  modeRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#444', alignItems: 'center', justifyContent: 'center', marginTop: 4, flexShrink: 0 },
  modeRadioActive: { borderColor: '#00ff87' },
  modeRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#00ff87' },
  modeCardText: { flex: 1 },
  modeCardTitle: { fontSize: 15, fontWeight: '700', color: '#888888', marginBottom: 3 },
  modeCardTitleActive: { color: '#00ff87' },
  modeCardDesc: { fontSize: 13, color: '#555555', lineHeight: 18 },
  summaryCard: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#2a2a2a' },
  summaryTitle: { fontSize: 16, fontWeight: '700', color: '#ffffff', marginBottom: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  summaryLabel: { fontSize: 14, color: '#666666' },
  summaryValue: { fontSize: 14, fontWeight: '600', color: '#ffffff' },
  infoCard: { backgroundColor: '#0a1a0a', borderRadius: 12, padding: 16, marginBottom: 32, borderWidth: 1, borderColor: '#1a3a1a' },
  infoText: { color: '#4a8a4a', fontSize: 13, lineHeight: 20 },
  primaryButton: { backgroundColor: '#00ff87', borderRadius: 14, paddingVertical: 18, alignItems: 'center' },
  primaryButtonDisabled: { opacity: 0.4 },
  primaryButtonText: { color: '#000000', fontSize: 16, fontWeight: '700' },
});