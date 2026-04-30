import { router } from 'expo-router';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';
import GlobalNav from '@/components/GlobalNav';

export default function ProfileScreen() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [bio, setBio] = useState('');
  const [gamerTag, setGamerTag] = useState('');
  const [twitch, setTwitch] = useState('');
  const [youtube, setYoutube] = useState('');
  const [twitter, setTwitter] = useState('');
  const [instagram, setInstagram] = useState('');
  const [tiktok, setTiktok] = useState('');
  const [dmEnabled, setDmEnabled] = useState(true);

  const user = auth.currentUser;

  useEffect(() => { loadProfile(); }, []);

  const loadProfile = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) {
        const data = snap.data();
        setProfile(data);
        setBio(data.bio || '');
        setGamerTag(data.gamerTag || '');
        setTwitch(data.socials?.twitch || '');
        setYoutube(data.socials?.youtube || '');
        setTwitter(data.socials?.twitter || '');
        setInstagram(data.socials?.instagram || '');
        setTiktok(data.socials?.tiktok || '');
        setDmEnabled(data.dmEnabled !== false);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        bio,
        gamerTag,
        dmEnabled,
        socials: { twitch, youtube, twitter, instagram, tiktok },
      });
      setEditing(false);
      loadProfile();
      Alert.alert('Saved!', 'Your profile has been updated.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00ff87" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.inner}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profile</Text>
          <TouchableOpacity onPress={() => editing ? saveProfile() : setEditing(true)}>
            {saving
              ? <ActivityIndicator color="#00ff87" size="small" />
              : <Text style={styles.editText}>{editing ? 'Save' : 'Edit'}</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Avatar */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{profile?.displayName?.[0]?.toUpperCase() || 'G'}</Text>
          </View>
          <Text style={styles.displayName}>{profile?.displayName}</Text>
          <Text style={styles.username}>@{profile?.username}</Text>
          <View style={styles.statRow}>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{profile?.leagues?.length || 0}</Text>
              <Text style={styles.statLabel}>Leagues</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statNum}>{profile?.friends?.length || 0}</Text>
              <Text style={styles.statLabel}>Friends</Text>
            </View>
          </View>
        </View>

        {/* Bio */}
        <Text style={styles.sectionLabel}>Bio</Text>
        {editing ? (
          <TextInput
            style={[styles.input, styles.textArea]}
            value={bio}
            onChangeText={setBio}
            multiline
            placeholder="Tell the league about yourself..."
            placeholderTextColor="#555"
          />
        ) : (
          <View style={styles.infoCard}>
            <Text style={styles.infoText}>{bio || 'No bio yet'}</Text>
          </View>
        )}

        {/* Gamer Info */}
        <Text style={styles.sectionLabel}>Gamer Info</Text>
        <View style={styles.infoCard}>
          {editing ? (
            <TextInput
              style={styles.input}
              value={gamerTag}
              onChangeText={setGamerTag}
              placeholder="PSN / Xbox / EA ID"
              placeholderTextColor="#555"
              autoCapitalize="none"
            />
          ) : (
            <>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Gamer Tag</Text>
                <Text style={styles.infoValue}>{profile?.gamerTag || '—'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Console</Text>
                <Text style={styles.infoValue}>{profile?.console || '—'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Fav Sport</Text>
                <Text style={styles.infoValue}>{profile?.favSport || '—'}</Text>
              </View>
            </>
          )}
        </View>

        {/* Social Media */}
        <Text style={styles.sectionLabel}>Social Media</Text>
        {editing ? (
          <View style={styles.infoCard}>
            <TextInput style={styles.socialInput} value={twitch} onChangeText={setTwitch} placeholder="Twitch username" placeholderTextColor="#555" autoCapitalize="none" />
            <TextInput style={styles.socialInput} value={youtube} onChangeText={setYoutube} placeholder="YouTube channel" placeholderTextColor="#555" autoCapitalize="none" />
            <TextInput style={styles.socialInput} value={twitter} onChangeText={setTwitter} placeholder="Twitter / X handle" placeholderTextColor="#555" autoCapitalize="none" />
            <TextInput style={styles.socialInput} value={instagram} onChangeText={setInstagram} placeholder="Instagram handle" placeholderTextColor="#555" autoCapitalize="none" />
            <TextInput style={[styles.socialInput, { marginBottom: 0 }]} value={tiktok} onChangeText={setTiktok} placeholder="TikTok handle" placeholderTextColor="#555" autoCapitalize="none" />
          </View>
        ) : (
          <View style={styles.infoCard}>
            {[
              { label: '🎮 Twitch', value: twitch },
              { label: '▶️ YouTube', value: youtube },
              { label: '𝕏 Twitter', value: twitter },
              { label: '📸 Instagram', value: instagram },
              { label: '🎵 TikTok', value: tiktok },
            ].map(s => s.value ? (
              <View key={s.label} style={styles.infoRow}>
                <Text style={styles.infoLabel}>{s.label}</Text>
                <Text style={styles.infoValue}>{s.value}</Text>
              </View>
            ) : null)}
            {!twitch && !youtube && !twitter && !instagram && !tiktok && (
              <Text style={styles.infoText}>No social links added yet</Text>
            )}
          </View>
        )}

        {/* DM Privacy */}
        <Text style={styles.sectionLabel}>Privacy</Text>
        <TouchableOpacity
          style={[styles.toggleRow, dmEnabled && styles.toggleRowActive]}
          onPress={() => editing && setDmEnabled(!dmEnabled)}
        >
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleLabel}>Allow DMs</Text>
            <Text style={styles.toggleDesc}>
              {dmEnabled ? 'Anyone can message you' : 'Only friends can message you'}
            </Text>
          </View>
          <View style={[styles.toggleSwitch, dmEnabled && styles.toggleSwitchActive]}>
            <View style={[styles.toggleKnob, dmEnabled && styles.toggleKnobActive]} />
          </View>
        </TouchableOpacity>
        {!editing && (
          <Text style={styles.editHint}>Tap Edit to change privacy settings</Text>
        )}

        <View style={{ height: 60 }} />
      </View>
          <GlobalNav />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  loadingContainer: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' },
  inner: { padding: 24, paddingTop: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
  backText: { color: '#00ff87', fontSize: 15, fontWeight: '600' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#ffffff' },
  editText: { color: '#00ff87', fontSize: 15, fontWeight: '600' },
  avatarSection: { alignItems: 'center', marginBottom: 32 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#1a1a1a', borderWidth: 3, borderColor: '#00ff87', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { fontSize: 32, fontWeight: '800', color: '#00ff87' },
  displayName: { fontSize: 22, fontWeight: '800', color: '#ffffff', marginBottom: 4 },
  username: { fontSize: 14, color: '#666', marginBottom: 16 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  stat: { alignItems: 'center' },
  statNum: { fontSize: 20, fontWeight: '800', color: '#00ff87' },
  statLabel: { fontSize: 12, color: '#666' },
  statDivider: { width: 1, height: 24, backgroundColor: '#2a2a2a' },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#aaaaaa', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoCard: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: '#2a2a2a' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#222' },
  infoLabel: { fontSize: 14, color: '#666' },
  infoValue: { fontSize: 14, color: '#ffffff', fontWeight: '500' },
  infoText: { fontSize: 14, color: '#555' },
  input: { backgroundColor: '#111', borderRadius: 10, padding: 14, color: '#ffffff', fontSize: 15, borderWidth: 1, borderColor: '#2a2a2a', marginBottom: 12 },
  textArea: { height: 100, textAlignVertical: 'top', marginBottom: 24 },
  socialInput: { backgroundColor: '#111', borderRadius: 10, padding: 12, color: '#ffffff', fontSize: 14, borderWidth: 1, borderColor: '#2a2a2a', marginBottom: 10 },
  toggleRow: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: '#2a2a2a', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleRowActive: { borderColor: '#00ff87', backgroundColor: '#0a1a0a' },
  toggleInfo: { flex: 1 },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: '#ffffff', marginBottom: 2 },
  toggleDesc: { fontSize: 13, color: '#666' },
  toggleSwitch: { width: 44, height: 24, borderRadius: 12, backgroundColor: '#2a2a2a', padding: 2, justifyContent: 'center' },
  toggleSwitchActive: { backgroundColor: '#00ff87' },
  toggleKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#555', alignSelf: 'flex-start' },
  toggleKnobActive: { backgroundColor: '#000', alignSelf: 'flex-end' },
  editHint: { color: '#333', fontSize: 12, textAlign: 'center', marginBottom: 24 },
});
