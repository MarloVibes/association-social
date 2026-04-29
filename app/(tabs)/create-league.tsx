import { router } from 'expo-router';
import { arrayUnion, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';

function generateLeagueCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

const SPORTS = [
  { label: 'NBA 2K', value: 'nba' },
  { label: 'Madden NFL', value: 'madden' },
  { label: 'MLB The Show', value: 'mlb' },
];

const MODES = [
  {
    value: 'current',
    title: 'Current Rosters',
    desc: 'Teams assigned with full real rosters pre-loaded',
  },
  {
    value: 'random',
    title: 'Randomize Teams',
    desc: 'Teams randomly assigned Yahtzee-style, rosters pre-loaded',
  },
  {
    value: 'draft',
    title: 'Draft Mode',
    desc: 'GMs pick or get assigned a team, then build roster manually',
  },
];

export default function CreateLeagueScreen() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [leagueName, setLeagueName] = useState('');
  const [sport, setSport] = useState('');
  const [mode, setMode] = useState('');
  const [maxTeams, setMaxTeams] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    const user = auth.currentUser;
    if (!user) {
      Alert.alert('Not signed in', 'Please sign in to create a league.');
      router.replace('/(tabs)/auth?mode=signin');
      return;
    }

    setLoading(true);
    try {
      const leagueId = doc(db, 'leagues', '_').id;
      const leagueCode = generateLeagueCode();

      await setDoc(doc(db, 'leagues', leagueId), {
        name: leagueName.trim(),
        sport,
        mode,
        maxTeams: maxTeams ? parseInt(maxTeams) : null,
        code: leagueCode,
        commissionerId: user.uid,
        members: [user.uid],
        status: 'setup',
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'users', user.uid), {
        leagues: arrayUnion(leagueId),
      });

      Alert.alert(
        '🏆 League Created!',
        `Invite code: ${leagueCode}\n\nShare this with your GMs so they can join.`,
        [{ text: 'Go to Dashboard', onPress: () => router.replace('/(tabs)/dashboard') }]
      );
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setLoading(false);
  };

  // Step 1 — Name + Sport
  if (step === 1) {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.inner}>
          <View style={styles.stepIndicator}>
            <View style={[styles.stepDot, styles.stepDotActive]} />
            <View style={styles.stepLine} />
            <View style={styles.stepDot} />
            <View style={styles.stepLine} />
            <View style={styles.stepDot} />
          </View>
          <Text style={styles.title}>Create a League</Text>
          <Text style={styles.subtitle}>Step 1 of 3 — Name & Sport</Text>

          <Text style={styles.label}>League Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Friday Night Association"
            placeholderTextColor="#555"
            value={leagueName}
            onChangeText={setLeagueName}
          />

          <Text style={styles.label}>Select Sport</Text>
          <View style={styles.optionList}>
            {SPORTS.map((s) => (
              <TouchableOpacity
                key={s.value}
                style={[styles.optionCard, sport === s.value && styles.optionCardActive]}
                onPress={() => setSport(s.value)}
              >
                <Text style={[styles.optionCardTitle, sport === s.value && styles.optionCardTitleActive]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, (!leagueName.trim() || !sport) && styles.primaryButtonDisabled]}
            onPress={() => setStep(2)}
            disabled={!leagueName.trim() || !sport}
          >
            <Text style={styles.primaryButtonText}>Next →</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // Step 2 — League Mode
  if (step === 2) {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.inner}>
          <View style={styles.stepIndicator}>
            <View style={[styles.stepDot, styles.stepDotDone]} />
            <View style={[styles.stepLine, styles.stepLineDone]} />
            <View style={[styles.stepDot, styles.stepDotActive]} />
            <View style={styles.stepLine} />
            <View style={styles.stepDot} />
          </View>
          <Text style={styles.title}>League Mode</Text>
          <Text style={styles.subtitle}>Step 2 of 3 — How will teams be assigned?</Text>

          <View style={styles.optionList}>
            {MODES.map((m) => (
              <TouchableOpacity
                key={m.value}
                style={[styles.modeCard, mode === m.value && styles.modeCardActive]}
                onPress={() => setMode(m.value)}
              >
                <View style={styles.modeCardInner}>
                  <View style={[styles.modeRadio, mode === m.value && styles.modeRadioActive]}>
                    {mode === m.value && <View style={styles.modeRadioDot} />}
                  </View>
                  <View style={styles.modeCardText}>
                    <Text style={[styles.modeCardTitle, mode === m.value && styles.modeCardTitleActive]}>
                      {m.title}
                    </Text>
                    <Text style={styles.modeCardDesc}>{m.desc}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.rowButtons}>
            <TouchableOpacity style={styles.backButton} onPress={() => setStep(1)}>
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryButtonFlex, !mode && styles.primaryButtonDisabled]}
              onPress={() => setStep(3)}
              disabled={!mode}
            >
              <Text style={styles.primaryButtonText}>Next →</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    );
  }

  // Step 3 — League Size + Confirm
  return (
    <ScrollView style={styles.container}>
      <View style={styles.inner}>
        <View style={styles.stepIndicator}>
          <View style={[styles.stepDot, styles.stepDotDone]} />
          <View style={[styles.stepLine, styles.stepLineDone]} />
          <View style={[styles.stepDot, styles.stepDotDone]} />
          <View style={[styles.stepLine, styles.stepLineDone]} />
          <View style={[styles.stepDot, styles.stepDotActive]} />
        </View>
        <Text style={styles.title}>Final Details</Text>
        <Text style={styles.subtitle}>Step 3 of 3 — Review & Create</Text>

        <Text style={styles.label}>Max Teams (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 30 for full NBA league"
          placeholderTextColor="#555"
          value={maxTeams}
          onChangeText={setMaxTeams}
          keyboardType="number-pad"
        />
        <Text style={styles.inputHint}>Leave blank for unlimited</Text>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>League Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Name</Text>
            <Text style={styles.summaryValue}>{leagueName}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Sport</Text>
            <Text style={styles.summaryValue}>
              {SPORTS.find((s) => s.value === sport)?.label}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Mode</Text>
            <Text style={styles.summaryValue}>
              {MODES.find((m) => m.value === mode)?.title}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Max Teams</Text>
            <Text style={styles.summaryValue}>{maxTeams || 'Unlimited'}</Text>
          </View>
        </View>

        <View style={styles.rowButtons}>
          <TouchableOpacity style={styles.backButton} onPress={() => setStep(2)}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryButtonFlex, loading && styles.primaryButtonDisabled]}
            onPress={handleCreate}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#000" />
              : <Text style={styles.primaryButtonText}>Create League</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  inner: { padding: 24, paddingTop: 60 },
  stepIndicator: { flexDirection: 'row', alignItems: 'center', marginBottom: 32 },
  stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2a2a2a', borderWidth: 1, borderColor: '#444' },
  stepDotActive: { backgroundColor: '#00ff87', borderColor: '#00ff87' },
  stepDotDone: { backgroundColor: '#005533', borderColor: '#00ff87' },
  stepLine: { flex: 1, height: 1, backgroundColor: '#2a2a2a' },
  stepLineDone: { backgroundColor: '#005533' },
  title: { fontSize: 32, fontWeight: '800', color: '#ffffff', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#888888', marginBottom: 32 },
  label: { fontSize: 13, fontWeight: '600', color: '#aaaaaa', marginBottom: 8, textTransform: 'uppercase' },
  input: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, color: '#ffffff', fontSize: 15, marginBottom: 8, borderWidth: 1, borderColor: '#2a2a2a' },
  inputHint: { color: '#555', fontSize: 12, marginBottom: 24 },
  optionList: { gap: 10, marginBottom: 32 },
  optionCard: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#2a2a2a' },
  optionCardActive: { borderColor: '#00ff87', backgroundColor: '#0a2a1a' },
  optionCardTitle: { color: '#888888', fontSize: 15, fontWeight: '600' },
  optionCardTitleActive: { color: '#00ff87' },
  modeCard: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 18, borderWidth: 1, borderColor: '#2a2a2a', marginBottom: 2 },
  modeCardActive: { borderColor: '#00ff87', backgroundColor: '#0a2a1a' },
  modeCardInner: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  modeRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#444', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  modeRadioActive: { borderColor: '#00ff87' },
  modeRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#00ff87' },
  modeCardText: { flex: 1 },
  modeCardTitle: { fontSize: 16, fontWeight: '700', color: '#888888', marginBottom: 4 },
  modeCardTitleActive: { color: '#00ff87' },
  modeCardDesc: { fontSize: 13, color: '#555555', lineHeight: 18 },
  summaryCard: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 20, marginBottom: 32, borderWidth: 1, borderColor: '#2a2a2a' },
  summaryTitle: { fontSize: 16, fontWeight: '700', color: '#ffffff', marginBottom: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  summaryLabel: { fontSize: 14, color: '#666666' },
  summaryValue: { fontSize: 14, fontWeight: '600', color: '#ffffff' },
  rowButtons: { flexDirection: 'row', gap: 12 },
  backButton: { backgroundColor: '#1a1a1a', borderRadius: 14, paddingVertical: 18, paddingHorizontal: 20, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a2a' },
  backButtonText: { color: '#888888', fontSize: 15, fontWeight: '600' },
  primaryButton: { backgroundColor: '#00ff87', borderRadius: 14, paddingVertical: 18, alignItems: 'center' },
  primaryButtonFlex: { flex: 1, backgroundColor: '#00ff87', borderRadius: 14, paddingVertical: 18, alignItems: 'center' },
  primaryButtonDisabled: { opacity: 0.4 },
  primaryButtonText: { color: '#000000', fontSize: 16, fontWeight: '700' },
});
