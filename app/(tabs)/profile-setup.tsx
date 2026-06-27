import { router, useLocalSearchParams } from 'expo-router';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, db, functions } from '@/constants/firebase';

export default function ProfileSetupScreen() {
  const { initialUsername, promoCode } = useLocalSearchParams<{
    initialUsername?: string; promoCode?: string;
  }>();
  const hasPromo = !!promoCode?.trim();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState(String(initialUsername || ''));
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [gamerTag, setGamerTag] = useState('');
  const [bio, setBio] = useState('');
  const [console_, setConsole] = useState('');
  const [favSports, setFavSports] = useState<string[]>([]);
  const [plan, setPlan] = useState('trial');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const genders = ['Male', 'Female', 'Other'];
  const consoles = ['PS5', 'Xbox', 'PC'];
  const sports = [
    'NBA Franchise', 'NFL Franchise', 'MLB Franchise',
    'Soccer Franchise', 'Hockey Franchise', 'Combat Sports',
    'Motorsports Franchise', 'College Football',
    'Rocket League', 'Skateboarding', 'Golf Franchise',
  ];

  const handleSave = async () => {
    if (!username.trim()) {
      setError('Username is required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Not logged in');

      const uname = username.trim().replace(/^@+/, '').toLowerCase();
      if (!/^[a-z0-9_]{3,20}$/.test(uname)) {
        setError('Use 3-20 letters, numbers, or underscores for your username.');
        setLoading(false);
        return;
      }
      const unameLower = uname.toLowerCase();

      // Enforce unique usernames. Two layers:
      // 1) Query existing users (catches accounts created before reservations).
      // 2) A reservation doc at usernames/{lower} — rules only let the owner hold
      //    it, so a second claimant's write is denied atomically (handles races).
      const dupSnap = await getDocs(query(collection(db, 'users'), where('usernameLower', '==', unameLower)));
      const takenByOther = dupSnap.docs.some(d => d.id !== user.uid);
      if (takenByOther) {
        setError('That username is already taken — try another.');
        setLoading(false);
        return;
      }
      const resRef = doc(db, 'usernames', unameLower);
      const resSnap = await getDoc(resRef);
      if (resSnap.exists() && resSnap.data()?.uid !== user.uid) {
        setError('That username is already taken — try another.');
        setLoading(false);
        return;
      }
      try {
        await setDoc(resRef, { uid: user.uid, username: uname });
      } catch {
        setError('That username was just taken — try another.');
        setLoading(false);
        return;
      }

      // Display name is optional and defaults to the (unique) username, so the
      // rest of the app — which shows displayName — always has something to show.
      const finalDisplayName = displayName.trim() || uname;

      const profileData = {
        uid: user.uid,
        email: user.email || '',
        displayName: finalDisplayName,
        username: uname,
        usernameLower: unameLower,
        age,
        gender,
        gamerTag,
        bio,
        console: console_,
        favSports,
        plan,
        promoCode: null,
        promoLabel: null,
        accessUntil: null,
        createdAt: new Date().toISOString(),
        leagues: [],
        friends: [],
        friendRequestsSent: [],
        friendRequestsReceived: [],
        blockedUsers: [],
        dmEnabled: true,
        socials: {
          twitch: '',
          youtube: '',
          twitter: '',
          instagram: '',
          tiktok: '',
        },
      };

      if (hasPromo) {
        const redeem = httpsCallable(functions, 'redeemPromoCode');
        await redeem({ code: String(promoCode).trim(), profile: profileData });
      } else {
        await setDoc(doc(db, 'users', user.uid), profileData);
      }

      router.replace('/(tabs)/dashboard');
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
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
        <TextInput style={styles.input} placeholder="Optional — defaults to your username" placeholderTextColor="#555" value={displayName} onChangeText={setDisplayName} />

        <Text style={styles.label}>Username *</Text>
        <TextInput style={styles.input} placeholder="@username (unique)" placeholderTextColor="#555" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} />

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
        <Text style={styles.multiSelectHint}>Select all that apply</Text>
        <View style={styles.sportGrid}>
          {sports.map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.sportButton, favSports.includes(s) && styles.sportButtonActive]}
              onPress={() => setFavSports(prev =>
                prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
              )}
            >
              <Text style={[styles.sportText, favSports.includes(s) && styles.sportTextActive]}>{s}</Text>
              {favSports.includes(s) && <Text style={styles.sportCheck}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Bio</Text>
        <TextInput style={[styles.input, styles.textArea]} placeholder="Tell the league about yourself..." placeholderTextColor="#555" value={bio} onChangeText={setBio} multiline />

        <Text style={styles.label}>Social Media (Optional)</Text>
        <TextInput style={styles.input} placeholder="Twitch username" placeholderTextColor="#555" autoCapitalize="none" />
        <TextInput style={styles.input} placeholder="YouTube channel" placeholderTextColor="#555" autoCapitalize="none" />
        <TextInput style={styles.input} placeholder="Twitter / X handle" placeholderTextColor="#555" autoCapitalize="none" />
        <TextInput style={styles.input} placeholder="Instagram handle" placeholderTextColor="#555" autoCapitalize="none" />
        <TextInput style={styles.input} placeholder="TikTok handle" placeholderTextColor="#555" autoCapitalize="none" />

        <Text style={styles.label}>{hasPromo ? 'Your Plan' : 'Choose Your Plan'}</Text>
        {hasPromo ? (
          <View style={[styles.planCard, styles.promoCard]}>
            <Text style={styles.promoBadge}>PROMO READY</Text>
            <Text style={[styles.planTitle, styles.planTitleActive]}>{promoCode}</Text>
            <Text style={styles.planDesc}>Your promo will be validated when you finish your profile.</Text>
          </View>
        ) : (
          <>
            <TouchableOpacity style={[styles.planCard, plan === 'trial' && styles.planCardActive]} onPress={() => setPlan('trial')}>
              <Text style={[styles.planTitle, plan === 'trial' && styles.planTitleActive]}>Free Trial</Text>
              <Text style={styles.planDesc}>2 weeks free, no credit card needed</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.planCard, plan === 'paid' && styles.planCardActive]} onPress={() => setPlan('paid')}>
              <Text style={[styles.planTitle, plan === 'paid' && styles.planTitleActive]}>Monthly — $5/month</Text>
              <Text style={styles.planDesc}>Full access, cancel anytime</Text>
            </TouchableOpacity>
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity style={styles.primaryButton} onPress={handleSave} disabled={loading}>
          {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryButtonText}>Enter the Association</Text>}
        </TouchableOpacity>
        <View style={styles.spacer} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  scrollContent: { flexGrow: 1 },
  inner: { padding: 24, paddingTop: 60 },
  title: { fontSize: 28, fontWeight: '800', color: '#ffffff', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#888888', marginBottom: 32 },
  avatarContainer: { alignItems: 'center', marginBottom: 32 },
  avatar: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#1a1a1a', borderWidth: 2, borderColor: '#00ff87', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  avatarText: { fontSize: 32, color: '#00ff87' },
  avatarLabel: { color: '#00ff87', fontSize: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#aaaaaa', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, color: '#ffffff', fontSize: 15, marginBottom: 12, borderWidth: 1, borderColor: '#2a2a2a' },
  textArea: { height: 100, textAlignVertical: 'top', marginBottom: 24 },
  optionRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  optionButton: { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a2a' },
  optionButtonActive: { borderColor: '#00ff87', backgroundColor: '#0a2a1a' },
  optionText: { color: '#888888', fontSize: 14, fontWeight: '500' },
  optionTextActive: { color: '#00ff87' },
  sportGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  multiSelectHint: { color: '#666', fontSize: 12, marginBottom: 8 },
  sportButton: { backgroundColor: '#1a1a1a', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: '#2a2a2a', flexDirection: 'row', alignItems: 'center', gap: 6 },
  sportButtonActive: { borderColor: '#00ff87', backgroundColor: '#0a2a1a' },
  sportText: { color: '#888888', fontSize: 13, fontWeight: '500' },
  sportCheck: { color: '#00ff87', fontSize: 12, fontWeight: '700' },
  sportTextActive: { color: '#00ff87' },
  planCard: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: '#2a2a2a' },
  planCardActive: { borderColor: '#00ff87', backgroundColor: '#0a2a1a' },
  promoCard: { borderColor: '#FFD700', backgroundColor: '#2a2410' },
  promoBadge: { color: '#FFD700', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 6 },
  planTitle: { fontSize: 16, fontWeight: '700', color: '#888888', marginBottom: 4 },
  planTitleActive: { color: '#00ff87' },
  planDesc: { fontSize: 13, color: '#555555' },
  error: { color: '#ff4444', fontSize: 13, marginBottom: 12 },
  primaryButton: { backgroundColor: '#00ff87', borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginTop: 12 },
  primaryButtonText: { color: '#000000', fontSize: 16, fontWeight: '700' },
  spacer: { height: 60 },
});
