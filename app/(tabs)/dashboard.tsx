import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY",
  authDomain: "association-social.firebaseapp.com",
  projectId: "association-social",
  storageBucket: "association-social.firebasestorage.app",
  messagingSenderId: "444786220612",
  appId: "1:444786220612:web:53724911dead483995e611"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);

export default function DashboardScreen() {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    const loadProfile = async () => {
      const user = auth.currentUser;
      if (!user) return;
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) setProfile(snap.data());
    };
    loadProfile();
  }, []);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.inner}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.name}>{profile?.displayName || 'GM'}</Text>
          </View>
          <TouchableOpacity style={styles.avatar}>
            <Text style={styles.avatarText}>{profile?.displayName?.[0]?.toUpperCase() || 'G'}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>Leagues</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>Trades</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>Messages</Text>
          </View>
        </View>
        <Text style={styles.sectionTitle}>My Leagues</Text>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>You have not joined any leagues yet.</Text>
          <View style={styles.emptyButtons}>
            <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/(tabs)/create-league')}>
              <Text style={styles.primaryButtonText}>Create League</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('/(tabs)/join-league')}>
              <Text style={styles.secondaryButtonText}>Join League</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No activity yet. Join a league to get started!</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  inner: { padding: 24, paddingTop: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
  greeting: { fontSize: 14, color: '#888888', marginBottom: 4 },
  name: { fontSize: 24, fontWeight: '800', color: '#ffffff' },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#1a1a1a', borderWidth: 2, borderColor: '#00ff87', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '700', color: '#00ff87' },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 32 },
  statCard: { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a2a' },
  statNumber: { fontSize: 24, fontWeight: '800', color: '#00ff87', marginBottom: 4 },
  statLabel: { fontSize: 12, color: '#888888' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#ffffff', marginBottom: 16 },
  emptyCard: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: '#2a2a2a' },
  emptyText: { color: '#888888', fontSize: 14, marginBottom: 16, textAlign: 'center' },
  emptyButtons: { flexDirection: 'row', gap: 12 },
  primaryButton: { flex: 1, backgroundColor: '#00ff87', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryButtonText: { color: '#000000', fontSize: 14, fontWeight: '700' },
  secondaryButton: { flex: 1, backgroundColor: '#0a0a0a', borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#333333' },
  secondaryButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
});
