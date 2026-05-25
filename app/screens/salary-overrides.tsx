import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, collection, getDocs, getDoc, doc, deleteDoc, setDoc, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY',
  projectId: 'association-social',
};
if (!getApps().length) initializeApp(firebaseConfig);
const db = getFirestore();
const auth = getAuth();

const MIN_SALARY = 1272870; // NBA league minimum (matches existing app convention)

function formatSalary(n: number): string {
  if (!n || n < MIN_SALARY) return '$Min';
  return '$' + (n / 1000000).toFixed(1) + 'M';
}

export default function SalaryOverridesScreen() {
  const params = useLocalSearchParams<{ leagueId: string }>();
  const router = useRouter();
  const leagueId = params.leagueId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isCommissioner, setIsCommissioner] = useState(false);
  const [overrides, setOverrides] = useState<any[]>([]);
  const [allPlayers, setAllPlayers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [editingPlayer, setEditingPlayer] = useState<any>(null);
  const [editingSalary, setEditingSalary] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      // Check commissioner status
      const leagueSnap = await getDoc(doc(db, 'leagues', leagueId));
      if (!leagueSnap.exists()) {
        Alert.alert('Not found', 'League not found.');
        router.back();
        return;
      }
      const ld = leagueSnap.data() as any;
      const myUid = auth.currentUser?.uid;
      const commUids = [ld.commissionerId, ...(ld.coCommissioners || [])].filter(Boolean);
      const isComm = myUid ? commUids.includes(myUid) : false;
      setIsCommissioner(isComm);

      // Load era player pool for search
      const era = ld.era || 'current';
      const poolSnap = await getDoc(doc(db, 'era_player_pools', era));
      if (poolSnap.exists()) {
        setAllPlayers((poolSnap.data() as any).players || []);
      }

      // Load existing overrides
      const ovSnap = await getDocs(collection(db, 'leagues', leagueId, 'salary_overrides'));
      setOverrides(ovSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    } catch (e: any) {
      Alert.alert('Error loading', e.message);
    }
    setLoading(false);
  }

  // Filtered player search results (max 8)
  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return allPlayers
      .filter(p => (p.full_name || '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [search, allPlayers]);

  // Start editing an existing override OR add a new override for a player
  function startEdit(player: any, existingOverride?: any) {
    setEditingPlayer(player);
    setEditingSalary(existingOverride ? String(existingOverride.salary) : String(player.salary || MIN_SALARY));
    setSearch('');
  }

  async function saveOverride() {
    if (!editingPlayer) return;
    const num = Number(editingSalary.replace(/[^\d]/g, ''));
    if (!num || num < MIN_SALARY) {
      Alert.alert('Invalid salary', `Salary must be at least $${(MIN_SALARY / 1000000).toFixed(1)}M.`);
      return;
    }
    setSaving(true);
    try {
      const playerId = editingPlayer.player_id || editingPlayer.id;
      if (!playerId) {
        Alert.alert('Error', 'Player has no ID.');
        setSaving(false);
        return;
      }
      await setDoc(doc(db, 'leagues', leagueId, 'salary_overrides', playerId), {
        playerId,
        playerName: editingPlayer.full_name,
        team: editingPlayer.team || '',
        originalSalary: editingPlayer.salary || 0,
        salary: num,
        updatedBy: auth.currentUser?.uid,
        updatedAt: serverTimestamp(),
      });
      setEditingPlayer(null);
      setEditingSalary('');
      await load();
    } catch (e: any) {
      Alert.alert('Save failed', e.message);
    }
    setSaving(false);
  }

  async function deleteOverride(override: any) {
    Alert.alert('Delete override?', `Reset ${override.playerName}'s salary to original?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await deleteDoc(doc(db, 'leagues', leagueId, 'salary_overrides', override.id));
          await load();
        } catch (e: any) {
          Alert.alert('Delete failed', e.message);
        }
      }},
    ]);
  }

  if (loading) {
    return <View style={[styles.container, styles.center]}><ActivityIndicator color='#22c55e' /></View>;
  }

  if (!isCommissioner) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.lockedTitle}>Commissioners Only</Text>
        <Text style={styles.lockedSub}>Only commissioners can manage salary overrides.</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}><Text style={styles.backBtnText}>← Back</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.backLink}>← Back</Text></TouchableOpacity>
        <Text style={styles.title}>Salary Overrides</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>

        {/* Edit/Add mode */}
        {editingPlayer ? (
          <View style={styles.editCard}>
            <Text style={styles.editLabel}>Override Salary</Text>
            <Text style={styles.editPlayerName}>{editingPlayer.full_name}</Text>
            <Text style={styles.editOriginal}>Original: {formatSalary(editingPlayer.salary || 0)}</Text>
            <TextInput
              style={styles.salaryInput}
              value={editingSalary}
              onChangeText={setEditingSalary}
              keyboardType='numeric'
              placeholder='Enter salary in dollars (e.g. 30000000)'
              placeholderTextColor='#555'
            />
            <Text style={styles.editHint}>Enter as raw dollars. Example: 30000000 = $30M</Text>
            <View style={styles.editButtonRow}>
              <TouchableOpacity style={[styles.editBtn, styles.cancelBtn]} onPress={() => { setEditingPlayer(null); setEditingSalary(''); }}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.editBtn, styles.saveBtn]} onPress={saveOverride} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            {/* Search */}
            <Text style={styles.sectionLabel}>Add Override</Text>
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder='Search a player...'
              placeholderTextColor='#555'
              autoCapitalize='words'
            />
            {searchResults.length > 0 && (
              <View style={styles.searchResults}>
                {searchResults.map((p, idx) => (
                  <TouchableOpacity key={(p.player_id || p.id || idx) + ''} style={styles.searchRow} onPress={() => startEdit(p)}>
                    <Text style={styles.searchPlayerName}>{p.full_name}</Text>
                    <Text style={styles.searchPlayerMeta}>{p.team || '—'} · {formatSalary(p.salary || 0)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Existing overrides */}
            <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Current Overrides ({overrides.length})</Text>
            {overrides.length === 0 ? (
              <Text style={styles.emptyText}>No overrides yet. Search a player above to add one.</Text>
            ) : (
              overrides.map(ov => (
                <View key={ov.id} style={styles.overrideRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.overrideName}>{ov.playerName}</Text>
                    <Text style={styles.overrideSalary}>
                      {formatSalary(ov.originalSalary || 0)} → {formatSalary(ov.salary)}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.editIconBtn} onPress={() => {
                    const p = allPlayers.find((pl: any) => (pl.player_id || pl.id) === ov.playerId) || { full_name: ov.playerName, player_id: ov.playerId, salary: ov.originalSalary };
                    startEdit(p, ov);
                  }}>
                    <Text style={styles.editIcon}>✏️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.deleteIconBtn} onPress={() => deleteOverride(ov)}>
                    <Text style={styles.deleteIcon}>×</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </>
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
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  sectionLabel: { color: '#888', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  searchInput: { backgroundColor: '#0a0a0a', color: '#fff', padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#1a1a1a', fontSize: 16, marginBottom: 8 },
  searchResults: { backgroundColor: '#0a0a0a', borderRadius: 10, borderWidth: 1, borderColor: '#1a1a1a', overflow: 'hidden', marginBottom: 8 },
  searchRow: { padding: 14, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  searchPlayerName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  searchPlayerMeta: { color: '#888', fontSize: 13, marginTop: 2 },
  emptyText: { color: '#666', fontSize: 14, fontStyle: 'italic', paddingVertical: 12 },
  overrideRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0a0a0a', padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#1a1a1a', marginBottom: 8, gap: 8 },
  overrideName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  overrideSalary: { color: '#22c55e', fontSize: 13, marginTop: 2 },
  editIconBtn: { padding: 8 },
  editIcon: { fontSize: 18 },
  deleteIconBtn: { padding: 8 },
  deleteIcon: { color: '#ff4444', fontSize: 22, fontWeight: '700' },
  editCard: { backgroundColor: '#0a0a0a', padding: 20, borderRadius: 12, borderWidth: 1, borderColor: '#1a1a1a' },
  editLabel: { color: '#888', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  editPlayerName: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 4 },
  editOriginal: { color: '#888', fontSize: 14, marginBottom: 16 },
  salaryInput: { backgroundColor: '#000', color: '#fff', padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#2a2a2a', fontSize: 16 },
  editHint: { color: '#666', fontSize: 12, marginTop: 6, marginBottom: 16 },
  editButtonRow: { flexDirection: 'row', gap: 10 },
  editBtn: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center' },
  cancelBtn: { backgroundColor: '#1a1a1a' },
  cancelBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  saveBtn: { backgroundColor: '#22c55e' },
  saveBtnText: { color: '#000', fontSize: 16, fontWeight: '700' },
  lockedTitle: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 8 },
  lockedSub: { color: '#888', fontSize: 14, textAlign: 'center', paddingHorizontal: 32, marginBottom: 24 },
  backBtn: { backgroundColor: '#1a1a1a', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  backBtnText: { color: '#22c55e', fontSize: 16, fontWeight: '600' },
});
