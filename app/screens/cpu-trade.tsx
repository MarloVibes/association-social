import { router, useLocalSearchParams } from 'expo-router';
import { addDoc, arrayUnion, collection, doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';
import GlobalNav from '@/components/GlobalNav';

const keyOf = (p: any) => p?.player_id || p?.bref_id || p?.full_name || '';

export default function CpuTradeScreen() {
  const { leagueId, cpuTeamId, cpuAbbr, cpuName, prefillGet } = useLocalSearchParams<{ leagueId: string; cpuTeamId: string; cpuAbbr: string; cpuName?: string; prefillGet?: string }>();
  const [league, setLeague] = useState<any>(null);
  const [myTeam, setMyTeam] = useState<any>(null);
  const [myRoster, setMyRoster] = useState<any[]>([]);
  const [cpuRoster, setCpuRoster] = useState<any[]>([]);
  const [give, setGive] = useState<Set<string>>(new Set());
  const [get, setGet] = useState<Set<string>>(new Set(prefillGet ? [String(prefillGet)] : []));
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const user = auth.currentUser;

  useEffect(() => {
    if (!leagueId || !user) return;
    (async () => {
      try {
        const leagueSnap = await getDoc(doc(db, 'leagues', leagueId));
        const ld = leagueSnap.exists() ? (leagueSnap.data() as any) : {};
        setLeague({ id: leagueId, ...ld });
        const eraKey = ld.era || 'current';
        const poolKey = (ld.sport && ld.sport !== 'nba') ? ld.sport : eraKey;

        const mySnap = await getDoc(doc(db, 'leagues', leagueId, 'teams', leagueId + '_' + user.uid));
        if (mySnap.exists()) {
          const md = mySnap.data() as any;
          setMyTeam({ id: mySnap.id, ...md });
          setMyRoster(md.players || []);
        }

        // CPU roster: live doc if already materialized, else the era pool
        const cpuSnap = await getDoc(doc(db, 'leagues', leagueId, 'teams', 'cpu_' + cpuTeamId));
        if (cpuSnap.exists()) {
          setCpuRoster((cpuSnap.data() as any).players || []);
        } else {
          const poolSnap = await getDoc(doc(db, 'era_player_pools', poolKey));
          const pool = poolSnap.exists() ? ((poolSnap.data() as any).players || []) : [];
          setCpuRoster(pool.filter((p: any) => p.team === cpuAbbr));
        }
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [leagueId, cpuTeamId]);

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, k: string) => {
    const next = new Set(set);
    if (next.has(k)) next.delete(k); else next.add(k);
    setter(next);
  };

  const submit = async () => {
    if (!user) return;
    if (give.size === 0 && get.size === 0) { Alert.alert('Empty trade', 'Pick at least one player on either side.'); return; }
    if (!myTeam) { Alert.alert('No team', 'You need a team in this league to propose a trade.'); return; }
    setSending(true);
    try {
      const giveP = myRoster.filter(p => give.has(keyOf(p)));
      const getP = cpuRoster.filter(p => get.has(keyOf(p)));
      const myData = (await getDoc(doc(db, 'users', user.uid))).data() || {};
      const reqRef = await addDoc(collection(db, 'leagues', leagueId, 'cpu_trade_requests'), {
        proposerUid: user.uid,
        proposerName: myData.displayName || myData.username || 'A GM',
        proposerTeamId: myTeam.id,
        proposerTeamName: myTeam.name || '',
        cpuTeamId,
        cpuAbbr,
        cpuName: cpuName || cpuAbbr,
        cpuRoster, // snapshot used for validation / materialization at approval
        give: giveP,
        get: getP,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      try {
        const commId = league?.commissionerId;
        if (commId) {
          await updateDoc(doc(db, 'users', commId), {
            notifications: arrayUnion({
              type: 'cpu_trade_request',
              leagueId,
              leagueName: league?.name || '',
              requestId: reqRef.id,
              fromUid: user.uid,
              fromName: myData.displayName || 'A GM',
              createdAt: new Date().toISOString(),
              message: (myData.displayName || 'A GM') + ' requested a CPU trade for your approval.',
            }),
          });
        }
      } catch {}
      Alert.alert('Sent for Approval', 'Your CPU trade was sent to the commissioner to approve.', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: any) { Alert.alert('Error', e.message); }
    setSending(false);
  };

  const Row = ({ p, selected, onPress }: { p: any; selected: boolean; onPress: () => void }) => (
    <TouchableOpacity style={[styles.row, selected && styles.rowSel]} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.pos}>{p.position || '?'}</Text>
      <Text style={styles.pname}>{p.full_name}</Text>
      {p.salary ? <Text style={styles.psal}>{p.salary <= 1272870 ? '$Min' : '$' + (p.salary / 1000000).toFixed(1) + 'M'}</Text> : null}
      <Text style={[styles.check, selected && styles.checkOn]}>{selected ? '✓' : '+'}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.backText}>← Back</Text></TouchableOpacity>
        <Text style={styles.title}>CPU Trade</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? <ActivityIndicator color='#00ff87' style={{ marginTop: 24 }} /> : (
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.note}>Build a trade with {cpuName || cpuAbbr} (CPU). {"It's sent to the commissioner to approve before rosters change."}</Text>

          <Text style={styles.section}>📤 You give ({give.size}) — from {myTeam?.name || 'your team'}</Text>
          {myRoster.length === 0 ? <Text style={styles.empty}>No players on your roster.</Text> :
            myRoster.map((p, i) => <Row key={keyOf(p) + i} p={p} selected={give.has(keyOf(p))} onPress={() => toggle(give, setGive, keyOf(p))} />)}

          <Text style={[styles.section, { marginTop: 18 }]}>📥 You get ({get.size}) — from {cpuName || cpuAbbr}</Text>
          {cpuRoster.length === 0 ? <Text style={styles.empty}>No players found for this team.</Text> :
            cpuRoster.map((p, i) => <Row key={keyOf(p) + i} p={p} selected={get.has(keyOf(p))} onPress={() => toggle(get, setGet, keyOf(p))} />)}

          <TouchableOpacity style={[styles.submit, (sending || (give.size === 0 && get.size === 0)) && { opacity: 0.5 }]} onPress={submit} disabled={sending || (give.size === 0 && get.size === 0)}>
            {sending ? <ActivityIndicator color='#000' /> : <Text style={styles.submitText}>Send to Commissioner</Text>}
          </TouchableOpacity>
          <View style={{ height: 80 }} />
        </ScrollView>
      )}
      <GlobalNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  backText: { color: '#00ff87', fontSize: 15, fontWeight: '600', width: 60 },
  title: { fontSize: 18, fontWeight: '800', color: '#ffffff' },
  body: { padding: 20, paddingBottom: 120 },
  note: { color: '#888', fontSize: 13, lineHeight: 19, marginBottom: 16 },
  section: { color: '#F5A623', fontSize: 13, fontWeight: '800', marginBottom: 10 },
  empty: { color: '#555', fontSize: 13, paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#141414', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 6, borderWidth: 1, borderColor: '#222', gap: 10 },
  rowSel: { borderColor: '#00ff87', backgroundColor: '#0a1f14' },
  pos: { color: '#888', fontSize: 11, fontWeight: '700', width: 26 },
  pname: { color: '#fff', fontSize: 14, fontWeight: '600', flex: 1 },
  psal: { color: '#00ff87', fontSize: 11, fontWeight: '700' },
  check: { color: '#666', fontSize: 18, fontWeight: '800', width: 22, textAlign: 'center' },
  checkOn: { color: '#00ff87' },
  submit: { marginTop: 22, backgroundColor: '#00ff87', borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  submitText: { color: '#000', fontSize: 15, fontWeight: '800' },
});
