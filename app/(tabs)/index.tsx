import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Association</Text>
        <Text style={styles.titleBold}>Social</Text>
        <Text style={styles.subtitle}>The ultimate franchise mode manager</Text>
      </View>
      <View style={styles.sportsRow}>
        <View style={styles.sportBadge}><Text style={styles.sportText}>NBA 2K</Text></View>
        <View style={styles.sportBadge}><Text style={styles.sportText}>Madden</Text></View>
        <View style={styles.sportBadge}><Text style={styles.sportText}>MLB</Text></View>
      </View>
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/(tabs)/auth?mode=signup')}>
          <Text style={styles.primaryButtonText}>Create a League</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('/(tabs)/auth?mode=signup')}>
          <Text style={styles.secondaryButtonText}>Join a League</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity onPress={() => router.push('/(tabs)/auth?mode=signin')}>
        <Text style={styles.loginText}>Already have an account? <Text style={styles.loginLink}>Sign In</Text></Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 40 },
  title: { fontSize: 42, fontWeight: '300', color: '#ffffff', letterSpacing: 2 },
  titleBold: { fontSize: 42, fontWeight: '800', color: '#00ff87', letterSpacing: 2, marginTop: -8 },
  subtitle: { fontSize: 14, color: '#888888', marginTop: 12, letterSpacing: 1 },
  sportsRow: { flexDirection: 'row', gap: 10, marginBottom: 50 },
  sportBadge: { backgroundColor: '#1a1a1a', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#333333' },
  sportText: { color: '#cccccc', fontSize: 13 },
  buttonContainer: { width: '100%', gap: 14, marginBottom: 30 },
  primaryButton: { backgroundColor: '#00ff87', borderRadius: 14, paddingVertical: 18, alignItems: 'center' },
  primaryButtonText: { color: '#000000', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  secondaryButton: { backgroundColor: '#1a1a1a', borderRadius: 14, paddingVertical: 18, alignItems: 'center', borderWidth: 1, borderColor: '#333333' },
  secondaryButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  loginText: { color: '#888888', fontSize: 14 },
  loginLink: { color: '#00ff87', fontWeight: '600' },
});
