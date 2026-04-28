import { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { router } from 'expo-router';

export default function ProfileSetupScreen() {
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [gamerTag, setGamerTag] = useState('');
  const [bio, setBio] = useState('');
  const [console_, setConsole] = useState('');
  const [favSport, setFavSport] = useState('');
  const [plan, setPlan] = useState('trial');

  const genders = ['Male', 'Female', 'Other'];
  const consoles = ['PS5', 'Xbox', 'PC'];
  const sports = ['NBA 2K', 'Madden', 'MLB The Show'];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.title}>Set Up Your Profile</Text>
        <Text style={styles.subtitle}>Tell the league who you are</Text>
        <TouchableOpacity style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>+</Text>
          </View>
          <Text style={styles.avatarLabel}>Add Photo</Text>
        </TouchableOpacity>
        <Text style={styles.label}>Display Name</Text>
        <TextInput style={styles.input} placeholder="Your name" placeholderTextColor="#555" value={displayName} onChangeText={setDisplayName} />
        <Text style={styles.label}>Username</Text>
        <TextInput style={styles.input} placeholder="@username" placeholderTextColor="#555" value={username} onChangeText={setUsername} autoCapitalize="none" />
        <Text style={styles.label}>Age</Text>
        <TextInput style={styles.input} placeholder="Your age" placeholderTextColor="#555" value={age} onChangeText={setAge} keyboardType="number-pad" />
        <Text style={styles.label}>Gender</Text>
        <View style={styles.optionRow}>
          {genders.map((g) => (
            <TouchableOpacity key={g} style={[styles.optionButton, gender === g && styles.optionButtonActive]} onPress={() => setGender(g)}>
              <Text style={[styles.optionText, gender === g && styles.optionTextActive]}>{g}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.label}>Gamer Tag</Text>
        <TextInput style={styles.input} placeholder="PSN / Xbox / EA ID" placeholderTextColor="#555" value={gamerTag} onChangeText={setGamerTag} autoCapitalize="none" />
        <Text style={styles.label}>Console</Text>
        <View style={styles.optionRow}>
          {consoles.map((c) => (
            <TouchableOpacity key={c} style={[styles.optionButton, console_ === c && styles.optionButtonActive]} onPress={() => setConsole(c)}>
              <Text style={[styles.optionText, console_ === c && styles.optionTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.label}>Favorite Sport</Text>
        <View style={styles.sportColumn}>
          {sports.map((s) => (
            <TouchableOpacity key={s} style={[styles.sportButton, favSport === s && styles.sportButtonActive]} onPress={() => setFavSport(s)}>
              <Text style={[styles.sportText, favSport === s && styles.sportTextActive]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.label}>Bio</Text>
        <TextInput style={[styles.input, styles.textArea]} placeholder="Tell the league about yourself..." placeholderTextColor="#555" value={bio} onChangeText={setBio} multiline />
        <Text style={styles.label}>Choose Your Plan</Text>
        <TouchableOpacity style={[styles.planCard, plan === 'trial' && styles.planCardActive]} onPress={() => setPlan('trial')}>
          <Text style={[styles.planTitle, plan === 'trial' && styles.planTitleActive]}>Free Trial</Text>
          <Text style={styles.planDesc}>2 weeks free, no credit card needed</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.planCard, plan === 'paid' && styles.planCardActive]} onPress={() => setPlan('paid')}>
          <Text style={[styles.planTitle, plan === 'paid' && styles.planTitleActive]}>Monthly - $5/month</Text>
          <Text style={styles.planDesc}>Full access, cancel anytime</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace('/(tabs)/index')}>
          <Text style={styles.primaryButtonText}>Enter the Association</Text>
        </TouchableOpacity>
        <View style={styles.spacer} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  inner: { padding: 24, paddingTop: 60 },
  title: { fontSize: 28, fontWeight: '800', color: '#ffffff', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#888888', marginBottom: 32 },
  avatarContainer: { alignItems: 'center', marginBottom: 32 },
  avatar: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#1a1a1a', borderWidth: 2, borderColor: '#00ff87', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  avatarText: { fontSize: 32, color: '#00ff87' },
  avatarLabel: { color: '#00ff87', fontSize: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#aaaaaa', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, color: '#ffffff', fontSize: 15, marginBottom: 24, borderWidth: 1, borderColor: '#2a2a2a' },
  textArea: { height: 100, textAlignVertical: 'top' },
  optionRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  optionButton: { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a2a' },
  optionButtonActive: { borderColor: '#00ff87', backgroundColor: '#0a2a1a' },
  optionText: { color: '#888888', fontSize: 14, fontWeight: '500' },
  optionTextActive: { color: '#00ff87' },
  sportColumn: { flexDirection: 'column', gap: 10, marginBottom: 24 },
  sportButton: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#2a2a2a' },
  sportButtonActive: { borderColor: '#00ff87', backgroundColor: '#0a2a1a' },
  sportText: { color: '#888888', fontSize: 15, fontWeight: '500' },
  sportTextActive: { color: '#00ff87' },
  planCard: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: '#2a2a2a' },
  planCardActive: { borderColor: '#00ff87', backgroundColor: '#0a2a1a' },
  planTitle: { fontSize: 16, fontWeight: '700', color: '#888888', marginBottom: 4 },
  planTitleActive: { color: '#00ff87' },
  planDesc: { fontSize: 13, color: '#555555' },
  primaryButton: { backgroundColor: '#00ff87', borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginTop: 12 },
  primaryButtonText: { color: '#000000', fontSize: 16, fontWeight: '700' },
  spacer: { height: 60 },
});
