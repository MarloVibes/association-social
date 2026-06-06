import { router, useLocalSearchParams } from 'expo-router';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { db } from '@/constants/firebase';
import { getEraCap } from '@/constants/eraCaps';
import GlobalNav from '@/components/GlobalNav';

const SEASON_MAP: Record<number, string> = {
  1983: '1983-84', 1984: '1984-85', 1985: '1985-86', 1986: '1986-87',
  1987: '1987-88', 1988: '1988-89', 1989: '1989-90', 1990: '1990-91',
  1991: '1991-92', 1992: '1992-93', 1993: '1993-94', 1994: '1994-95',
  1995: '1995-96', 1996: '1996-97', 1997: '1997-98', 1998: '1998-99',
  2000: '2000-01', 2001: '2001-02', 2002: '2002-03', 2003: '2003-04',
  2004: '2004-05', 2005: '2005-06', 2006: '2006-07', 2007: '2007-08',
  2008: '2008-09', 2009: '2009-10', 2010: '2010-11', 2011: '2011-12',
  2012: '2012-13', 2013: '2013-14', 2014: '2014-15', 2015: '2015-16',
  2016: '2016-17', 2017: '2017-18', 2018: '2018-19', 2019: '2019-20',
  2020: '2020-21', 2021: '2021-22', 2022: '2022-23', 2023: '2023-24',
  2024: '2024-25',
};

const ERA_MAX_YEAR: Record<string, number> = {
  magic_bird: 1991,
  jordan: 2002,
  kobe: 2010,
  lebron: 2016,
  steph: 2023,
  current: 2024,
};

// Eras chain into one another (like NBA 2K MyNBA Eras). As the timeline crosses
// a boundary year, the league's era + salary cap roll forward; rosters carry on.
const ERA_LABEL: Record<string, string> = {
  magic_bird: 'Magic vs Bird', jordan: 'Jordan', kobe: 'Kobe',
  lebron: 'LeBron', steph: 'Steph', current: 'Modern',
};
// Last season the timeline can reach (present day).
const FINAL_YEAR = 2025;

function eraForYear(year: number): string {
  if (year >= 2024) return 'current';
  if (year >= 2016) return 'steph';
  if (year >= 2010) return 'lebron';
  if (year >= 2002) return 'kobe';
  if (year >= 1991) return 'jordan';
  return 'magic_bird';
}

export default function AdvanceSeasonScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const [league, setLeague] = useState<any>(null);
  const [draftClass, setDraftClass] = useState<any[]>([]);
  const [retiringPlayers, setRetiringPlayers] = useState<any[]>([]);
  const [reversedIds, setReversedIds] = useState<Set<string>>(new Set());
  const keyOf = (p: any) => p?.player_id || p?.full_name || '';
  const toggleReverse = (p: any) => {
    const k = keyOf(p);
    setReversedIds(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const leagueSnap = await getDoc(doc(db, 'leagues', leagueId));
      if (!leagueSnap.exists()) return;
      const leagueData = { id: leagueSnap.id, ...leagueSnap.data() };
      setLeague(leagueData);

      const nextYear = (leagueData.currentYear || 2024) + 1;

      // Load draft class for next year
      const draftSnap = await getDoc(doc(db, 'draft_classes', String(nextYear)));
      if (draftSnap.exists()) {
        setDraftClass(draftSnap.data().players || []);
      }

      // Find players retiring this year
      const teamsSnap = await getDocs(collection(db, 'leagues', leagueId, 'teams'));
      const retiring: any[] = [];
      for (const teamDoc of teamsSnap.docs) {
        const teamData = teamDoc.data();
        for (const player of (teamData.players || [])) {
          if (player.retirement_year && player.retirement_year <= nextYear) {
            retiring.push({ ...player, teamName: teamData.name });
          }
        }
      }
      setRetiringPlayers(retiring);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleAdvanceSeason = async () => {
    if (!league) return;
    const nextYear = (league.currentYear || 2024) + 1;

    if (nextYear > FINAL_YEAR) {
      Alert.alert('Present Day', "You've simmed all the way to the present. There are no further seasons yet.");
      return;
    }

    const curEra = league.era || eraForYear(league.currentYear || 2024);
    const newEra = eraForYear(nextYear);
    const crossing = newEra !== curEra;

    const base = `Advance to ${SEASON_MAP[nextYear] || nextYear + '-' + (nextYear + 1)}?\n\nAll players will age +1 year. ${draftClass.length} new rookies will be available. ${retiringPlayers.length} players are eligible to retire.`;
    const eraNote = crossing
      ? `\n\n🏀 Your league is crossing into the ${ERA_LABEL[newEra] || newEra} era — the salary cap and league feel update, but your rosters carry over.`
      : '';

    Alert.alert(
      crossing ? 'New Era!' : 'Advance Season',
      base + eraNote,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: crossing ? 'Enter New Era' : 'Advance', onPress: doAdvanceSeason },
      ]
    );
  };

  const doAdvanceSeason = async () => {
    setAdvancing(true);
    try {
      const nextYear = (league.currentYear || 2024) + 1;
      const nextSeason = SEASON_MAP[nextYear] || String(nextYear);
      const newEra = eraForYear(nextYear);
      const batch = writeBatch(db);

      const leagueUpdate: any = {
        currentYear: nextYear,
        currentSeason: nextSeason,
      };
      // Crossing into a new era: roll the era label + salary cap forward.
      if (newEra !== (league.era || eraForYear(league.currentYear || 2024))) {
        leagueUpdate.era = newEra;
        leagueUpdate.salaryCap = getEraCap(newEra);
      }
      batch.update(doc(db, 'leagues', leagueId), leagueUpdate);

      const teamsSnap = await getDocs(collection(db, 'leagues', leagueId, 'teams'));
      for (const teamDoc of teamsSnap.docs) {
        const teamData = teamDoc.data();
        const yKey = String(nextYear);
        const agedPlayers = (teamData.players || []).map((player: any) => {
          // Real historical salary for the upcoming season if we have it,
          // otherwise keep the player's existing (production-scaled) salary.
          const realSalary = player.salaryByYear && player.salaryByYear[yKey] != null
            ? player.salaryByYear[yKey]
            : player.salary;
          const out: any = {
            ...player,
            age: player.birth_year ? nextYear - player.birth_year : (player.age || 0) + 1,
          };
          if (realSalary != null) out.salary = realSalary;
          // Retirement: anyone whose retirement_year has arrived retires,
          // UNLESS the commissioner reversed it (they didn't retire in-game).
          const isRetiring = player.retirement_year && player.retirement_year <= nextYear;
          if (isRetiring) {
            if (reversedIds.has(keyOf(player))) {
              out.retirement_year = nextYear + 5; // kept active; push retirement out
              out.retired = false;
            } else {
              out.retired = true;
            }
          }
          return out;
        });
        batch.update(doc(db, 'leagues', leagueId, 'teams', teamDoc.id), {
          players: agedPlayers,
        });
      }

      await batch.commit();

      // Save draft class to league free agents pool
      if (draftClass.length > 0) {
        const rookies = draftClass.map(p => ({
          ...p,
          player_id: p.player_id || ('draft_' + nextYear + '_' + p.draft_pick),
          team: '',
          age: 22,
          birth_year: nextYear - 22,
          position: p.position || 'G',
        }));
        await setDoc(doc(db, 'leagues', leagueId, 'free_agents', String(nextYear)), {
          year: nextYear,
          players: rookies,
          addedAt: new Date().toISOString(),
        });
        console.log('Saved', rookies.length, 'rookies to free agents for year', nextYear);
      }

      Alert.alert(
        'Season Advanced!',
        'Welcome to the ' + nextSeason + ' season. ' + draftClass.length + ' rookies are now available in the free agent pool.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setAdvancing(false);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size='large' color='#00ff87' />
      </View>
    );
  }

  const nextYear = (league?.currentYear || 2024) + 1;
  const nextSeason = SEASON_MAP[nextYear] || String(nextYear);
  const atMaxYear = nextYear > FINAL_YEAR;
  const curEra = league?.era || eraForYear(league?.currentYear || 2024);
  const crossingEra = !atMaxYear && eraForYear(nextYear) !== curEra;
  const actualRetiring = retiringPlayers.filter(p => !reversedIds.has(keyOf(p))).length;

  return (
    <View style={styles.container}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 90 }}>
        <View style={styles.inner}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Advance Season</Text>
          <Text style={styles.subtitle}>Commissioner Control</Text>

          {/* Current Season */}
          <View style={styles.currentCard}>
            <Text style={styles.currentLabel}>Current Season</Text>
            <Text style={styles.currentSeason}>{league?.currentSeason || '2024-25'}</Text>
            <Text style={styles.currentYear}>{league?.currentYear || 2024}</Text>
          </View>

          {atMaxYear ? (
            <View style={styles.maxEraCard}>
              <Text style={styles.maxEraIcon}>🏆</Text>
              <Text style={styles.maxEraTitle}>Present Day</Text>
              <Text style={styles.maxEraText}>Your franchise has simmed all the way through the eras to the present day. There are no further seasons yet.</Text>
            </View>
          ) : (
            <>
              {crossingEra && (
                <View style={styles.eraCrossCard}>
                  <Text style={styles.eraCrossIcon}>🏀</Text>
                  <Text style={styles.eraCrossTitle}>Entering the {ERA_LABEL[eraForYear(nextYear)]} Era</Text>
                  <Text style={styles.eraCrossText}>Your rosters carry over. The salary cap and league feel update to the new era.</Text>
                </View>
              )}
              {/* Next Season Preview */}
              <View style={styles.nextCard}>
                <Text style={styles.nextLabel}>Next Season</Text>
                <Text style={styles.nextSeason}>{nextSeason}</Text>
              </View>

              {/* What happens */}
              <Text style={styles.sectionTitle}>What happens when you advance:</Text>

              <View style={styles.effectCard}>
                <View style={styles.effectRow}>
                  <Text style={styles.effectIcon}>📅</Text>
                  <View style={styles.effectInfo}>
                    <Text style={styles.effectTitle}>All Players Age +1</Text>
                    <Text style={styles.effectDesc}>Every player on every team gets one year older</Text>
                  </View>
                </View>
                <View style={styles.effectRow}>
                  <Text style={styles.effectIcon}>🏀</Text>
                  <View style={styles.effectInfo}>
                    <Text style={styles.effectTitle}>{draftClass.length} New Rookies</Text>
                    <Text style={styles.effectDesc}>{nextYear} draft class becomes available as free agents</Text>
                  </View>
                </View>
                {actualRetiring > 0 && (
                  <View style={styles.effectRow}>
                    <Text style={styles.effectIcon}>👋</Text>
                    <View style={styles.effectInfo}>
                      <Text style={styles.effectTitle}>{actualRetiring} Players Retiring</Text>
                      <Text style={styles.effectDesc}>Tap any name below to keep them if they're staying</Text>
                    </View>
                  </View>
                )}
              </View>

              {/* Retiring players list */}
              {retiringPlayers.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>Retiring Players</Text>
                  <Text style={styles.retiringHint}>Tap a player to keep them if they didn't actually retire in your game.</Text>
                  <View style={styles.retiringCard}>
                    {retiringPlayers.map((p, i) => {
                      const kept = reversedIds.has(keyOf(p));
                      return (
                        <TouchableOpacity key={i} style={styles.retiringRow} onPress={() => toggleReverse(p)} activeOpacity={0.7}>
                          <View style={styles.retiringPos}>
                            <Text style={styles.retiringPosText}>{p.position}</Text>
                          </View>
                          <View style={styles.retiringInfo}>
                            <Text style={styles.retiringName}>{p.full_name}</Text>
                            <Text style={styles.retiringTeam}>{p.teamName}</Text>
                          </View>
                          <Text style={kept ? styles.keptBadge : styles.retiredBadge}>{kept ? '✓ Staying' : 'Retiring'}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              {/* Top rookies preview */}
              {draftClass.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>Top {nextYear} Rookies</Text>
                  <View style={styles.rookieCard}>
                    {draftClass.slice(0, 10).map((p, i) => (
                      <View key={i} style={styles.rookieRow}>
                        <Text style={styles.rookiePick}>#{p.draft_pick}</Text>
                        <View style={styles.rookieInfo}>
                          <Text style={styles.rookieName}>{p.full_name}</Text>
                          <Text style={styles.rookieTeam}>{p.drafted_by}{(p.college || p.high_school || p.country) ? ' · ' + (p.college || p.high_school || p.country) : ''}</Text>
                        </View>
                      </View>
                    ))}
                    {draftClass.length > 10 && (
                      <Text style={styles.morePlayers}>+{draftClass.length - 10} more rookies</Text>
                    )}
                  </View>
                </>
              )}

              <TouchableOpacity
                style={[styles.advanceBtn, advancing && styles.advanceBtnDisabled]}
                onPress={handleAdvanceSeason}
                disabled={advancing}
              >
                {advancing
                  ? <ActivityIndicator color='#000' />
                  : <Text style={styles.advanceBtnText}>{crossingEra ? `Enter the ${ERA_LABEL[eraForYear(nextYear)]} Era →` : `Advance to ${nextSeason} →`}</Text>
                }
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
      <GlobalNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  loadingContainer: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' },
  inner: { padding: 24, paddingTop: 60, paddingBottom: 120 },
  backBtn: { marginBottom: 16 },
  backText: { color: '#00ff87', fontSize: 15, fontWeight: '600' },
  title: { fontSize: 28, fontWeight: '800', color: '#ffffff', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#888', marginBottom: 24 },
  currentCard: { backgroundColor: '#1a1a1a', borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#2a2a2a', alignItems: 'center' },
  currentLabel: { fontSize: 12, color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  currentSeason: { fontSize: 32, fontWeight: '800', color: '#ffffff', marginBottom: 4 },
  currentYear: { fontSize: 16, color: '#888' },
  nextCard: { backgroundColor: '#0a2a1a', borderRadius: 16, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: '#00ff87', alignItems: 'center' },
  nextLabel: { fontSize: 12, color: '#4a8a4a', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  nextSeason: { fontSize: 28, fontWeight: '800', color: '#00ff87' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#ffffff', marginBottom: 12 },
  effectCard: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: '#2a2a2a', gap: 16 },
  effectRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  effectIcon: { fontSize: 24 },
  effectInfo: { flex: 1 },
  effectTitle: { color: '#ffffff', fontSize: 15, fontWeight: '700', marginBottom: 2 },
  effectDesc: { color: '#666', fontSize: 13 },
  retiringCard: { backgroundColor: '#1a0a0a', borderRadius: 14, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: '#ff4444', gap: 12 },
  retiringRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  retiringPos: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#2a0a0a', borderWidth: 1, borderColor: '#ff4444', alignItems: 'center', justifyContent: 'center' },
  retiringPosText: { color: '#ff4444', fontSize: 11, fontWeight: '700' },
  retiringInfo: { flex: 1 },
  retiringName: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  retiringTeam: { color: '#666', fontSize: 12 },
  retiredBadge: { color: '#ff4444', fontSize: 11, fontWeight: '700', backgroundColor: '#2a0a0a', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#ff4444' },
  keptBadge: { color: '#00ff87', fontSize: 11, fontWeight: '700', backgroundColor: '#0a2a1a', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#00ff87' },
  retiringHint: { color: '#888', fontSize: 12, marginBottom: 10, marginTop: -4, lineHeight: 17 },
  rookieCard: { backgroundColor: '#0a1a2a', borderRadius: 14, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: '#1a3a5a', gap: 10 },
  rookieRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rookiePick: { color: '#4a7aaa', fontSize: 13, fontWeight: '700', width: 32 },
  rookieInfo: { flex: 1 },
  rookieName: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  rookieTeam: { color: '#555', fontSize: 12 },
  morePlayers: { color: '#555', fontSize: 13, textAlign: 'center', paddingTop: 4 },
  advanceBtn: { backgroundColor: '#00ff87', borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginTop: 8 },
  advanceBtnDisabled: { opacity: 0.4 },
  advanceBtnText: { color: '#000', fontSize: 16, fontWeight: '800' },
  maxEraCard: { backgroundColor: '#1a1a0a', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: '#ffaa00', alignItems: 'center', gap: 12 },
  maxEraIcon: { fontSize: 48 },
  maxEraTitle: { fontSize: 22, fontWeight: '800', color: '#ffaa00' },
  maxEraText: { color: '#888', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  eraCrossCard: { backgroundColor: '#0a1f14', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#00ff87', alignItems: 'center', gap: 8, marginBottom: 16 },
  eraCrossIcon: { fontSize: 36 },
  eraCrossTitle: { fontSize: 18, fontWeight: '800', color: '#00ff87', textAlign: 'center' },
  eraCrossText: { color: '#9fdcc0', fontSize: 13, textAlign: 'center', lineHeight: 19 },
});