import { router, useFocusEffect } from 'expo-router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';

const SPORT_LABELS: Record<string, string> = {
  nba: 'NBA 2K',
  madden: 'Madden NFL',
  mlb: 'MLB The Show',
};

export default function DashboardScreen() {
  const [profile, setProfile] = useState<any>(null);
  const [leagues, setLeagues] = useState<any[]>([]);
  const [loadingLeagues, setLoadingLeagues] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingRequests, setPendingRequests] = useState(0);

  const loadData = useCallback(async (uid: string) => {
    const userSnap = await getDoc(doc(db, 'users', uid));
    if (!userSnap.exists()) {
      router.replace('/(tabs)/profile-setup');
      return;
    }
    const profileData = userSnap.data();
    setProfile(profileData);
    setPendingRequests((profileData.friendRequestsReceived || []).length);

    const leagueIds: string[] = profileData.leagues || [];
    if (leagueIds.length === 0) {
      setLeagues([]);
      setLoadingLeagues(false);
      return;
    }

    const leagueDocs = await Promise.all(
      leagueIds.map((id) => getDoc(doc(db, 'leagues', id)))
    );

    const leagueData = leagueDocs
      .filter((d) => d.exists())
      .map((d) => ({ id: d.id, ...d.data() }));

    setLeagues(leagueData);
    setLoadingLeagues(false);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace('/(tabs)/auth?mode=signin');
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
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut(auth);
            router.replace('/(tabs)/index');
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#00ff87"
          colors={['#00ff87']}
        />
      }
    >
      <View style={styles.inner}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.name}>{profile?.displayName || 'GM'}</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => router.push('/(tabs)/search-users')}
            >
              <Text style={styles.iconBtnText}>🔍</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconBtn, pendingRequests > 0 && styles.iconBtnAlert]}
              onPress={() => router.push('/(tabs)/friends')}
            >
              <Text style={styles.iconBtnText}>👥</Text>
              {pendingRequests > 0 && (
                <View style={styles.badgeDot}>
                  <Text style={styles.badgeDotText}>{pendingRequests}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.avatar} onPress={handleSignOut}>
              <Text style={styles.avatarText}>{profile?.displayName?.[0]?.toUpperCase() || 'G'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{leagues.length}</Text>
            <Text style={styles.statLabel}>Leagues</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{profile?.friends?.length || 0}</Text>
            <Text style={styles.statLabel}>Friends</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>Messages</Text>
          </View>
        </View>

        {/* My Leagues */}
        <Text style={styles.sectionTitle}>My Leagues</Text>

        {loadingLeagues ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color="#00ff87" />
          </View>
        ) : leagues.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>You haven't joined any leagues yet.</Text>
            <View style={styles.emptyButtons}>
              <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/(tabs)/create-league')}>
                <Text style={styles.primaryButtonText}>Create League</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('/(tabs)/join-league')}>
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
                onPress={() => router.push({ pathname: '/(tabs)/league', params: { leagueId: league.id } })}
              >
                <View style={styles.leagueCardTop}>
                  <View style={styles.leagueInfo}>
                    <Text style={styles.leagueName}>{league.name}</Text>
                    <Text style={styles.leagueSport}>{SPORT_LABELS[league.sport] || league.sport}</Text>
                  </View>
                  <View style={styles.leagueBadge}>
                    <Text style={styles.leagueBadgeText}>
                      {SPORT_LABELS[league.sport]?.split(' ')[0] || league.sport?.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <View style={styles.leagueCardBottom}>
                  <Text style={styles.leagueMeta}>
                    {league.members?.length || 1} member{league.members?.length !== 1 ? 's' : ''}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
            <View style={styles.addLeagueRow}>
              <TouchableOpacity style={styles.addButton} onPress={() => router.push('/(tabs)/create-league')}>
                <Text style={styles.addButtonText}>+ Create Another</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addButton} onPress={() => router.push('/(tabs)/join-league')}>
                <Text style={styles.addButtonText}>+ Join Another</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>Recent Activity</Text>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No activity yet. Join a league to get started!</Text>
        </View>

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  inner: { padding: 24, paddingTop: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
  greeting: { fontSize: 14, color: '#888888', marginBottom: 4 },
  name: { fontSize: 24, fontWeight: '800', color: '#ffffff' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  iconBtnAlert: { borderColor: '#ff4444' },
  iconBtnText: { fontSize: 16 },
  badgeDot: { position: 'absolute', top: -4, right: -4, backgroundColor: '#ff4444', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeDotText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1a1a1a', borderWidth: 2, borderColor: '#00ff87', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '700', color: '#00ff87' },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 32 },
  statCard: { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a2a' },
  statNumber: { fontSize: 24, fontWeight: '800', color: '#00ff87', marginBottom: 4 },
  statLabel: { fontSize: 12, color: '#888888' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#ffffff', marginBottom: 16 },
  loadingCard: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 32, marginBottom: 24, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a2a' },
  emptyCard: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: '#2a2a2a' },
  emptyText: { color: '#888888', fontSize: 14, marginBottom: 16, textAlign: 'center' },
  emptyButtons: { flexDirection: 'row', gap: 12 },
  primaryButton: { flex: 1, backgroundColor: '#00ff87', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryButtonText: { color: '#000000', fontSize: 14, fontWeight: '700' },
  secondaryButton: { flex: 1, backgroundColor: '#0a0a0a', borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#333333' },
  secondaryButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  leagueCard: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#2a2a2a' },
  leagueCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  leagueInfo: { flex: 1 },
  leagueName: { fontSize: 17, fontWeight: '700', color: '#ffffff', marginBottom: 4 },
  leagueSport: { fontSize: 13, color: '#888888' },
  leagueBadge: { backgroundColor: '#0a2a1a', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#00ff87' },
  leagueBadgeText: { color: '#00ff87', fontSize: 12, fontWeight: '600' },
  leagueCardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  leagueMeta: { fontSize: 13, color: '#666666' },
  addLeagueRow: { flexDirection: 'row', gap: 12, marginBottom: 32 },
  addButton: { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a2a' },
  addButtonText: { color: '#00ff87', fontSize: 14, fontWeight: '600' },
});
