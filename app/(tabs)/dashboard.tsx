import { router, useFocusEffect } from 'expo-router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';
import { getTeamColors, getTeamLogoUrl, getCurrentTeamAbbr } from '@/constants/teamColors';
import GlobalNav from '@/components/GlobalNav';

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
  const [profile, setProfile] = useState<any>(null);
  const [leagues, setLeagues] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [loadingLeagues, setLoadingLeagues] = useState(true);
  const signingOut = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [pendingInvites, setPendingInvites] = useState(0);

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

  return (
    <View style={styles.wrapper}>
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor='#00ff87' colors={['#00ff87']} />}
      >
        <View style={styles.inner}>
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
                    <Text style={styles.leagueCardEmoji}>{SPORT_EMOJI[league.sport] || '🏆'}</Text>
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

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
          </View>

          {recentActivity.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No activity yet. Join a league and pick up some players!</Text>
            </View>
          ) : (
            <View style={styles.activityFeed}>
              {recentActivity.map((item) => (
                <TouchableOpacity
                  key={item.leagueId + item.id}
                  style={styles.activityItem}
                  onPress={() => router.push({ pathname: '/screens/league', params: { leagueId: item.leagueId } })}
                >
                  <View style={[styles.activityDot, item.type === 'tradeblock' && styles.activityDotTrade]} />
                  <View style={styles.activityContent}>
                    <Text style={styles.activityMessage}>{item.message}</Text>
                    <View style={styles.activityMeta}>
                      <Text style={styles.activityLeague}>{SPORT_EMOJI[item.sport] || '🏆'} {item.leagueName}</Text>
                      <Text style={styles.activityTime}>{formatTime(item.createdAt)}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
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
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#ffffff' },
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