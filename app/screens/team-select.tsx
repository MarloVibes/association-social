import { router, useLocalSearchParams } from 'expo-router';
import { arrayUnion, collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import { Animated, ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';
import GlobalNav from '@/components/GlobalNav';

const ERA_LABELS: Record<string, string> = {
  magic_bird: 'Magic vs Bird Era',
  jordan: 'Jordan Era',
  kobe: 'Kobe Era',
  lebron: 'LeBron Era',
  steph: 'Steph Era',
  current: 'Current Rosters',
};

const TEAM_COLORS: Record<string, string[]> = {
  ATL: ['#C8102E', '#FDB927'], BOS: ['#007A33', '#BA9653'],
  NJN: ['#002A60', '#BEC0C2'], BKN: ['#000000', '#FFFFFF'],
  CHA: ['#1D1160', '#00788C'], CHI: ['#CE1141', '#000000'],
  CLE: ['#860038', '#FDBB30'], DAL: ['#00538C', '#B8C4CA'],
  DEN: ['#0E2240', '#FEC524'], DET: ['#C8102E', '#1D42BA'],
  GSW: ['#1D428A', '#FFC72C'], HOU: ['#CE1141', '#000000'],
  IND: ['#002D62', '#FDBB30'], LAC: ['#C8102E', '#1D428A'],
  LAL: ['#552583', '#FDB927'], MEM: ['#5D76A9', '#12173F'],
  MIA: ['#98002E', '#F9A01B'], MIL: ['#00471B', '#EEE1C6'],
  MIN: ['#0C2340', '#236192'], NOH: ['#0C2340', '#C8102E'],
  NOK: ['#0C2340', '#C8102E'], NOP: ['#0C2340', '#C8102E'],
  NYK: ['#006BB6', '#F58426'], OKC: ['#007AC1', '#EF3B24'],
  ORL: ['#0077C0', '#C4CED4'], PHI: ['#006BB6', '#ED174C'],
  PHX: ['#1D1160', '#E56020'], POR: ['#E03A3E', '#000000'],
  SAC: ['#5A2D81', '#63727A'], SAS: ['#C4CED4', '#000000'],
  SEA: ['#00653A', '#FFC200'], TOR: ['#CE1141', '#000000'],
  UTA: ['#002B5C', '#F9A01B'], WAS: ['#002B5C', '#E31837'],
};

export default function TeamSelectScreen() {
  const { leagueId, sport, era, mode } = useLocalSearchParams<{
    leagueId: string; sport: string; era: string; mode: string;
  }>();

  const [teams, setTeams] = useState<any[]>([]);
  const [takenTeams, setTakenTeams] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<any>(null);
  const [shuffledTeams, setShuffledTeams] = useState<any[]>([]);
  const [revealedIndex, setRevealedIndex] = useState<number | null>(null);
  const [hasShuffled, setHasShuffled] = useState(false);
  const flipAnims = useRef<Animated.Value[]>([]);

  const user = auth.currentUser;
  const isRandom = mode === 'random';
  const isDraft = mode === 'draft';
  const eraKey = (era && era !== 'null' && era !== '') ? era : 'current';

  useEffect(() => { loadTeams(); }, []);

  const loadTeams = async () => {
    setLoading(true);
    try {
      const teamsSnap = await getDocs(collection(db, 'era_rosters', eraKey, 'teams'));
      const teamList = teamsSnap.docs.map(d => d.data()).sort((a, b) => a.full_name.localeCompare(b.full_name));
      setTeams(teamList);
      flipAnims.current = teamList.map(() => new Animated.Value(0));
      const leagueSnap = await getDoc(doc(db, 'leagues', leagueId));
      const taken = leagueSnap.data()?.takenTeams || [];
      setTakenTeams(taken);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleShuffle = () => {
    if (hasShuffled) return;
    const available = teams.filter(t => !takenTeams.includes(t.id));
    const shuffled = [...available].sort(() => Math.random() - 0.5);
    setShuffledTeams(shuffled);
    setHasShuffled(true);
  };

  const handleFlipCard = (index: number, team: any) => {
    if (revealedIndex !== null) return;
    setRevealedIndex(index);
    Animated.spring(flipAnims.current[index], {
      toValue: 1,
      friction: 8,
      tension: 10,
      useNativeDriver: true,
    }).start(() => {
      setSelectedTeam(team);
    });
  };

  const handleConfirmTeam = async (team: any) => {
    if (!user) return;
    setSaving(true);
    try {
      const teamDocId = leagueId + '_' + user.uid;
      await setDoc(doc(db, 'leagues', leagueId, 'teams', teamDocId), {
        gmId: user.uid,
        teamId: team.id,
        name: team.full_name,
        abbreviation: team.abbreviation,
        era: eraKey,
        players: isDraft ? [] : (team.players || []),
        tradeBlock: [],
      });
      await updateDoc(doc(db, 'leagues', leagueId), {
        takenTeams: arrayUnion(team.id),
      });
      router.replace({ pathname: '/screens/league', params: { leagueId } });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size='large' color='#00ff87' />
        <Text style={styles.loadingText}>Loading teams...</Text>
      </View>
    );
  }

  const availableTeams = teams.filter(t => !takenTeams.includes(t.id));

  if (isRandom) {
    return (
      <View style={styles.container}>
        <ScrollView style={{ flex: 1 }}>
          <View style={styles.inner}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Pick a Card</Text>
            <Text style={styles.subtitle}>{ERA_LABELS[eraKey]} · {availableTeams.length} teams available</Text>
            {!hasShuffled ? (
              <TouchableOpacity style={styles.shuffleButton} onPress={handleShuffle}>
                <Text style={styles.shuffleButtonText}>🎲 Shuffle Teams</Text>
              </TouchableOpacity>
            ) : (
              <>
                <Text style={styles.pickHint}>
                  {revealedIndex === null ? 'Tap any card to reveal your team!' : selectedTeam ? 'You got the ' + selectedTeam.full_name + '!' : 'Revealing...'}
                </Text>
                <View style={styles.cardGrid}>
                  {shuffledTeams.slice(0, 15).map((team, index) => {
                    const flipAnim = flipAnims.current[index] || new Animated.Value(0);
                    const frontRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
                    const backRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
                    const colors = TEAM_COLORS[team.abbreviation] || ['#1a1a2a', '#4444ff'];
                    return (
                      <TouchableOpacity
                        key={team.id}
                        style={styles.cardWrapper}
                        onPress={() => handleFlipCard(index, team)}
                        disabled={revealedIndex !== null}
                        activeOpacity={0.8}
                      >
                        <Animated.View style={[styles.cardFace, styles.cardBack, { transform: [{ rotateY: frontRotate }] }]}>
                          <Text style={styles.cardBackIcon}>🏀</Text>
                          <Text style={styles.cardBackText}>NBA</Text>
                        </Animated.View>
                        <Animated.View style={[styles.cardFace, styles.cardFront, { backgroundColor: colors[0], borderColor: colors[1], transform: [{ rotateY: backRotate }] }]}>
                          <Text style={styles.cardFrontAbbr}>{team.abbreviation}</Text>
                          <Text style={styles.cardFrontName}>{team.name}</Text>
                        </Animated.View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {selectedTeam && (
                  <View style={styles.selectedBanner}>
                    <Text style={styles.selectedBannerTitle}>🏆 {selectedTeam.full_name}</Text>
                    <Text style={styles.selectedBannerSub}>{selectedTeam.season}</Text>
                    <TouchableOpacity style={styles.primaryButton} onPress={() => handleConfirmTeam(selectedTeam)} disabled={saving}>
                      {saving ? <ActivityIndicator color='#000' /> : <Text style={styles.primaryButtonText}>Lock In This Team</Text>}
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </View>
        </ScrollView>
        <GlobalNav />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={{ flex: 1 }}>
        <View style={styles.inner}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{isDraft ? 'Choose Your Team' : 'Pick Your Team'}</Text>
          <Text style={styles.subtitle}>{ERA_LABELS[eraKey]} · {availableTeams.length} available{isDraft ? ' · Draft mode' : ''}</Text>
          <View style={styles.teamList}>
            {teams.map(team => {
              const taken = takenTeams.includes(team.id);
              const colors = TEAM_COLORS[team.abbreviation] || ['#1a1a1a', '#333'];
              const isSelected = selectedTeam?.id === team.id;
              return (
                <TouchableOpacity
                  key={team.id}
                  style={[styles.teamRow, taken && styles.teamRowTaken, isSelected && styles.teamRowSelected]}
                  onPress={() => { if (!taken) setSelectedTeam(team); }}
                  disabled={taken}
                >
                  <View style={[styles.teamColorBar, { backgroundColor: colors[0] }]} />
                  <View style={styles.teamRowInfo}>
                    <Text style={[styles.teamRowName, taken && styles.teamRowNameTaken]}>{team.full_name}</Text>
                    <Text style={styles.teamRowMeta}>{team.abbreviation} · {team.players?.length || 0} players</Text>
                  </View>
                  {taken && <Text style={styles.takenBadge}>Taken</Text>}
                  {isSelected && !taken && <Text style={styles.checkMark}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>
      {selectedTeam && (
        <View style={styles.confirmBar}>
          <View style={styles.confirmBarInfo}>
            <Text style={styles.confirmBarName}>{selectedTeam.full_name}</Text>
            <Text style={styles.confirmBarSub}>{isDraft ? 'Empty roster — draft your players' : (selectedTeam.players?.length || 0) + ' players pre-loaded'}</Text>
          </View>
          <TouchableOpacity style={styles.confirmBtn} onPress={() => handleConfirmTeam(selectedTeam)} disabled={saving}>
            {saving ? <ActivityIndicator color='#000' size='small' /> : <Text style={styles.confirmBtnText}>Lock In</Text>}
          </TouchableOpacity>
        </View>
      )}
      <GlobalNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  loadingContainer: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingText: { color: '#888', fontSize: 15 },
  inner: { padding: 24, paddingTop: 60, paddingBottom: 120 },
  backBtn: { marginBottom: 16 },
  backText: { color: '#00ff87', fontSize: 15, fontWeight: '600' },
  title: { fontSize: 28, fontWeight: '800', color: '#ffffff', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#888', marginBottom: 24 },
  shuffleButton: { backgroundColor: '#1a1a2a', borderRadius: 16, padding: 28, alignItems: 'center', borderWidth: 2, borderColor: '#4444ff', marginBottom: 24 },
  shuffleButtonText: { fontSize: 22, fontWeight: '800', color: '#8888ff' },
  pickHint: { color: '#00ff87', fontSize: 14, textAlign: 'center', marginBottom: 20, fontWeight: '600' },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginBottom: 32 },
  cardWrapper: { width: 88, height: 116 },
  cardFace: { position: 'absolute', width: 88, height: 116, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backfaceVisibility: 'hidden', borderWidth: 2 },
  cardBack: { backgroundColor: '#1a1a2a', borderColor: '#4444ff' },
  cardBackIcon: { fontSize: 26, marginBottom: 4 },
  cardBackText: { color: '#4444ff', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  cardFront: { borderRadius: 12 },
  cardFrontAbbr: { fontSize: 20, fontWeight: '900', color: '#ffffff' },
  cardFrontName: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.8)', textAlign: 'center', paddingHorizontal: 6, marginTop: 4 },
  selectedBanner: { backgroundColor: '#0a2a1a', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: '#00ff87', marginBottom: 24, alignItems: 'center', gap: 8 },
  selectedBannerTitle: { fontSize: 20, fontWeight: '800', color: '#00ff87' },
  selectedBannerSub: { fontSize: 13, color: '#4a8a4a', marginBottom: 8 },
  teamList: { gap: 8, marginBottom: 32 },
  teamRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#2a2a2a' },
  teamRowTaken: { opacity: 0.35 },
  teamRowSelected: { borderColor: '#00ff87', borderWidth: 2 },
  teamColorBar: { width: 6, height: 64 },
  teamRowInfo: { flex: 1, paddingVertical: 14, paddingLeft: 14 },
  teamRowName: { color: '#ffffff', fontSize: 15, fontWeight: '700', marginBottom: 2 },
  teamRowNameTaken: { color: '#555' },
  teamRowMeta: { color: '#666', fontSize: 12 },
  takenBadge: { color: '#555', fontSize: 12, marginRight: 16 },
  checkMark: { color: '#00ff87', fontSize: 22, marginRight: 16, fontWeight: '700' },
  confirmBar: { position: 'absolute', bottom: 80, left: 0, right: 0, backgroundColor: '#0a2a1a', borderTopWidth: 1, borderTopColor: '#00ff87', padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  confirmBarInfo: { flex: 1 },
  confirmBarName: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  confirmBarSub: { color: '#4a8a4a', fontSize: 12 },
  confirmBtn: { backgroundColor: '#00ff87', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14 },
  confirmBtnText: { color: '#000', fontSize: 15, fontWeight: '800' },
  primaryButton: { backgroundColor: '#00ff87', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 32, alignItems: 'center', marginTop: 8 },
  primaryButtonText: { color: '#000', fontSize: 16, fontWeight: '700' },
});