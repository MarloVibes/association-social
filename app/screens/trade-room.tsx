import { router, useLocalSearchParams } from 'expo-router';
import { arrayUnion, collection, doc, getDoc, getDocs, onSnapshot, runTransaction, serverTimestamp, setDoc, updateDoc, query, where } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import { loadSalaryOverrides, getEffectiveSalary } from '@/utils/salaryOverrides';
import { ActivityIndicator, Alert, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';
import GlobalNav from '@/components/GlobalNav';

const MAX_PER_SIDE = 6;
const PRESENCE_LIVE_THRESHOLD_MS = 30 * 1000;
const HEARTBEAT_INTERVAL_MS = 30 * 1000;

function buildRoomId(uidA: string, uidB: string) {
  const [a, b] = [uidA, uidB].sort();
  return 'room_' + a + '_' + b;
}

function getPlayerKey(p: any) {
  return p?.player_id || p?.full_name || '';
}

function PlayerChip({ player, onRemove, locked, overrides }: { player: any; onRemove?: () => void; locked?: boolean; overrides?: Record<string, number> }) {
  const effSalary = overrides && (player?.player_id || player?.id) && overrides[player?.player_id || player?.id] !== undefined ? overrides[player?.player_id || player?.id] : (player?.salary || 0);
  const brefId = player?.bref_id || player?.player_id?.split('_').slice(2).join('_') || '';
  return (
    <View style={[styles.chip, locked && styles.chipLocked]}>
      {brefId ? (
        <Image source={{ uri: 'https://www.basketball-reference.com/req/202106291/images/headshots/' + brefId + '.jpg' }} style={styles.chipPhoto} />
      ) : (
        <View style={styles.chipPhotoFallback}><Text style={styles.chipInitial}>{(player?.full_name || '?')[0]}</Text></View>
      )}
      <View style={styles.chipInfo}>
        <Text style={styles.chipPos}>{player?.position || '?'}</Text>
        <Text style={styles.chipName} numberOfLines={1}>{player?.full_name}</Text>
        {effSalary > 0 ? <Text style={styles.chipSalary}>{effSalary <= 1272870 ? '$Min' : '$' + (effSalary / 1000000).toFixed(1) + 'M'}</Text> : null}
      </View>
      {onRemove && !locked ? (
        <TouchableOpacity style={styles.chipRemove} onPress={onRemove}>
          <Text style={styles.chipRemoveText}>×</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default function TradeRoomScreen() {
  const params = useLocalSearchParams<{ leagueId: string; otherUid: string; otherTeamId: string; otherTeamName: string; prefillPlayer?: string }>();
  const leagueId = String(params.leagueId || '');
  const otherUid = String(params.otherUid || '');
  const otherTeamId = String(params.otherTeamId || '');
  const otherTeamName = String(params.otherTeamName || 'Opponent');

  const user = auth.currentUser;
  const myUid = user?.uid || '';
  const roomId = myUid && otherUid ? buildRoomId(myUid, otherUid) : '';
  const isHost = roomId.startsWith('room_' + myUid);

  const [room, setRoom] = useState<any>(null);
  const [overridesMap, setOverridesMap] = useState<Record<string, number>>({});
  const [myTeam, setMyTeam] = useState<any>(null);
  const [myRoster, setMyRoster] = useState<any[]>([]);
  const [otherRoster, setOtherRoster] = useState<any[]>([]);
  const [otherUntouchables, setOtherUntouchables] = useState<string[]>([]);
  const [lockedPlayerKeys, setLockedPlayerKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [leagueEra, setLeagueEra] = useState<string>('');
  const [tradeApronTolerance, setTradeApronTolerance] = useState<number>(1.25);
  const [commissionerCanOverride, setCommissionerCanOverride] = useState<boolean>(false);
  const [leagueCommUids, setLeagueCommUids] = useState<string[]>([]);
  const [overrideAppliedLocal, setOverrideAppliedLocal] = useState<boolean>(false);
  const [theirPickerOpen, setTheirPickerOpen] = useState(false);
  const [theirLockedKeys, setTheirLockedKeys] = useState<Set<string>>(new Set());
  const [otherPresenceFresh, setOtherPresenceFresh] = useState(false);
  const presenceTimerRef = useRef<any>(null);

  // Initial load + room creation
  useEffect(() => {
    if (!leagueId || !roomId || !myUid) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const teamsSnap = await getDocs(collection(db, 'leagues', leagueId, 'teams'));
        const teams = teamsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        const mine = teams.find((t: any) => t.gmId === myUid);
        const theirs = teams.find((t: any) => t.gmId === otherUid);
        if (cancelled) return;
        if (mine) {
          setMyTeam(mine);
          setMyRoster(mine.players || []);
        }
        if (theirs) {
          setOtherRoster(theirs.players || []);
          setOtherUntouchables(theirs.untouchables || []);
        }

        const roomRef = doc(db, 'leagues', leagueId, 'trade_rooms', roomId);
        const roomSnap = await getDoc(roomRef);
        if (!roomSnap.exists()) {
          await setDoc(roomRef, {
            roomId,
            hostUid: roomId.split('_')[1],
            guestUid: roomId.split('_')[2],
            hostTeamId: mine && roomId.startsWith('room_' + myUid) ? mine.id : (theirs ? theirs.id : ''),
            hostTeamName: mine && roomId.startsWith('room_' + myUid) ? (mine.name || '') : (theirs ? (theirs.name || '') : ''),
            guestTeamId: mine && !roomId.startsWith('room_' + myUid) ? mine.id : (theirs ? theirs.id : ''),
            guestTeamName: mine && !roomId.startsWith('room_' + myUid) ? (mine.name || '') : (theirs ? (theirs.name || '') : ''),
            leagueId,
            status: 'open',
            hostOffer: [],
            guestOffer: [],
            hostConfirmed: false,
            guestConfirmed: false,
            hostPresence: serverTimestamp(),
            guestPresence: serverTimestamp(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          // If a prefill player was requested via deep link, add them to the other side's offer
          if (params.prefillPlayer && theirs) {
            const found = (theirs.players || []).find((p: any) => (p.player_id || p.bref_id || p.full_name) === params.prefillPlayer);
            if (found) {
              const newRoomData = await getDoc(roomRef);
              if (newRoomData.exists()) {
                const d = newRoomData.data() as any;
                const theirIsHost = d.hostUid === otherUid;
                const fieldKey = theirIsHost ? 'hostOffer' : 'guestOffer';
                await updateDoc(roomRef, { [fieldKey]: [found], updatedAt: serverTimestamp() });
              }
            }
          }
        } else {
          // Auto-reset terminal rooms when re-entered (cancelled or executed)
          const existingData = roomSnap.data() as any;
          if (existingData.status === 'cancelled' || existingData.status === 'executed') {
            await updateDoc(roomRef, {
              status: 'open',
              hostOffer: [],
              guestOffer: [],
              hostConfirmed: false,
              guestConfirmed: false,
              senderUid: null,
              cancelReason: null,
              executedAt: null,
              updatedAt: serverTimestamp(),
            });
          }
        }

        // Compute locked players: scan my other active trade rooms in this league
        const myRoomsQ = query(
          collection(db, 'leagues', leagueId, 'trade_rooms'),
          where('hostUid', '==', myUid)
        );
        const myRoomsHostSnap = await getDocs(myRoomsQ);
        const myRoomsGuestQ = query(
          collection(db, 'leagues', leagueId, 'trade_rooms'),
          where('guestUid', '==', myUid)
        );
        const myRoomsGuestSnap = await getDocs(myRoomsGuestQ);
        const locked = new Set<string>();
        const ACTIVE = ['open', 'live', 'pushed', 'countered'];
        [...myRoomsHostSnap.docs, ...myRoomsGuestSnap.docs].forEach(d => {
          const data = d.data() as any;
          if (d.id === roomId) return;
          if (!ACTIVE.includes(data.status)) return;
          const myOffer = data.hostUid === myUid ? (data.hostOffer || []) : (data.guestOffer || []);
          myOffer.forEach((p: any) => locked.add(getPlayerKey(p)));
        });
        if (!cancelled) setLockedPlayerKeys(locked);
      } catch (e) { console.error(e); }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [leagueId, roomId, myUid, otherUid]);

  // Load league era + salary settings
  useEffect(() => {
    if (!leagueId) return;
    getDoc(doc(db, 'leagues', leagueId)).then(snap => {
      if (snap.exists()) {
        const data = snap.data() as any;
        setLeagueEra(data.era || 'current');
        setTradeApronTolerance(typeof data.tradeApronTolerance === 'number' ? data.tradeApronTolerance : 1.25);
        setCommissionerCanOverride(!!data.commissionerCanOverride);
        const comms: string[] = [data.commissionerId, ...(data.coCommissioners || [])].filter(Boolean);
        setLeagueCommUids(comms);
      }
    }).catch(() => {});
  }, [leagueId]);

  useEffect(() => {
    if (!leagueId) return;
    (async () => {
      const map = await loadSalaryOverrides(leagueId);
      setOverridesMap(map);
    })();
  }, [leagueId]);

  // Real-time room listener
  useEffect(() => {
    if (!leagueId || !roomId) return;
    const unsub = onSnapshot(doc(db, 'leagues', leagueId, 'trade_rooms', roomId), snap => {
      if (snap.exists()) setRoom({ id: snap.id, ...snap.data() });
    });
    return () => unsub();
  }, [leagueId, roomId]);

  // Prefill opponent's side with a requested player (if passed via route)
  useEffect(() => {
    if (!room) return;
    if (room.status === 'cancelled' || room.status === 'executed') return;
    const raw = params.prefillPlayer;
    if (!raw) return;
    try {
      const pre = JSON.parse(String(raw));
      if (!pre || !pre.full_name) return;
      const offerKey = isHost ? 'guestOffer' : 'hostOffer';
      const current = room[offerKey] || [];
      const alreadyThere = current.some((p: any) => getPlayerKey(p) === getPlayerKey(pre));
      if (alreadyThere) return;
      if (current.length >= MAX_PER_SIDE) return;
      updateDoc(doc(db, 'leagues', leagueId, 'trade_rooms', roomId), {
        [offerKey]: [...current, pre],
        updatedAt: serverTimestamp(),
      });
    } catch (e) { /* ignore */ }
    // Only run on first room load when prefillPlayer is present
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!room, params.prefillPlayer]);

  // Heartbeat: write my presence every 10s
  useEffect(() => {
    if (!leagueId || !roomId || !myUid) return;
    const tick = async () => {
      try {
        const field = isHost ? 'hostPresence' : 'guestPresence';
        await updateDoc(doc(db, 'leagues', leagueId, 'trade_rooms', roomId), { [field]: serverTimestamp() });
      } catch (e) { /* ignore */ }
    };
    tick();
    presenceTimerRef.current = setInterval(tick, HEARTBEAT_INTERVAL_MS);
    return () => { if (presenceTimerRef.current) clearInterval(presenceTimerRef.current); };
  }, [leagueId, roomId, myUid, isHost]);

  // Compute opponent presence freshness
  useEffect(() => {
    if (!room) return;
    const otherField = isHost ? 'guestPresence' : 'hostPresence';
    const ts = room[otherField];
    const ms = ts?.toMillis ? ts.toMillis() : (ts?.seconds ? ts.seconds * 1000 : 0);
    const fresh = ms && (Date.now() - ms) < PRESENCE_LIVE_THRESHOLD_MS;
    setOtherPresenceFresh(!!fresh);
  }, [room, isHost]);

  if (loading || !room) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size='large' color='#00ff87' style={{ marginTop: 100 }} />
      </View>
    );
  }

  const MIN_SALARY = 1272870;
  const sumSalary = (offer: any[]) => (offer || []).reduce((s: number, p: any) => s + getEffectiveSalary(p, overridesMap), 0);
  const fmtMoney = (n: number) => '$' + (n / 1000000).toFixed(1) + 'M';
  const fmtChipMoney = (n: number) => (n <= MIN_SALARY ? '$Min' : '$' + (n / 1000000).toFixed(1) + 'M');

  const checkSalaryBalance = () => {
    if (leagueEra !== 'current') return { passes: true, hostShortfall: 0, guestShortfall: 0, skipped: true };
    const hostOut = sumSalary(room?.hostOffer || []);
    const guestOut = sumSalary(room?.guestOffer || []);
    if (hostOut === 0 && guestOut === 0) return { passes: true, hostShortfall: 0, guestShortfall: 0, skipped: true };
    const hostCovered = (hostOut * tradeApronTolerance + 100000) >= guestOut;
    const guestCovered = (guestOut * tradeApronTolerance + 100000) >= hostOut;
    const hostShortfall = hostCovered ? 0 : Math.ceil((guestOut - 100000) / tradeApronTolerance - hostOut);
    const guestShortfall = guestCovered ? 0 : Math.ceil((hostOut - 100000) / tradeApronTolerance - guestOut);
    return { passes: hostCovered && guestCovered, hostShortfall, guestShortfall, skipped: false };
  };

  const salaryCheck = checkSalaryBalance();
  const myIsHost = isHost;
  const myShortfall = myIsHost ? salaryCheck.hostShortfall : salaryCheck.guestShortfall;
  const otherShortfall = myIsHost ? salaryCheck.guestShortfall : salaryCheck.hostShortfall;
  const myOfferKey = isHost ? 'hostOffer' : 'guestOffer';
  const otherOfferKey = isHost ? 'guestOffer' : 'hostOffer';
  const myConfirmKey = isHost ? 'hostConfirmed' : 'guestConfirmed';
  const otherConfirmKey = isHost ? 'guestConfirmed' : 'hostConfirmed';
  const myOffer = room[myOfferKey] || [];
  const otherOffer = room[otherOfferKey] || [];
  const myConfirmed = !!room[myConfirmKey];
  const otherConfirmed = !!room[otherConfirmKey];
  const senderUid = room.senderUid;
  const isPushedToMe = (room.status === 'pushed' || room.status === 'countered') && senderUid && senderUid !== myUid;
  const isPushedByMe = (room.status === 'pushed' || room.status === 'countered') && senderUid === myUid;
  const isLive = otherPresenceFresh && room.status !== 'pushed' && room.status !== 'countered' && room.status !== 'cancelled' && room.status !== 'executed';
  const anyConfirmed = myConfirmed || otherConfirmed;
  const canEditMySide = !isPushedByMe && room.status !== 'cancelled' && room.status !== 'executed' && !anyConfirmed;
  const canEditOtherSide = !isPushedByMe && !isPushedToMe && room.status !== 'cancelled' && room.status !== 'executed' && !anyConfirmed;

  const updateRoom = async (patch: any) => {
    await updateDoc(doc(db, 'leagues', leagueId, 'trade_rooms', roomId), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
  };

  const addPlayerToOffer = async (player: any, side: 'mine' | 'theirs') => {
    const key = side === 'mine' ? myOfferKey : otherOfferKey;
    const current = side === 'mine' ? myOffer : otherOffer;
    if (current.length >= MAX_PER_SIDE) {
      Alert.alert('Max ' + MAX_PER_SIDE + ' players per side');
      return;
    }
    const exists = current.some((p: any) => getPlayerKey(p) === getPlayerKey(player));
    if (exists) return;
    await updateRoom({
      [key]: [...current, player],
      hostConfirmed: false,
      guestConfirmed: false,
      status: isLive ? 'live' : (room.status === 'open' ? 'open' : room.status),
    });
  };

  const removePlayerFromOffer = async (player: any, side: 'mine' | 'theirs') => {
    const key = side === 'mine' ? myOfferKey : otherOfferKey;
    const current = side === 'mine' ? myOffer : otherOffer;
    const next = current.filter((p: any) => getPlayerKey(p) !== getPlayerKey(player));
    await updateRoom({
      [key]: next,
      hostConfirmed: false,
      guestConfirmed: false,
    });
  };

  // Fire override review request: writes pendingOverrideReview flag + notifies commissioners
  const requestOverrideReview = async () => {
    try {
      await updateDoc(doc(db, 'leagues', leagueId, 'trade_rooms', roomId), {
        pendingOverrideReview: true,
        overrideRequestedBy: myUid,
        overrideRequestedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      // Notify all commissioners of the league
      const leagueSnap = await getDoc(doc(db, 'leagues', leagueId));
      const lData = (leagueSnap.data() || {}) as any;
      const commIds: string[] = [lData.commissionerId, ...(lData.coCommissioners || [])].filter(Boolean);
      const myName = myTeam?.name || 'A GM';
      const otherName = otherTeamName || 'opponent';
      const note = {
        type: 'trade_override_review',
        leagueId,
        roomId,
        otherUid,
        otherTeamId,
        otherTeamName,
        fromUid: myUid,
        fromTeamName: myTeam?.name || '',
        createdAt: new Date().toISOString(),
        message: myName + ' wants to trade with ' + otherName + ' but salaries do not match. Review required.',
      };
      for (const cid of commIds) {
        if (cid === myUid) continue;
        try { await updateDoc(doc(db, 'users', cid), { notifications: arrayUnion(note) }); } catch (e) {}
      }
      Alert.alert('Sent', 'Commissioner has been notified for review.');
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const approveOverride = async () => {
    Alert.alert('Approve Override?', 'Both sides will be able to confirm this trade even though the salary check fails.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: async () => {
        try {
          const requesterUid = room?.overrideRequestedBy || '';
          await updateDoc(doc(db, 'leagues', leagueId, 'trade_rooms', roomId), {
            salaryOverrideApplied: true,
            pendingOverrideReview: false,
            overrideApprovedBy: myUid,
            overrideApprovedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          if (requesterUid) {
            try {
              await updateDoc(doc(db, 'users', requesterUid), {
                notifications: arrayUnion({
                  type: 'trade_override_approved',
                  leagueId,
                  roomId,
                  otherUid: room?.hostUid === requesterUid ? room?.guestUid : room?.hostUid,
                  otherTeamId: room?.hostUid === requesterUid ? room?.guestTeamId : room?.hostTeamId,
                  otherTeamName: room?.hostUid === requesterUid ? room?.guestTeamName : room?.hostTeamName,
                  createdAt: new Date().toISOString(),
                  message: 'Commissioner approved your override. Both sides can confirm now.',
                }),
              });
            } catch (e) {}
          }
        } catch (e: any) { Alert.alert('Error', e.message); }
      } },
    ]);
  };

  const denyOverride = async () => {
    Alert.alert('Deny Override?', 'The requester will be notified that this trade was not approved.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Deny', style: 'destructive', onPress: async () => {
        try {
          const requesterUid = room?.overrideRequestedBy || '';
          await updateDoc(doc(db, 'leagues', leagueId, 'trade_rooms', roomId), {
            pendingOverrideReview: false,
            overrideDeniedBy: myUid,
            overrideDeniedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          if (requesterUid) {
            try {
              await updateDoc(doc(db, 'users', requesterUid), {
                notifications: arrayUnion({
                  type: 'trade_override_denied',
                  leagueId,
                  roomId,
                  otherUid: room?.hostUid === requesterUid ? room?.guestUid : room?.hostUid,
                  otherTeamId: room?.hostUid === requesterUid ? room?.guestTeamId : room?.hostTeamId,
                  otherTeamName: room?.hostUid === requesterUid ? room?.guestTeamName : room?.hostTeamName,
                  createdAt: new Date().toISOString(),
                  message: 'Commissioner denied your salary override request.',
                }),
              });
            } catch (e) {}
          }
        } catch (e: any) { Alert.alert('Error', e.message); }
      } },
    ]);
  };

  const handleConfirm = async () => {
    if (!salaryCheck.passes && !overrideAppliedLocal && !(room?.salaryOverrideApplied)) {
      const myNeed = myShortfall;
      const theirNeed = otherShortfall;
      const messages = [];
      if (myNeed > 0) messages.push('Your side needs ~$' + (myNeed / 1000000).toFixed(1) + 'M more outgoing');
      if (theirNeed > 0) messages.push('Their side needs ~$' + (theirNeed / 1000000).toFixed(1) + 'M more outgoing');
      const body = messages.join('\n') + '\n\n(Both sides must satisfy ' + (tradeApronTolerance * 100).toFixed(0) + '% rule.)';

      if (commissionerCanOverride) {
        if (room?.pendingOverrideReview) {
          Alert.alert('Pending Review', 'A commissioner is already reviewing this trade. Wait for their decision.');
          return;
        }
        Alert.alert(
          'Salary check failed',
          body + '\n\nSend this trade to a commissioner for review?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Send for Review', onPress: () => requestOverrideReview() },
          ]
        );
      } else {
        Alert.alert('Salary check failed', body);
      }
      return;
    }
    if (myOffer.length === 0 && otherOffer.length === 0) {
      Alert.alert('Empty trade', 'Add at least one player.');
      return;
    }
    try {
      const result = await runTransaction(db, async (tx) => {
        const ref = doc(db, 'leagues', leagueId, 'trade_rooms', roomId);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error('Room missing');
        const data = snap.data() as any;
        const newMyConfirm = true;
        const otherIsConfirmed = !!data[otherConfirmKey];
        if (newMyConfirm && otherIsConfirmed) {
          // Both confirmed — execute the trade
          const hostTeamRef = doc(db, 'leagues', leagueId, 'teams', data.hostTeamId);
          const guestTeamRef = doc(db, 'leagues', leagueId, 'teams', data.guestTeamId);
          const [hostSnap, guestSnap] = await Promise.all([tx.get(hostTeamRef), tx.get(guestTeamRef)]);
          if (!hostSnap.exists() || !guestSnap.exists()) throw new Error('Team missing');
          const host = hostSnap.data() as any;
          const guest = guestSnap.data() as any;

          const hostOffered = data.hostOffer || [];
          const guestOffered = data.guestOffer || [];
          const hostOfferedKeys = new Set(hostOffered.map(getPlayerKey));
          const guestOfferedKeys = new Set(guestOffered.map(getPlayerKey));

          const hostStillHas = (host.players || []).every((p: any) => true);
          const allHostStillOwns = hostOffered.every((p: any) => (host.players || []).some((hp: any) => getPlayerKey(hp) === getPlayerKey(p)));
          const allGuestStillOwns = guestOffered.every((p: any) => (guest.players || []).some((gp: any) => getPlayerKey(gp) === getPlayerKey(p)));
          if (!allHostStillOwns || !allGuestStillOwns) {
            tx.update(ref, { status: 'cancelled', updatedAt: serverTimestamp(), cancelReason: 'roster_changed' });
            return { executed: false, cancelled: true };
          }

          const newHostPlayers = (host.players || []).filter((p: any) => !hostOfferedKeys.has(getPlayerKey(p))).concat(guestOffered);
          const newGuestPlayers = (guest.players || []).filter((p: any) => !guestOfferedKeys.has(getPlayerKey(p))).concat(hostOffered);

          tx.update(hostTeamRef, { players: newHostPlayers });
          tx.update(guestTeamRef, { players: newGuestPlayers });
          tx.update(ref, {
            status: 'executed',
            hostConfirmed: true,
            guestConfirmed: true,
            executedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          return { executed: true, hostOffered, guestOffered, hostName: data.hostTeamName, guestName: data.guestTeamName };
        } else {
          tx.update(ref, { [myConfirmKey]: true, updatedAt: serverTimestamp() });
          return { executed: false };
        }
      });

      if (result?.cancelled) {
        Alert.alert('Trade cancelled', 'A player on the table is no longer on their team.');
        return;
      }
      if (result?.executed) {
        Alert.alert('Trade executed!', 'Players have been swapped.');
        // Notify other side
        await updateDoc(doc(db, 'users', otherUid), {
          notifications: arrayUnion({
            type: 'trade_executed',
            leagueId,
            roomId,
            otherUid: myUid,
            otherTeamId: myTeam?.id || '',
            otherTeamName: myTeam?.name || '',
            createdAt: new Date().toISOString(),
            message: 'Your trade with ' + (myTeam?.name || 'opponent') + ' has been completed.',
          }),
        });
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleSendOffer = async () => {
    if (myOffer.length === 0 && otherOffer.length === 0) {
      Alert.alert('Empty trade', 'Add at least one player.');
      return;
    }
    try {
      await updateRoom({
        status: room.status === 'pushed' ? 'countered' : 'pushed',
        senderUid: myUid,
        [myConfirmKey]: true,
        [otherConfirmKey]: false,
      });
      await updateDoc(doc(db, 'users', otherUid), {
        notifications: arrayUnion({
          type: 'trade_offer',
          leagueId,
          roomId,
          fromUid: myUid,
          fromTeamName: myTeam?.name || '',
          otherUid: myUid,
          otherTeamId: myTeam?.id || '',
          otherTeamName: myTeam?.name || '',
          createdAt: new Date().toISOString(),
          message: (myTeam?.name || 'A GM') + ' sent you a trade offer.',
        }),
      });
      Alert.alert('Offer sent!', otherTeamName + ' will be notified.');
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleAcceptPushed = async () => {
    Alert.alert('Accept Trade', 'Confirm and execute this trade?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Accept', onPress: handleConfirm },
    ]);
  };

  const handleDeclinePushed = async () => {
    Alert.alert('Decline Offer', 'Decline and close this trade room?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Decline', style: 'destructive', onPress: async () => {
        try {
          await updateRoom({ status: 'cancelled', cancelReason: 'declined' });
          await updateDoc(doc(db, 'users', senderUid), {
            notifications: arrayUnion({
              type: 'trade_declined',
              leagueId,
              roomId,
              otherUid: myUid,
              otherTeamId: myTeam?.id || '',
              otherTeamName: myTeam?.name || '',
              createdAt: new Date().toISOString(),
              message: (myTeam?.name || 'A GM') + ' declined your trade offer.',
            }),
          });
          router.back();
        } catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  const handleStartCounter = async () => {
    // Reset confirms, allow editing
    await updateRoom({
      hostConfirmed: false,
      guestConfirmed: false,
      senderUid: '',
      status: 'live',
    });
  };

  const handleCancelRoom = () => {
    Alert.alert('Cancel Trade Room', 'Close this room? Any offers will be discarded.', [
      { text: 'Keep open', style: 'cancel' },
      { text: 'Cancel Trade', style: 'destructive', onPress: async () => {
        try {
          await updateRoom({ status: 'cancelled', cancelReason: 'user_cancelled' });
          if (otherUid) {
            await updateDoc(doc(db, 'users', otherUid), {
              notifications: arrayUnion({
                type: 'trade_cancelled',
                leagueId,
                roomId,
                otherUid: myUid,
                otherTeamId: myTeam?.id || '',
                otherTeamName: myTeam?.name || '',
                createdAt: new Date().toISOString(),
                message: (myTeam?.name || 'A GM') + ' cancelled the trade room.',
              }),
            });
          }
          router.back();
        } catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  // Status banner text
  let statusText = '';
  let statusColor = '#888';
  if (room.status === 'executed') { statusText = 'TRADE EXECUTED'; statusColor = '#00ff87'; }
  else if (room.status === 'cancelled') { statusText = 'CANCELLED'; statusColor = '#ff4444'; }
  else if (isPushedToMe) { statusText = 'OFFER RECEIVED'; statusColor = '#F5A623'; }
  else if (isPushedByMe) { statusText = 'OFFER SENT — WAITING'; statusColor = '#F5A623'; }
  else if (isLive) { statusText = 'LIVE'; statusColor = '#00ff87'; }
  else { statusText = 'WAITING FOR OPPONENT'; statusColor = '#888'; }

  const isTerminal = room.status === 'executed' || room.status === 'cancelled';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Trade Room</Text>
        <TouchableOpacity onPress={handleCancelRoom} disabled={isTerminal}>
          <Text style={[styles.cancelTopText, isTerminal && { opacity: 0.3 }]}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statusBar}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
        <Text style={styles.statusOpponent}>· {otherTeamName}</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 90 }]}>
        {/* Their side */}
        <Text style={styles.sideLabel}>{otherTeamName.toUpperCase()} OFFERS ({otherOffer.length}/{MAX_PER_SIDE})</Text>
        <View style={styles.sideBox}>
          {otherOffer.length === 0 ? (
            <Text style={styles.emptySide}>Nothing on the table</Text>
          ) : (
            otherOffer.map((p: any, i: number) => (
              <PlayerChip
                key={getPlayerKey(p) + i}
                player={p}
                onRemove={canEditOtherSide ? () => removePlayerFromOffer(p, 'theirs') : undefined}
                overrides={overridesMap}
              />
            ))
          )}
          {canEditOtherSide && otherOffer.length < MAX_PER_SIDE ? (
            <TouchableOpacity style={styles.addBtn} onPress={async () => {
              // Query their active rooms to find their locked players
              try {
                const hostQ = query(collection(db, 'leagues', leagueId, 'trade_rooms'), where('hostUid', '==', otherUid));
                const guestQ = query(collection(db, 'leagues', leagueId, 'trade_rooms'), where('guestUid', '==', otherUid));
                const [hostSnap, guestSnap] = await Promise.all([getDocs(hostQ), getDocs(guestQ)]);
                const locked = new Set<string>();
                const ACTIVE = ['open', 'live', 'pushed', 'countered'];
                [...hostSnap.docs, ...guestSnap.docs].forEach(d => {
                  const data = d.data() as any;
                  if (d.id === roomId) return;
                  if (!ACTIVE.includes(data.status)) return;
                  const theirOffer = data.hostUid === otherUid ? (data.hostOffer || []) : (data.guestOffer || []);
                  theirOffer.forEach((p: any) => locked.add(getPlayerKey(p)));
                });
                setTheirLockedKeys(locked);
              } catch (e) { console.error(e); }
              setTheirPickerOpen(true);
            }}>
              <Text style={styles.addBtnText}>+ ADD PLAYER</Text>
            </TouchableOpacity>
          ) : null}
          {otherConfirmed ? <Text style={styles.confirmBadge}>✓ CONFIRMED</Text> : null}
          {otherOffer.length > 0 && leagueEra === 'current' ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>OUT</Text>
              <Text style={styles.totalValue}>{fmtMoney(sumSalary(otherOffer))}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.divider}>
          <Text style={styles.dividerText}>━━━━ THE TABLE ━━━━</Text>
        </View>

        {/* My side */}
        <Text style={styles.sideLabel}>{(myTeam?.name || 'YOU').toUpperCase()} OFFERS ({myOffer.length}/{MAX_PER_SIDE})</Text>
        <View style={styles.sideBox}>
          {myOffer.length === 0 ? (
            <Text style={styles.emptySide}>Nothing on the table</Text>
          ) : (
            myOffer.map((p: any, i: number) => (
              <PlayerChip
                key={getPlayerKey(p) + i}
                player={p}
                onRemove={canEditMySide ? () => removePlayerFromOffer(p, 'mine') : undefined}
                overrides={overridesMap}
              />
            ))
          )}
          {myOffer.length > 0 && leagueEra === 'current' ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>OUT</Text>
              <Text style={styles.totalValue}>{fmtMoney(sumSalary(myOffer))}</Text>
            </View>
          ) : null}
          {leagueEra === 'current' && !salaryCheck.skipped ? (
            <View style={[styles.balanceRow, { backgroundColor: salaryCheck.passes || room?.salaryOverrideApplied ? '#0a2a1a' : '#2a0a0a', borderColor: salaryCheck.passes || room?.salaryOverrideApplied ? '#00ff87' : '#ff4444' }]}>
              <Text style={[styles.balanceText, { color: salaryCheck.passes || room?.salaryOverrideApplied ? '#00ff87' : '#ff4444' }]}>
                {room?.salaryOverrideApplied
                  ? '✓ Commissioner override approved — salary check bypassed'
                  : salaryCheck.passes
                    ? '✓ Salary check OK (' + (tradeApronTolerance * 100).toFixed(0) + '% rule)'
                    : '✗ Salary mismatch — ' + (myShortfall > 0 ? 'you need ~$' + (myShortfall / 1000000).toFixed(1) + 'M more outgoing' : 'they need ~$' + (otherShortfall / 1000000).toFixed(1) + 'M more outgoing')}
              </Text>
              {room?.pendingOverrideReview && !room?.salaryOverrideApplied ? (
                <Text style={styles.balanceOverrideText}>⏳ Pending commissioner review</Text>
              ) : null}
              {/* Commissioner-only review buttons */}
              {leagueCommUids.includes(myUid || '') && room?.pendingOverrideReview && !room?.salaryOverrideApplied ? (
                <View style={styles.overrideBtnRow}>
                  <TouchableOpacity style={styles.overrideApproveBtn} onPress={approveOverride}>
                    <Text style={styles.overrideApproveText}>🔓 Approve Override</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.overrideDenyBtn} onPress={denyOverride}>
                    <Text style={styles.overrideDenyText}>Deny</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          ) : null}
          {canEditMySide && myOffer.length < MAX_PER_SIDE ? (
            <TouchableOpacity style={styles.addBtn} onPress={() => setPickerOpen(true)}>
              <Text style={styles.addBtnText}>+ ADD PLAYER</Text>
            </TouchableOpacity>
          ) : null}
          {myConfirmed ? <Text style={styles.confirmBadge}>✓ CONFIRMED</Text> : null}
        </View>
      </ScrollView>

      {/* Footer CTAs */}
      <View style={styles.footer}>
        {isTerminal ? (
          <Text style={styles.footerNote}>{room.status === 'executed' ? 'Trade complete.' : 'Room closed.'}</Text>
        ) : isPushedToMe ? (
          <View style={styles.footerRow}>
            <TouchableOpacity style={[styles.ctaBtn, styles.ctaAccept]} onPress={handleAcceptPushed}>
              <Text style={styles.ctaAcceptText}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.ctaBtn, styles.ctaCounter]} onPress={handleStartCounter}>
              <Text style={styles.ctaCounterText}>Counter</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.ctaBtn, styles.ctaDecline]} onPress={handleDeclinePushed}>
              <Text style={styles.ctaDeclineText}>Decline</Text>
            </TouchableOpacity>
          </View>
        ) : isPushedByMe ? (
          <Text style={styles.footerNote}>Waiting for {otherTeamName} to respond.</Text>
        ) : anyConfirmed ? (
          <View style={styles.footerRow}>
            {myConfirmed ? (
              <TouchableOpacity style={[styles.ctaBtn, styles.ctaDecline]} onPress={async () => { await updateRoom({ [myConfirmKey]: false }); }}>
                <Text style={styles.ctaDeclineText}>Unconfirm</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.ctaBtn, styles.ctaAccept]} onPress={handleConfirm}>
                <Text style={styles.ctaAcceptText}>Confirm</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.footerRow}>
            <TouchableOpacity style={[styles.ctaBtn, styles.ctaAccept]} onPress={handleConfirm}>
              <Text style={styles.ctaAcceptText}>Confirm</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.ctaBtn, styles.ctaCounter]} onPress={handleSendOffer}>
              <Text style={styles.ctaCounterText}>Send Offer</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Opponent player picker modal */}
      <Modal visible={theirPickerOpen} animationType='slide' presentationStyle='pageSheet'>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setTheirPickerOpen(false)}>
              <Text style={styles.modalClose}>Done</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Add {otherTeamName} Player</Text>
            <View style={{ width: 50 }} />
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            {otherRoster.length === 0 ? (
              <Text style={styles.emptySide}>Opponent roster not loaded</Text>
            ) : otherRoster.map((p: any, i: number) => {
              const key = getPlayerKey(p);
              const onTable = otherOffer.some((mp: any) => getPlayerKey(mp) === key);
              const lockedElsewhere = theirLockedKeys.has(key);
              const isUntouchable = otherUntouchables.includes(key);
              const disabled = onTable || lockedElsewhere || isUntouchable;
              return (
                <TouchableOpacity
                  key={key + i}
                  style={[styles.pickerRow, disabled && styles.pickerRowDisabled]}
                  disabled={disabled}
                  onPress={() => { addPlayerToOffer(p, 'theirs'); }}
                >
                  <Text style={styles.pickerPos}>{p.position || '?'}</Text>
                  <Text style={styles.pickerName}>{p.full_name}</Text>
                  {onTable ? <Text style={styles.pickerTag}>ON TABLE</Text> : null}
                  {lockedElsewhere && !onTable ? <Text style={styles.pickerTagWarn}>IN OTHER ROOM</Text> : null}
                  {isUntouchable && !onTable && !lockedElsewhere ? <Text style={styles.pickerTagWarn}>🔒 UNTOUCHABLE</Text> : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

      {/* Player picker modal */}
      <Modal visible={pickerOpen} animationType='slide' presentationStyle='pageSheet'>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setPickerOpen(false)}>
              <Text style={styles.modalClose}>Done</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Add to Offer</Text>
            <View style={{ width: 50 }} />
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            {myRoster.map((p: any, i: number) => {
              const key = getPlayerKey(p);
              const onTable = myOffer.some((mp: any) => getPlayerKey(mp) === key);
              const lockedElsewhere = lockedPlayerKeys.has(key);
              const disabled = onTable || lockedElsewhere;
              return (
                <TouchableOpacity
                  key={key + i}
                  style={[styles.pickerRow, disabled && styles.pickerRowDisabled]}
                  disabled={disabled}
                  onPress={() => { addPlayerToOffer(p, 'mine'); }}
                >
                  <Text style={styles.pickerPos}>{p.position || '?'}</Text>
                  <Text style={styles.pickerName}>{p.full_name}</Text>
                  {onTable ? <Text style={styles.pickerTag}>ON TABLE</Text> : null}
                  {lockedElsewhere && !onTable ? <Text style={styles.pickerTagWarn}>IN OTHER ROOM</Text> : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

      <GlobalNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  backText: { color: '#00ff87', fontSize: 15, fontWeight: '600', width: 60 },
  title: { fontSize: 18, fontWeight: '800', color: '#ffffff' },
  cancelTopText: { color: '#ff4444', fontSize: 22, fontWeight: '800', width: 60, textAlign: 'right' },

  statusBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: '#1a1a1a', backgroundColor: '#0d0d0d' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  statusOpponent: { color: '#666', fontSize: 12 },

  body: { padding: 16, paddingBottom: 140 },
  sideLabel: { color: '#888', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
  sideBox: { backgroundColor: '#111', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#222', marginBottom: 16, gap: 8 },
  emptySide: { color: '#444', fontSize: 13, fontStyle: 'italic', textAlign: 'center', paddingVertical: 12 },

  divider: { alignItems: 'center', marginVertical: 8 },
  dividerText: { color: '#333', fontSize: 11, fontWeight: '700', letterSpacing: 2 },

  chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: '#2a2a2a', gap: 8 },
  chipLocked: { opacity: 0.6 },
  chipPhoto: { width: 36, height: 36, borderRadius: 4, backgroundColor: '#0a0a0a' },
  chipPhotoFallback: { width: 36, height: 36, borderRadius: 4, backgroundColor: '#1a1a2a', alignItems: 'center', justifyContent: 'center' },
  chipInitial: { color: '#8888ff', fontSize: 16, fontWeight: '800' },
  chipInfo: { flex: 1 },
  chipPos: { color: '#888', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  chipName: { color: '#fff', fontSize: 13, fontWeight: '700' },
  chipSalary: { color: '#00ff87', fontSize: 10, fontWeight: '700', marginTop: 1 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#1a1a1a', paddingHorizontal: 4 },
  totalLabel: { color: '#666', fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  totalValue: { color: '#00ff87', fontSize: 14, fontWeight: '900' },
  balanceRow: { marginTop: 10, padding: 10, borderRadius: 8, borderWidth: 1 },
  balanceText: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  balanceOverrideText: { color: '#F5A623', fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 4 },
  overrideBtnRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8 },
  overrideApproveBtn: { backgroundColor: '#0a2a1a', borderWidth: 1, borderColor: '#00ff87', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  overrideApproveText: { color: '#00ff87', fontSize: 12, fontWeight: '800' },
  overrideDenyBtn: { backgroundColor: '#2a0a0a', borderWidth: 1, borderColor: '#ff4444', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  overrideDenyText: { color: '#ff4444', fontSize: 12, fontWeight: '800' },
  chipRemove: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#2a0a0a', borderWidth: 1, borderColor: '#ff4444', alignItems: 'center', justifyContent: 'center' },
  chipRemoveText: { color: '#ff4444', fontSize: 16, fontWeight: '800' },

  addBtn: { borderStyle: 'dashed', borderWidth: 1, borderColor: '#333', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  addBtnText: { color: '#666', fontSize: 11, fontWeight: '700', letterSpacing: 1 },

  confirmBadge: { color: '#00ff87', fontSize: 11, fontWeight: '800', letterSpacing: 1, textAlign: 'center', marginTop: 4 },

  footer: { position: 'absolute', bottom: 80, left: 0, right: 0, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#0a0a0a', borderTopWidth: 1, borderTopColor: '#1a1a1a' },
  footerRow: { flexDirection: 'row', gap: 8 },
  footerNote: { color: '#666', fontSize: 13, textAlign: 'center', paddingVertical: 8 },

  ctaBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  ctaAccept: { backgroundColor: '#0a2a1a', borderColor: '#00ff87' },
  ctaAcceptText: { color: '#00ff87', fontSize: 14, fontWeight: '800' },
  ctaCounter: { backgroundColor: '#2a1a00', borderColor: '#F5A623' },
  ctaCounterText: { color: '#F5A623', fontSize: 14, fontWeight: '800' },
  ctaDecline: { backgroundColor: '#2a0a0a', borderColor: '#ff4444' },
  ctaDeclineText: { color: '#ff4444', fontSize: 14, fontWeight: '800' },

  modalContainer: { flex: 1, backgroundColor: '#0a0a0a' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  modalClose: { color: '#00ff87', fontSize: 14, fontWeight: '700' },
  modalTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  modalBody: { padding: 16, paddingBottom: 60 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: '#2a2a2a', gap: 10 },
  pickerRowDisabled: { opacity: 0.4 },
  pickerPos: { color: '#888', fontSize: 11, fontWeight: '700', width: 28 },
  pickerName: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },
  pickerTag: { color: '#00ff87', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  pickerTagWarn: { color: '#F5A623', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
});
