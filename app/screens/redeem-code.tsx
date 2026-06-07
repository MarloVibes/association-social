import { router } from 'expo-router';
import { doc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, db, functions } from '@/constants/firebase';

export default function RedeemCodeScreen() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ label: string; lifetime: boolean } | null>(null);

  const redeem = async () => {
    const entered = code.trim();
    if (!entered) { setError('Enter a promo code.'); return; }
    setLoading(true);
    setError('');
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('You must be signed in.');

      // Server enforces single-use atomically and returns the grant.
      const fn = httpsCallable(functions, 'redeemPromoCode');
      const res: any = await fn({ code: entered });
      const plan: string = res.data?.plan || 'promo';
      const months: number = res.data?.months || 0;
      const label: string = res.data?.label || 'Promo';

      let accessUntil: string | null = null;
      if (plan !== 'lifetime' && months > 0) {
        const d = new Date();
        d.setMonth(d.getMonth() + months);
        accessUntil = d.toISOString();
      }

      await updateDoc(doc(db, 'users', user.uid), {
        plan,
        promoCode: entered.toUpperCase(),
        promoLabel: label,
        accessUntil,
      });

      setSuccess({ label, lifetime: plan === 'lifetime' });
    } catch (e: any) {
      // Callable errors arrive as e.message (HttpsError message from the server).
      setError(e?.message || "That code couldn't be redeemed.");
    }
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Redeem Code</Text>
        <View style={{ width: 60 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.body}>
        {success ? (
          <View style={styles.successWrap}>
            <Text style={styles.successIcon}>🎟️</Text>
            <Text style={styles.successTitle}>Code Redeemed!</Text>
            <Text style={styles.successLabel}>{success.label}</Text>
            <Text style={styles.successSub}>
              {success.lifetime ? 'Lifetime access is now active on your account.' : 'Your access has been applied.'}
            </Text>
            <TouchableOpacity style={styles.primaryButton} onPress={() => router.back()}>
              <Text style={styles.primaryButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.icon}>🎟️</Text>
            <Text style={styles.lead}>Have a promo code?</Text>
            <Text style={styles.sub}>Enter it below to unlock your access.</Text>
            <TextInput
              style={styles.input}
              placeholder="Promo code"
              placeholderTextColor="#555"
              value={code}
              onChangeText={setCode}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!loading}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <TouchableOpacity style={styles.primaryButton} onPress={redeem} disabled={loading}>
              {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryButtonText}>Redeem</Text>}
            </TouchableOpacity>
          </>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  backText: { color: '#00ff87', fontSize: 15, fontWeight: '600', width: 60 },
  title: { fontSize: 18, fontWeight: '800', color: '#ffffff' },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 48, alignItems: 'center' },
  icon: { fontSize: 48, marginBottom: 16 },
  lead: { color: '#ffffff', fontSize: 22, fontWeight: '800', marginBottom: 6 },
  sub: { color: '#888', fontSize: 14, marginBottom: 28, textAlign: 'center' },
  input: { width: '100%', backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, color: '#ffffff', fontSize: 16, borderWidth: 1, borderColor: '#2a2a2a', textAlign: 'center', letterSpacing: 2, fontWeight: '700' },
  error: { color: '#ff4444', fontSize: 13, marginTop: 14, textAlign: 'center' },
  primaryButton: { width: '100%', backgroundColor: '#00ff87', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 20 },
  primaryButtonText: { color: '#000', fontSize: 16, fontWeight: '800' },
  successWrap: { alignItems: 'center', paddingTop: 20 },
  successIcon: { fontSize: 56, marginBottom: 16 },
  successTitle: { color: '#00ff87', fontSize: 24, fontWeight: '900', marginBottom: 10 },
  successLabel: { color: '#FFD700', fontSize: 18, fontWeight: '800', marginBottom: 8 },
  successSub: { color: '#888', fontSize: 14, textAlign: 'center', marginBottom: 24 },
});
