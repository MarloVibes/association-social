import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { type ComponentProps, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db, functions } from '@/constants/firebase';
import { displayScheduleAbbr, displayScheduleEventText } from '@/domain/nba/scheduleView';
import { buildNbaStandings } from '@/domain/nba/standings';
import { seasonUpgradeGrants, type AwardUpgradeInput } from '@/domain/nba/upgradePoints';
import { awardCategoriesForSport, recordsForSportAward, type SportAwardCategory, type SportAwardRecord } from '@/domain/sports/awards';

type TrophyCaseItem = SportAwardCategory & {
  records: SportAwardRecord[];
};

type AwardsScheduleDoc = {
  games?: any[];
  participants?: {
    scheduleTeamId?: string | null;
    abbreviation?: string | null;
    name?: string | null;
  }[];
  nbaCup?: {
    championTeamId?: string | null;
    winnerTeamId?: string | null;
    championTeamName?: string | null;
    championTeamAbbr?: string | null;
    seasonYear?: string | number | null;
  } | null;
};

type Team = {
  id: string;
  teamId?: string | null;
  abbreviation?: string | null;
  abbr?: string | null;
  name?: string | null;
  full_name?: string | null;
  gmId?: string | null;
  conference?: string | null;
  upgradePointGrants?: Record<string, unknown>;
  players?: any[];
};

const EAST_TEAMS = new Set(['ATL', 'BOS', 'BKN', 'CHA', 'CHI', 'CLE', 'DET', 'IND', 'MIA', 'MIL', 'NJN', 'NYK', 'ORL', 'PHI', 'TOR', 'WAS']);
const WEST_TEAMS = new Set(['DAL', 'DEN', 'GSW', 'HOU', 'LAC', 'LAL', 'MEM', 'MIN', 'NOH', 'NOK', 'NOP', 'OKC', 'PHX', 'POR', 'SAC', 'SAS', 'SEA', 'UTA']);

function recordLabel(record: SportAwardRecord) {
  const winner = record.winnerName || record.teamName || 'Winner';
  const team = record.teamAbbr || record.teamName;
  const season = record.season ? String(record.season) : '';
  const parts = [season, winner, team && team !== winner ? team : '', record.note || ''].filter(Boolean);
  return displayScheduleEventText(parts.join(' · '));
}

function awardIconName(item: SportAwardCategory): ComponentProps<typeof Ionicons>['name'] {
  if (item.key === 'championship_rings') return 'diamond';
  if (item.kind === 'championship') return 'trophy';
  if (item.key === 'defensive_player' || item.key === 'all_defense' || item.key === 'dpoy' || item.key === 'gold_glove') return 'shield-checkmark';
  if (item.key === 'most_improved') return 'trending-up';
  if (item.key === 'all_nba' || item.key === 'all_pro') return 'people';
  if (item.key === 'all_star') return 'star';
  if (item.key === 'coach') return 'clipboard';
  return 'ribbon';
}

function normalizeTeamKey(value?: string | null) {
  return String(value || '').trim().toUpperCase();
}

function teamRecordKey(record: SportAwardRecord) {
  return normalizeTeamKey(record.teamAbbr || record.teamName || record.winnerName);
}

function teamKeys(team: Team) {
  return [team.id, team.teamId, team.abbreviation, team.abbr, team.name]
    .map(normalizeTeamKey)
    .filter(Boolean);
}

function addAward(ledger: Record<string, AwardUpgradeInput>, teamId: string, awardKey: string, count = 1) {
  if (!teamId) return;
  const current = ledger[teamId] || { awards: {} };
  ledger[teamId] = {
    ...current,
    awards: {
      ...(current.awards || {}),
      [awardKey]: Number(current.awards?.[awardKey as keyof NonNullable<AwardUpgradeInput['awards']>] || 0) + count,
    },
  };
}

function addFinalResult(ledger: Record<string, AwardUpgradeInput>, teamId: string, key: 'championships' | 'finalsRunnerUp') {
  if (!teamId) return;
  const current = ledger[teamId] || { awards: {} };
  ledger[teamId] = {
    ...current,
    [key]: Number(current[key] || 0) + 1,
  };
}

function awardLedgerFor(
  league: any,
  schedule: AwardsScheduleDoc | null,
  teams: Team[],
  standings: { teamId: string; abbreviation: string; wins: number; losses: number }[],
): Record<string, AwardUpgradeInput> {
  const ledger: Record<string, AwardUpgradeInput> = {};
  const ledgerSport = league?.sport || 'nba';
  recordsForSportAward(ledgerSport, league, 'championship_rings', { currentYear: league?.currentYear, schedule }).forEach(record => (
    addFinalResult(ledger, teamRecordKey(record), 'championships')
  ));
  recordsForSportAward(ledgerSport, league, 'finals_runner_up', { currentYear: league?.currentYear, schedule }).forEach(record => (
    addFinalResult(ledger, teamRecordKey(record), 'finalsRunnerUp')
  ));
  const awardMap: Record<string, string> = {
    nba_cup: 'nba_cup',
    mvp: 'mvp',
    finals_mvp: 'finals_mvp',
    defensive_player: 'dpoy',
    rookie: 'roy',
    sixth_man: 'sixth_man',
    most_improved: 'mip',
    all_nba: 'all_nba_1st',
    all_defense: 'all_defense',
    all_star: 'all_star',
  };
  Object.entries(awardMap).forEach(([sourceKey, awardKey]) => {
    recordsForSportAward(ledgerSport, league, sourceKey, { currentYear: league?.currentYear, schedule, teams, standings, includeProjected: false }).forEach(record => (
      addAward(ledger, teamRecordKey(record), awardKey)
    ));
  });
  return ledger;
}

function conferenceFor(row: { teamId: string; abbreviation: string }, teams: Team[]) {
  const rowKeys = [row.teamId, row.abbreviation].map(normalizeTeamKey);
  const matched = teams.find(team => (
    rowKeys.includes(normalizeTeamKey(team.id))
    || rowKeys.includes(normalizeTeamKey(team.teamId))
    || rowKeys.includes(normalizeTeamKey(team.abbreviation || team.abbr))
  ));
  const saved = normalizeTeamKey(matched?.conference);
  if (saved) return saved;
  const abbr = normalizeTeamKey(row.abbreviation || row.teamId);
  if (EAST_TEAMS.has(abbr)) return 'East';
  if (WEST_TEAMS.has(abbr)) return 'West';
  return 'League';
}

export default function AwardsScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const router = useRouter();
  const [league, setLeague] = useState<any>(null);
  const [schedule, setSchedule] = useState<AwardsScheduleDoc | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [applyingGrants, setApplyingGrants] = useState(false);
  const [finalizingAwards, setFinalizingAwards] = useState(false);

  useEffect(() => {
    if (!leagueId) return undefined;
    let unsubscribeSchedule: (() => void) | undefined;
    const unsubscribeLeague = onSnapshot(doc(db, 'leagues', leagueId), snapshot => {
      if (!snapshot.exists()) {
        setLeague(null);
        setSchedule(null);
        setLoading(false);
        return;
      }
      const nextLeague = { id: snapshot.id, ...snapshot.data() } as any;
      setLeague(nextLeague);
      const scheduleId = nextLeague.scheduleId || String(nextLeague.currentYear || 2025);
      if (unsubscribeSchedule) unsubscribeSchedule();
      unsubscribeSchedule = onSnapshot(doc(db, 'leagues', leagueId, 'schedules', scheduleId), scheduleSnapshot => {
        setSchedule(scheduleSnapshot.exists() ? scheduleSnapshot.data() as AwardsScheduleDoc : null);
        setLoading(false);
      }, () => {
        setSchedule(null);
        setLoading(false);
      });
    }, () => {
      setLeague(null);
      setSchedule(null);
      setLoading(false);
    });
    const unsubscribeTeams = onSnapshot(collection(db, 'leagues', leagueId, 'teams'), snapshot => {
      setTeams(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as Team)));
    });
    return () => {
      unsubscribeLeague();
      if (unsubscribeSchedule) unsubscribeSchedule();
      unsubscribeTeams();
    };
  }, [leagueId]);

  const sport = league?.sport || 'nba';
  const isNba = sport === 'nba';
  const standings = useMemo(() => (
    isNba
      ? buildNbaStandings({
        games: schedule?.games || [],
        participants: schedule?.participants || [],
        teams,
      })
      : []
  ), [isNba, schedule?.games, schedule?.participants, teams]);
  const trophyCase = useMemo<TrophyCaseItem[]>(() => (
    awardCategoriesForSport(sport).map(category => ({
      ...category,
      records: recordsForSportAward(sport, league, category.key, {
        currentYear: league?.currentYear,
        schedule,
        teams,
        standings,
      }),
    }))
  ), [league, schedule, sport, standings, teams]);
  const upgradeGrants = useMemo(() => seasonUpgradeGrants({
    standings: standings.map(row => ({
      teamId: row.teamId,
      conference: conferenceFor(row, teams),
      wins: row.wins,
      losses: row.losses,
    })),
    awardLedger: awardLedgerFor(league, schedule, teams, standings),
  }), [league, schedule, standings, teams]);
  const grantPoints = upgradeGrants.reduce((total, grant) => total + grant.totalPoints, 0);
  const seasonKey = String(league?.currentYear || new Date().getFullYear());
  const grantsAlreadyApplied = upgradeGrants.length > 0 && upgradeGrants.every((grant) => {
    const grantTeamKey = normalizeTeamKey(grant.teamId);
    const team = teams.find(item => teamKeys(item).includes(grantTeamKey));
    return Boolean(team?.upgradePointGrants?.[seasonKey]);
  });
  const uid = auth.currentUser?.uid;
  const isLeagueAdmin = Boolean(uid && league && (league.commissionerId === uid || (league.coCommissioners || []).includes(uid)));
  const awardSectionTitle = isNba ? 'NBA Awards' : sport === 'madden' ? 'NFL Awards' : 'MLB Awards';

  const finalizeAwards = async () => {
    if (!leagueId) return;
    setFinalizingAwards(true);
    try {
      const finalizeSeasonAwards = httpsCallable(functions, 'finalizeSeasonAwards');
      await finalizeSeasonAwards({
        leagueId,
        seasonYear: Number(league?.currentYear || new Date().getFullYear()),
      });
      Alert.alert('Awards finalized', 'Season award winners were added to the Trophy Case.');
    } catch (error: any) {
      Alert.alert('Could not finalize awards', error.message || 'Please try again.');
    } finally {
      setFinalizingAwards(false);
    }
  };

  const applyUpgradePoints = async () => {
    if (!leagueId || upgradeGrants.length === 0) return;
    setApplyingGrants(true);
    try {
      const applyGrants = httpsCallable(functions, 'applyUpgradeGrants');
      const result = await applyGrants({
        leagueId,
        seasonYear: Number(league?.currentYear || new Date().getFullYear()),
        grants: upgradeGrants,
      });
      const updatedTeams = (result.data as any)?.updatedTeams || [];
      if (updatedTeams.length === 0) {
        Alert.alert('Already Applied', 'Upgrade points for this season were already applied.');
      } else {
        Alert.alert('Upgrade points applied', `${grantPoints} points were sent to eligible teams.`);
      }
    } catch (error: any) {
      Alert.alert('Could not apply points', error.message || 'Please try again.');
    } finally {
      setApplyingGrants(false);
    }
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator color="#d7b56d" size="large" /></View>;

  return (
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.content}
        data={trophyCase}
        keyExtractor={item => item.key}
        ListHeaderComponent={(
          <>
            <View style={styles.header}>
              <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                <Ionicons color="#ffffff" name="chevron-back" size={24} />
              </TouchableOpacity>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>{league?.name || 'League'}</Text>
                <Text style={styles.title}>Trophy Case</Text>
              </View>
            </View>
            <View style={styles.hero}>
              <Text style={styles.heroTitle}>Awards and Rings</Text>
              <Text style={styles.heroMeta}>Championship hardware, player awards, and league honors live here.</Text>
            </View>
            {isLeagueAdmin && isNba ? (
              <View style={styles.grantsPanel}>
                <View style={styles.grantsCopy}>
                  <Text style={styles.grantsTitle}>Upgrade Point Grants</Text>
                  <Text style={styles.grantsMeta}>{grantPoints} points ready from awards and lottery boosts</Text>
                </View>
                <TouchableOpacity
                  disabled={finalizingAwards || teams.length === 0}
                  onPress={finalizeAwards}
                  style={[styles.secondaryGrantsButton, (finalizingAwards || teams.length === 0) && styles.grantsButtonDisabled]}
                >
                  {finalizingAwards ? (
                    <ActivityIndicator color="#d7b56d" size="small" />
                  ) : (
                    <Text style={styles.secondaryGrantsButtonText}>Finalize Awards</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={applyingGrants || upgradeGrants.length === 0 || grantsAlreadyApplied}
                  onPress={applyUpgradePoints}
                  style={[styles.grantsButton, (applyingGrants || upgradeGrants.length === 0 || grantsAlreadyApplied) && styles.grantsButtonDisabled]}
                >
                  {applyingGrants ? (
                    <ActivityIndicator color="#050505" size="small" />
                  ) : (
                    <Text style={styles.grantsButtonText}>{grantsAlreadyApplied ? 'Already Applied' : 'Apply Upgrade Points'}</Text>
                  )}
                </TouchableOpacity>
                {upgradeGrants.slice(0, 3).map(grant => (
                  <Text key={grant.teamId} style={styles.grantLine}>{displayScheduleAbbr(grant.teamId)}: {grant.totalPoints} pts</Text>
                ))}
              </View>
            ) : null}
            <Text style={styles.sectionTitle}>{awardSectionTitle}</Text>
          </>
        )}
        renderItem={({ item }) => (
          <View style={[styles.awardCard, item.kind === 'championship' && styles.ringCard]}>
              <View style={styles.awardTop}>
                <View style={[styles.awardMark, item.kind === 'championship' && styles.ringMark]}>
                  <View style={styles.awardMarkIconWrap}>
                    <Ionicons color="#f5d58a" name={awardIconName(item)} size={22} />
                  </View>
                  <Text style={styles.awardMarkText} numberOfLines={2}>{item.shortTitle}</Text>
                </View>
              <View style={styles.awardCopy}>
                <Text style={styles.awardTitle}>{item.title}</Text>
                <Text style={styles.awardDesc}>{item.description}</Text>
              </View>
            </View>
            {item.records.length > 0 ? (
              <View style={styles.recordList}>
                {item.records.slice(0, 4).map((record, index) => (
                  <Text key={`${item.key}-${index}`} style={styles.recordText}>{recordLabel(record)}</Text>
                ))}
                {item.records.length > 4 ? (
                  <Text style={styles.moreText}>+{item.records.length - 4} more</Text>
                ) : null}
              </View>
            ) : (
              <Text style={styles.emptyRecord}>Not awarded yet</Text>
            )}
          </View>
        )}
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
  hero: { borderRadius: 8, borderWidth: 1, borderColor: '#6f5420', backgroundColor: '#171207', padding: 14, marginBottom: 18 },
  heroTitle: { color: '#f5d58a', fontSize: 18, fontWeight: '900' },
  heroMeta: { color: '#9a8559', fontSize: 12, fontWeight: '700', marginTop: 5, lineHeight: 17 },
  grantsPanel: { borderRadius: 8, borderWidth: 1, borderColor: '#214030', backgroundColor: '#0b1711', padding: 12, marginBottom: 18 },
  grantsCopy: { marginBottom: 10 },
  grantsTitle: { color: '#fff', fontSize: 15, fontWeight: '900' },
  grantsMeta: { color: '#7f9f8d', fontSize: 11, fontWeight: '800', marginTop: 3 },
  grantsButton: { minHeight: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#00e58b', marginBottom: 10 },
  secondaryGrantsButton: { minHeight: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#d7b56d55', backgroundColor: '#151207', marginBottom: 8 },
  grantsButtonDisabled: { opacity: 0.45 },
  grantsButtonText: { color: '#050505', fontSize: 13, fontWeight: '900' },
  secondaryGrantsButtonText: { color: '#d7b56d', fontSize: 13, fontWeight: '900' },
  grantLine: { color: '#b6cabb', fontSize: 11, fontWeight: '800', marginTop: 2 },
  sectionTitle: { color: '#888', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', marginBottom: 10 },
  awardCard: { borderRadius: 8, borderWidth: 1, borderColor: '#222', backgroundColor: '#111', padding: 12, marginBottom: 10 },
  ringCard: { borderColor: '#6f5420', backgroundColor: '#130f07' },
  awardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  awardMark: { width: 58, height: 58, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#181818', borderWidth: 1, borderColor: '#2c2c2c', paddingHorizontal: 5, paddingVertical: 5 },
  ringMark: { backgroundColor: '#211805', borderColor: '#8a6a28' },
  awardMarkIconWrap: { height: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  awardMarkText: { color: '#f5d58a', fontSize: 9, lineHeight: 10, fontWeight: '900', textAlign: 'center' },
  awardCopy: { flex: 1, minWidth: 0 },
  awardTitle: { color: '#fff', fontSize: 14, fontWeight: '900' },
  awardDesc: { color: '#777', fontSize: 11, fontWeight: '700', marginTop: 3, lineHeight: 15 },
  recordList: { marginTop: 10, gap: 5 },
  recordText: { color: '#ddd', fontSize: 12, fontWeight: '800' },
  moreText: { color: '#d7b56d', fontSize: 11, fontWeight: '900', marginTop: 2 },
  emptyRecord: { color: '#666', fontSize: 12, fontWeight: '800', marginTop: 10 },
});
