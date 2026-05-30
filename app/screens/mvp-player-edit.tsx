import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, deleteDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY',
  projectId: 'association-social',
};
if (!getApps().length) initializeApp(firebaseConfig);
const db = getFirestore();
const auth = getAuth();

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

const ATTR_GROUPS: { label: string; color: string; attrs: { key: string; label: string }[] }[] = [
  {
    label: 'FINISHING', color: '#3b82f6',
    attrs: [
      { key: 'closeShot', label: 'Close Shot' },
      { key: 'drivingLayup', label: 'Driving Layup' },
      { key: 'drivingDunk', label: 'Driving Dunk' },
      { key: 'standingDunk', label: 'Standing Dunk' },
      { key: 'postControl', label: 'Post Control' },
    ],
  },
  {
    label: 'SHOOTING', color: '#22c55e',
    attrs: [
      { key: 'midRangeShot', label: 'Mid-Range Shot' },
      { key: 'threePointShot', label: 'Three-Point Shot' },
      { key: 'freeThrow', label: 'Free Throw' },
    ],
  },
  {
    label: 'PLAYMAKING', color: '#f59e0b',
    attrs: [
      { key: 'passAccuracy', label: 'Pass Accuracy' },
      { key: 'ballHandle', label: 'Ball Handle' },
      { key: 'speedWithBall', label: 'Speed With Ball' },
    ],
  },
  {
    label: 'DEFENSE', color: '#ef4444',
    attrs: [
      { key: 'interiorDefense', label: 'Interior Defense' },
      { key: 'perimeterDefense', label: 'Perimeter Defense' },
      { key: 'steal', label: 'Steal' },
      { key: 'block', label: 'Block' },
    ],
  },
  {
    label: 'REBOUNDING', color: '#8b5cf6',
    attrs: [
      { key: 'offensiveRebound', label: 'Offensive Rebound' },
      { key: 'defensiveRebound', label: 'Defensive Rebound' },
    ],
  },
  {
    label: 'ATHLETICISM', color: '#eab308',
    attrs: [
      { key: 'speed', label: 'Speed' },
      { key: 'agility', label: 'Agility' },
      { key: 'strength', label: 'Strength' },
      { key: 'vertical', label: 'Vertical' },
    ],
  },
];


// Auto-format height/wingspan on blur. User types digits, gets feet'inches".
// Examples: "7" -> 7'0", "66" -> 6'6", "611" -> 6'11", "6-11" -> 6'11"
function formatHeight(raw: string): string {
  if (!raw) return '';
  // If already formatted (contains ' or ") leave alone
  if (raw.includes("'") || raw.includes('"')) return raw;
  // Strip everything but digits
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 1) return digits + "'0\"";
  if (digits.length === 2) return digits[0] + "'" + digits[1] + '"';
  if (digits.length === 3) return digits[0] + "'" + digits.slice(1) + '"';
  return raw;
}

export default function MVPPlayerEditScreen() {
  const router = useRouter();
  const { playerId } = useLocalSearchParams<{ playerId?: string }>();
  const isEdit = !!playerId;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [gamerTag, setGamerTag] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [position, setPosition] = useState<string>('');
  const [archetype, setArchetype] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [wingspan, setWingspan] = useState('');
  const [overall, setOverall] = useState('');
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  const [attrsOpen, setAttrsOpen] = useState(false);

  useEffect(() => { init(); }, []);

  async function init() {
    if (!auth.currentUser) return;
    if (isEdit && playerId) {
      try {
        const snap = await getDoc(doc(db, 'mvp_players', playerId));
        if (!snap.exists()) {
          Alert.alert('Not found', 'Player card not found.');
          router.back();
          return;
        }
        const data = snap.data() as any;
        if (data.ownerUid !== auth.currentUser.uid) {
          Alert.alert('Not yours', 'You can only edit your own MVP cards.');
          router.back();
          return;
        }
        setGamerTag(data.ownerGamerTag || '');
        setPlayerName(data.playerName || '');
        setPosition(data.position || '');
        setArchetype(data.archetype || '');
        setHeight(data.height || '');
        setWeight(data.weight ? String(data.weight) : '');
        setWingspan(data.wingspan || '');
        setOverall(data.overall ? String(data.overall) : '');
        const attrs: Record<string, string> = {};
        Object.entries(data.attributes || {}).forEach(([k, v]) => { attrs[k] = String(v); });
        setAttributes(attrs);
      } catch (e: any) {
        Alert.alert('Error', e.message);
      }
      setLoading(false);
    } else {
      // Prefill gamerTag from user doc
      try {
        const userSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (userSnap.exists()) {
          setGamerTag(userSnap.data().gamerTag || '');
        }
      } catch (e) { /* ignore */ }
    }
  }

  async function handleSave() {
    if (!playerName.trim()) { Alert.alert('Required', 'Player name is required.'); return; }
    if (!position) { Alert.alert('Required', 'Position is required.'); return; }
    const ovrNum = Number(overall);
    if (!ovrNum || ovrNum < 1 || ovrNum > 99) { Alert.alert('Invalid', 'Overall must be between 1 and 99.'); return; }

    setSaving(true);
    try {
      const uid = auth.currentUser!.uid;
      const userSnap = await getDoc(doc(db, 'users', uid));
      const userData = userSnap.exists() ? (userSnap.data() as any) : {};

      const attrsObj: Record<string, number> = {};
      Object.entries(attributes).forEach(([k, v]) => {
        const n = Number(v);
        if (n > 0 && n <= 99) attrsObj[k] = n;
      });

      const payload: any = {
        ownerUid: uid,
        ownerUsername: userData.username || '',
        ownerGamerTag: gamerTag.trim() || userData.gamerTag || '',
        playerName: playerName.trim(),
        position,
        archetype: archetype.trim(),
        height: height.trim(),
        weight: weight ? Number(weight) : null,
        wingspan: wingspan.trim(),
        overall: ovrNum,
        attributes: attrsObj,
        updatedAt: serverTimestamp(),
      };

      if (isEdit && playerId) {
        await setDoc(doc(db, 'mvp_players', playerId), payload, { merge: true });
      } else {
        payload.createdAt = serverTimestamp();
        await addDoc(collection(db, 'mvp_players'), payload);
      }
      router.back();
    } catch (e: any) {
      Alert.alert('Save failed', e.message);
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!isEdit || !playerId) return;
    Alert.alert('Delete MVP card?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await deleteDoc(doc(db, 'mvp_players', playerId));
          router.back();
        } catch (e: any) {
          Alert.alert('Delete failed', e.message);
        }
      }},
    ]);
  }

  if (loading) {
    return <View style={[styles.container, styles.center]}><ActivityIndicator color='#22c55e' /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.backLink}>← Back</Text></TouchableOpacity>
        <Text style={styles.title}>{isEdit ? 'Edit MVP' : 'Add MVP'}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
        <Text style={styles.label}>Gamer Tag</Text>
        <TextInput style={styles.input} value={gamerTag} onChangeText={setGamerTag} placeholder='Your gamer tag' placeholderTextColor='#555' />

        <Text style={styles.label}>Player Name *</Text>
        <TextInput style={styles.input} value={playerName} onChangeText={setPlayerName} placeholder='e.g. UA Lemillion' placeholderTextColor='#555' />

        <Text style={styles.label}>Position *</Text>
        <View style={styles.posRow}>
          {POSITIONS.map(p => (
            <TouchableOpacity key={p} style={[styles.posBtn, position === p && styles.posBtnActive]} onPress={() => setPosition(p)}>
              <Text style={[styles.posBtnText, position === p && styles.posBtnTextActive]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Archetype</Text>
        <TextInput style={styles.input} value={archetype} onChangeText={setArchetype} placeholder='e.g. Physical 2-Way Middy Slasher' placeholderTextColor='#555' />

        <View style={styles.row}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.label}>Height</Text>
            <TextInput style={styles.input} value={height} onChangeText={setHeight} onBlur={() => setHeight(formatHeight(height))} placeholder={`6'6"`} placeholderTextColor='#555' />
          </View>
          <View style={{ flex: 1, marginHorizontal: 4 }}>
            <Text style={styles.label}>Weight (lbs)</Text>
            <TextInput style={styles.input} value={weight} onChangeText={setWeight} placeholder='220' placeholderTextColor='#555' keyboardType='numeric' />
          </View>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.label}>Wingspan</Text>
            <TextInput style={styles.input} value={wingspan} onChangeText={setWingspan} onBlur={() => setWingspan(formatHeight(wingspan))} placeholder={`6'11"`} placeholderTextColor='#555' />
          </View>
        </View>

        <Text style={styles.label}>Overall *</Text>
        <TextInput style={styles.input} value={overall} onChangeText={setOverall} placeholder='1-99' placeholderTextColor='#555' keyboardType='numeric' maxLength={2} />

        <TouchableOpacity style={styles.attrsToggle} onPress={() => setAttrsOpen(!attrsOpen)}>
          <Text style={styles.attrsToggleText}>{attrsOpen ? '▼' : '▶'}  Attributes (optional, all 0-99)</Text>
        </TouchableOpacity>

        {attrsOpen && (
          <View style={styles.attrsBox}>
            {ATTR_GROUPS.map(group => (
              <View key={group.label} style={{ marginBottom: 16 }}>
                <Text style={[styles.attrGroupLabel, { color: group.color }]}>{group.label}</Text>
                {group.attrs.map(a => (
                  <View key={a.key} style={styles.attrRow}>
                    <Text style={styles.attrLabel}>{a.label}</Text>
                    <TextInput
                      style={styles.attrInput}
                      value={attributes[a.key] || ''}
                      onChangeText={(v) => setAttributes({ ...attributes, [a.key]: v })}
                      placeholder='—'
                      placeholderTextColor='#555'
                      keyboardType='numeric'
                      maxLength={2}
                    />
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveBtnText}>{saving ? 'Saving...' : (isEdit ? 'Update Card' : 'Create Card')}</Text>
        </TouchableOpacity>

        {isEdit && (
          <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
            <Text style={styles.deleteBtnText}>Delete Card</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  backLink: { color: '#22c55e', fontSize: 16, fontWeight: '600' },
  title: { color: '#fff', fontSize: 18, fontWeight: '800' },
  label: { color: '#888', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, marginTop: 14 },
  input: { backgroundColor: '#0a0a0a', color: '#fff', padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#1a1a1a', fontSize: 16 },
  row: { flexDirection: 'row' },
  posRow: { flexDirection: 'row', gap: 8 },
  posBtn: { flex: 1, backgroundColor: '#0a0a0a', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#1a1a1a', alignItems: 'center' },
  posBtnActive: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  posBtnText: { color: '#888', fontSize: 14, fontWeight: '700' },
  posBtnTextActive: { color: '#000' },
  attrsToggle: { paddingVertical: 16, marginTop: 10 },
  attrsToggleText: { color: '#22c55e', fontSize: 15, fontWeight: '700' },
  attrsBox: { backgroundColor: '#0a0a0a', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#1a1a1a' },
  attrGroupLabel: { fontSize: 12, fontWeight: '900', letterSpacing: 1, marginBottom: 8 },
  attrRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  attrLabel: { color: '#fff', fontSize: 14, flex: 1 },
  attrInput: { backgroundColor: '#000', color: '#fff', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#1a1a1a', width: 60, textAlign: 'center', fontSize: 15, fontWeight: '700' },
  saveBtn: { backgroundColor: '#22c55e', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  saveBtnText: { color: '#000', fontSize: 16, fontWeight: '800' },
  deleteBtn: { backgroundColor: '#2a0a0a', padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: '#ff4444' },
  deleteBtnText: { color: '#ff4444', fontSize: 14, fontWeight: '800', letterSpacing: 1 },
});
