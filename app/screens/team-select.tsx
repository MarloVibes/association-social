import { getSportTeams, getSportTeamTheme } from '@/constants/sportTeams';
import { generateTeamPicks } from '@/constants/draftPicks';
import SportTeamLogo from '@/components/SportTeamLogo';
import { router, useLocalSearchParams } from 'expo-router';
import { arrayUnion, collection, doc, getDoc, getDocs, onSnapshot, runTransaction, setDoc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useRef, useState } from 'react';
import { Animated, ActivityIndicator, Alert, Dimensions, Easing, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { auth, db, functions } from '@/constants/firebase';
import { getSportRules } from '@/domain/sports/rules';
import GlobalNav from '@/components/GlobalNav';
import { createNbaScheduleLocally, isMissingCallable } from '@/utils/createNbaSchedule';

const { height } = Dimensions.get('window');

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

// Lighten/darken a hex color by amt (-255..255) — mirrors league-rosters gradients.
function adjustColor(hex: string, amt: number): string {
  const c = (hex || '#1a1a2a').replace('#', '');
  const full = c.length === 3 ? c.split('').map(x => x + x).join('') : c;
  const n = parseInt(full, 16);
  let r = (n >> 16) + amt, g = ((n >> 8) & 0xff) + amt, b = (n & 0xff) + amt;
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// Reusable team card matching the League Rosters layout. Optionally face-down (flip).
function RosterTeamCard({ team, currentYear, sport, faceDown, flipAnim }: {
  team: any; currentYear?: number; sport?: string; faceDown?: boolean; flipAnim?: Animated.Value;
}) {
  const isNBA = !sport || sport === 'nba';
  const base = isNBA
    ? (TEAM_COLORS[team.abbreviation] || ['#1a1a2a', '#4444ff'])[0]
    : getSportTeamTheme(sport, team.abbreviation).tintColor;
  const front = (
    <LinearGradient
      colors={[adjustColor(base, 12), base, adjustColor(base, -18)]}
      start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
      style={[styles.rosterCard, { borderColor: adjustColor(base, -25) }]}
    >
      <LinearGradient
        colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }} end={{ x: 0, y: 0.6 }}
        style={styles.rosterGloss} pointerEvents="none"
      />
      <SportTeamLogo
        sport={sport}
        abbr={team.abbreviation}
        era={currentYear}
        style={styles.rosterLogo}
        textColor="#ffffff"
        fontSize={15}
      />
      <View style={styles.rosterInfo}>
        <Text style={styles.rosterName} numberOfLines={1}>{team.full_name || team.name}</Text>
        <Text style={styles.rosterMeta}>{team.abbreviation} · {(team.players || []).length} players</Text>
      </View>
    </LinearGradient>
  );

  if (!faceDown) return front;

  const back = isNBA
    ? { icon: '🏀', label: 'NBA' }
    : sport === 'madden' ? { icon: '🏈', label: 'NFL' } : { icon: '⚾', label: 'MLB' };
  const anim = flipAnim || new Animated.Value(0);
  const backRot = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const frontRot = anim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
  return (
    <View style={styles.flipWrap}>
      <Animated.View style={[styles.flipFace, { transform: [{ rotateY: backRot }] }]}>
        <View style={styles.cardBackFull}>
          <Text style={styles.cardBackIcon}>{back.icon}</Text>
          <Text style={styles.cardBackText}>{back.label}</Text>
        </View>
      </Animated.View>
      <Animated.View style={[styles.flipFace, styles.flipFaceFront, { transform: [{ rotateY: frontRot }] }]}>
        {front}
      </Animated.View>
    </View>
  );
}

const CARD_H = 88;            // card height incl. spacing for the reel
const REEL_VISIBLE = 5;       // cards visible in the spin window
const REEL_WINDOW = CARD_H * REEL_VISIBLE;
const REEL_REPEAT = 8;        // how many times the team list repeats in the reel

export default function TeamSelectScreen() {
  const { leagueId, sport, era, mode } = useLocalSearchParams<{
    leagueId: string; sport: string; era: string; mode: string;
  }>();

  const [teams, setTeams] = useState<any[]>([]);
  const [takenTeams, setTakenTeams] = useState<string[]>([]);
  const [members, setMembers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<any>(null);
  const [spinning, setSpinning] = useState(false);
  const [flippedId, setFlippedId] = useState<string | null>(null);
  const [spinChoices, setSpinChoices] = useState(1);
  const [spunResults, setSpunResults] = useState<any[]>([]);
  const [currentYear, setCurrentYear] = useState<number | undefined>(undefined);
  const spinY = useRef(new Animated.Value(0)).current;
  const flipAnims = useRef<Record<string, Animated.Value>>({});

  const user = auth.currentUser;
  const isRandom = mode === 'random';
  const isDraft = mode === 'draft';
  const eraKey = (era && era !== 'null' && era !== '') ? era : 'current';
  // For non-NBA leagues the pool lives at era_player_pools/{sport} (e.g. mlb, madden),
  // and there are no era_rosters docs — the team list is built from the sport tables.
  const [sportResolved, setSportResolved] = useState(sport || 'nba');
  const isNBA = sportResolved === 'nba';
  const poolKey = isNBA ? eraKey : sportResolved;

  useEffect(() => { loadTeams(); }, []);

  // Live league state so the spin/face-down switch and collision-avoidance stay current.
  useEffect(() => {
    if (!leagueId) return;
    const unsub = onSnapshot(doc(db, 'leagues', leagueId), (snap) => {
      const data = snap.data() || {};
      setTakenTeams(data.takenTeams || []);
      setMembers(data.members || []);
      setSpinChoices(data.spinChoices || 1);
    });
    return () => unsub();
  }, [leagueId]);

  const loadTeams = async () => {
    setLoading(true);
    try {
      // Resolve sport from the league doc (the nav param can arrive empty from some
      // entry points, which would otherwise default the wheel to NBA teams).
      const lSnap = await getDoc(doc(db, 'leagues', leagueId));
      const ld = lSnap.data() || {};
      const sportVal = ld.sport || sport || 'nba';
      setSportResolved(sportVal);
      setCurrentYear(typeof ld.currentYear === 'number' ? ld.currentYear : undefined);
      const isNBALocal = sportVal === 'nba';
      const poolKeyLocal = isNBALocal ? eraKey : sportVal;

      let teamList: any[] = [];
      if (isNBALocal) {
        const teamsSnap = await getDocs(collection(db, 'era_rosters', eraKey, 'teams'));
        teamList = teamsSnap.docs.map(d => d.data()).sort((a, b) => a.full_name.localeCompare(b.full_name));
      } else {
        // No era_rosters for football/baseball — build the team list from the sport tables.
        const table = getSportTeams(sportVal) || {};
        teamList = Object.values(table).map((t: any) => ({
          id: t.abbr,
          abbreviation: t.abbr,
          full_name: `${t.city} ${t.name}`,
          name: t.name,
          players: [],
        })).sort((a, b) => a.full_name.localeCompare(b.full_name));
      }

      // Attach real players from the pool (era_player_pools/{poolKey}).
      try {
        const poolSnap = await getDoc(doc(db, 'era_player_pools', poolKeyLocal));
        const allPoolPlayers = poolSnap.data()?.players || [];
        teamList = teamList.map((t: any) => {
          const realPlayers = allPoolPlayers.filter((p: any) => p.team === t.abbreviation);
          return realPlayers.length > 0 ? { ...t, players: realPlayers } : t;
        });
      } catch (e) {
        console.warn('Failed to load player pool for counts', e);
      }

      setTeams(teamList);

      // Restore spins already used (persisted server-side) so closing the app
      // or pressing Home cannot reset the spin count and grant infinite re-rolls.
      try {
        if (user) {
          const spinSnap = await getDoc(doc(db, 'leagues', leagueId, 'spins', user.uid));
          const savedIds: string[] = spinSnap.data()?.teamIds || [];
          if (savedIds.length > 0) {
            const restored = savedIds
              .map((id) => teamList.find((t: any) => t.id === id))
              .filter(Boolean);
            setSpunResults(restored);
          }
        }
      } catch (e) { console.warn('Failed to restore spins', e); }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  // Persist this GM's spin results to the league so they survive an app restart.
  const persistSpins = async (results: any[]) => {
    if (!user || !leagueId) return;
    try {
      await setDoc(doc(db, 'leagues', leagueId, 'spins', user.uid), {
        teamIds: results.map((r) => r.id),
        spunAt: new Date().toISOString(),
      });
    } catch (e) { console.warn('Failed to persist spins', e); }
  };

  // Spin the ferris-wheel reel and land on a random team not already landed on.
  const handleSpin = (available: any[]) => {
    if (spinning || saving) return;
    const remaining = available.filter(t => !spunResults.some(r => r.id === t.id));
    if (remaining.length === 0) return;
    setSpinning(true);
    const winner = remaining[Math.floor(Math.random() * remaining.length)];
    const idxInAvail = available.findIndex(t => t.id === winner.id);
    // Land the winner near the end of the repeated reel for a long spin.
    const landIndex = (REEL_REPEAT - 2) * available.length + idxInAvail;
    const finalY = -(landIndex * CARD_H) + (REEL_WINDOW / 2 - CARD_H / 2);
    spinY.setValue(0);
    Animated.timing(spinY, {
      toValue: finalY,
      duration: 4800,
      easing: Easing.out(Easing.poly(5)), // quintic — long, dramatic slow-down at the end
      useNativeDriver: true,
    }).start(() => {
      setSpinning(false);
      setSpunResults(prev => {
        const next = [...prev, winner];
        persistSpins(next); // save immediately so a kill/Home can't reset the count
        return next;
      });
      // Single-spin leagues: lock straight onto the team you landed on (no do-overs).
      if (spinChoices <= 1) setSelectedTeam(winner);
    });
  };

  const getFlipAnim = (id: string) => {
    if (!flipAnims.current[id]) flipAnims.current[id] = new Animated.Value(0);
    return flipAnims.current[id];
  };

  // Flip a face-down card to reveal the team, then await confirm.
  const handleFlip = (team: any) => {
    if (flippedId || spinning || saving) return;
    setFlippedId(team.id);
    Animated.spring(getFlipAnim(team.id), {
      toValue: 1, friction: 8, tension: 10, useNativeDriver: true,
    }).start(() => setSelectedTeam(team));
  };

  const handleConfirmTeam = async (team: any) => {
    if (!team || !user) return;
    setSaving(true);
    try {
      // Collision guard: another GM may have grabbed this team while we deliberated.
      const freshLeague = await getDoc(doc(db, 'leagues', leagueId));
      const ld = freshLeague.data() || {};
      const freshTaken: string[] = ld.takenTeams || [];
      if (freshTaken.includes(team.id)) {
        Alert.alert('Just missed it', (team.full_name || 'That team') + ' was just claimed by another GM. ' + (isRandom ? 'Spin again!' : 'Pick another.'));
        setSelectedTeam(null);
        setFlippedId(null);
        setSaving(false);
        return;
      }
      let players: any[] = [];
      if (!isDraft) {
        const poolSnap = await getDoc(doc(db, 'era_player_pools', poolKey));
        if (poolSnap.exists()) {
          const allPoolPlayers = poolSnap.data().players || [];
          players = allPoolPlayers.filter((p: any) => p.team === team.abbreviation);
        }
        if (players.length === 0) players = team.players || [];
      }
      // Standard draft-pick inventory: this team owns its own picks for the next
      // 7 drafts (rounds per sport). Skipped if the league uses realistic ownership.
      let picks: any[] = [];
      if ((ld.draftPickMode || 'standard') === 'standard') {
        const baseYear = ld.draftBaseYear || (new Date().getFullYear() + 1);
        picks = generateTeamPicks(ld.sport || 'nba', team.abbreviation, baseYear);
      }

      const teamDocId = leagueId + '_' + user.uid;
      const leagueRef = doc(db, 'leagues', leagueId);
      const teamRef = doc(db, 'leagues', leagueId, 'teams', teamDocId);
      let shouldGenerateSchedule = false;
      let selectedGamesPerTeam = 29;
      await runTransaction(db, async (tx) => {
        const leagueTxnSnap = await tx.get(leagueRef);
        const existingTeamSnap = await tx.get(teamRef);
        if (!leagueTxnSnap.exists()) throw new Error('League not found.');
        const currentLeague = leagueTxnSnap.data() || {};
        const currentTaken: string[] = currentLeague.takenTeams || [];
        const currentMembers: string[] = currentLeague.members || [];
        const maxMembers = typeof currentLeague.maxMembers === 'number'
          ? currentLeague.maxMembers
          : getSportRules(currentLeague.sport).teamCount;
        shouldGenerateSchedule = currentLeague.sport === 'nba'
          && currentLeague.scheduleLocked !== true
          && currentLeague.mode !== 'draft';
        selectedGamesPerTeam = Number(currentLeague.gamesPerTeam || 29);

        if (currentTaken.includes(team.id)) {
          throw new Error((team.full_name || 'That team') + ' was just claimed by another GM.');
        }
        if (!currentMembers.includes(user.uid) && currentMembers.length >= maxMembers) {
          throw new Error('This league is full.');
        }
        if (existingTeamSnap.exists() && existingTeamSnap.data()?.teamId !== team.id) {
          throw new Error('You already have a team in this league.');
        }

        tx.set(teamRef, {
          gmId: user.uid,
          teamId: team.id,
          name: team.full_name,
          abbreviation: team.abbreviation,
          era: poolKey,
          players,
          picks,
          tradeBlock: [],
        });
        tx.update(leagueRef, {
          takenTeams: arrayUnion(team.id),
          members: arrayUnion(user.uid),
        });
      });

      try {
        await updateDoc(doc(db, 'users', user.uid), {
          leagues: arrayUnion(leagueId),
        });
      } catch (e) {
        console.warn('Failed to add league to user profile', e);
      }
      if (shouldGenerateSchedule) {
        let scheduleCreationFailed = false;
        try {
          const createSchedule = httpsCallable(functions, 'generateNbaSchedule');
          await createSchedule({
            leagueId,
            gamesPerTeam: selectedGamesPerTeam,
          });
        } catch (e: any) {
          if (isMissingCallable(e)) {
            try {
              await createNbaScheduleLocally({
                leagueId,
                gamesPerTeam: selectedGamesPerTeam,
                createdBy: user.uid,
              });
            } catch (fallbackError) {
              scheduleCreationFailed = true;
              console.warn('Failed to create NBA schedule locally after team claim', fallbackError);
            }
          } else {
            scheduleCreationFailed = true;
            console.warn('Failed to create NBA schedule after team claim', e);
          }
        }
        if (scheduleCreationFailed) {
          Alert.alert(
            'Team claimed',
            'The team was claimed, but the schedule did not lock. Open League Settings > NBA Schedule to create and lock it.'
          );
        }
      }
      router.dismissAll();
      if (isDraft) {
        router.replace({ pathname: '/screens/offseason/live-draft', params: { leagueId } });
      } else {
        router.replace({ pathname: '/screens/league', params: { leagueId } });
      }
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
    // Face-down finale fires only when 4 or fewer teams remain unclaimed.
    const faceDownPhase = availableTeams.length <= 4;

    // Teams not yet landed on this session, and whether another spin is allowed.
    const remainingToSpin = availableTeams.filter(t => !spunResults.some(r => r.id === t.id));
    const canSpin = !spinning && !saving && spunResults.length < spinChoices && remainingToSpin.length > 0;

    // Long repeated strip for the spin reel.
    const reel: any[] = [];
    for (let r = 0; r < REEL_REPEAT; r++) reel.push(...availableTeams);

    return (
      <View style={styles.container}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 90 }}>
          <View style={styles.inner}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>{faceDownPhase ? 'Final Picks' : 'Spin for Your Team'}</Text>
            <Text style={styles.subtitle}>
              {ERA_LABELS[eraKey]} · {availableTeams.length} left{faceDownPhase ? ' · blind pick' : ''}
            </Text>

            {availableTeams.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>All teams have been claimed.</Text>
              </View>
            ) : faceDownPhase ? (
              // FACE-DOWN BLIND PICK
              <>
                <Text style={styles.phaseHint}>Down to the wire — tap a mystery card to claim it.</Text>
                <View style={styles.faceDownGrid}>
                  {availableTeams.map(team => (
                    <TouchableOpacity
                      key={team.id}
                      activeOpacity={0.85}
                      onPress={() => handleFlip(team)}
                      disabled={!!flippedId && flippedId !== team.id}
                      style={[styles.faceDownItem, !!flippedId && flippedId !== team.id && { opacity: 0.4 }]}
                    >
                      <RosterTeamCard team={team} currentYear={currentYear} sport={sportResolved} faceDown flipAnim={getFlipAnim(team.id)} />
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : (
              // PRICE-IS-RIGHT SPIN REEL
              <>
                <View style={styles.reelWindow}>
                  <Animated.View style={{ transform: [{ translateY: spinY }] }}>
                    {reel.map((team, i) => (
                      <View key={team.id + '_' + i} style={styles.reelCard}>
                        <RosterTeamCard team={team} currentYear={currentYear} sport={sportResolved} />
                      </View>
                    ))}
                  </Animated.View>
                  <View style={styles.reelSelector} pointerEvents="none" />
                  <LinearGradient colors={['#000', 'rgba(0,0,0,0)']} style={styles.reelFadeTop} pointerEvents="none" />
                  <LinearGradient colors={['rgba(0,0,0,0)', '#000']} style={styles.reelFadeBottom} pointerEvents="none" />
                </View>
                {canSpin && (
                  <TouchableOpacity
                    style={[styles.spinButton, (spinning || saving) && styles.spinButtonDisabled]}
                    onPress={() => handleSpin(availableTeams)}
                    disabled={spinning || saving}
                  >
                    <Text style={styles.spinButtonText}>
                      {spinning
                        ? 'Spinning…'
                        : spunResults.length === 0
                          ? '🎡 Spin'
                          : '🎡 Spin Again (' + (spinChoices - spunResults.length) + ' left)'}
                    </Text>
                  </TouchableOpacity>
                )}
                {spinChoices > 1 && spunResults.length > 0 && (
                  <View style={styles.resultsBox}>
                    <Text style={styles.resultsLabel}>
                      Your spins{spunResults.length >= spinChoices || remainingToSpin.length === 0 ? ' — pick one to lock in' : ''}
                    </Text>
                    {spunResults.map(t => {
                      const sel = selectedTeam?.id === t.id;
                      return (
                        <TouchableOpacity
                          key={t.id}
                          activeOpacity={0.85}
                          onPress={() => setSelectedTeam(t)}
                          style={[styles.resultItem, sel && styles.resultItemSel]}
                        >
                          <View style={{ flex: 1 }}><RosterTeamCard team={t} currentYear={currentYear} sport={sportResolved} /></View>
                          {sel && <Text style={styles.resultCheck}>✓</Text>}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </>
            )}
          </View>
        </ScrollView>

        {selectedTeam && !spinning && (
          <View style={styles.confirmBar}>
            <View style={styles.confirmBarInfo}>
              <Text style={styles.confirmBarName}>{selectedTeam.full_name}</Text>
              <Text style={styles.confirmBarSub}>{(selectedTeam.players?.length || 0) + ' players pre-loaded'}</Text>
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
                  <SportTeamLogo
                    sport={sportResolved}
                    abbr={team.abbreviation}
                    era={currentYear}
                    style={styles.teamRowLogo}
                    textColor="#ffffff"
                    fontSize={13}
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

  // Reusable league-rosters style card
  rosterCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 14, borderWidth: 1, overflow: 'hidden', height: 72 },
  rosterGloss: { position: 'absolute', top: 0, left: 0, right: 0, height: '60%', borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  rosterLogo: { width: 40, height: 40, marginRight: 12 },
  rosterInfo: { flex: 1 },
  rosterName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  rosterMeta: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },

  // Face-down flip card
  flipWrap: { height: 72 },
  flipFace: { position: 'absolute', left: 0, right: 0, top: 0, height: 72, backfaceVisibility: 'hidden' },
  flipFaceFront: {},
  cardBackFull: { flex: 1, height: 72, borderRadius: 14, borderWidth: 1, borderColor: '#4444ff', backgroundColor: '#10101e', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },

  // Spin reel
  reelWindow: { height: REEL_WINDOW, overflow: 'hidden', borderRadius: 16, borderWidth: 1, borderColor: '#222', marginBottom: 20 },
  reelCard: { height: CARD_H, justifyContent: 'center', paddingHorizontal: 4 },
  reelSelector: { position: 'absolute', left: 4, right: 4, top: REEL_WINDOW / 2 - CARD_H / 2, height: CARD_H, borderRadius: 16, borderWidth: 2, borderColor: '#00ff87' },
  reelFadeTop: { position: 'absolute', top: 0, left: 0, right: 0, height: CARD_H },
  reelFadeBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: CARD_H },
  spinButton: { backgroundColor: '#00ff87', borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 24 },
  spinButtonDisabled: { opacity: 0.5 },
  spinButtonText: { color: '#000', fontSize: 20, fontWeight: '900', letterSpacing: 0.5 },
  resultsBox: { marginBottom: 24 },
  resultsLabel: { color: '#F5A623', fontSize: 13, fontWeight: '800', marginBottom: 10, textTransform: 'uppercase' },
  resultItem: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 2, borderColor: 'transparent', marginBottom: 10, paddingRight: 8 },
  resultItemSel: { borderColor: '#00ff87' },
  resultCheck: { color: '#00ff87', fontSize: 22, fontWeight: '800', marginLeft: 8 },

  // Face-down grid
  phaseHint: { color: '#F5A623', fontSize: 13, fontWeight: '600', marginBottom: 14, textAlign: 'center' },
  faceDownGrid: { gap: 12, marginBottom: 24 },
  faceDownItem: { marginBottom: 0 },
  emptyBox: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#666', fontSize: 15 },
});
