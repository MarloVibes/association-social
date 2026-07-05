import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db, functions } from '@/constants/firebase';
import {
  UPGRADE_GRADE_OPTIONS,
  detailedUpgradeGradesFromScoutingGrades,
  abilityGradesFromStats,
} from '@/domain/nba/upgradePoints';
import { resolveBaselineRatingProfile } from '@/domain/nba/baselineProfileResolver';
import { buildScoutingGrades } from '@/domain/nba/scoutingGrades';
import {
  advanceDevelopmentGrade,
  developmentPlayerId,
  hasOpenDevelopmentAssignment,
  isDevelopmentEligiblePlayer,
  type DevelopmentAssignment,
} from '@/domain/nba/developmentLeague';
import type { NbaGrade } from '@/domain/nba/identity';

type Player = {
  id?: string;
  player_id?: string;
  playerId?: string;
  full_name?: string;
  name?: string;
  position?: string;
  salary?: number;
  contractType?: string;
  contract_type?: string;
  rosterSlot?: string;
  roster_slot?: string;
  status?: string;
  grades?: Record<string, NbaGrade>;
  abilityGrades?: Record<string, NbaGrade>;
  category_skill_grades?: Record<string, unknown>;
  skill_grades?: Record<string, unknown>;
  attribute_model?: Record<string, unknown>;
  era_adjusted_profiles?: Record<string, unknown>;
  hidden?: Record<string, unknown>;
  visible?: { grades?: Record<string, NbaGrade> };
};

type Team = {
  id: string;
  name?: string;
  abbreviation?: string;
  gmId?: string;
  players?: Player[];
  developmentAssignment?: DevelopmentAssignment | null;
};

type League = {
  currentYear?: number;
  sport?: string;
  commissionerId?: string;
  coCommissioners?: string[];
  era?: string;
  leagueDate?: string;
};

const ABILITY_LABELS: Record<string, string> = Object.fromEntries(
  UPGRADE_GRADE_OPTIONS.map(option => [option.key, option.label]),
);

function teamName(team?: Team) {
  return team?.name || team?.abbreviation || 'Team';
}

function playerName(player: Player) {
  return player.full_name || player.name || 'Unnamed player';
}

function gradesFor(player: Player, league?: League | null): Record<string, NbaGrade> {
  const profile = resolveBaselineRatingProfile(player as Record<string, unknown>, {
    era: league?.era,
    currentYear: league?.currentYear,
    leagueDate: league?.leagueDate,
  });
  if (profile || player.category_skill_grades || player.attribute_model || player.era_adjusted_profiles || player.hidden) {
    return detailedUpgradeGradesFromScoutingGrades(buildScoutingGrades(player as Record<string, unknown>, profile));
  }
  return player.grades || player.abilityGrades || abilityGradesFromStats(player as Record<string, unknown>);
}

function eligibleText(player: Player) {
  const label = String(player.contractType || player.contract_type || player.rosterSlot || player.roster_slot || player.status || '').replace(/_/g, ' ');
  if (label) return label;
  return Number(player.salary || 0) > 0 ? 'minimum salary' : 'not eligible';
}

function formatRemaining(ms: number) {
  if (ms <= 0) return 'Ready now';
  const hours = Math.ceil(ms / (60 * 60 * 1000));
  if (hours >= 24) return `${Math.ceil(hours / 24)}d left`;
  return `${hours}h left`;
}

export default function DevelopmentLeagueScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const router = useRouter();
  const uid = auth.currentUser?.uid;
  const [league, setLeague] = useState<League | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [selectedGradeKey, setSelectedGradeKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!leagueId) return undefined;
    const unsubscribeLeague = onSnapshot(doc(db, 'leagues', leagueId), snapshot => {
      setLeague(snapshot.exists() ? snapshot.data() as League : null);
      setLoading(false);
    }, error => {
      Alert.alert('Unable to load league', error.message);
      setLoading(false);
    });
    const unsubscribeTeams = onSnapshot(collection(db, 'leagues', leagueId, 'teams'), snapshot => {
      setTeams(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as Team)));
    }, error => {
      Alert.alert('Unable to load teams', error.message);
    });
    return () => {
      unsubscribeLeague();
      unsubscribeTeams();
    };
  }, [leagueId]);

  const myTeam = teams.find(team => team.gmId === uid);
  const isLeagueAdmin = Boolean(uid && league && (league.commissionerId === uid || (league.coCommissioners || []).includes(uid)));
  const sortedTeams = useMemo(() => [...teams].sort((a, b) => teamName(a).localeCompare(teamName(b))), [teams]);
  const selectableTeams = useMemo(() => (
    isLeagueAdmin ? sortedTeams : (myTeam ? [myTeam] : [])
  ), [isLeagueAdmin, myTeam, sortedTeams]);
  const team = selectableTeams.find(item => item.id === selectedTeamId) || myTeam || (isLeagueAdmin ? sortedTeams[0] : undefined);
  const activeAssignment = team?.developmentAssignment;
  const hasOpenAssignment = hasOpenDevelopmentAssignment(activeAssignment);
  const eligiblePlayers = useMemo(() => (
    (team?.players || []).filter(player => isDevelopmentEligiblePlayer(player))
  ), [team?.players]);
  const selectedPlayer = eligiblePlayers.find(player => developmentPlayerId(player) === selectedPlayerId) || eligiblePlayers[0];
  const selectedGrades = selectedPlayer ? gradesFor(selectedPlayer, league) : {};
  const availableGradeOptions = UPGRADE_GRADE_OPTIONS.filter(option => selectedGrades[option.key]);
  const selectedGrade = selectedGradeKey && selectedGrades[selectedGradeKey] ? selectedGradeKey : availableGradeOptions[0]?.key || '';
  const currentGrade = selectedGrade ? selectedGrades[selectedGrade] : undefined;
  const targetGrade = currentGrade ? advanceDevelopmentGrade(currentGrade, 2) : undefined;
  const isReady = Boolean(activeAssignment && activeAssignment.status === 'active' && activeAssignment.completesAtMs <= nowMs);

  useEffect(() => {
    if (selectableTeams.length === 0) {
      if (selectedTeamId) setSelectedTeamId('');
      return;
    }
    if (!selectableTeams.some(item => item.id === selectedTeamId)) {
      setSelectedTeamId((myTeam && selectableTeams.some(item => item.id === myTeam.id)) ? myTeam.id : selectableTeams[0].id);
    }
  }, [myTeam, selectableTeams, selectedTeamId]);

  useEffect(() => {
    if (!selectedPlayer || developmentPlayerId(selectedPlayer) === selectedPlayerId) return;
    setSelectedPlayerId(developmentPlayerId(selectedPlayer));
  }, [selectedPlayer, selectedPlayerId]);

  useEffect(() => {
    if (!selectedGrade || selectedGrade === selectedGradeKey) return;
    setSelectedGradeKey(selectedGrade);
  }, [selectedGrade, selectedGradeKey]);

  const startAssignment = async () => {
    if (!leagueId || !team || !selectedPlayer || !selectedGrade) return;
    setWorking(true);
    try {
      const fn = httpsCallable(functions, 'startDevelopmentAssignment');
      await fn({
        leagueId,
        teamId: team.id,
        playerId: developmentPlayerId(selectedPlayer),
        gradeKey: selectedGrade,
        gradeLabel: ABILITY_LABELS[selectedGrade] || selectedGrade,
      });
    } catch (error: any) {
      Alert.alert('Development League failed', error.message || 'Please try again.');
    } finally {
      setWorking(false);
    }
  };

  const completeAssignment = async () => {
    if (!leagueId || !team) return;
    setWorking(true);
    try {
      const fn = httpsCallable(functions, 'completeDevelopmentAssignment');
      await fn({ leagueId, teamId: team.id });
    } catch (error: any) {
      Alert.alert('Development League failed', error.message || 'Please try again.');
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator color="#00e58b" size="large" /></View>;

  return (
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.content}
        data={eligiblePlayers}
        keyExtractor={item => developmentPlayerId(item)}
        ListHeaderComponent={(
          <>
            <View style={styles.header}>
              <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                <Ionicons color="#ffffff" name="chevron-back" size={24} />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={styles.eyebrow}>Coaching Room</Text>
                <Text style={styles.title}>Development League</Text>
              </View>
            </View>

            <View style={styles.summary}>
              <View style={styles.summaryIcon}>
                <Ionicons color="#06130c" name="barbell-outline" size={22} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.summaryTitle}>One-week skill camp</Text>
                <Text style={styles.summaryText}>Send one minimum-contract or two-way player at a time. The selected grade improves two levels when the assignment is complete.</Text>
              </View>
            </View>

            {isLeagueAdmin && selectableTeams.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.teamChips}>
                {selectableTeams.map(item => {
                  const selected = item.id === team?.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => setSelectedTeamId(item.id)}
                      style={[styles.teamChip, selected && styles.teamChipActive]}
                    >
                      <Text style={[styles.teamChipText, selected && styles.teamChipTextActive]} numberOfLines={1}>{teamName(item)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : null}

            {team ? (
              <View style={styles.activePanel}>
                <Text style={styles.panelLabel}>{teamName(team)}</Text>
                {activeAssignment && activeAssignment.status === 'active' ? (
                  <>
                    <Text style={styles.activeTitle}>{activeAssignment.playerName || activeAssignment.playerId}</Text>
                    <Text style={styles.activeText}>
                      {activeAssignment.gradeLabel || ABILITY_LABELS[activeAssignment.gradeKey] || activeAssignment.gradeKey}: {activeAssignment.fromGrade} to {activeAssignment.toGrade}
                    </Text>
                    <Text style={[styles.timerText, isReady && styles.readyText]}>
                      {formatRemaining(activeAssignment.completesAtMs - nowMs)}
                    </Text>
                    <TouchableOpacity
                      disabled={!isReady || working}
                      onPress={completeAssignment}
                      style={[styles.primaryButton, (!isReady || working) && styles.disabledButton]}
                    >
                      {working ? <ActivityIndicator color="#06130c" /> : <Text style={styles.primaryButtonText}>Claim Training</Text>}
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={styles.activeTitle}>No active assignment</Text>
                    <Text style={styles.activeText}>Choose one eligible player below and train one grade by two levels.</Text>
                  </>
                )}
              </View>
            ) : <Text style={styles.empty}>Claim a team before using the Development League.</Text>}
          </>
        )}
        ListEmptyComponent={team ? <Text style={styles.empty}>No minimum-contract or two-way players are eligible right now.</Text> : null}
        renderItem={({ item }) => {
          const isSelected = developmentPlayerId(item) === developmentPlayerId(selectedPlayer || {});
          const grades = gradesFor(item, league);
          const gradeOptions = UPGRADE_GRADE_OPTIONS.filter(option => grades[option.key]);
          const itemGradeKey = isSelected ? selectedGrade : gradeOptions[0]?.key;
          const itemGrade = itemGradeKey ? grades[itemGradeKey] : undefined;
          const itemTarget = itemGrade ? advanceDevelopmentGrade(itemGrade, 2) : undefined;
          return (
            <TouchableOpacity
              disabled={hasOpenAssignment || working}
              onPress={() => {
                setSelectedPlayerId(developmentPlayerId(item));
                setSelectedGradeKey(gradeOptions[0]?.key || '');
              }}
              style={[styles.playerCard, isSelected && styles.playerCardActive, hasOpenAssignment && styles.playerCardDisabled]}
              activeOpacity={0.82}
            >
              <View style={styles.playerHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.playerName}>{playerName(item)}</Text>
                  <Text style={styles.playerMeta}>{[item.position, eligibleText(item)].filter(Boolean).join(' · ')}</Text>
                </View>
                {itemGrade && itemTarget ? (
                  <View style={styles.gradeBadge}>
                    <Text style={styles.gradeText}>{itemGrade} to {itemTarget}</Text>
                  </View>
                ) : null}
              </View>

              {isSelected && !hasOpenAssignment ? (
                <>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gradeChips}>
                    {gradeOptions.map(option => {
                      const selected = option.key === selectedGrade;
                      const grade = grades[option.key];
                      return (
                        <TouchableOpacity
                          key={option.key}
                          onPress={() => setSelectedGradeKey(option.key)}
                          style={[styles.gradeChip, selected && styles.gradeChipActive]}
                        >
                          <Text style={[styles.gradeChipLabel, selected && styles.gradeChipLabelActive]}>{option.label}</Text>
                          <Text style={[styles.gradeChipValue, selected && styles.gradeChipValueActive]}>{grade} to {advanceDevelopmentGrade(grade, 2)}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <TouchableOpacity
                    disabled={working || !currentGrade || currentGrade === targetGrade}
                    onPress={startAssignment}
                    style={[styles.primaryButton, (working || !currentGrade || currentGrade === targetGrade) && styles.disabledButton]}
                  >
                    {working ? <ActivityIndicator color="#06130c" /> : <Text style={styles.primaryButtonText}>Send To Development League</Text>}
                  </TouchableOpacity>
                </>
              ) : null}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050505' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#050505' },
  content: { padding: 18, paddingTop: 58, paddingBottom: 44 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  iconButton: { width: 42, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#151515' },
  eyebrow: { color: '#777', fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: '#fff', fontSize: 28, fontWeight: '900' },
  summary: { flexDirection: 'row', gap: 12, backgroundColor: '#101410', borderWidth: 1, borderColor: '#1f3328', borderRadius: 8, padding: 14, marginBottom: 14 },
  summaryIcon: { width: 42, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#00e58b' },
  summaryTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
  summaryText: { color: '#9a9a9a', fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 3 },
  teamChips: { gap: 8, paddingBottom: 12 },
  teamChip: { maxWidth: 160, minHeight: 36, borderRadius: 8, borderWidth: 1, borderColor: '#252525', backgroundColor: '#101010', paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  teamChipActive: { borderColor: '#00e58b88', backgroundColor: '#07180f' },
  teamChipText: { color: '#888', fontSize: 12, fontWeight: '900' },
  teamChipTextActive: { color: '#00e58b' },
  activePanel: { backgroundColor: '#101010', borderRadius: 8, borderWidth: 1, borderColor: '#2d2d2d', padding: 14, marginBottom: 12 },
  panelLabel: { color: '#777', fontSize: 10, fontWeight: '900', textTransform: 'uppercase', marginBottom: 5 },
  activeTitle: { color: '#fff', fontSize: 18, fontWeight: '900' },
  activeText: { color: '#a0a0a0', fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 3 },
  timerText: { color: '#f4b942', fontSize: 13, fontWeight: '900', marginTop: 9 },
  readyText: { color: '#00e58b' },
  playerCard: { backgroundColor: '#101010', borderRadius: 8, borderWidth: 1, borderColor: '#252525', padding: 12, marginBottom: 10 },
  playerCardActive: { borderColor: '#00e58b88', backgroundColor: '#07180f' },
  playerCardDisabled: { opacity: 0.55 },
  playerHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  playerName: { color: '#fff', fontSize: 16, fontWeight: '900' },
  playerMeta: { color: '#777', fontSize: 11, fontWeight: '800', marginTop: 3, textTransform: 'uppercase' },
  gradeBadge: { borderRadius: 6, borderWidth: 1, borderColor: '#00e58b66', paddingHorizontal: 8, paddingVertical: 4 },
  gradeText: { color: '#00e58b', fontSize: 11, fontWeight: '900' },
  gradeChips: { gap: 8, paddingTop: 12, paddingBottom: 10 },
  gradeChip: { width: 128, borderRadius: 8, borderWidth: 1, borderColor: '#2b2b2b', backgroundColor: '#151515', padding: 9 },
  gradeChipActive: { borderColor: '#00e58b88', backgroundColor: '#092016' },
  gradeChipLabel: { color: '#aaa', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  gradeChipLabelActive: { color: '#00e58b' },
  gradeChipValue: { color: '#fff', fontSize: 14, fontWeight: '900', marginTop: 5 },
  gradeChipValueActive: { color: '#fff' },
  primaryButton: { minHeight: 48, borderRadius: 8, backgroundColor: '#00e58b', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, marginTop: 12 },
  primaryButtonText: { color: '#06130c', fontSize: 13, fontWeight: '900', textTransform: 'uppercase' },
  disabledButton: { opacity: 0.45 },
  empty: { color: '#999', fontSize: 14, lineHeight: 20, marginTop: 12 },
});
