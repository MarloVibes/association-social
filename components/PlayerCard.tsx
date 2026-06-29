import { collection, doc, getDoc, getDocs, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Image } from 'react-native';
import { db } from '@/constants/firebase';
import type { VisibleNbaIdentity } from '@/domain/nba/identity';
import { resolveBaselineRatingProfile } from '@/domain/nba/baselineProfileResolver';
import { playerProfileWithLeagueDateAge } from '@/domain/nba/ratingProfile';
import { buildEvaluationLayers } from '@/domain/nba/evaluation';
import {
  buildScoutingGrades,
  compareScoutingGrades,
  getCompareRowModel,
  getPotentialScoutingSummary,
  getScoutingGradeSections,
  gradeColors,
} from '@/domain/nba/scoutingGrades';
import { basketballSeasonAverageItems } from '@/domain/nba/seasonStats';

type Props = {
  player: any;
  era: string;
  sport?: string;
  leagueId: string;
  teamId: string;
  leagueDate?: string | Date | null;
  visible: boolean;
  onClose: () => void;
  isOwned?: boolean;       // true = my player, false = opponent's player, undefined = free agent
  onAddToTargetList?: () => void;
  onOfferTrade?: () => void;
  onDrop?: () => void;
  onSign?: () => void;
  onEditCustom?: () => void;
  onDeleteCustom?: () => void;
};

const POSITION_COLORS: Record<string, string> = {
  PG: '#00ff87', SG: '#00ccff', SF: '#ff9900', PF: '#ff4444', C: '#aa44ff',
  G: '#00ccff', F: '#ff9900', 'G-F': '#88ddaa', 'F-G': '#88ddaa', 'F-C': '#cc7744', 'C-F': '#cc7744',
};

const POSITION_NAME_TO_ABBR: Record<string, string> = {
  'point guard': 'PG',
  'shooting guard': 'SG',
  'small forward': 'SF',
  'power forward': 'PF',
  center: 'C',
};

function cleanPositionLabel(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '?';
  const parts = raw
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => POSITION_NAME_TO_ABBR[part.toLowerCase()] || part.toUpperCase());
  return [...new Set(parts)].join(' / ') || '?';
}



function getAccoladeIcon(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('champion')) return '🏆';
  if (t.includes('most valuable player') || t.includes(' mvp')) return '🥇';
  if (t.includes('all-star')) return '⭐';
  if (t.includes('all-nba') || t.includes('all nba')) return '🏅';
  if (t.includes('defensive player')) return '🛡️';
  if (t.includes('rookie')) return '🌟';
  if (t.includes('scoring')) return '🔥';
  if (t.includes('finals mvp')) return '🏆';
  if (t.includes('olympic') || t.includes('gold medal')) return '🥇';
  if (t.includes('sixth man')) return '6️⃣';
  if (t.includes('assist')) return '🎯';
  if (t.includes('rebound')) return '💪';
  return '🎖️';
}

function formatAccolade(text: string): string {
  // Extract year like "2009-10" -> "09-10" or "2013-14" -> "'13-14"
  // Extract award name and shorten it
  let t = text;
  
  // Shorten year format: "2009-10" -> "'09"
  t = t.replace(/\b(19|20)(\d{2})-(\d{2})\b/g, (_, _c, y1, y2) => "'" + y2);
  t = t.replace(/\b(19|20)(\d{2})\b/g, (_, _c, y) => "'" + y);
  
  // Remove trophy names in parens
  t = t.replace(/\s*\([^)]+Trophy\)/g, '');
  t = t.replace(/\s*\([^)]+Award\)/g, '');
  
  // Shorten common awards
  t = t.replace('Most Valuable Player', 'MVP');
  t = t.replace('Defensive Player of the Year', 'DPOY');
  t = t.replace('Sixth Man of the Year', '6MOY');
  t = t.replace('Most Improved Player', 'MIP');
  t = t.replace('Rookie of the Year', 'ROY');
  t = t.replace('All-Star Game Most Valuable Player', 'All-Star MVP');
  t = t.replace('Finals Most Valuable Player', 'Finals MVP');
  t = t.replace('Scoring Champion', 'Scoring Champ');
  t = t.replace('Assists Champion', 'Assists Champ');
  t = t.replace('Rebounds Champion', 'Rebounds Champ');
  t = t.replace('Sporting News', 'SN');
  t = t.replace('Twyman-Stokes Teammate of the Year', 'Teammate Award');
  t = t.replace('NBA Champion', 'Champion');
  t = t.replace('All-NBA First Team', 'All-NBA 1st');
  t = t.replace('All-NBA Second Team', 'All-NBA 2nd');
  t = t.replace('All-NBA Third Team', 'All-NBA 3rd');
  t = t.replace('All-Defensive First Team', 'All-Def 1st');
  t = t.replace('All-Defensive Second Team', 'All-Def 2nd');
  t = t.replace('All-Rookie First Team', 'All-Rookie 1st');
  t = t.replace('All-Rookie Second Team', 'All-Rookie 2nd');
  
  return t.trim();
}

function groupAccolades(accolades: string[]): { icon: string; label: string; years: string }[] {
  const map: Record<string, string[]> = {};
  const champYears: string[] = [];

  for (const a of accolades) {
    const formatted = formatAccolade(a);
    // Extract years
    const yearMatches = formatted.match(/'\d{2}(?:-\d{2})?/g) || [];
    const years = yearMatches.join(', ');
    // Get base label (remove years)
    const base = formatted.replace(/'\d{2}(?:-\d{2})?\s*/g, '').trim();

    // Finals MVP tracked but rings come from scraped data

    if (!map[base]) map[base] = [];
    if (years) map[base].push(years);
  }

  // Championship rings are already in accolades from scraped data

  return Object.entries(map).map(([label, years]) => ({
    icon: getAccoladeIcon(label),
    label,
    years: [...new Set(years)].join(', '),
  }));
}

function getVisibleIdentity(player: any, profile: any): VisibleNbaIdentity | null {
  const identity = profile?.identity || player?.identity || profile?.visibleIdentity || player?.visibleIdentity;
  if (!identity || typeof identity !== 'object' || identity.overall !== undefined) return null;
  if (!identity.grades || typeof identity.grades !== 'object') return null;
  return identity as VisibleNbaIdentity;
}

function firstStat(stats: any, keys: string[]) {
  for (const key of keys) {
    if (stats?.[key] !== undefined && stats?.[key] !== null && stats?.[key] !== '') return stats[key];
  }
  return null;
}

function extractBrefId(player: any): string {
  if (player?.bref_id) return String(player.bref_id);
  if (player?.brefId) return String(player.brefId);
  const raw = String(player?.player_id || player?.id || '');
  if (!raw) return '';
  if (raw.startsWith('pool_')) return raw.split('_').slice(2).join('_');
  if (raw.startsWith('current_')) return raw.replace(/^current_/, '');
  return raw.includes('_') ? raw.split('_').pop() || '' : raw;
}

function playerKey(player: any): string {
  return String(player?.player_id || player?.id || player?.bref_id || player?.full_name || player?.name || '').toLowerCase();
}

function playerName(player: any): string {
  return String(player?.full_name || player?.name || 'Unknown Player');
}

function playerTeam(player: any): string {
  return String(player?.team || player?.teamAbbr || player?.abbreviation || '');
}

function formatStatValue(value: any): string {
  if (value === undefined || value === null || value === '') return '-';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(value < 1 ? 3 : 1);
  return String(value);
}

function franchiseSeasonStats(stats: any, sport: string): { label: string; value: any }[] {
  const common = [{ label: 'GP', value: firstStat(stats, ['games', 'gp']) }];
  if (sport === 'mlb') {
    return [
      ...common,
      { label: 'AVG', value: firstStat(stats, ['avg']) },
      { label: 'HR', value: firstStat(stats, ['hr', 'homeRuns']) },
      { label: 'RBI', value: firstStat(stats, ['rbi']) },
      { label: 'SB', value: firstStat(stats, ['sb', 'stolenBases']) },
      { label: 'ERA', value: firstStat(stats, ['era']) },
      { label: 'SO', value: firstStat(stats, ['so', 'strikeouts']) },
      { label: 'SV', value: firstStat(stats, ['saves', 'sv']) },
    ].filter(stat => stat.value !== null);
  }
  if (sport === 'madden') {
    return [
      ...common,
      { label: 'PASS', value: firstStat(stats, ['passing_yards', 'passingYards']) },
      { label: 'PTD', value: firstStat(stats, ['passing_tds', 'passingTds']) },
      { label: 'RUSH', value: firstStat(stats, ['rushing_yards', 'rushingYards']) },
      { label: 'REC', value: firstStat(stats, ['receiving_yards', 'receivingYards']) },
      { label: 'SACK', value: firstStat(stats, ['sacks']) },
      { label: 'INT', value: firstStat(stats, ['interceptions']) },
    ].filter(stat => stat.value !== null);
  }
  return [
    ...common,
    ...basketballSeasonAverageItems(stats),
  ].filter(stat => stat.value !== null);
}

function buildFranchiseSeasons(player: any, sport: string) {
  const statHistory = player?.statHistory && typeof player.statHistory === 'object' ? player.statHistory : {};
  const activeStats = player?.seasonStats && typeof player.seasonStats === 'object' ? player.seasonStats : null;
  const activeYear = String(player?.season || player?.currentSeason || player?.year || 'Current');
  const archived = Object.entries(statHistory)
    .sort(([left], [right]) => Number(right) - Number(left))
    .map(([year, stats]: [string, any]) => ({
      year,
      stats,
      statItems: franchiseSeasonStats(stats, sport),
      awards: Array.isArray(stats?.awards) ? stats.awards : [],
    }));
  if (!activeStats) return archived;
  const active = {
    year: activeYear === 'Current' ? 'Current Season' : `Season ${activeYear}`,
    stats: activeStats,
    statItems: franchiseSeasonStats(activeStats, sport),
    awards: Array.isArray(activeStats?.awards) ? activeStats.awards : [],
  };
  return [active, ...archived.filter(season => String(season.year) !== activeYear)];
}

function dedupePlayers(players: any[]) {
  const seen = new Set<string>();
  return players.filter(candidate => {
    const key = playerKey(candidate);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function searchMatches(player: any, query: string) {
  const text = `${playerName(player)} ${playerTeam(player)} ${player?.position || ''}`.toLowerCase();
  return text.includes(query.trim().toLowerCase());
}

export function leagueDateFromRecord(league: any): string | Date | null {
  return league?.leagueDate || league?.currentDate || league?.seasonDate || league?.calendarDate || null;
}

export default function PlayerCard({ player, era, sport, leagueId, teamId, leagueDate, visible, onClose, isOwned, onAddToTargetList, onOfferTrade, onDrop, onSign, onEditCustom, onDeleteCustom }: Props) {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [onTradeBlock, setOnTradeBlock] = useState(false);
  const [expandedSeason, setExpandedSeason] = useState<string | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [activeStatsTab, setActiveStatsTab] = useState<'compare' | 'original'>('compare');
  const [compareCandidates, setCompareCandidates] = useState<any[]>([]);
  const [compareQuery, setCompareQuery] = useState('');
  const [selectedComparePlayer, setSelectedComparePlayer] = useState<any>(null);
  const [selectedCompareProfile, setSelectedCompareProfile] = useState<any>(null);

  useEffect(() => {
    if (visible && player) loadPlayerData();
  }, [visible, player]);

  useEffect(() => {
    if (!visible || !selectedComparePlayer) {
      setSelectedCompareProfile(null);
      return;
    }
    let active = true;
    const loadSelectedCompareProfile = async () => {
      setSelectedCompareProfile(null);
      const brefId = extractBrefId(selectedComparePlayer);
      if (!brefId) return;
      try {
        const vaultSnap = await getDoc(doc(db, 'players', brefId));
        if (active && vaultSnap.exists()) {
          setSelectedCompareProfile(vaultSnap.data());
        }
      } catch (e) {
        console.warn('compare profile skipped', e);
      }
    };
    loadSelectedCompareProfile();
    return () => { active = false; };
  }, [visible, selectedComparePlayer]);

  const loadPlayerData = async () => {
    setLoading(true);
    setProfile(null);
    setPhotoFailed(false);
    setActiveStatsTab('compare');
    setCompareQuery('');
    setCompareCandidates([]);
    setSelectedComparePlayer(null);
    setSelectedCompareProfile(null);
    try {
      // Extract bref_id from player_id like "pool_2003_roseja01" or use direct bref_id
      const brefId = extractBrefId(player);
      if (brefId) {
        // Vault is the canonical source of truth (Phase 6b complete)
        const vaultSnap = await getDoc(doc(db, 'players', brefId));
        if (vaultSnap.exists()) {
          setProfile(vaultSnap.data());
        }
      }
      if (teamId && leagueId) {
        const teamSnap = await getDoc(doc(db, 'leagues', leagueId, 'teams', teamId));
        if (teamSnap.exists()) {
          const tb = teamSnap.data().tradeBlock || [];
          setOnTradeBlock(tb.includes(player.player_id || player.full_name));
        }
      }
      await loadCompareCandidates();
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const loadCompareCandidates = async () => {
    if (!leagueId) return;
    const candidates: any[] = [];
    try {
      const leagueSnap = await getDoc(doc(db, 'leagues', leagueId));
      const league = leagueSnap.exists() ? leagueSnap.data() as any : {};
      const leagueSport = league.sport || sport || 'nba';
      if (leagueSport !== 'nba') return;
      const eraKey = league.era || era || 'current';
      const teamsSnap = await getDocs(collection(db, 'leagues', leagueId, 'teams'));
      teamsSnap.docs.forEach(teamDoc => {
        const team = teamDoc.data() as any;
        (team.players || []).forEach((candidate: any) => candidates.push({
          ...candidate,
          team: candidate.team || team.abbreviation || team.name || team.id,
        }));
      });
      const poolSnap = await getDoc(doc(db, 'era_player_pools', eraKey));
      if (poolSnap.exists()) candidates.push(...((poolSnap.data() as any).players || []));
    } catch (e) {
      console.warn('compare candidates skipped', e);
    }
    const deduped = dedupePlayers(candidates).filter(candidate => playerKey(candidate) !== playerKey(player));
    setCompareCandidates(deduped);
    setSelectedComparePlayer(deduped[0] || null);
  };

  const [onUntouchable, setOnUntouchable] = useState(false);

  useEffect(() => {
    if (!player || !leagueId || !teamId) return;
    const pid = player.player_id || player.full_name;
    getDoc(doc(db, 'leagues', leagueId, 'teams', teamId)).then(snap => {
      if (snap.exists()) setOnUntouchable((snap.data().untouchables || []).includes(pid));
    });
  }, [player, leagueId, teamId]);

  const handleUntouchable = async () => {
    if (!player || !leagueId || !teamId) return;
    const pid = player.player_id || player.full_name;
    if (onUntouchable) {
      await updateDoc(doc(db, 'leagues', leagueId, 'teams', teamId), { untouchables: arrayRemove(pid) });
      setOnUntouchable(false);
    } else {
      await updateDoc(doc(db, 'leagues', leagueId, 'teams', teamId), { untouchables: arrayUnion(pid) });
      setOnUntouchable(true);
    }
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
  const resolvedProfile: any = playerProfileWithLeagueDateAge(profile, leagueDate)
    || resolveBaselineRatingProfile(player, { era, leagueDate });
  const pos = resolvedProfile?.position || player.position || '?';
  const posLabel = cleanPositionLabel(pos);
  const posColor = POSITION_COLORS[posLabel.split(/[/-]/)[0]?.trim()] || '#888';
  const seasons = resolvedProfile?.seasons || [];
  const profileAccolades = Array.isArray(resolvedProfile?.accolades) ? resolvedProfile.accolades : [];
  const playerAccolades = Array.isArray(player?.accolades) ? player.accolades : [];
  const accolades = [...new Set([...profileAccolades, ...playerAccolades])];
  // Extract bref_id from player_id like "pool_2003_roseja01" or use direct bref_id
  const brefId = extractBrefId(player);
  // Origin line: college if known, else high school (prep-to-pro), else country (overseas)
  const origCollege = resolvedProfile?.college || player.college || '';
  const origHS = resolvedProfile?.high_school || player.high_school || '';
  const origCountry = player.country || resolvedProfile?.country || '';
  const originValue = origCollege || origHS || origCountry;
  const originLabel = origCollege ? 'College' : (origHS ? 'High School' : 'From');

  // Infer sport from embedded stat fields when the prop is missing/nba, so the
  // right photo source and stat line are used even if the caller didn't pass sport.
  const effectiveSport = (sport && sport !== 'nba') ? sport
    : (player.hr != null || player.avg != null || player.era != null || player.saves != null) ? 'mlb'
    : (player.passing_yards != null || player.rushing_yards != null || player.receiving_yards != null || player.sacks != null) ? 'madden'
    : (sport || 'nba');
  const isNBAPlayer = effectiveSport === 'nba';
  const identity = isNBAPlayer ? getVisibleIdentity(player, resolvedProfile) : null;
  const evaluationLayers = isNBAPlayer ? buildEvaluationLayers(player, resolvedProfile) : null;
  const scoutingSections = isNBAPlayer ? getScoutingGradeSections(player, resolvedProfile) : [];
  const potentialSummary = isNBAPlayer ? getPotentialScoutingSummary(player, resolvedProfile) : null;
  const playerGrades = isNBAPlayer ? buildScoutingGrades(player, resolvedProfile) : null;
  const resolvedCompareProfile = selectedCompareProfile || (selectedComparePlayer ? resolveBaselineRatingProfile(selectedComparePlayer, { era, leagueDate }) : null);
  const compareGrades = selectedComparePlayer ? buildScoutingGrades(selectedComparePlayer, resolvedCompareProfile) : null;
  const compareRows = playerGrades && compareGrades ? compareScoutingGrades(playerGrades, compareGrades) : [];
  const filteredCompareCandidates = compareQuery.trim()
    ? compareCandidates.filter(candidate => searchMatches(candidate, compareQuery)).slice(0, 10)
    : compareCandidates.slice(0, 10);
  const franchiseSeasons = buildFranchiseSeasons(player, effectiveSport);

  // Headshot source per sport. MLB derives from the MLB person id; NFL uses a
  // stored photo url (from the roster seed); NBA uses basketball-reference.
  let headshotUri = '';
  if (isNBAPlayer) headshotUri = brefId ? 'https://www.basketball-reference.com/req/202106291/images/headshots/' + brefId + '.jpg' : '';
  else if (effectiveSport === 'mlb') headshotUri = player.player_id ? `https://midfield.mlbstatic.com/v1/people/${player.player_id}/spots/120` : '';
  else headshotUri = player.photo || player.headshot_url || '';

  // Season stat line for MLB/NFL (the pool carries one season of stats).
  const sportStats: { label: string; value: any }[] = [];
  if (effectiveSport === 'mlb') {
    if (player.avg != null && player.avg !== '') sportStats.push({ label: 'AVG', value: player.avg });
    if (player.hr != null) sportStats.push({ label: 'HR', value: player.hr });
    if (player.sb != null) sportStats.push({ label: 'SB', value: player.sb });
    if (player.era != null && player.era !== '') sportStats.push({ label: 'ERA', value: player.era });
    if (player.so != null) sportStats.push({ label: 'SO', value: player.so });
    if (player.saves != null) sportStats.push({ label: 'SV', value: player.saves });
  } else if (effectiveSport === 'madden') {
    if (player.passing_yards) sportStats.push({ label: 'PASS YDS', value: player.passing_yards });
    if (player.passing_tds) sportStats.push({ label: 'PASS TD', value: player.passing_tds });
    if (player.rushing_yards) sportStats.push({ label: 'RUSH YDS', value: player.rushing_yards });
    if (player.receiving_yards) sportStats.push({ label: 'REC YDS', value: player.receiving_yards });
    if (player.sacks) sportStats.push({ label: 'SACKS', value: player.sacks });
  }

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
                  {headshotUri && !photoFailed ? (
                    <Image
                      source={{ uri: headshotUri }}
                      style={styles.photo}
                      resizeMode='cover'
                      onError={() => setPhotoFailed(true)}
                    />
                  ) : (
                    <View style={[styles.photoPlaceholder, { backgroundColor: posColor + '33' }]}>
                      <Text style={[styles.photoInitial, { color: posColor }]}>{name[0]}</Text>
                    </View>
                  )}

                </View>

                <View style={styles.heroInfo}>
                  <Text style={styles.heroName}>{name}</Text>
                  <View style={styles.heroMeta}>
                    <View style={[styles.posBadge, { backgroundColor: posColor + '22', borderColor: posColor }]}>
                      <Text style={[styles.posBadgeText, { color: posColor }]}>{posLabel}</Text>
                    </View>
                    {player.team ? <Text style={styles.heroTeam}>{player.team}</Text> : null}
                  </View>
                  {(resolvedProfile?.height || resolvedProfile?.weight) ? (
                    <Text style={styles.physical}>{[resolvedProfile.height, resolvedProfile.weight ? resolvedProfile.weight + ' lbs' : ''].filter(Boolean).join(' · ')}</Text>
                  ) : null}
                  {resolvedProfile?.birth_date ? (
                    <Text style={styles.birthDate}>Born: {resolvedProfile.birth_date}</Text>
                  ) : null}
                  {resolvedProfile?.age ? (
                    <Text style={styles.birthDate}>Age: {resolvedProfile.age}</Text>
                  ) : null}
                  {originValue ? (
                    <Text style={styles.birthDate}>{originLabel}: {originValue}</Text>
                  ) : null}
                </View>
              </View>

              {isNBAPlayer && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Scouting Grades</Text>
                  {identity && (
                    <View style={styles.identityHeader}>
                      <View style={styles.identityRoleBlock}>
                        <Text style={styles.identityRole}>{identity.primaryRole}</Text>
                        <Text style={styles.identitySubRole}>{identity.secondaryRole}</Text>
                      </View>
                      <View style={styles.reputationPill}>
                        <Text style={styles.reputationText}>{identity.reputation}</Text>
                      </View>
                    </View>
                  )}
                  {evaluationLayers && (
                    <View style={styles.evaluationSummary}>
                      {[
                        { label: 'Overall Talent', value: evaluationLayers.overallTalent },
                        { label: 'Current Form', value: evaluationLayers.currentForm },
                        { label: 'Potential', value: { grade: playerGrades?.potential || evaluationLayers.potential.grade } },
                      ].map(item => {
                        const colors = gradeColors(item.value.grade);
                        return (
                          <View key={item.label} style={[styles.evaluationChip, { borderColor: colors.borderColor, backgroundColor: colors.backgroundColor }]}>
                            <Text style={styles.evaluationLabel}>{item.label}</Text>
                            <Text style={[styles.evaluationGrade, { color: colors.textColor }]}>{item.value.grade}</Text>
                          </View>
                        );
                      })}
                      {potentialSummary ? (
                        <View style={styles.potentialSummary}>
                          <Text style={styles.potentialSummaryLabel}>{potentialSummary.label}</Text>
                          <Text style={styles.potentialSummaryText}>{potentialSummary.description}</Text>
                        </View>
                      ) : null}
                      <View style={styles.evaluationStateRow}>
                        <Text style={styles.evaluationState}>Confidence: {evaluationLayers.confidence.state}</Text>
                        <Text style={styles.evaluationState}>Chemistry: {evaluationLayers.chemistry.state}</Text>
                        <Text style={styles.evaluationState}>Fatigue: {evaluationLayers.fatigue.state}</Text>
                        <Text style={styles.evaluationState}>Health: {evaluationLayers.health.state}</Text>
                      </View>
                    </View>
                  )}
                  {scoutingSections.map(section => (
                    <View key={section.title} style={styles.gradeSection}>
                      <Text style={styles.gradeSectionTitle}>{section.title}</Text>
                      <View style={styles.gradeGrid}>
                        {section.items.map(item => (
                          <View key={item.key} style={[styles.gradeItem, { backgroundColor: item.colors.backgroundColor, borderColor: item.colors.borderColor }]}>
                            <Text style={[styles.gradeValue, { color: item.colors.textColor }]}>{item.grade}</Text>
                            <Text style={styles.gradeLabel}>{item.label}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ))}
                  {identity && (
                    <>
                      <View style={styles.traitRow}>
                        <View style={styles.traitBlock}>
                          <Text style={styles.traitLabel}>Consistency</Text>
                          <Text style={styles.traitValue}>{identity.consistency}</Text>
                        </View>
                        <View style={styles.traitBlock}>
                          <Text style={styles.traitLabel}>Chemistry</Text>
                          <Text style={styles.traitValue}>{identity.chemistry}</Text>
                        </View>
                        <View style={styles.traitBlock}>
                          <Text style={styles.traitLabel}>Development</Text>
                          <Text style={styles.traitValue}>{identity.developmentTrait}</Text>
                        </View>
                      </View>
                      {(identity.strengths.length > 0 || identity.weaknesses.length > 0) && (
                        <View style={styles.identityLists}>
                          {identity.strengths.length > 0 && (
                            <View style={styles.identityList}>
                              <Text style={styles.identityListTitle}>Strengths</Text>
                              <Text style={styles.identityListText}>{identity.strengths.join(' / ')}</Text>
                            </View>
                          )}
                          {identity.weaknesses.length > 0 && (
                            <View style={styles.identityList}>
                              <Text style={styles.identityListTitle}>Weaknesses</Text>
                              <Text style={styles.identityListText}>{identity.weaknesses.join(' / ')}</Text>
                            </View>
                          )}
                        </View>
                      )}
                    </>
                  )}
                  <View style={styles.franchiseStatsBlock}>
                    <Text style={styles.franchiseStatsTitle}>Franchise Mobile Stats</Text>
                    {franchiseSeasons.length > 0 ? (
                      franchiseSeasons.map(season => (
                        <View key={season.year} style={styles.franchiseSeasonRow}>
                          <View style={styles.franchiseSeasonHeader}>
                            <Text style={styles.franchiseSeasonYear}>{season.year}</Text>
                            {season.awards.length > 0 ? (
                              <Text style={styles.franchiseSeasonAwards} numberOfLines={1}>{season.awards.join(' / ')}</Text>
                            ) : null}
                          </View>
                          <View style={styles.franchiseSeasonGrid}>
                            {season.statItems.slice(0, 8).map(stat => (
                              <View key={`${season.year}-${stat.label}`} style={styles.franchiseSeasonStat}>
                                <Text style={styles.franchiseSeasonValue}>{formatStatValue(stat.value)}</Text>
                                <Text style={styles.franchiseSeasonLabel}>{stat.label}</Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.noDataText}>No Franchise Mobile season stats yet.</Text>
                    )}
                  </View>
                </View>
              )}

              {/* Accolades */}
              {accolades.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>🏆 Accolades</Text>
                  <View style={styles.accoladeGrid}>
                    {groupAccolades(accolades).map((a, i) => (
                      <View key={i} style={styles.accoladeChip}>
                        <Text style={styles.accoladeChipIcon}>{a.icon}</Text>
                        <Text style={styles.accoladeChipText}>{a.label}{a.years ? ' ' + a.years : ''}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Season stats for MLB/NFL */}
              {!isNBAPlayer && sportStats.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>📊 Season Stats</Text>
                  <View style={styles.expandedGrid}>
                    {sportStats.map(stat => (
                      <View key={stat.label} style={styles.expandedStatItem}>
                        <Text style={styles.expandedStatValue}>{stat.value ?? '—'}</Text>
                        <Text style={styles.expandedStatLabel}>{stat.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
              {!isNBAPlayer && sportStats.length === 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>📊 Season Stats</Text>
                  <Text style={styles.physical}>No recorded stats — depth/free-agent player.</Text>
                </View>
              )}

              {!isNBAPlayer && franchiseSeasons.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Franchise Seasons</Text>
                  {franchiseSeasons.map(season => (
                    <View key={season.year} style={styles.franchiseSeasonRow}>
                      <View style={styles.franchiseSeasonHeader}>
                        <Text style={styles.franchiseSeasonYear}>{season.year}</Text>
                        {season.awards.length > 0 ? (
                          <Text style={styles.franchiseSeasonAwards} numberOfLines={1}>{season.awards.join(' / ')}</Text>
                        ) : null}
                      </View>
                      <View style={styles.franchiseSeasonGrid}>
                        {season.statItems.slice(0, 8).map(stat => (
                          <View key={`${season.year}-${stat.label}`} style={styles.franchiseSeasonStat}>
                            <Text style={styles.franchiseSeasonValue}>{stat.value ?? '—'}</Text>
                            <Text style={styles.franchiseSeasonLabel}>{stat.label}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {isNBAPlayer && (
                <View style={styles.section}>
                  <View style={styles.tabRow}>
                    <TouchableOpacity
                      style={[styles.tabBtn, activeStatsTab === 'compare' && styles.tabBtnActive]}
                      onPress={() => setActiveStatsTab('compare')}
                    >
                      <Text style={[styles.tabBtnText, activeStatsTab === 'compare' && styles.tabBtnTextActive]}>Compare</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.tabBtn, activeStatsTab === 'original' && styles.tabBtnActive]}
                      onPress={() => setActiveStatsTab('original')}
                    >
                      <Text style={[styles.tabBtnText, activeStatsTab === 'original' && styles.tabBtnTextActive]}>Original NBA Stats</Text>
                    </TouchableOpacity>
                  </View>

                  {activeStatsTab === 'compare' && (
                    <View>
                      <TextInput
                        value={compareQuery}
                        onChangeText={setCompareQuery}
                        placeholder='Search any NBA player'
                        placeholderTextColor='#666'
                        autoCapitalize='none'
                        style={styles.compareSearch}
                      />
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.compareScroller}>
                        {filteredCompareCandidates.map(candidate => {
                          const active = playerKey(candidate) === playerKey(selectedComparePlayer);
                          return (
                            <TouchableOpacity
                              key={playerKey(candidate)}
                              style={[styles.compareChip, active && styles.compareChipActive]}
                              onPress={() => setSelectedComparePlayer(candidate)}
                            >
                              <Text style={[styles.compareChipName, active && styles.compareChipNameActive]} numberOfLines={1}>{playerName(candidate)}</Text>
                              <Text style={styles.compareChipTeam}>{playerTeam(candidate) || candidate.position || 'NBA'}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                      {selectedComparePlayer ? (
                        <>
                          <View style={styles.compareHeader}>
                            <View style={styles.compareHeaderSide}>
                              <Text style={styles.compareHeaderName} numberOfLines={1}>{name}</Text>
                              <Text style={styles.compareHeaderMeta}>{playerTeam(player) || player.position || 'Player'}</Text>
                            </View>
                            <Text style={styles.compareVs}>VS</Text>
                            <View style={styles.compareHeaderSide}>
                              <Text style={styles.compareHeaderName} numberOfLines={1}>{playerName(selectedComparePlayer)}</Text>
                              <Text style={styles.compareHeaderMeta}>{playerTeam(selectedComparePlayer) || selectedComparePlayer.position || 'Player'}</Text>
                            </View>
                          </View>
                          <View style={styles.compareRows}>
                            {compareRows.map(row => {
                              const model = getCompareRowModel({
                                leftName: name,
                                rightName: playerName(selectedComparePlayer),
                                row,
                              });
                              const leftColors = gradeColors(model.left.grade);
                              const rightColors = gradeColors(model.right.grade);
                              return (
                                <View key={row.key} style={styles.compareRow} accessibilityLabel={model.accessibilityLabel}>
                                  <View style={styles.compareSide}>
                                    <Text style={[styles.compareSmallName, model.winner === 'left' && styles.compareWinnerText]} numberOfLines={1}>{model.left.name}</Text>
                                    <View style={[styles.compareGradeBadge, { backgroundColor: leftColors.backgroundColor, borderColor: model.winner === 'left' ? leftColors.borderColor : '#333' }]}>
                                      <Text style={[styles.compareGradeText, { color: leftColors.textColor }]}>{model.left.grade}</Text>
                                    </View>
                                  </View>
                                  <Text style={styles.compareAbilityLabel}>{model.centerLabel}</Text>
                                  <View style={[styles.compareSide, styles.compareSideRight]}>
                                    <View style={[styles.compareGradeBadge, { backgroundColor: rightColors.backgroundColor, borderColor: model.winner === 'right' ? rightColors.borderColor : '#333' }]}>
                                      <Text style={[styles.compareGradeText, { color: rightColors.textColor }]}>{model.right.grade}</Text>
                                    </View>
                                    <Text style={[styles.compareSmallName, model.winner === 'right' && styles.compareWinnerText]} numberOfLines={1}>{model.right.name}</Text>
                                  </View>
                                </View>
                              );
                            })}
                          </View>
                        </>
                      ) : (
                        <Text style={styles.noDataText}>No compare players found yet.</Text>
                      )}
                    </View>
                  )}

                  {activeStatsTab === 'original' && (
                    <View>
                      {seasons.length > 0 ? (
                        <>
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
                              <Text style={styles.statsCell}>{s.ppg || '-'}</Text>
                              <Text style={styles.statsCell}>{s.rpg || '-'}</Text>
                              <Text style={styles.statsCell}>{s.apg || '-'}</Text>
                              <Text style={styles.statsCell}>{s.spg || '-'}</Text>
                              <Text style={styles.statsCell}>{s.bpg || '-'}</Text>
                              <Text style={styles.statsCell}>{s.fg_pct ? (parseFloat(s.fg_pct) * 100).toFixed(0) + '%' : '-'}</Text>
                            </TouchableOpacity>
                          ))}
                          {expandedSeason && (() => {
                            const s = seasons.find((season: any) => season.year === expandedSeason);
                            if (!s) return null;
                            return (
                              <View style={styles.expandedStats}>
                                <Text style={styles.expandedTitle}>{s.year} - {s.team}</Text>
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
                                      <Text style={styles.expandedStatValue}>{stat.value || '-'}</Text>
                                      <Text style={styles.expandedStatLabel}>{stat.label}</Text>
                                    </View>
                                  ))}
                                </View>
                              </View>
                            );
                          })()}
                        </>
                      ) : (
                        <Text style={styles.noDataText}>Original NBA stats are not available for this player yet.</Text>
                      )}
                    </View>
                  )}
                </View>
              )}

              {isNBAPlayer && !profile && (
                <View style={styles.noData}>
                  <Text style={styles.noDataText}>Career data loading... Check back soon.</Text>
                </View>
              )}

              {/* Action Buttons based on context */}
              {isOwned === true && (
                <View style={styles.actionBtns}>
                  <TouchableOpacity style={[styles.actionBtn, onTradeBlock && styles.actionBtnActive]} onPress={handleTradeBlock}>
                    <Text style={styles.actionBtnIcon}>🔄</Text>
                    <Text style={[styles.actionBtnText, onTradeBlock && styles.actionBtnTextActive]}>{onTradeBlock ? '✓ On Trade Block' : 'Add to Trade Block'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={handleUntouchable}>
                    <Text style={styles.actionBtnIcon}>🔒</Text>
                    <Text style={styles.actionBtnText}>{onUntouchable ? 'Remove Untouchable' : 'Untouchable'}</Text>
                  </TouchableOpacity>
                  {onDrop && (
                    <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={onDrop}>
                      <Text style={styles.actionBtnIcon}>❌</Text>
                      <Text style={[styles.actionBtnText, { color: '#ff4444' }]}>Drop Player</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
              {isOwned === false && (
                <View style={styles.actionBtns}>
                  <TouchableOpacity style={styles.actionBtn} onPress={onAddToTargetList}>
                    <Text style={styles.actionBtnIcon}>🎯</Text>
                    <Text style={styles.actionBtnText}>Add to Target List</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, styles.actionBtnTrade]} onPress={onOfferTrade}>
                    <Text style={styles.actionBtnIcon}>🤝</Text>
                    <Text style={[styles.actionBtnText, { color: '#F5A623' }]}>Offer Trade</Text>
                  </TouchableOpacity>
                </View>
              )}
              {isOwned === undefined && (
                <View style={styles.actionBtns}>
                  {onSign && (
                    <TouchableOpacity style={[styles.actionBtn, styles.actionBtnSign]} onPress={onSign}>
                      <Text style={styles.actionBtnIcon}>✍️</Text>
                      <Text style={[styles.actionBtnText, { color: '#00ff87' }]}>Sign Player</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
              {(onEditCustom || onDeleteCustom) && (
                <View style={[styles.actionBtns, { marginTop: 8 }]}>
                  {onEditCustom && (
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#0a1a2a', borderColor: '#3B82F6' }]} onPress={onEditCustom}>
                      <Text style={styles.actionBtnIcon}>✎</Text>
                      <Text style={[styles.actionBtnText, { color: '#3B82F6' }]}>Edit Player</Text>
                    </TouchableOpacity>
                  )}
                  {onDeleteCustom && (
                    <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={onDeleteCustom}>
                      <Text style={styles.actionBtnIcon}>🗑</Text>
                      <Text style={[styles.actionBtnText, { color: '#ff4444' }]}>Delete Player</Text>
                    </TouchableOpacity>
                  )}
                </View>
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
  accoladeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  accoladeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#1a1a2a', borderRadius: 8, paddingVertical: 5, paddingHorizontal: 8, borderWidth: 1, borderColor: '#333366' },
  accoladeChipIcon: { fontSize: 11 },
  accoladeChipText: { color: '#ffffff', fontSize: 11, fontWeight: '500', flexShrink: 1 },
  accoladeIcon: { fontSize: 16, marginTop: 1 },
  accoladeText: { flex: 1, color: '#cccccc', fontSize: 13, lineHeight: 20 },
  identityHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
  identityRoleBlock: { flex: 1 },
  identityRole: { color: '#ffffff', fontSize: 16, fontWeight: '900' },
  identitySubRole: { color: '#777', fontSize: 12, fontWeight: '700', marginTop: 2 },
  reputationPill: { borderRadius: 999, borderWidth: 1, borderColor: '#00ff8755', backgroundColor: '#0a2a1a', paddingHorizontal: 10, paddingVertical: 5 },
  reputationText: { color: '#00ff87', fontSize: 11, fontWeight: '900' },
  evaluationSummary: { gap: 8, marginBottom: 14 },
  evaluationChip: { borderRadius: 8, borderWidth: 1, padding: 10 },
  evaluationLabel: { color: '#9a9a9a', fontSize: 10, fontWeight: '900', textTransform: 'uppercase', marginBottom: 3 },
  evaluationGrade: { fontSize: 16, fontWeight: '900' },
  evaluationTier: { color: '#ffffff', fontSize: 11, fontWeight: '900' },
  potentialSummary: { borderWidth: 1, borderColor: '#242424', backgroundColor: '#0b0b0b', borderRadius: 8, padding: 10 },
  potentialSummaryLabel: { color: '#fff', fontSize: 13, fontWeight: '900' },
  potentialSummaryText: { color: '#aaa', fontSize: 11, fontWeight: '700', lineHeight: 16, marginTop: 4 },
  evaluationStateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  evaluationState: { color: '#cfcfcf', fontSize: 10, fontWeight: '800', backgroundColor: '#171717', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: '#262626' },
  gradeSection: { marginBottom: 14 },
  gradeSectionTitle: { color: '#888', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', marginBottom: 8 },
  gradeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gradeItem: { width: '30%', minHeight: 64, backgroundColor: '#181818', borderRadius: 8, borderWidth: 1, borderColor: '#252525', padding: 8, alignItems: 'center', justifyContent: 'center' },
  gradeValue: { color: '#ffffff', fontSize: 16, fontWeight: '900' },
  gradeLabel: { color: '#d0d0d0', fontSize: 9, fontWeight: '800', marginTop: 4, textAlign: 'center' },
  traitRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  traitBlock: { flex: 1, backgroundColor: '#101820', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: '#1c2a35' },
  traitLabel: { color: '#667', fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  traitValue: { color: '#ffffff', fontSize: 12, fontWeight: '800', marginTop: 4 },
  identityLists: { gap: 8, marginTop: 10 },
  identityList: { backgroundColor: '#151515', borderRadius: 8, padding: 10 },
  identityListTitle: { color: '#888', fontSize: 10, fontWeight: '900', marginBottom: 4, textTransform: 'uppercase' },
  identityListText: { color: '#cccccc', fontSize: 12, fontWeight: '600' },
  franchiseStatsBlock: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#242424' },
  franchiseStatsTitle: { color: '#ffffff', fontSize: 13, fontWeight: '900', marginBottom: 10 },
  tabRow: { flexDirection: 'row', backgroundColor: '#080808', borderRadius: 8, borderWidth: 1, borderColor: '#252525', padding: 4, marginBottom: 14 },
  tabBtn: { flex: 1, minHeight: 40, borderRadius: 6, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  tabBtnActive: { backgroundColor: '#0a2a1a', borderWidth: 1, borderColor: '#00ff87' },
  tabBtnText: { color: '#777', fontSize: 12, fontWeight: '900', textAlign: 'center' },
  tabBtnTextActive: { color: '#00ff87' },
  compareSearch: { minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: '#252525', backgroundColor: '#0a0a0a', color: '#ffffff', paddingHorizontal: 12, fontSize: 13, fontWeight: '700', marginBottom: 10 },
  compareScroller: { marginBottom: 12 },
  compareChip: { width: 120, minHeight: 54, borderRadius: 8, borderWidth: 1, borderColor: '#252525', backgroundColor: '#151515', padding: 9, marginRight: 8, justifyContent: 'center' },
  compareChipActive: { borderColor: '#00ff87', backgroundColor: '#071f14' },
  compareChipName: { color: '#eeeeee', fontSize: 12, fontWeight: '900' },
  compareChipNameActive: { color: '#00ff87' },
  compareChipTeam: { color: '#777', fontSize: 10, fontWeight: '800', marginTop: 3 },
  compareHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#0b0b0b', borderRadius: 8, borderWidth: 1, borderColor: '#222', padding: 10, marginBottom: 10 },
  compareHeaderSide: { flex: 1, alignItems: 'center' },
  compareHeaderName: { color: '#ffffff', fontSize: 13, fontWeight: '900' },
  compareHeaderMeta: { color: '#777', fontSize: 10, fontWeight: '800', marginTop: 2 },
  compareVs: { color: '#00ff87', fontSize: 11, fontWeight: '900' },
  compareRows: { gap: 7 },
  compareRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', backgroundColor: '#101010', borderRadius: 8, borderWidth: 1, borderColor: '#222', padding: 8, gap: 8 },
  compareSide: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  compareSideRight: { justifyContent: 'flex-end' },
  compareSmallName: { color: '#8a8a8a', fontSize: 9, fontWeight: '900', maxWidth: 78 },
  compareWinnerText: { color: '#ffffff' },
  compareGradeBadge: { minWidth: 42, height: 30, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  compareGradeText: { fontSize: 13, fontWeight: '900' },
  compareAbilityLabel: { width: 88, color: '#ffffff', fontSize: 11, fontWeight: '900', textAlign: 'center' },
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
  franchiseSeasonRow: { backgroundColor: '#151515', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#242424', marginBottom: 10 },
  franchiseSeasonHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  franchiseSeasonYear: { color: '#00ff87', fontSize: 13, fontWeight: '900' },
  franchiseSeasonAwards: { flex: 1, color: '#d7b56d', fontSize: 11, fontWeight: '800' },
  franchiseSeasonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  franchiseSeasonStat: { minWidth: 58, flex: 1, backgroundColor: '#0a0a0a', borderRadius: 8, padding: 7, alignItems: 'center' },
  franchiseSeasonValue: { color: '#ffffff', fontSize: 13, fontWeight: '900' },
  franchiseSeasonLabel: { color: '#666', fontSize: 9, fontWeight: '800', marginTop: 2 },
  noData: { alignItems: 'center', padding: 40 },
  noDataText: { color: '#444', fontSize: 13, textAlign: 'center' },
  actionBtns: { paddingHorizontal: 20, paddingBottom: 30, gap: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#2a2a2a' },
  actionBtnActive: { borderColor: '#00ff87', backgroundColor: '#0a2a1a' },
  actionBtnDanger: { borderColor: '#ff444433' },
  actionBtnTrade: { borderColor: '#F5A62333' },
  actionBtnSign: { borderColor: '#00ff8733', backgroundColor: '#0a1a0a' },
  actionBtnIcon: { fontSize: 20 },
  actionBtnText: { color: '#cccccc', fontSize: 14, fontWeight: '600' },
  actionBtnTextActive: { color: '#00ff87' },
  tradeBtn: { marginHorizontal: 16, marginTop: 8, backgroundColor: '#1a1a2a', borderRadius: 14, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: '#4444ff' },
  tradeBtnActive: { backgroundColor: '#2a1a0a', borderColor: '#ff9900' },
  tradeBtnText: { color: '#8888ff', fontSize: 15, fontWeight: '700' },
  tradeBtnTextActive: { color: '#ff9900' },
});
