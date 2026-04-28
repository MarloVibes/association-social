import { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';

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

export default function AuthScreen() {
  const { mode } = useLocalSearchParams();
  const [isSignUp, setIsSignUp] = useState(mode !== 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAuth = async () => {
    setLoading(true);
    setError('');
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      router.replace('/(tabs)/profile-setup');
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.inner}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{isSignUp ? 'Create Account' : 'Welcome Back'}</Text>
        <Text style={styles.subtitle}>{isSignUp ? 'Join the association' : 'Sign in to your league'}</Text>
        <TouchableOpacity style={styles.socialButton}>
          <Text style={styles.socialButtonText}>Continue with Apple</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.socialButton}>
          <Text style={styles.socialButtonText}>Continue with Google</Text>
        </TouchableOpacity>
        <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.divider} />
        </View>
        {isSignUp && (
          <TextInput style={styles.input} placeholder="GM Username" placeholderTextColor="#555" value={username} onChangeText={setUsername} autoCapitalize="none" />
        )}
        <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#555" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <TextInput style={styles.input} placeholder="Password" placeholderTextColor="#555" value={password} onChangeText={setPassword} secureTextEntry />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TouchableOpacity style={styles.primaryButton} onPress={handleAuth} disabled={loading}>
          {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryButtonText}>{isSignUp ? 'Create Account' : 'Sign In'}</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.switchButton} onPress={() => setIsSignUp(!isSignUp)}>
          <Text style={styles.switchText}>{isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  inner: { flex: 1, justifyContent: 'center', padding: 24 },
  backButton: { position: 'absolute', top: 60, left: 24 },
  backText: { color: '#00ff87', fontSize: 16 },
  title: { fontSize: 32, fontWeight: '800', color: '#ffffff', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#888888', marginBottom: 28 },
  socialButton: { backgroundColor: '#1a1a1a', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#2a2a2a' },
  socialButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 16 },
  divider: { flex: 1, height: 1, backgroundColor: '#2a2a2a' },
  dividerText: { color: '#555555', marginHorizontal: 12, fontSize: 13 },
  input: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, color: '#ffffff', fontSize: 15, marginBottom: 14, borderWidth: 1, borderColor: '#2a2a2a' },
  error: { color: '#ff4444', fontSize: 13, marginBottom: 12 },
  primaryButton: { backgroundColor: '#00ff87', borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginTop: 8 },
  primaryButtonText: { color: '#000000', fontSize: 16, fontWeight: '700' },
  switchButton: { marginTop: 20, alignItems: 'center' },
  switchText: { color: '#888888', fontSize: 14 },
});
