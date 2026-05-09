import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import { auth } from '@/constants/firebase';
import GlobalNav from '@/components/GlobalNav';

const CHANNELS = [
  { id: 'league-chat', label: 'League Chat', icon: '💬', desc: 'General conversation', commOnly: false },
  { id: 'trade-center', label: 'Trade Center', icon: '🔄', desc: 'List players · Trade block · Propose deals', commOnly: false },
  { id: 'announcements', label: 'League News', icon: '📰', desc: 'Announcements from the commissioner', commOnly: false },
  { id: 'league-rules', label: 'League Rules', icon: '📋', desc: 'Official league rules', commOnly: false },  { id: 'polls', label: 'Voting Polls', icon: '🗳️', desc: 'League votes and decisions', commOnly: false },
  { id: 'ban-list', label: 'Gamertag Ban List', icon: '🚫', desc: 'Banned players and accounts', commOnly: false },
  { id: 'reset-requests', label: 'Game Reset Requests', icon: '🔁', desc: 'Request game resets', commOnly: false },
  { id: 'highlights', label: 'Highlights & Box Scores', icon: '🎬', desc: 'Share clips and game results', commOnly: false },
];

export default function ChannelsScreen() {
  const { leagueId, leagueName, sport, commissionerId, coCommissioners } = useLocalSearchParams<{
    leagueId: string;
    sport: string;
    leagueName: string;
    commissionerId: string;
    coCommissioners: string;
  }>();

  const user = auth.currentUser;
  const coComms: string[] = coCommissioners ? JSON.parse(coCommissioners) : [];
  const isCommOrCoComm = user?.uid === commissionerId || coComms.includes(user?.uid || '');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>{sport === 'nba' ? 'Inside the NBA' : sport === 'madden' ? 'Inside the NFL' : sport === 'mlb' ? 'Inside MLB' : 'Channels'}</Text>
          <Text style={styles.subtitle}>{leagueName}</Text>
        </View>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {CHANNELS.map(channel => {
          const isLocked = channel.id === 'announcements' && !isCommOrCoComm;
          return (
            <TouchableOpacity
              key={channel.id}
              style={[styles.channelCard, isLocked && styles.channelCardLocked]}
              onPress={() => {
                if (isLocked) return;
                if (channel.id === 'trade-center' || channel.id === 'trade-block') {
                  router.push({
                    pathname: '/screens/trade-channel',
                    params: { leagueId, channelId: channel.id },
                  });
                } else {
                  router.push({
                    pathname: '/screens/channel',
                    params: {
                      leagueId,
                      leagueName,
                      channelId: channel.id,
                      channelLabel: channel.label,
                      channelIcon: channel.icon,
                      commissionerId,
                      coCommissioners,
                    },
                  });
                }
              }}
            >
              <View style={styles.channelIcon}>
                <Text style={styles.channelIconText}>{channel.icon}</Text>
              </View>
              <View style={styles.channelInfo}>
                <View style={styles.channelTitleRow}>
                  <Text style={[styles.channelLabel, isLocked && styles.channelLabelLocked]}>
                    {channel.label}
                  </Text>
                  {channel.id === 'announcements' && (
                    <View style={[styles.badge, isCommOrCoComm ? styles.badgeComm : styles.badgeRead]}>
                      <Text style={styles.badgeText}>{isCommOrCoComm ? 'Can Post' : 'Read Only'}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.channelDesc}>{channel.desc}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          );
        })}
            <GlobalNav />
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  backText: { color: '#00ff87', fontSize: 15, fontWeight: '600', width: 60 },
  headerCenter: { alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: '#ffffff' },
  subtitle: { fontSize: 12, color: '#666', marginTop: 2 },
  list: { padding: 20, gap: 10 },
  channelCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#2a2a2a', gap: 14 },
  channelCardLocked: { opacity: 0.5 },
  channelIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  channelIconText: { fontSize: 20 },
  channelInfo: { flex: 1 },
  channelTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  channelLabel: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
  channelLabelLocked: { color: '#555' },
  channelDesc: { fontSize: 13, color: '#666' },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeComm: { backgroundColor: '#0a2a1a', borderWidth: 1, borderColor: '#00ff87' },
  badgeRead: { backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#444' },
  badgeText: { fontSize: 11, color: '#00ff87', fontWeight: '600' },
  chevron: { color: '#444', fontSize: 20, fontWeight: '300' },
});
