import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function JoinLeagueScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.inner}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Join a League</Text>
        <Text style={styles.subtitle}>
          League invites are sent by commissioners through the friends system.
        </Text>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>How to join a league</Text>
          <Text style={styles.cardStep}>1. Find the commissioner in Search GMs</Text>
          <Text style={styles.cardStep}>2. Send them a friend request</Text>
          <Text style={styles.cardStep}>3. Once friends, they can invite you to their league</Text>
          <Text style={styles.cardStep}>4. Accept the invite from your notifications</Text>
        </View>
        <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/screens/search-users')}>
          <Text style={styles.primaryButtonText}>Search for GMs</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  inner: { flex: 1, padding: 24, paddingTop: 60 },
  backText: { color: '#00ff87', fontSize: 15, fontWeight: '600', marginBottom: 32 },
  title: { fontSize: 32, fontWeight: '800', color: '#ffffff', marginBottom: 12 },
  subtitle: { fontSize: 15, color: '#888888', marginBottom: 32, lineHeight: 22 },
  card: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 20, marginBottom: 32, borderWidth: 1, borderColor: '#2a2a2a', gap: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#ffffff', marginBottom: 4 },
  cardStep: { fontSize: 14, color: '#888', lineHeight: 20 },
  primaryButton: { backgroundColor: '#00ff87', borderRadius: 14, paddingVertical: 18, alignItems: 'center' },
  primaryButtonText: { color: '#000000', fontSize: 16, fontWeight: '700' },
});
