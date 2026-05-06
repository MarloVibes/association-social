import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Alert, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';
import GlobalNav from '@/components/GlobalNav';

export default function ProfileScreen() {
  const { uid: viewUid } = useLocalSearchParams<{ uid?: string }>();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoUrl, setPhotoUrl] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Editable fields
  const [bio, setBio] = useState('');
  const [gamerTag, setGamerTag] = useState('');
  const [twitch, setTwitch] = useState('');
  const [youtube, setYoutube] = useState('');
  const [twitter, setTwitter] = useState('');
  const [instagram, setInstagram] = useState('');
  const [tiktok, setTiktok] = useState('');
  const [dmEnabled, setDmEnabled] = useState(true);
  const [favSports, setFavSports] = useState<string[]>([]);
  const [consoles_, setConsoles_] = useState<string[]>([]);
  const [psnId, setPsnId] = useState('');
  const [xboxId, setXboxId] = useState('');
  const [eaId, setEaId] = useState('');

  const ALL_SPORTS = [
    'NBA 2K', 'Madden NFL', 'MLB The Show', 'EA FC (FIFA)',
    'NHL', 'UFC', 'WWE 2K', 'F1', 'College Football',
    'Rocket League', 'Tony Hawk', 'Golf PGA Tour',
  ];
  const CONSOLES = ['PS5', 'Xbox Series X', 'Xbox Series S', 'ROG Xbox Ally', 'PC', 'Nintendo Switch 2', 'Nintendo Switch', 'Steam Deck'];

  const user = auth.currentUser;
  const profileUid = viewUid || user?.uid;
  const isOwnProfile = !viewUid || viewUid === user?.uid;

  useEffect(() => { loadProfile(); }, []);

  const loadProfile = async () => {
    if (!profileUid) return;
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'users', profileUid));
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
    setPhotoUrl(data.photoUrl || '');
    setFavSports(data.favoriteSports || (data.favoriteSport ? [data.favoriteSport] : []));
    setConsoles_(data.consoles || (data.console ? [data.console] : []));
    setPsnId(data.psnId || '');
    setXboxId(data.xboxId || '');
    setEaId(data.eaId || '');
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const saveProfile = async () => {
    if (!profileUid) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        bio,
        gamerTag,
        dmEnabled,
      photoUrl,
      favoriteSports: favSports,
      favoriteSport: favSports.join(', '),
      consoles: consoles_,
      console: consoles_.join(', '),
      psnId,
      xboxId,
      eaId,
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

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Please allow photo library access.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setUploadingPhoto(true);
    try {
      const uri = result.assets[0].uri;
      const response = await fetch(uri);
      const blob = await response.blob();
      const storage = getStorage();
      const storageRef = ref(storage, 'profile_photos/' + user!.uid + '.jpg');
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      setPhotoUrl(url);
      await updateDoc(doc(db, 'users', user!.uid), { photoUrl: url });
    } catch (e: any) { Alert.alert('Upload failed', e.message); }
    setUploadingPhoto(false);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.inner}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profile</Text>
          {isOwnProfile ? (
            <TouchableOpacity onPress={() => editing ? saveProfile() : setEditing(true)}>
            {saving
              ? <ActivityIndicator color="#00ff87" size="small" />
              : <Text style={styles.editText}>{editing ? 'Save' : 'Edit'}</Text>
            }
            </TouchableOpacity>
          ) : <View style={{ width: 60 }} />}
        </View>

        {/* Avatar */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={editing ? pickPhoto : undefined} activeOpacity={editing ? 0.7 : 1}>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{profile?.displayName?.[0]?.toUpperCase() || 'G'}</Text>
              </View>
            )}
            {editing && (
              <View style={styles.avatarEditBadge}>
                {uploadingPhoto
                  ? <ActivityIndicator size='small' color='#000' />
                  : <Text style={styles.avatarEditBadgeText}>📷</Text>
                }
              </View>
            )}
          </TouchableOpacity>
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
            <>
              <TextInput
                style={[styles.input, { marginBottom: 10 }]}
                value={gamerTag}
                onChangeText={setGamerTag}
                placeholder="Display Gamer Tag"
                placeholderTextColor="#555"
                autoCapitalize="none"
              />
              <TextInput
                style={[styles.input, { marginBottom: 10 }]}
                value={psnId}
                onChangeText={setPsnId}
                placeholder="PSN ID"
                placeholderTextColor="#555"
                autoCapitalize="none"
              />
              <TextInput
                style={[styles.input, { marginBottom: 10 }]}
                value={xboxId}
                onChangeText={setXboxId}
                placeholder="Xbox Gamertag"
                placeholderTextColor="#555"
                autoCapitalize="none"
              />
              <TextInput
                style={[styles.input, { marginBottom: 16 }]}
                value={eaId}
                onChangeText={setEaId}
                placeholder="EA ID"
                placeholderTextColor="#555"
                autoCapitalize="none"
              />
              <Text style={styles.fieldLabel}>Consoles (select all you own)</Text>
              <View style={styles.chipRow}>
                {CONSOLES.map(con => (
                  <TouchableOpacity
                    key={con}
                    style={[styles.chip, consoles_.includes(con) && styles.chipActive]}
                    onPress={() => setConsoles_(prev =>
                      prev.includes(con) ? prev.filter(x => x !== con) : [...prev, con]
                    )}
                  >
                    <Text style={[styles.chipText, consoles_.includes(con) && styles.chipTextActive]}>{con}</Text>
                    {consoles_.includes(con) && <Text style={styles.sportCheck}> ✓</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : (
            <>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Gamer Tag</Text>
                <Text style={styles.infoValue}>{profile?.gamerTag || '—'}</Text>
              </View>
              {profile?.psnId ? (
                <TouchableOpacity
                  style={styles.infoRow}
                  onPress={() => Linking.openURL('https://my.playstation.com/profile/' + profile.psnId)}
                >
                  <Text style={styles.infoLabel}>PSN</Text>
                  <View style={styles.platformBadge}>
                    <Text style={styles.platformBadgeIcon}>📹</Text>
                    <Text style={styles.platformBadgeText}>{profile.psnId}</Text>
                    <Text style={styles.platformBadgeLink}>↗</Text>
                  </View>
                </TouchableOpacity>
              ) : null}
              {profile?.xboxId ? (
                <TouchableOpacity
                  style={styles.infoRow}
                  onPress={() => Linking.openURL('https://www.xbox.com/en-US/play/user/' + profile.xboxId)}
                >
                  <Text style={styles.infoLabel}>Xbox</Text>
                  <View style={[styles.platformBadge, styles.xboxBadge]}>
                    <Text style={styles.platformBadgeIcon}>🎮</Text>
                    <Text style={[styles.platformBadgeText, styles.xboxBadgeText]}>{profile.xboxId}</Text>
                    <Text style={[styles.platformBadgeLink, styles.xboxBadgeText]}>↗</Text>
                  </View>
                </TouchableOpacity>
              ) : null}
              {profile?.eaId ? <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>EA ID</Text>
                <Text style={styles.infoValue}>{profile.eaId}</Text>
              </View> : null}
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Consoles</Text>
                <Text style={styles.infoValue}>{(profile?.consoles || []).join(', ') || profile?.console || '—'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Fav Games</Text>
                <Text style={styles.infoValue}>{(profile?.favoriteSports || []).join(', ') || profile?.favoriteSport || '—'}</Text>
              </View>
            </>
          )}
        </View>

        {/* Favorite Sports Games */}
        {editing && (
          <>
            <Text style={styles.sectionLabel}>Favorite Sports Games</Text>
            <Text style={styles.fieldHint}>Select all that apply</Text>
            <View style={styles.sportGrid}>
              {ALL_SPORTS.map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.sportChip, favSports.includes(s) && styles.sportChipActive]}
                  onPress={() => setFavSports(prev =>
                    prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
                  )}
                >
                  <Text style={[styles.sportChipText, favSports.includes(s) && styles.sportChipTextActive]}>{s}</Text>
                  {favSports.includes(s) && <Text style={styles.sportCheck}>✓</Text>}
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

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
  avatarImage: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: '#00ff87' },
  avatarEditBadge: { position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: '#00ff87', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#0a0a0a' },
  avatarEditBadgeText: { fontSize: 14 },
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
  fieldLabel: { color: '#888', fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase' },
  fieldHint: { color: '#666', fontSize: 12, marginBottom: 10, marginTop: -8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: { backgroundColor: '#1a1a1a', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: '#2a2a2a' },
  chipActive: { backgroundColor: '#0a2a1a', borderColor: '#00ff87' },
  chipText: { color: '#888', fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#00ff87' },
  sportGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  sportChip: { backgroundColor: '#1a1a1a', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: '#2a2a2a', flexDirection: 'row', alignItems: 'center', gap: 6 },
  sportChipActive: { backgroundColor: '#0a2a1a', borderColor: '#00ff87' },
  sportChipText: { color: '#888', fontSize: 13, fontWeight: '500' },
  sportChipTextActive: { color: '#00ff87' },
  sportCheck: { color: '#00ff87', fontSize: 11, fontWeight: '700' },
  platformBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#00439c22', borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10, borderWidth: 1, borderColor: '#00439c' },
  platformBadgeIcon: { fontSize: 14 },
  platformBadgeText: { color: '#4488ff', fontSize: 13, fontWeight: '700' },
  platformBadgeLink: { color: '#4488ff', fontSize: 12 },
  xboxBadge: { backgroundColor: '#10772022', borderColor: '#107720' },
  xboxBadgeText: { color: '#44cc44' },
  platformBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#00439c22', borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10, borderWidth: 1, borderColor: '#00439c' },
  platformBadgeIcon: { fontSize: 14 },
  platformBadgeText: { color: '#4488ff', fontSize: 13, fontWeight: '700' },
  platformBadgeLink: { color: '#4488ff', fontSize: 12 },
  xboxBadge: { backgroundColor: '#10772022', borderColor: '#107720' },
  xboxBadgeText: { color: '#44cc44' },
});
