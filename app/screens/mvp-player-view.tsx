import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/constants/firebase';

const POS_COLORS: Record<string, string> = {
  PG: '#1d4ed8', SG: '#0891b2', SF: '#16a34a', PF: '#ca8a04', C: '#dc2626',
};

const ATTR_GROUPS: { label: string; color: string; attrs: { key: string; label: string }[] }[] = [
  { label: 'FINISHING', color: '#3b82f6', attrs: [
    { key: 'closeShot', label: 'Close Shot' },
    { key: 'drivingLayup', label: 'Driving Layup' },
    { key: 'drivingDunk', label: 'Driving Dunk' },
    { key: 'standingDunk', label: 'Standing Dunk' },
    { key: 'postControl', label: 'Post Control' },
  ]},
  { label: 'SHOOTING', color: '#22c55e', attrs: [
    { key: 'midRangeShot', label: 'Mid-Range Shot' },
    { key: 'threePointShot', label: 'Three-Point Shot' },
    { key: 'freeThrow', label: 'Free Throw' },
  ]},
  { label: 'PLAYMAKING', color: '#f59e0b', attrs: [
    { key: 'passAccuracy', label: 'Pass Accuracy' },
    { key: 'ballHandle', label: 'Ball Handle' },
    { key: 'speedWithBall', label: 'Speed With Ball' },
  ]},
  { label: 'DEFENSE', color: '#ef4444', attrs: [
    { key: 'interiorDefense', label: 'Interior Defense' },
    { key: 'perimeterDefense', label: 'Perimeter Defense' },
    { key: 'steal', label: 'Steal' },
    { key: 'block', label: 'Block' },
  ]},
  { label: 'REBOUNDING', color: '#8b5cf6', attrs: [
    { key: 'offensiveRebound', label: 'Offensive Rebound' },
    { key: 'defensiveRebound', label: 'Defensive Rebound' },
  ]},
  { label: 'ATHLETICISM', color: '#eab308', attrs: [
    { key: 'speed', label: 'Speed' },
    { key: 'agility', label: 'Agility' },
    { key: 'strength', label: 'Strength' },
    { key: 'vertical', label: 'Vertical' },
  ]},
];

export default function MVPPlayerViewScreen() {
  const router = useRouter();
  const { playerId } = useLocalSearchParams<{ playerId: string }>();
  const [loading, setLoading] = useState(true);
  const [player, setPlayer] = useState<any>(null);
  const [attrsOpen, setAttrsOpen] = useState(false);

  const isOwn = player && player.ownerUid === auth.currentUser?.uid;

  const load = useCallback(async () => {
    if (!playerId) { Alert.alert('Error', 'Missing playerId'); router.back(); return; }
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'mvp_players', playerId));
      if (!snap.exists()) {
        Alert.alert('Not found', 'This MVP card no longer exists.');
        router.back();
        return;
      }
      setPlayer({ id: snap.id, ...(snap.data() as any) });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setLoading(false);
  }, [playerId, router]);

  useEffect(() => { load(); }, [load]);

  if (loading || !player) {
    return <View style={[styles.container, styles.center]}><ActivityIndicator color='#22c55e' /></View>;
  }

  const attrs = player.attributes || {};
  const hasAttrs = Object.keys(attrs).length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.backLink}>← Back</Text></TouchableOpacity>
        <Text style={styles.title}>MVP Card</Text>
        {isOwn ? (
          <TouchableOpacity onPress={() => router.replace({ pathname: '/screens/mvp-player-edit', params: { playerId: player.id } })}>
            <Text style={styles.editLink}>Edit</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>

        {/* Hero card */}
        <View style={styles.heroCard}>
          <View style={[styles.ovrCircle, { backgroundColor: POS_COLORS[player.position] || '#666' }]}>
            <Text style={styles.ovrText}>{player.overall}</Text>
            <Text style={styles.ovrLabel}>OVR</Text>
          </View>
          <Text style={styles.playerName}>{player.playerName}</Text>
          <Text style={styles.archetype}>{player.archetype || 'No archetype'}</Text>
          <View style={styles.posBadge}>
            <Text style={styles.posBadgeText}>{player.position}</Text>
          </View>
          <Text style={styles.gamerTag}>{player.ownerGamerTag || ''}</Text>
        </View>

        {/* Build row */}
        <View style={styles.buildRow}>
          <View style={styles.buildCell}>
            <Text style={styles.buildLabel}>HEIGHT</Text>
            <Text style={styles.buildValue}>{player.height || '—'}</Text>
          </View>
          <View style={styles.buildCell}>
            <Text style={styles.buildLabel}>WEIGHT</Text>
            <Text style={styles.buildValue}>{player.weight ? `${player.weight} lbs` : '—'}</Text>
          </View>
          <View style={styles.buildCell}>
            <Text style={styles.buildLabel}>WINGSPAN</Text>
            <Text style={styles.buildValue}>{player.wingspan || '—'}</Text>
          </View>
        </View>

        {/* Attributes */}
        {hasAttrs && (
          <>
            <TouchableOpacity style={styles.attrsToggle} onPress={() => setAttrsOpen(!attrsOpen)}>
              <Text style={styles.attrsToggleText}>{attrsOpen ? '▼' : '▶'}  Attributes</Text>
            </TouchableOpacity>
            {attrsOpen && (
              <View style={styles.attrsBox}>
                {ATTR_GROUPS.map(group => {
                  const groupAttrs = group.attrs.filter(a => attrs[a.key] !== undefined);
                  if (groupAttrs.length === 0) return null;
                  return (
                    <View key={group.label} style={{ marginBottom: 16 }}>
                      <Text style={[styles.attrGroupLabel, { color: group.color }]}>{group.label}</Text>
                      {groupAttrs.map(a => (
                        <View key={a.key} style={styles.attrRow}>
                          <Text style={styles.attrLabel}>{a.label}</Text>
                          <View style={[styles.attrValueBox, { borderColor: group.color }]}>
                            <Text style={styles.attrValue}>{attrs[a.key]}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  );
                })}
              </View>
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
  editLink: { color: '#22c55e', fontSize: 16, fontWeight: '700' },
  title: { color: '#fff', fontSize: 18, fontWeight: '800' },
  heroCard: { alignItems: 'center', padding: 24, backgroundColor: '#0a0a0a', borderRadius: 16, borderWidth: 1, borderColor: '#1a1a1a', marginBottom: 16 },
  ovrCircle: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  ovrText: { color: '#fff', fontSize: 38, fontWeight: '900', lineHeight: 42 },
  ovrLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  playerName: { color: '#fff', fontSize: 26, fontWeight: '900', textAlign: 'center', marginBottom: 4 },
  archetype: { color: '#aaa', fontSize: 14, textAlign: 'center', marginBottom: 12, fontStyle: 'italic' },
  posBadge: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 999, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a', marginBottom: 8 },
  posBadgeText: { color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  gamerTag: { color: '#666', fontSize: 12, marginTop: 4 },
  buildRow: { flexDirection: 'row', backgroundColor: '#0a0a0a', borderRadius: 12, borderWidth: 1, borderColor: '#1a1a1a', marginBottom: 16, overflow: 'hidden' },
  buildCell: { flex: 1, padding: 14, alignItems: 'center' },
  buildLabel: { color: '#666', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  buildValue: { color: '#fff', fontSize: 15, fontWeight: '700' },
  attrsToggle: { paddingVertical: 16 },
  attrsToggleText: { color: '#22c55e', fontSize: 15, fontWeight: '700' },
  attrsBox: { backgroundColor: '#0a0a0a', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#1a1a1a' },
  attrGroupLabel: { fontSize: 12, fontWeight: '900', letterSpacing: 1, marginBottom: 8 },
  attrRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  attrLabel: { color: '#fff', fontSize: 14, flex: 1 },
  attrValueBox: { width: 50, padding: 6, borderRadius: 8, borderWidth: 1.5, alignItems: 'center' },
  attrValue: { color: '#fff', fontSize: 15, fontWeight: '900' },
});
