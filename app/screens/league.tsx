import { router, useLocalSearchParams } from 'expo-router';
import { arrayRemove, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useState, useRef } from 'react';
import { ActivityIndicator, Alert, Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db, functions } from '@/constants/firebase';
import { goToTeamSelect } from '@/utils/teamSelectNav';
import { getTeamColors, getTeamTheme } from '@/constants/teamColors';
import { getSportTeamTheme } from '@/constants/sportTeams';
import SportTeamLogo from '@/components/SportTeamLogo';
import GlobalNav from '@/components/GlobalNav';
import LeagueAvatar from '@/components/LeagueAvatar';
import { setLastLeagueId } from '@/utils/lastLeague';
import { isDeletedLeagueAlertSuppressed } from '@/utils/deletedLeagueAlert';
import { playerJerseyDisplay } from '@/domain/sports/playerDisplay';
import { compareSportRosterPlayersByValue } from '@/domain/sports/rosterValue';
import { displayScheduleAbbr, displayScheduleTeamLabel } from '@/domain/nba/scheduleView';
import { canUsePitchSensitiveControls, isPitchDemoLocked, isPitchDemoViewer } from '@/utils/pitchAccess';



const SPORT_KEY: Record<string, string> = {
  nba: 'nba',
  madden: 'nfl',
  mlb: 'mlb',
};

const NBA_ERA_LABELS: Record<string, string> = {
  magic_bird: 'Magic vs Bird', jordan: 'Jordan', kobe: 'Kobe',
  lebron: 'LeBron', steph: 'Steph', current: 'Modern',
};

const CHANNEL_LABEL: Record<string, string> = {
  nba: 'Inside The NBA',
  madden: 'Inside the NFL',
  mlb: 'Inside MLB',
};

const CHANNEL_ICON: Record<string, string> = {
  nba: '🏀',
  madden: '🏈',
  mlb: '⚾',
};

function sportDisplayLabel(sport?: string | null) {
  if (sport === 'madden' || sport === 'nfl') return 'NFL';
  if (sport === 'mlb') return 'MLB';
  if (sport === 'nba') return 'NBA';
  return 'Franchise';
}

function modeDisplayLabel(mode?: string | null) {
  if (mode === 'draft') return 'Fantasy Draft';
  if (mode === 'current') return 'Current Rosters';
  if (mode === 'random') return 'Random Teams';
  return mode ? mode.charAt(0).toUpperCase() + mode.slice(1) : 'Current Rosters';
}

function leagueSetupLabel(league: any) {
  if (league?.sport === 'nba' && league?.era) {
    return `${NBA_ERA_LABELS[league.era] || league.era} Era · ${modeDisplayLabel(league.mode)}`;
  }
  return modeDisplayLabel(league?.mode);
}

function offseasonStartStageForSport(leagueSport: string) {
  return leagueSport === 'madden' || leagueSport === 'mlb' ? 'season_end' : 'awards_recap';
}

export default function LeagueScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const [league, setLeague] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [myTeam, setMyTeam] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const user = auth.currentUser;
  const isCommissioner = league?.commissionerId === user?.uid || (league?.coCommissioners || []).includes(user?.uid || '');
  const pitchViewer = isPitchDemoViewer(profile);
  const pitchLocked = isPitchDemoLocked(league);
  const pitchSensitiveControlsAllowed = canUsePitchSensitiveControls({ profile, league, uid: user?.uid });
  const currentYear = league?.currentYear || 2024;
  const leagueSport = league?.sport || 'nba';
  const rawTeamAbbr = myTeam?.abbreviation || myTeam?.teamId || '';
  const myTeamAbbr = displayScheduleAbbr(rawTeamAbbr);
  const myTeamName = displayScheduleTeamLabel(myTeam?.name || myTeamAbbr, rawTeamAbbr || myTeam?.id, leagueSport);
  const teamAbbr = myTeamAbbr;
  const isNBASport = leagueSport === 'nba';
  const teamColors = isNBASport
    ? getTeamColors(teamAbbr || 'ATL', currentYear)
    : [getSportTeamTheme(leagueSport, teamAbbr).tintColor, getSportTeamTheme(leagueSport, teamAbbr).titleColor];
  const teamPrimary = teamColors[0] || '#1a1a1a';
  const scrollY = useRef(new Animated.Value(0)).current;
  const stickyOpacity = scrollY.interpolate({
    inputRange: [100, 180],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const hexToLum = (hex: string) => {
    if (!hex || typeof hex !== 'string' || !hex.startsWith('#') || hex.length < 7) return 0.5;
    const r = parseInt(hex.slice(1,3), 16) / 255;
    const g = parseInt(hex.slice(3,5), 16) / 255;
    const b = parseInt(hex.slice(5,7), 16) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  // Per-team theme overrides (button labels, borders, tints)
  const teamTheme = isNBASport
    ? getTeamTheme(teamAbbr, league?.era)
    : getSportTeamTheme(leagueSport, teamAbbr);
  const titleColor = teamTheme.titleColor;
  const tintColor = teamTheme.tintColor;
  const teamText = hexToLum(teamPrimary) < 0.35 ? '#ffffff' : teamPrimary;
  const myTeamPlayersByValue = [...(myTeam?.players || [])].sort(compareSportRosterPlayersByValue(leagueSport));

  useEffect(() => {
    if (!leagueId) return;
    setLastLeagueId(leagueId);

    const loadLeague = async () => {
      const leagueSnap = await getDoc(doc(db, 'leagues', leagueId));
      if (!leagueSnap.exists()) {
        Alert.alert('Not found', 'This league no longer exists.');
        router.replace('/(tabs)/dashboard');
        return;
      }
      const leagueData: any = { id: leagueSnap.id, ...leagueSnap.data() };
      setLeague(leagueData);

      if (user?.uid) {
        try {
          const profileSnap = await getDoc(doc(db, 'users', user.uid));
          setProfile(profileSnap.exists() ? profileSnap.data() : null);
        } catch {
          setProfile(null);
        }
      }

      const memberProfiles = await Promise.all(
        (leagueData.members || []).map(async (uid: string) => {
          const snap = await getDoc(doc(db, 'users', uid));
          return snap.exists() ? { uid, ...snap.data() } : { uid, displayName: 'Unknown GM' };
        })
      );
      setMembers(memberProfiles);

      const teamsSnap = await getDocs(collection(db, 'leagues', leagueId, 'teams'));
      const myT = teamsSnap.docs.find(d => d.data().gmId === user?.uid);
      if (myT) setMyTeam({ id: myT.id, ...myT.data() });

      setLoading(false);
    };

    loadLeague();

    // If the league is deleted while we're viewing it, return to the main menu.
    const unsubLeague = onSnapshot(doc(db, 'leagues', leagueId), (snap) => {
      if (!snap.exists()) {
        if (!isDeletedLeagueAlertSuppressed(leagueId)) {
          Alert.alert('League deleted', 'This league has been deleted by the commissioner.');
        }
        router.replace('/(tabs)/dashboard');
      }
    }, err => { if (err.code !== 'permission-denied') console.error(err); });

    return () => { unsubLeague(); };
  }, [leagueId, user?.uid]);

  const handleLeaveLeague = async () => {
    if (!user) return;
    Alert.alert('Leave League', 'You will lose your team and roster. Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            // Delete user's team in this league
            const teamId = leagueId + '_' + user.uid;
            let abbreviation = '';
            try {
              const teamSnap = await getDoc(doc(db, 'leagues', leagueId, 'teams', teamId));
              if (teamSnap.exists()) {
                abbreviation = teamSnap.data()?.abbreviation || '';
                await deleteDoc(doc(db, 'leagues', leagueId, 'teams', teamId));
              }
            } catch {}
            // Free up the team in takenTeams
            if (abbreviation || myTeam?.teamId) {
              try {
                await updateDoc(doc(db, 'leagues', leagueId), {
                  takenTeams: arrayRemove(myTeam?.teamId || abbreviation),
                });
              } catch {}
            }
            // Remove from members + user's leagues
            await updateDoc(doc(db, 'leagues', leagueId), { members: arrayRemove(user.uid) });
            await updateDoc(doc(db, 'users', user.uid), { leagues: arrayRemove(leagueId) });
            // Purge any leftover invite/request docs so they don't resurface
            try { await deleteDoc(doc(db, 'leagues', leagueId, 'sent_invites', user.uid)); } catch {}
            try {
              const reqs = await getDocs(query(
                collection(db, 'leagues', leagueId, 'join_requests'),
                where('uid', '==', user.uid)
              ));
              await Promise.all(reqs.docs.map(d => deleteDoc(d.ref)));
            } catch {}
            router.replace('/(tabs)/dashboard');
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  };

  const goToChannels = () => {
    router.push({
      pathname: '/screens/channels',
      params: {
        leagueId,
        leagueName: league.name,
        sport: league.sport,
        commissionerId: league.commissionerId,
        coCommissioners: JSON.stringify(league.coCommissioners || []),
      },
    });
  };

  const openOffseasonManagement = () => {
    if (!isCommissioner || league?.offseason) {
      router.push({ pathname: '/screens/offseason', params: { leagueId } });
      return;
    }
    const startStage = offseasonStartStageForSport(leagueSport);
    Alert.alert(
      'Start offseason?',
      isNBASport
        ? 'Once offseason starts, each stage lasts 10 minutes, league pages move forward, and there is no going back.'
        : 'This will open the offseason flow for re-signing, free agency, draft review, draft room, and roster cuts.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start Offseason',
          style: 'destructive',
          onPress: async () => {
            try {
              const advance = httpsCallable(functions, 'advanceOffseasonStage');
              await advance({
                leagueId,
                expectedStage: startStage,
                expectedVersion: 0,
              });
              router.push({ pathname: '/screens/offseason', params: { leagueId } });
            } catch (error: any) {
              Alert.alert('Unable to start offseason', error.message || 'Please try again.');
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00ff87" />
      </View>
    );
  }



  const channelLabel = CHANNEL_LABEL[league.sport] || 'Channels';
  const channelIcon = CHANNEL_ICON[league.sport] || '💬';

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Animated.View
        pointerEvents='box-none'
        style={[styles.stickyHeader, { opacity: stickyOpacity, backgroundColor: teamAbbr ? teamPrimary : '#0a0a0a', borderBottomColor: teamAbbr ? teamPrimary : '#1a1a1a' }]}
      >
        <TouchableOpacity onPress={() => router.replace('/(tabs)/dashboard')} style={{ paddingHorizontal: 12 }}>
          <Text style={[styles.stickyBack, { color: '#ffffff' }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.stickyTitle, { color: '#ffffff' }]} numberOfLines={1}>{league.name}</Text>
        {isCommissioner && pitchSensitiveControlsAllowed ? (
          <TouchableOpacity onPress={() => router.push({ pathname: '/screens/league-settings', params: { leagueId } })} style={{ paddingHorizontal: 12 }}>
            <Text style={[styles.stickyBack, { color: '#ffffff' }]}>⚙️</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </Animated.View>
      <Animated.ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 90 }}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >
      <View style={styles.inner}>

        {/* Header */}
        <View style={[styles.header, { backgroundColor: teamAbbr ? tintColor + '22' : '#0a0a0a', borderBottomColor: teamAbbr ? teamTheme.borderColor : '#1a1a1a' }]}>
          <TouchableOpacity onPress={() => router.replace('/(tabs)/dashboard')}>
            <Text style={[styles.backText, { color: titleColor }]}>← Back</Text>
          </TouchableOpacity>
          {isCommissioner && pitchSensitiveControlsAllowed && (
            <TouchableOpacity
              style={[styles.commBadge, { backgroundColor: tintColor + '22', borderColor: teamTheme.borderColor, flexDirection: 'row', alignItems: 'center', gap: 4 }]}
              onPress={() => router.push({ pathname: '/screens/league-settings', params: { leagueId } })}
            >
              <Text style={[styles.commBadgeText, { color: titleColor }]}>⚙️ Settings</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.leagueNameRow}>
          {myTeamAbbr ? (
            <SportTeamLogo
              sport={leagueSport}
              abbr={myTeamAbbr}
              era={league.era}
              style={styles.leagueNameLogo}
              textColor="#ffffff"
              fontSize={14}
            />
          ) : (
            <LeagueAvatar photoUrl={league.photoUrl} leagueName={league.name} size={44} />
          )}
          <Text style={[styles.leagueName, teamAbbr && { color: titleColor }]}>{league.name}</Text>
        </View>
        <View style={styles.leagueMeta}>
          <View style={styles.sportChip}>
            <Text style={styles.sportChipText}>{sportDisplayLabel(league.sport)}</Text>
          </View>
          <Text style={styles.metaText}>{leagueSetupLabel(league)}</Text>
          <View style={styles.metaBtns}>
            <TouchableOpacity
              style={[styles.membersTabBtn, { backgroundColor: tintColor + '22', borderColor: teamTheme.borderColor + '88' }]}
              onPress={() => router.push({ pathname: '/screens/league-members', params: { leagueId } })}
            >
              <Text style={[styles.membersTabBtnText, { color: titleColor }]}>👥 Members ({members.length})</Text>
            </TouchableOpacity>
            {pitchSensitiveControlsAllowed ? (
              <TouchableOpacity
                style={[styles.findGMsBtn, { backgroundColor: tintColor + '22', borderColor: teamTheme.borderColor + '88' }]}
                onPress={() => router.push({ pathname: '/screens/invite-members', params: { leagueId, leagueName: league.name } })}
              >
                <Text style={[styles.findGMsBtnText, { color: titleColor }]}>🔍 Find GMs</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
        {(pitchViewer || pitchLocked) ? (
          <View style={styles.pitchNotice}>
            <Text style={styles.pitchNoticeLabel}>Pitch Demo Access</Text>
            <Text style={styles.pitchNoticeText}>This league is open for review, but invite, settings, deletion, and destructive commissioner controls are protected.</Text>
          </View>
        ) : null}

        <View style={[styles.leagueCommandShell, { borderColor: teamTheme.borderColor, backgroundColor: tintColor + '18' }]}>
          <View style={styles.leagueCommandHeader}>
            <View>
              <Text style={styles.leagueCommandEyebrow}>League Operations</Text>
              <Text style={[styles.leagueCommandTitle, { color: titleColor }]} numberOfLines={1}>{league.name}</Text>
            </View>
            <Text style={styles.leagueCommandMeta}>{sportDisplayLabel(league.sport)}</Text>
          </View>
          <TouchableOpacity style={styles.leagueFeatureCard} onPress={goToChannels}>
            <View style={styles.leagueFeatureLeft}>
              <Text style={styles.leagueFeatureIcon}>{channelIcon}</Text>
              <View style={styles.leagueFeatureTextBlock}>
                <Text style={[styles.leagueFeatureLabel, { color: titleColor }]} numberOfLines={1}>{channelLabel}</Text>
                <Text style={styles.leagueFeatureSub} numberOfLines={1}>GM Controls and News</Text>
              </View>
            </View>
            <Text style={styles.leagueFeatureChevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* My Team or Pick Team */}
        {myTeam ? (
          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.myTeamOperationsCard, { borderColor: teamTheme.borderColor, backgroundColor: tintColor + "18" }]}
            onPress={() => router.push({
              pathname: '/screens/roster',
              params: { leagueId, sport: SPORT_KEY[league.sport] || league.sport, teamId: myTeam.id || '', era: league.era || 'current' },
            })}
          >
            <View style={styles.clubCardHeader}>
              <View style={styles.clubCardTitleBlock}>
                <Text style={styles.clubCardLabel}>Club Snapshot</Text>
                <Text style={[styles.clubCardName, { color: titleColor }]} numberOfLines={1}>{myTeamName}</Text>
                <Text style={styles.clubCardSub}>{myTeamAbbr} · {myTeam.players?.length || 0} players</Text>
              </View>
              <Text style={[styles.clubCardChevron, { color: teamText }]}>›</Text>
            </View>
            {myTeam.players?.length > 0 && (
              <View style={styles.clubPlayerStack}>
                {myTeamPlayersByValue.slice(0, 3).map((p: any) => (
                  <View key={p.player_id} style={styles.clubPlayerRow}>
                    <Text style={[styles.clubPlayerPos, { color: teamText }]}>{p.position}</Text>
                    <Text style={styles.clubPlayerName} numberOfLines={1}>{p.full_name}</Text>
                    {playerJerseyDisplay(p) ? (
                      <Text style={styles.clubPlayerJersey}>{playerJerseyDisplay(p)}</Text>
                    ) : null}
                  </View>
                ))}
                {myTeamPlayersByValue.length > 3 && (
                  <Text style={[styles.clubMorePlayers, { color: teamText }]}>+{myTeamPlayersByValue.length - 3} more players →</Text>
                )}
              </View>
            )}
          </TouchableOpacity>
        ) : pitchViewer ? (
          <View style={styles.pitchNotice}>
            <Text style={styles.pitchNoticeLabel}>Read-Only Franchise Access</Text>
            <Text style={styles.pitchNoticeText}>The founder controls team assignments in this pitch league.</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.pickTeamBtn}
            onPress={() => goToTeamSelect({ leagueId, sport: league.sport, era: league.era, mode: league.mode })}
          >
            <Text style={styles.pickTeamBtnIcon}>🏆</Text>
            <View>
              <Text style={styles.pickTeamBtnText}>Pick Your Team</Text>
              <Text style={styles.pickTeamBtnSub}>Choose your team to get started</Text>
            </View>
            <Text style={styles.pickTeamChevron}>›</Text>
          </TouchableOpacity>
        )}

        {league.mode === 'draft' && league.draftStatus !== 'complete' && (
          <TouchableOpacity
            style={[styles.leagueFeatureCard, { borderColor: '#f4b942', backgroundColor: '#2a210d', marginBottom: 12 }]}
            onPress={() => router.push({ pathname: '/screens/offseason/live-draft', params: { leagueId } })}
          >
            <View style={styles.leagueFeatureLeft}>
              <Text style={styles.leagueFeatureIcon}>🎯</Text>
              <View>
                <Text style={[styles.leagueFeatureLabel, { color: '#f4b942' }]}>Fantasy Draft Room</Text>
                <Text style={styles.leagueFeatureSub} numberOfLines={2}>80-second picks, draft boards, CPU auto-pick</Text>
              </View>
            </View>
            <Text style={styles.leagueFeatureChevron}>›</Text>
          </TouchableOpacity>
        )}

        <View style={styles.leagueActionStack}>
          <TouchableOpacity
            style={[styles.leagueQuickLink, styles.rostersBtn, { backgroundColor: tintColor + '18', borderColor: teamTheme.borderColor }]}
            onPress={() => router.push({ pathname: '/screens/league-rosters', params: { leagueId } })}
          >
            <Text style={[styles.rostersBtnText, { color: titleColor }]}>📋 League Rosters</Text>
            <Text style={styles.leagueQuickChevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.leagueQuickLink, styles.scheduleBtn, { backgroundColor: tintColor + '12', borderColor: teamTheme.borderColor + 'cc' }]}
            onPress={() => router.push({ pathname: '/screens/season/calendar', params: { leagueId } })}
          >
            <Text style={[styles.scheduleBtnText, { color: titleColor }]}>📅 Schedule</Text>
            <Text style={styles.leagueQuickChevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Commissioner Controls */}
        {isCommissioner && pitchSensitiveControlsAllowed && (
          <View style={styles.commSection}>
            <Text style={[styles.sectionTitle, { marginBottom: 12 }]}>Commissioner Controls</Text>
            <TouchableOpacity
              style={[styles.inviteBtn, { backgroundColor: tintColor + '22', borderColor: teamTheme.borderColor + '88' }]}
              onPress={() => router.push({ pathname: '/screens/invite-members', params: { leagueId, leagueName: league.name } })}
            >
              <Text style={[styles.inviteBtnText, { color: teamText }]}>📨 Send League Invite</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.inviteBtn, { backgroundColor: tintColor + '22', borderColor: teamTheme.borderColor + '88' }]}
              onPress={async () => {
                const newPrivacy = league.privacy === 'public' ? 'private' : 'public';
                await updateDoc(doc(db, 'leagues', leagueId), { privacy: newPrivacy });
                setLeague((prev: any) => ({ ...prev, privacy: newPrivacy }));
              }}
            >
              <Text style={[styles.inviteBtnText, { color: teamText }]}>
                {league.privacy === 'public' ? '🟢 Public League (tap to make Private)' : '🔒 Private League (tap to make Public)'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.advanceSeasonBtn, { backgroundColor: '#2a1a00', borderColor: '#ffaa00', marginTop: 12 }]}
              onPress={openOffseasonManagement}
            >
              <Text style={[styles.advanceSeasonBtnText, { color: '#ffaa00' }]}>Offseason Management</Text>
            </TouchableOpacity>
            {!league?.offseason ? (
              <Text style={styles.offseasonWarning}>
                {isNBASport
                  ? 'Warning: starting offseason opens timed 10-minute stages and cannot be rolled back.'
                  : 'Starting offseason opens sport-specific roster, contract, draft, and cut stages.'}
              </Text>
            ) : null}
          </View>
        )}

        {!isCommissioner && (
          <TouchableOpacity style={styles.leaveBtn} onPress={handleLeaveLeague}>
            <Text style={styles.leaveBtnText}>Leave League</Text>
          </TouchableOpacity>
        )}

        <View style={styles.spacer} />
      </View>
          <GlobalNav />
      </Animated.ScrollView>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  loadingContainer: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' },
  inner: { padding: 24, paddingTop: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottomWidth: 2 },
  backText: { fontSize: 15, fontWeight: '600' },
  commBadge: { backgroundColor: '#0a2a1a', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#00ff87' },
  commBadgeText: { color: '#00ff87', fontSize: 12, fontWeight: '600' },
  leagueNameRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  leagueNameLogo: { width: 40, height: 40 },
  leagueName: { fontSize: 28, fontWeight: '800', color: '#ffffff' },
  leagueMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  pitchNotice: { backgroundColor: '#07131f', borderRadius: 8, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: '#4ea1ff66' },
  pitchNoticeLabel: { color: '#4ea1ff', fontSize: 10, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  pitchNoticeText: { color: '#a9bdd0', fontSize: 12, fontWeight: '700', lineHeight: 17 },
  sportChip: { backgroundColor: '#1a1a1a', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#333' },
  sportChipText: { color: '#aaa', fontSize: 12, fontWeight: '700' },
  metaText: { color: '#666', fontSize: 13 },
  leagueCommandShell: { borderRadius: 8, padding: 14, marginBottom: 14, borderWidth: 2, gap: 12 },
  leagueCommandHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  leagueCommandEyebrow: { color: '#888', fontSize: 10, fontWeight: '900', letterSpacing: 1.1, textTransform: 'uppercase' },
  leagueCommandTitle: { fontSize: 20, fontWeight: '900', marginTop: 2, maxWidth: 250 },
  leagueCommandMeta: { color: '#aaa', fontSize: 11, fontWeight: '900', borderWidth: 1, borderColor: '#333', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  leagueFeatureCard: { backgroundColor: '#101010', borderRadius: 8, padding: 13, borderWidth: 1, borderColor: '#2a2a2a', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  leagueFeatureLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  leagueFeatureIcon: { fontSize: 26 },
  leagueFeatureTextBlock: { flex: 1, minWidth: 0 },
  leagueFeatureLabel: { fontSize: 16, fontWeight: '900', color: '#ffffff', marginBottom: 3 },
  leagueFeatureSub: { fontSize: 11, color: '#777', lineHeight: 15, fontWeight: '800' },
  leagueFeatureChevron: { color: '#777', fontSize: 26, fontWeight: '300', marginLeft: 8 },
  myTeamOperationsCard: { borderRadius: 8, padding: 14, marginBottom: 14, borderWidth: 2 },
  clubCardChevron: { fontSize: 28, fontWeight: '300', marginLeft: 8 },
  clubCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  clubCardTitleBlock: { flex: 1, minWidth: 0 },
  clubCardLabel: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', marginBottom: 3, color: '#888', letterSpacing: 1 },
  clubCardName: { fontSize: 18, fontWeight: '900', color: '#ffffff', marginBottom: 2 },
  clubCardSub: { fontSize: 12, color: '#4a8a4a', fontWeight: '800' },
  clubPlayerStack: { gap: 8 },
  clubPlayerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#11111166', borderRadius: 7, paddingHorizontal: 9, paddingVertical: 7 },
  clubPlayerPos: { color: '#00ff87', fontSize: 11, fontWeight: '900', width: 34 },
  clubPlayerName: { color: '#e6e6e6', fontSize: 13, flex: 1, fontWeight: '800' },
  clubPlayerJersey: { color: '#666', fontSize: 12, fontWeight: '900' },
  clubMorePlayers: { color: '#555', fontSize: 12, marginTop: 4, fontWeight: '900' },
  pickTeamBtn: { backgroundColor: '#0a1a0a', borderRadius: 16, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: '#1a3a1a', flexDirection: 'row', alignItems: 'center', gap: 12 },
  pickTeamBtnIcon: { fontSize: 28 },
  pickTeamBtnText: { color: '#00ff87', fontSize: 16, fontWeight: '700' },
  pickTeamBtnSub: { color: '#4a8a4a', fontSize: 12 },
  pickTeamChevron: { color: '#4a8a4a', fontSize: 24, marginLeft: 'auto' },
  findGMsBtn: { borderRadius: 10, paddingVertical: 6, paddingHorizontal: 12, alignItems: 'center', borderWidth: 1, marginLeft: 'auto' },
  findGMsBtnText: { fontSize: 12, fontWeight: '700' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#ffffff', marginBottom: 8 },

  metaBtns: { flexDirection: 'row', gap: 8, marginLeft: 'auto' },
  membersTabBtn: { borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, alignItems: 'center', borderWidth: 1 },
  membersTabBtnText: { fontSize: 11, fontWeight: '700' },
  commSection: { marginTop: 32, marginBottom: 16, paddingTop: 24, borderTopWidth: 1, borderTopColor: '#1a1a1a' },
  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    paddingTop: 60,
    paddingBottom: 12,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
  },
  stickyTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700' },
  stickyBack: { fontSize: 22, fontWeight: '700' },
  inviteBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, marginBottom: 10 },
  inviteBtnText: { fontSize: 15, fontWeight: '700' },
  advanceSeasonBtn: { backgroundColor: '#0a2a1a', borderRadius: 12, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: '#00ff87', marginBottom: 0 },
  advanceSeasonBtnText: { color: '#00ff87', fontSize: 15, fontWeight: '700' },
  offseasonWarning: { color: '#ffaa00', fontSize: 12, fontWeight: '700', lineHeight: 17, marginTop: 8, textAlign: 'center' },
  leagueActionStack: { gap: 9, marginBottom: 18 },
  leagueQuickLink: { minHeight: 58, borderRadius: 8, borderWidth: 1, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  leagueQuickChevron: { color: '#777', fontSize: 24, fontWeight: '300' },
  rostersBtn: { paddingVertical: 14, alignItems: 'center' },
  rostersBtnText: { fontSize: 15, fontWeight: '900' },
  scheduleBtn: { paddingVertical: 14, alignItems: 'center' },
  scheduleBtnText: { fontSize: 15, fontWeight: '900' },
  leaveBtn: { backgroundColor: '#1a1a1a', borderRadius: 12, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: '#444', marginBottom: 16 },
  leaveBtnText: { color: '#888', fontSize: 15, fontWeight: '600' },
  spacer: { height: 60 },
});
