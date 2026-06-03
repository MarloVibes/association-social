import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore';
import { auth, db } from '@/constants/firebase';
import GlobalNav from '@/components/GlobalNav';

export default function LeagueActivityScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const [activity, setActivity] = useState<any[]>([]);
  const [league, setLeague] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!leagueId) return;
    const load = async () => {
      const lSnap = await getDoc(doc(db, 'leagues', leagueId));
      if (lSnap.exists()) setLeague({ id: lSnap.id, ...lSnap.data() });

      const q = query(collection(db, 'leagues', leagueId, 'activity'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setActivity(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    };
    load();
  }, [leagueId]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size='large' color='#00ff87' />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 90 }}>
        <View style={styles.inner}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>League Activity</Text>
            <View style={{ width: 60 }} />
          </View>

          {activity.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No activity yet.</Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {activity.map((item: any) => {
                const typeIcon = item.type === 'pickup' || item.type === 'sign' ? '✍️' :
                  item.type === 'drop' ? '❌' :
                  item.type === 'tradeblock' ? '🔄' :
                  item.type === 'trade_listing' ? '💰' :
                  item.type === 'join' ? '👋' :
                  item.type === 'announcement' ? '📰' :
                  item.type === 'reset_request' ? '🔁' : '📋';

                const getDeepLink = () => {
                  if (!league) return null;
                  if (item.type === 'trade_listing' || item.type === 'tradeblock')
                    return () => router.push({ pathname: '/screens/trade-channel', params: { leagueId, channelId: 'trade-center' } });
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
                    style={styles.card}
                    onPress={deepLink || undefined}
                    activeOpacity={deepLink ? 0.7 : 1}
                  >
                    <View style={styles.cardTop}>
                      <Text style={styles.typeIcon}>{typeIcon}</Text>
                      <View style={styles.content}>
                        <Text style={styles.message}>
                          {item.playerName ? (
                            <>
                              {item.message.split(item.playerName)[0]}
                              <Text style={styles.playerLink}>{item.playerName}</Text>
                              {item.message.split(item.playerName)[1]}
                            </>
                          ) : item.message}
                        </Text>
                        {deepLink && <Text style={styles.link}>Tap to view →</Text>}
                        <Text style={styles.time}>
                          {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : ''}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
      <GlobalNav />
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  container: { flex: 1, backgroundColor: '#000' },
  inner: { padding: 24, paddingTop: 60 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  backText: { color: '#00ff87', fontSize: 15, fontWeight: '600' },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  emptyCard: { backgroundColor: '#0a0a0a', borderRadius: 14, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#1a1a1a' },
  emptyText: { color: '#666', fontSize: 14, textAlign: 'center' },
  card: { backgroundColor: '#0a0a0a', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#1a1a1a' },
  cardTop: { flexDirection: 'row', gap: 12 },
  typeIcon: { fontSize: 22 },
  content: { flex: 1 },
  message: { color: '#ddd', fontSize: 15, lineHeight: 22 },
  playerLink: { color: '#00ff87', fontWeight: '700' },
  link: { color: '#888', fontSize: 12, marginTop: 6, fontWeight: '600' },
  time: { color: '#555', fontSize: 11, marginTop: 4 },
});
