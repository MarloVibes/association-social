import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, onSnapshot } from 'firebase/firestore';
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
import {
  FIRST_GENERATED_NBA_DRAFT_YEAR,
  MLB_DRAFT_POSITIONS,
  NBA_DRAFT_POSITIONS,
  NFL_DRAFT_POSITIONS,
  draftClassPlayersForDisplay,
} from '@/domain/draft/generateClass';
import type { OffseasonState } from '@/domain/offseason/types';

type League = {
  name?: string;
  sport?: string;
  currentYear?: number;
  commissionerId?: string;
  coCommissioners?: string[];
  offseason?: OffseasonState;
};

type Prospect = {
  id?: string;
  player_id?: string;
  full_name?: string;
  name?: string;
  position?: string;
  projectedRound?: number;
  draft_round?: number;
  draft_pick?: number;
  archetype?: string;
  age?: number;
  potential?: number;
  developmentTrait?: string;
};

type DraftClass = {
  players?: Prospect[];
  published?: boolean;
  version?: number;
};

export default function DraftClassScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const router = useRouter();
  const uid = auth.currentUser?.uid;
  const [league, setLeague] = useState<League | null>(null);
  const [draftClass, setDraftClass] = useState<DraftClass | null>(null);
  const [vaultDraftClass, setVaultDraftClass] = useState<DraftClass | null>(null);
  const [teamCount, setTeamCount] = useState(30);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [editing, setEditing] = useState<Prospect | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [round, setRound] = useState('1');

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
    const unsubscribeTeams = onSnapshot(collection(db, 'leagues', leagueId, 'teams'), snapshot => {
      setTeamCount(Math.max(1, snapshot.size || 30));
    });
    return () => {
      unsubscribeLeague();
      unsubscribeTeams();
    };
  }, [leagueId, router]);

  const seasonYear = league?.offseason?.seasonYear
    || (league?.sport === 'nba' && typeof league?.currentYear === 'number' ? league.currentYear + 1 : undefined);
  useEffect(() => {
    if (!leagueId || !seasonYear) return;
    const unsubscribeLeagueClass = onSnapshot(
      doc(db, 'leagues', leagueId, 'draft_classes', String(seasonYear)),
      snapshot => setDraftClass(snapshot.exists() ? snapshot.data() as DraftClass : null),
    );
    const unsubscribeVaultClass = onSnapshot(
      doc(db, 'draft_classes', String(seasonYear)),
      snapshot => setVaultDraftClass(snapshot.exists() ? snapshot.data() as DraftClass : null),
    );
    return () => {
      unsubscribeLeagueClass();
      unsubscribeVaultClass();
    };
  }, [leagueId, seasonYear]);

  const isCommissioner = Boolean(
    uid
    && (
      league?.commissionerId === uid
      || (league?.coCommissioners || []).includes(uid)
    ),
  );
  const historicalNbaPreOffseason = Boolean(
    league?.sport === 'nba'
    && !league?.offseason
    && typeof league?.currentYear === 'number'
    && league.currentYear + 1 < FIRST_GENERATED_NBA_DRAFT_YEAR
  );
  const hasSavedDraftSource = Boolean((draftClass?.players?.length || 0) + (vaultDraftClass?.players?.length || 0));
  const nbaLockedDraftYear = Boolean(
    league?.sport === 'nba'
    && typeof seasonYear === 'number'
    && seasonYear < FIRST_GENERATED_NBA_DRAFT_YEAR
    && !hasSavedDraftSource
  );
  const editable = isCommissioner
    && (
      league?.offseason?.stage === 'draft_class_review'
      || (league?.sport === 'nba' && !league?.offseason && !historicalNbaPreOffseason)
    )
    && !nbaLockedDraftYear
    && !vaultDraftClass
    && draftClass?.published !== true;
  const expectedVersion = league?.offseason?.version ?? 0;
  const positions = league?.sport === 'nba'
    ? NBA_DRAFT_POSITIONS
    : league?.sport === 'mlb'
      ? MLB_DRAFT_POSITIONS
      : NFL_DRAFT_POSITIONS;
  const sourceDraftClass = draftClass || vaultDraftClass;
  const draftDisplay = useMemo(() => draftClassPlayersForDisplay({
    players: sourceDraftClass?.players || [],
    sport: league?.sport || 'nba',
    seasonYear,
    teamCount,
    seed: `${leagueId || 'league'}:${league?.name || 'draft'}`,
    lockedHistoricalNba: historicalNbaPreOffseason || nbaLockedDraftYear,
  }), [sourceDraftClass?.players, league?.sport, league?.name, seasonYear, teamCount, leagueId, historicalNbaPreOffseason, nbaLockedDraftYear]);
  const players = useMemo(
    () => [...draftDisplay.players].sort((left: any, right: any) => (
      Number(left.projectedRound || left.draft_round || 99) - Number(right.projectedRound || right.draft_round || 99)
      || String(left.full_name || left.name || '').localeCompare(String(right.full_name || right.name || ''))
    )),
    [draftDisplay.players],
  );
  const canEditRows = editable && !draftDisplay.generatedPreview && Boolean(draftClass);

  const mutate = async (data: Record<string, unknown>) => {
    if (!leagueId || !league) return;
    setWorking(true);
    try {
      const callable = httpsCallable(functions, 'mutateDraftClass');
      await callable({
        leagueId,
        expectedVersion,
        ...data,
      });
    } catch (error: any) {
      Alert.alert('Draft class update failed', error.message || 'Please try again.');
    } finally {
      setWorking(false);
    }
  };

  const regenerate = () => {
    Alert.alert(
      draftClass ? 'Regenerate class?' : 'Generate class?',
      draftClass
        ? 'This replaces every unpublished prospect in the current class.'
        : 'Create a seeded class sized for this league.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: draftClass ? 'Replace' : 'Generate',
          style: draftClass ? 'destructive' : 'default',
          onPress: () => mutate({ action: 'regenerate', seed: `${Date.now()}` }),
        },
      ],
    );
  };

  const openAdd = () => {
    setEditing(null);
    setAdding(true);
    setName('');
    setPosition(positions[0] || '');
    setRound('1');
  };

  const openEdit = (prospect: Prospect) => {
    setAdding(false);
    setEditing(prospect);
    setName(prospect.full_name || prospect.name || '');
    setPosition(prospect.position || '');
    setRound(String(prospect.projectedRound || prospect.draft_round || 1));
  };

  const saveProspect = async () => {
    const projectedRound = Number(round);
    const maxRound = league?.sport === 'nba' ? 2 : league?.sport === 'mlb' ? 5 : 7;
    if (!name.trim() || !positions.includes(position as never)) {
      Alert.alert('Invalid prospect', 'Enter a name and valid position.');
      return;
    }
    if (!Number.isInteger(projectedRound) || projectedRound < 1 || projectedRound > maxRound) {
      Alert.alert('Invalid round', `Projected round must be between 1 and ${maxRound}.`);
      return;
    }
    if (adding) {
      const id = `custom-${seasonYear}-${Date.now()}`;
      await mutate({
        action: 'add',
        prospect: {
          id,
          player_id: id,
          full_name: name.trim(),
          name: name.trim(),
          position,
          projectedRound,
          age: league?.sport === 'nba' ? 19 : league?.sport === 'mlb' ? 21 : 22,
          archetype: 'Custom Prospect',
          summary: `${name.trim()} is a commissioner-created ${position} prospect.`,
        },
      });
    } else if (editing) {
      await mutate({
        action: 'edit',
        prospectId: editing.id || editing.player_id,
        patch: {
          full_name: name.trim(),
          name: name.trim(),
          position,
          projectedRound,
        },
      });
    }
    setAdding(false);
    setEditing(null);
  };

  const removeProspect = (prospect: Prospect) => {
    Alert.alert('Remove prospect?', prospect.full_name || prospect.name || 'Prospect', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => mutate({ action: 'remove', prospectId: prospect.id || prospect.player_id }),
      },
    ]);
  };

  const publish = () => {
    if (!leagueId || !league) return;
    Alert.alert(
      'Publish draft class?',
      'Publishing locks every prospect and prepares this class for the live draft.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Publish',
          onPress: async () => {
            setWorking(true);
            try {
              const callable = httpsCallable(functions, 'publishDraftClass');
              await callable({
                leagueId,
                expectedVersion,
              });
            } catch (error: any) {
              Alert.alert('Publish failed', error.message || 'Please try again.');
            } finally {
              setWorking(false);
            }
          },
        },
      ],
    );
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
          <Text style={styles.title}>{seasonYear} Draft Class</Text>
        </View>
        {editable ? (
          <TouchableOpacity accessibilityLabel="Add prospect" onPress={openAdd} style={styles.iconButton}>
            <Ionicons color="#00e58b" name="add" size={26} />
          </TouchableOpacity>
        ) : <View style={styles.iconButton} />}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.summary}>
          <View>
            <Text style={styles.summaryTitle}>{players.length} prospects</Text>
            <Text style={styles.summaryMeta}>
              {draftClass?.published
                ? 'Published and locked'
                : draftDisplay.locked
                  ? 'Historical class locked'
                  : draftDisplay.generatedPreview
                    ? 'Preview class - generate to save'
                    : draftClass
                      ? 'League class'
                      : vaultDraftClass
                        ? 'Era source class'
                        : league?.offseason ? 'Commissioner review' : 'Pre-offseason review'}
            </Text>
          </View>
          {draftClass?.published && <Ionicons color="#00e58b" name="lock-closed" size={21} />}
        </View>

        {editable && (
          <View style={styles.controls}>
            <TouchableOpacity disabled={working} onPress={regenerate} style={styles.secondaryButton}>
              <Ionicons color="#b8c0ba" name="refresh" size={18} />
              <Text style={styles.secondaryText}>{draftClass ? 'Regenerate' : 'Generate class'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={working || players.length === 0}
              onPress={publish}
              style={[styles.publishButton, players.length === 0 && styles.disabled]}
            >
              <Ionicons color="#07130d" name="lock-closed" size={18} />
              <Text style={styles.publishText}>Publish</Text>
            </TouchableOpacity>
          </View>
        )}

        {players.length === 0 ? (
          <Text style={styles.empty}>
            {draftDisplay.locked
              ? 'This era uses a sourced NBA draft class. No generated class will be created for this year.'
              : 'No draft class has been generated yet.'}
          </Text>
        ) : players.map(rawProspect => {
          const prospect = rawProspect as Prospect;
          return (
          <View key={prospect.id || prospect.player_id || prospect.full_name} style={styles.prospectRow}>
            <TouchableOpacity
              disabled={!canEditRows}
              onPress={() => canEditRows && openEdit(prospect)}
              style={styles.prospectMain}
            >
              <View style={styles.roundBadge}>
                <Text style={styles.roundLabel}>R{prospect.projectedRound || prospect.draft_round || '?'}</Text>
              </View>
              <View style={styles.prospectCopy}>
                <Text style={styles.prospectName}>{prospect.full_name || prospect.name || 'Unnamed prospect'}</Text>
                <Text style={styles.prospectMeta}>
                  {[prospect.position, prospect.archetype, prospect.age ? `Age ${prospect.age}` : null]
                    .filter(Boolean).join(' · ')}
                </Text>
              </View>
              {canEditRows && <Ionicons color="#626a64" name="create-outline" size={19} />}
            </TouchableOpacity>
            {canEditRows && (
              <TouchableOpacity
                accessibilityLabel={`Remove ${prospect.full_name || prospect.name || 'prospect'}`}
                onPress={() => removeProspect(prospect as Prospect)}
                style={styles.deleteButton}
              >
                <Ionicons color="#d86d6d" name="trash-outline" size={19} />
              </TouchableOpacity>
            )}
          </View>
          );
        })}
      </ScrollView>

      <Modal
        animationType="slide"
        onRequestClose={() => { setAdding(false); setEditing(null); }}
        presentationStyle="pageSheet"
        visible={adding || Boolean(editing)}
      >
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => { setAdding(false); setEditing(null); }}>
              <Text style={styles.cancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{adding ? 'Add Prospect' : 'Edit Prospect'}</Text>
            <TouchableOpacity disabled={working} onPress={saveProspect}>
              <Text style={styles.save}>Save</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              onChangeText={setName}
              placeholder="Prospect name"
              placeholderTextColor="#555d57"
              style={styles.input}
              value={name}
            />
            <Text style={styles.label}>Position</Text>
            <View style={styles.positionGrid}>
              {positions.map(option => (
                <TouchableOpacity
                  key={option}
                  onPress={() => setPosition(option)}
                  style={[styles.positionButton, position === option && styles.positionButtonActive]}
                >
                  <Text style={[styles.positionText, position === option && styles.positionTextActive]}>
                    {option}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Projected round</Text>
            <TextInput
              keyboardType="number-pad"
              onChangeText={setRound}
              style={styles.input}
              value={round}
            />
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
  summary: {
    paddingHorizontal: 22,
    paddingVertical: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#1d211e',
  },
  summaryTitle: { color: '#ffffff', fontSize: 20, fontWeight: '800' },
  summaryMeta: { color: '#7d857f', fontSize: 13, marginTop: 4 },
  controls: { padding: 16, flexDirection: 'row', gap: 10 },
  secondaryButton: {
    minHeight: 46,
    flex: 1,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#343a36',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryText: { color: '#b8c0ba', fontSize: 13, fontWeight: '800' },
  publishButton: {
    minHeight: 46,
    flex: 1,
    borderRadius: 7,
    backgroundColor: '#00e58b',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  publishText: { color: '#07130d', fontSize: 13, fontWeight: '800' },
  disabled: { opacity: 0.35 },
  empty: { color: '#777f79', fontSize: 14, padding: 28, textAlign: 'center' },
  prospectRow: {
    minHeight: 70,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1b1f1c',
  },
  prospectMain: { flex: 1, minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 12 },
  deleteButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  roundBadge: {
    width: 38,
    height: 38,
    borderRadius: 6,
    backgroundColor: '#18251e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundLabel: { color: '#00e58b', fontSize: 11, fontWeight: '800' },
  prospectCopy: { flex: 1 },
  prospectName: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  prospectMeta: { color: '#69706b', fontSize: 12, marginTop: 3 },
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
  save: { color: '#00e58b', fontSize: 15, fontWeight: '800' },
  modalContent: { padding: 22 },
  label: { color: '#a6ada8', fontSize: 12, fontWeight: '700', marginBottom: 8, marginTop: 18 },
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
  positionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  positionButton: {
    minWidth: 48,
    height: 40,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#303632',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  positionButtonActive: { backgroundColor: '#163323', borderColor: '#00e58b' },
  positionText: { color: '#818983', fontSize: 12, fontWeight: '800' },
  positionTextActive: { color: '#00e58b' },
});
