import { getTeamLogoUrl, getTeamLogoLocal } from '@/constants/teamColors';
import { router, useLocalSearchParams } from 'expo-router';
import { arrayUnion, collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import { Animated, ActivityIndicator, Alert, Dimensions, Image, ScrollView, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { auth, db } from '@/constants/firebase';
import GlobalNav from '@/components/GlobalNav';

const { width, height } = Dimensions.get('window');

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

const NBA_TEAM_IDS: Record<string, string> = {
  ATL: '1610612737', BOS: '1610612738', BKN: '1610612751', NJN: '1610612751',
  CHA: '1610612766', CHI: '1610612741', CLE: '1610612739', DAL: '1610612742',
  DEN: '1610612743', DET: '1610612765', GSW: '1610612744', HOU: '1610612745',
  IND: '1610612754', LAC: '1610612746', LAL: '1610612747', MEM: '1610612763',
  MIA: '1610612748', MIL: '1610612749', MIN: '1610612750', NOH: '1610612740',
  NOK: '1610612740', NOP: '1610612740', NYK: '1610612752', OKC: '1610612760',
  ORL: '1610612753', PHI: '1610612755', PHX: '1610612756', POR: '1610612757',
  SAC: '1610612758', SAS: '1610612759', SEA: '1610612760', TOR: '1610612761',
  UTA: '1610612762', WAS: '1610612764',
};

const DEFUNCT_LOGOS: Record<string, string> = {
  SEA: 'https://i.logocdn.com/nba/1992/seattle-supersonics@3x.png',
  NJN: 'https://i.logocdn.com/nba/1992/new-jersey-nets@3x.png',
  NOK: 'https://i.logocdn.com/nba/2003/new-orleans-hornets@3x.png',
  NOH: 'https://i.logocdn.com/nba/2003/new-orleans-hornets@3x.png',
  KCK: 'https://i.logocdn.com/nba/1984/sacramento-kings@3x.png',
  WAS: 'https://i.logocdn.com/nba/1992/washington-bullets@3x.png',
};

const getLogoUrl = (abbr: string, era?: string) => {
  if (!abbr) return null;
  if (DEFUNCT_LOGOS[abbr]) return DEFUNCT_LOGOS[abbr];
  return 'https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/' + abbr.toLowerCase() + '.png';
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
  const [showReveal, setShowReveal] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const flipAnims = useRef<Animated.Value[]>([]);
  const othersOpacity = useRef(new Animated.Value(1)).current;
  const cardScale = useRef(new Animated.Value(1)).current;
  const cardY = useRef(new Animated.Value(0)).current;
  const topTextOpacity = useRef(new Animated.Value(0)).current;
  const bottomTextOpacity = useRef(new Animated.Value(0)).current;
  const countdownRef = useRef<any>(null);

  const user = auth.currentUser;
  const isRandom = mode === 'random';
  const isDraft = mode === 'draft';
  const eraKey = (era && era !== 'null' && era !== '') ? era : 'current';

  useEffect(() => { loadTeams(); }, []);

  useEffect(() => {
    if (showReveal && countdown > 0) {
      countdownRef.current = setTimeout(() => setCountdown(c => c - 1), 1000);
    } else if (showReveal && countdown === 0) {
      handleConfirmTeam(selectedTeam);
    }
    return () => clearTimeout(countdownRef.current);
  }, [showReveal, countdown]);

  const loadTeams = async () => {
    setLoading(true);
    try {
      const teamsSnap = await getDocs(collection(db, 'era_rosters', eraKey, 'teams'));
      let teamList = teamsSnap.docs.map(d => d.data()).sort((a, b) => a.full_name.localeCompare(b.full_name));

      // Compute real player counts from the era_player_pools (the stale .players field has wrong counts)
      try {
        const poolSnap = await getDoc(doc(db, 'era_player_pools', eraKey));
        const allPoolPlayers = poolSnap.data()?.players || [];
        teamList = teamList.map((t: any) => {
          const realPlayers = allPoolPlayers.filter((p: any) => p.team === t.abbreviation);
          return realPlayers.length > 0 ? { ...t, players: realPlayers } : t;
        });
      } catch (e) {
        console.warn('Failed to load player pool for counts', e);
      }

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
      // Fade out other cards
      Animated.timing(othersOpacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => {
        // Zoom chosen card to center
        Animated.parallel([
          Animated.spring(cardScale, { toValue: 2.5, friction: 6, tension: 40, useNativeDriver: true }),
          Animated.timing(cardY, { toValue: -60, duration: 500, useNativeDriver: true }),
        ]).start(() => {
          // Show reveal text
          setShowReveal(true);
          Animated.stagger(300, [
            Animated.timing(topTextOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
            Animated.timing(bottomTextOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
          ]).start();
        });
      });
    });
  };

  const handleConfirmTeam = async (team: any) => {
    if (!team || !user) return;
    clearTimeout(countdownRef.current);
    setSaving(true);
    try {
      let players: any[] = [];
      if (!isDraft) {
        const poolSnap = await getDoc(doc(db, 'era_player_pools', eraKey));
        if (poolSnap.exists()) {
          const allPoolPlayers = poolSnap.data().players || [];
          players = allPoolPlayers.filter((p: any) => p.team === team.abbreviation);
        }
        if (players.length === 0) players = team.players || [];
      }
      // Ensure user is a league member BEFORE creating their team (required by rules)
      // Skip if already a member (arrayUnion is no-op but rule denies non-changing updates)
      const leagueSnap = await getDoc(doc(db, 'leagues', leagueId));
      const existingMembers: string[] = leagueSnap.data()?.members || [];
      if (!existingMembers.includes(user.uid)) {
        await updateDoc(doc(db, 'leagues', leagueId), {
          members: arrayUnion(user.uid),
        });
      }

      const teamDocId = leagueId + '_' + user.uid;
      await setDoc(doc(db, 'leagues', leagueId, 'teams', teamDocId), {
        gmId: user.uid,
        teamId: team.id,
        name: team.full_name,
        abbreviation: team.abbreviation,
        era: eraKey,
        players,
        tradeBlock: [],
      });

      await updateDoc(doc(db, 'leagues', leagueId), {
        takenTeams: arrayUnion(team.id),
      });

      try {
        await updateDoc(doc(db, 'users', user.uid), {
          leagues: arrayUnion(leagueId),
        });
      } catch (e) {
        console.warn('Failed to add league to user profile', e);
      }
      router.dismissAll();
      router.replace({ pathname: '/screens/league', params: { leagueId } });
    } catch (e: any) {
      Alert.alert('Error', e?.message || String(e));
      setSaving(false);
    }
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
      <TouchableWithoutFeedback onPress={() => showReveal && selectedTeam && !saving ? handleConfirmTeam(selectedTeam) : undefined}>
        <View style={styles.container}>
          <ScrollView style={{ flex: 1 }} scrollEnabled={!showReveal} contentContainerStyle={{ paddingBottom: 90 }}>
            <View style={styles.inner}>
              {!showReveal && (
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                  <Text style={styles.backText}>← Back</Text>
                </TouchableOpacity>
              )}

              {!showReveal && (
                <>
                  <Text style={styles.title}>Pick a Card</Text>
                  <Text style={styles.subtitle}>{ERA_LABELS[eraKey]} · {availableTeams.length} teams available</Text>
                </>
              )}

              {!hasShuffled && !showReveal ? (
                <TouchableOpacity style={styles.shuffleButton} onPress={handleShuffle}>
                  <Text style={styles.shuffleButtonText}>🎲 Shuffle Teams</Text>
                </TouchableOpacity>
              ) : showReveal && selectedTeam ? (
                // REVEAL SCREEN
                <View style={styles.revealContainer}>
                  <Animated.Text style={[styles.revealTopText, { opacity: topTextOpacity }]}>
                    It's time to hoop
                  </Animated.Text>
                  <Animated.View style={[
                    styles.revealCardWrapper,
                    { transform: [{ scale: cardScale }, { translateY: cardY }] }
                  ]}>
                    {(() => {
                      const colors = TEAM_COLORS[selectedTeam.abbreviation] || ['#1a1a2a', '#4444ff'];
                      return (
                        <View style={[styles.revealCard, { backgroundColor: colors[0], borderColor: colors[1] }]}>
                          <Image
                            source={{ uri: getLogoUrl(selectedTeam.abbreviation, eraKey) || '' }}
                            style={styles.revealLogo}
                            resizeMode='contain'
                            onError={() => {}}
                          />
                          {!getLogoUrl(selectedTeam.abbreviation, eraKey) && (
                            <Text style={styles.revealCardAbbr}>{selectedTeam.abbreviation}</Text>
                          )}
                          <Text style={styles.revealCardName}>{selectedTeam.name}</Text>
                        </View>
                      );
                    })()}
                  </Animated.View>
                  <Animated.View style={[styles.revealBottomText, { opacity: bottomTextOpacity }]}>
                    <Text style={styles.revealTeamName}>You have chosen the</Text>
                    <Text style={styles.revealTeamFull}>{selectedTeam.full_name}</Text>
                    {saving ? (
                      <ActivityIndicator color='#00ff87' style={{ marginTop: 20 }} />
                    ) : (
                      <Text style={styles.revealCountdown}>
                        Locking in {countdown > 0 ? 'in ' + countdown + 's' : '...'} · tap anywhere to skip
                      </Text>
                    )}
                  </Animated.View>
                </View>
              ) : (
                // CARD GRID
                <View style={styles.cardGrid}>
                  {shuffledTeams.map((team, index) => {
                    const flipAnim = flipAnims.current[index] || new Animated.Value(0);
                    const frontRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
                    const backRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
                    const colors = TEAM_COLORS[team.abbreviation] || ['#1a1a2a', '#4444ff'];
                    const isChosen = revealedIndex === index;
                    return (
                      <Animated.View
                        key={team.id}
                        style={[
                          styles.cardWrapper,
                          !isChosen && revealedIndex !== null && { opacity: othersOpacity },
                          isChosen && { transform: [{ scale: cardScale }, { translateY: cardY }], zIndex: 10 },
                        ]}
                      >
                        <TouchableOpacity
                          style={{ width: 88, height: 116 }}
                          onPress={() => handleFlipCard(index, team)}
                          disabled={revealedIndex !== null}
                          activeOpacity={0.8}
                        >
                          <Animated.View style={[styles.cardFace, styles.cardBack, { transform: [{ rotateY: frontRotate }] }]}>
                            <Text style={styles.cardBackIcon}>🏀</Text>
                            <Text style={styles.cardBackText}>NBA</Text>
                          </Animated.View>
                          <Animated.View style={[styles.cardFace, styles.cardFront, { backgroundColor: colors[0], borderColor: colors[1], transform: [{ rotateY: backRotate }] }]}>
                            {getLogoUrl(team.abbreviation) ? (
                              <Image
                                source={{ uri: getLogoUrl(team.abbreviation, eraKey) || '' }}
                                style={styles.cardLogo}
                                resizeMode='contain'
                              />
                            ) : (
                              <Text style={styles.cardFrontAbbr}>{team.abbreviation}</Text>
                            )}
                            <Text style={styles.cardFrontName}>{team.name}</Text>
                          </Animated.View>
                        </TouchableOpacity>
                      </Animated.View>
                    );
                  })}
                </View>
              )}
            </View>
          </ScrollView>
          <GlobalNav />
        </View>
      </TouchableWithoutFeedback>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 90 }}>
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
                  <Image
                    source={getTeamLogoLocal(team.abbreviation, eraKey) || { uri: getTeamLogoUrl(team.abbreviation, eraKey) }}
                    style={styles.teamRowLogo}
                    resizeMode='contain'
                  />
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
  container: { flex: 1, backgroundColor: '#000000' },
  loadingContainer: { flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingText: { color: '#888', fontSize: 15 },
  inner: { padding: 24, paddingTop: 60, paddingBottom: 120 },
  backBtn: { marginBottom: 16 },
  backText: { color: '#00ff87', fontSize: 15, fontWeight: '600' },
  title: { fontSize: 28, fontWeight: '800', color: '#ffffff', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#888', marginBottom: 24 },
  shuffleButton: { backgroundColor: '#1a1a2a', borderRadius: 16, padding: 28, alignItems: 'center', borderWidth: 2, borderColor: '#4444ff', marginBottom: 24 },
  shuffleButtonText: { fontSize: 22, fontWeight: '800', color: '#8888ff' },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginBottom: 32 },
  cardWrapper: { width: 88, height: 116 },
  cardFace: { position: 'absolute', width: 88, height: 116, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backfaceVisibility: 'hidden', borderWidth: 2 },
  cardBack: { backgroundColor: '#1a1a2a', borderColor: '#4444ff' },
  cardBackIcon: { fontSize: 26, marginBottom: 4 },
  cardBackText: { color: '#4444ff', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  cardFront: { borderRadius: 12 },
  cardFrontAbbr: { fontSize: 20, fontWeight: '900', color: '#ffffff' },
  cardLogo: { width: 60, height: 60 },
  revealLogo: { width: 100, height: 100 },
  cardFrontName: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.8)', textAlign: 'center', paddingHorizontal: 6, marginTop: 4 },
  revealContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: height * 0.7, paddingTop: 40 },
  revealTopText: { fontSize: 22, fontWeight: '800', color: '#00ff87', marginBottom: 40, textAlign: 'center', letterSpacing: 1 },
  revealCardWrapper: { marginBottom: 40 },
  revealCard: { width: 160, height: 210, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 3 },
  revealCardAbbr: { fontSize: 48, fontWeight: '900', color: '#ffffff', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 4 },
  revealCardName: { fontSize: 16, fontWeight: '700', color: 'rgba(255,255,255,0.9)', textAlign: 'center', paddingHorizontal: 12, marginTop: 8 },
  revealBottomText: { alignItems: 'center', gap: 8 },
  revealTeamName: { fontSize: 16, color: '#888', textAlign: 'center' },
  revealTeamFull: { fontSize: 28, fontWeight: '900', color: '#ffffff', textAlign: 'center' },
  revealCountdown: { fontSize: 13, color: '#555', marginTop: 16, textAlign: 'center' },
  teamList: { gap: 8, marginBottom: 32 },
  teamRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#2a2a2a' },
  teamRowTaken: { opacity: 0.35 },
  teamRowSelected: { borderColor: '#00ff87', borderWidth: 2 },
  teamColorBar: { width: 6, height: 64 },
  teamRowLogo: { width: 40, height: 40, marginLeft: 10 },
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
});