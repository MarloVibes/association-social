import { doc, getDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View, Image } from 'react-native';
import { db } from '@/constants/firebase';

type Props = {
  player: any;
  era: string;
  leagueId: string;
  teamId: string;
  visible: boolean;
  onClose: () => void;
};

const POSITION_COLORS: Record<string, string> = {
  PG: '#00ff87', SG: '#00ccff', SF: '#ff9900', PF: '#ff4444', C: '#aa44ff',
  G: '#00ccff', F: '#ff9900', 'G-F': '#88ddaa', 'F-G': '#88ddaa', 'F-C': '#cc7744', 'C-F': '#cc7744',
};

function calcOVR(seasons: any[]): number {
  if (!seasons || seasons.length === 0) return 0;
  const best = seasons.reduce((best, s) => {
    const score = (parseFloat(s.ppg) || 0) + (parseFloat(s.rpg) || 0) + (parseFloat(s.apg) || 0);
    const bestScore = (parseFloat(best.ppg) || 0) + (parseFloat(best.rpg) || 0) + (parseFloat(best.apg) || 0);
    return score > bestScore ? s : best;
  }, seasons[0]);
  const ppg = parseFloat(best.ppg) || 0;
  const rpg = parseFloat(best.rpg) || 0;
  const apg = parseFloat(best.apg) || 0;
  const spg = parseFloat(best.spg) || 0;
  const bpg = parseFloat(best.bpg) || 0;
  const fg = parseFloat(best.fg_pct) || 0;
  const raw = (ppg * 1.5) + (rpg * 1.0) + (apg * 1.2) + (spg * 2.0) + (bpg * 1.5) + (fg * 20);
  return Math.min(99, Math.max(60, Math.round(50 + raw)));
}

function ovrColor(ovr: number): string {
  if (ovr >= 90) return '#00ff87';
  if (ovr >= 80) return '#ffcc00';
  if (ovr >= 70) return '#ff9900';
  return '#ff4444';
}

function getAccoladeIcon(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('champion')) return '🏆';
  if (t.includes('most valuable player') || t.includes('mvp')) return '🥇';
  if (t.includes('all-star')) return '⭐';
  if (t.includes('all-nba') || t.includes('all nba')) return '🏅';
  if (t.includes('defensive player')) return '🛡️';
  if (t.includes('rookie')) return '🌟';
  if (t.includes('scoring')) return '🔥';
  if (t.includes('finals')) return '🏆';
  if (t.includes('olympic') || t.includes('gold medal')) return '🥇';
  return '🎖️';
}

export default function PlayerCard({ player, era, leagueId, teamId, visible, onClose }: Props) {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [onTradeBlock, setOnTradeBlock] = useState(false);
  const [expandedSeason, setExpandedSeason] = useState<string | null>(null);

  useEffect(() => {
    if (visible && player) loadPlayerData();
  }, [visible, player]);

  const loadPlayerData = async () => {
    setLoading(true);
    setProfile(null);
    try {
      const brefId = player.bref_id || '';
      if (brefId) {
        const snap = await getDoc(doc(db, 'player_profiles', brefId));
        if (snap.exists()) setProfile(snap.data());
      }
      if (teamId && leagueId) {
        const teamSnap = await getDoc(doc(db, 'leagues', leagueId, 'teams', teamId));
        if (teamSnap.exists()) {
          const tb = teamSnap.data().tradeBlock || [];
          setOnTradeBlock(tb.includes(player.player_id || player.full_name));
        }
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleTradeBlock = async () => {
    const pid = player.player_id || player.full_name;
    try {
      if (onTradeBlock) {
        await updateDoc(doc(db, 'leagues', leagueId, 'teams', teamId), { tradeBlock: arrayRemove(pid) });
        setOnTradeBlock(false);
      } else {
        await updateDoc(doc(db, 'leagues', leagueId, 'teams', teamId), { tradeBlock: arrayUnion(pid) });
        setOnTradeBlock(true);
      }
    } catch (e) { console.error(e); }
  };

  if (!player) return null;

  const name = player.full_name || player.name || '';
  const pos = profile?.position || player.position || '?';
  const posColor = POSITION_COLORS[pos.split('-')[0]] || '#888';
  const seasons = profile?.seasons || [];
  const accolades = profile?.accolades || [];
  const ovr = calcOVR(seasons);
  const brefId = player.bref_id || '';

  return (
    <Modal visible={visible} animationType='slide' presentationStyle='pageSheet' onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.handle} />
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>✕ Close</Text>
        </TouchableOpacity>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size='large' color='#00ff87' />
              <Text style={styles.loadingText}>Loading career stats...</Text>
            </View>
          ) : (
            <>
              {/* Hero Section */}
              <View style={styles.heroSection}>
                <View style={styles.photoWrapper}>
                  {brefId ? (
                    <Image
                      source={{ uri: 'https://www.basketball-reference.com/req/202106291/images/headshots/' + brefId + '.jpg' }}
                      style={styles.photo}
                      resizeMode='cover'
                    />
                  ) : (
                    <View style={[styles.photoPlaceholder, { backgroundColor: posColor + '33' }]}>
                      <Text style={[styles.photoInitial, { color: posColor }]}>{name[0]}</Text>
                    </View>
                  )}
                  <View style={[styles.ovrBadge, { borderColor: ovrColor(ovr) }]}>
                    <Text style={[styles.ovrNum, { color: ovrColor(ovr) }]}>{ovr}</Text>
                    <Text style={styles.ovrLbl}>OVR</Text>
                  </View>
                </View>

                <View style={styles.heroInfo}>
                  <Text style={styles.heroName}>{name}</Text>
                  <View style={styles.heroMeta}>
                    <View style={[styles.posBadge, { backgroundColor: posColor + '22', borderColor: posColor }]}>
                      <Text style={[styles.posBadgeText, { color: posColor }]}>{pos}</Text>
                    </View>
                    {player.team ? <Text style={styles.heroTeam}>{player.team}</Text> : null}
                  </View>
                  {(profile?.height || profile?.weight) ? (
                    <Text style={styles.physical}>{[profile.height, profile.weight ? profile.weight + ' lbs' : ''].filter(Boolean).join(' · ')}</Text>
                  ) : null}
                  {profile?.birth_date ? (
                    <Text style={styles.birthDate}>Born: {profile.birth_date}</Text>
                  ) : null}
                </View>
              </View>

              {/* Accolades */}
              {accolades.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>🏆 Accolades</Text>
                  {accolades.map((a: string, i: number) => (
                    <View key={i} style={styles.accoladeRow}>
                      <Text style={styles.accoladeIcon}>{getAccoladeIcon(a)}</Text>
                      <Text style={styles.accoladeText}>{a}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Career Stats by Season */}
              {seasons.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>📊 Career Stats</Text>
                  {/* Header */}
                  <View style={styles.statsHeader}>
                    {['Year', 'Team', 'PPG', 'RPG', 'APG', 'SPG', 'BPG', 'FG%'].map(h => (
                      <Text key={h} style={[styles.statsHeaderCell, h === 'Year' && { flex: 1.5 }, h === 'Team' && { flex: 1 }]}>{h}</Text>
                    ))}
                  </View>
                  {seasons.map((s: any, i: number) => (
                    <TouchableOpacity
                      key={i}
                      style={[styles.statsRow, i % 2 === 0 && styles.statsRowAlt]}
                      onPress={() => setExpandedSeason(expandedSeason === s.year ? null : s.year)}
                    >
                      <Text style={[styles.statsCell, { flex: 1.5, color: '#00ff87' }]}>{s.year}</Text>
                      <Text style={[styles.statsCell, { flex: 1 }]}>{s.team}</Text>
                      <Text style={styles.statsCell}>{s.ppg || '—'}</Text>
                      <Text style={styles.statsCell}>{s.rpg || '—'}</Text>
                      <Text style={styles.statsCell}>{s.apg || '—'}</Text>
                      <Text style={styles.statsCell}>{s.spg || '—'}</Text>
                      <Text style={styles.statsCell}>{s.bpg || '—'}</Text>
                      <Text style={styles.statsCell}>{s.fg_pct ? (parseFloat(s.fg_pct) * 100).toFixed(0) + '%' : '—'}</Text>
                    </TouchableOpacity>
                  ))}
                  {expandedSeason && (() => {
                    const s = seasons.find((s: any) => s.year === expandedSeason);
                    if (!s) return null;
                    return (
                      <View style={styles.expandedStats}>
                        <Text style={styles.expandedTitle}>{s.year} — {s.team}</Text>
                        <View style={styles.expandedGrid}>
                          {[
                            { label: 'PPG', value: s.ppg },
                            { label: 'RPG', value: s.rpg },
                            { label: 'APG', value: s.apg },
                            { label: 'SPG', value: s.spg },
                            { label: 'BPG', value: s.bpg },
                            { label: 'MPG', value: s.mpg },
                            { label: 'FG%', value: s.fg_pct ? (parseFloat(s.fg_pct)*100).toFixed(1)+'%' : '' },
                            { label: '3P%', value: s.fg3_pct ? (parseFloat(s.fg3_pct)*100).toFixed(1)+'%' : '' },
                            { label: 'FT%', value: s.ft_pct ? (parseFloat(s.ft_pct)*100).toFixed(1)+'%' : '' },
                            { label: 'GP', value: s.games },
                          ].map(stat => (
                            <View key={stat.label} style={styles.expandedStatItem}>
                              <Text style={styles.expandedStatValue}>{stat.value || '—'}</Text>
                              <Text style={styles.expandedStatLabel}>{stat.label}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    );
                  })()}
                </View>
              )}

              {!profile && (
                <View style={styles.noData}>
                  <Text style={styles.noDataText}>Career data loading... Check back soon.</Text>
                </View>
              )}

              {/* Trade Block */}
              {teamId && (
                <TouchableOpacity
                  style={[styles.tradeBtn, onTradeBlock && styles.tradeBtnActive]}
                  onPress={handleTradeBlock}
                >
                  <Text style={[styles.tradeBtnText, onTradeBlock && styles.tradeBtnTextActive]}>
                    {onTradeBlock ? '🔄 Remove from Trade Block' : '🔄 Add to Trade Block'}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  handle: { width: 40, height: 4, backgroundColor: '#333', borderRadius: 2, alignSelf: 'center', marginTop: 12 },
  closeBtn: { alignSelf: 'flex-end', paddingHorizontal: 20, paddingVertical: 12 },
  closeBtnText: { color: '#00ff87', fontSize: 14, fontWeight: '600' },
  loadingContainer: { alignItems: 'center', paddingTop: 80, gap: 16 },
  loadingText: { color: '#666', fontSize: 14 },
  heroSection: { flexDirection: 'row', padding: 20, gap: 16, alignItems: 'flex-start' },
  photoWrapper: { position: 'relative' },
  photo: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#1a1a1a' },
  photoPlaceholder: { width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center' },
  photoInitial: { fontSize: 36, fontWeight: '900' },
  ovrBadge: { position: 'absolute', bottom: -6, right: -6, width: 36, height: 36, borderRadius: 18, borderWidth: 2, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' },
  ovrNum: { fontSize: 12, fontWeight: '900', lineHeight: 14 },
  ovrLbl: { fontSize: 7, color: '#666', fontWeight: '700' },
  heroInfo: { flex: 1, paddingTop: 4 },
  heroName: { fontSize: 22, fontWeight: '900', color: '#ffffff', marginBottom: 8 },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  posBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  posBadgeText: { fontSize: 11, fontWeight: '700' },
  heroTeam: { color: '#666', fontSize: 13 },
  physical: { color: '#555', fontSize: 12, marginBottom: 4 },
  birthDate: { color: '#444', fontSize: 11 },
  section: { marginHorizontal: 16, marginBottom: 20, backgroundColor: '#111', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#1e1e1e' },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#ffffff', marginBottom: 14, letterSpacing: 0.5 },
  accoladeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  accoladeIcon: { fontSize: 16, marginTop: 1 },
  accoladeText: { flex: 1, color: '#cccccc', fontSize: 13, lineHeight: 20 },
  statsHeader: { flexDirection: 'row', marginBottom: 4, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#222' },
  statsHeaderCell: { flex: 1, color: '#555', fontSize: 10, fontWeight: '700', textAlign: 'center', textTransform: 'uppercase' },
  statsRow: { flexDirection: 'row', paddingVertical: 7, borderRadius: 6 },
  statsRowAlt: { backgroundColor: '#181818' },
  statsCell: { flex: 1, color: '#ccc', fontSize: 12, textAlign: 'center' },
  expandedStats: { backgroundColor: '#1a1a2a', borderRadius: 10, padding: 14, marginTop: 8, borderWidth: 1, borderColor: '#2a2a4a' },
  expandedTitle: { color: '#00ff87', fontSize: 13, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  expandedGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  expandedStatItem: { width: '18%', alignItems: 'center', backgroundColor: '#0a0a1a', borderRadius: 8, padding: 8 },
  expandedStatValue: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  expandedStatLabel: { color: '#555', fontSize: 9, fontWeight: '700', marginTop: 2 },
  noData: { alignItems: 'center', padding: 40 },
  noDataText: { color: '#444', fontSize: 13, textAlign: 'center' },
  tradeBtn: { marginHorizontal: 16, marginTop: 8, backgroundColor: '#1a1a2a', borderRadius: 14, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: '#4444ff' },
  tradeBtnActive: { backgroundColor: '#2a1a0a', borderColor: '#ff9900' },
  tradeBtnText: { color: '#8888ff', fontSize: 15, fontWeight: '700' },
  tradeBtnTextActive: { color: '#ff9900' },
});