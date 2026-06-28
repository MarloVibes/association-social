import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import PlayerCard from '@/components/PlayerCard';
import SportTeamLogo from '@/components/SportTeamLogo';
import { auth, db } from '@/constants/firebase';
import { getEraCap } from '@/constants/eraCaps';
import { compareRosterPlayersByValue } from '@/domain/nba/rotation';

type Player = {
  id?: string;
  player_id?: string;
  full_name?: string;
  name?: string;
  position?: string;
  team?: string;
  salary?: number;
  currentSalary?: number;
  contractYears?: number;
  contract?: {
    salary?: number;
    years?: number;
    annualSalary?: number;
    expiresYear?: number;
  };
};

type Team = {
  id: string;
  name?: string;
  abbreviation?: string;
  gmId?: string;
  salaryCap?: number;
  budget?: number;
  players?: Player[];
};

function money(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '$0';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value >= 10_000_000 ? 1 : 2)}M`;
  return `$${Math.round(value / 1_000)}K`;
}

function playerSalary(player: Player) {
  return Number(player.salary || player.currentSalary || player.contract?.salary || player.contract?.annualSalary || 0);
}

function playerYears(player: Player) {
  const years = Number(player.contractYears || player.contract?.years || 1);
  return Number.isFinite(years) && years > 0 ? years : 1;
}

function playerName(player: Player) {
  return player.full_name || player.name || 'Unknown Player';
}

export default function FinancesScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const router = useRouter();
  const [league, setLeague] = useState<any>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  useEffect(() => {
    if (!leagueId) return;
    const unsubscribeLeague = onSnapshot(doc(db, 'leagues', leagueId), snapshot => {
      setLeague(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
    });
    const unsubscribeTeams = onSnapshot(collection(db, 'leagues', leagueId, 'teams'), snapshot => {
      const nextTeams = snapshot.docs.map(item => ({ id: item.id, ...item.data() } as Team));
      setTeams(nextTeams);
      setSelectedTeamId(current => current || nextTeams.find(team => team.gmId === auth.currentUser?.uid)?.id || nextTeams[0]?.id || '');
      setLoading(false);
    }, error => {
      console.warn('Finances unavailable:', error);
      setLoading(false);
    });
    return () => {
      unsubscribeLeague();
      unsubscribeTeams();
    };
  }, [leagueId]);

  const selectedTeam = teams.find(team => team.id === selectedTeamId) || teams[0] || null;
  const cap = Number(selectedTeam?.salaryCap || selectedTeam?.budget || league?.salaryCap || league?.teamBudget || getEraCap(league?.era));
  const players = useMemo(() => [...(selectedTeam?.players || [])].sort((a, b) => {
    const salaryDiff = playerSalary(b) - playerSalary(a);
    if (salaryDiff !== 0) return salaryDiff;
    return compareRosterPlayersByValue(a, b);
  }), [selectedTeam?.players]);
  const payroll = players.reduce((sum, player) => sum + playerSalary(player), 0);
  const capRoom = cap - payroll;
  const taxLine = Math.round(cap * 1.22);
  const taxRoom = taxLine - payroll;
  const largestContracts = players.slice(0, 3);

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator color="#00e58b" size="large" /></View>;
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
            <Ionicons color="#ffffff" name="chevron-back" size={24} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>{league?.name || 'League'}</Text>
            <Text style={styles.title}>Finances</Text>
          </View>
        </View>

        {!selectedTeam ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No team finances yet</Text>
            <Text style={styles.emptyText}>Once teams are claimed or drafted, payroll and contract tables will appear here.</Text>
          </View>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.teamStrip}>
              {teams.map(team => (
                <TouchableOpacity
                  key={team.id}
                  style={[styles.teamChip, selectedTeam.id === team.id && styles.teamChipActive]}
                  onPress={() => {
                    setSelectedTeamId(team.id);
                    setSelectedPlayer(null);
                  }}
                >
                  <SportTeamLogo sport="nba" abbr={team.abbreviation || team.id} era={league?.currentYear} style={styles.chipLogo} fontSize={8} />
                  <Text style={[styles.teamChipText, selectedTeam.id === team.id && styles.teamChipTextActive]} numberOfLines={1}>{team.abbreviation || team.name || 'TEAM'}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.teamHeader}>
              <View style={styles.teamLogoDisc}>
                <SportTeamLogo sport="nba" abbr={selectedTeam.abbreviation || selectedTeam.id} era={league?.currentYear} style={styles.teamLogo} fontSize={12} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.teamName}>{selectedTeam.name || selectedTeam.abbreviation || 'Team'}</Text>
                <Text style={styles.teamMeta}>{players.length} contracts</Text>
              </View>
            </View>

            <View style={styles.financeGrid}>
              <View style={styles.financeTile}>
                <Text style={styles.tileLabel}>Payroll</Text>
                <Text style={styles.tileValue}>{money(payroll)}</Text>
              </View>
              <View style={styles.financeTile}>
                <Text style={styles.tileLabel}>Cap Room</Text>
                <Text style={[styles.tileValue, capRoom < 0 && styles.negativeValue]}>{money(Math.abs(capRoom))}</Text>
                <Text style={styles.tileHint}>{capRoom >= 0 ? 'Available' : 'Over cap'}</Text>
              </View>
              <View style={styles.financeTile}>
                <Text style={styles.tileLabel}>Salary Cap</Text>
                <Text style={styles.tileValue}>{money(cap)}</Text>
              </View>
              <View style={styles.financeTile}>
                <Text style={styles.tileLabel}>Tax Room</Text>
                <Text style={[styles.tileValue, taxRoom < 0 && styles.negativeValue]}>{money(Math.abs(taxRoom))}</Text>
                <Text style={styles.tileHint}>{taxRoom >= 0 ? 'Before tax' : 'Over tax'}</Text>
              </View>
            </View>

            <View style={styles.capBar}>
              <View style={[styles.capFill, { width: `${Math.min(100, Math.round((payroll / Math.max(1, cap)) * 100))}%` }]} />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Largest Contracts</Text>
              {largestContracts.length === 0 ? (
                <Text style={styles.emptyText}>No contract data yet.</Text>
              ) : largestContracts.map(player => (
                <TouchableOpacity
                  key={player.player_id || player.id || playerName(player)}
                  style={styles.contractRowCompact}
                  onPress={() => setSelectedPlayer({ ...player, team: selectedTeam.abbreviation || selectedTeam.name })}
                >
                  <Text style={styles.contractName} numberOfLines={1}>{playerName(player)}</Text>
                  <Text style={styles.contractAmount}>{money(playerSalary(player))}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.contractTable}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, styles.nameCol]}>Player</Text>
                <Text style={[styles.tableHeaderText, styles.posCol]}>Pos</Text>
                <Text style={[styles.tableHeaderText, styles.moneyCol]}>Salary</Text>
                <Text style={[styles.tableHeaderText, styles.yearsCol]}>Yrs</Text>
              </View>
              {players.map(player => (
                <TouchableOpacity
                  key={player.player_id || player.id || playerName(player)}
                  style={styles.contractRow}
                  onPress={() => setSelectedPlayer({ ...player, team: selectedTeam.abbreviation || selectedTeam.name })}
                >
                  <Text style={[styles.contractName, styles.nameCol]} numberOfLines={1}>{playerName(player)}</Text>
                  <Text style={[styles.contractMeta, styles.posCol]}>{player.position || '-'}</Text>
                  <Text style={[styles.contractAmount, styles.moneyCol]}>{money(playerSalary(player))}</Text>
                  <Text style={[styles.contractMeta, styles.yearsCol]}>{playerYears(player)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </ScrollView>
      <PlayerCard
        player={selectedPlayer}
        era={league?.era || 'current'}
        sport="nba"
        leagueId={leagueId}
        teamId={selectedTeam?.id || ''}
        visible={!!selectedPlayer}
        onClose={() => setSelectedPlayer(null)}
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
  teamStrip: { gap: 8, paddingBottom: 12 },
  teamChip: { minWidth: 82, height: 42, borderRadius: 8, borderWidth: 1, borderColor: '#242424', backgroundColor: '#101010', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10 },
  teamChipActive: { borderColor: '#00e58b', backgroundColor: '#0a1d14' },
  chipLogo: { width: 24, height: 24 },
  teamChipText: { color: '#888', fontSize: 11, fontWeight: '900', maxWidth: 44 },
  teamChipTextActive: { color: '#00e58b' },
  teamHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 8, borderWidth: 1, borderColor: '#1f3328', backgroundColor: '#101410', padding: 14, marginBottom: 12 },
  teamLogoDisc: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: '#171717', borderWidth: 1, borderColor: '#2a2a2a' },
  teamLogo: { width: 44, height: 44 },
  teamName: { color: '#fff', fontSize: 20, fontWeight: '900' },
  teamMeta: { color: '#777', fontSize: 12, fontWeight: '800', marginTop: 3 },
  financeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  financeTile: { width: '48.7%', minHeight: 88, borderRadius: 8, backgroundColor: '#111', borderWidth: 1, borderColor: '#202020', padding: 12, justifyContent: 'center' },
  tileLabel: { color: '#777', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  tileValue: { color: '#00e58b', fontSize: 21, fontWeight: '900', marginTop: 5 },
  negativeValue: { color: '#ff6b6b' },
  tileHint: { color: '#666', fontSize: 10, fontWeight: '800', marginTop: 2 },
  capBar: { height: 9, borderRadius: 999, backgroundColor: '#202020', overflow: 'hidden', marginBottom: 16 },
  capFill: { height: 9, borderRadius: 999, backgroundColor: '#00e58b' },
  section: { borderRadius: 8, borderWidth: 1, borderColor: '#202020', backgroundColor: '#101010', padding: 14, marginBottom: 14 },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: '900', marginBottom: 10 },
  emptyCard: { borderRadius: 8, borderWidth: 1, borderColor: '#202020', backgroundColor: '#101010', padding: 18 },
  emptyTitle: { color: '#fff', fontSize: 17, fontWeight: '900', marginBottom: 6 },
  emptyText: { color: '#888', fontSize: 12, lineHeight: 18, fontWeight: '700' },
  contractTable: { borderRadius: 8, borderWidth: 1, borderColor: '#202020', backgroundColor: '#0b0b0b', overflow: 'hidden' },
  tableHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#050505', borderBottomWidth: 1, borderBottomColor: '#202020', paddingHorizontal: 12, paddingVertical: 10 },
  tableHeaderText: { color: '#777', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  contractRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#191919' },
  contractRowCompact: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1b1b1b' },
  nameCol: { flex: 1, minWidth: 0 },
  posCol: { width: 40, textAlign: 'center' },
  moneyCol: { width: 86, textAlign: 'right' },
  yearsCol: { width: 34, textAlign: 'right' },
  contractName: { color: '#fff', fontSize: 13, fontWeight: '900' },
  contractMeta: { color: '#777', fontSize: 12, fontWeight: '800' },
  contractAmount: { color: '#00e58b', fontSize: 12, fontWeight: '900' },
});
