import { router, useLocalSearchParams } from 'expo-router';
import { arrayUnion, collection, doc, onSnapshot, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';
import GlobalNav from '@/components/GlobalNav';

const keyOf = (p: any) => p?.player_id || p?.bref_id || p?.full_name || '';
const names = (arr: any[]) => (arr || []).map(p => p.full_name).filter(Boolean).join(', ') || '—';

export default function CpuTradeRequestsScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const [league, setLeague] = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const user = auth.currentUser;

  useEffect(() => {
    if (!leagueId) return;
    const unsub = onSnapshot(doc(db, 'leagues', leagueId), (snap) => {
      setLeague({ id: snap.id, ...(snap.data() || {}) });
      setLoading(false);
    }, err => { if (err.code !== 'permission-denied') console.error(err); });
    return () => unsub();
  }, [leagueId]);

  useEffect(() => {
    if (!leagueId) return;
    const unsub = onSnapshot(collection(db, 'leagues', leagueId, 'cpu_trade_requests'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      list.sort((a, b) => {
        const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return tb - ta;
      });
      setRequests(list);
    }, err => { if (err.code !== 'permission-denied') console.error(err); });
    return () => unsub();
  }, [leagueId]);

  const isAdmin = !!user && !!league && (league.commissionerId === user.uid || (league.coCommissioners || []).includes(user.uid));
  const pending = useMemo(() => requests.filter(r => r.status === 'pending'), [requests]);
  const resolved = useMemo(() => requests.filter(r => r.status !== 'pending'), [requests]);

  const approve = async (req: any) => {
    if (!user) return;
    setBusy(req.id);
    try {
      const result = await runTransaction(db, async (tx) => {
        const reqRef = doc(db, 'leagues', leagueId, 'cpu_trade_requests', req.id);
        const proposerRef = doc(db, 'leagues', leagueId, 'teams', req.proposerTeamId);
        const cpuRef = doc(db, 'leagues', leagueId, 'teams', 'cpu_' + req.cpuTeamId);
        const [rSnap, pSnap, cSnap] = await Promise.all([tx.get(reqRef), tx.get(proposerRef), tx.get(cpuRef)]);
        if (!rSnap.exists()) throw new Error('Request missing');
        const r = rSnap.data() as any;
        if (r.status !== 'pending') return { done: false, reason: 'resolved' };
        if (!pSnap.exists()) { tx.update(reqRef, { status: 'voided', reason: 'team_missing', resolvedAt: serverTimestamp() }); return { done: false, reason: 'team_missing' }; }

        const pData = pSnap.data() as any;
        const cpuExists = cSnap.exists();
        const cPlayers: any[] = cpuExists ? ((cSnap.data() as any).players || []) : (r.cpuRoster || []);

        const giveKeys = new Set((r.give || []).map(keyOf));
        const getKeys = new Set((r.get || []).map(keyOf));

        const proposerHasAll = (r.give || []).every((p: any) => (pData.players || []).some((pp: any) => keyOf(pp) === keyOf(p)));
        const cpuHasAll = (r.get || []).every((p: any) => cPlayers.some((cp: any) => keyOf(cp) === keyOf(p)));
        if (!proposerHasAll || !cpuHasAll) {
          tx.update(reqRef, { status: 'voided', reason: 'roster_changed', resolvedAt: serverTimestamp() });
          return { done: false, reason: 'roster_changed' };
        }

        const newProposer = (pData.players || []).filter((p: any) => !giveKeys.has(keyOf(p))).concat(r.get || []);
        const newCpu = cPlayers.filter((p: any) => !getKeys.has(keyOf(p))).concat(r.give || []);

        tx.update(proposerRef, { players: newProposer });
        if (cpuExists) {
          tx.update(cpuRef, { players: newCpu });
        } else {
          // Materialize the CPU team as a real doc so its new roster persists
          tx.set(cpuRef, {
            gmId: null,
            isCpu: true,
            teamId: r.cpuTeamId,
            name: r.cpuName || r.cpuAbbr,
            abbreviation: r.cpuAbbr,
            era: league?.era || 'current',
            players: newCpu,
            tradeBlock: [],
          });
        }
        tx.update(reqRef, { status: 'approved', resolvedAt: serverTimestamp(), resolvedBy: user.uid });
        return { done: true };
      });

      if (result?.done) {
        Alert.alert('Approved', 'Rosters have been updated.');
        try {
          await updateDoc(doc(db, 'users', req.proposerUid), {
            notifications: arrayUnion({
              type: 'cpu_trade_result',
              leagueId,
              leagueName: league?.name || '',
              createdAt: new Date().toISOString(),
              message: 'Your CPU trade with ' + (req.cpuName || req.cpuAbbr) + ' was approved. Rosters updated.',
            }),
          });
        } catch {}
      } else if (result?.reason === 'roster_changed') {
        Alert.alert('Could not approve', 'A player in this trade is no longer on the expected roster, so it was voided.');
      } else if (result?.reason === 'resolved') {
        Alert.alert('Already handled', 'This request was already resolved.');
      } else {
        Alert.alert('Could not approve', 'The proposing team could not be found.');
      }
    } catch (e: any) { Alert.alert('Error', e.message); }
    setBusy(null);
  };

  const deny = (req: any) => {
    Alert.alert('Decline CPU Trade', 'Decline ' + (req.proposerName || 'this') + ' trade with ' + (req.cpuName || req.cpuAbbr) + '?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Decline', style: 'destructive', onPress: async () => {
        setBusy(req.id);
        try {
          await updateDoc(doc(db, 'leagues', leagueId, 'cpu_trade_requests', req.id), {
            status: 'declined', resolvedAt: serverTimestamp(), resolvedBy: user?.uid || '',
          });
          try {
            await updateDoc(doc(db, 'users', req.proposerUid), {
              notifications: arrayUnion({
                type: 'cpu_trade_result',
                leagueId,
                leagueName: league?.name || '',
                createdAt: new Date().toISOString(),
                message: 'Your CPU trade with ' + (req.cpuName || req.cpuAbbr) + ' was declined by the commissioner.',
              }),
            });
          } catch {}
        } catch (e: any) { Alert.alert('Error', e.message); }
        setBusy(null);
      }},
    ]);
  };

  const Card = ({ req, actionable }: { req: any; actionable: boolean }) => (
    <View style={styles.card}>
      <Text style={styles.cardHead}>{req.proposerName || 'A GM'} ↔ {req.cpuName || req.cpuAbbr} <Text style={styles.cpuTag}>CPU</Text></Text>
      <Text style={styles.line}><Text style={styles.giveLbl}>Gives: </Text>{names(req.give)}</Text>
      <Text style={styles.line}><Text style={styles.getLbl}>Gets: </Text>{names(req.get)}</Text>
      {actionable ? (
        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.denyBtn} onPress={() => deny(req)} disabled={busy === req.id}>
            <Text style={styles.denyText}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.appBtn} onPress={() => approve(req)} disabled={busy === req.id}>
            {busy === req.id ? <ActivityIndicator size='small' color='#000' /> : <Text style={styles.appText}>Approve</Text>}
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={[styles.status, req.status === 'approved' && { color: '#00ff87' }, req.status === 'declined' && { color: '#ff4444' }, req.status === 'voided' && { color: '#F5A623' }]}>
          {req.status === 'approved' ? '✓ Approved' : req.status === 'declined' ? '✕ Declined' : '↩ Voided (roster changed)'}
        </Text>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.backText}>← Back</Text></TouchableOpacity>
        <Text style={styles.title}>CPU Trades</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? <ActivityIndicator color='#00ff87' style={{ marginTop: 24 }} /> : !isAdmin ? (
        <Text style={styles.empty}>Only the commissioner can review CPU trades.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.section}>Pending ({pending.length})</Text>
          {pending.length === 0 ? <Text style={styles.empty}>No pending CPU trades.</Text> :
            pending.map(req => <Card key={req.id} req={req} actionable />)}

          {resolved.length > 0 ? (
            <>
              <Text style={[styles.section, { marginTop: 20 }]}>History ({resolved.length})</Text>
              {resolved.map(req => <Card key={req.id} req={req} actionable={false} />)}
            </>
          ) : null}
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
  section: { color: '#F5A623', fontSize: 13, fontWeight: '800', marginBottom: 10 },
  empty: { color: '#555', fontSize: 14, textAlign: 'center', paddingTop: 30 },
  card: { backgroundColor: '#141414', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#222' },
  cardHead: { color: '#fff', fontSize: 15, fontWeight: '800', marginBottom: 8 },
  cpuTag: { color: '#888', fontSize: 11, fontWeight: '700' },
  line: { color: '#ccc', fontSize: 13, marginBottom: 4 },
  giveLbl: { color: '#ff8888', fontWeight: '700' },
  getLbl: { color: '#88ff88', fontWeight: '700' },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  denyBtn: { flex: 1, backgroundColor: '#2a0a0a', borderRadius: 8, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: '#ff4444' },
  denyText: { color: '#ff4444', fontSize: 13, fontWeight: '800' },
  appBtn: { flex: 1, backgroundColor: '#00ff87', borderRadius: 8, paddingVertical: 11, alignItems: 'center' },
  appText: { color: '#000', fontSize: 13, fontWeight: '800' },
  status: { fontSize: 13, fontWeight: '700', color: '#888', marginTop: 8 },
});
