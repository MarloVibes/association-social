import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import GlobalNav from '@/components/GlobalNav';
import { db } from '@/constants/firebase';

type ActivityFilter = 'all' | 'trades' | 'block' | 'signings' | 'league';

type ActivityItem = {
  id: string;
  type?: string;
  message?: string;
  playerName?: string;
  teamName?: string;
  createdAt?: {
    toDate?: () => Date;
  };
};

const FILTERS: { key: ActivityFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'trades', label: 'Trades' },
  { key: 'block', label: 'Block Feed' },
  { key: 'signings', label: 'Signings' },
  { key: 'league', label: 'League' },
];

const FILTER_MAP: Record<ActivityFilter, string[]> = {
  all: [],
  trades: ['trade_executed', 'trade_listing'],
  block: ['tradeblock'],
  signings: ['pickup', 'sign', 'drop'],
  league: ['join', 'announcement', 'reset_request', 'rules_updated', 'new_poll', 'ban_added'],
};

function activityMeta(type?: string) {
  if (type === 'trade_executed') return { label: 'Trade', icon: 'swap-horizontal', color: '#00e58b' };
  if (type === 'trade_listing') return { label: 'Trade Center', icon: 'pricetag', color: '#f4c542' };
  if (type === 'tradeblock') return { label: 'Block Feed', icon: 'briefcase', color: '#4aa3ff' };
  if (type === 'pickup' || type === 'sign') return { label: 'Signing', icon: 'create', color: '#00e58b' };
  if (type === 'drop') return { label: 'Release', icon: 'remove-circle', color: '#ff6b6b' };
  if (type === 'announcement') return { label: 'News', icon: 'newspaper', color: '#f4c542' };
  if (type === 'reset_request') return { label: 'Reset', icon: 'refresh', color: '#ff8c42' };
  if (type === 'new_poll') return { label: 'Poll', icon: 'bar-chart', color: '#9f7aea' };
  if (type === 'ban_added') return { label: 'Safety', icon: 'shield-checkmark', color: '#ff6b6b' };
  if (type === 'join') return { label: 'Member', icon: 'person-add', color: '#00e58b' };
  return { label: 'Report', icon: 'document-text', color: '#888' };
}

function formatActivityDate(item: ActivityItem) {
  const date = item.createdAt?.toDate?.();
  if (!date) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function cleanMessage(message: string) {
  return message.replace(/^[^A-Za-z0-9$@]+/, '').trim();
}

function highlightPlayer(message: string, playerName?: string) {
  if (!playerName || !message.includes(playerName)) return message;
  const [before, after] = message.split(playerName);
  return (
    <>
      {before}
      <Text style={styles.playerLink}>{playerName}</Text>
      {after}
    </>
  );
}

export default function LeagueActivityScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [league, setLeague] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const loadActivity = async () => {
    if (!leagueId) return;
    const q = query(collection(db, 'leagues', leagueId, 'activity'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    setActivity(snap.docs.map(d => ({ id: d.id, ...d.data() } as ActivityItem)));
  };

  const onRefresh = async () => {
    if (!leagueId) return;
    setRefreshing(true);
    try {
      await loadActivity();
    } catch (e) {
      console.error(e);
    }
    setRefreshing(false);
  };

  const filteredActivity = useMemo(() => {
    if (filter === 'all') return activity;
    return activity.filter(item => FILTER_MAP[filter].includes(String(item.type || '')));
  }, [activity, filter]);

  const totals = useMemo(() => ({
    all: activity.length,
    trades: activity.filter(item => FILTER_MAP.trades.includes(String(item.type || ''))).length,
    signings: activity.filter(item => FILTER_MAP.signings.includes(String(item.type || ''))).length,
  }), [activity]);

  useEffect(() => {
    if (!leagueId) return;
    const load = async () => {
      try {
        const lSnap = await getDoc(doc(db, 'leagues', leagueId));
        if (lSnap.exists()) setLeague({ id: lSnap.id, ...lSnap.data() });
        await loadActivity();
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    };
    load();
  }, [leagueId]);

  const getDeepLink = (item: ActivityItem) => {
    if (!league) return null;
    if (item.type === 'trade_listing' || item.type === 'tradeblock') {
      return () => router.push({ pathname: '/screens/trade-channel', params: { leagueId, channelId: 'trade-center' } });
    }
    if (item.type === 'announcement') {
      return () => router.push({
        pathname: '/screens/channel',
        params: {
          leagueId,
          leagueName: league.name,
          channelId: 'announcements',
          channelLabel: 'League News',
          channelIcon: 'News',
          commissionerId: league.commissionerId,
          coCommissioners: JSON.stringify(league.coCommissioners || []),
        },
      });
    }
    if (item.type === 'reset_request') {
      return () => router.push({
        pathname: '/screens/channel',
        params: {
          leagueId,
          leagueName: league.name,
          channelId: 'reset-requests',
          channelLabel: 'Game Resets',
          channelIcon: 'Reset',
          commissionerId: league.commissionerId,
          coCommissioners: JSON.stringify(league.coCommissioners || []),
        },
      });
    }
    if (item.type === 'join') {
      return () => router.push({ pathname: '/screens/league-members', params: { leagueId } });
    }
    return null;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00e58b" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.inner}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00e58b" colors={['#00e58b']} />}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons color="#ffffff" name="chevron-back" size={24} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>{league?.name || 'League'}</Text>
            <Text style={styles.title}>Activity Report</Text>
          </View>
        </View>

        <View style={styles.reportHeader}>
          <View style={styles.reportStat}>
            <Text style={styles.reportNumber}>{totals.all}</Text>
            <Text style={styles.reportLabel}>Items</Text>
          </View>
          <View style={styles.reportDivider} />
          <View style={styles.reportStat}>
            <Text style={styles.reportNumber}>{totals.trades}</Text>
            <Text style={styles.reportLabel}>Trades</Text>
          </View>
          <View style={styles.reportDivider} />
          <View style={styles.reportStat}>
            <Text style={styles.reportNumber}>{totals.signings}</Text>
            <Text style={styles.reportLabel}>Signings</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterContent}>
          {FILTERS.map(item => (
            <TouchableOpacity
              key={item.key}
              style={[styles.chip, filter === item.key && styles.chipActive]}
              onPress={() => setFilter(item.key)}
            >
              <Text style={[styles.chipText, filter === item.key && styles.chipTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {filteredActivity.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons color="#555" name="document-text-outline" size={28} />
            <Text style={styles.emptyText}>No activity yet.</Text>
          </View>
        ) : (
          <View style={styles.reportList}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, styles.typeColumn]}>Type</Text>
              <Text style={[styles.tableHeaderText, styles.newsColumn]}>News</Text>
              <Text style={[styles.tableHeaderText, styles.dateColumn]}>Date</Text>
            </View>
            {filteredActivity.map((item) => {
              const meta = activityMeta(item.type);
              const deepLink = getDeepLink(item);
              const message = cleanMessage(item.message || 'League activity updated');
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.row}
                  onPress={deepLink || undefined}
                  activeOpacity={deepLink ? 0.75 : 1}
                >
                  <View style={styles.typeColumn}>
                    <View style={[styles.iconDisc, { borderColor: meta.color + '66' }]}>
                      <Ionicons color={meta.color} name={meta.icon as any} size={17} />
                    </View>
                    <Text style={[styles.typeText, { color: meta.color }]} numberOfLines={1}>{meta.label}</Text>
                  </View>
                  <View style={styles.newsColumn}>
                    <Text style={styles.message}>{highlightPlayer(message, item.playerName)}</Text>
                    {item.teamName ? <Text style={styles.teamName}>{item.teamName}</Text> : null}
                  </View>
                  <View style={styles.dateColumn}>
                    <Text style={styles.dateText}>{formatActivityDate(item)}</Text>
                    {deepLink ? <Ionicons color="#666" name="chevron-forward" size={16} /> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
      <GlobalNav />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  container: { flex: 1, backgroundColor: '#000' },
  inner: { padding: 20, paddingTop: 58, paddingBottom: 110 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  backButton: { width: 42, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#151515' },
  headerCopy: { flex: 1 },
  eyebrow: { color: '#777', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  title: { color: '#fff', fontSize: 30, fontWeight: '900' },
  reportHeader: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: '#1f3328', backgroundColor: '#101410', paddingVertical: 16, marginBottom: 14 },
  reportStat: { flex: 1, alignItems: 'center' },
  reportNumber: { color: '#00e58b', fontSize: 24, fontWeight: '900' },
  reportLabel: { color: '#777', fontSize: 10, fontWeight: '900', textTransform: 'uppercase', marginTop: 2 },
  reportDivider: { width: 1, height: 38, backgroundColor: '#243229' },
  filterRow: { marginBottom: 14 },
  filterContent: { gap: 8, paddingRight: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: '#242424', backgroundColor: '#111' },
  chipActive: { backgroundColor: '#0a1d14', borderColor: '#00e58b66' },
  chipText: { color: '#777', fontSize: 12, fontWeight: '900' },
  chipTextActive: { color: '#00e58b' },
  emptyCard: { minHeight: 150, backgroundColor: '#101010', borderRadius: 8, padding: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#202020', gap: 8 },
  emptyText: { color: '#777', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  reportList: { borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#202020', backgroundColor: '#0b0b0b' },
  tableHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#050505', borderBottomWidth: 1, borderBottomColor: '#202020', paddingHorizontal: 12, paddingVertical: 10 },
  tableHeaderText: { color: '#777', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  row: { flexDirection: 'row', gap: 10, paddingHorizontal: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#191919', alignItems: 'center' },
  typeColumn: { width: 82 },
  newsColumn: { flex: 1, minWidth: 0 },
  dateColumn: { width: 48, alignItems: 'flex-end', justifyContent: 'center', gap: 3 },
  iconDisc: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1, backgroundColor: '#151515', marginBottom: 5 },
  typeText: { fontSize: 10, fontWeight: '900' },
  message: { color: '#e8e8e8', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  playerLink: { color: '#00e58b', fontWeight: '900' },
  teamName: { color: '#777', fontSize: 11, fontWeight: '800', marginTop: 4 },
  dateText: { color: '#777', fontSize: 10, fontWeight: '800', textAlign: 'right' },
});
