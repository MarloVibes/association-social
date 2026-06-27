import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import GlobalNav from '@/components/GlobalNav';
import { auth, db, functions } from '@/constants/firebase';

type League = {
  name?: string;
  mode?: string;
  currentYear?: number;
  draftSeasonYear?: number;
  draftStatus?: string;
  commissionerId?: string;
  coCommissioners?: string[];
  members?: string[];
  offseason?: {
    stage?: string;
    seasonYear?: number;
    draftStatus?: string;
  };
};

type Team = {
  id: string;
  name?: string;
  abbreviation?: string;
  gmId?: string;
  draftBoard?: string[];
  preDraftList?: string[];
};

type Prospect = {
  id?: string;
  player_id?: string;
  full_name?: string;
  name?: string;
  position?: string;
  projectedRound?: number;
  archetype?: string;
  potential?: number;
};

type DraftSession = {
  status: 'live' | 'complete';
  currentOverallPick: number;
  currentTeamId: string | null;
  round: number;
  deadlineMillis: number | null;
  selectedIds: string[];
  picks: {
    overall: number;
    round: number;
    teamId: string;
    prospectId: string;
    prospect: Prospect;
    selectionType: 'manual' | 'auto';
  }[];
  version: number;
  totalPicks: number;
};

function prospectId(prospect: Prospect): string {
  return String(prospect.id || prospect.player_id || '');
}

function prospectName(prospect: Prospect): string {
  return prospect.full_name || prospect.name || 'Unnamed prospect';
}

export default function LiveDraftScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const router = useRouter();
  const uid = auth.currentUser?.uid;
  const [league, setLeague] = useState<League | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [session, setSession] = useState<DraftSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [boardIds, setBoardIds] = useState<string[]>([]);
  const [clockNow, setClockNow] = useState(Date.now());
  const lastAutoPickKey = useRef('');

  useEffect(() => {
    const timer = setInterval(() => setClockNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!leagueId) return;
    const unsubscribeLeague = onSnapshot(doc(db, 'leagues', leagueId), snapshot => {
      if (!snapshot.exists()) {
        router.back();
        return;
      }
      setLeague(snapshot.data() as League);
      setLoading(false);
    });
    const unsubscribeTeams = onSnapshot(
      collection(db, 'leagues', leagueId, 'teams'),
      snapshot => setTeams(snapshot.docs.map(team => ({
        id: team.id,
        ...team.data(),
      })) as Team[]),
    );
    return () => {
      unsubscribeLeague();
      unsubscribeTeams();
    };
  }, [leagueId, router]);

  const seasonYear = league?.offseason?.seasonYear || league?.draftSeasonYear || league?.currentYear;
  const draftTitle = league?.mode === 'draft' ? 'Fantasy Draft' : `${seasonYear || ''} Live Draft`;
  useEffect(() => {
    if (!leagueId || !seasonYear) return;
    const unsubscribeClass = onSnapshot(
      doc(db, 'leagues', leagueId, 'draft_classes', String(seasonYear)),
      snapshot => setProspects(snapshot.exists() ? snapshot.data().players || [] : []),
    );
    const unsubscribeSession = onSnapshot(
      doc(db, 'leagues', leagueId, 'draft_sessions', String(seasonYear)),
      snapshot => setSession(snapshot.exists() ? snapshot.data() as DraftSession : null),
    );
    return () => {
      unsubscribeClass();
      unsubscribeSession();
    };
  }, [leagueId, seasonYear]);

  const isCommissioner = Boolean(
    uid
    && (
      league?.commissionerId === uid
      || (league?.coCommissioners || []).includes(uid)
    ),
  );
  const currentTeam = teams.find(team => team.id === session?.currentTeamId);
  const myTeam = teams.find(team => team.gmId === uid);
  const isCurrentGm = Boolean(uid && currentTeam?.gmId === uid);
  const secondsRemaining = session?.deadlineMillis == null
    ? 0
    : Math.max(0, Math.ceil((session.deadlineMillis - clockNow) / 1000));
  const canAutoPick = Boolean(
    session?.status === 'live'
    && (
      isCommissioner
      || !currentTeam?.gmId
      || secondsRemaining === 0
    ),
  );
  const selected = useMemo(() => new Set(session?.selectedIds || []), [session?.selectedIds]);
  const boardSet = useMemo(() => new Set(boardIds), [boardIds]);
  const availableProspects = useMemo(
    () => prospects
      .filter(prospect => !selected.has(prospectId(prospect)))
      .sort((left, right) => (
        Number(left.projectedRound || 99) - Number(right.projectedRound || 99)
        || prospectName(left).localeCompare(prospectName(right))
      )),
    [prospects, selected],
  );
  const boardProspects = useMemo(
    () => boardIds
      .map(id => prospects.find(prospect => prospectId(prospect) === id))
      .filter((prospect): prospect is Prospect => Boolean(prospect))
      .filter(prospect => !selected.has(prospectId(prospect))),
    [boardIds, prospects, selected],
  );

  useEffect(() => {
    if (!myTeam) return;
    setBoardIds([...(myTeam.draftBoard || myTeam.preDraftList || [])]);
  }, [myTeam?.id, JSON.stringify(myTeam?.draftBoard || myTeam?.preDraftList || [])]);

  const callDraftAction = async (name: string, data: Record<string, unknown>) => {
    if (!leagueId) return;
    setWorking(true);
    try {
      const callable = httpsCallable(functions, name);
      await callable({ leagueId, ...data });
    } catch (error: any) {
      Alert.alert('Draft action failed', error.message || 'The draft changed. Please try again.');
    } finally {
      setWorking(false);
    }
  };

  const initialize = () => callDraftAction('initializeLiveDraft', {});

  const selectProspect = (prospect: Prospect) => {
    if (!session || !isCurrentGm || secondsRemaining === 0) return;
    Alert.alert(
      `Draft ${prospectName(prospect)}?`,
      `${prospect.position || 'Prospect'} · Projected round ${prospect.projectedRound || '-'}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Make Pick',
          onPress: () => callDraftAction('makeDraftPick', {
            prospectId: prospectId(prospect),
            expectedPickNumber: session.currentOverallPick,
            expectedVersion: session.version,
          }),
        },
      ],
    );
  };

  const autoPick = () => {
    if (!session || !canAutoPick) return;
    callDraftAction('autoPickDraftSelection', {
      expectedPickNumber: session.currentOverallPick,
      expectedVersion: session.version,
    });
  };

  useEffect(() => {
    if (!session || session.status !== 'live' || working || !canAutoPick) return;
    if (currentTeam?.gmId && secondsRemaining > 0) return;
    const key = `${session.currentOverallPick}:${session.version}`;
    if (lastAutoPickKey.current === key) return;
    lastAutoPickKey.current = key;
    callDraftAction('autoPickDraftSelection', {
      expectedPickNumber: session.currentOverallPick,
      expectedVersion: session.version,
    });
  }, [session?.currentOverallPick, session?.version, session?.status, canAutoPick, currentTeam?.gmId, secondsRemaining, working]);

  const toggleBoardProspect = (prospect: Prospect) => {
    const id = prospectId(prospect);
    if (!id || selected.has(id)) return;
    setBoardIds(current => (
      current.includes(id)
        ? current.filter(item => item !== id)
        : [...current, id]
    ));
  };

  const saveBoard = async () => {
    if (!leagueId || !myTeam) return;
    setWorking(true);
    try {
      const callable = httpsCallable(functions, 'saveDraftBoard');
      await callable({ leagueId, prospectIds: boardIds });
    } catch (error: any) {
      Alert.alert('Draft list not saved', error.message || 'Please try again.');
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator color="#00e58b" size="large" /></View>;
  }

  const header = (
    <>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons color="#ffffff" name="chevron-back" size={24} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>{league?.name || 'League'}</Text>
          <Text style={styles.title}>{draftTitle}</Text>
        </View>
        <View style={styles.iconButton} />
      </View>

      {!session ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Draft room not open</Text>
          <Text style={styles.emptyText}>
            {isCommissioner
              ? league?.mode === 'draft'
                ? 'Open the draft room when every GM has claimed a team. CPU teams will auto-pick.'
                : 'Initialize the published class when every GM is ready.'
              : 'Waiting for a commissioner to open the draft room.'}
          </Text>
          {isCommissioner && (
            <TouchableOpacity disabled={working} onPress={initialize} style={styles.primaryButton}>
              <Text style={styles.primaryText}>Open Draft Room</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <>
          <View style={styles.draftStatus}>
            <View>
              <Text style={styles.pickLabel}>
                {session.status === 'complete'
                  ? 'DRAFT COMPLETE'
                  : `ROUND ${session.round} · PICK ${session.currentOverallPick} OF ${session.totalPicks}`}
              </Text>
              <Text style={styles.teamName}>
                {session.status === 'complete'
                  ? `${session.picks.length} selections recorded`
                  : currentTeam?.name || currentTeam?.abbreviation || 'Current Team'}
              </Text>
              {session.status === 'live' && (
                <Text style={styles.gmStatus}>
                  {currentTeam?.gmId ? (isCurrentGm ? 'Your pick' : 'GM on the clock') : 'Vacant team · auto-pick'}
                </Text>
              )}
            </View>
            {session.status === 'live' && (
              <View style={[styles.clock, secondsRemaining <= 10 && styles.clockUrgent]}>
                <Text style={[styles.clockText, secondsRemaining <= 10 && styles.clockTextUrgent]}>
                  {Math.floor(secondsRemaining / 60)}:{String(secondsRemaining % 60).padStart(2, '0')}
                </Text>
              </View>
            )}
          </View>

          {canAutoPick && (
            <TouchableOpacity disabled={working} onPress={autoPick} style={styles.autoButton}>
              <Ionicons color="#f4b942" name="flash" size={18} />
              <Text style={styles.autoText}>
                {isCommissioner && secondsRemaining > 0 && currentTeam?.gmId
                  ? 'Commissioner Auto-Pick'
                  : 'Run Auto-Pick'}
              </Text>
            </TouchableOpacity>
          )}

          {session.picks.length > 0 && (
            <View style={styles.history}>
              <Text style={styles.sectionTitle}>Recent picks</Text>
              {session.picks.slice(-5).reverse().map(pick => {
                const team = teams.find(item => item.id === pick.teamId);
                return (
                  <View key={pick.overall} style={styles.historyRow}>
                    <Text style={styles.historyNumber}>#{pick.overall}</Text>
                    <Text style={styles.historyPlayer}>{prospectName(pick.prospect)}</Text>
                    <Text style={styles.historyTeam}>{team?.abbreviation || team?.name || pick.teamId}</Text>
                  </View>
                );
              })}
            </View>
          )}

          {myTeam && (
            <View style={styles.board}>
              <View style={styles.boardTop}>
                <View>
                  <Text style={styles.sectionTitle}>My Draft List</Text>
                  <Text style={styles.boardMeta}>{boardProspects.length} queued for auto-draft</Text>
                </View>
                <TouchableOpacity disabled={working} onPress={saveBoard} style={styles.saveBoardButton}>
                  <Text style={styles.saveBoardText}>Save</Text>
                </TouchableOpacity>
              </View>
              {boardProspects.length === 0 ? (
                <Text style={styles.boardEmpty}>Tap prospects below to build your auto-draft list.</Text>
              ) : boardProspects.slice(0, 8).map((prospect, index) => (
                <View key={prospectId(prospect)} style={styles.boardRow}>
                  <Text style={styles.boardRank}>{index + 1}</Text>
                  <Text style={styles.boardName} numberOfLines={1}>{prospectName(prospect)}</Text>
                  <TouchableOpacity onPress={() => toggleBoardProspect(prospect)} style={styles.boardRemove}>
                    <Ionicons color="#d86d6d" name="close" size={17} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <View style={styles.boardHeader}>
            <Text style={styles.sectionTitle}>Available prospects</Text>
            <Text style={styles.availableCount}>{availableProspects.length}</Text>
          </View>
        </>
      )}
    </>
  );

  return (
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.content}
        data={session ? availableProspects : []}
        keyExtractor={prospectId}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <TouchableOpacity
            disabled={session?.status !== 'live'}
            onPress={() => (isCurrentGm && secondsRemaining > 0 ? selectProspect(item) : toggleBoardProspect(item))}
            style={styles.prospectRow}
          >
            <View style={styles.roundBadge}>
              <Text style={styles.roundText}>R{item.projectedRound || '-'}</Text>
            </View>
            <View style={styles.prospectCopy}>
              <Text style={styles.prospectName}>{prospectName(item)}</Text>
              <Text style={styles.prospectMeta}>
                {[item.position, item.archetype, item.potential ? `POT ${item.potential}` : null]
                  .filter(Boolean).join(' · ')}
              </Text>
            </View>
            <TouchableOpacity onPress={() => toggleBoardProspect(item)} style={styles.boardToggle}>
              <Ionicons
                color={boardSet.has(prospectId(item)) ? '#f4b942' : '#69706b'}
                name={boardSet.has(prospectId(item)) ? 'bookmark' : 'bookmark-outline'}
                size={22}
              />
            </TouchableOpacity>
            {isCurrentGm && secondsRemaining > 0 && session?.status === 'live'
              ? <Ionicons color="#00e58b" name="add-circle-outline" size={22} />
              : null}
          </TouchableOpacity>
        )}
      />
      <GlobalNav />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#090b0a' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#090b0a' },
  content: { paddingBottom: 130 },
  header: {
    minHeight: 96,
    paddingTop: 42,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#242825',
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, alignItems: 'center' },
  eyebrow: { color: '#777f79', fontSize: 12, fontWeight: '600' },
  title: { color: '#ffffff', fontSize: 20, fontWeight: '800' },
  emptyState: { padding: 28, alignItems: 'center' },
  emptyTitle: { color: '#ffffff', fontSize: 21, fontWeight: '800' },
  emptyText: { color: '#7d857f', fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  primaryButton: {
    minHeight: 48,
    paddingHorizontal: 22,
    marginTop: 20,
    borderRadius: 7,
    backgroundColor: '#00e58b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#07130d', fontSize: 14, fontWeight: '800' },
  draftStatus: {
    minHeight: 112,
    paddingHorizontal: 22,
    paddingVertical: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#1d211e',
  },
  pickLabel: { color: '#00e58b', fontSize: 11, fontWeight: '800' },
  teamName: { color: '#ffffff', fontSize: 24, fontWeight: '800', marginTop: 5 },
  gmStatus: { color: '#7d857f', fontSize: 12, marginTop: 4 },
  clock: {
    minWidth: 70,
    height: 48,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#28603f',
    backgroundColor: '#12231a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clockUrgent: { borderColor: '#9d4b4b', backgroundColor: '#2c1515' },
  clockText: { color: '#00e58b', fontSize: 20, fontWeight: '800' },
  clockTextUrgent: { color: '#f27b7b' },
  autoButton: {
    margin: 16,
    minHeight: 46,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#8a6b22',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  autoText: { color: '#f4b942', fontSize: 13, fontWeight: '800' },
  history: { paddingHorizontal: 20, paddingVertical: 18, borderTopWidth: 1, borderTopColor: '#1b1f1c' },
  sectionTitle: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  historyRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 10 },
  historyNumber: { color: '#68706a', fontSize: 12, width: 30 },
  historyPlayer: { color: '#d8ddd9', fontSize: 13, flex: 1 },
  historyTeam: { color: '#8c948e', fontSize: 11, fontWeight: '700' },
  board: { paddingHorizontal: 20, paddingVertical: 18, borderTopWidth: 1, borderTopColor: '#1b1f1c', gap: 8 },
  boardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  boardMeta: { color: '#69706b', fontSize: 12, marginTop: 3 },
  saveBoardButton: { minWidth: 70, minHeight: 36, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: '#00e58b' },
  saveBoardText: { color: '#07130d', fontSize: 12, fontWeight: '900' },
  boardEmpty: { color: '#69706b', fontSize: 13, lineHeight: 18 },
  boardRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 10 },
  boardRank: { width: 24, color: '#f4b942', fontSize: 12, fontWeight: '900', textAlign: 'center' },
  boardName: { flex: 1, color: '#d8ddd9', fontSize: 13, fontWeight: '700' },
  boardRemove: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  boardHeader: {
    minHeight: 54,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#1b1f1c',
  },
  availableCount: { color: '#68706a', fontSize: 13 },
  prospectRow: {
    minHeight: 70,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1b1f1c',
  },
  roundBadge: {
    width: 38,
    height: 38,
    borderRadius: 6,
    backgroundColor: '#18251e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundText: { color: '#00e58b', fontSize: 11, fontWeight: '800' },
  prospectCopy: { flex: 1 },
  prospectName: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  prospectMeta: { color: '#69706b', fontSize: 12, marginTop: 3 },
  boardToggle: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
