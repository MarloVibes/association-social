import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { arrayRemove, collection, doc, getDoc, getDocs, orderBy, query, updateDoc } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';
import LeagueAvatar from '@/components/LeagueAvatar';
import { getTeamColors, getTeamLogoUrl, getCurrentTeamAbbr } from '@/constants/teamColors';
import GlobalNav from '@/components/GlobalNav';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { usePresence } from '@/hooks/usePresence';
import { addLeagueMemberIfSpace } from '@/utils/leagueMembership';

const SPORT_LABELS: Record<string, string> = {
  nba: 'NBA 2K',
  madden: 'Madden NFL',
  mlb: 'MLB The Show',
};

const SPORT_EMOJI: Record<string, string> = {
  nba: '🏀',
  madden: '🏈',
  mlb: '⚾',
};

export default function DashboardScreen() {
  usePushNotifications();
  usePresence();

  const [profile, setProfile] = useState<any>(null);
  const [leagues, setLeagues] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [loadingLeagues, setLoadingLeagues] = useState(true);
  const signingOut = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [pendingInvites, setPendingInvites] = useState(0);
  const [leagueInvites, setLeagueInvites] = useState<any[]>([]);
  const [onlineFriends, setOnlineFriends] = useState<any[]>([]);

  const loadData = useCallback(async (uid: string) => {
    try {
      const userSnap = await getDoc(doc(db, 'users', uid));
      if (!userSnap.exists()) {
        router.replace('/(tabs)/profile-setup');
        return;
      }
      const profileData = userSnap.data();
      setProfile(profileData);
      setPendingRequests((profileData.friendRequestsReceived || []).length);
      // Count all unread notifications
      const allNotifs = profileData.notifications || [];
      const unreadCount = allNotifs.filter((n: any) => !n.read).length;
      const leagueInviteCount = (profileData.leagueInvites || []).length;
      setLeagueInvites(profileData.leagueInvites || []);

      // Fetch online friends (lastActive within 5 minutes)
      const friendUids: string[] = profileData.friends || [];
      if (friendUids.length > 0) {
        const fiveMinAgo = Date.now() - 5 * 60 * 1000;
        const online: any[] = [];
        // Firestore 'in' query supports max 10, so batch if needed
        for (let i = 0; i < friendUids.length; i += 10) {
          const batch = friendUids.slice(i, i + 10);
          try {
            const friendDocs = await Promise.all(
              batch.map(uid => getDoc(doc(db, 'users', uid)))
            );
            for (const fdoc of friendDocs) {
              if (!fdoc.exists()) continue;
              const fdata = fdoc.data();
              const lastActive = fdata.lastActive?.toMillis?.();
              if (lastActive && lastActive > fiveMinAgo) {
                online.push({ uid: fdoc.id, displayName: fdata.displayName, username: fdata.username, photoUrl: fdata.photoUrl || null });
              }
            }
          } catch {}
        }
        setOnlineFriends(online);
      } else {
        setOnlineFriends([]);
      }
      setPendingInvites(unreadCount + leagueInviteCount);

      const leagueIds: string[] = profileData.leagues || [];
      if (leagueIds.length === 0) {
        setLeagues([]);
        setRecentActivity([]);
        setLoadingLeagues(false);
        return;
      }

      const leagueDocs = await Promise.all(
        leagueIds.map((id: string) => getDoc(doc(db, 'leagues', id)))
      );

      const leagueData = leagueDocs
        .filter((d) => d.exists())
        .map((d) => { return { id: d.id, ...d.data() }; });

      setLeagues(leagueData);

      const allActivity: any[] = [];
      await Promise.all(
        leagueData.map(async (league: any) => {
          try {
            const actSnap = await getDocs(
              query(
                collection(db, 'leagues', league.id, 'activity'),
                orderBy('createdAt', 'desc')
              )
            );
            actSnap.docs.slice(0, 5).forEach((d) => {
              allActivity.push({
                id: d.id,
                leagueId: league.id,
                leagueName: league.name,
                sport: league.sport,
                ...d.data(),
              });
            });
          } catch (e) {}
        })
      );

      allActivity.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setRecentActivity(allActivity.slice(0, 10));
      setLoadingLeagues(false);
    } catch (e) {
      console.error(e);
      setLoadingLeagues(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace('/');
        return;
      }
      await loadData(user.uid);
    });
    return () => unsubscribe();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      const user = auth.currentUser;
      if (user) {
        setLoadingLeagues(true);
        loadData(user.uid);
      }
    }, [loadData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const user = auth.currentUser;
    if (user) await loadData(user.uid);
    setRefreshing(false);
  }, [loadData]);

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => { await signOut(auth); } },
    ]);
  };

  const formatTime = (ts: any) => {
    if (!ts?.seconds) return '';
    const diff = Math.floor((Date.now() - ts.seconds * 1000) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
  };


  const handleAcceptInvite = async (invite: any) => {
    const u = auth.currentUser;
    if (!u) return;
    try {
      await addLeagueMemberIfSpace(db, invite.leagueId, u.uid, {
        leagueName: invite.leagueName,
        inviteToRemove: invite,
      });
      // Remove from league's sent_invites
      try {
        const { deleteDoc } = await import('firebase/firestore');
        await deleteDoc(doc(db, 'leagues', invite.leagueId, 'sent_invites', u.uid));
      } catch (e: any) {
        console.error('sent_invite cleanup failed:', e?.code, e?.message);
        Alert.alert('Cleanup failed', 'sent_invites: ' + (e?.code || 'unknown') + ' - ' + (e?.message || String(e)));
      }
      Alert.alert('Joined!', 'Welcome to ' + invite.leagueName);
      setLeagueInvites(prev => prev.filter(i => i.leagueId !== invite.leagueId));
      onRefresh();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleDeclineInvite = async (invite: any) => {
    const u = auth.currentUser;
    if (!u) return;
    Alert.alert('Decline Invite', 'Decline invite to ' + invite.leagueName + '?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: async () => {
          try {
            await updateDoc(doc(db, 'users', u.uid), {
              leagueInvites: arrayRemove(invite),
            });
            try {
              const { deleteDoc } = await import('firebase/firestore');
              await deleteDoc(doc(db, 'leagues', invite.leagueId, 'sent_invites', u.uid));
            } catch {}
            setLeagueInvites(prev => prev.filter(i => i.leagueId !== invite.leagueId));
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.wrapper}>
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor='#00ff87' colors={['#00ff87']} />}
      >
        <View style={styles.inner}>
          <View style={styles.titleBlock}>
            <Text style={styles.appTitle} numberOfLines={1} adjustsFontSizeToFit>Franchise Social</Text>
            <Text style={styles.appSubtitle}>Main Menu</Text>
          </View>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.push('/screens/profile')}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{profile?.displayName?.[0]?.toUpperCase() || 'G'}</Text>
              </View>
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Text style={styles.greeting}>Welcome back,</Text>
              <Text style={styles.name}>{profile?.displayName || 'GM'}</Text>
            </View>
            <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
              <Text style={styles.signOutText}>⏻</Text>
            </TouchableOpacity>
          </View>

          {profile?.gamerTag ? (
            <View style={styles.gmCard}>
              <View style={styles.gmCardLeft}>
                <Text style={styles.gmCardTag}>{profile.gamerTag}</Text>
                <Text style={styles.gmCardMeta}>{[profile.console, profile.favSport].filter(Boolean).join('  ·  ')}</Text>
              </View>
              <TouchableOpacity style={styles.findGMsBtn} onPress={() => router.push('/screens/search-users')}>
                <Text style={styles.findGMsBtnText}>Find GMs</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <TouchableOpacity
            onPress={() => router.push('/screens/my-mvp')}
            activeOpacity={0.85}
            style={styles.mvpButtonShadow}
          >
            <LinearGradient
              colors={['#facc15', '#f59e0b', '#b45309']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.mvpButton}
            >
              <LinearGradient
                colors={['rgba(255,255,255,0.25)', 'rgba(255,255,255,0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 0.6 }}
                style={styles.mvpButtonGloss}
                pointerEvents='none'
              />
              <Text style={styles.mvpButtonStar}>⭐</Text>
              <View style={styles.mvpButtonInfo}>
                <Text style={styles.mvpButtonTitle}>MY MVP</Text>
                <Text style={styles.mvpButtonDesc}>Your players, your stats, your team</Text>
              </View>
              <Text style={styles.mvpButtonStar}>⭐</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => Alert.alert('Coming soon', 'Mini Games are on the way — sim seasons, draft, and win rings. Check back soon!')}
            activeOpacity={0.85}
            style={styles.miniGameShadow}
          >
            <LinearGradient
              colors={['#99331a', '#6b1d0a']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.miniGameCard}
            >
              <LinearGradient
                colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 0.6 }}
                style={styles.miniGameGloss}
                pointerEvents='none'
              />
              <Text style={styles.miniGameIcon}>🎮</Text>
              <View style={styles.miniGameInfo}>
                <Text style={styles.miniGameTitle}>MINI GAME</Text>
                <Text style={styles.miniGameDesc}>Sim seasons, draft, win rings — earn your card</Text>
              </View>
              <View style={styles.miniGameBadge}><Text style={styles.miniGameBadgeText}>COMING SOON</Text></View>
            </LinearGradient>
          </TouchableOpacity>

          {onlineFriends.length > 0 && (
            <View style={styles.onlineSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>🟢 Online Now</Text>
                <Text style={styles.onlineCount}>{onlineFriends.length}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 4 }}>
                {onlineFriends.map((f: any) => (
                  <TouchableOpacity
                    key={f.uid}
                    style={styles.onlineFriendCard}
                    onPress={() => router.push({ pathname: '/screens/profile', params: { uid: f.uid } })}
                  >
                    <View style={styles.onlineAvatarWrap}>
                      <View style={styles.onlineAvatar}>
                        <Text style={styles.onlineAvatarText}>{(f.displayName || '?')[0].toUpperCase()}</Text>
                      </View>
                      <View style={styles.onlineDot} />
                    </View>
                    <Text style={styles.onlineName} numberOfLines={1}>{f.displayName || f.username || 'GM'}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>My Leagues</Text>
            <TouchableOpacity onPress={() => router.push('/screens/create-league')}>
              <Text style={styles.sectionAction}>+ Create</Text>
            </TouchableOpacity>
          </View>

          {loadingLeagues ? (
            <View style={styles.loadingCard}><ActivityIndicator color='#00ff87' /></View>
          ) : leagues.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>You haven't joined any leagues yet.</Text>
              <View style={styles.emptyButtons}>
                <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/screens/create-league')}>
                  <Text style={styles.primaryButtonText}>Create League</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('/screens/join-league')}>
                  <Text style={styles.secondaryButtonText}>Join League</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              {leagues.map((league) => (
                <TouchableOpacity
                  key={league.id}
                  style={styles.leagueCard}
                  onPress={() => router.push({ pathname: '/screens/league', params: { leagueId: league.id } })}
                >
                  <View style={styles.leagueCardLeft}>
                    <LeagueAvatar
                      photoUrl={league.photoUrl}
                      leagueName={league.name}
                      size={48}
                      fallbackEmoji={SPORT_EMOJI[league.sport] || '🏆'}
                    />
                  </View>
                  <View style={styles.leagueInfo}>
                    <Text style={styles.leagueName}>{league.name}</Text>
                    <Text style={styles.leagueSport}>{SPORT_LABELS[league.sport] || league.sport} · {league.members?.length || 1} member{league.members?.length !== 1 ? 's' : ''}</Text>
                  </View>
                  <Text style={styles.leagueChevron}>›</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.joinAnotherBtn} onPress={() => router.push('/screens/join-league')}>
                <Text style={styles.joinAnotherText}>+ Join Another League</Text>
              </TouchableOpacity>
            </>
          )}


          <View style={{ height: 20 }} />
        </View>
      </ScrollView>
      <GlobalNav pendingRequests={pendingRequests} pendingInvites={pendingInvites} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#0a0a0a' },
  container: { flex: 1 },
  inner: { padding: 20, paddingTop: 60 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, gap: 10 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#1a1a1a', borderWidth: 2, borderColor: '#00ff87', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '700', color: '#00ff87' },
  headerCenter: { flex: 1 },
  titleBlock: { alignItems: 'center', marginBottom: 20 },
  appTitle: { color: '#00ff87', fontSize: 22, fontWeight: '800', letterSpacing: 0, textAlign: 'center' },
  appSubtitle: { color: '#666', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 },
  greeting: { fontSize: 12, color: '#888888' },
  name: { fontSize: 18, fontWeight: '800', color: '#ffffff' },
  signOutBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  signOutText: { fontSize: 16, color: '#666' },
  gmCard: { backgroundColor: '#0a1a0a', borderRadius: 14, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: '#1a3a1a', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gmCardLeft: { flex: 1 },
  gmCardTag: { fontSize: 16, fontWeight: '700', color: '#00ff87', marginBottom: 2 },
  gmCardMeta: { fontSize: 13, color: '#4a8a4a' },
  findGMsBtn: { backgroundColor: '#1a3a1a', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#00ff87' },
  findGMsBtnText: { color: '#00ff87', fontSize: 13, fontWeight: '600' },
  mvpButtonShadow: {
    marginBottom: 20,
    borderRadius: 16,
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 10,
  },
  miniGameShadow: {
    marginBottom: 20,
    borderRadius: 16,
    shadowColor: '#99331a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  miniGameCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  miniGameGloss: { position: 'absolute', top: 0, left: 0, right: 0, height: '60%', borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  miniGameIcon: { fontSize: 30, marginRight: 14 },
  miniGameInfo: { flex: 1 },
  miniGameTitle: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 2, marginBottom: 2 },
  miniGameDesc: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '500' },
  miniGameBadge: { backgroundColor: 'rgba(0,0,0,0.4)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  miniGameBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  mvpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 18,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#fde68a',
    overflow: 'hidden',
  },
  mvpButtonGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '60%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  mvpButtonStar: { fontSize: 24 },
  mvpButtonInfo: { flex: 1, alignItems: 'center', marginHorizontal: 12 },
  mvpButtonTitle: { color: '#000', fontSize: 22, fontWeight: '900', letterSpacing: 4, marginBottom: 2 },
  mvpButtonDesc: { color: 'rgba(0,0,0,0.7)', fontSize: 12, fontWeight: '600' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#ffffff' },
  invitesSection: { marginBottom: 24 },
  invitesCount: { color: '#00ff87', fontSize: 14, fontWeight: '700' },
  inviteCard: { backgroundColor: '#0a1a0a', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#1a3a1a', marginBottom: 10 },
  inviteInfo: { marginBottom: 12 },
  inviteLeagueName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  inviteFrom: { color: '#888', fontSize: 13, marginTop: 2 },
  inviteBtnRow: { flexDirection: 'row', gap: 10 },
  inviteAcceptBtn: { flex: 1, backgroundColor: '#00ff87', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  inviteAcceptText: { color: '#000', fontWeight: '700', fontSize: 14 },
  inviteDeclineBtn: { flex: 1, backgroundColor: '#1a1a1a', paddingVertical: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a2a' },
  inviteDeclineText: { color: '#888', fontWeight: '600', fontSize: 14 },
  onlineSection: { marginBottom: 24 },
  onlineCount: { color: '#00ff87', fontSize: 14, fontWeight: '700' },
  onlineFriendCard: { alignItems: 'center', width: 70 },
  onlineAvatarWrap: { position: 'relative' },
  onlineAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#00ff87' },
  onlineAvatarText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  onlineDot: { position: 'absolute', bottom: 0, right: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: '#00ff87', borderWidth: 2, borderColor: '#000' },
  onlineName: { color: '#ccc', fontSize: 11, marginTop: 6, fontWeight: '600', textAlign: 'center' },
  sectionAction: { color: '#00ff87', fontSize: 14, fontWeight: '600' },
  loadingCard: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 32, marginBottom: 24, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a2a' },
  emptyCard: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: '#2a2a2a' },
  emptyText: { color: '#888888', fontSize: 14, marginBottom: 16, textAlign: 'center' },
  emptyButtons: { flexDirection: 'row', gap: 12 },
  primaryButton: { flex: 1, backgroundColor: '#00ff87', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryButtonText: { color: '#000000', fontSize: 14, fontWeight: '700' },
  secondaryButton: { flex: 1, backgroundColor: '#0a0a0a', borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#333333' },
  secondaryButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  leagueCard: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#2a2a2a', flexDirection: 'row', alignItems: 'center', gap: 12 },
  leagueCardLeft: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  leagueCardEmoji: { fontSize: 22 },
  leagueInfo: { flex: 1 },
  leagueName: { fontSize: 16, fontWeight: '700', color: '#ffffff', marginBottom: 3 },
  leagueSport: { fontSize: 12, color: '#666666' },
  leagueChevron: { color: '#444', fontSize: 22 },
  joinAnotherBtn: { backgroundColor: '#1a1a1a', borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a2a', marginBottom: 32 },
  joinAnotherText: { color: '#00ff87', fontSize: 14, fontWeight: '600' },
  activityFeed: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: '#2a2a2a', gap: 16 },
  activityItem: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  activityDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#00ff87', marginTop: 5, flexShrink: 0 },
  activityDotTrade: { backgroundColor: '#ff9900' },
  activityContent: { flex: 1 },
  activityMessage: { color: '#cccccc', fontSize: 14, lineHeight: 20, marginBottom: 4 },
  activityMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  activityLeague: { color: '#555', fontSize: 12 },
  activityTime: { color: '#444', fontSize: 12 },
});
