import { router, useLocalSearchParams } from 'expo-router';
import { addDoc, arrayRemove, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useState, useRef } from 'react';
import { ActivityIndicator, Alert, Animated, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, db, functions } from '@/constants/firebase';
import { goToTeamSelect } from '@/utils/teamSelectNav';
import { getTeamColors, getTeamLogoUrl, getTeamLogoLocal, getTeamTheme, getCurrentTeamAbbr } from '@/constants/teamColors';
import { getSportTeamTheme } from '@/constants/sportTeams';
import SportTeamLogo from '@/components/SportTeamLogo';
import { blockAndReport } from '@/constants/moderation';
import GlobalNav from '@/components/GlobalNav';
import LeagueAvatar from '@/components/LeagueAvatar';
import { setLastLeagueId } from '@/utils/lastLeague';
import { isDeletedLeagueAlertSuppressed } from '@/utils/deletedLeagueAlert';
import { playerJerseyDisplay } from '@/domain/sports/playerDisplay';
import { compareRosterPlayersByValue } from '@/domain/nba/rotation';



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
  nba: 'Inside the NBA',
  madden: 'Inside the NFL',
  mlb: 'Inside MLB',
};

const CHANNEL_ICON: Record<string, string> = {
  nba: '🏀',
  madden: '🏈',
  mlb: '⚾',
};

export default function LeagueScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const [league, setLeague] = useState<any>(null);
  const [myTeam, setMyTeam] = useState<any>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [activityIndex, setActivityIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const user = auth.currentUser;
  const isCommissioner = league?.commissionerId === user?.uid || (league?.coCommissioners || []).includes(user?.uid || '');
  const currentYear = league?.currentYear || 2024;
  const teamAbbr = myTeam?.abbreviation || '';
  const leagueSport = league?.sport || 'nba';
  const isNBASport = leagueSport === 'nba';
  const teamColors = isNBASport
    ? getTeamColors(teamAbbr || 'ATL', currentYear)
    : [getSportTeamTheme(leagueSport, teamAbbr).tintColor, getSportTeamTheme(leagueSport, teamAbbr).titleColor];
  const teamPrimary = teamColors[0] || '#1a1a1a';
  const teamSecondary = teamColors[1] || '#ffffff';
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
  // If team color is very dark (close to black), use white as visual fallback for borders/tints
  const displayPrimary = hexToLum(teamPrimary) < 0.1 ? '#ffffff' : teamPrimary;
  // Per-team theme overrides (button labels, borders, tints)
  const teamTheme = isNBASport
    ? getTeamTheme(myTeam?.abbreviation || teamAbbr, league?.era)
    : getSportTeamTheme(leagueSport, myTeam?.abbreviation || teamAbbr);
  const titleColor = teamTheme.titleColor;
  const borderColor = teamTheme.borderColor;
  const tintColor = teamTheme.tintColor;
  const teamText = hexToLum(teamPrimary) < 0.35 ? '#ffffff' : teamPrimary;
  const teamNameColor = hexToLum(teamSecondary) < 0.35 || hexToLum(teamSecondary) > 0.95 ? '#ffffff' : teamSecondary;
  const myTeamPlayersByValue = [...(myTeam?.players || [])].sort(compareRosterPlayersByValue);

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

      const memberProfiles = await Promise.all(
        (leagueData.members || []).map(async (uid: string) => {
          const snap = await getDoc(doc(db, 'users', uid));
          return snap.exists() ? { uid, ...snap.data() } : { uid, displayName: 'Unknown GM' };
        })
      );
      setMembers(memberProfiles);

      const teamsSnap = await getDocs(collection(db, 'leagues', leagueId, 'teams'));
      const allTeams = teamsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      setTeams(allTeams);
      const myT = teamsSnap.docs.find(d => d.data().gmId === user?.uid);
      if (myT) setMyTeam({ id: myT.id, ...myT.data() });

      setLoading(false);
    };

    loadLeague();

    const activityQuery = query(
      collection(db, 'leagues', leagueId, 'activity'),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(activityQuery, snap => {
      setActivity(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => { if (err.code !== 'permission-denied') console.error(err); });

    // If the league is deleted while we're viewing it, return to the main menu.
    const unsubLeague = onSnapshot(doc(db, 'leagues', leagueId), (snap) => {
      if (!snap.exists()) {
        if (!isDeletedLeagueAlertSuppressed(leagueId)) {
          Alert.alert('League deleted', 'This league has been deleted by the commissioner.');
        }
        router.replace('/(tabs)/dashboard');
      }
    }, err => { if (err.code !== 'permission-denied') console.error(err); });

    return () => { unsubscribe(); unsubLeague(); };
  }, [leagueId]);

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

  const handleMemberLongPress = (member: any) => {
    if (member.uid === user?.uid) return;
    Alert.alert(member.displayName, 'What would you like to do?', [
      {
        text: 'DM',
        onPress: () => router.push({ pathname: '/screens/dm', params: { uid: member.uid, name: member.displayName } }),
      },
      {
        text: 'Block / Report',
        style: 'destructive',
        onPress: () => blockAndReport(member.uid, member.displayName),
      },
      { text: 'Cancel', style: 'cancel' },
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
    if (!isCommissioner || !isNBASport || league?.offseason) {
      router.push({ pathname: '/screens/offseason', params: { leagueId } });
      return;
    }
    Alert.alert(
      'Start offseason?',
      'Once offseason starts, each stage lasts 10 minutes, league pages move forward, and there is no going back.',
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
                expectedStage: 'awards_recap',
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
        {isCommissioner ? (
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
          {isCommissioner && (
            <TouchableOpacity
              style={[styles.commBadge, { backgroundColor: tintColor + '22', borderColor: teamTheme.borderColor, flexDirection: 'row', alignItems: 'center', gap: 4 }]}
              onPress={() => router.push({ pathname: '/screens/league-settings', params: { leagueId } })}
            >
              <Text style={[styles.commBadgeText, { color: titleColor }]}>⚙️ Settings</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.leagueNameRow}>
          {myTeam?.abbreviation ? (
            <SportTeamLogo
              sport={leagueSport}
              abbr={myTeam.abbreviation}
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
            <Text style={styles.sportChipText}>{league.sport?.toUpperCase()}</Text>
          </View>
          <Text style={styles.metaText}>{league.sport === 'nba' && league.era
            ? (NBA_ERA_LABELS[league.era] || league.era) + ' Era · ' + (league.mode === 'draft' ? 'Draft' : 'Current Rosters')
            : league.mode + ' mode'}</Text>
          <View style={styles.metaBtns}>
            <TouchableOpacity
              style={[styles.membersTabBtn, { backgroundColor: tintColor + '22', borderColor: teamTheme.borderColor + '88' }]}
              onPress={() => router.push({ pathname: '/screens/league-members', params: { leagueId } })}
            >
              <Text style={[styles.membersTabBtnText, { color: titleColor }]}>👥 Members ({members.length})</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.findGMsBtn, { backgroundColor: tintColor + '22', borderColor: teamTheme.borderColor + '88' }]}
              onPress={() => router.push({ pathname: '/screens/invite-members', params: { leagueId, leagueName: league.name } })}
            >
              <Text style={[styles.findGMsBtnText, { color: titleColor }]}>🔍 Find GMs</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Channels — front and center */}
        <TouchableOpacity style={[styles.channelsTab, { borderColor: teamTheme.borderColor, backgroundColor: tintColor + '22' }]} onPress={goToChannels}>
          <View style={styles.channelsTabLeft}>
            <Text style={styles.channelsTabIcon}>{channelIcon}</Text>
            <View>
              <Text style={[styles.channelsTabLabel, { color: titleColor }]}>{channelLabel}</Text>
              <Text style={styles.channelsTabSub}>League Chat · Trade Center · Polls · and more</Text>
            </View>
          </View>
          <Text style={styles.channelsTabChevron}>›</Text>
        </TouchableOpacity>

        {/* My Team or Pick Team */}
        {myTeam ? (
          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.myTeamCard, { borderColor: teamTheme.borderColor, backgroundColor: tintColor + "22" }]}
            onPress={() => router.push({
              pathname: '/screens/roster',
              params: { leagueId, sport: SPORT_KEY[league.sport] || league.sport, teamId: myTeam.id || '', era: league.era || 'current' },
            })}
          >
            <View style={styles.myTeamCardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.myTeamCardLabel}>MY TEAM</Text>
                <Text style={[styles.myTeamCardName, { color: titleColor }]}>{myTeam.name}</Text>
                <Text style={styles.myTeamCardSub}>{myTeam.abbreviation} · {myTeam.players?.length || 0} players</Text>
              </View>
              <Text style={[styles.myTeamChevron, { color: teamText }]}>›</Text>
            </View>
            {myTeam.players?.length > 0 && (
              <View style={styles.myTeamPlayers}>
                {myTeamPlayersByValue.slice(0, 3).map((p: any) => (
                  <View key={p.player_id} style={styles.myTeamPlayerRow}>
                    <Text style={[styles.myTeamPlayerPos, { color: teamText }]}>{p.position}</Text>
                    <Text style={styles.myTeamPlayerName}>{p.full_name}</Text>
                    {playerJerseyDisplay(p) ? (
                      <Text style={styles.myTeamPlayerJersey}>{playerJerseyDisplay(p)}</Text>
                    ) : null}
                  </View>
                ))}
                {myTeamPlayersByValue.length > 3 && (
                  <Text style={[styles.myTeamMorePlayers, { color: teamText }]}>+{myTeamPlayersByValue.length - 3} more players →</Text>
                )}
              </View>
            )}
          </TouchableOpacity>
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
            style={[styles.channelsTab, { borderColor: '#f4b942', backgroundColor: '#2a210d' }]}
            onPress={() => router.push({ pathname: '/screens/offseason/live-draft', params: { leagueId } })}
          >
            <View style={styles.channelsTabLeft}>
              <Text style={styles.channelsTabIcon}>🎯</Text>
              <View>
                <Text style={[styles.channelsTabLabel, { color: '#f4b942' }]}>Fantasy Draft Room</Text>
                <Text style={styles.channelsTabSub}>80-second picks · draft boards · CPU auto-pick</Text>
              </View>
            </View>
            <Text style={styles.channelsTabChevron}>›</Text>
          </TouchableOpacity>
        )}

        {isNBASport && (
          <View style={[styles.seasonHub, { borderColor: teamTheme.borderColor, backgroundColor: tintColor + '16' }]}>
            <View style={styles.seasonHubHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.seasonHubTitle, { color: titleColor }]}>Season Hub</Text>
                <Text style={styles.seasonHubSub}>Calendar, standings, playoffs, awards, scouting, rotations, and coaching</Text>
              </View>
              <Text style={[styles.seasonHubChevron, { color: titleColor }]}>NBA</Text>
            </View>
            <View style={styles.seasonHubGrid}>
              <TouchableOpacity
                style={[styles.seasonHubButton, { borderColor: teamTheme.borderColor + '88' }]}
                onPress={() => router.push({ pathname: '/screens/season/calendar', params: { leagueId } })}
              >
                <Text style={styles.seasonHubButtonIcon}>📅</Text>
                <Text style={[styles.seasonHubButtonText, { color: titleColor }]}>Calendar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.seasonHubButton, { borderColor: teamTheme.borderColor + '88' }]}
                onPress={() => router.push({ pathname: '/screens/season/standings', params: { leagueId } })}
              >
                <Text style={styles.seasonHubButtonIcon}>🏆</Text>
                <Text style={[styles.seasonHubButtonText, { color: titleColor }]}>Standings</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.seasonHubButton, { borderColor: teamTheme.borderColor + '88' }]}
                onPress={() => router.push({ pathname: '/screens/season/playoffs', params: { leagueId } })}
              >
                <Text style={styles.seasonHubButtonIcon}>🥇</Text>
                <Text style={[styles.seasonHubButtonText, { color: titleColor }]}>Playoff Picture</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.seasonHubButton, { borderColor: teamTheme.borderColor + '88' }]}
                onPress={() => router.push({ pathname: '/screens/season/awards', params: { leagueId } })}
              >
                <Text style={styles.seasonHubButtonIcon}>💍</Text>
                <Text style={[styles.seasonHubButtonText, { color: titleColor }]}>Awards</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.seasonHubButton, { borderColor: teamTheme.borderColor + '88' }]}
                onPress={() => {
                  if (!myTeam) { Alert.alert('No team yet', 'Claim a team before spending upgrade points.'); return; }
                  router.push({ pathname: '/screens/season/player-upgrades', params: { leagueId } });
                }}
              >
                <Text style={styles.seasonHubButtonIcon}>⬆️</Text>
                <Text style={[styles.seasonHubButtonText, { color: titleColor }]}>Upgrades</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.seasonHubButton, { borderColor: teamTheme.borderColor + '88' }]}
                onPress={() => {
                  if (!myTeam) { Alert.alert('No team yet', 'Claim a team before setting rotations.'); return; }
                  router.push({ pathname: '/screens/season/rotation', params: { leagueId } });
                }}
              >
                <Text style={styles.seasonHubButtonIcon}>⛹️</Text>
                <Text style={[styles.seasonHubButtonText, { color: titleColor }]}>Rotation</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.seasonHubButton, { borderColor: teamTheme.borderColor + '88' }]}
                onPress={() => {
                  if (!myTeam) { Alert.alert('No team yet', 'Claim a team before scouting.'); return; }
                  router.push({ pathname: '/screens/season/scouting', params: { leagueId } });
                }}
              >
                <Text style={styles.seasonHubButtonIcon}>🔎</Text>
                <Text style={[styles.seasonHubButtonText, { color: titleColor }]}>Scouting</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.seasonHubButton, { borderColor: teamTheme.borderColor + '88' }]}
                onPress={() => router.push({ pathname: '/screens/season/injuries', params: { leagueId } })}
              >
                <Text style={styles.seasonHubButtonIcon}>➕</Text>
                <Text style={[styles.seasonHubButtonText, { color: titleColor }]}>Injuries</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.seasonHubButton, { borderColor: teamTheme.borderColor + '88' }]}
                onPress={() => {
                  if (!myTeam) { Alert.alert('No team yet', 'Claim a team before saving coaching presets.'); return; }
                  router.push({ pathname: '/screens/season/coaching-presets', params: { leagueId } });
                }}
              >
                <Text style={styles.seasonHubButtonIcon}>📋</Text>
                <Text style={[styles.seasonHubButtonText, { color: titleColor }]}>Coaching</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.seasonHubButton, { borderColor: teamTheme.borderColor + '88' }]}
                onPress={() => router.push({ pathname: '/screens/offseason/draft-class', params: { leagueId } })}
              >
                <Text style={styles.seasonHubButtonIcon}>🧾</Text>
                <Text style={[styles.seasonHubButtonText, { color: titleColor }]}>Draft Class</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* League Activity Carousel */}
        <View style={styles.activityCarouselHeader}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          {activity.length > 0 && (
            <View style={styles.activityNav}>
              <TouchableOpacity
                onPress={() => setActivityIndex(i => Math.max(0, i - 1))}
                style={[styles.activityNavBtn, activityIndex === 0 && styles.activityNavBtnDisabled]}
              >
                <Text style={styles.activityNavText}>‹</Text>
              </TouchableOpacity>
              <Text style={styles.activityNavCount}>{activityIndex + 1} of {activity.length}</Text>
              <TouchableOpacity
                onPress={() => setActivityIndex(i => Math.min(activity.length - 1, i + 1))}
                style={[styles.activityNavBtn, activityIndex === activity.length - 1 && styles.activityNavBtnDisabled]}
              >
                <Text style={styles.activityNavText}>›</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        {activity.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No activity yet. Pick up your first player!</Text>
          </View>
        ) : (() => {
          const item = activity[activityIndex];
          const typeIcon = item.type === 'pickup' || item.type === 'sign' ? '✍️' :
            item.type === 'drop' ? '❌' :
            item.type === 'tradeblock' ? '🔄' :
            item.type === 'trade_listing' ? '💰' :
            item.type === 'join' ? '👋' :
            item.type === 'announcement' ? '📰' :
            item.type === 'reset_request' ? '🔁' : '📋';

          const getDeepLink = () => {
            if (item.type === 'trade_listing' || item.type === 'tradeblock')
              return () => router.push({ pathname: '/screens/trade-channel', params: { leagueId, channelId: 'trade-center' } });
            if (item.type === 'pickup' || item.type === 'sign' || item.type === 'drop')
              return () => router.push({ pathname: '/screens/roster', params: { leagueId, teamId: myTeam?.id || '', leagueName: league.name, era: league.era, sport: league.sport, mode: league.mode } });
            if (item.type === 'announcement')
              return () => router.push({ pathname: '/screens/channel', params: { leagueId, leagueName: league.name, channelId: 'announcements', channelLabel: 'League News', channelIcon: '📰', commissionerId: league.commissionerId, coCommissioners: JSON.stringify(league.coCommissioners || []) } });
            if (item.type === 'reset_request')
              return () => router.push({ pathname: '/screens/channel', params: { leagueId, leagueName: league.name, channelId: 'reset-requests', channelLabel: 'Game Resets', channelIcon: '🔁', commissionerId: league.commissionerId, coCommissioners: JSON.stringify(league.coCommissioners || []) } });
            if (item.type === 'join')
              return () => router.push({ pathname: '/screens/league-members', params: { leagueId } });
            return null;
          };

          const deepLink = getDeepLink();
          return (
            <TouchableOpacity
              key={item.id}
              style={styles.activityCarouselCard}
              onPress={deepLink || undefined}
              activeOpacity={deepLink ? 0.7 : 1}
            >
              <View style={styles.activityCardTop}>
                <Text style={styles.activityTypeIcon}>{typeIcon}</Text>
                <View style={styles.activityContent}>
                  <Text style={styles.activityMessage}>
                    {item.playerName ? (
                      <>
                        {item.message.split(item.playerName)[0]}
                        <Text style={styles.activityPlayerLink}>{item.playerName}</Text>
                        {item.message.split(item.playerName)[1]}
                      </>
                    ) : item.message}
                  </Text>
                  {deepLink && <Text style={styles.activityLink}>Tap to view →</Text>}
                  <Text style={styles.activityTime}>
                    {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : ''}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })()}

        <TouchableOpacity
          style={[styles.rostersBtn, { backgroundColor: tintColor + '22', borderColor: teamTheme.borderColor, marginTop: 0, marginBottom: 16 }]}
          onPress={() => router.push({ pathname: '/screens/league-activity', params: { leagueId } })}
        >
          <Text style={[styles.rostersBtnText, { color: titleColor }]}>📜 League Activity</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.rostersBtn, { backgroundColor: tintColor + '22', borderColor: teamTheme.borderColor, marginTop: 0, marginBottom: 16 }]}
          onPress={() => router.push({ pathname: '/screens/league-rosters', params: { leagueId } })}
        >
          <Text style={[styles.rostersBtnText, { color: titleColor }]}>📋 League Rosters</Text>
        </TouchableOpacity>

        {/* Commissioner Controls */}
        {isCommissioner && (
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
            {isNBASport && !league?.offseason ? (
              <Text style={styles.offseasonWarning}>
                Warning: starting offseason opens timed 10-minute stages and cannot be rolled back.
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
  sportChip: { backgroundColor: '#1a1a1a', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#333' },
  sportChipText: { color: '#aaa', fontSize: 12, fontWeight: '700' },
  metaText: { color: '#666', fontSize: 13 },
  channelsTab: { backgroundColor: '#0a1a2a', borderRadius: 16, padding: 18, marginBottom: 16, borderWidth: 2, borderColor: '#1a3a5a', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  channelsTabLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  channelsTabIcon: { fontSize: 32 },
  channelsTabLabel: { fontSize: 18, fontWeight: '800', color: '#ffffff', marginBottom: 3 },
  channelsTabSub: { fontSize: 12, color: '#4a7a9a' },
  channelsTabChevron: { color: '#4a7a9a', fontSize: 28, fontWeight: '300' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 32 },
  myTeamCard: { borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 2 },
  myTeamChevron: { fontSize: 28, fontWeight: '300', marginLeft: 8 },
  myTeamCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  myTeamCardLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2, color: '#888' },
  myTeamCardName: { fontSize: 18, fontWeight: '800', color: '#ffffff', marginBottom: 2 },
  myTeamCardSub: { fontSize: 12, color: '#4a8a4a' },
  myTeamPlayers: { gap: 8 },
  myTeamPlayerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  myTeamPlayerPos: { color: '#00ff87', fontSize: 11, fontWeight: '700', width: 28 },
  myTeamPlayerName: { color: '#cccccc', fontSize: 13, flex: 1 },
  myTeamPlayerJersey: { color: '#555', fontSize: 12 },
  myTeamMorePlayers: { color: '#555', fontSize: 12, marginTop: 4 },
  pickTeamBtn: { backgroundColor: '#0a1a0a', borderRadius: 16, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: '#1a3a1a', flexDirection: 'row', alignItems: 'center', gap: 12 },
  pickTeamBtnIcon: { fontSize: 28 },
  pickTeamBtnText: { color: '#00ff87', fontSize: 16, fontWeight: '700' },
  pickTeamBtnSub: { color: '#4a8a4a', fontSize: 12 },
  pickTeamChevron: { color: '#4a8a4a', fontSize: 24, marginLeft: 'auto' },
  rosterBtn: { backgroundColor: '#00ff87', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 18 },
  rosterBtnText: { color: '#000', fontSize: 14, fontWeight: '700' },
  findGMsBtn: { borderRadius: 10, paddingVertical: 6, paddingHorizontal: 12, alignItems: 'center', borderWidth: 1, marginLeft: 'auto' },
  findGMsBtnText: { fontSize: 12, fontWeight: '700' },
  myTeamChip: { backgroundColor: '#1a1a1a', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#2a2a2a', flex: 1 },
  myTeamChipText: { color: '#888', fontSize: 13 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#ffffff', marginBottom: 8 },
  memberHint: { color: '#333', fontSize: 12, marginBottom: 14 },
  emptyCard: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: '#2a2a2a' },
  emptyText: { color: '#666', fontSize: 14, textAlign: 'center' },

  activityCarouselHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  activityNav: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activityNavBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#333', alignItems: 'center', justifyContent: 'center' },
  activityNavBtnDisabled: { opacity: 0.3 },
  activityNavText: { color: '#ffffff', fontSize: 18, fontWeight: '700' },
  activityNavCount: { color: '#666', fontSize: 12 },
  activityCarouselCard: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#2a2a2a', flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  activityLink: { color: '#ff9900', fontSize: 11, marginTop: 4, fontWeight: '600' },
  activityCardTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', flex: 1 },
  activityTypeIcon: { fontSize: 20, lineHeight: 24 },
  activityPlayerLink: { color: '#00ff87', fontWeight: '700' },
  metaBtns: { flexDirection: 'row', gap: 8, marginLeft: 'auto' },
  membersTabBtn: { borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, alignItems: 'center', borderWidth: 1 },
  membersTabBtnText: { fontSize: 11, fontWeight: '700' },
  activityItem: { flexDirection: 'row', gap: 12, marginBottom: 14, alignItems: 'flex-start' },
  activityDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#00ff87', marginTop: 5 },
  activityDotTrade: { backgroundColor: '#ff9900' },
  activityContent: { flex: 1 },
  activityMessage: { color: '#cccccc', fontSize: 14, lineHeight: 20 },
  activityBold: { color: '#ffffff', fontWeight: '700' },
  activityTime: { color: '#555', fontSize: 12, marginTop: 2 },
  membersCard: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16, marginBottom: 32, borderWidth: 1, borderColor: '#2a2a2a', gap: 14 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  memberAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2a2a2a', borderWidth: 1, borderColor: '#00ff87', alignItems: 'center', justifyContent: 'center' },
  memberAvatarText: { color: '#00ff87', fontSize: 14, fontWeight: '700' },
  memberName: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  memberRole: { color: '#00ff87', fontSize: 12 },
  dmSmallBtn: { backgroundColor: '#1a1a2a', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#4444ff' },
  dmSmallBtnText: { color: '#8888ff', fontSize: 12, fontWeight: '700' },
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
  rostersBtn: { paddingVertical: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center', marginTop: 12, marginBottom: 16 },
  rostersBtnText: { fontSize: 15, fontWeight: '700' },
  seasonHub: { borderRadius: 14, padding: 12, borderWidth: 1, marginBottom: 18 },
  seasonHubHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  seasonHubTitle: { fontSize: 16, fontWeight: '900' },
  seasonHubSub: { color: '#777', fontSize: 11, marginTop: 2 },
  seasonHubChevron: { fontSize: 11, fontWeight: '900' },
  seasonHubGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  seasonHubButton: { width: '48%', minHeight: 62, borderRadius: 10, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 6, backgroundColor: '#11111188', alignItems: 'center', justifyContent: 'center' },
  seasonHubButtonIcon: { fontSize: 18, marginBottom: 4 },
  seasonHubButtonText: { fontSize: 12, fontWeight: '800', textAlign: 'center' },
  deleteBtn: { backgroundColor: '#1a0a0a', borderRadius: 12, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: '#ff3333' },
  deleteBtnText: { color: '#ff3333', fontSize: 15, fontWeight: '700' },
  leaveBtn: { backgroundColor: '#1a1a1a', borderRadius: 12, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: '#444', marginBottom: 16 },
  leaveBtnText: { color: '#888', fontSize: 15, fontWeight: '600' },
  spacer: { height: 60 },
  deleteScreen: { flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', padding: 24 },
  deleteCard: { backgroundColor: '#1a0a0a', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: '#ff3333' },
  deleteTitle: { fontSize: 22, fontWeight: '800', color: '#ff3333', marginBottom: 8 },
  deleteSubtitle: { fontSize: 14, color: '#888', marginBottom: 12 },
  deleteName: { fontSize: 15, fontWeight: '700', color: '#ffffff', marginBottom: 20 },
  deleteInput: { backgroundColor: '#0a0a0a', borderRadius: 12, padding: 16, color: '#ffffff', fontSize: 15, borderWidth: 1, borderColor: '#333', marginBottom: 16 },
  deleteConfirmBtn: { backgroundColor: '#ff3333', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginBottom: 12 },
  deleteConfirmBtnDisabled: { opacity: 0.3 },
  deleteConfirmBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  deleteCancelBtn: { paddingVertical: 12, alignItems: 'center' },
  deleteCancelBtnText: { color: '#888', fontSize: 15 },
});
