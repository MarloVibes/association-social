import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, getDocs, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import GlobalNav from '@/components/GlobalNav';
import { auth, db, functions } from '@/constants/firebase';
import type { ContractRole } from '@/domain/offseason/contracts';
import type { OffseasonState } from '@/domain/offseason/types';

type Stage = 're_signing' | 'free_agency';

type Props = {
  stage: Stage;
};

type Player = {
  id?: string;
  player_id?: string;
  full_name?: string;
  name?: string;
  position?: string;
  age?: number;
  salary?: number;
  contractYears?: number;
};

type Team = {
  id: string;
  name?: string;
  gmId?: string;
  players?: Player[];
};

type League = {
  name?: string;
  commissionerId?: string;
  coCommissioners?: string[];
  offseason?: OffseasonState;
};

const ROLES: { value: ContractRole; label: string }[] = [
  { value: 'franchise', label: 'Franchise' },
  { value: 'starter', label: 'Starter' },
  { value: 'rotation', label: 'Rotation' },
  { value: 'depth', label: 'Depth' },
];

function playerId(player: Player): string {
  return String(player.player_id || player.id || player.full_name || player.name || '');
}

function playerName(player: Player): string {
  return player.full_name || player.name || 'Unnamed player';
}

function formatMoney(value?: number): string {
  if (!Number.isFinite(value)) return 'No salary';
  if (Number(value) >= 1000000) return `$${(Number(value) / 1000000).toFixed(1)}M`;
  return `$${Math.round(Number(value) / 1000)}K`;
}

export default function ContractStageScreen({ stage }: Props) {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const router = useRouter();
  const uid = auth.currentUser?.uid;
  const [league, setLeague] = useState<League | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [freeAgents, setFreeAgents] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Player | null>(null);
  const [salary, setSalary] = useState('');
  const [years, setYears] = useState('1');
  const [role, setRole] = useState<ContractRole>('starter');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!leagueId) return;
    const unsubscribeLeague = onSnapshot(doc(db, 'leagues', leagueId), snapshot => {
      if (!snapshot.exists()) {
        Alert.alert('League not found');
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
    if (stage === 'free_agency') {
      getDocs(collection(db, 'leagues', leagueId, 'free_agents'))
        .then(snapshot => {
          const players = snapshot.docs.flatMap(item => item.data().players || []);
          setFreeAgents(players);
        })
        .catch(error => Alert.alert('Unable to load free agents', error.message));
    }
    return () => {
      unsubscribeLeague();
      unsubscribeTeams();
    };
  }, [leagueId, router, stage]);

  const myTeam = teams.find(team => team.gmId === uid);
  const rosteredIds = useMemo(
    () => new Set(teams.flatMap(team => team.players || []).map(playerId)),
    [teams],
  );
  const candidates = stage === 're_signing'
    ? (myTeam?.players || []).filter(player => (
      player.contractYears == null || player.contractYears <= 1
    ))
    : freeAgents.filter(player => !rosteredIds.has(playerId(player)));
  const offseason = league?.offseason;
  const stageIsCurrent = offseason?.stage === stage;
  const isCommissioner = Boolean(
    uid
    && (
      league?.commissionerId === uid
      || (league?.coCommissioners || []).includes(uid)
    ),
  );
  const myTeamComplete = Boolean(
    myTeam && offseason?.completedTeamIds?.includes(myTeam.id),
  );

  const openOffer = (player: Player) => {
    setSelected(player);
    setSalary(String(player.salary || ''));
    setYears(String(Math.max(1, player.contractYears || 1)));
    setRole('starter');
  };

  const submitOffer = async () => {
    if (!leagueId || !myTeam || !selected || !offseason) return;
    const salaryNumber = Number(salary.replace(/[$,\s]/g, ''));
    const yearsNumber = Number(years);
    if (!Number.isFinite(salaryNumber) || salaryNumber < 0) {
      Alert.alert('Invalid salary', 'Enter a valid annual salary.');
      return;
    }
    if (!Number.isInteger(yearsNumber) || yearsNumber < 1 || yearsNumber > 7) {
      Alert.alert('Invalid years', 'Contract length must be between 1 and 7 years.');
      return;
    }
    setWorking(true);
    try {
      const submit = httpsCallable(functions, 'submitContractOffer');
      await submit({
        leagueId,
        teamId: myTeam.id,
        playerId: playerId(selected),
        player: selected,
        salary: salaryNumber,
        years: yearsNumber,
        role,
        expectedStage: stage,
        expectedVersion: offseason.version,
      });
      setSelected(null);
      Alert.alert('Offer submitted', `${playerName(selected)} received your offer.`);
    } catch (error: any) {
      Alert.alert('Offer rejected', error.message || 'The offer could not be submitted.');
    } finally {
      setWorking(false);
    }
  };

  const completeAction = async () => {
    if (!leagueId || !offseason) return;
    setWorking(true);
    try {
      const complete = httpsCallable(functions, 'completeOffseasonTeamAction');
      await complete({
        leagueId,
        expectedStage: stage,
        expectedVersion: offseason.version,
      });
      Alert.alert('Team ready', 'Your commissioner can see that your team is finished.');
    } catch (error: any) {
      Alert.alert('Could not finish', error.message || 'Please try again.');
    } finally {
      setWorking(false);
    }
  };

  const resolveRound = async () => {
    if (!leagueId || !offseason) return;
    setWorking(true);
    try {
      const resolve = httpsCallable(functions, 'resolveFreeAgencyRound');
      const response: any = await resolve({
        leagueId,
        expectedStage: stage,
        expectedVersion: offseason.version,
      });
      Alert.alert('Round resolved', `${response.data?.resolvedCount || 0} player decisions completed.`);
    } catch (error: any) {
      Alert.alert('Could not resolve round', error.message || 'Please try again.');
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator color="#00e58b" size="large" /></View>;
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons color="#ffffff" name="chevron-back" size={24} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>{league?.name || 'League'}</Text>
          <Text style={styles.title}>{stage === 're_signing' ? 'Re-Signing' : 'Free Agency'}</Text>
        </View>
        <View style={styles.iconButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {!stageIsCurrent && (
          <View style={styles.notice}>
            <Ionicons color="#f4b942" name="time-outline" size={18} />
            <Text style={styles.noticeText}>This stage is not currently active.</Text>
          </View>
        )}

        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>
            {stage === 're_signing' ? 'Eligible players' : 'Available players'}
          </Text>
          <Text style={styles.summaryText}>
            {myTeam ? `${myTeam.name || 'Your team'} · ${candidates.length} options` : 'Claim a team to submit offers.'}
          </Text>
        </View>

        {candidates.length === 0 ? (
          <Text style={styles.empty}>No eligible players are available right now.</Text>
        ) : candidates.map(player => (
          <TouchableOpacity
            disabled={!myTeam || !stageIsCurrent || myTeamComplete}
            key={playerId(player)}
            onPress={() => openOffer(player)}
            style={styles.playerRow}
          >
            <View style={styles.position}>
              <Text style={styles.positionText}>{player.position || '?'}</Text>
            </View>
            <View style={styles.playerCopy}>
              <Text style={styles.playerName}>{playerName(player)}</Text>
              <Text style={styles.playerMeta}>
                {[player.age ? `Age ${player.age}` : null, formatMoney(player.salary)].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Ionicons color="#69706b" name="chevron-forward" size={20} />
          </TouchableOpacity>
        ))}

        {myTeam && stageIsCurrent && (
          <TouchableOpacity
            disabled={working || myTeamComplete}
            onPress={completeAction}
            style={[styles.completeButton, myTeamComplete && styles.completeButtonDone]}
          >
            <Ionicons
              color={myTeamComplete ? '#00e58b' : '#08120d'}
              name={myTeamComplete ? 'checkmark-circle' : 'flag'}
              size={20}
            />
            <Text style={[styles.completeText, myTeamComplete && styles.completeTextDone]}>
              {myTeamComplete ? 'Team marked ready' : 'Finish team action'}
            </Text>
          </TouchableOpacity>
        )}

        {isCommissioner && stageIsCurrent && (
          <TouchableOpacity disabled={working} onPress={resolveRound} style={styles.resolveButton}>
            <Text style={styles.resolveText}>Resolve submitted offers</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <Modal
        animationType="slide"
        onRequestClose={() => setSelected(null)}
        presentationStyle="pageSheet"
        visible={Boolean(selected)}
      >
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setSelected(null)}>
              <Text style={styles.cancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Contract Offer</Text>
            <TouchableOpacity disabled={working} onPress={submitOffer}>
              <Text style={styles.submit}>Submit</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.offerPlayer}>{selected ? playerName(selected) : ''}</Text>
            <Text style={styles.inputLabel}>Annual salary</Text>
            <TextInput
              keyboardType="number-pad"
              onChangeText={setSalary}
              placeholder="12000000"
              placeholderTextColor="#555d57"
              style={styles.input}
              value={salary}
            />
            <Text style={styles.inputLabel}>Years</Text>
            <TextInput
              keyboardType="number-pad"
              onChangeText={setYears}
              placeholder="3"
              placeholderTextColor="#555d57"
              style={styles.input}
              value={years}
            />
            <Text style={styles.inputLabel}>Role</Text>
            <View style={styles.roles}>
              {ROLES.map(option => (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => setRole(option.value)}
                  style={[styles.roleButton, role === option.value && styles.roleButtonActive]}
                >
                  <Text style={[styles.roleText, role === option.value && styles.roleTextActive]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      </Modal>
      <GlobalNav />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#090b0a' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#090b0a' },
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
  content: { paddingBottom: 130 },
  notice: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#312a19',
  },
  noticeText: { color: '#d7bd78', fontSize: 13 },
  summary: { paddingHorizontal: 22, paddingVertical: 22, borderBottomWidth: 1, borderBottomColor: '#1d211e' },
  summaryTitle: { color: '#ffffff', fontSize: 20, fontWeight: '800' },
  summaryText: { color: '#7d857f', fontSize: 13, marginTop: 5 },
  empty: { color: '#777f79', fontSize: 14, padding: 24, textAlign: 'center' },
  playerRow: {
    minHeight: 72,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#1b1f1c',
  },
  position: {
    width: 38,
    height: 38,
    borderRadius: 6,
    backgroundColor: '#18251e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  positionText: { color: '#00e58b', fontSize: 12, fontWeight: '800' },
  playerCopy: { flex: 1 },
  playerName: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  playerMeta: { color: '#69706b', fontSize: 12, marginTop: 3 },
  completeButton: {
    marginHorizontal: 20,
    marginTop: 24,
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: '#00e58b',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  completeButtonDone: { backgroundColor: '#12231a', borderWidth: 1, borderColor: '#28603f' },
  completeText: { color: '#08120d', fontSize: 15, fontWeight: '800' },
  completeTextDone: { color: '#00e58b' },
  resolveButton: {
    marginHorizontal: 20,
    marginTop: 12,
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f4b942',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resolveText: { color: '#f4b942', fontSize: 14, fontWeight: '800' },
  modal: { flex: 1, backgroundColor: '#090b0a' },
  modalHeader: {
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#242825',
  },
  cancel: { color: '#a1a8a3', fontSize: 15 },
  modalTitle: { color: '#ffffff', fontSize: 17, fontWeight: '800' },
  submit: { color: '#00e58b', fontSize: 15, fontWeight: '800' },
  modalContent: { padding: 22 },
  offerPlayer: { color: '#ffffff', fontSize: 26, fontWeight: '800', marginBottom: 28 },
  inputLabel: { color: '#a6ada8', fontSize: 12, fontWeight: '700', marginBottom: 8, marginTop: 16 },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: '#303632',
    borderRadius: 7,
    color: '#ffffff',
    fontSize: 16,
    paddingHorizontal: 14,
    backgroundColor: '#111411',
  },
  roles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roleButton: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#303632',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleButtonActive: { backgroundColor: '#163323', borderColor: '#00e58b' },
  roleText: { color: '#818983', fontSize: 13, fontWeight: '700' },
  roleTextActive: { color: '#00e58b' },
});
