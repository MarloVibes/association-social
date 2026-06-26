import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import SportTeamLogo from '@/components/SportTeamLogo';
import { auth, db, functions } from '@/constants/firebase';
import type { NbaScheduleGame } from '@/domain/nba/schedule';
import { advanceNbaCupStage, buildNbaCupSchedule, decorateScheduleGames, supportsNbaCupSchedule, type NbaScheduleParticipant } from '@/domain/nba/scheduleSetup';
import { gameMatchesMyTeam, normalizeScheduleKey, teamScheduleKeys, visibleScheduleGames, type ScheduleViewMode } from '@/domain/nba/scheduleView';
import { isMissingCallable } from '@/utils/createNbaSchedule';
import { previewNbaScheduleOwnershipRepair, repairNbaScheduleOwnershipLocally } from '@/utils/repairNbaScheduleOwnership';

type CalendarViewMode = ScheduleViewMode | 'cup';
type CalendarGame = NbaScheduleGame & {
  competition?: 'nbaCup' | 'playoffs';
  groupId?: string;
  stage?: string;
  liveTimeline?: unknown;
};

type Team = {
  id: string;
  teamId?: string;
  name?: string;
  abbreviation?: string;
  gmId?: string;
};

type ScheduleDoc = {
  games?: CalendarGame[];
  gamesPerTeam?: number;
  locked?: boolean;
  seed?: string;
  nbaCup?: {
    enabled?: boolean;
    name?: string;
    games?: CalendarGame[];
    groups?: Array<{
      id: string;
      teamIds: string[];
    }>;
    championTeamId?: string | null;
    championTeamName?: string | null;
    championTeamAbbr?: string | null;
  } | null;
  participants?: Array<{
    scheduleTeamId?: string;
    sourceTeamDocId?: string | null;
    gmId?: string | null;
    abbreviation?: string;
    name?: string;
  }>;
};

type TeamPresentation = {
  label: string;
  abbr: string;
};

type CalendarSection = {
  title: string;
  gameRange: string;
  data: CalendarGame[];
};

function cupSectionTitle(game: CalendarGame) {
  if (!game.stage || game.stage === 'group') return game.groupId || 'Group Play';
  if (game.stage === 'quarterfinal') return 'Quarterfinals';
  if (game.stage === 'semifinal') return 'Semifinals';
  if (game.stage === 'final') return 'NBA Cup Final';
  return 'NBA Cup';
}

function cupSectionOrder(title: string) {
  if (title.startsWith('Group ')) return title.charCodeAt(title.length - 1) - 64;
  if (title === 'Quarterfinals') return 20;
  if (title === 'Semifinals') return 30;
  if (title === 'NBA Cup Final') return 40;
  return 50;
}

function formatGameRange(games: CalendarGame[]) {
  const sequences = games.map(game => game.sequence).sort((a, b) => a - b);
  const first = sequences[0];
  const last = sequences[sequences.length - 1];
  if (!first) return '';
  return first === last ? `Game ${first}` : `Games ${first}-${last}`;
}

function formatFinalScore(game: CalendarGame) {
  if (game.status !== 'final' || typeof game.awayScore !== 'number' || typeof game.homeScore !== 'number') return '';
  return `${game.awayScore}-${game.homeScore}`;
}

export default function CalendarScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const router = useRouter();
  const uid = auth.currentUser?.uid;
  const [league, setLeague] = useState<any>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [schedule, setSchedule] = useState<ScheduleDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [advancingCup, setAdvancingCup] = useState(false);
  const [viewMode, setViewMode] = useState<CalendarViewMode>('mine');
  const repairAttemptedRef = useRef('');

  useEffect(() => {
    if (!leagueId) return;
    let unsubscribeSchedule: (() => void) | undefined;
    const unsubscribeLeague = onSnapshot(doc(db, 'leagues', leagueId), snapshot => {
      if (!snapshot.exists()) {
        setLoading(false);
        return;
      }
      const nextLeague = { id: snapshot.id, ...snapshot.data() } as any;
      setLeague(nextLeague);
      const scheduleId = nextLeague.scheduleId || String(nextLeague.currentYear || 2025);
      if (unsubscribeSchedule) unsubscribeSchedule();
      unsubscribeSchedule = onSnapshot(
        doc(db, 'leagues', leagueId, 'schedules', scheduleId),
        scheduleSnapshot => {
          setSchedule(scheduleSnapshot.exists() ? scheduleSnapshot.data() as ScheduleDoc : null);
          setLoading(false);
        },
        error => {
          console.warn('Schedule calendar unavailable:', error);
          setSchedule(null);
          setLoading(false);
        },
      );
    }, err => {
      console.warn('League calendar unavailable:', err);
      setLoading(false);
    });
    const unsubscribeTeams = onSnapshot(collection(db, 'leagues', leagueId, 'teams'), snapshot => {
      setTeams(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as Team)));
    }, err => {
      console.warn('League teams unavailable for calendar:', err);
    });
    return () => {
      unsubscribeLeague();
      if (unsubscribeSchedule) unsubscribeSchedule();
      unsubscribeTeams();
    };
  }, [leagueId]);

  const myTeam = teams.find(team => team.gmId === uid);
  const scheduleId = league?.scheduleId || String(league?.currentYear || 2025);
  const isLeagueAdmin = Boolean(
    uid
    && league
    && (
      league.commissionerId === uid
      || (league.coCommissioners || []).includes(uid)
    ),
  );
  const teamNames = useMemo(() => {
    const names = new Map<string, string>();
    (schedule?.participants || []).forEach((team) => {
      const label = team.abbreviation || team.name || team.scheduleTeamId || '';
      [team.scheduleTeamId, team.abbreviation].filter(Boolean).forEach(key => {
        names.set(String(key), label);
        names.set(normalizeScheduleKey(String(key)), label);
      });
    });
    teams.forEach((team) => {
      const label = team.abbreviation || team.name || team.teamId || team.id;
      [team.id, team.teamId, team.abbreviation].filter(Boolean).forEach(key => {
        names.set(String(key), label);
        names.set(normalizeScheduleKey(String(key)), label);
      });
    });
    return names;
  }, [schedule?.participants, teams]);
  const teamPresentations = useMemo(() => {
    const presentations = new Map<string, TeamPresentation>();
    const register = (keys: Array<string | undefined>, presentation: TeamPresentation) => {
      keys.filter(Boolean).forEach((key) => {
        presentations.set(String(key), presentation);
        presentations.set(normalizeScheduleKey(String(key)), presentation);
      });
    };
    (schedule?.participants || []).forEach((team) => {
      const abbr = normalizeScheduleKey(team.abbreviation || team.scheduleTeamId);
      const label = team.name || team.abbreviation || team.scheduleTeamId || '';
      register([team.scheduleTeamId, team.abbreviation], { label, abbr });
    });
    teams.forEach((team) => {
      const abbr = normalizeScheduleKey(team.abbreviation || team.teamId || team.id);
      const label = team.abbreviation || team.name || team.teamId || team.id;
      register([team.id, team.teamId, team.abbreviation], { label, abbr });
    });
    return presentations;
  }, [schedule?.participants, teams]);
  const myTeamIds = useMemo(() => teamScheduleKeys(myTeam), [myTeam]);
  const allGames = useMemo(() => [...(schedule?.games || [])].sort((a, b) => a.sequence - b.sequence), [schedule?.games]);
  const cupGames = useMemo(() => [...(schedule?.nbaCup?.games || [])].sort((a, b) => a.sequence - b.sequence), [schedule?.nbaCup?.games]);
  const hasNbaCup = cupGames.length > 0 && schedule?.nbaCup?.enabled !== false;
  const myGames = useMemo(() => allGames.filter(game => gameMatchesMyTeam(game, myTeam, uid)), [allGames, myTeam, uid]);
  const myCupGames = useMemo(() => cupGames.filter(game => gameMatchesMyTeam(game, myTeam, uid)), [cupGames, myTeam, uid]);
  const selectedViewMode: CalendarViewMode = viewMode === 'cup' && hasNbaCup ? 'cup' : myTeam ? viewMode : 'league';
  const games = useMemo(() => {
    if (selectedViewMode === 'cup') return cupGames;
    return visibleScheduleGames(allGames, selectedViewMode, myTeam, uid);
  }, [allGames, cupGames, myTeam, selectedViewMode, uid]);
  const sections = useMemo<CalendarSection[]>(() => {
    if (selectedViewMode === 'cup') {
      const byGroup = new Map<string, CalendarGame[]>();
      games.forEach((game) => {
        const group = cupSectionTitle(game);
        byGroup.set(group, [...(byGroup.get(group) || []), game]);
      });
      return [...byGroup.entries()]
        .sort(([a], [b]) => cupSectionOrder(a) - cupSectionOrder(b) || a.localeCompare(b))
        .map(([group, groupGames]) => {
          const sortedGames = [...groupGames].sort((a, b) => a.sequence - b.sequence);
          return {
            title: group,
            gameRange: formatGameRange(sortedGames),
            data: sortedGames,
          };
        });
    }
    const byWeek = new Map<number, NbaScheduleGame[]>();
    games.forEach((game) => {
      const week = Number(game.week || 1);
      byWeek.set(week, [...(byWeek.get(week) || []), game]);
    });
    return [...byWeek.entries()]
      .sort(([a], [b]) => a - b)
      .map(([week, weekGames]) => {
        const sortedGames = [...weekGames].sort((a, b) => a.sequence - b.sequence);
        return {
          title: `Week ${week}`,
          gameRange: formatGameRange(sortedGames),
          data: sortedGames,
        };
      });
  }, [games, selectedViewMode]);

  useEffect(() => {
    if (!leagueId || !schedule || !scheduleId || !isLeagueAdmin || teams.length === 0) return;
    const repair = previewNbaScheduleOwnershipRepair({ schedule, teams });
    if (!repair.changed) return;
    const repairKey = `${leagueId}:${scheduleId}:${repair.repairedGames}:${allGames.length}:${teams.map(team => `${team.id}:${team.gmId || ''}`).join('|')}`;
    if (repairAttemptedRef.current === repairKey) return;
    repairAttemptedRef.current = repairKey;
    repairNbaScheduleOwnershipLocally({
      leagueId,
      scheduleId,
      schedule,
      teams,
    }).catch(error => {
      console.warn('Failed to repair NBA schedule ownership:', error);
    });
  }, [allGames.length, isLeagueAdmin, leagueId, schedule, scheduleId, teams]);

  useEffect(() => {
    if (!leagueId || !league || !schedule || !scheduleId || !isLeagueAdmin) return;
    if (hasNbaCup || schedule.nbaCup?.enabled === false) return;
    const currentYear = Number(league.currentYear || scheduleId || 2025);
    if (!supportsNbaCupSchedule({ era: league.era, currentYear })) return;
    const participants = (schedule.participants || [])
      .filter(team => team.scheduleTeamId)
      .map(team => ({
        scheduleTeamId: String(team.scheduleTeamId),
        sourceTeamDocId: team.sourceTeamDocId || null,
        gmId: team.gmId || null,
        abbreviation: team.abbreviation || String(team.scheduleTeamId),
        name: team.name || '',
      }));
    if (participants.length < 30) return;
    const seed = `${leagueId}:${currentYear}:${schedule.gamesPerTeam || 82}`;
    const rawCup = buildNbaCupSchedule({
      scheduleTeamIds: participants.map(team => team.scheduleTeamId),
      currentYear,
      seed,
    });
    if (!rawCup) return;
    updateDoc(doc(db, 'leagues', leagueId, 'schedules', scheduleId), {
      nbaCup: {
        ...rawCup,
        games: decorateScheduleGames(rawCup.games, participants),
      },
    }).catch(error => {
      console.warn('Failed to add NBA Cup to existing schedule:', error);
    });
  }, [hasNbaCup, isLeagueAdmin, league, leagueId, schedule, scheduleId]);

  const scheduleParticipants = useMemo<NbaScheduleParticipant[]>(() => (
    (schedule?.participants || [])
      .filter(team => team.scheduleTeamId)
      .map(team => ({
        scheduleTeamId: String(team.scheduleTeamId),
        sourceTeamDocId: team.sourceTeamDocId || null,
        gmId: team.gmId || null,
        abbreviation: team.abbreviation || String(team.scheduleTeamId),
        name: team.name || '',
      }))
  ), [schedule?.participants]);

  const advanceCupLocally = async () => {
    if (!leagueId || !league || !schedule?.nbaCup) throw new Error('NBA Cup is not ready.');
    const seed = schedule.seed || `${leagueId}:${league.currentYear || 2025}:${schedule.gamesPerTeam || 82}`;
    const nextCup = advanceNbaCupStage({
      nbaCup: schedule.nbaCup as any,
      participants: scheduleParticipants,
      seed,
    });
    if (JSON.stringify(nextCup) === JSON.stringify(schedule.nbaCup)) {
      throw new Error('Finish every game in the current Cup stage before advancing.');
    }
    await updateDoc(doc(db, 'leagues', leagueId, 'schedules', scheduleId), { nbaCup: nextCup });
  };

  const advanceCup = async () => {
    if (!leagueId || !schedule?.nbaCup || !isLeagueAdmin) return;
    setAdvancingCup(true);
    try {
      const fn = httpsCallable(functions, 'advanceNbaCup');
      await fn({ leagueId });
    } catch (error: any) {
      if (isMissingCallable(error)) {
        try {
          await advanceCupLocally();
          return;
        } catch (fallbackError: any) {
          Alert.alert('Cup not advanced', fallbackError.message || 'Please try again.');
          return;
        }
      }
      Alert.alert('Cup not advanced', error.message || 'Finish the current Cup stage first.');
    } finally {
      setAdvancingCup(false);
    }
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator color="#00e58b" size="large" /></View>;

  return (
    <View style={styles.screen}>
      <SectionList
        contentContainerStyle={styles.content}
        sections={sections}
        keyExtractor={item => item.id}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={(
          <>
            <View style={styles.header}>
              <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                <Ionicons color="#ffffff" name="chevron-back" size={24} />
              </TouchableOpacity>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>{league?.name || 'League'}</Text>
                <Text style={styles.title}>Calendar</Text>
              </View>
            </View>
            {!schedule ? (
              <Text style={styles.empty}>No schedule has been created yet.</Text>
            ) : (
              <>
                <View style={styles.summary}>
                  <Text style={styles.summaryText}>{selectedViewMode === 'cup' ? 'NBA Cup' : `${schedule.gamesPerTeam || 0} games per team`}</Text>
                  <Text style={styles.summaryMeta}>
                    {selectedViewMode === 'cup'
                      ? `${cupGames.length} group-play games`
                      : selectedViewMode === 'mine'
                        ? `${myGames.length} team games`
                        : `${allGames.length} league games`}
                  </Text>
                </View>
                <View style={styles.segment}>
                  <TouchableOpacity
                    style={[styles.segmentButton, selectedViewMode === 'mine' && styles.segmentButtonActive, !myTeam && styles.segmentButtonDisabled]}
                    onPress={() => setViewMode('mine')}
                    disabled={!myTeam}
                  >
                    <Text style={[styles.segmentText, selectedViewMode === 'mine' && styles.segmentTextActive]}>My Team</Text>
                    <Text style={styles.segmentCount}>{myGames.length}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.segmentButton, selectedViewMode === 'league' && styles.segmentButtonActive]}
                    onPress={() => setViewMode('league')}
                  >
                    <Text style={[styles.segmentText, selectedViewMode === 'league' && styles.segmentTextActive]}>League</Text>
                    <Text style={styles.segmentCount}>{allGames.length}</Text>
                  </TouchableOpacity>
                  {hasNbaCup ? (
                    <TouchableOpacity
                      style={[styles.segmentButton, selectedViewMode === 'cup' && styles.segmentButtonActive]}
                      onPress={() => setViewMode('cup')}
                    >
                      <Text style={[styles.segmentText, selectedViewMode === 'cup' && styles.segmentTextActive]}>NBA Cup</Text>
                      <Text style={styles.segmentCount}>{myTeam ? `${myCupGames.length}/${cupGames.length}` : cupGames.length}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {selectedViewMode === 'cup' && isLeagueAdmin ? (
                  <TouchableOpacity
                    disabled={advancingCup || Boolean(schedule.nbaCup?.championTeamId)}
                    style={[styles.advanceCupButton, (advancingCup || schedule.nbaCup?.championTeamId) && styles.advanceCupButtonDisabled]}
                    onPress={advanceCup}
                  >
                    {advancingCup ? (
                      <ActivityIndicator color="#06130c" />
                    ) : (
                      <Text style={styles.advanceCupText}>
                        {schedule.nbaCup?.championTeamId ? 'NBA Cup Champion Set' : 'Advance NBA Cup'}
                      </Text>
                    )}
                  </TouchableOpacity>
                ) : null}
              </>
            )}
          </>
        )}
        renderSectionHeader={({ section }) => (
          <View style={styles.weekHeader}>
            <Text style={styles.weekTitle}>{section.title}</Text>
            <Text style={styles.weekRange}>{section.gameRange}</Text>
          </View>
        )}
        renderItem={({ item }) => {
          const home = teamPresentations.get(item.homeTeamId) || teamPresentations.get(normalizeScheduleKey(item.homeTeamId)) || { label: teamNames.get(item.homeTeamId) || item.homeTeamId, abbr: normalizeScheduleKey(item.homeTeamId) };
          const away = teamPresentations.get(item.awayTeamId) || teamPresentations.get(normalizeScheduleKey(item.awayTeamId)) || { label: teamNames.get(item.awayTeamId) || item.awayTeamId, abbr: normalizeScheduleKey(item.awayTeamId) };
          const cupGame = selectedViewMode === 'cup' || item.competition === 'nbaCup';
          const competitionParam = item.competition === 'playoffs' ? 'playoffs' : cupGame ? 'nbaCup' : 'regular';
          const mine = myTeam && (myTeamIds.has(normalizeScheduleKey(item.homeTeamId)) || myTeamIds.has(normalizeScheduleKey(item.awayTeamId)) || item.homeGmId === uid || item.awayGmId === uid);
          const openable = Boolean(mine || isLeagueAdmin);
          const needsReset = isLeagueAdmin && item.status !== 'scheduled';
          const finalScore = formatFinalScore(item);
          const statusLabel = item.status === 'final'
            ? finalScore || 'Final'
            : item.status === 'scheduled' && mine
              ? 'Ready'
              : item.status === 'requested'
                ? 'Requested'
                : item.status === 'preparing'
                  ? 'Prep'
                  : item.status === 'simulating'
                    ? 'Sim'
                    : '';
          return (
            <TouchableOpacity
              style={[styles.gameRow, mine && styles.myGame, !openable && styles.disabledGame]}
              disabled={!openable}
              onPress={() => {
                const resultDestination = item.status === 'final' ? '/screens/season/game-result' : '/screens/season/matchup';
                const destination = item.status === 'final' && item.liveTimeline ? '/screens/season/live-mode' : resultDestination;
                router.push({ pathname: destination as any, params: { leagueId, gameId: item.id, competition: competitionParam } });
              }}
            >
              <View style={styles.gameCopy}>
                <View style={styles.logoMatchup}>
                  <View style={styles.logoSide}>
                    <View style={styles.logoDisc}>
                      <SportTeamLogo sport="nba" abbr={away.abbr} era={league?.currentYear} style={styles.teamLogo} fontSize={10} />
                    </View>
                    <Text style={styles.teamLabel} numberOfLines={1}>{away.label}</Text>
                  </View>
                  <View style={styles.versusPill}>
                    <Text style={styles.versusText}>AT</Text>
                  </View>
                  <View style={styles.logoSide}>
                    <View style={styles.logoDisc}>
                      <SportTeamLogo sport="nba" abbr={home.abbr} era={league?.currentYear} style={styles.teamLogo} fontSize={10} />
                    </View>
                    <Text style={styles.teamLabel} numberOfLines={1}>{home.label}</Text>
                  </View>
                </View>
              </View>
              <View style={styles.gameStatusColumn}>
                {statusLabel ? (
                  <Text style={[styles.statusText, item.status === 'final' && styles.finalText]}>{statusLabel}</Text>
                ) : null}
                {needsReset ? (
                  <Text style={styles.resetHint}>Reset</Text>
                ) : null}
                {cupGame ? (
                  <Text style={styles.cupHint}>Cup</Text>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={schedule ? (
          <View style={styles.emptyCard}>
            <Text style={styles.empty}>
              {selectedViewMode === 'mine'
                ? 'No games matched your team yet. View the full league schedule while this syncs.'
                : selectedViewMode === 'cup'
                  ? 'No NBA Cup games are in this schedule yet.'
                : 'No games are in this schedule yet.'}
            </Text>
            {selectedViewMode === 'mine' && allGames.length > 0 ? (
              <TouchableOpacity style={styles.emptyAction} onPress={() => setViewMode('league')}>
                <Text style={styles.emptyActionText}>Show League Schedule</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050505' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#050505' },
  content: { padding: 18, paddingTop: 58, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  iconButton: { width: 42, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#151515' },
  headerCopy: { flex: 1 },
  eyebrow: { color: '#777', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  title: { color: '#fff', fontSize: 28, fontWeight: '900' },
  empty: { color: '#aaa', fontSize: 14, lineHeight: 20, marginBottom: 16 },
  summary: { backgroundColor: '#101410', borderWidth: 1, borderColor: '#1f3328', borderRadius: 8, padding: 14, marginBottom: 14 },
  summaryText: { color: '#fff', fontSize: 17, fontWeight: '900' },
  summaryMeta: { color: '#777', fontSize: 12, fontWeight: '700', marginTop: 4 },
  segment: { flexDirection: 'row', backgroundColor: '#101010', borderRadius: 8, borderWidth: 1, borderColor: '#202020', padding: 4, marginBottom: 14, gap: 4 },
  segmentButton: { flex: 1, minHeight: 42, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  segmentButtonActive: { backgroundColor: '#0a1d14', borderWidth: 1, borderColor: '#00e58b55' },
  segmentButtonDisabled: { opacity: 0.4 },
  segmentText: { color: '#777', fontSize: 12, fontWeight: '900' },
  segmentTextActive: { color: '#00e58b' },
  segmentCount: { color: '#555', fontSize: 10, fontWeight: '800', marginTop: 2 },
  weekHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 8, paddingHorizontal: 2 },
  weekTitle: { color: '#fff', fontSize: 13, fontWeight: '900' },
  weekRange: { color: '#777', fontSize: 11, fontWeight: '800' },
  gameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#111', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#202020', marginBottom: 8 },
  myGame: { borderColor: '#00e58b55', backgroundColor: '#0a1d14' },
  disabledGame: { opacity: 0.7 },
  gameCopy: { flex: 1 },
  logoMatchup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoSide: { flex: 1, minWidth: 0, alignItems: 'center', gap: 5 },
  logoDisc: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: '#181818', borderWidth: 1, borderColor: '#2a2a2a' },
  teamLogo: { width: 35, height: 35 },
  teamLabel: { color: '#fff', fontSize: 11, fontWeight: '900', maxWidth: '100%' },
  versusPill: { width: 28, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#080808', borderWidth: 1, borderColor: '#2a2a2a' },
  versusText: { color: '#777', fontSize: 9, fontWeight: '900' },
  gameStatusColumn: { width: 52, alignItems: 'flex-end', gap: 4 },
  statusText: { color: '#00e58b', fontSize: 12, fontWeight: '900', textAlign: 'right' },
  finalText: { color: '#fff' },
  resetHint: { color: '#ff6b6b', fontSize: 11, fontWeight: '900' },
  cupHint: { color: '#f4c542', fontSize: 10, fontWeight: '900' },
  advanceCupButton: { minHeight: 42, borderRadius: 8, backgroundColor: '#f4c542', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  advanceCupButtonDisabled: { opacity: 0.6 },
  advanceCupText: { color: '#06130c', fontSize: 12, fontWeight: '900' },
  emptyCard: { backgroundColor: '#101010', borderRadius: 8, borderWidth: 1, borderColor: '#202020', padding: 16 },
  emptyAction: { marginTop: 12, borderRadius: 8, borderWidth: 1, borderColor: '#00e58b55', paddingVertical: 10, alignItems: 'center' },
  emptyActionText: { color: '#00e58b', fontSize: 12, fontWeight: '900' },
});
