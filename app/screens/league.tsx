import { router, useLocalSearchParams } from 'expo-router';
import { addDoc, arrayRemove, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';
import { getTeamColors, getTeamLogoUrl, getCurrentTeamAbbr } from '@/constants/teamColors';
import { blockAndReport } from '@/constants/moderation';
import GlobalNav from '@/components/GlobalNav';



const SPORT_KEY: Record<string, string> = {
  nba: 'nba',
  madden: 'nfl',
  mlb: 'mlb',
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
  const [members, setMembers] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [activityIndex, setActivityIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const user = auth.currentUser;
  const isCommissioner = league?.commissionerId === user?.uid || (league?.coCommissioners || []).includes(user?.uid || '');
  const currentYear = league?.currentYear || 2024;
  const teamAbbr = myTeam?.abbreviation || '';
  const teamColors = getTeamColors(teamAbbr || 'ATL', currentYear);
  const teamPrimary = teamColors[0];
  const teamSecondary = teamColors[1] || '#ffffff';
  const hexToLum = (hex: string) => {
    if (!hex || !hex.startsWith('#') || hex.length < 7) return 0.5;
    const r = parseInt(hex.slice(1,3), 16) / 255;
    const g = parseInt(hex.slice(3,5), 16) / 255;
    const b = parseInt(hex.slice(5,7), 16) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const teamText = hexToLum(teamPrimary) < 0.35 ? '#ffffff' : teamPrimary;

  useEffect(() => {
    if (!leagueId) return;

    const loadLeague = async () => {
      const leagueSnap = await getDoc(doc(db, 'leagues', leagueId));
      if (!leagueSnap.exists()) {
        Alert.alert('Not found', 'This league no longer exists.');
        router.replace('/(tabs)/dashboard');
        return;
      }
      const leagueData = { id: leagueSnap.id, ...leagueSnap.data() };
      setLeague(leagueData);

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

    const activityQuery = query(
      collection(db, 'leagues', leagueId, 'activity'),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(activityQuery, snap => {
      setActivity(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => unsubscribe();
  }, [leagueId]);

  const confirmDelete = () => {
    Alert.alert(
      'Delete League',
      'Are you sure you want to delete this league? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const batch = writeBatch(db);
              for (const member of members) {
                batch.update(doc(db, 'users', member.uid), { leagues: arrayRemove(leagueId) });
              }
              batch.delete(doc(db, 'leagues', leagueId));
              await batch.commit();
              router.replace('/(tabs)/dashboard');
            } catch (e: any) {
              Alert.alert('Error', e.message);
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handleLeaveLeague = async () => {
    if (!user) return;
    Alert.alert('Leave League', 'Are you sure you want to leave this league?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            await updateDoc(doc(db, 'leagues', leagueId), { members: arrayRemove(user.uid) });
            await updateDoc(doc(db, 'users', user.uid), { leagues: arrayRemove(leagueId) });
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
    <ScrollView style={styles.container}>
      <View style={styles.inner}>

        {/* Header */}
        <View style={[styles.header, { backgroundColor: teamAbbr ? teamPrimary + '22' : '#0a0a0a', borderBottomColor: teamAbbr ? teamPrimary + '44' : '#1a1a1a' }]}>
          <TouchableOpacity onPress={() => router.replace('/(tabs)/dashboard')}>
            <Text style={[styles.backText, { color: teamText }]}>← Back</Text>
          </TouchableOpacity>
          {isCommissioner && (
            <TouchableOpacity
              style={[styles.commBadge, { backgroundColor: teamPrimary + '22', borderColor: teamPrimary, flexDirection: 'row', alignItems: 'center', gap: 4 }]}
              onPress={() => router.push({ pathname: '/screens/league-settings', params: { leagueId } })}
            >
              <Text style={[styles.commBadgeText, { color: teamText }]}>⚙️ Settings</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.leagueNameRow}>
          {myTeam?.abbreviation && (
            <Image
              source={{ uri: getTeamLogoUrl(myTeam.abbreviation, league.era) }}
              style={styles.leagueNameLogo}
              resizeMode='contain'
            />
          )}
          <Text style={[styles.leagueName, teamAbbr && { color: '#ffffff' }]}>{league.name}</Text>
        </View>
        <View style={styles.leagueMeta}>
          <View style={styles.sportChip}>
            <Text style={styles.sportChipText}>{league.sport?.toUpperCase()}</Text>
          </View>
          <Text style={styles.metaText}>{league.mode} mode</Text>
          <View style={styles.metaBtns}>
            <TouchableOpacity
              style={[styles.membersTabBtn, { backgroundColor: teamPrimary + '22', borderColor: teamPrimary + '88' }]}
              onPress={() => router.push({ pathname: '/screens/league-members', params: { leagueId } })}
            >
              <Text style={[styles.membersTabBtnText, { color: teamText }]}>👥 Members ({members.length})</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.findGMsBtn, { backgroundColor: teamPrimary + '22', borderColor: teamPrimary + '88' }]}
              onPress={() => router.push({ pathname: '/screens/invite-members', params: { leagueId, leagueName: league.name } })}
            >
              <Text style={[styles.findGMsBtnText, { color: teamText }]}>🔍 Find GMs</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Channels — front and center */}
        <TouchableOpacity style={[styles.channelsTab, { borderColor: teamPrimary + '44', backgroundColor: teamPrimary + '11' }]} onPress={goToChannels}>
          <View style={styles.channelsTabLeft}>
            <Text style={styles.channelsTabIcon}>{channelIcon}</Text>
            <View>
              <Text style={styles.channelsTabLabel}>{channelLabel}</Text>
              <Text style={styles.channelsTabSub}>League Chat · Trade Center · Polls · and more</Text>
            </View>
          </View>
          <Text style={styles.channelsTabChevron}>›</Text>
        </TouchableOpacity>

        {/* My Team or Pick Team */}
        {myTeam ? (
          <View style={[styles.myTeamCard, { borderColor: teamPrimary + "88", backgroundColor: teamPrimary + "11" }]}>
            <View style={styles.myTeamCardHeader}>
              <View>
                <Text style={[styles.myTeamCardLabel, { color: teamText }]}>My Team</Text>
                <Text style={[styles.myTeamCardName, { color: teamSecondary }]}>{myTeam.name}</Text>
                <Text style={styles.myTeamCardSub}>{myTeam.abbreviation} · {myTeam.players?.length || 0} players</Text>
              </View>
              <TouchableOpacity
                style={[styles.rosterBtn, { backgroundColor: teamPrimary }]}
                onPress={() => router.push({
                  pathname: '/screens/roster',
                  params: { leagueId, sport: SPORT_KEY[league.sport] || league.sport, teamId: myTeam.id || '', era: league.era || 'current' },
                })}
              >
                <Text style={styles.rosterBtnText}>Roster</Text>
              </TouchableOpacity>
            </View>
            {myTeam.players?.length > 0 && (
              <View style={styles.myTeamPlayers}>
                {myTeam.players.slice(0, 3).map((p: any) => (
                  <View key={p.player_id} style={styles.myTeamPlayerRow}>
                    <Text style={[styles.myTeamPlayerPos, { color: teamText }]}>{p.position}</Text>
                    <Text style={styles.myTeamPlayerName}>{p.full_name}</Text>
                    <Text style={styles.myTeamPlayerJersey}>#{p.jersey_number}</Text>
                  </View>
                ))}
                {myTeam.players.length > 3 && (
                  <Text style={styles.myTeamMorePlayers}>+{myTeam.players.length - 3} more players</Text>
                )}
              </View>
            )}
          </View>
        ) : (
          <TouchableOpacity
            style={styles.pickTeamBtn}
            onPress={() => router.push({
              pathname: '/screens/team-select',
              params: { leagueId, sport: league.sport, era: league.era || '', mode: league.mode },
            })}
          >
            <Text style={styles.pickTeamBtnIcon}>🏆</Text>
            <View>
              <Text style={styles.pickTeamBtnText}>Pick Your Team</Text>
              <Text style={styles.pickTeamBtnSub}>Choose your team to get started</Text>
            </View>
            <Text style={styles.pickTeamChevron}>›</Text>
          </TouchableOpacity>
        )}

        {/* League Activity Carousel */}
        <View style={styles.activityCarouselHeader}>
          <Text style={styles.sectionTitle}>League Activity</Text>
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

        {/* Commissioner Controls */}
        {isCommissioner && (
          <View style={styles.commSection}>
            <Text style={styles.sectionTitle}>Commissioner Controls</Text>
            <TouchableOpacity
              style={[styles.inviteBtn, { backgroundColor: teamPrimary + '22', borderColor: teamPrimary + '88' }]}
              onPress={() => router.push({ pathname: '/screens/invite-members', params: { leagueId, leagueName: league.name } })}
            >
              <Text style={[styles.inviteBtnText, { color: teamText }]}>📨 Send League Invite</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.inviteBtn, { backgroundColor: teamPrimary + '22', borderColor: teamPrimary + '88' }]}
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
              style={[styles.advanceSeasonBtn, { backgroundColor: teamPrimary + '22', borderColor: teamPrimary }]}
              onPress={() => router.push({ pathname: '/screens/advance-season', params: { leagueId } })}
            >
              <Text style={[styles.advanceSeasonBtnText, { color: teamText }]}>⏩ Advance Season</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.deleteBtn, { marginTop: 10 }]} onPress={confirmDelete}>
              <Text style={styles.deleteBtnText}>Delete League</Text>
            </TouchableOpacity>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  loadingContainer: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' },
  inner: { padding: 24, paddingTop: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
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
  channelsTab: { backgroundColor: '#0a1a2a', borderRadius: 16, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: '#1a3a5a', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  channelsTabLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  channelsTabIcon: { fontSize: 32 },
  channelsTabLabel: { fontSize: 18, fontWeight: '800', color: '#ffffff', marginBottom: 3 },
  channelsTabSub: { fontSize: 12, color: '#4a7a9a' },
  channelsTabChevron: { color: '#4a7a9a', fontSize: 28, fontWeight: '300' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 32 },
  myTeamCard: { borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1 },
  myTeamCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  myTeamCardLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
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
  inviteBtn: { display: 'none' },
  findGMsBtn: { borderRadius: 10, paddingVertical: 6, paddingHorizontal: 12, alignItems: 'center', borderWidth: 1, marginLeft: 'auto' },
  findGMsBtnText: { fontSize: 12, fontWeight: '700' },
  inviteBtnText: { color: '#8888ff', fontSize: 14, fontWeight: '700' },
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
  commSection: { marginBottom: 16 },
  inviteBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, marginBottom: 10 },
  inviteBtnText: { fontSize: 15, fontWeight: '700' },
  advanceSeasonBtn: { backgroundColor: '#0a2a1a', borderRadius: 12, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: '#00ff87', marginBottom: 0 },
  advanceSeasonBtnText: { color: '#00ff87', fontSize: 15, fontWeight: '700' },
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
