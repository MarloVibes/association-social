import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { collection, doc, serverTimestamp, setDoc, addDoc, deleteDoc, getDoc} from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import { useState, useEffect} from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Image } from 'react-native';
import { auth, db } from '@/constants/firebase';

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];

const AWARDS = [
  { key: 'mvp', label: 'MVP' },
  { key: 'championship', label: 'Championship' },
  { key: 'dpoy', label: 'DPOY' },
  { key: 'all_nba_1st', label: 'All-NBA 1st Team' },
  { key: 'all_nba_2nd', label: 'All-NBA 2nd Team' },
  { key: 'all_nba_3rd', label: 'All-NBA 3rd Team' },
  { key: 'sixth_man', label: 'Sixth Man of the Year' },
  { key: 'mip', label: 'Most Improved Player' },
  { key: 'roy', label: 'Rookie of the Year' },
  { key: 'all_star', label: 'All-Star' },
];

type Season = {
  season: string;
  gp: string;
  ppg: string;
  apg: string;
  rpg: string;
  blk: string;
  stl: string;
  fg_pct: string;
  three_pct: string;
};

const emptySeason = (year: string): Season => ({
  season: year,
  gp: '', ppg: '', apg: '', rpg: '', blk: '', stl: '', fg_pct: '', three_pct: '',
});

export default function CreatePlayerScreen() {
  const params = useLocalSearchParams<{ leagueId: string; era?: string; pendingId?: string; customId?: string }>();
  const [isCommissioner, setIsCommissioner] = useState(false);
  const editingPendingId = params.pendingId || null;
  const editingCustomId = params.customId || null;

  useEffect(() => {
    (async () => {
      try {
        const leagueSnap = await getDoc(doc(db, 'leagues', params.leagueId));
        if (leagueSnap.exists()) {
          const ld = leagueSnap.data() as any;
          const myUid = auth.currentUser?.uid;
          const commUids = [ld.commissionerId, ...(ld.coCommissioners || [])].filter(Boolean);
          setIsCommissioner(!!myUid && commUids.includes(myUid));
        }
        if (editingPendingId) {
          const pSnap = await getDoc(doc(db, 'leagues', params.leagueId, 'pending_players', editingPendingId));
          if (pSnap.exists()) {
            const pd = pSnap.data() as any;
            setName(pd.full_name || '');
            setPosition(pd.position || 'PG');
            setAge(String(pd.age || ''));
            setHeight(pd.height || '');
            setWeight(pd.weight || '');
            if (pd.seasons && pd.seasons.length > 0) setSeasons(pd.seasons);
            if (pd.photoUrl) setPhotoUri(pd.photoUrl);
          }
        }
        if (editingCustomId) {
          const cSnap = await getDoc(doc(db, 'leagues', params.leagueId, 'custom_players', editingCustomId));
          if (cSnap.exists()) {
            const cd = cSnap.data() as any;
            setName(cd.full_name || '');
            setPosition(cd.position || 'PG');
            setAge(String(cd.age || ''));
            setHeight(cd.height || '');
            setWeight(cd.weight || '');
            if (cd.seasons && cd.seasons.length > 0) setSeasons(cd.seasons);
            if (cd.photo_url) setPhotoUri(cd.photo_url);
          }
        }
      } catch (e) { console.error('league/pending load failed', e); }
    })();
  }, [params.leagueId, editingPendingId]);

  const leagueId = params.leagueId;

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoUrlInput, setPhotoUrlInput] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [jersey, setJersey] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [age, setAge] = useState('');
  const [salary, setSalary] = useState('');
  const [bio, setBio] = useState('');

  const [seasons, setSeasons] = useState<Season[]>([emptySeason(params.era || '2024-25')]);
  const [awards, setAwards] = useState<Record<string, number>>({});

  const [saving, setSaving] = useState(false);

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Camera roll access is required.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setPhotoUri(result.assets[0].uri);
      setPhotoUrlInput('');
    }
  };

  const useUrlPhoto = () => {
    const u = photoUrlInput.trim();
    if (!u) { Alert.alert('No URL', 'Paste a photo URL first.'); return; }
    setPhotoUri(u);
  };

  const addSeason = () => {
    const last = seasons[seasons.length - 1]?.season || '2024-25';
    setSeasons([...seasons, emptySeason(last)]);
  };

  const removeSeason = (idx: number) => {
    if (seasons.length === 1) { Alert.alert('At least one season required.'); return; }
    setSeasons(seasons.filter((_, i) => i !== idx));
  };

  const updateSeason = (idx: number, field: keyof Season, value: string) => {
    setSeasons(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const bumpAward = (key: string, delta: number) => {
    setAwards(prev => {
      const next = { ...prev, [key]: Math.max(0, (prev[key] || 0) + delta) };
      if (next[key] === 0) delete next[key];
      return next;
    });
  };

  const uploadPhotoIfLocal = async (playerId: string): Promise<string> => {
    if (!photoUri) return '';
    // If it's a URL (not a local file://), just return it
    if (photoUri.startsWith('http://') || photoUri.startsWith('https://')) return photoUri;
    setUploadingPhoto(true);
    try {
      const res = await fetch(photoUri);
      const blob = await res.blob();
      const storage = getStorage();
      const storageRef = ref(storage, 'custom_players/' + leagueId + '/' + playerId + '.jpg');
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      return url;
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) { Alert.alert('Name required'); return; }
    if (!position) { Alert.alert('Position required'); return; }
    if (!leagueId) { Alert.alert('Missing league'); return; }

    setSaving(true);
    try {
      const playerId = 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const photoUrl = await uploadPhotoIfLocal(playerId);

      const parts = trimmedName.split(/\s+/);
      const firstName = parts[0] || '';
      const lastName = parts.slice(1).join(' ') || '';

      const seasonsClean = seasons.map(s => ({
        season: s.season,
        gp: parseInt(s.gp, 10) || 0,
        ppg: parseFloat(s.ppg) || 0,
        apg: parseFloat(s.apg) || 0,
        rpg: parseFloat(s.rpg) || 0,
        blk: parseFloat(s.blk) || 0,
        stl: parseFloat(s.stl) || 0,
        fg_pct: parseFloat(s.fg_pct) || 0,
        three_pct: parseFloat(s.three_pct) || 0,
      }));

      const playerDoc = {
        player_id: playerId,
        full_name: trimmedName,
        first_name: firstName,
        last_name: lastName,
        position,
        jersey_number: jersey ? parseInt(jersey, 10) : null,
        height: height.trim(),
        weight: weight ? parseInt(weight, 10) : null,
        age: age ? parseInt(age, 10) : null,
        photo_url: photoUrl,
        bio: bio.trim(),
        salary: salary ? parseInt(salary.replace(/[^0-9]/g, ''), 10) : 0,
        seasons: seasonsClean,
        awards,
        isCustom: true,
        createdBy: auth.currentUser?.uid || '',
        createdAt: serverTimestamp(),
      };

      if (editingCustomId) {
        // Editing an already-approved custom player — write directly with the existing ID
        await setDoc(doc(db, 'leagues', leagueId, 'custom_players', editingCustomId), { ...playerDoc, player_id: editingCustomId });
      } else if (isCommissioner) {
        await setDoc(doc(db, 'leagues', leagueId, 'custom_players', playerId), playerDoc);
        if (editingPendingId) {
          const pSnap = await getDoc(doc(db, 'leagues', leagueId, 'pending_players', editingPendingId));
          const submittedBy = pSnap.exists() ? (pSnap.data() as any).submittedBy : null;
          await deleteDoc(doc(db, 'leagues', leagueId, 'pending_players', editingPendingId));
          if (submittedBy) {
            await addDoc(collection(db, 'users', submittedBy, 'notifications'), {
              type: 'custom_player_approved', leagueId, playerName: playerDoc.full_name,
              createdAt: serverTimestamp(), read: false,
            });
          }
        }
      } else {
        const pendingId = editingPendingId || playerId;
        await setDoc(doc(db, 'leagues', leagueId, 'pending_players', pendingId), {
          ...playerDoc,
          submittedBy: auth.currentUser?.uid,
          submittedAt: serverTimestamp(),
          status: 'pending',
        });
        const leagueSnap2 = await getDoc(doc(db, 'leagues', leagueId));
        if (leagueSnap2.exists()) {
          const ld2 = leagueSnap2.data() as any;
          const commUids2: string[] = [ld2.commissionerId, ...(ld2.coCommissioners || [])].filter(Boolean);
          await Promise.all(commUids2.map(uid =>
            addDoc(collection(db, 'users', uid, 'notifications'), {
              type: 'custom_player_submitted', leagueId, playerName: playerDoc.full_name,
              submittedBy: auth.currentUser?.uid, pendingId,
              createdAt: serverTimestamp(), read: false,
            })
          ));
        }
      }
      const isEditingExisting = !!editingCustomId;
      const isApproved = isCommissioner;
      const successTitle = isEditingExisting ? 'Updated' : (isApproved ? 'Created' : 'Submitted for Review');
      const successMsg = isEditingExisting
        ? trimmedName + ' has been updated.'
        : (isApproved
          ? trimmedName + ' is now in the Free Agents pool.'
          : trimmedName + ' has been submitted for commissioner review.');
      Alert.alert(successTitle, successMsg, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setSaving(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Create Player</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving || uploadingPhoto}>
          <Text style={[styles.saveText, (saving || uploadingPhoto) && { opacity: 0.4 }]}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps='handled'>
        {/* Photo */}
        <View style={styles.photoBlock}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photo} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.photoPlaceholderText}>No photo</Text>
            </View>
          )}
          <View style={styles.photoBtns}>
            <TouchableOpacity style={styles.photoBtn} onPress={pickPhoto}>
              <Text style={styles.photoBtnText}>📷 Upload</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.urlRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              placeholder='Or paste a photo URL'
              placeholderTextColor='#555'
              value={photoUrlInput}
              onChangeText={setPhotoUrlInput}
              autoCapitalize='none'
            />
            <TouchableOpacity style={styles.urlBtn} onPress={useUrlPhoto}>
              <Text style={styles.urlBtnText}>Use</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Identity */}
        <Text style={styles.sectionLabel}>IDENTITY</Text>
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Full Name *</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder='Bron James Jr' placeholderTextColor='#555' />
          <Text style={styles.fieldLabel}>Position *</Text>
          <View style={styles.posRow}>
            {POSITIONS.map(p => (
              <TouchableOpacity
                key={p}
                style={[styles.posBtn, position === p && styles.posBtnActive]}
                onPress={() => setPosition(p)}
              >
                <Text style={[styles.posBtnText, position === p && styles.posBtnTextActive]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.row3}>
            <View style={styles.col}>
              <Text style={styles.fieldLabel}>Jersey #</Text>
              <TextInput style={styles.input} value={jersey} onChangeText={setJersey} keyboardType='number-pad' placeholder='23' placeholderTextColor='#555' />
            </View>
            <View style={styles.col}>
              <Text style={styles.fieldLabel}>Height</Text>
              <TextInput style={styles.input} value={height} onChangeText={setHeight} placeholder='6-7' placeholderTextColor='#555' />
            </View>
            <View style={styles.col}>
              <Text style={styles.fieldLabel}>Weight</Text>
              <TextInput style={styles.input} value={weight} onChangeText={setWeight} keyboardType='number-pad' placeholder='220' placeholderTextColor='#555' />
            </View>
          </View>
          <Text style={styles.fieldLabel}>Age</Text>
          <TextInput style={styles.input} value={age} onChangeText={setAge} keyboardType='number-pad' placeholder='22' placeholderTextColor='#555' />
          <Text style={styles.fieldLabel}>Salary (USD per year)</Text>
          <TextInput style={styles.input} value={salary} onChangeText={setSalary} keyboardType='number-pad' placeholder='e.g. 25000000' placeholderTextColor='#555' />
          <Text style={styles.helper}>Enter the player's annual cap hit. Used for trade balance math.</Text>
          <Text style={styles.fieldLabel}>Bio</Text>
          <TextInput style={[styles.input, styles.textArea]} value={bio} onChangeText={setBio} multiline placeholder='Optional backstory...' placeholderTextColor='#555' />
        </View>

        {/* Stats */}
        <Text style={styles.sectionLabel}>STATS BY SEASON</Text>
        {seasons.map((s, idx) => (
          <View key={idx} style={styles.card}>
            <View style={styles.seasonHeader}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                value={s.season}
                onChangeText={v => updateSeason(idx, 'season', v)}
                placeholder='2024-25'
                placeholderTextColor='#555'
              />
              {seasons.length > 1 && (
                <TouchableOpacity onPress={() => removeSeason(idx)} style={styles.removeSeasonBtn}>
                  <Text style={styles.removeSeasonText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.statsGrid}>
              {[
                { k: 'gp', label: 'GP' },
                { k: 'ppg', label: 'PPG' },
                { k: 'apg', label: 'APG' },
                { k: 'rpg', label: 'RPG' },
                { k: 'blk', label: 'BLK' },
                { k: 'stl', label: 'STL' },
                { k: 'fg_pct', label: 'FG%' },
                { k: 'three_pct', label: '3FG%' },
              ].map(({ k, label }) => (
                <View key={k} style={styles.statCell}>
                  <Text style={styles.statLbl}>{label}</Text>
                  <TextInput
                    style={styles.statInput}
                    value={(s as any)[k]}
                    onChangeText={v => updateSeason(idx, k as keyof Season, v)}
                    keyboardType='decimal-pad'
                    placeholder='0'
                    placeholderTextColor='#444'
                  />
                </View>
              ))}
            </View>
          </View>
        ))}
        <TouchableOpacity style={styles.addSeasonBtn} onPress={addSeason}>
          <Text style={styles.addSeasonText}>+ Add Season</Text>
        </TouchableOpacity>

        {/* Awards */}
        <Text style={styles.sectionLabel}>AWARDS</Text>
        <View style={styles.card}>
          {AWARDS.map(a => {
            const count = awards[a.key] || 0;
            return (
              <View key={a.key} style={styles.awardRow}>
                <Text style={[styles.awardLabel, count > 0 && { color: '#00ff87' }]}>{a.label}</Text>
                <View style={styles.awardControls}>
                  <TouchableOpacity style={styles.awardBtn} onPress={() => bumpAward(a.key, -1)} disabled={count === 0}>
                    <Text style={[styles.awardBtnText, count === 0 && { opacity: 0.3 }]}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.awardCount}>{count > 0 ? 'x' + count : '–'}</Text>
                  <TouchableOpacity style={styles.awardBtn} onPress={() => bumpAward(a.key, 1)}>
                    <Text style={styles.awardBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving || uploadingPhoto}>
          {(saving || uploadingPhoto) ? <ActivityIndicator color='#000' /> : <Text style={styles.saveBtnText}>CREATE PLAYER</Text>}
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  backText: { color: '#00ff87', fontSize: 15, fontWeight: '600' },
  title: { fontSize: 18, fontWeight: '800', color: '#ffffff' },
  saveText: { color: '#00ff87', fontSize: 15, fontWeight: '700' },
  body: { padding: 16 },
  photoBlock: { alignItems: 'center', marginBottom: 16 },
  photo: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#1a1a1a' },
  photoPlaceholder: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#2a2a2a' },
  photoPlaceholderText: { color: '#555', fontSize: 12 },
  photoBtns: { flexDirection: 'row', marginTop: 12, gap: 8 },
  photoBtn: { backgroundColor: '#1a1a1a', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#2a2a2a' },
  photoBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  urlRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8, width: '100%' },
  urlBtn: { backgroundColor: '#00ff87', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10 },
  urlBtnText: { color: '#000', fontSize: 13, fontWeight: '800' },
  sectionLabel: { color: '#888', fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 10, marginTop: 12 },
  card: { backgroundColor: '#111', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#1a1a1a', marginBottom: 12 },
  fieldLabel: { color: '#888', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' },
  input: { backgroundColor: '#1a1a1a', borderRadius: 10, padding: 12, color: '#fff', fontSize: 14, borderWidth: 1, borderColor: '#2a2a2a', marginBottom: 8 },
  textArea: { height: 70, textAlignVertical: 'top' },
  helper: { color: '#666', fontSize: 11, marginTop: -4, marginBottom: 8, fontStyle: 'italic' },
  posRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  posBtn: { flex: 1, paddingVertical: 10, backgroundColor: '#1a1a1a', borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a2a' },
  posBtnActive: { backgroundColor: '#0a2a1a', borderColor: '#00ff87' },
  posBtnText: { color: '#888', fontSize: 12, fontWeight: '800' },
  posBtnTextActive: { color: '#00ff87' },
  row3: { flexDirection: 'row', gap: 8 },
  col: { flex: 1 },
  seasonHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  removeSeasonBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2a0a0a', borderWidth: 1, borderColor: '#ff4444', alignItems: 'center', justifyContent: 'center' },
  removeSeasonText: { color: '#ff4444', fontSize: 14, fontWeight: '800' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCell: { width: '23%' },
  statLbl: { color: '#666', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  statInput: { backgroundColor: '#1a1a1a', borderRadius: 8, padding: 8, color: '#fff', fontSize: 13, borderWidth: 1, borderColor: '#2a2a2a', textAlign: 'center' },
  addSeasonBtn: { backgroundColor: '#1a1a1a', borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a2a', marginBottom: 12 },
  addSeasonText: { color: '#00ff87', fontSize: 13, fontWeight: '800' },
  awardRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  awardLabel: { flex: 1, color: '#aaa', fontSize: 13, fontWeight: '600' },
  awardControls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  awardBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  awardBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  awardCount: { color: '#00ff87', fontSize: 13, fontWeight: '800', minWidth: 30, textAlign: 'center' },
  saveBtn: { backgroundColor: '#00ff87', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 12 },
  saveBtnText: { color: '#000', fontSize: 14, fontWeight: '900', letterSpacing: 2 },
});
