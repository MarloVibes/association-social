import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import GlobalNav from '@/components/GlobalNav';
import { auth, db, functions } from '@/constants/firebase';
import { validateExpansionProposal } from '@/domain/nba/expansion';

type ExpansionTeam = {
  city?: string;
  name?: string;
  abbreviation?: string;
  conference?: string;
  division?: string;
  primaryColor?: string;
  secondaryColor?: string;
};

type Team = {
  id: string;
  abbreviation?: string;
  teamId?: string;
  name?: string;
  gmId?: string;
  players?: { id?: string; player_id?: string; playerId?: string; full_name?: string; name?: string; value?: number; overall?: number; rating?: number }[];
  protectedPlayerIds?: string[];
  isExpansionTeam?: boolean;
};

type League = {
  name?: string;
  currentYear?: number;
  commissionerId?: string;
  coCommissioners?: string[];
  scheduleLocked?: boolean;
  expansionDraftCompleted?: boolean;
  expansionDraft?: {
    selections?: Record<string, { playerId: string; name: string; sourceTeamId: string }[]>;
  };
  expansionProposal?: {
    enabled?: boolean;
    maxProtectedPlayers?: number;
    picksPerExpansionTeam?: number;
    teams?: ExpansionTeam[];
  };
};

function teamLabel(team: ExpansionTeam) {
  return [team.city, team.name].filter(Boolean).join(' ') || team.abbreviation || 'Expansion Team';
}

export default function ExpansionScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const router = useRouter();
  const uid = auth.currentUser?.uid;
  const [league, setLeague] = useState<League | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProtectionIds, setSelectedProtectionIds] = useState<string[]>([]);
  const [savingProtection, setSavingProtection] = useState(false);
  const [runningDraft, setRunningDraft] = useState(false);

  useEffect(() => {
    if (!leagueId) return undefined;
    const unsubscribeLeague = onSnapshot(doc(db, 'leagues', leagueId), snapshot => {
      setLeague(snapshot.exists() ? snapshot.data() as League : null);
      setLoading(false);
    }, error => {
      Alert.alert('Unable to load expansion', error.message);
      setLoading(false);
    });
    const unsubscribeTeams = onSnapshot(collection(db, 'leagues', leagueId, 'teams'), snapshot => {
      setTeams(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as Team)));
    });
    return () => {
      unsubscribeLeague();
      unsubscribeTeams();
    };
  }, [leagueId]);

  const proposedTeams = useMemo(() => league?.expansionProposal?.teams || [], [league?.expansionProposal?.teams]);
  const maxProtected = Number(league?.expansionProposal?.maxProtectedPlayers || 8);
  const picksPerExpansionTeam = Number(league?.expansionProposal?.picksPerExpansionTeam || 8);
  const myTeam = useMemo(() => teams.find(team => team.gmId === uid), [teams, uid]);
  const isLeagueAdmin = Boolean(
    uid
    && league
    && (
      league.commissionerId === uid
      || (league.coCommissioners || []).includes(uid)
    ),
  );
  const validation = useMemo(() => validateExpansionProposal({
    currentTeams: teams.length || 30,
    addedTeams: proposedTeams.length,
    existingAbbreviations: teams.map(team => team.abbreviation || team.id),
    scheduleLocked: league?.scheduleLocked,
    teams: proposedTeams.map(team => ({
      city: team.city || '',
      name: team.name || '',
      abbreviation: team.abbreviation || '',
      conference: team.conference,
      division: team.division,
      primaryColor: team.primaryColor,
      secondaryColor: team.secondaryColor,
    })),
  }), [league?.scheduleLocked, proposedTeams, teams]);

  useEffect(() => {
    setSelectedProtectionIds(myTeam?.protectedPlayerIds || []);
  }, [myTeam?.id, myTeam?.protectedPlayerIds]);

  const playerId = (player: NonNullable<Team['players']>[number]) => String(player.id || player.player_id || player.playerId || player.full_name || player.name || '');
  const playerName = (player: NonNullable<Team['players']>[number]) => String(player.full_name || player.name || playerId(player) || 'Player');
  const playerValue = (player: NonNullable<Team['players']>[number]) => Number(player.value || player.overall || player.rating || 0);

  const toggleProtected = (id: string) => {
    setSelectedProtectionIds((current) => {
      if (current.includes(id)) return current.filter(item => item !== id);
      if (current.length >= maxProtected) {
        Alert.alert('Protection limit', `You can protect up to ${maxProtected} players.`);
        return current;
      }
      return [...current, id];
    });
  };

  const saveProtection = async () => {
    if (!leagueId || !myTeam) return;
    setSavingProtection(true);
    try {
      const submitExpansionProtection = httpsCallable(functions, 'submitExpansionProtection');
      await submitExpansionProtection({
        leagueId,
        teamId: myTeam.id,
        protectedPlayerIds: selectedProtectionIds,
      });
      Alert.alert('Saved', 'Your protected players are locked for the expansion draft.');
    } catch (error: any) {
      Alert.alert('Protection failed', error.message || 'Please try again.');
    } finally {
      setSavingProtection(false);
    }
  };

  const runDraft = () => {
    if (!leagueId || !isLeagueAdmin || !validation.valid) return;
    Alert.alert('Run Expansion Draft', 'This will create expansion rosters and remove drafted players from current teams.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Run Draft',
        style: 'destructive',
        onPress: async () => {
          setRunningDraft(true);
          try {
            const runExpansionDraft = httpsCallable(functions, 'runExpansionDraft');
            await runExpansionDraft({ leagueId, picksPerExpansionTeam });
            Alert.alert('Draft Complete', 'Expansion teams have selected their players.');
          } catch (error: any) {
            Alert.alert('Draft failed', error.message || 'Please try again.');
          } finally {
            setRunningDraft(false);
          }
        },
      },
    ]);
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator color="#00e58b" size="large" /></View>;

  return (
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.content}
        data={proposedTeams}
        keyExtractor={item => item.abbreviation || teamLabel(item)}
        ListHeaderComponent={(
          <>
            <View style={styles.header}>
              <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                <Ionicons color="#ffffff" name="chevron-back" size={24} />
              </TouchableOpacity>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>{league?.name || 'League'}</Text>
                <Text style={styles.title}>Expansion Teams</Text>
              </View>
            </View>
            <View style={styles.summary}>
              <Text style={styles.summaryTitle}>{teams.length} current teams</Text>
              <Text style={styles.summaryMeta}>{proposedTeams.length} proposed expansion teams · Max 36</Text>
            </View>
            {!validation.valid ? (
              <View style={styles.warning}>
                <Ionicons color="#f4b942" name="warning-outline" size={18} />
                <Text style={styles.warningText}>{validation.errors.join(', ')}</Text>
              </View>
            ) : (
              <View style={styles.readyPanel}>
                <Ionicons color="#00e58b" name="checkmark-circle" size={18} />
                <Text style={styles.readyText}>Expansion proposal is valid. Protect players, run the draft, then advance from Commissioner Control.</Text>
              </View>
            )}
            {myTeam && !league?.expansionDraftCompleted ? (
              <View style={styles.panel}>
                <Text style={styles.sectionTitle}>Protect Players</Text>
                <Text style={styles.summaryMeta}>{selectedProtectionIds.length}/{maxProtected} protected · {myTeam.name || myTeam.abbreviation || 'My Team'}</Text>
                {(myTeam.players || [])
                  .slice()
                  .sort((left, right) => playerValue(right) - playerValue(left))
                  .slice(0, 15)
                  .map((player) => {
                    const id = playerId(player);
                    const selected = selectedProtectionIds.includes(id);
                    return (
                      <TouchableOpacity key={id} style={styles.playerRow} onPress={() => toggleProtected(id)}>
                        <Ionicons color={selected ? '#00e58b' : '#666'} name={selected ? 'shield-checkmark' : 'shield-outline'} size={20} />
                        <Text style={styles.playerName} numberOfLines={1}>{playerName(player)}</Text>
                        <Text style={styles.playerMeta}>{playerValue(player) || '-'}</Text>
                      </TouchableOpacity>
                    );
                  })}
                <TouchableOpacity disabled={savingProtection} style={[styles.actionButton, savingProtection && styles.disabled]} onPress={saveProtection}>
                  {savingProtection ? <ActivityIndicator color="#06130c" /> : <Text style={styles.actionButtonText}>Save Protection List</Text>}
                </TouchableOpacity>
              </View>
            ) : null}
            {isLeagueAdmin && validation.valid && !league?.expansionDraftCompleted ? (
              <TouchableOpacity disabled={runningDraft} style={[styles.draftButton, runningDraft && styles.disabled]} onPress={runDraft}>
                {runningDraft ? <ActivityIndicator color="#06130c" /> : <Text style={styles.actionButtonText}>Run Expansion Draft</Text>}
              </TouchableOpacity>
            ) : null}
            {league?.expansionDraftCompleted ? (
              <View style={styles.panel}>
                <Text style={styles.sectionTitle}>Expansion Draft Results</Text>
                {Object.entries(league.expansionDraft?.selections || {}).map(([teamId, picks]) => (
                  <View key={teamId} style={styles.resultGroup}>
                    <Text style={styles.resultTitle}>{teamId}</Text>
                    {picks.slice(0, 8).map(pick => (
                      <Text key={pick.playerId} style={styles.resultText}>{pick.name} from {pick.sourceTeamId}</Text>
                    ))}
                  </View>
                ))}
              </View>
            ) : null}
            <Text style={styles.sectionTitle}>Proposed Teams</Text>
          </>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No expansion teams proposed for this offseason.</Text>}
        renderItem={({ item }) => (
          <View style={styles.teamCard}>
            <View style={[styles.colorSwatch, { backgroundColor: item.primaryColor || '#00e58b' }]} />
            <View style={styles.teamCopy}>
              <Text style={styles.teamName}>{teamLabel(item)}</Text>
              <Text style={styles.teamMeta}>
                {[item.abbreviation, item.conference, item.division].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </View>
        )}
      />
      <GlobalNav />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#090b0a' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#090b0a' },
  content: { padding: 18, paddingTop: 58, paddingBottom: 130 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  iconButton: { width: 42, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#151515' },
  headerCopy: { flex: 1 },
  eyebrow: { color: '#777f79', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  title: { color: '#ffffff', fontSize: 27, fontWeight: '900' },
  summary: { borderRadius: 8, borderWidth: 1, borderColor: '#24382c', backgroundColor: '#101811', padding: 14, marginBottom: 12 },
  summaryTitle: { color: '#ffffff', fontSize: 17, fontWeight: '900' },
  summaryMeta: { color: '#7d857f', fontSize: 12, fontWeight: '700', marginTop: 5 },
  warning: { flexDirection: 'row', gap: 8, borderRadius: 8, borderWidth: 1, borderColor: '#6f5420', backgroundColor: '#171207', padding: 12, marginBottom: 12 },
  warningText: { color: '#d7bd78', flex: 1, fontSize: 12, fontWeight: '800', lineHeight: 17 },
  readyPanel: { flexDirection: 'row', gap: 8, borderRadius: 8, borderWidth: 1, borderColor: '#214030', backgroundColor: '#0b1711', padding: 12, marginBottom: 12 },
  readyText: { color: '#b6cabb', flex: 1, fontSize: 12, fontWeight: '800', lineHeight: 17 },
  panel: { borderRadius: 8, borderWidth: 1, borderColor: '#222', backgroundColor: '#101010', padding: 12, marginBottom: 12 },
  sectionTitle: { color: '#ffffff', fontSize: 16, fontWeight: '900', marginBottom: 10 },
  playerRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: '#1e1e1e' },
  playerName: { flex: 1, minWidth: 0, color: '#fff', fontSize: 13, fontWeight: '800' },
  playerMeta: { color: '#777', fontSize: 11, fontWeight: '900' },
  actionButton: { minHeight: 42, borderRadius: 8, backgroundColor: '#00e58b', alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  actionButtonText: { color: '#06130c', fontSize: 12, fontWeight: '900' },
  draftButton: { minHeight: 44, borderRadius: 8, backgroundColor: '#00e58b', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  disabled: { opacity: 0.55 },
  resultGroup: { borderTopWidth: 1, borderTopColor: '#202020', paddingTop: 9, marginTop: 9 },
  resultTitle: { color: '#00e58b', fontSize: 12, fontWeight: '900', marginBottom: 4 },
  resultText: { color: '#cfd5d1', fontSize: 12, fontWeight: '700', lineHeight: 18 },
  empty: { color: '#777f79', fontSize: 14, lineHeight: 20 },
  teamCard: { minHeight: 70, borderRadius: 8, borderWidth: 1, borderColor: '#222', backgroundColor: '#111', flexDirection: 'row', alignItems: 'center', padding: 12, marginBottom: 10 },
  colorSwatch: { width: 38, height: 38, borderRadius: 8, marginRight: 12 },
  teamCopy: { flex: 1, minWidth: 0 },
  teamName: { color: '#fff', fontSize: 15, fontWeight: '900' },
  teamMeta: { color: '#777', fontSize: 11, fontWeight: '800', marginTop: 4 },
});
