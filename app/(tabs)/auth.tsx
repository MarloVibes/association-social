import { router, useLocalSearchParams } from 'expo-router';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, db, functions } from '@/constants/firebase';

export default function AuthScreen() {
  const { mode } = useLocalSearchParams();
  const [isSignUp, setIsSignUp] = useState(mode === 'signup');

  useEffect(() => {
    if (mode === 'signin') setIsSignUp(false);
    if (mode === 'signup') setIsSignUp(true);
  }, [mode]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAuth = async () => {
    setLoading(true);
    setError('');
    try {
      let uid = '';
      let promo: any = null;
      if (isSignUp) {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        uid = result.user.uid;
        // Redeem promo code (optional) via the server — single-use is enforced
        // there, atomically. A bad/used code doesn't block signup; the user just
        // continues without the perk and is told why.
        if (promoCode.trim()) {
          try {
            const redeem = httpsCallable(functions, 'redeemPromoCode');
            const res: any = await redeem({ code: promoCode.trim() });
            promo = { code: promoCode.trim().toUpperCase(), ...res.data };
          } catch (e: any) {
            setError(e?.message || "That promo code couldn't be applied.");
          }
        }
      } else {
        // Support login by username OR email
        let loginEmail = email.trim().toLowerCase();
        if (!loginEmail.includes('@')) {
          // It's a username - look up the email
          const { getDocs, collection, query, where } = await import('firebase/firestore');
          const q = query(collection(db, 'users'), where('username', '==', loginEmail));
          const snap = await getDocs(q);
          if (snap.empty) {
            setError('No account found with that username.');
            setLoading(false);
            return;
          }
          loginEmail = snap.docs[0].data().email || loginEmail;
        }
        const result = await signInWithEmailAndPassword(auth, loginEmail, password);
        uid = result.user.uid;
      }
      const profileDoc = await getDoc(doc(db, 'users', uid));
      if (profileDoc.exists()) {
        router.replace('/(tabs)/dashboard');
      } else {
        router.replace({
          pathname: '/(tabs)/profile-setup',
          params: promo
            ? {
                promoCode: promo.code,
                promoPlan: promo.plan || 'promo',
                promoMonths: String(promo.months || 0),
                promoLabel: promo.label || 'Promo',
              }
            : {},
        });
      }
    } catch (e: any) {
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
        <TextInput style={styles.input} placeholder="Email or Username" placeholderTextColor="#555" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <TextInput style={styles.input} placeholder="Password" placeholderTextColor="#555" value={password} onChangeText={setPassword} secureTextEntry />
        {isSignUp && (
          <TextInput style={styles.input} placeholder="Promo code (optional)" placeholderTextColor="#555" value={promoCode} onChangeText={setPromoCode} autoCapitalize="characters" autoCorrect={false} />
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TouchableOpacity style={styles.primaryButton} onPress={handleAuth} disabled={loading}>
          {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryButtonText}>{isSignUp ? 'Create Account' : 'Sign In'}</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.switchButton} onPress={() => setIsSignUp(!isSignUp)}>
          <Text style={styles.switchText}>
            {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
            <Text style={styles.switchLink}>{isSignUp ? 'Sign In' : 'Sign Up'}</Text>
          </Text>
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
  switchLink: { color: '#00ff87', fontSize: 14, textDecorationLine: 'underline' },
});
