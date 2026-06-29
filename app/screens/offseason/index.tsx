import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import GlobalNav from '@/components/GlobalNav';
import { auth, db, functions } from '@/constants/firebase';
import { getOffseasonStageSequence, nextOffseasonStage } from '@/domain/offseason/stateMachine';
import type { OffseasonStage, OffseasonState } from '@/domain/offseason/types';
import {
  buildInitialOffseasonState,
  getOffseasonStageLabel,
  getUnresolvedOffseasonTeams,
  isOffseasonTeamActionStage,
} from '@/domain/offseason/viewModel';

type LeagueData = {
  id: string;
  name?: string;
  sport?: string;
  currentYear?: number;
  draftTimerSeconds?: number;
  commissionerId?: string;
  coCommissioners?: string[];
  expansionEnabled?: boolean;
  expansionProposal?: { enabled?: boolean };
  offseason?: OffseasonState;
  draftLottery?: {
    complete?: boolean;
    candidates?: { pick: number; teamId: string; abbreviation?: string; name?: string; odds?: number }[];
    picks?: { pick: number; teamId: string; abbreviation?: string; name?: string; source?: string }[];
    drawnPicks?: { pick: number; teamId: string; abbreviation?: string; name?: string }[];
  };
};

type TeamData = {
  id: string;
  name?: string;
  abbreviation?: string;
  gmId?: string;
};

function callableMessage(error: any): string {
  const code = String(error?.code || '').replace('functions/', '');
  if (code === 'aborted') {
    return 'The stage changed while this screen was open. The latest league state has been loaded.';
  }
  if (code === 'failed-precondition') {
    return 'One or more claimed teams still need to finish their required offseason action.';
  }
  if (code === 'permission-denied') {
    return 'Only an active commissioner can advance the offseason.';
  }
  return error?.message || 'The offseason could not be advanced.';
}

function dateFromFirestore(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  return null;
}

function formatStageDeadline(offseason: OffseasonState): string {
  const deadline = dateFromFirestore(offseason.stageEndsAt);
  if (!offseason.stageDurationSeconds && !deadline) return 'Commissioner-controlled stage';
  if (!deadline) return `${Math.round((offseason.stageDurationSeconds || 600) / 60)} minute stage`;
  return `10 minute stage · Ends ${deadline.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

export default function OffseasonScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const router = useRouter();
  const user = auth.currentUser;
  const [league, setLeague] = useState<LeagueData | null>(null);
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const [runningLottery, setRunningLottery] = useState(false);
  const lotterySpin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!leagueId) {
      setLoading(false);
      return;
    }

    const unsubscribeLeague = onSnapshot(
      doc(db, 'leagues', leagueId),
      snapshot => {
        if (!snapshot.exists()) {
          Alert.alert('League not found', 'This league is no longer available.');
          router.back();
          return;
        }
        setLeague({ id: snapshot.id, ...snapshot.data() } as LeagueData);
        setLoading(false);
      },
      error => {
        setLoading(false);
        Alert.alert('Unable to load offseason', error.message);
      },
    );
    const unsubscribeTeams = onSnapshot(
      collection(db, 'leagues', leagueId, 'teams'),
      snapshot => {
        setTeams(snapshot.docs.map(team => ({
          id: team.id,
          ...team.data(),
        })) as TeamData[]);
      },
    );

    return () => {
      unsubscribeLeague();
      unsubscribeTeams();
    };
  }, [leagueId, router]);

  const offseason = useMemo(
    () => league?.offseason || (league ? buildInitialOffseasonState(league) : null),
    [league],
  );
  const isCommissioner = Boolean(
    user?.uid
    && league
    && (
      league.commissionerId === user.uid
      || (league.coCommissioners || []).includes(user.uid)
    ),
  );
  const expansionEnabled = Boolean(
    league?.expansionEnabled === true
    || (league?.expansionProposal && league.expansionProposal.enabled !== false),
  );
  const stages = getOffseasonStageSequence(league?.sport, expansionEnabled);
  const currentIndex = offseason ? stages.indexOf(offseason.stage) : -1;
  const nextStage = offseason
    ? nextOffseasonStage(league?.sport, offseason.stage, expansionEnabled)
    : null;
  const unresolvedTeams = offseason && isOffseasonTeamActionStage(offseason.stage)
    ? getUnresolvedOffseasonTeams(teams, offseason.completedTeamIds)
    : [];
  const isRegularSeason = offseason?.stage === 'regular_season';
  const contractRoundsReady = (
    offseason?.stage !== 're_signing'
    && offseason?.stage !== 'free_agency'
  ) || offseason.contractRoundsComplete === true;
  const myTeam = teams.find(team => team.gmId === user?.uid);
  const myTeamComplete = Boolean(
    myTeam && offseason?.completedTeamIds?.includes(myTeam.id),
  );
  const lotteryCandidates = useMemo(
    () => (league?.draftLottery?.candidates || []).slice(0, 8),
    [league?.draftLottery?.candidates],
  );
  const lotteryWheelTeams = lotteryCandidates.length > 0
    ? lotteryCandidates
    : teams.slice(0, 8).map((team, index) => ({
      pick: index + 1,
      teamId: team.id,
      abbreviation: team.abbreviation,
      name: team.name,
    }));
  const lotterySpinStyle = {
    transform: [{
      rotate: lotterySpin.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
      }),
    }],
  };
  const canAdvance = isCommissioner
    && !advancing
    && !isRegularSeason
    && unresolvedTeams.length === 0
    && contractRoundsReady;
  const stageRoute = offseason?.stage === 'awards_recap'
    ? '/screens/season/awards'
    : offseason?.stage === 're_signing'
    ? '/screens/offseason/re-signing'
    : offseason?.stage === 'free_agency'
      ? '/screens/offseason/free-agency'
      : offseason?.stage === 'draft_class_review'
        ? '/screens/offseason/draft-class'
      : offseason?.stage === 'live_draft'
        ? '/screens/offseason/live-draft'
        : offseason?.stage === 'expansion'
          ? '/screens/offseason/expansion'
          : offseason?.stage === 'roster_cuts'
            ? '/screens/offseason/roster-cuts'
          : null;

  const advanceStage = () => {
    if (!leagueId || !offseason || !nextStage || !canAdvance) return;
    Alert.alert(
      'Advance offseason?',
      offseason.stage === 'ready_for_season'
        ? `Start the ${offseason.seasonYear + 1} regular season?`
        : `Move from ${getOffseasonStageLabel(offseason.stage)} to ${getOffseasonStageLabel(nextStage)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Advance',
          onPress: async () => {
            setAdvancing(true);
            try {
              if (offseason.stage === 'ready_for_season') {
                const startNextSeason = httpsCallable(functions, 'startNextSeason');
                await startNextSeason({
                  leagueId,
                  expectedVersion: offseason.version,
                });
              } else {
                const advance = httpsCallable(functions, 'advanceOffseasonStage');
                await advance({
                  leagueId,
                  expectedStage: offseason.stage,
                  expectedVersion: offseason.version,
                });
              }
            } catch (error: any) {
              Alert.alert('Could not advance', callableMessage(error));
            } finally {
              setAdvancing(false);
            }
          },
        },
      ],
    );
  };

  const markTeamReady = async () => {
    if (!leagueId || !offseason || !myTeam || myTeamComplete) return;
    setAdvancing(true);
    try {
      const complete = httpsCallable(functions, 'completeOffseasonTeamAction');
      await complete({
        leagueId,
        expectedStage: offseason.stage,
        expectedVersion: offseason.version,
      });
    } catch (error: any) {
      Alert.alert('Could not mark team ready', callableMessage(error));
    } finally {
      setAdvancing(false);
    }
  };

  const runDraftLottery = () => {
    if (!leagueId || !offseason || offseason.stage !== 'lottery_and_draft_order' || !isCommissioner) return;
    Alert.alert(
      'Run draft lottery?',
      'This locks the lottery order for the upcoming draft.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Run Lottery',
          onPress: async () => {
            setRunningLottery(true);
            try {
              const callable = httpsCallable(functions, 'runDraftLottery');
              await callable({ leagueId, expectedVersion: offseason.version });
            } catch (error: any) {
              Alert.alert('Lottery failed', error.message || 'Please try again.');
            } finally {
              setRunningLottery(false);
            }
          },
        },
      ],
    );
  };

  useEffect(() => {
    if (!runningLottery) {
      lotterySpin.stopAnimation();
      lotterySpin.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(lotterySpin, {
        toValue: 1,
        duration: 900,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [lotterySpin, runningLottery]);

  if (loading || !league || !offseason) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#00e58b" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={styles.iconButton}
        >
          <Ionicons color="#ffffff" name="chevron-back" size={24} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text numberOfLines={1} style={styles.eyebrow}>{league.name || 'League'}</Text>
          <Text style={styles.title}>Offseason</Text>
        </View>
        <View style={styles.iconButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.currentSection}>
          <Text style={styles.sectionLabel}>CURRENT STAGE</Text>
          <Text style={styles.stageTitle}>{getOffseasonStageLabel(offseason.stage)}</Text>
          <Text style={styles.stageMeta}>
            {offseason.seasonYear} season · Version {offseason.version}
          </Text>
          {offseason.stageDurationSeconds ? (
            <View style={styles.warningCard}>
              <Ionicons color="#ffaa00" name="warning-outline" size={18} />
              <Text style={styles.warningText}>
                {formatStageDeadline(offseason)}. Stages are timed and cannot be rolled back after the league starts offseason.
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.progress}>
          {stages.map((stage, index) => {
            const complete = currentIndex > index;
            const active = offseason.stage === stage;
            return (
              <View key={stage} style={styles.progressRow}>
                <View style={[
                  styles.progressMarker,
                  complete && styles.progressMarkerComplete,
                  active && styles.progressMarkerActive,
                ]}>
                  {complete ? (
                    <Ionicons color="#07130d" name="checkmark" size={13} />
                  ) : (
                    <Text style={[styles.progressNumber, active && styles.progressNumberActive]}>
                      {index + 1}
                    </Text>
                  )}
                </View>
                <Text style={[
                  styles.progressLabel,
                  complete && styles.progressLabelComplete,
                  active && styles.progressLabelActive,
                ]}>
                  {getOffseasonStageLabel(stage as OffseasonStage)}
                </Text>
              </View>
            );
          })}
        </View>

        {stageRoute && !isOffseasonTeamActionStage(offseason.stage) && (
          <View style={styles.actionSection}>
            <TouchableOpacity
              onPress={() => router.push({ pathname: stageRoute, params: { leagueId } } as any)}
              style={styles.openStageButton}
            >
              <Text style={styles.openStageText}>Open {getOffseasonStageLabel(offseason.stage)}</Text>
              <Ionicons color="#00e58b" name="arrow-forward" size={18} />
            </TouchableOpacity>
          </View>
        )}

        {offseason.stage === 'lottery_and_draft_order' && (
          <View style={styles.actionSection}>
            <Text style={styles.sectionHeading}>Draft lottery</Text>
            {league.draftLottery?.complete ? (
              <>
                <Text style={styles.bodyText}>Lottery order is locked for the upcoming draft.</Text>
                <Text style={styles.lotterySubheading}>Top-four draw</Text>
                {(league.draftLottery.drawnPicks || []).map(pick => (
                  <View key={`drawn:${pick.pick}:${pick.teamId}`} style={styles.lotteryRevealRow}>
                    <View style={styles.lotteryRevealPick}>
                      <Text style={styles.lotteryRevealPickText}>{pick.pick}</Text>
                    </View>
                    <Text style={styles.teamName}>{pick.name || pick.abbreviation || pick.teamId}</Text>
                  </View>
                ))}
                <Text style={styles.lotterySubheading}>Full draft order</Text>
                {(league.draftLottery.picks || []).slice(0, 14).map(pick => (
                  <View key={`${pick.pick}:${pick.teamId}`} style={styles.teamRow}>
                    <Text style={styles.lotteryPick}>{pick.pick}</Text>
                    <Text style={styles.teamName}>{pick.name || pick.abbreviation || pick.teamId}</Text>
                    <Text style={styles.lotterySource}>
                      {pick.source === 'lottery_draw' ? 'drawn' : 'standings'}
                    </Text>
                  </View>
                ))}
              </>
            ) : (
              <>
                <Text style={styles.bodyText}>
                  Run the weighted lottery before this stage can advance.
                </Text>
                <View style={styles.lotteryInfoCard}>
                  <Text style={styles.lotteryInfoTitle}>Flattened anti-tank odds</Text>
                  <Text style={styles.lotteryInfoText}>
                    The bottom three teams share the best odds, then chances step down across the lottery field.
                  </Text>
                </View>
                <View style={styles.lotteryWheelWrap}>
                  <Animated.View style={[styles.lotteryWheel, lotterySpinStyle]}>
                    {lotteryWheelTeams.map((team, index) => (
                      <View key={`${team.teamId}:${index}`} style={styles.lotteryWheelSlot}>
                        <Text style={styles.lotteryWheelText} numberOfLines={1}>
                          {team.abbreviation || team.name || team.teamId}
                        </Text>
                      </View>
                    ))}
                  </Animated.View>
                  <View style={styles.lotteryWheelCenter}>
                    <Text style={styles.lotteryWheelCenterText}>LOTTERY</Text>
                  </View>
                </View>
                {isCommissioner && (
                  <TouchableOpacity
                    disabled={runningLottery}
                    onPress={runDraftLottery}
                    style={styles.openStageButton}
                  >
                    {runningLottery ? (
                      <ActivityIndicator color="#00e58b" />
                    ) : (
                      <>
                        <Text style={styles.openStageText}>Run Draft Lottery</Text>
                        <Ionicons color="#00e58b" name="shuffle" size={18} />
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        )}

        {isOffseasonTeamActionStage(offseason.stage) && (
          <View style={styles.actionSection}>
            <Text style={styles.sectionHeading}>Team actions</Text>
            {stageRoute && (
              <TouchableOpacity
                onPress={() => router.push({ pathname: stageRoute, params: { leagueId } } as any)}
                style={styles.openStageButton}
              >
                <Text style={styles.openStageText}>Open {getOffseasonStageLabel(offseason.stage)}</Text>
                <Ionicons color="#00e58b" name="arrow-forward" size={18} />
              </TouchableOpacity>
            )}
            {offseason.stage === 'ready_for_season' && myTeam && (
              <TouchableOpacity
                disabled={advancing || myTeamComplete}
                onPress={markTeamReady}
                style={[styles.openStageButton, myTeamComplete && styles.readyButtonComplete]}
              >
                <Text style={styles.openStageText}>
                  {myTeamComplete ? 'Your team is ready' : 'Mark your team ready'}
                </Text>
                <Ionicons
                  color="#00e58b"
                  name={myTeamComplete ? 'checkmark-circle' : 'flag-outline'}
                  size={18}
                />
              </TouchableOpacity>
            )}
            {unresolvedTeams.length === 0 ? (
              <View style={styles.statusRow}>
                <Ionicons color="#00e58b" name="checkmark-circle" size={20} />
                <Text style={styles.statusReady}>Every claimed team is ready.</Text>
              </View>
            ) : (
              <>
                <Text style={styles.bodyText}>
                  Waiting for {unresolvedTeams.length} claimed {unresolvedTeams.length === 1 ? 'team' : 'teams'}:
                </Text>
                {unresolvedTeams.map(team => (
                  <View key={team.id} style={styles.teamRow}>
                    <View style={styles.teamDot} />
                    <Text style={styles.teamName}>{team.label}</Text>
                  </View>
                ))}
              </>
            )}
          </View>
        )}

        {isCommissioner ? (
          <View style={styles.commissionerSection}>
            <Text style={styles.sectionHeading}>Commissioner control</Text>
            <TouchableOpacity
              disabled={!canAdvance}
              onPress={advanceStage}
              style={[styles.advanceButton, !canAdvance && styles.advanceButtonDisabled]}
            >
              {advancing ? (
                <ActivityIndicator color="#06120c" />
              ) : (
                <>
                  <Text style={styles.advanceButtonText}>
                    {isRegularSeason
                      ? 'Season is active'
                      : offseason.stage === 'ready_for_season'
                        ? `Start ${offseason.seasonYear + 1} Season`
                        : `Advance to ${getOffseasonStageLabel(nextStage!)}`}
                  </Text>
                  {!isRegularSeason && <Ionicons color="#06120c" name="arrow-forward" size={19} />}
                </>
              )}
            </TouchableOpacity>
            {unresolvedTeams.length > 0 && (
              <Text style={styles.blockedText}>Complete all claimed-team actions before advancing.</Text>
            )}
            {!contractRoundsReady && (
              <Text style={styles.blockedText}>Resolve every submitted and CPU contract round before advancing.</Text>
            )}
          </View>
        ) : (
          <Text style={styles.readOnlyText}>
            Commissioners control stage changes. This page updates live for every GM.
          </Text>
        )}
      </ScrollView>
      <GlobalNav />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#090b0a' },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#090b0a',
  },
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
  iconButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: { flex: 1, alignItems: 'center' },
  eyebrow: { color: '#777f79', fontSize: 12, fontWeight: '600', maxWidth: '100%' },
  title: { color: '#ffffff', fontSize: 20, fontWeight: '800' },
  content: { paddingBottom: 130 },
  currentSection: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#1c201d',
  },
  sectionLabel: { color: '#00e58b', fontSize: 11, fontWeight: '800' },
  stageTitle: { color: '#ffffff', fontSize: 30, fontWeight: '800', marginTop: 7 },
  stageMeta: { color: '#7d857f', fontSize: 13, marginTop: 6 },
  warningCard: {
    marginTop: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffaa00',
    backgroundColor: '#171006',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  warningText: { flex: 1, color: '#ffaa00', fontSize: 12, fontWeight: '700', lineHeight: 17 },
  progress: { paddingHorizontal: 24, paddingVertical: 24 },
  progressRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 12 },
  progressMarker: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#343936',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressMarkerComplete: { backgroundColor: '#729b82', borderColor: '#729b82' },
  progressMarkerActive: { borderColor: '#00e58b', borderWidth: 2 },
  progressNumber: { color: '#69706b', fontSize: 11, fontWeight: '700' },
  progressNumberActive: { color: '#00e58b' },
  progressLabel: { color: '#69706b', fontSize: 15 },
  progressLabelComplete: { color: '#9da49f' },
  progressLabelActive: { color: '#ffffff', fontWeight: '800' },
  actionSection: {
    paddingHorizontal: 24,
    paddingVertical: 22,
    borderTopWidth: 1,
    borderTopColor: '#1c201d',
  },
  openStageButton: {
    minHeight: 48,
    paddingHorizontal: 14,
    marginBottom: 16,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#28603f',
    backgroundColor: '#12231a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  openStageText: { color: '#00e58b', fontSize: 14, fontWeight: '800' },
  readyButtonComplete: { opacity: 0.65 },
  sectionHeading: { color: '#ffffff', fontSize: 16, fontWeight: '800', marginBottom: 12 },
  bodyText: { color: '#9aa19c', fontSize: 14, lineHeight: 20, marginBottom: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  statusReady: { color: '#b8c2bb', fontSize: 14 },
  teamRow: { flexDirection: 'row', alignItems: 'center', minHeight: 34, gap: 10 },
  teamDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#f4b942' },
  lotteryPick: { width: 24, color: '#00e58b', fontSize: 13, fontWeight: '900', textAlign: 'center' },
  lotterySubheading: { color: '#f4b942', fontSize: 12, fontWeight: '900', marginTop: 12, marginBottom: 8, textTransform: 'uppercase' },
  lotteryInfoCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3f3320',
    backgroundColor: '#171207',
    padding: 12,
    marginBottom: 14,
  },
  lotteryInfoTitle: { color: '#f4b942', fontSize: 13, fontWeight: '900', marginBottom: 4 },
  lotteryInfoText: { color: '#b2a17a', fontSize: 12, lineHeight: 17 },
  lotteryWheelWrap: { alignItems: 'center', justifyContent: 'center', marginVertical: 14 },
  lotteryWheel: {
    width: 190,
    height: 190,
    borderRadius: 95,
    borderWidth: 2,
    borderColor: '#f4b942',
    backgroundColor: '#131810',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 18,
    gap: 6,
  },
  lotteryWheelSlot: {
    width: 68,
    minHeight: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#314233',
    backgroundColor: '#0b1b11',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  lotteryWheelText: { color: '#dce7df', fontSize: 11, fontWeight: '900' },
  lotteryWheelCenter: {
    position: 'absolute',
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
    borderColor: '#00e58b',
    backgroundColor: '#07130d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lotteryWheelCenterText: { color: '#00e58b', fontSize: 11, fontWeight: '900' },
  lotteryRevealRow: {
    minHeight: 42,
    borderRadius: 7,
    backgroundColor: '#101511',
    borderWidth: 1,
    borderColor: '#243b2c',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    marginBottom: 7,
  },
  lotteryRevealPick: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#00e58b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lotteryRevealPickText: { color: '#06120c', fontSize: 12, fontWeight: '900' },
  lotterySource: { marginLeft: 'auto', color: '#69706b', fontSize: 11, fontWeight: '800' },
  teamName: { color: '#d9ddda', fontSize: 14 },
  commissionerSection: {
    paddingHorizontal: 24,
    paddingVertical: 24,
    borderTopWidth: 1,
    borderTopColor: '#1c201d',
  },
  advanceButton: {
    minHeight: 52,
    paddingHorizontal: 18,
    backgroundColor: '#00e58b',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  advanceButtonDisabled: { backgroundColor: '#303532' },
  advanceButtonText: { color: '#06120c', fontSize: 15, fontWeight: '800', textAlign: 'center' },
  blockedText: { color: '#be9a49', fontSize: 12, marginTop: 10, textAlign: 'center' },
  readOnlyText: {
    color: '#7d857f',
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 24,
    paddingVertical: 24,
    borderTopWidth: 1,
    borderTopColor: '#1c201d',
  },
});
