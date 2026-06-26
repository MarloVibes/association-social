import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import GlobalNav from '@/components/GlobalNav';
import { db } from '@/constants/firebase';
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
};

type League = {
  name?: string;
  currentYear?: number;
  scheduleLocked?: boolean;
  expansionProposal?: {
    enabled?: boolean;
    teams?: ExpansionTeam[];
  };
};

function teamLabel(team: ExpansionTeam) {
  return [team.city, team.name].filter(Boolean).join(' ') || team.abbreviation || 'Expansion Team';
}

export default function ExpansionScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const router = useRouter();
  const [league, setLeague] = useState<League | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

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

  const proposedTeams = league?.expansionProposal?.teams || [];
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
                <Text style={styles.readyText}>Expansion proposal is valid. Use Commissioner Control on the offseason hub to advance.</Text>
              </View>
            )}
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
  sectionTitle: { color: '#ffffff', fontSize: 16, fontWeight: '900', marginBottom: 10 },
  empty: { color: '#777f79', fontSize: 14, lineHeight: 20 },
  teamCard: { minHeight: 70, borderRadius: 8, borderWidth: 1, borderColor: '#222', backgroundColor: '#111', flexDirection: 'row', alignItems: 'center', padding: 12, marginBottom: 10 },
  colorSwatch: { width: 38, height: 38, borderRadius: 8, marginRight: 12 },
  teamCopy: { flex: 1, minWidth: 0 },
  teamName: { color: '#fff', fontSize: 15, fontWeight: '900' },
  teamMeta: { color: '#777', fontSize: 11, fontWeight: '800', marginTop: 4 },
});
