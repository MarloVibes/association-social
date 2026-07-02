import { router, useLocalSearchParams } from 'expo-router';
import { arrayUnion, collection, doc, getDoc, getDocs, onSnapshot, runTransaction, serverTimestamp, setDoc, updateDoc, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useRef, useState } from 'react';
import { loadSalaryOverrides, getEffectiveSalary } from '@/utils/salaryOverrides';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View, TextInput } from 'react-native';
import { auth, db, functions } from '@/constants/firebase';
import { stepienViolation, DRAFT_YEARS } from '@/constants/draftPicks';
import GlobalNav from '@/components/GlobalNav';
import FranchisePlayerRow, { formatFranchisePlayerMoney } from '@/components/FranchisePlayerRow';
import { leagueDateFromRecord } from '@/components/PlayerCard';
import PlayerHeadshot from '@/components/PlayerHeadshot';
import { getPositionFilters } from '@/domain/sports/playerFields';
import { compareRosterPlayersByValue, matchesRosterPosition } from '@/domain/nba/rotation';
import { validateTrade } from '@/domain/finance/validateTrade';

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

function pickLabel(pk: any) {
  const r = pk?.round;
  const ord = r === 1 ? '1st' : r === 2 ? '2nd' : r === 3 ? '3rd' : `${r}th`;
  return `${pk?.year} ${ord} Rd${pk?.protection ? ' · ' + pk.protection : ''}`;
}

function positionFilterLabel(position: string) {
  const label = String(position || 'ALL').toUpperCase();
  return label === 'ALL' ? 'ALL' : label;
}

// Strip undefined values (Firestore rejects them) by round-tripping through JSON.
function cleanForFirestore(obj: any) {
  return JSON.parse(JSON.stringify(obj ?? {}));
}

function TradePickerPlayerRow({
  player,
  index,
  sport,
  era,
  currentYear,
  leagueDate,
  overrides,
  disabled,
  statusLabels,
  onPress,
}: {
  player: any;
  index: number;
  sport: string;
  era?: string | null;
  currentYear?: number | string | null;
  leagueDate?: string | Date | null;
  overrides: Record<string, number>;
  disabled?: boolean;
  statusLabels?: { label: string; tone: 'good' | 'warn' | 'danger' }[];
  onPress: () => void;
}) {
  const effectiveSalary = getEffectiveSalary(player, overrides);
  return (
    <FranchisePlayerRow
      player={player}
      index={index}
      sport={sport}
      era={era}
      currentYear={currentYear}
      leagueDate={leagueDate}
      salary={effectiveSalary}
      salaryLabel={`${formatFranchisePlayerMoney(effectiveSalary)} salary`}
      statusLabels={statusLabels}
      disabled={disabled}
      gradeCount={3}
      onPress={onPress}
      action={!disabled ? { label: 'Add', variant: 'primary', onPress } : null}
    />
  );
}

function PlayerChip({ player, sport, onRemove, locked, overrides }: { player: any; sport: string; onRemove?: () => void; locked?: boolean; overrides?: Record<string, number> }) {
  const effSalary = overrides && (player?.player_id || player?.id) && overrides[player?.player_id || player?.id] !== undefined ? overrides[player?.player_id || player?.id] : (player?.salary || 0);
  return (
    <View style={[styles.chip, locked && styles.chipLocked]}>
      <PlayerHeadshot
        player={player}
        sport={sport}
        imageStyle={styles.chipPhoto}
        fallback={
        <View style={styles.chipPhotoFallback}><Text style={styles.chipInitial}>{(player?.full_name || '?')[0]}</Text></View>
        }
      />
      <View style={styles.chipInfo}>
        <Text style={styles.chipPos}>{player?.position || '?'}</Text>
        <Text style={styles.chipName} numberOfLines={1}>{player?.full_name}</Text>
        <Text style={styles.chipSalary}>{effSalary > 0 ? (effSalary <= 1272870 ? '$Min' : '$' + (effSalary / 1000000).toFixed(1) + 'M') : '$—'}</Text>
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
  const params = useLocalSearchParams<{ leagueId: string; otherUid: string; otherTeamId: string; otherTeamName: string; prefillPlayer?: string; prefillMyPlayer?: string }>();
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
  const [leagueSport, setLeagueSport] = useState<string>('nba');
  const [tradeApronTolerance, setTradeApronTolerance] = useState<number>(1.25);
  const [commissionerCanOverride, setCommissionerCanOverride] = useState<boolean>(false);
  const [leagueCommUids, setLeagueCommUids] = useState<string[]>([]);
  const [tradeApprovalMode, setTradeApprovalMode] = useState<string>('instant');
  const [leagueMembers, setLeagueMembers] = useState<string[]>([]);
  const [votePassThreshold, setVotePassThreshold] = useState<string>('majority');
  const [voteDeadlineDays, setVoteDeadlineDays] = useState<number>(2);
  const [overrideAppliedLocal, setOverrideAppliedLocal] = useState<boolean>(false);
  const [theirPickerOpen, setTheirPickerOpen] = useState(false);
  const [myPickerPosFilter, setMyPickerPosFilter] = useState('ALL');
  const [theirPickerPosFilter, setTheirPickerPosFilter] = useState('ALL');
  const [theirLockedKeys, setTheirLockedKeys] = useState<Set<string>>(new Set());
  const [otherPresenceFresh, setOtherPresenceFresh] = useState(false);
  const [currentYear, setCurrentYear] = useState<number | undefined>(undefined);
  const [leagueDate, setLeagueDate] = useState<string | Date | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [pickModalSide, setPickModalSide] = useState<null | 'mine' | 'theirs'>(null);
  const [pickRound, setPickRound] = useState<1 | 2>(1);
  const [pickYear, setPickYear] = useState('');
  const [pickProtection, setPickProtection] = useState('');
  const [otherTeamPicks, setOtherTeamPicks] = useState<any[]>([]);
  const [stepienRule, setStepienRule] = useState(false);
  const [draftBaseYear, setDraftBaseYear] = useState<number>(new Date().getFullYear() + 1);
  const presenceTimerRef = useRef<any>(null);
  const finalizeInFlightRef = useRef(false);
  const localFinalizeSuccessPendingRef = useRef(false);
  const snapshotFinalizeKeyRef = useRef('');
  const positionFilters = getPositionFilters(leagueSport);

  const finalizeTradeRoom = async (_trade: any) => {
    if (finalizeInFlightRef.current) return { executed: false, inFlight: true };
    finalizeInFlightRef.current = true;
    try {
      const callable = httpsCallable(functions, 'finalizeTrade');
      const response: any = await callable({ leagueId, roomId });
      const result = response?.data || {};
      return result;
    } catch (e: any) {
      const validationErrors = e?.details?.errors;
      if (Array.isArray(validationErrors) && validationErrors.length > 0) {
        throw new Error(validationErrors.join('\n'));
      }
      throw e;
    } finally {
      finalizeInFlightRef.current = false;
    }
  };

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
          setMyRoster([...(mine.players || [])].sort(compareRosterPlayersByValue));
        }
        if (theirs) {
          setOtherRoster([...(theirs.players || [])].sort(compareRosterPlayersByValue));
          setOtherUntouchables(theirs.untouchables || []);
          setOtherTeamPicks(theirs.picks || []);
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

          // Notify target team's GM that a trade room was opened
          try {
            await updateDoc(doc(db, 'users', otherUid), {
              notifications: arrayUnion({
                type: 'trade_room_opened',
                leagueId,
                roomId,
                otherUid: myUid,
                otherTeamId: mine?.id || '',
                otherTeamName: mine?.name || 'A team',
                createdAt: new Date().toISOString(),
                message: (mine?.name || 'A team') + ' opened a trade room with you. Join to negotiate live.',
                read: false,
              }),
            });
          } catch (e) {
            console.warn('Failed to notify target team of trade room', e);
          }
        } else {
          // Auto-reset terminal rooms when re-entered (cancelled or executed)
          const existingData = roomSnap.data() as any;
          if (existingData.status === 'cancelled' || existingData.status === 'executed') {
            await updateDoc(roomRef, {
              status: 'open',
              hostOffer: [],
              guestOffer: [],
              hostPicks: [],
              guestPicks: [],
              hostConfirmed: false,
              guestConfirmed: false,
              senderUid: null,
              cancelReason: null,
              executedAt: null,
              salaryOverrideApplied: false,
              pendingOverrideReview: false,
              overrideRequestedBy: null,
              overrideApprovedBy: null,
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
        setLeagueSport(data.sport || 'nba');
        if (data.currentYear) setCurrentYear(data.currentYear);
        setLeagueDate(leagueDateFromRecord(data));
        setTradeApronTolerance(typeof data.tradeApronTolerance === 'number' ? data.tradeApronTolerance : 1.25);
        setCommissionerCanOverride(!!data.commissionerCanOverride);
        const comms: string[] = [data.commissionerId, ...(data.coCommissioners || [])].filter(Boolean);
        setLeagueCommUids(comms);
        setTradeApprovalMode(data.tradeApprovalMode || 'instant');
        setLeagueMembers(data.members || []);
        setVotePassThreshold(data.votePassThreshold || 'majority');
        setStepienRule((data.sport || 'nba') === 'nba' && !!data.stepienRule);
        setDraftBaseYear(data.draftBaseYear || (new Date().getFullYear() + 1));
        setVoteDeadlineDays(typeof data.voteDeadlineDays === 'number' ? data.voteDeadlineDays : 2);
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
    let prevStatus: string | null = null;
    const unsub = onSnapshot(doc(db, 'leagues', leagueId, 'trade_rooms', roomId), snap => {
      const snapData = snap.data() as any;
      if (snapData?.status === 'executed' && prevStatus && prevStatus !== 'executed') {
        const localFinalizeWillAlert = finalizeInFlightRef.current || localFinalizeSuccessPendingRef.current;
        if (!localFinalizeWillAlert) {
          // Trade executed remotely — show alert and route back
          Alert.alert('Trade executed!', 'Players have been swapped.', [{ text: 'OK', onPress: () => router.back() }]);
        }
      }
      if (snapData?.status === 'cancelled' && snapData?.cancelReason === 'roster_changed' && prevStatus && prevStatus !== 'cancelled') {
        // Trade voided because a player in it was traded elsewhere first
        Alert.alert('Trade voided', 'A player in this deal was traded to another team first, so this trade could not go through.', [{ text: 'OK', onPress: () => router.back() }]);
      }
      if (snapData?.status === 'rejected' && prevStatus && prevStatus !== 'rejected') {
        Alert.alert('Trade rejected', 'The league voted this trade down. No players moved.', [{ text: 'OK', onPress: () => router.back() }]);
      }
      prevStatus = snapData?.status || null;
      if (snap.exists()) setRoom({ id: snap.id, ...snap.data() });
      // Opportunistic finalize: if the veto window has elapsed with no veto, execute now.
      if (snapData?.status === 'pending_veto' && snapData?.vetoDeadline && Date.now() > snapData.vetoDeadline) {
        const finalizeKey = 'pending_veto:' + snapData.vetoDeadline;
        if (snapshotFinalizeKeyRef.current !== finalizeKey) {
          snapshotFinalizeKeyRef.current = finalizeKey;
          finalizeTradeRoom(snapData).catch(() => {});
        }
      }
      // League vote: resolve at deadline; once passed, a participant runs the swap.
      if (snapData?.status === 'pending_vote' && snapData?.voteDeadline && Date.now() > snapData.voteDeadline) {
        const callable = httpsCallable(functions, 'updateTradeDecision');
        callable({ leagueId, roomId, action: 'cast_vote', forceResolve: true }).catch(() => {});
      }
      if (snapData?.status === 'vote_passed' && (myUid === snapData?.hostUid || myUid === snapData?.guestUid)) {
        const finalizeKey = 'vote_passed:' + (snapData.voteResolvedAt?.toMillis?.() || '');
        if (snapshotFinalizeKeyRef.current !== finalizeKey) {
          snapshotFinalizeKeyRef.current = finalizeKey;
          finalizeTradeRoom(snapData).catch(() => {});
        }
      }
    }, err => { if (err.code !== 'permission-denied') console.error(err); });
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

  // Prefill MY side with a player (from "Trade Player" button on roster)
  useEffect(() => {
    if (!room) return;
    if (room.status === 'cancelled' || room.status === 'executed') return;
    const raw = params.prefillMyPlayer;
    if (!raw) return;
    try {
      const pre = JSON.parse(String(raw));
      if (!pre || !pre.full_name) return;
      const offerKey = isHost ? 'hostOffer' : 'guestOffer';
      const current = room[offerKey] || [];
      const alreadyThere = current.some((p: any) => getPlayerKey(p) === getPlayerKey(pre));
      if (alreadyThere) return;
      if (current.length >= MAX_PER_SIDE) return;
      updateDoc(doc(db, 'leagues', leagueId, 'trade_rooms', roomId), {
        [offerKey]: [...current, pre],
        updatedAt: serverTimestamp(),
      });
    } catch (e) { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!room, params.prefillMyPlayer]);

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
  const withEffectiveSalaries = (players: any[]) => (players || []).map((player: any) => ({
    ...player,
    salary: getEffectiveSalary(player, overridesMap),
  }));

  const checkSalaryBalance = () => {
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
  const myPicksKey = isHost ? 'hostPicks' : 'guestPicks';
  const otherPicksKey = isHost ? 'guestPicks' : 'hostPicks';
  const myPicks = room[myPicksKey] || [];
  const otherPicks = room[otherPicksKey] || [];
  const myConfirmed = !!room[myConfirmKey];
  const otherConfirmed = !!room[otherConfirmKey];
  const senderUid = room.senderUid;
  const isPushedToMe = (room.status === 'pushed' || room.status === 'countered') && senderUid && senderUid !== myUid;
  const isPushedByMe = (room.status === 'pushed' || room.status === 'countered') && senderUid === myUid;
  const isLive = otherPresenceFresh && room.status !== 'pushed' && room.status !== 'countered' && room.status !== 'cancelled' && room.status !== 'executed';
  const anyConfirmed = myConfirmed || otherConfirmed;
  const canEditMySide = !isPushedByMe && room.status !== 'cancelled' && room.status !== 'executed' && !anyConfirmed;
  const canEditOtherSide = !isPushedByMe && !isPushedToMe && room.status !== 'cancelled' && room.status !== 'executed' && !anyConfirmed;
  const hostRoster = withEffectiveSalaries(isHost ? myRoster : otherRoster);
  const guestRoster = withEffectiveSalaries(isHost ? otherRoster : myRoster);
  const tradeValidation = validateTrade({
    sport: leagueSport,
    teamA: { players: hostRoster, picks: isHost ? (myTeam?.picks || []) : otherTeamPicks },
    teamB: { players: guestRoster, picks: isHost ? otherTeamPicks : (myTeam?.picks || []) },
    offerA: room?.hostOffer || [],
    offerB: room?.guestOffer || [],
    pickOfferA: room?.hostPicks || [],
    pickOfferB: room?.guestPicks || [],
    teamALabel: room?.hostTeamName || 'Host team',
    teamBLabel: room?.guestTeamName || 'Guest team',
    teamACap: myTeam?.salaryCap,
    teamBCap: undefined,
    teamABudget: myTeam?.budget,
    teamBBudget: undefined,
    nbaMatchingTolerance: tradeApronTolerance,
    nbaMatchingBuffer: 100000,
    commissionerOverride: !!room?.salaryOverrideApplied || !!overrideAppliedLocal,
  });
  const userFacingTradeMessages = tradeValidation.messages.length > 0
    ? tradeValidation.messages
    : tradeValidation.valid
      ? ['This trade is ready from a salary and roster view.']
      : [];

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
      [key]: [...current, cleanForFirestore(player)],
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

  const addPickToOffer = async (side: 'mine' | 'theirs', pick: any) => {
    const key = side === 'mine' ? myPicksKey : otherPicksKey;
    const current = side === 'mine' ? myPicks : otherPicks;
    if (current.some((p: any) => p.id === pick.id)) { setPickModalSide(null); return; }

    // Stepien Rule: block offering a first-round pick if it would leave this team
    // without a first-rounder in back-to-back drafts.
    if (leagueSport === 'nba' && stepienRule && pick.round === 1) {
      const owned = side === 'mine' ? (myTeam?.picks || []) : otherTeamPicks;
      const offeredFirstIds = new Set<string>([...current.filter((p: any) => p.round === 1).map((p: any) => p.id), pick.id]);
      const remainingFirstYears = owned.filter((p: any) => p.round === 1 && !offeredFirstIds.has(p.id)).map((p: any) => p.year);
      if (stepienViolation(remainingFirstYears, draftBaseYear, DRAFT_YEARS)) {
        Alert.alert('Stepien Rule', "This league enforces the Stepien Rule — a team can't be left without a first-round pick in back-to-back drafts. Keep a first-rounder in those years, or the commissioner can turn the rule off in league settings.");
        return;
      }
    }

    await updateRoom({
      [key]: [...current, pick],
      hostConfirmed: false,
      guestConfirmed: false,
      status: isLive ? 'live' : (room.status === 'open' ? 'open' : room.status),
    });
    setPickModalSide(null);
  };

  const removePickFromOffer = async (pick: any, side: 'mine' | 'theirs') => {
    const key = side === 'mine' ? myPicksKey : otherPicksKey;
    const current = side === 'mine' ? myPicks : otherPicks;
    await updateRoom({
      [key]: current.filter((p: any) => p.id !== pick.id),
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
          const callable = httpsCallable(functions, 'updateTradeDecision');
          await callable({ leagueId, roomId, action: 'approve_override' });
        } catch (e: any) { Alert.alert('Error', e.message); }
      } },
    ]);
  };

  const denyOverride = async () => {
    Alert.alert('Deny Override?', 'The requester will be notified that this trade was not approved.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Deny', style: 'destructive', onPress: async () => {
        try {
          const callable = httpsCallable(functions, 'updateTradeDecision');
          await callable({ leagueId, roomId, action: 'deny_override' });
        } catch (e: any) { Alert.alert('Error', e.message); }
      } },
    ]);
  };

  // ── Commissioner veto controls (when tradeApprovalMode === 'veto') ──
  const approveVetoNow = () => {
    Alert.alert('Approve Trade?', 'This executes the trade now and swaps the players.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: async () => {
        try {
          await finalizeTradeRoom(room);
        } catch (e: any) {
          Alert.alert('Error', e?.message || 'Could not finalize the trade.');
        }
      } },
    ]);
  };

  const vetoTrade = () => {
    Alert.alert('Veto Trade?', 'This cancels the trade. No players move and both GMs are notified.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Veto', style: 'destructive', onPress: async () => {
        try {
          const callable = httpsCallable(functions, 'updateTradeDecision');
          await callable({ leagueId, roomId, action: 'veto_trade' });
        } catch (e: any) { Alert.alert('Error', e.message); }
      } },
    ]);
  };

  // ── League-vote: an eligible GM casts their approve/reject vote ──
  const castTradeVote = async (choice: 'approve' | 'reject') => {
    try {
      const callable = httpsCallable(functions, 'updateTradeDecision');
      await callable({ leagueId, roomId, action: 'cast_vote', choice });
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleConfirm = async () => {
    const protectedErrors = tradeValidation.errors.filter(error => error !== 'nba_matching' && error !== 'financial_limit');
    if (protectedErrors.length > 0) {
      Alert.alert('Trade cannot be sent', tradeValidation.messages.join('\n') || 'Fix the trade issues and try again.');
      return;
    }
    if (leagueSport === 'nba' && tradeValidation.errors.includes('nba_matching') && !overrideAppliedLocal && !(room?.salaryOverrideApplied)) {
      const body = (tradeValidation.messages.length > 0 ? tradeValidation.messages : [
        myShortfall > 0 ? 'Your side needs ~$' + (myShortfall / 1000000).toFixed(1) + 'M more outgoing' : '',
        otherShortfall > 0 ? 'Their side needs ~$' + (otherShortfall / 1000000).toFixed(1) + 'M more outgoing' : '',
      ].filter(Boolean)).join('\n') + '\n\n(Both sides must satisfy the NBA salary-matching rule.)';

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
    if (myOffer.length === 0 && otherOffer.length === 0 && myPicks.length === 0 && otherPicks.length === 0) {
      Alert.alert('Empty trade', 'Add at least one player or draft pick.');
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
          // Both confirmed. If this league requires commissioner approval, hold the
          // trade for review instead of swapping immediately.
          if (tradeApprovalMode === 'veto' && data.status !== 'pending_veto') {
            tx.update(ref, {
              status: 'pending_veto',
              hostConfirmed: true,
              guestConfirmed: true,
              vetoDeadline: Date.now() + 24 * 60 * 60 * 1000,
              pendingVetoSince: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            return { pendingVeto: true };
          }
          if (tradeApprovalMode === 'vote' && data.status !== 'pending_vote') {
            tx.update(ref, {
              status: 'pending_vote',
              hostConfirmed: true,
              guestConfirmed: true,
              tradeVotes: {},
              voteDeadline: Date.now() + Math.max(1, voteDeadlineDays) * 24 * 60 * 60 * 1000,
              pendingVoteSince: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            return { pendingVote: true };
          }
          tx.update(ref, {
            hostConfirmed: true,
            guestConfirmed: true,
            updatedAt: serverTimestamp(),
          });
          return { finalize: true, trade: data };
        } else {
          tx.update(ref, { [myConfirmKey]: true, updatedAt: serverTimestamp() });
          return { executed: false };
        }
      });

      if (result?.pendingVeto) {
        // Notify commissioners that a trade is awaiting review.
        try {
          const note = {
            type: 'trade_pending_veto',
            leagueId,
            roomId,
            createdAt: new Date().toISOString(),
            message: (room?.hostTeamName || 'A team') + ' and ' + (room?.guestTeamName || 'another team') + ' agreed to a trade — review within 24h or it auto-approves.',
          };
          for (const cid of leagueCommUids) {
            if (cid === myUid) continue;
            try { await updateDoc(doc(db, 'users', cid), { notifications: arrayUnion(note) }); } catch {}
          }
        } catch {}
        Alert.alert('Sent for review', 'Both sides agreed. A commissioner has 24 hours to veto — otherwise the trade goes through automatically.', [{ text: 'OK', onPress: () => router.back() }]);
        return;
      }
      if (result?.pendingVote) {
        // Notify every GM except the two in the trade that a vote is open.
        try {
          const note = {
            type: 'trade_vote_open',
            leagueId,
            roomId,
            createdAt: new Date().toISOString(),
            message: 'A trade between ' + (room?.hostTeamName || 'a team') + ' and ' + (room?.guestTeamName || 'another team') + ' needs your vote.',
          };
          for (const uid of leagueMembers) {
            if (uid === room?.hostUid || uid === room?.guestUid) continue;
            try { await updateDoc(doc(db, 'users', uid), { notifications: arrayUnion(note) }); } catch {}
          }
        } catch {}
        Alert.alert('Out for league vote', 'Both sides agreed. The league now votes — the trade goes through if it passes the threshold, or is rejected.', [{ text: 'OK', onPress: () => router.back() }]);
        return;
      }
      if (result?.finalize) {
        localFinalizeSuccessPendingRef.current = true;
        try {
          const finalized: any = await finalizeTradeRoom(result.trade);
          if (!finalized?.executed) {
            localFinalizeSuccessPendingRef.current = false;
            return;
          }
          Alert.alert('Trade executed!', 'Players have been swapped.', [{ text: 'OK', onPress: () => {
            localFinalizeSuccessPendingRef.current = false;
            router.back();
          } }]);
        } catch (e) {
          localFinalizeSuccessPendingRef.current = false;
          throw e;
        }
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleSendOffer = async () => {
    if (myOffer.length === 0 && otherOffer.length === 0 && myPicks.length === 0 && otherPicks.length === 0) {
      Alert.alert('Empty trade', 'Add at least one player or draft pick.');
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
  else if (room.status === 'vetoed') { statusText = 'VETOED'; statusColor = '#ff4444'; }
  else if (room.status === 'rejected') { statusText = 'VOTED DOWN'; statusColor = '#ff4444'; }
  else if (room.status === 'pending_veto') { statusText = 'PENDING REVIEW'; statusColor = '#F5A623'; }
  else if (room.status === 'pending_vote' || room.status === 'vote_passed') { statusText = 'LEAGUE VOTE'; statusColor = '#F5A623'; }
  else if (isPushedToMe) { statusText = 'OFFER RECEIVED'; statusColor = '#F5A623'; }
  else if (isPushedByMe) { statusText = 'OFFER SENT — WAITING'; statusColor = '#F5A623'; }
  else if (isLive) { statusText = 'LIVE'; statusColor = '#00ff87'; }
  else { statusText = 'WAITING FOR OPPONENT'; statusColor = '#888'; }

  const isTerminal = room.status === 'executed' || room.status === 'cancelled' || room.status === 'vetoed' || room.status === 'rejected';
  const isPendingVeto = room.status === 'pending_veto';
  const isCommish = leagueCommUids.includes(myUid || '');
  const vetoHoursLeft = isPendingVeto && room.vetoDeadline
    ? Math.max(0, Math.ceil((room.vetoDeadline - Date.now()) / (60 * 60 * 1000)))
    : 0;

  // ── League-vote derived values ──
  const isPendingVote = room.status === 'pending_vote';
  const voteParticipants = [room.hostUid, room.guestUid];
  const voteEligible = leagueMembers.filter(m => !voteParticipants.includes(m));
  const voteE = voteEligible.length;
  const tradeVotes = room.tradeVotes || {};
  const voteApprove = voteEligible.filter(m => tradeVotes[m] === 'approve').length;
  const voteReject = voteEligible.filter(m => tradeVotes[m] === 'reject').length;
  const voteNeedToPass = votePassThreshold === 'unanimous' ? voteE
    : votePassThreshold === 'two_thirds' ? Math.ceil((voteE * 2) / 3)
    : Math.floor(voteE / 2) + 1;
  const myTradeVote = tradeVotes[myUid || ''];
  const isEligibleVoter = leagueMembers.includes(myUid || '') && myUid !== room.hostUid && myUid !== room.guestUid;
  const voteDaysLeft = isPendingVote && room.voteDeadline
    ? Math.max(0, Math.ceil((room.voteDeadline - Date.now()) / (24 * 60 * 60 * 1000)))
    : 0;

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

      {isPendingVeto && (
        <View style={styles.vetoBanner}>
          <Text style={styles.vetoBannerTitle}>⏳ Awaiting Commissioner Review</Text>
          <Text style={styles.vetoBannerText}>
            Both GMs agreed. {isCommish
              ? 'Approve it now, or veto to cancel.'
              : 'A commissioner can veto within ' + vetoHoursLeft + 'h — otherwise it goes through automatically.'}
          </Text>
          {isCommish && (
            <View style={styles.vetoBtnRow}>
              <TouchableOpacity style={styles.vetoApproveBtn} onPress={approveVetoNow}>
                <Text style={styles.vetoApproveText}>✓ Approve Now</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.vetoKillBtn} onPress={vetoTrade}>
                <Text style={styles.vetoKillText}>⛔ Veto</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {(isPendingVote || room.status === 'vote_passed') && (
        <View style={styles.vetoBanner}>
          <Text style={styles.vetoBannerTitle}>🗳️ League Vote {room.status === 'vote_passed' ? '— Passed' : 'In Progress'}</Text>
          <Text style={styles.vetoBannerText}>
            {voteApprove} approve · {voteReject} reject — needs {voteNeedToPass} of {voteE} to pass
            {isPendingVote ? ' · ' + voteDaysLeft + 'd left' : ''}
          </Text>
          {isPendingVote && isEligibleVoter && (
            <View style={styles.vetoBtnRow}>
              <TouchableOpacity
                style={[styles.vetoApproveBtn, myTradeVote === 'approve' && { opacity: 0.6 }]}
                onPress={() => castTradeVote('approve')}
              >
                <Text style={styles.vetoApproveText}>{myTradeVote === 'approve' ? '✓ Approved' : '✓ Approve'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.vetoKillBtn, myTradeVote === 'reject' && { opacity: 0.6 }]}
                onPress={() => castTradeVote('reject')}
              >
                <Text style={styles.vetoKillText}>{myTradeVote === 'reject' ? '⛔ Rejected' : '⛔ Reject'}</Text>
              </TouchableOpacity>
            </View>
          )}
          {isPendingVote && !isEligibleVoter && (
            <Text style={styles.vetoBannerSub}>{"You're in this trade — the rest of the league decides."}</Text>
          )}
        </View>
      )}

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
                sport={leagueSport}
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
          {otherPicks.map((pk: any) => (
            <View key={pk.id} style={styles.pickChip}>
              <Text style={styles.pickChipText}>🎟️ {pickLabel(pk)}</Text>
              {canEditOtherSide ? (
                <TouchableOpacity onPress={() => removePickFromOffer(pk, 'theirs')}><Text style={styles.pickChipX}>✕</Text></TouchableOpacity>
              ) : null}
            </View>
          ))}
          {canEditOtherSide ? (
            <TouchableOpacity style={styles.addPickBtn} onPress={() => { setPickModalSide('theirs'); setPickRound(1); setPickYear(''); setPickProtection(''); }}>
              <Text style={styles.addPickBtnText}>+ ADD PICK</Text>
            </TouchableOpacity>
          ) : null}
          {otherConfirmed ? <Text style={styles.confirmBadge}>✓ CONFIRMED</Text> : null}
          {otherOffer.length > 0 && sumSalary(otherOffer) > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>OUT</Text>
              <Text style={styles.totalValue}>{fmtMoney(sumSalary(otherOffer))}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.divider}>
          <Text style={styles.dividerText}>━━━━ THE TABLE ━━━━</Text>
        </View>

        {isLive && !isTerminal && (
          <View style={styles.tableChat}>
            {(room.chat || []).slice(-4).map((m: any, i: number) => (
              <View key={i} style={[styles.chatMsg, m.uid === myUid ? styles.chatMsgMine : styles.chatMsgTheirs]}>
                <Text style={styles.chatMsgText}>{m.text}</Text>
              </View>
            ))}
            <View style={styles.chatInputRow}>
              <TextInput
                value={chatInput}
                onChangeText={setChatInput}
                placeholder='Pass a note across the table...'
                placeholderTextColor='#555'
                style={styles.chatInput}
                maxLength={140}
                editable={!chatSending}
              />
              <TouchableOpacity
                style={[styles.chatSendBtn, (!chatInput.trim() || chatSending) && { opacity: 0.4 }]}
                disabled={!chatInput.trim() || chatSending}
                onPress={async () => {
                  const text = chatInput.trim();
                  if (!text) return;
                  setChatSending(true);
                  try {
                    const existing = room.chat || [];
                    const newChat = [...existing, { uid: myUid, text, ts: Date.now() }].slice(-4);
                    await updateDoc(doc(db, 'leagues', leagueId, 'trade_rooms', roomId), {
                      chat: newChat,
                      updatedAt: serverTimestamp(),
                    });
                    setChatInput('');
                  } catch (e: any) {
                    Alert.alert('Send failed', e.message);
                  } finally {
                    setChatSending(false);
                  }
                }}
              >
                <Text style={styles.chatSendText}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

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
                sport={leagueSport}
                onRemove={canEditMySide ? () => removePlayerFromOffer(p, 'mine') : undefined}
                overrides={overridesMap}
              />
            ))
          )}
          {myOffer.length > 0 && sumSalary(myOffer) > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>OUT</Text>
              <Text style={styles.totalValue}>{fmtMoney(sumSalary(myOffer))}</Text>
            </View>
          ) : null}
          {leagueSport === 'nba' && !salaryCheck.skipped ? (
            <View style={[styles.balanceRow, { backgroundColor: tradeValidation.valid ? '#0a2a1a' : '#2a0a0a', borderColor: tradeValidation.valid ? '#00ff87' : '#ff4444' }]}>
              <Text style={[styles.balanceText, { color: tradeValidation.valid ? '#00ff87' : '#ff4444' }]}>
                {room?.salaryOverrideApplied
                  && tradeValidation.valid
                  ? '✓ Commissioner override approved — salary check bypassed'
                  : tradeValidation.valid
                    ? '✓ Salary check OK (' + (tradeApronTolerance * 100).toFixed(0) + '% rule)'
                    : '✗ ' + (userFacingTradeMessages[0] || 'Salary mismatch')}
              </Text>
              {!tradeValidation.valid && userFacingTradeMessages.slice(1).map((message, index) => (
                <Text key={index} style={styles.balanceHelpText}>{message}</Text>
              ))}
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
          {myPicks.map((pk: any) => (
            <View key={pk.id} style={styles.pickChip}>
              <Text style={styles.pickChipText}>🎟️ {pickLabel(pk)}</Text>
              {canEditMySide ? (
                <TouchableOpacity onPress={() => removePickFromOffer(pk, 'mine')}><Text style={styles.pickChipX}>✕</Text></TouchableOpacity>
              ) : null}
            </View>
          ))}
          {canEditMySide ? (
            <TouchableOpacity style={styles.addPickBtn} onPress={() => { setPickModalSide('mine'); setPickRound(1); setPickYear(''); setPickProtection(''); }}>
              <Text style={styles.addPickBtnText}>+ ADD PICK</Text>
            </TouchableOpacity>
          ) : null}
          {myConfirmed ? <Text style={styles.confirmBadge}>✓ CONFIRMED</Text> : null}
        </View>
      </ScrollView>

      {/* Footer CTAs */}
      <View style={styles.footer}>
        {isTerminal ? (
          <Text style={styles.footerNote}>
            {room.status === 'executed' ? 'Trade complete.'
              : room.status === 'vetoed' ? 'Vetoed by commissioner.'
              : room.status === 'rejected' ? 'Voted down by the league.'
              : 'Room closed.'}
          </Text>
        ) : isPendingVeto ? (
          <Text style={styles.footerNote}>
            {isCommish ? 'Use the review controls above.' : 'Pending commissioner review — auto-approves in ~' + vetoHoursLeft + 'h.'}
          </Text>
        ) : isPendingVote || room.status === 'vote_passed' ? (
          <Text style={styles.footerNote}>
            {room.status === 'vote_passed' ? 'Vote passed — finalizing…' : isEligibleVoter ? 'Cast your vote above.' : 'Out for league vote (' + voteDaysLeft + 'd left).'}
          </Text>
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
              <TouchableOpacity style={[styles.ctaBtn, styles.ctaAccept, !isLive && { opacity: 0.4 }]} onPress={handleConfirm} disabled={!isLive}>
                <Text style={styles.ctaAcceptText}>Confirm</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (myOffer.length > 0 && otherOffer.length > 0) ? (
          <View style={styles.footerRow}>
            <TouchableOpacity style={[styles.ctaBtn, styles.ctaAccept, !isLive && { opacity: 0.4 }]} onPress={handleConfirm} disabled={!isLive}>
              <Text style={styles.ctaAcceptText}>Confirm</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.ctaBtn, styles.ctaCounter]} onPress={handleSendOffer}>
              <Text style={styles.ctaCounterText}>Send Offer</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.footerRow}>
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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.positionFilterScroll} contentContainerStyle={styles.positionFilterContent}>
            <View style={styles.positionFilters}>
              {positionFilters.map(pos => (
                <TouchableOpacity
                  key={pos}
                  style={[styles.positionFilterBtn, theirPickerPosFilter === pos && styles.positionFilterBtnActive]}
                  onPress={() => setTheirPickerPosFilter(pos)}
                >
                  <Text
                    style={[styles.positionFilterText, theirPickerPosFilter === pos && styles.positionFilterTextActive]}
                    numberOfLines={1}
                    allowFontScaling={false}
                  >
                    {positionFilterLabel(pos)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          <ScrollView contentContainerStyle={styles.modalBody}>
            {otherRoster.length === 0 ? (
              <Text style={styles.emptySide}>Opponent roster not loaded</Text>
            ) : otherRoster
              .filter((p: any) => matchesRosterPosition(p, theirPickerPosFilter))
              .sort(compareRosterPlayersByValue)
              .map((p: any, i: number) => {
              const key = getPlayerKey(p);
              const onTable = otherOffer.some((mp: any) => getPlayerKey(mp) === key);
              const lockedElsewhere = theirLockedKeys.has(key);
              const isUntouchable = otherUntouchables.includes(key);
              const disabled = onTable || isUntouchable;
              const statusLabels = [
                onTable ? { label: 'On Table', tone: 'good' as const } : null,
                isUntouchable && !onTable ? { label: 'Untouchable', tone: 'danger' as const } : null,
                lockedElsewhere && !onTable && !isUntouchable ? { label: 'In Another Trade', tone: 'warn' as const } : null,
              ].filter(Boolean) as { label: string; tone: 'good' | 'warn' | 'danger' }[];
              return (
                <TradePickerPlayerRow
                  key={key + i}
                  player={p}
                  index={i}
                  sport={leagueSport}
                  era={leagueEra}
                  currentYear={currentYear}
                  leagueDate={leagueDate}
                  overrides={overridesMap}
                  disabled={disabled}
                  statusLabels={statusLabels}
                  onPress={() => { addPlayerToOffer(p, 'theirs'); }}
                />
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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.positionFilterScroll} contentContainerStyle={styles.positionFilterContent}>
            <View style={styles.positionFilters}>
              {positionFilters.map(pos => (
                <TouchableOpacity
                  key={pos}
                  style={[styles.positionFilterBtn, myPickerPosFilter === pos && styles.positionFilterBtnActive]}
                  onPress={() => setMyPickerPosFilter(pos)}
                >
                  <Text
                    style={[styles.positionFilterText, myPickerPosFilter === pos && styles.positionFilterTextActive]}
                    numberOfLines={1}
                    allowFontScaling={false}
                  >
                    {positionFilterLabel(pos)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          <ScrollView contentContainerStyle={styles.modalBody}>
            {myRoster
              .filter((p: any) => matchesRosterPosition(p, myPickerPosFilter))
              .sort(compareRosterPlayersByValue)
              .map((p: any, i: number) => {
              const key = getPlayerKey(p);
              const onTable = myOffer.some((mp: any) => getPlayerKey(mp) === key);
              const lockedElsewhere = lockedPlayerKeys.has(key);
              const disabled = onTable;
              const statusLabels = [
                onTable ? { label: 'On Table', tone: 'good' as const } : null,
                lockedElsewhere && !onTable ? { label: 'In Another Trade', tone: 'warn' as const } : null,
              ].filter(Boolean) as { label: string; tone: 'good' | 'warn' | 'danger' }[];
              return (
                <TradePickerPlayerRow
                  key={key + i}
                  player={p}
                  index={i}
                  sport={leagueSport}
                  era={leagueEra}
                  currentYear={currentYear}
                  leagueDate={leagueDate}
                  overrides={overridesMap}
                  disabled={disabled}
                  statusLabels={statusLabels}
                  onPress={() => { addPlayerToOffer(p, 'mine'); }}
                />
              );
            })}
          </ScrollView>
        </View>
      </Modal>

      {/* Draft pick composer */}
      <Modal visible={!!pickModalSide} animationType='slide' presentationStyle='pageSheet' onRequestClose={() => setPickModalSide(null)}>
        <View style={styles.pickModal}>
          <View style={styles.pickModalHeader}>
            <TouchableOpacity onPress={() => setPickModalSide(null)}><Text style={styles.pickModalCancel}>Cancel</Text></TouchableOpacity>
            <Text style={styles.pickModalTitle}>Add Draft Pick</Text>
            <View style={{ width: 60 }} />
          </View>
          <View style={styles.pickModalBody}>
            <Text style={styles.pickModalWho}>
              {`${pickModalSide === 'mine' ? (myTeam?.name || 'Your team') : otherTeamName}'s available picks`}
            </Text>
            {(() => {
              const owned = (pickModalSide === 'mine' ? (myTeam?.picks || []) : otherTeamPicks);
              const inOffer = new Set((pickModalSide === 'mine' ? myPicks : otherPicks).map((p: any) => p.id));
              const available = owned
                .filter((pk: any) => !inOffer.has(pk.id))
                .sort((a: any, b: any) => (a.year - b.year) || (a.round - b.round));
              if (available.length === 0) {
                return <Text style={styles.pickEmpty}>No tradeable picks available.</Text>;
              }
              return (
                <ScrollView style={{ marginTop: 8 }}>
                  {available.map((pk: any) => (
                    <TouchableOpacity
                      key={pk.id}
                      style={styles.pickOwnedRow}
                      onPress={() => addPickToOffer(pickModalSide === 'mine' ? 'mine' : 'theirs', pk)}
                    >
                      <Text style={styles.pickOwnedLabel}>🎟️ {pickLabel(pk)}</Text>
                      {pk.originalTeam && pk.originalTeam !== (pickModalSide === 'mine' ? myTeam?.abbreviation : undefined)
                        ? <Text style={styles.pickOwnedOrigin}>via {pk.originalTeam}</Text> : null}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              );
            })()}
          </View>
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
  pickEmpty: { color: '#666', fontSize: 14, textAlign: 'center', marginTop: 30 },
  pickOwnedRow: { backgroundColor: '#101c14', borderWidth: 1, borderColor: '#1f5f3a', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 8 },
  pickOwnedLabel: { color: '#00ff87', fontSize: 15, fontWeight: '700' },
  pickOwnedOrigin: { color: '#6a6a6a', fontSize: 11, marginTop: 3 },

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
  balanceHelpText: { color: '#ffb3b3', fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 4 },
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
  pickChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1a1530', borderRadius: 8, borderWidth: 1, borderColor: '#4a3fa0', paddingHorizontal: 12, paddingVertical: 10, marginTop: 6 },
  pickChipText: { color: '#b9b0ff', fontSize: 13, fontWeight: '700' },
  pickChipX: { color: '#ff6666', fontSize: 14, fontWeight: '800', paddingHorizontal: 6 },
  addPickBtn: { borderStyle: 'dashed', borderWidth: 1, borderColor: '#4a3fa0', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  addPickBtnText: { color: '#8b80d8', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  pickModal: { flex: 1, backgroundColor: '#0a0a12', paddingTop: 50 },
  pickModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#1a1a2a' },
  pickModalCancel: { color: '#ff6666', fontSize: 15, fontWeight: '700', width: 60 },
  pickModalTitle: { color: '#fff', fontSize: 17, fontWeight: '800', flex: 1, textAlign: 'center' },
  pickModalBody: { padding: 20, gap: 8 },
  pickModalWho: { color: '#8b80d8', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  pickFieldLabel: { color: '#888', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginTop: 10, marginBottom: 4 },
  roundRow: { flexDirection: 'row', gap: 10 },
  roundBtn: { flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 10, backgroundColor: '#15151f', borderWidth: 1, borderColor: '#2a2a3a' },
  roundBtnActive: { backgroundColor: '#1a1530', borderColor: '#4a3fa0' },
  roundBtnText: { color: '#777', fontSize: 14, fontWeight: '700' },
  roundBtnTextActive: { color: '#b9b0ff' },
  pickInput: { backgroundColor: '#15151f', borderRadius: 10, padding: 14, color: '#fff', fontSize: 15, borderWidth: 1, borderColor: '#2a2a3a' },
  pickAddConfirm: { backgroundColor: '#4a3fa0', borderRadius: 10, paddingVertical: 15, alignItems: 'center', marginTop: 24 },
  pickAddConfirmText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  confirmBadge: { color: '#00ff87', fontSize: 11, fontWeight: '800', letterSpacing: 1, textAlign: 'center', marginTop: 4 },

  footer: { position: 'absolute', bottom: 80, left: 0, right: 0, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#0a0a0a', borderTopWidth: 1, borderTopColor: '#1a1a1a' },
  footerRow: { flexDirection: 'row', gap: 8 },
  tableChat: { paddingHorizontal: 12, paddingVertical: 12, marginVertical: 8, marginHorizontal: 16, backgroundColor: '#0a0a0a', borderRadius: 12, borderWidth: 1, borderColor: '#1a1a1a', gap: 6 },
  chatMsg: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 12, maxWidth: '80%' },
  chatMsgMine: { backgroundColor: '#00ff8722', alignSelf: 'flex-end', borderColor: '#00ff87', borderWidth: 1 },
  chatMsgTheirs: { backgroundColor: '#1a1a1a', alignSelf: 'flex-start', borderColor: '#2a2a2a', borderWidth: 1 },
  chatMsgText: { color: '#ddd', fontSize: 13 },
  chatInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  chatInput: { flex: 1, backgroundColor: '#1a1a1a', color: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, borderWidth: 1, borderColor: '#2a2a2a' },
  chatSendBtn: { backgroundColor: '#00ff87', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  chatSendText: { color: '#000', fontWeight: '700', fontSize: 13 },
  footerNote: { color: '#666', fontSize: 13, textAlign: 'center', paddingVertical: 8 },
  vetoBanner: { backgroundColor: '#2a1f00', borderWidth: 1, borderColor: '#F5A623', borderRadius: 12, marginHorizontal: 16, marginBottom: 8, padding: 14 },
  vetoBannerTitle: { color: '#F5A623', fontSize: 14, fontWeight: '800', marginBottom: 4 },
  vetoBannerText: { color: '#d8c08a', fontSize: 12, lineHeight: 17 },
  vetoBannerSub: { color: '#9a8a5a', fontSize: 11, marginTop: 8, fontStyle: 'italic' },
  vetoBtnRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  vetoApproveBtn: { flex: 1, backgroundColor: '#00ff87', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  vetoApproveText: { color: '#000', fontSize: 14, fontWeight: '800' },
  vetoKillBtn: { flex: 1, backgroundColor: '#2a0a0a', borderWidth: 1, borderColor: '#ff4444', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  vetoKillText: { color: '#ff4444', fontSize: 14, fontWeight: '800' },

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
  positionFilterScroll: { backgroundColor: '#0a0a0a', borderBottomWidth: 1, borderBottomColor: '#141414' },
  positionFilterContent: { paddingHorizontal: 20, paddingVertical: 10 },
  positionFilters: { flexDirection: 'row', gap: 8 },
  positionFilterBtn: { minWidth: 62, height: 38, paddingHorizontal: 14, borderRadius: 999, backgroundColor: '#141414', borderWidth: 1, borderColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  positionFilterBtnActive: { backgroundColor: '#092817', borderColor: '#00ff87' },
  positionFilterText: { color: '#777', fontSize: 12, lineHeight: 14, fontWeight: '900', textAlign: 'center', letterSpacing: 0, flexShrink: 0 },
  positionFilterTextActive: { color: '#00ff87' },
  modalBody: { padding: 16, paddingBottom: 60 },
  tradePickerCard: { position: 'relative', overflow: 'hidden', flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', borderRadius: 12, padding: 12, paddingLeft: 14, marginBottom: 10, borderWidth: 1, borderColor: '#242424', gap: 10 },
  tradePickerAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  tradePickerRank: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#1d1d1d', alignItems: 'center', justifyContent: 'center' },
  tradePickerRankText: { color: '#777', fontSize: 12, fontWeight: '900' },
  tradePickerPhoto: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, backgroundColor: '#0a0a0a' },
  tradePickerPhotoFallback: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  tradePickerInitial: { color: '#888', fontSize: 18, fontWeight: '900' },
  tradePickerInfo: { flex: 1, minWidth: 0 },
  tradePickerHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  tradePickerPos: { fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  tradePickerTier: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, maxWidth: 130 },
  tradePickerTierText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.3 },
  tradePickerName: { color: '#fff', fontSize: 15, fontWeight: '900' },
  tradePickerSalary: { color: '#00ff87', fontSize: 12, fontWeight: '800', marginTop: 2 },
  tradePickerGrades: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 },
  tradeGradePill: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, gap: 4 },
  tradeGradeLabel: { fontSize: 9, fontWeight: '900' },
  tradeGradeValue: { fontSize: 11, fontWeight: '900' },
  tradePickerStatusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 7 },
  tradePickerStatus: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5, textTransform: 'uppercase' },
  tradePickerStatusGood: { color: '#00ff87' },
  tradePickerStatusWarn: { color: '#F5A623' },
  tradePickerStatusDanger: { color: '#ff6464' },
  tradePickerAdd: { color: '#00ff87', fontSize: 12, fontWeight: '900', letterSpacing: 0.5, paddingHorizontal: 2 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: '#2a2a2a', gap: 10 },
  pickerRowDisabled: { opacity: 0.4 },
  pickerPos: { color: '#888', fontSize: 11, fontWeight: '700', width: 28 },
  pickerName: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },
  pickerTag: { color: '#00ff87', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  pickerTagWarn: { color: '#F5A623', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
});
