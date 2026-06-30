import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
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
import PlayerCard, { leagueDateFromRecord } from '@/components/PlayerCard';
import { auth, db, functions } from '@/constants/firebase';
import {
  derivePlayerContractPreferences,
  contractAvailabilityMessage,
  expectedAnnualSalary,
  scoreContractOffer,
  selectContractCandidates,
  type ContractRole,
  type EraSalaryBaseline,
  type PlayerContractPreferences,
} from '@/domain/offseason/contracts';
import type { OffseasonState } from '@/domain/offseason/types';

type Stage = 're_signing' | 'free_agency' | 'extension';

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
  contract?: {
    salary?: number;
    years?: number;
    role?: string;
  };
  label?: string;
  tier?: string;
  overall?: number;
  team?: string;
  teamHistory?: string[];
  playoffAppearances?: number;
  loyalty?: number;
  extensionAsk?: {
    salary?: number;
    years?: number;
    role?: ContractRole;
    acceptanceFloor?: number;
  };
};

type Team = {
  id: string;
  name?: string;
  gmId?: string;
  players?: Player[];
  contender?: number;
  reputation?: number;
};

type League = {
  name?: string;
  era?: string;
  sport?: string;
  commissionerId?: string;
  coCommissioners?: string[];
  offseason?: OffseasonState;
};

type ContractOffer = {
  id: string;
  teamId?: string;
  playerId?: string;
  player?: Player;
  salary?: number;
  years?: number;
  role?: ContractRole;
  stage?: Stage;
  status?: string;
  preferenceScore?: number;
};

type ContractResolution = {
  id: string;
  playerId?: string;
  winnerTeamId?: string;
  winningOfferId?: string;
  stage?: Stage;
  preferenceScore?: number;
};

type Tab = 'available' | 'offers' | 'decisions';

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

function salaryBaseline(players: Player[]): EraSalaryBaseline {
  const salaries = players
    .map(player => Number(player.salary || player.contract?.salary))
    .filter(value => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  if (salaries.length === 0) return { median: 8_000_000, p75: 14_000_000, p90: 24_000_000 };
  const at = (percentile: number) => salaries[Math.min(salaries.length - 1, Math.max(0, Math.floor((salaries.length - 1) * percentile)))];
  return { median: at(0.5), p75: at(0.75), p90: at(0.9) };
}

function preferenceBadges(preferences: PlayerContractPreferences): string[] {
  const labels: Record<keyof PlayerContractPreferences, string> = {
    money: 'Money',
    loyalty: 'Loyalty',
    winning: 'Winning',
    role: 'Role',
    market: 'Market',
    security: 'Security',
  };
  return (Object.entries(preferences) as Array<[keyof PlayerContractPreferences, number]>)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([key]) => labels[key]);
}

function offerStatusLabel(status?: string): string {
  if (status === 'accepted') return 'Accepted';
  if (status === 'rejected') return 'Declined';
  if (status === 'invalid') return 'Invalid';
  return 'Pending';
}

function offerStrengthLabel(score: number): string {
  if (score >= 76) return 'Strong';
  if (score >= 62) return 'Competitive';
  if (score >= 48) return 'Long Shot';
  return 'Weak';
}

export default function ContractStageScreen({ stage }: Props) {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const router = useRouter();
  const uid = auth.currentUser?.uid;
  const [league, setLeague] = useState<League | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [leagueFreeAgents, setLeagueFreeAgents] = useState<Player[]>([]);
  const [vaultFreeAgents, setVaultFreeAgents] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Player | null>(null);
  const [selectedPlayerCard, setSelectedPlayerCard] = useState<{ player: Player; teamId: string } | null>(null);
  const [tab, setTab] = useState<Tab>('available');
  const [offers, setOffers] = useState<ContractOffer[]>([]);
  const [resolutions, setResolutions] = useState<ContractResolution[]>([]);
  const [extensionWindows, setExtensionWindows] = useState<any[]>([]);
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
    let unsubscribeFreeAgents: (() => void) | undefined;
    if (stage === 'free_agency') {
      unsubscribeFreeAgents = onSnapshot(
        collection(db, 'leagues', leagueId, 'free_agents'),
        snapshot => {
          const players = snapshot.docs.flatMap(item => item.data().players || []);
          setLeagueFreeAgents(players);
        },
        error => Alert.alert('Unable to load free agents', error.message),
      );
    }
    let unsubscribeExtensionWindows: (() => void) | undefined;
    if (stage === 'extension') {
      unsubscribeExtensionWindows = onSnapshot(
        collection(db, 'leagues', leagueId, 'extension_windows'),
        snapshot => setExtensionWindows(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))),
      );
    }
    const unsubscribeOffers = onSnapshot(
      collection(db, 'leagues', leagueId, stage === 'extension' ? 'extension_offers' : 'contract_offers'),
      snapshot => setOffers(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as ContractOffer))),
    );
    const unsubscribeResolutions = onSnapshot(
      collection(db, 'leagues', leagueId, 'contract_resolutions'),
      snapshot => setResolutions(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as ContractResolution))),
    );
    return () => {
      unsubscribeLeague();
      unsubscribeTeams();
      if (unsubscribeFreeAgents) unsubscribeFreeAgents();
      if (unsubscribeExtensionWindows) unsubscribeExtensionWindows();
      unsubscribeOffers();
      unsubscribeResolutions();
    };
  }, [leagueId, router, stage]);

  useEffect(() => {
    if (stage !== 'free_agency' || league?.sport !== 'nba') {
      setVaultFreeAgents([]);
      return;
    }
    const era = league?.era || 'current';
    return onSnapshot(
      query(collection(db, 'players'), where('free_in_eras', 'array-contains', era)),
      snapshot => {
        setVaultFreeAgents(snapshot.docs.map(item => {
          const data = item.data() as Player;
          return {
            ...data,
            id: data.id || item.id,
            player_id: data.player_id || item.id,
            team: '',
          };
        }));
      },
      error => {
        console.warn('Unable to load vault free agents', error);
        setVaultFreeAgents([]);
      },
    );
  }, [league?.era, league?.sport, stage]);

  const freeAgents = useMemo(() => {
    const seen = new Set<string>();
    const merged: Player[] = [];
    [...leagueFreeAgents, ...vaultFreeAgents].forEach(player => {
      const key = playerId(player).toLowerCase() || playerName(player).toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      merged.push(player);
    });
    return merged;
  }, [leagueFreeAgents, vaultFreeAgents]);

  const myTeam = teams.find(team => team.gmId === uid);
  const candidates = useMemo(() => {
    if (stage === 'extension') {
      return extensionWindows
        .filter(window => window.status === 'open' && window.teamId === myTeam?.id)
        .map(window => ({
          ...(window.player || {}),
          extensionAsk: window.ask,
        } as Player));
    }
    return selectContractCandidates({
      stage,
      teams,
      freeAgents,
      myTeamId: myTeam?.id,
    });
  }, [extensionWindows, freeAgents, myTeam?.id, stage, teams]);
  const allVisiblePlayers = useMemo(
    () => [...teams.flatMap(team => team.players || []), ...freeAgents],
    [freeAgents, teams],
  );
  const eraBaseline = useMemo(() => salaryBaseline(allVisiblePlayers), [allVisiblePlayers]);
  const myOffers = useMemo(
    () => offers.filter(offer => offer.stage === stage && offer.teamId === myTeam?.id),
    [myTeam?.id, offers, stage],
  );
  const stageResolutions = useMemo(
    () => resolutions.filter(resolution => !resolution.stage || resolution.stage === stage),
    [resolutions, stage],
  );
  const offerByPlayer = useMemo(
    () => new Map(myOffers.map(offer => [String(offer.playerId), offer])),
    [myOffers],
  );
  const offseason = league?.offseason;
  const stageIsCurrent = stage === 'extension' ? !offseason || offseason.stage === 'regular_season' : offseason?.stage === stage;
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
  const emptyAvailableMessage = contractAvailabilityMessage({
    stage,
    stageIsCurrent,
    candidateCount: candidates.length,
    freeAgentPoolCount: freeAgents.length,
    fallbackExpiredCount: 0,
  });

  const openOffer = (player: Player) => {
    setSelected(player);
    setSalary(String(player.extensionAsk?.salary || player.salary || player.contract?.salary || expectedAnnualSalary({ player, role: 'starter', eraSalaryBaseline: eraBaseline })));
    setYears(String(Math.max(1, player.extensionAsk?.years || player.contractYears || 1)));
    setRole(player.extensionAsk?.role || 'starter');
  };

  const openPlayerCard = (player: Player, teamId?: string) => {
    setSelectedPlayerCard({ player, teamId: teamId || myTeam?.id || '' });
  };

  const selectedPreferences = selected
    ? derivePlayerContractPreferences({ player: selected, eraSalaryBaseline: eraBaseline })
    : null;
  const selectedAsk = selected
    ? expectedAnnualSalary({ player: selected, role, eraSalaryBaseline: eraBaseline })
    : 0;
  const previewScore = selected && selectedPreferences
    ? scoreContractOffer({
      salary: Number(salary.replace(/[$,\s]/g, '')),
      years: Number(years),
      role,
      contender: Number(myTeam?.contender || 0.5),
      need: 0.7,
      loyalty: Number(selected?.loyalty || 0.5),
      reputation: Number(myTeam?.reputation || 0.5),
      playerPreferences: selectedPreferences,
      seed: `${playerId(selected)}:${myTeam?.id || ''}:${stage}`,
    })
    : 0;

  const submitOffer = async () => {
    if (!leagueId || !myTeam || !selected || (stage !== 'extension' && !offseason)) return;
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
      if (stage === 'extension') {
        const submit = httpsCallable(functions, 'submitInSeasonExtension');
        await submit({
          leagueId,
          teamId: myTeam.id,
          playerId: playerId(selected),
          salary: salaryNumber,
          years: yearsNumber,
          role,
        });
      } else {
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
          expectedVersion: offseason?.version,
        });
      }
      setSelected(null);
      Alert.alert('Offer submitted', stage === 'extension'
        ? `${playerName(selected)} will respond within 2 hours.`
        : `${playerName(selected)} received your offer.`);
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
          <Text style={styles.title}>{stage === 'extension' ? 'Extensions' : stage === 're_signing' ? 'Re-Signing' : 'Free Agency'}</Text>
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
            {stage === 'extension' ? 'Extension Talks' : stage === 're_signing' ? 'Contract Decisions' : 'Free Agency Hub'}
          </Text>
          <Text style={styles.summaryText}>
            {myTeam
              ? `${myTeam.name || 'Your team'} · ${candidates.length} available · ${myOffers.length} offers · ${stageResolutions.length} decisions`
              : 'Claim a team to submit offers.'}
          </Text>
          <View style={styles.metricRow}>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{candidates.length}</Text>
              <Text style={styles.metricLabel}>Available</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{myOffers.length}</Text>
              <Text style={styles.metricLabel}>My Offers</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{stageResolutions.length}</Text>
              <Text style={styles.metricLabel}>Decisions</Text>
            </View>
          </View>
        </View>

        <View style={styles.tabs}>
          {([
            ['available', 'Available'],
            ['offers', 'My Offers'],
            ['decisions', 'Decisions'],
          ] as Array<[Tab, string]>).map(([value, label]) => (
            <TouchableOpacity
              key={value}
              onPress={() => setTab(value)}
              style={[styles.tab, tab === value && styles.tabActive]}
            >
              <Text style={[styles.tabText, tab === value && styles.tabTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'available' && (
          candidates.length === 0 ? (
            <Text style={styles.empty}>{emptyAvailableMessage}</Text>
          ) : candidates.map(player => {
            const id = playerId(player);
            const preferences = derivePlayerContractPreferences({ player, eraSalaryBaseline: eraBaseline });
            const badges = preferenceBadges(preferences);
            const ask = player.extensionAsk?.salary || expectedAnnualSalary({ player, role: 'starter', eraSalaryBaseline: eraBaseline });
            const existingOffer = offerByPlayer.get(id);
            return (
              <TouchableOpacity
                disabled={!myTeam || !stageIsCurrent || myTeamComplete}
                key={id}
                onPress={() => openOffer(player)}
                style={styles.playerCard}
              >
                <View style={styles.cardTop}>
                  <View style={styles.position}>
                    <Text style={styles.positionText}>{player.position || '?'}</Text>
                  </View>
                  <View style={styles.playerCopy}>
                    <Text style={styles.playerName}>{playerName(player)}</Text>
                    <Text style={styles.playerMeta}>
                      {[player.age ? `Age ${player.age}` : null, formatMoney(player.salary || player.contract?.salary), player.contractYears ? `${player.contractYears} yrs` : null].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <View style={styles.askBox}>
                    <Text style={styles.askLabel}>Ask</Text>
                    <Text style={styles.askValue}>{formatMoney(ask)}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={(event) => {
                      event.stopPropagation();
                      openPlayerCard(player, stage === 'free_agency' ? '' : myTeam?.id);
                    }}
                    style={styles.cardIconButton}
                  >
                    <Ionicons color="#00e58b" name="person-circle-outline" size={22} />
                  </TouchableOpacity>
                </View>
                <View style={styles.badgeRow}>
                  {badges.map(badge => <Text key={badge} style={styles.badge}>{badge}</Text>)}
                  {existingOffer && <Text style={styles.offerBadge}>{offerStatusLabel(existingOffer.status)}</Text>}
                </View>
              </TouchableOpacity>
            );
          })
        )}

        {tab === 'offers' && (
          myOffers.length === 0 ? (
            <Text style={styles.empty}>No offers submitted yet.</Text>
          ) : myOffers.map(offer => (
            <View key={offer.id} style={styles.offerCard}>
              <View style={styles.offerCardTop}>
                <TouchableOpacity
                  disabled={!offer.player}
                  onPress={() => offer.player && openPlayerCard(offer.player, offer.teamId)}
                  style={styles.offerPlayerTap}
                >
                  <Text style={styles.playerName}>{offer.player ? playerName(offer.player) : offer.playerId}</Text>
                </TouchableOpacity>
                <Text style={styles.offerStatus}>{offerStatusLabel(offer.status)}</Text>
              </View>
              <Text style={styles.playerMeta}>
                {[formatMoney(offer.salary), offer.years ? `${offer.years} years` : null, offer.role].filter(Boolean).join(' · ')}
              </Text>
            </View>
          ))
        )}

        {tab === 'decisions' && (
          stageResolutions.length === 0 ? (
            <Text style={styles.empty}>No player decisions have been resolved yet.</Text>
          ) : stageResolutions.map(resolution => {
            const offer = offers.find(item => item.id === resolution.winningOfferId);
            const winner = teams.find(item => item.id === resolution.winnerTeamId);
            return (
              <View key={resolution.id} style={styles.offerCard}>
                <View style={styles.offerCardTop}>
                  <TouchableOpacity
                    disabled={!offer?.player}
                    onPress={() => offer?.player && openPlayerCard(offer.player, resolution.winnerTeamId)}
                    style={styles.offerPlayerTap}
                  >
                    <Text style={styles.playerName}>{offer?.player ? playerName(offer.player) : resolution.playerId}</Text>
                  </TouchableOpacity>
                  <Text style={styles.offerStatus}>Signed</Text>
                </View>
                <Text style={styles.playerMeta}>{winner?.name || resolution.winnerTeamId || 'Team'} won the decision.</Text>
              </View>
            );
          })
        )}

        {myTeam && stageIsCurrent && stage !== 'extension' && (
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

        {isCommissioner && stageIsCurrent && stage !== 'extension' && (
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
            {selectedPreferences && (
              <View style={styles.modalSummary}>
                <Text style={styles.modalSummaryTitle}>Player Priorities</Text>
                <View style={styles.badgeRow}>
                  {preferenceBadges(selectedPreferences).map(badge => <Text key={badge} style={styles.badge}>{badge}</Text>)}
                </View>
                <Text style={styles.playerMeta}>Estimated ask around {formatMoney(selectedAsk)} based on this era and current contract.</Text>
                <Text style={styles.strengthText}>Offer preview: {offerStrengthLabel(previewScore)}</Text>
              </View>
            )}
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
      <PlayerCard
        player={selectedPlayerCard?.player || null}
        era={league?.era || 'current'}
        sport={league?.sport || 'nba'}
        leagueId={leagueId}
        teamId={selectedPlayerCard?.teamId || ''}
        leagueDate={leagueDateFromRecord(league)}
        visible={Boolean(selectedPlayerCard)}
        onClose={() => setSelectedPlayerCard(null)}
      />
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
  metricRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  metric: { flex: 1, minHeight: 58, borderRadius: 8, backgroundColor: '#111611', borderWidth: 1, borderColor: '#202a23', alignItems: 'center', justifyContent: 'center' },
  metricValue: { color: '#00e58b', fontSize: 18, fontWeight: '900' },
  metricLabel: { color: '#737b75', fontSize: 10, fontWeight: '800', marginTop: 2, textTransform: 'uppercase' },
  tabs: { marginHorizontal: 20, marginTop: 14, marginBottom: 8, minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: '#242825', backgroundColor: '#0d100e', flexDirection: 'row', padding: 4 },
  tab: { flex: 1, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: '#123320', borderWidth: 1, borderColor: '#00e58b88' },
  tabText: { color: '#747c76', fontSize: 12, fontWeight: '900' },
  tabTextActive: { color: '#00e58b' },
  empty: { color: '#777f79', fontSize: 14, padding: 24, textAlign: 'center' },
  playerCard: {
    marginHorizontal: 20,
    marginTop: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#202720',
    backgroundColor: '#101310',
    padding: 13,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
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
  askBox: { alignItems: 'flex-end', justifyContent: 'center', minWidth: 74 },
  cardIconButton: { width: 34, height: 34, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b1f15', borderWidth: 1, borderColor: '#00e58b44' },
  offerPlayerTap: { flex: 1, minWidth: 0 },
  askLabel: { color: '#747c76', fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  askValue: { color: '#ffffff', fontSize: 12, fontWeight: '900', marginTop: 3 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  badge: { color: '#00e58b', backgroundColor: '#092317', borderWidth: 1, borderColor: '#00e58b44', borderRadius: 6, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4, fontSize: 10, fontWeight: '900' },
  offerBadge: { color: '#f4b942', backgroundColor: '#241b0b', borderWidth: 1, borderColor: '#f4b94255', borderRadius: 6, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4, fontSize: 10, fontWeight: '900' },
  offerCard: { marginHorizontal: 20, marginTop: 10, borderRadius: 8, borderWidth: 1, borderColor: '#202720', backgroundColor: '#101310', padding: 14 },
  offerCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  offerStatus: { color: '#00e58b', fontSize: 12, fontWeight: '900' },
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
  modalSummary: { borderRadius: 8, borderWidth: 1, borderColor: '#202720', backgroundColor: '#101310', padding: 12, marginBottom: 8 },
  modalSummaryTitle: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  strengthText: { color: '#00e58b', fontSize: 13, fontWeight: '900', marginTop: 10 },
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
