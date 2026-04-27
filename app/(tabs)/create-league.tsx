import { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView } from 'react-native';

export default function CreateLeagueScreen() {
  const [leagueName, setLeagueName] = useState('');
  const [sport, setSport] = useState('');

  const sports = [
    { label: 'NBA 2K', value: 'nba' },
    { label: 'Madden NFL', value: 'madden' },
    { label: 'MLB The Show', value: 'mlb' },
  ];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.title}>Create a League</Text>
        <Text style={styles.subtitle}>Set up your association</Text>
        <Text style={styles.label}>League Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Friday Night Association"
          placeholderTextColor="#555"
          value={leagueName}
          onChangeText={setLeagueName}
        />
        <Text style={styles.label}>Select Sport</Text>
        <View style={styles.sportRow}>
          {sports.map((s) => (
            <TouchableOpacity
              key={s.value}
              style={[styles.sportButton, sport === s.value && styles.sportButtonActive]}
              onPress={() => setSport(s.value)}
            >
              <Text style={[styles.sportButtonText, sport === s.value && styles.sportButtonTextActive]}>
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.optionRow}>
          <Text style={styles.optionLabel}>Randomize Team Selection</Text>
          <Text style={styles.optionHint}>Teams randomly assigned to GMs</Text>
        </View>
        <TouchableOpacity style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Create League</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  inner: { padding: 24, paddingTop: 60 },
  title: { fontSize: 32, fontWeight: '800', color: '#ffffff', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#888888', marginBottom: 32 },
  label: { fontSize: 13, fontWeight: '600', color: '#aaaaaa', marginBottom: 8, textTransform: 'uppercase' },
  input: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, color: '#ffffff', fontSize: 15, marginBottom: 24, borderWidth: 1, borderColor: '#2a2a2a' },
  sportRow: { flexDirection: 'column', gap: 10, marginBottom: 24 },
  sportButton: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#2a2a2a' },
  sportButtonActive: { borderColor: '#00ff87', backgroundColor: '#0a2a1a' },
  sportButtonText: { color: '#888888', fontSize: 15, fontWeight: '500' },
  sportButtonTextActive: { color: '#00ff87' },
  optionRow: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: '#2a2a2a' },
  optionLabel: { color: '#ffffff', fontSize: 15, fontWeight: '600', marginBottom: 4 },
  optionHint: { color: '#888888', fontSize: 13 },
  primaryButton: { backgroundColor: '#00ff87', borderRadius: 14, paddingVertical: 18, alignItems: 'center' },
  primaryButtonText: { color: '#000000', fontSize: 16, fontWeight: '700' },
});
