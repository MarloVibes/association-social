import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db, functions } from '@/constants/firebase';
import { getSportArchetypeForYear } from '@/constants/sportArchetype';
import { resolveBaselineRatingProfile } from '@/domain/nba/baselineProfileResolver';
import { buildScoutingGrades } from '@/domain/nba/scoutingGrades';
import {
  UPGRADE_GRADE_OPTIONS,
  abilityGradesFromStats,
  canUpgradePlayerThisSeason,
  creditAppliesToAbility,
  detailedUpgradeGradesFromScoutingGrades,
  nextGrade,
  upgradeCost,
  type PlayerUpgradeCredit,
  type UpgradePlayerLabel,
} from '@/domain/nba/upgradePoints';
import type { NbaGrade } from '@/domain/nba/identity';

type Team = {
  id: string;
  name?: string;
  abbreviation?: string;
  gmId?: string;
  upgradePoints?: number;
  starTrainingTokens?: number;
  players?: Player[];
};

type Player = {
  id?: string;
  player_id?: string;
  playerId?: string;
  full_name?: string;
  name?: string;
  position?: string;
  grades?: Record<string, NbaGrade>;
  abilityGrades?: Record<string, NbaGrade>;
  category_skill_grades?: Record<string, unknown>;
  attribute_model?: Record<string, unknown>;
  era_adjusted_profiles?: Record<string, unknown>;
  hidden?: Record<string, unknown>;
  upgradeUsage?: Record<string, number>;
  playerUpgradeCredits?: Record<string, PlayerUpgradeCredit[]>;
  playerLabel?: string;
  tierLabel?: string;
  reputation?: string;
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
const UPGRADE_CATEGORY_ORDER = [...new Set(UPGRADE_GRADE_OPTIONS.map(option => option.category))];

function playerId(player: Player) {
  return String(player.id || player.player_id || player.playerId || player.full_name || player.name || '');
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

function upgradeSections(grades: Record<string, NbaGrade>) {
  const known = UPGRADE_CATEGORY_ORDER.map(category => ({
    category,
    entries: UPGRADE_GRADE_OPTIONS
      .filter(option => option.category === category && grades[option.key])
      .map(option => [option.key, grades[option.key]] as [string, NbaGrade]),
  })).filter(section => section.entries.length > 0);
  const knownKeys = new Set(UPGRADE_GRADE_OPTIONS.map(option => option.key));
  const otherEntries = Object.entries(grades).filter(([key]) => !knownKeys.has(key));
  return otherEntries.length > 0 ? [...known, { category: 'Other', entries: otherEntries }] : known;
}

function teamName(team?: Team) {
  return team?.name || team?.abbreviation || 'Team';
}

function getUpgradeStatus({
  grade,
  target,
  teamPoints,
  starTrainingTokens,
  playerCredits,
  ability,
  label,
  used,
}: {
  grade: NbaGrade;
  target: NbaGrade;
  teamPoints: number;
  starTrainingTokens: number;
  playerCredits: PlayerUpgradeCredit[];
  ability: string;
  label: UpgradePlayerLabel;
  used: number;
}) {
  if (target === grade) {
    return {
      canImprove: false,
      text: 'Maxed',
    };
  }
  if (!canUpgradePlayerThisSeason({ label, upgradesUsedThisSeason: used })) {
    return { canImprove: false, text: 'Season limit reached' };
  }
  const cost = upgradeCost(target);
  const creditDiscount = playerCredits.some(credit => creditAppliesToAbility(credit, ability)) ? 1 : 0;
  const teamPointCost = Math.max(0, cost.teamPoints - creditDiscount);
  if (teamPoints < teamPointCost) return { canImprove: false, text: `Needs ${teamPointCost} team points` };
  if (starTrainingTokens < cost.starTrainingTokens) return { canImprove: false, text: 'Needs Star Training Token' };
  const parts = [
    teamPointCost > 0 ? `${teamPointCost} team point${teamPointCost === 1 ? '' : 's'}` : 'player credit',
    cost.starTrainingTokens > 0 ? `${cost.starTrainingTokens} star token` : null,
  ].filter(Boolean);
  return { canImprove: true, text: `Spend ${parts.join(' + ')}` };
}

export default function PlayerUpgradesScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const router = useRouter();
  const uid = auth.currentUser?.uid;
  const [league, setLeague] = useState<League | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [loading, setLoading] = useState(true);
  const [workingKey, setWorkingKey] = useState('');

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
  const players = team?.players || [];
  const seasonKey = String(league?.currentYear || 'current');

  useEffect(() => {
    if (selectableTeams.length === 0) {
      if (selectedTeamId) setSelectedTeamId('');
      return;
    }
    if (!selectableTeams.some(item => item.id === selectedTeamId)) {
      setSelectedTeamId((myTeam && selectableTeams.some(item => item.id === myTeam.id)) ? myTeam.id : selectableTeams[0].id);
    }
  }, [myTeam, selectableTeams, selectedTeamId]);

  const spendPoint = async (player: Player, ability: string) => {
    if (!leagueId || !team) return;
    const key = `${playerId(player)}:${ability}`;
    setWorkingKey(key);
    try {
      const fn = httpsCallable(functions, 'spendPlayerUpgrade');
      await fn({ leagueId, teamId: team.id, playerId: playerId(player), ability });
    } catch (error: any) {
      Alert.alert('Upgrade failed', error.message || 'Please try again.');
    } finally {
      setWorkingKey('');
    }
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator color="#00e58b" size="large" /></View>;

  return (
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.content}
        data={players}
        keyExtractor={item => playerId(item)}
        ListHeaderComponent={(
          <>
            <View style={styles.header}>
              <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                <Ionicons color="#ffffff" name="chevron-back" size={24} />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={styles.eyebrow}>Player Development</Text>
                <Text style={styles.title}>Upgrade Points</Text>
              </View>
            </View>
            <View style={styles.summary}>
              <Text style={styles.summaryValue}>{team?.upgradePoints || 0}</Text>
              <Text style={styles.summaryLabel}>{teamName(team)} Team Development Points</Text>
              <Text style={styles.tokenLine}>{team?.starTrainingTokens || 0} Star Training Tokens</Text>
            </View>
            <View style={styles.rulePanel}>
              <Text style={styles.ruleText}>Higher grades cost more. Player-bound credits reduce the cost for the award winner.</Text>
              <Text style={styles.ruleText}>S-grade upgrades are rare and require a Star Training Token.</Text>
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
            {!team ? <Text style={styles.empty}>Claim a team before spending upgrade points.</Text> : null}
          </>
        )}
        ListEmptyComponent={team ? <Text style={styles.empty}>No players available for upgrades yet.</Text> : null}
        renderItem={({ item }) => {
          const style = getSportArchetypeForYear(item, null, league?.currentYear, 'nba');
          const label = (item.playerLabel || item.tierLabel || item.reputation || style.label) as UpgradePlayerLabel;
          const used = Number(item.upgradeUsage?.[seasonKey] || 0);
          const playerCredits = (item.playerUpgradeCredits?.[seasonKey] || []).filter(credit => Number(credit.remaining || 0) > 0);
          const grades = gradesFor(item, league);
          const sections = upgradeSections(grades);
          return (
            <View style={styles.playerCard}>
              <View style={styles.playerHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.playerName}>{playerName(item)}</Text>
                  <Text style={styles.playerMeta}>{[item.position, style.label, used ? `${used} used` : null].filter(Boolean).join(' · ')}</Text>
                  {playerCredits.length > 0 ? (
                    <Text style={styles.creditMeta}>{playerCredits.reduce((total, credit) => total + Number(credit.remaining || 0), 0)} player-bound credit{playerCredits.length === 1 ? '' : 's'} available</Text>
                  ) : null}
                </View>
                <View style={[styles.labelBadge, { borderColor: style.color + '88' }]}>
                  <Text style={[styles.labelText, { color: style.color }]}>{style.label}</Text>
                </View>
              </View>
              {sections.length === 0 ? (
                <Text style={styles.noGrades}>No ability grades yet</Text>
              ) : sections.map(section => (
                <View key={section.category} style={styles.abilitySection}>
                  <Text style={styles.sectionTitle}>{section.category}</Text>
                  <View style={styles.abilityGrid}>
                    {section.entries.map(([ability, grade]) => {
                      const target = nextGrade(grade, label);
                      const status = getUpgradeStatus({
                        grade,
                        target,
                        teamPoints: team?.upgradePoints || 0,
                        starTrainingTokens: team?.starTrainingTokens || 0,
                        playerCredits,
                        ability,
                        label,
                        used,
                      });
                      const key = `${playerId(item)}:${ability}`;
                      return (
                        <TouchableOpacity
                          key={ability}
                          disabled={!status.canImprove || workingKey === key}
                          onPress={() => spendPoint(item, ability)}
                          style={[styles.abilityButton, !status.canImprove && styles.abilityButtonDisabled]}
                        >
                          <View style={styles.abilityTopRow}>
                            <Text style={styles.abilityName} numberOfLines={1}>{ABILITY_LABELS[ability] || ability}</Text>
                            {status.canImprove ? <Ionicons color="#00e58b" name="arrow-up-circle" size={18} /> : null}
                          </View>
                          <View style={styles.gradePath}>
                            <Text style={styles.abilityGrade}>{grade}</Text>
                            {target !== grade ? (
                              <>
                                <Ionicons color={status.canImprove ? '#00e58b' : '#666'} name="arrow-forward" size={14} />
                                <Text style={[styles.abilityGrade, status.canImprove && styles.nextGrade]}>{target}</Text>
                              </>
                            ) : null}
                          </View>
                          <Text style={[styles.abilityStatus, status.canImprove && styles.abilityStatusReady]}>
                            {status.canImprove ? `${status.text} to upgrade ${grade} to ${target}` : status.text}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          );
        }}
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
  eyebrow: { color: '#777', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  title: { color: '#fff', fontSize: 28, fontWeight: '900' },
  summary: { backgroundColor: '#101410', borderWidth: 1, borderColor: '#1f3328', borderRadius: 8, padding: 14, marginBottom: 14 },
  summaryValue: { color: '#00e58b', fontSize: 30, fontWeight: '900' },
  summaryLabel: { color: '#999', fontSize: 13, fontWeight: '800', marginTop: 2 },
  tokenLine: { color: '#d7b56d', fontSize: 12, fontWeight: '900', marginTop: 6 },
  rulePanel: { backgroundColor: '#101010', borderRadius: 8, borderWidth: 1, borderColor: '#252525', padding: 12, marginBottom: 12, gap: 4 },
  ruleText: { color: '#9a9a9a', fontSize: 12, lineHeight: 17, fontWeight: '700' },
  teamChips: { gap: 8, paddingBottom: 12 },
  teamChip: { maxWidth: 160, minHeight: 36, borderRadius: 8, borderWidth: 1, borderColor: '#252525', backgroundColor: '#101010', paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  teamChipActive: { borderColor: '#00e58b88', backgroundColor: '#07180f' },
  teamChipText: { color: '#888', fontSize: 12, fontWeight: '900' },
  teamChipTextActive: { color: '#00e58b' },
  empty: { color: '#999', fontSize: 14, lineHeight: 20, marginTop: 12 },
  playerCard: { backgroundColor: '#101010', borderRadius: 8, borderWidth: 1, borderColor: '#202020', padding: 12, marginBottom: 12 },
  playerHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  playerName: { color: '#fff', fontSize: 16, fontWeight: '900' },
  playerMeta: { color: '#777', fontSize: 11, fontWeight: '800', marginTop: 3, textTransform: 'uppercase' },
  creditMeta: { color: '#d7b56d', fontSize: 11, fontWeight: '900', marginTop: 5 },
  labelBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  labelText: { fontSize: 9, fontWeight: '900' },
  abilitySection: { marginTop: 8 },
  sectionTitle: { color: '#777', fontSize: 10, fontWeight: '900', letterSpacing: 0, marginBottom: 7, textTransform: 'uppercase' },
  abilityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  abilityButton: { width: '48%', minHeight: 76, borderRadius: 8, borderWidth: 1, borderColor: '#00e58b66', backgroundColor: '#07180f', padding: 8, justifyContent: 'center' },
  abilityButtonDisabled: { opacity: 0.45, borderColor: '#333', backgroundColor: '#151515' },
  abilityTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  abilityName: { flex: 1, color: '#aaa', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  gradePath: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  abilityGrade: { color: '#fff', fontSize: 16, fontWeight: '900' },
  nextGrade: { color: '#00e58b' },
  abilityStatus: { color: '#777', fontSize: 10, fontWeight: '800', marginTop: 3 },
  abilityStatusReady: { color: '#00e58b' },
  noGrades: { color: '#777', fontSize: 12, fontWeight: '700' },
});
