import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/constants/firebase';
import { getTeamColors, getTeamLogoUrl, getTeamLogoLocal } from '@/constants/teamColors';
import { getSportTeams, getSportTeamTheme, getSportLogoUrl } from '@/constants/sportTeams';
import SportTeamLogo from '@/components/SportTeamLogo';
import { compareRosterPlayersByValue } from '@/domain/nba/rotation';
import { displayScheduleTeamLabel } from '@/domain/nba/scheduleView';

// Adjust hex color brightness by percentage. Negative = darker, positive = lighter.
function adjustColor(hex: string, percent: number): string {
  const clean = hex.replace('#', '');
  let r = parseInt(clean.substring(0, 2), 16);
  let g = parseInt(clean.substring(2, 4), 16);
  let b = parseInt(clean.substring(4, 6), 16);
  const amt = Math.floor(255 * (percent / 100));
  r = Math.max(0, Math.min(255, r + amt));
  g = Math.max(0, Math.min(255, g + amt));
  b = Math.max(0, Math.min(255, b + amt));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

export default function LeagueRostersScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [era, setEra] = useState<any>(undefined);
  const [sport, setSport] = useState<string>('nba');

  useEffect(() => {
    if (!leagueId) return;
    (async () => {
      try {
        const leagueSnap = await getDoc(doc(db, 'leagues', leagueId));
        const ld = leagueSnap.exists() ? (leagueSnap.data() as any) : {};
        const eraKey = ld.era || 'current';
        const sportVal = ld.sport || 'nba';
        const isNBA = sportVal === 'nba';
        const poolKey = isNBA ? eraKey : sportVal;
        setEra(eraKey);
        setSport(sportVal);

        // Player pool for default rosters + the league's claimed team docs.
        // NBA teams come from era_rosters; MLB/NFL from the static sport team list.
        const [poolSnap, leagueTeamsSnap] = await Promise.all([
          getDoc(doc(db, 'era_player_pools', poolKey)),
          getDocs(collection(db, 'leagues', leagueId, 'teams')),
        ]);
        const poolPlayers = poolSnap.exists() ? ((poolSnap.data() as any).players || []) : [];
        let eraTeams: any[];
        if (isNBA) {
          const eraTeamsSnap = await getDocs(collection(db, 'era_rosters', eraKey, 'teams'));
          eraTeams = eraTeamsSnap.docs.map(d => d.data() as any);
        } else {
          eraTeams = Object.values(getSportTeams(sportVal) || {}).map((t: any) => ({
            id: t.abbr, abbreviation: t.abbr, full_name: `${t.city} ${t.name}`,
          }));
        }
        const leagueTeams = leagueTeamsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

        // Resolve owner display names (team docs only store gmId, not a name)
        const ownerIds = Array.from(new Set(leagueTeams.map((t: any) => t.gmId).filter(Boolean)));
        const ownerNames: Record<string, string> = {};
        await Promise.all(ownerIds.map(async (uid: string) => {
          try {
            const u = await getDoc(doc(db, 'users', uid));
            const ud = u.data() as any;
            if (ud) ownerNames[uid] = ud.displayName || (ud.username ? '@' + ud.username : 'GM');
          } catch {}
        }));

        // Index claimed teams by era team id and abbreviation
        const byEraId: Record<string, any> = {};
        const byAbbr: Record<string, any> = {};
        leagueTeams.forEach(t => {
          if (t.teamId != null) byEraId[String(t.teamId)] = t;
          if (t.abbreviation) byAbbr[t.abbreviation] = t;
        });

        // Merge: every era team appears; claimed ones use their live doc, the rest
        // show as vacant CPU teams with their default roster.
        const merged = eraTeams.map((et: any) => {
          const claimed = byEraId[String(et.id)] || byAbbr[et.abbreviation];
          if (claimed) {
            return {
              ...claimed,
              eraTeamId: et.id,
              abbreviation: claimed.abbreviation || et.abbreviation,
              name: claimed.name || et.full_name,
              gmName: claimed.gmId ? (ownerNames[claimed.gmId] || 'GM') : null,
              isCpu: !claimed.gmId,
            };
          }
          const defPlayers = poolPlayers.filter((p: any) => p.team === et.abbreviation);
          return {
            id: null,
            eraTeamId: et.id,
            abbreviation: et.abbreviation,
            name: et.full_name,
            players: defPlayers.length ? defPlayers : (et.players || []),
            gmId: null,
            isCpu: true,
            vacant: true,
          };
        });

        const myUid = auth.currentUser?.uid;
        merged.sort((a, b) => {
          const aIsMine = a.gmId === myUid;
          const bIsMine = b.gmId === myUid;
          if (aIsMine && !bIsMine) return -1;
          if (!aIsMine && bIsMine) return 1;
          const aOwned = !!a.gmId;
          const bOwned = !!b.gmId;
          if (aOwned && !bOwned) return -1;
          if (!aOwned && bOwned) return 1;
          return (a.name || '').localeCompare(b.name || '');
        });
        setTeams(merged);
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [leagueId]);

  if (loading) {
    return <View style={styles.loadingContainer}><ActivityIndicator color="#00ff87" /></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.inner}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>League Rosters</Text>
        <View style={{ width: 60 }} />
      </View>

      <Text style={styles.subtitle}>{teams.length} teams · tap to view roster</Text>

      {teams.map(team => {
        const abbr = team.abbreviation || 'ATL';
        const isNBASport = sport === 'nba';
        const sportTheme = isNBASport ? null : getSportTeamTheme(sport, abbr);
        const colors = isNBASport ? getTeamColors(abbr, era) : [sportTheme?.tintColor || '#1a1a1a'];
        const logoLocal = isNBASport ? getTeamLogoLocal(abbr, era) : null;
        const logoUri = isNBASport ? getTeamLogoUrl(abbr, era) : '';
        const isOwned = !!team.gmId;
        // Luminance check for text contrast on bold solid team-color background
        const hex = (colors[0] || '#222').replace('#', '');
        const r = parseInt(hex.substring(0,2), 16) / 255;
        const g = parseInt(hex.substring(2,4), 16) / 255;
        const b = parseInt(hex.substring(4,6), 16) / 255;
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const textColor = lum < 0.5 ? '#ffffff' : '#0a0a0a';
        const subColor = lum < 0.5 ? '#ffffffcc' : '#0a0a0acc';
        const topPlayers = [...(team.players || [])].sort(compareRosterPlayersByValue).slice(0, 3);
        return (
          <TouchableOpacity
            key={team.id || team.eraTeamId || team.abbreviation}
            style={[styles.teamCardWrapper, { shadowColor: colors[0] }]}
            onPress={() => router.push({ pathname: '/screens/team-roster', params: {
              leagueId,
              teamId: team.id || ('cpu_' + team.eraTeamId),
              eraTeamId: String(team.eraTeamId || ''),
              abbr: team.abbreviation || '',
              isCpu: team.isCpu ? '1' : '',
            } })}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={[adjustColor(colors[0], 12), colors[0], adjustColor(colors[0], -18)]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={[styles.teamCard, { borderColor: adjustColor(colors[0], -25) }]}
            >
              <LinearGradient
                colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 0.6 }}
                style={styles.glossOverlay}
                pointerEvents="none"
              />
              <SportTeamLogo sport={sport} abbr={abbr} era={era} style={styles.teamLogo} textColor={textColor} fontSize={15} />
              <View style={styles.teamInfo}>
                <View style={styles.teamNameRow}>
                  <Text style={[styles.teamName, { color: textColor }]}>{displayScheduleTeamLabel(team.name || team.abbreviation, team.teamId || team.id)}</Text>
                  {team.gmId === auth.currentUser?.uid ? (
                    <View style={styles.yourTeamBadge}><Text style={styles.yourTeamBadgeText}>YOUR TEAM</Text></View>
                  ) : null}
                </View>
                <Text style={[styles.teamMeta, { color: subColor }]}>
                  {team.wins || 0}–{team.losses || 0} · {isOwned ? (team.gmName || 'GM') : 'Unowned'}
                </Text>
                <Text style={[styles.rosterCount, { color: subColor }]}>{(team.players || []).length} players</Text>
                {topPlayers.length > 0 ? (
                  <View style={styles.playerPreview}>
                    {topPlayers.map((player: any) => (
                      <View key={player.player_id || player.id || player.full_name || player.name} style={styles.playerPreviewRow}>
                        <Text style={[styles.playerPreviewPos, { color: textColor }]}>{player.position || '-'}</Text>
                        <Text style={[styles.playerPreviewName, { color: subColor }]} numberOfLines={1}>{player.full_name || player.name || 'Player'}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
              <Text style={[styles.chevron, { color: textColor }]}>›</Text>
            </LinearGradient>
          </TouchableOpacity>
        );
      })}

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  loadingContainer: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' },
  inner: { padding: 20, paddingTop: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  backText: { color: '#00ff87', fontSize: 15, fontWeight: '600' },
  title: { color: '#fff', fontSize: 20, fontWeight: '800' },
  subtitle: { color: '#666', fontSize: 12, marginBottom: 16 },
  teamCardWrapper: {
    marginBottom: 12,
    borderRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
  },
  teamCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  glossOverlay: { position: 'absolute', top: 0, left: 0, right: 0, height: '60%', borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  teamLogo: { width: 40, height: 40, marginRight: 12 },
  abbrBadge: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 8 },
  abbrBadgeText: { fontWeight: '900', fontSize: 15 },
  teamInfo: { flex: 1 },
  teamName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  teamNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  yourTeamBadge: { backgroundColor: '#0a2a1a', borderWidth: 1, borderColor: '#00ff87', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  yourTeamBadgeText: { color: '#00ff87', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  teamMeta: { color: '#ccc', fontSize: 12, marginTop: 2 },
  rosterCount: { color: '#888', fontSize: 11, marginTop: 1 },
  playerPreview: { marginTop: 8, gap: 4 },
  playerPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  playerPreviewPos: { width: 24, fontSize: 10, fontWeight: '900', opacity: 0.9 },
  playerPreviewName: { flex: 1, fontSize: 11, fontWeight: '800' },
  chevron: { color: '#666', fontSize: 22, fontWeight: '400' },
});
