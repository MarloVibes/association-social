import { router, useLocalSearchParams } from 'expo-router';
import { addDoc, collection, doc, getDoc, serverTimestamp, updateDoc, arrayUnion } from 'firebase/firestore';
import { useState, useEffect } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';
import GlobalNav from '@/components/GlobalNav';

export default function JoinLeagueScreen() {
  const { leagueId, leagueName } = useLocalSearchParams<{ leagueId?: string; leagueName?: string }>();
  const [loading, setLoading] = useState(false);
  const [league, setLeague] = useState<any>(null);
  const [alreadyRequested, setAlreadyRequested] = useState(false);
  const [alreadyMember, setAlreadyMember] = useState(false);
  const user = auth.currentUser;

  useEffect(() => {
    if (leagueId) loadLeague();
  }, [leagueId]);

  const loadLeague = async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'leagues', leagueId!));
      if (snap.exists()) {
        const data = snap.data();
        setLeague({ id: snap.id, ...data });
        if (data.members?.includes(user?.uid)) setAlreadyMember(true);
        // Check if already requested
        const reqSnap = await getDoc(doc(db, 'leagues', leagueId!, 'join_requests', user!.uid));
        if (reqSnap.exists()) setAlreadyRequested(true);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const sendJoinRequest = async () => {
    if (!user || !league) return;
    setLoading(true);
    try {
      const myProfile = await getDoc(doc(db, 'users', user.uid));
      const myData = myProfile.data() || {};

      // Save join request to league
      await addDoc(collection(db, 'leagues', league.id, 'join_requests'), {
        uid: user.uid,
        displayName: myData.displayName || user.email,
        username: myData.username || '',
        gamerTag: myData.gamerTag || '',
        leagueId: league.id,
        leagueName: league.name,
        requestedAt: serverTimestamp(),
        status: 'pending',
      });

      // Send notification to commissioner
      await updateDoc(doc(db, 'users', league.commissionerId), {
        notifications: arrayUnion({
          type: 'join_request',
          leagueId: league.id,
          leagueName: league.name,
          fromUid: user.uid,
          fromName: myData.displayName || user.email,
          fromUsername: myData.username || '',
          createdAt: new Date().toISOString(),
        }),
      });

      setAlreadyRequested(true);
      Alert.alert('Request Sent!', 'The commissioner will review your request and you will be notified when accepted or denied.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setLoading(false);
  };

  if (!leagueId) {
    return (
      <View style={styles.container}>
        <View style={styles.inner}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Join a League</Text>
          <Text style={styles.subtitle}>Find a GM and tap their Leagues button to request to join.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/screens/search-users')}>
            <Text style={styles.primaryBtnText}>Search for GMs</Text>
          </TouchableOpacity>
        </View>
        <GlobalNav />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.inner}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator size='large' color='#00ff87' style={{ marginTop: 60 }} />
        ) : league ? (
          <>
            <View style={styles.leagueCard}>
              <Text style={styles.leagueCardLabel}>League</Text>
              <Text style={styles.leagueName}>{league.name}</Text>
              <Text style={styles.leagueMeta}>{league.sport?.toUpperCase()} · {league.era} · {league.members?.length || 1} members</Text>
              <Text style={styles.leagueCommish}>Commissioner: {league.commissionerName || 'Unknown'}</Text>
            </View>

            {alreadyMember ? (
              <View style={styles.statusCard}>
                <Text style={styles.statusIcon}>✅</Text>
                <Text style={styles.statusText}>You are already a member of this league</Text>
              </View>
            ) : alreadyRequested ? (
              <View style={styles.statusCard}>
                <Text style={styles.statusIcon}>⏳</Text>
                <Text style={styles.statusText}>Join request pending commissioner approval</Text>
              </View>
            ) : (
              <>
                <Text style={styles.infoText}>Your request will be sent to the commissioner for approval. You will be notified once they accept or deny.</Text>
                <TouchableOpacity style={styles.primaryBtn} onPress={sendJoinRequest} disabled={loading}>
                  <Text style={styles.primaryBtnText}>Request to Join</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        ) : (
          <Text style={styles.subtitle}>League not found.</Text>
        )}
      </View>
      <GlobalNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  inner: { flex: 1, padding: 24, paddingTop: 60 },
  backBtn: { marginBottom: 24 },
  backText: { color: '#00ff87', fontSize: 15, fontWeight: '600' },
  title: { fontSize: 28, fontWeight: '800', color: '#ffffff', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#888', marginBottom: 24, lineHeight: 22 },
  leagueCard: { backgroundColor: '#1a1a1a', borderRadius: 16, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: '#2a2a2a' },
  leagueCardLabel: { fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  leagueName: { fontSize: 24, fontWeight: '800', color: '#ffffff', marginBottom: 6 },
  leagueMeta: { fontSize: 13, color: '#888', marginBottom: 4 },
  leagueCommish: { fontSize: 13, color: '#666' },
  statusCard: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 20, alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#2a2a2a' },
  statusIcon: { fontSize: 36 },
  statusText: { color: '#888', fontSize: 15, textAlign: 'center' },
  infoText: { color: '#666', fontSize: 14, lineHeight: 22, marginBottom: 24, textAlign: 'center' },
  primaryBtn: { backgroundColor: '#00ff87', borderRadius: 14, paddingVertical: 18, alignItems: 'center' },
  primaryBtnText: { color: '#000', fontSize: 16, fontWeight: '800' },
});