import { router } from 'expo-router';
import { arrayUnion, collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';

export default function JoinLeagueScreen() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleJoin = async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) {
      Alert.alert('Invalid code', 'League codes are 6 characters long.');
      return;
    }
    const user = auth.currentUser;
    if (!user) {
      Alert.alert('Not signed in', 'Please sign in to join a league.');
      router.replace('/(tabs)/auth?mode=signin');
      return;
    }
    setLoading(true);
    try {
      const q = query(collection(db, 'leagues'), where('code', '==', trimmed));
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        Alert.alert('Not found', 'No league found with that code. Double-check and try again.');
        setLoading(false);
        return;
      }
      const leagueDoc = snapshot.docs[0];
      const leagueData = leagueDoc.data();
      if (leagueData.members?.includes(user.uid)) {
        Alert.alert('Already joined', 'You are already a member of this league.');
        setLoading(false);
        return;
      }
      await updateDoc(doc(db, 'leagues', leagueDoc.id), { members: arrayUnion(user.uid) });
      await updateDoc(doc(db, 'users', user.uid), { leagues: arrayUnion(leagueDoc.id) });
      Alert.alert('Joined!', `Welcome to ${leagueData.name}!`, [
        { text: 'Go to Dashboard', onPress: () => router.replace('/(tabs)/dashboard') },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.inner}>
        <Text style={styles.title}>Join a League</Text>
        <Text style={styles.subtitle}>Enter the invite code from your commissioner</Text>
        <Text style={styles.label}>Invite Code</Text>
        <TextInput
          style={styles.codeInput}
          placeholder="e.g. X7K2PQ"
          placeholderTextColor="#555"
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          returnKeyType="done"
          onSubmitEditing={handleJoin}
        />
        <Text style={styles.hint}>Codes are 6 characters — ask your commissioner</Text>
        <TouchableOpacity
          style={[styles.primaryButton, (loading || code.length !== 6) && styles.primaryButtonDisabled]}
          onPress={handleJoin}
          disabled={loading || code.length !== 6}
        >
          {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryButtonText}>Join League</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  inner: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 32, fontWeight: '800', color: '#ffffff', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#888888', marginBottom: 40 },
  label: { fontSize: 13, fontWeight: '600', color: '#aaaaaa', marginBottom: 8, textTransform: 'uppercase' },
  codeInput: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 20, color: '#ffffff', fontSize: 28, fontWeight: '700', letterSpacing: 8, marginBottom: 10, borderWidth: 1, borderColor: '#2a2a2a', textAlign: 'center' },
  hint: { color: '#555555', fontSize: 13, textAlign: 'center', marginBottom: 40 },
  primaryButton: { backgroundColor: '#00ff87', borderRadius: 14, paddingVertical: 18, alignItems: 'center' },
  primaryButtonDisabled: { opacity: 0.4 },
  primaryButtonText: { color: '#000000', fontSize: 16, fontWeight: '700' },
});
