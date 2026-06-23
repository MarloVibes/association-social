import { router, useLocalSearchParams } from 'expo-router';
import { collection, doc, getDoc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, functions } from '@/constants/firebase';
import { getEraCap } from '@/constants/eraCaps';
import { getSportRules } from '@/domain/sports/rules';
import GlobalNav from '@/components/GlobalNav';

const PRIVACY_OPTIONS = [
  { value: 'public', label: 'Public', desc: 'Anyone can find and join your league' },
  { value: 'private', label: 'Private', desc: 'Joinable with a passcode' },
  { value: 'hidden', label: 'Hidden', desc: 'Invite-only, not searchable' },
];

const TRADE_APPROVAL_OPTIONS = [
  { value: 'instant', label: 'Instant', desc: 'Trades execute as soon as both GMs confirm' },
  { value: 'veto', label: 'Commissioner Veto', desc: '24h window for a commissioner to veto before a trade goes through', disabled: false },
  { value: 'vote', label: 'League Vote', desc: 'The league votes to approve or reject each trade', disabled: false },
];

const VOTE_THRESHOLDS = [
  { value: 'majority', label: 'Majority', desc: 'More than half of voting GMs must approve' },
  { value: 'two_thirds', label: 'Two-Thirds', desc: 'At least ⅔ of voting GMs must approve' },
  { value: 'unanimous', label: 'Unanimous', desc: 'Every voting GM must approve' },
];

export default function LeagueSettingsScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const user = auth.currentUser;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [league, setLeague] = useState<any>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState('private');
  const [inviteCode, setInviteCode] = useState('');
  const [tradeApprovalMode, setTradeApprovalMode] = useState('instant');
  const [maxPlayersPerTrade, setMaxPlayersPerTrade] = useState('6');
  const [maxMembers, setMaxMembers] = useState('30');
  const [paused, setPaused] = useState(false);
  const [archived, setArchived] = useState(false);
  const [salaryCap, setSalaryCap] = useState('154647000');
  const [tradeApronTolerance, setTradeApronTolerance] = useState('1.25');
  const [votePassThreshold, setVotePassThreshold] = useState('majority');
  const [voteDeadlineDays, setVoteDeadlineDays] = useState('2');
  const [commissionerCanOverride, setCommissionerCanOverride] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => { loadData(); }, [leagueId]);

  const loadData = async () => {
    if (!leagueId) return;
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'leagues', leagueId));
      if (!snap.exists()) {
        Alert.alert('Not found', 'League not found.');
        router.back();
        return;
      }
      const data = snap.data() as any;
      setLeague({ id: snap.id, ...data });
      // Pending player count (only meaningful for commissioners but cheap to load)
      try {
        const ps = await getDocs(collection(db, 'leagues', leagueId, 'pending_players'));
        setPendingCount(ps.size);
      } catch (e) { /* ignore */ }
      setName(data.name || '');
      setPhotoUrl(data.photoUrl || '');
      setDescription(data.description || '');
      setPrivacy(data.privacy || 'private');
      setInviteCode(data.inviteCode || '');
      setTradeApprovalMode(data.tradeApprovalMode || 'instant');
      setMaxPlayersPerTrade(String(data.maxPlayersPerTrade || 6));
      setMaxMembers(String(
        typeof data.maxMembers === 'number'
          ? data.maxMembers
          : getSportRules(data.sport).teamCount
      ));
      setPaused(!!data.paused);
      setArchived(!!data.archived);
      setSalaryCap(String(data.salaryCap || getEraCap(data.era)));
      setTradeApronTolerance(String(data.tradeApronTolerance || 1.25));
      setVotePassThreshold(data.votePassThreshold || 'majority');
      setVoteDeadlineDays(String(data.voteDeadlineDays || 2));
      setCommissionerCanOverride(!!data.commissionerCanOverride);
    } catch (e: any) { Alert.alert('Error', e.message); }
    setLoading(false);
  };

  const isFounder = league?.commissionerId === user?.uid;
  const [pendingCount, setPendingCount] = useState(0);
  const isCommissioner = isFounder || (league?.coCommissioners || []).includes(user?.uid || '');
  const teamLimit = getSportRules(league?.sport).teamCount;

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size='large' color='#00ff87' style={{ marginTop: 100 }} />
      </View>
    );
  }

  if (!isCommissioner) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Settings</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={{ padding: 40, alignItems: 'center' }}>
          <Text style={styles.lockIcon}>🔒</Text>
          <Text style={styles.lockText}>Only commissioners can edit league settings.</Text>
        </View>
        <GlobalNav />
      </View>
    );
  }

  const saveField = async (patch: any, successMsg?: string) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'leagues', leagueId), { ...patch, updatedAt: serverTimestamp() });
      if (successMsg) Alert.alert('Saved', successMsg);
    } catch (e: any) { Alert.alert('Error', e.message); }
    setSaving(false);
  };

  const pickLeaguePhoto = async () => {
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
      const sRef = storageRef(storage, 'leagues/' + leagueId + '/logo.jpg');
      await uploadBytes(sRef, blob);
      const url = await getDownloadURL(sRef);
      setPhotoUrl(url);
      await updateDoc(doc(db, 'leagues', leagueId!), { photoUrl: url });
    } catch (e: any) { Alert.alert('Upload failed', e.message); }
    setUploadingPhoto(false);
  };

  const handleSaveBasics = async () => {
    if (!name.trim()) { Alert.alert('Name required', 'League name cannot be empty.'); return; }
    const max = parseInt(maxPlayersPerTrade, 10);
    if (isNaN(max) || max < 1 || max > 15) { Alert.alert('Invalid', 'Max players per trade must be between 1 and 15.'); return; }
    const capNum = parseInt(salaryCap.replace(/[^0-9]/g, ''), 10) || 154647000;
    const tolNum = parseFloat(tradeApronTolerance) || 1.25;
    if (tolNum < 1.0 || tolNum > 2.0) { Alert.alert('Invalid', 'Trade tolerance must be between 1.0 and 2.0.'); return; }
    const mm = parseInt(maxMembers, 10);
    const currentMembers = league?.members?.length || 1;
    if (isNaN(mm) || mm < 1 || mm > teamLimit) { Alert.alert('Invalid', 'Max GMs must be between 1 and ' + teamLimit + '.'); return; }
    if (mm < currentMembers) { Alert.alert('Too low', 'This league already has ' + currentMembers + ' GMs, so the max can\'t be set below that. Remove members first if you want a smaller cap.'); return; }
    await saveField({
      name: name.trim(),
      description: description.trim(),
      privacy,
      inviteCode: privacy === 'private' ? inviteCode.trim() : '',
      tradeApprovalMode,
      maxPlayersPerTrade: max,
      maxMembers: mm,
      salaryCap: capNum,
      tradeApronTolerance: tolNum,
      votePassThreshold,
      voteDeadlineDays: Math.max(1, Math.min(14, parseInt(voteDeadlineDays, 10) || 2)),
      commissionerCanOverride,
    }, 'League settings updated.');
  };

  const togglePause = async () => {
    const next = !paused;
    Alert.alert(
      next ? 'Pause League?' : 'Unpause League?',
      next ? 'Trades, channels, and season advances will be blocked.' : 'League activity will resume.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: next ? 'Pause' : 'Unpause', onPress: async () => {
          setPaused(next);
          await saveField({ paused: next });
        }},
      ]
    );
  };

  const toggleArchive = async () => {
    const next = !archived;
    Alert.alert(
      next ? 'Archive League?' : 'Unarchive League?',
      next ? 'The league becomes read-only. Trades and joins close.' : 'The league becomes active again.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: next ? 'Archive' : 'Unarchive', style: next ? 'destructive' : 'default', onPress: async () => {
          setArchived(next);
          await saveField({ archived: next });
        }},
      ]
    );
  };

  const handleDelete = async () => {
    if (!isFounder) { Alert.alert('Founder only', 'Only the original commissioner can delete a league.'); return; }
    if (deleteConfirm.trim().toUpperCase() !== 'DELETE') {
      Alert.alert('Confirm deletion', 'Please type DELETE to confirm.');
      return;
    }
    Alert.alert(
      'Delete League?',
      'This permanently removes the league and all its data. Cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          setSaving(true);
          try {
            const deleteLeague = httpsCallable(functions, 'deleteLeague');
            await deleteLeague({ leagueId });
            Alert.alert('Deleted', 'The league has been deleted.');
            router.replace('/(tabs)/dashboard');
          } catch (e: any) { Alert.alert('Error', e.message); setSaving(false); }
        }},
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 90 }]} keyboardShouldPersistTaps='handled'>
        <Text style={styles.sectionLabel}>BASICS</Text>
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>League Photo</Text>
          <View style={styles.photoRow}>
            <View style={styles.photoCircle}>
              {photoUrl ? (
                <Image source={{ uri: photoUrl }} style={styles.photoImage} />
              ) : (
                <Text style={styles.photoPlaceholder}>🏆</Text>
              )}
            </View>
            <TouchableOpacity style={styles.photoBtn} onPress={pickLeaguePhoto} disabled={uploadingPhoto}>
              {uploadingPhoto ? (
                <ActivityIndicator color='#fff' />
              ) : (
                <Text style={styles.photoBtnText}>{photoUrl ? 'Change Photo' : 'Add Photo'}</Text>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.fieldLabel}>League Name</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder='My League' placeholderTextColor='#555' />
          <Text style={styles.fieldLabel}>Description</Text>
          <TextInput style={[styles.input, styles.textArea]} value={description} onChangeText={setDescription} multiline placeholder='What is your league about?' placeholderTextColor='#555' />
        </View>

        <Text style={styles.sectionLabel}>PRIVACY</Text>
        <View style={styles.card}>
          {PRIVACY_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.optionRow, privacy === opt.value && styles.optionRowActive]}
              onPress={() => setPrivacy(opt.value)}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionLabel, privacy === opt.value && styles.optionLabelActive]}>{opt.label}</Text>
                <Text style={styles.optionDesc}>{opt.desc}</Text>
              </View>
              {privacy === opt.value && <Text style={styles.check}>✓</Text>}
            </TouchableOpacity>
          ))}
          {privacy === 'private' && (
            <>
              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Passcode</Text>
              <TextInput
                style={styles.input}
                value={inviteCode}
                onChangeText={setInviteCode}
                placeholder='Pick something memorable'
                placeholderTextColor='#555'
                autoCapitalize='none'
              />
              <Text style={styles.helper}>Share this with anyone you want to invite. They will need both your league name and this passcode.</Text>
            </>
          )}
        </View>

        <Text style={styles.sectionLabel}>TRADES</Text>
        <View style={styles.card}>
          {TRADE_APPROVAL_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.optionRow, tradeApprovalMode === opt.value && styles.optionRowActive, opt.disabled && { opacity: 0.4 }]}
              onPress={() => { if (!opt.disabled) setTradeApprovalMode(opt.value); }}
              disabled={opt.disabled}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionLabel, tradeApprovalMode === opt.value && styles.optionLabelActive]}>{opt.label}</Text>
                <Text style={styles.optionDesc}>{opt.desc}</Text>
              </View>
              {tradeApprovalMode === opt.value && <Text style={styles.check}>✓</Text>}
            </TouchableOpacity>
          ))}
          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Max Players Per Trade Side</Text>
          <TextInput
            style={styles.input}
            value={maxPlayersPerTrade}
            onChangeText={setMaxPlayersPerTrade}
            keyboardType='number-pad'
            placeholder='6'
            placeholderTextColor='#555'
          />
          <Text style={styles.helper}>How many players each side can put on the table in a Trade Room (1-15).</Text>

          {tradeApprovalMode === 'vote' && (
            <>
              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Vote Pass Threshold</Text>
              {VOTE_THRESHOLDS.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.optionRow, votePassThreshold === opt.value && styles.optionRowActive]}
                  onPress={() => setVotePassThreshold(opt.value)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.optionLabel, votePassThreshold === opt.value && styles.optionLabelActive]}>{opt.label}</Text>
                    <Text style={styles.optionDesc}>{opt.desc}</Text>
                  </View>
                  {votePassThreshold === opt.value && <Text style={styles.check}>✓</Text>}
                </TouchableOpacity>
              ))}
              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Voting Window (days)</Text>
              <TextInput
                style={styles.input}
                value={voteDeadlineDays}
                onChangeText={setVoteDeadlineDays}
                keyboardType='number-pad'
                placeholder='2'
                placeholderTextColor='#555'
              />
              <Text style={styles.helper}>Days GMs have to vote before a trade auto-resolves (1-14). The two GMs in the trade don't vote.</Text>
            </>
          )}

          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Max GMs (League Size)</Text>
          <TextInput
            style={styles.input}
            value={maxMembers}
            onChangeText={setMaxMembers}
            keyboardType='number-pad'
            placeholder={String(teamLimit)}
            placeholderTextColor='#555'
          />
          <Text style={styles.helper}>How many GMs can be in this league (1-{teamLimit}). Once full, new applicants join a waitlist.</Text>
        </View>

        {/* Salary Cap */}
        <Text style={styles.sectionLabel}>SALARY CAP (CURRENT ERA ONLY)</Text>
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>League Salary Cap (USD)</Text>
          <TextInput
            style={styles.input}
            value={salaryCap}
            onChangeText={setSalaryCap}
            keyboardType='number-pad'
            placeholder='154647000'
            placeholderTextColor='#555'
          />
          <Text style={styles.helper}>2025-26 NBA cap is $154.6M. Change for custom leagues.</Text>

          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Trade Tolerance Multiplier</Text>
          <TextInput
            style={styles.input}
            value={tradeApronTolerance}
            onChangeText={setTradeApronTolerance}
            keyboardType='decimal-pad'
            placeholder='1.25'
            placeholderTextColor='#555'
          />
          <Text style={styles.helper}>NBA standard is 1.25 (the 125% rule). Loosen up to 2.0 for casual leagues.</Text>

          <TouchableOpacity
            style={[styles.deleteBtn, { backgroundColor: '#0a1a2a', borderColor: '#3B82F6', borderWidth: 1, marginTop: 12 }]}
            onPress={() => router.push({ pathname: '/screens/salary-overrides', params: { leagueId: leagueId! } })}
          >
            <Text style={[styles.deleteBtnText, { color: '#3B82F6' }]}>💰 PLAYER SALARY OVERRIDES</Text>
          </TouchableOpacity>

          <View style={[styles.toggleRow, { marginTop: 12 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Allow Commissioner Override</Text>
              <Text style={styles.toggleDesc}>Lets commissioners force-execute trades that fail the salary check</Text>
            </View>
            <Switch
              value={commissionerCanOverride}
              onValueChange={setCommissionerCanOverride}
              trackColor={{ false: '#333', true: '#00ff8788' }}
              thumbColor={commissionerCanOverride ? '#00ff87' : '#666'}
            />
          </View>
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSaveBasics} disabled={saving}>
          {saving ? <ActivityIndicator color='#000' /> : <Text style={styles.saveBtnText}>SAVE CHANGES</Text>}
        </TouchableOpacity>

        <Text style={[styles.sectionLabel, { color: '#ff4444', marginTop: 32 }]}>DANGER ZONE</Text>
        <View style={[styles.card, { borderColor: '#ff444433' }]}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>{paused ? 'Paused' : 'Pause League'}</Text>
              <Text style={styles.toggleDesc}>Temporarily freeze all league activity</Text>
            </View>
            <Switch value={paused} onValueChange={togglePause} trackColor={{ false: '#333', true: '#F5A62388' }} thumbColor={paused ? '#F5A623' : '#666'} />
          </View>
          <View style={styles.divider} />
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>{archived ? 'Archived' : 'Archive League'}</Text>
              <Text style={styles.toggleDesc}>Make the league read-only</Text>
            </View>
            <Switch value={archived} onValueChange={toggleArchive} trackColor={{ false: '#333', true: '#ff444488' }} thumbColor={archived ? '#ff4444' : '#666'} />
          </View>
          {isCommissioner && (
            <>
              <View style={styles.divider} />
              <Text style={styles.toggleLabel}>👥 Player Submissions</Text>
              <Text style={styles.toggleDesc}>Review pending custom player submissions from league members</Text>
              <TouchableOpacity
                style={[styles.deleteBtn, { backgroundColor: '#0a1a2a', borderColor: '#3B82F6', borderWidth: 1, marginTop: 12 }]}
                onPress={() => router.push({ pathname: '/screens/pending-players', params: { leagueId } })}
              >
                <Text style={[styles.deleteBtnText, { color: '#3B82F6' }]}>📋 PENDING APPROVALS{pendingCount > 0 ? ` (${pendingCount})` : ''}</Text>
              </TouchableOpacity>
            </>
          )}
          {isFounder && (
            <>
              <View style={styles.divider} />
              <Text style={[styles.toggleLabel, { color: '#ff4444', marginBottom: 4 }]}>Delete League</Text>
              <Text style={styles.toggleDesc}>Permanently remove this league and all its data. Cannot be undone.</Text>
              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Type DELETE to confirm</Text>
              <TextInput
                style={styles.input}
                value={deleteConfirm}
                onChangeText={setDeleteConfirm}
                placeholder='DELETE'
                placeholderTextColor='#555'
                autoCapitalize='characters'
              />
              <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} disabled={saving || deleteConfirm.trim().toUpperCase() !== 'DELETE'}>
                <Text style={styles.deleteBtnText}>DELETE LEAGUE</Text>
              </TouchableOpacity>
            </>
          )}
          {!isFounder && (
            <Text style={[styles.helper, { marginTop: 12 }]}>Only the league founder can delete the league.</Text>
          )}
        </View>
      </ScrollView>
      <GlobalNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  backText: { color: '#00ff87', fontSize: 15, fontWeight: '600', width: 60 },
  title: { fontSize: 18, fontWeight: '800', color: '#ffffff' },
  body: { padding: 16, paddingBottom: 140 },
  sectionLabel: { color: '#888', fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 10, marginTop: 8 },
  card: { backgroundColor: '#111', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#1a1a1a', marginBottom: 12 },
  fieldLabel: { color: '#888', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' },
  input: { backgroundColor: '#1a1a1a', borderRadius: 10, padding: 12, color: '#fff', fontSize: 14, borderWidth: 1, borderColor: '#2a2a2a', marginBottom: 8 },
  textArea: { height: 80, textAlignVertical: 'top' },
  helper: { color: '#666', fontSize: 11, marginTop: 4, lineHeight: 16 },
  optionRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, marginBottom: 6, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a' },
  optionRowActive: { borderColor: '#00ff87', backgroundColor: '#0a2a1a' },
  optionLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },
  optionLabelActive: { color: '#00ff87' },
  optionDesc: { color: '#888', fontSize: 11, marginTop: 2 },
  check: { color: '#00ff87', fontSize: 18, fontWeight: '800', marginLeft: 8 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 12 },
  toggleLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },
  toggleDesc: { color: '#888', fontSize: 11, marginTop: 2 },
  divider: { height: 1, backgroundColor: '#1a1a1a', marginVertical: 4 },
  saveBtn: { backgroundColor: '#00ff87', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 12 },
  saveBtnText: { color: '#000', fontSize: 14, fontWeight: '900', letterSpacing: 2 },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
  photoCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 2, borderColor: '#2a2a2a' },
  photoImage: { width: '100%', height: '100%' },
  photoPlaceholder: { fontSize: 36 },
  photoBtn: { backgroundColor: '#2a2a2a', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#3a3a3a' },
  photoBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  deleteBtn: { backgroundColor: '#2a0a0a', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 8, borderWidth: 1, borderColor: '#ff4444' },
  deleteBtnText: { color: '#ff4444', fontSize: 13, fontWeight: '800', letterSpacing: 2 },
  lockIcon: { fontSize: 48, marginBottom: 12 },
  lockText: { color: '#666', fontSize: 14, textAlign: 'center' },
});
