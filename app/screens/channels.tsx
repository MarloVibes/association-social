import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { auth, db } from '@/constants/firebase';
import GlobalNav from '@/components/GlobalNav';
import SportBackground from '@/components/channel/SportBackground';
import { channelReadKey, countUnreadChannelMessages, formatUnreadBadge } from '@/domain/channel/unread';
import { canUsePitchSensitiveControls, isPitchDemoLocked, isPitchDemoViewer } from '@/utils/pitchAccess';

type RoomAction = {
  label: string;
  desc: string;
  icon: keyof typeof Ionicons.glyphMap;
  channelIcon?: string;
  kind: 'channel' | 'route' | 'trade';
  id?: string;
  pathname?: string;
  statsMode?: 'teamPlayers' | 'leaguePlayers';
  nbaOnly?: boolean;
  commissionerOnly?: boolean;
};

type CommandRoom = {
  title: string;
  desc: string;
  accent: string;
  icon: keyof typeof Ionicons.glyphMap;
  actions: RoomAction[];
};

function insideTitle(sport?: string) {
  if (sport === 'nba') return 'Inside The NBA';
  if (sport === 'madden') return 'Inside the NFL';
  if (sport === 'mlb') return 'Inside MLB';
  return 'League Hub';
}

function franchiseLabel(sport?: string) {
  if (sport === 'nba') return 'NBA Franchise';
  if (sport === 'madden') return 'NFL Franchise';
  if (sport === 'mlb') return 'MLB Franchise';
  return 'Franchise';
}

function parseCoCommissioners(value?: string) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function commandRooms(isCommOrCoComm: boolean): CommandRoom[] {
  const rooms: CommandRoom[] = [
    {
      title: 'GM Lounge',
      desc: 'GM conversation, votes, rules, reset requests, and moderation tools.',
      accent: '#4ea1ff',
      icon: 'people-outline',
      actions: [
        { label: 'League Chat', desc: 'Open GM conversation', icon: 'chatbubbles-outline', channelIcon: 'Chat', kind: 'channel', id: 'league-chat' },
        { label: 'Voting Polls', desc: 'League votes and commissioner decisions', icon: 'checkbox-outline', channelIcon: 'Poll', kind: 'channel', id: 'polls' },
        { label: 'Game Resets', desc: 'Request and review game reset cases', icon: 'refresh-outline', channelIcon: 'Reset', kind: 'channel', id: 'reset-requests' },
        { label: 'League Rules', desc: 'Official rulebook', icon: 'document-text-outline', channelIcon: 'Rules', kind: 'channel', id: 'league-rules' },
        { label: 'Ban List', desc: 'Gamertag moderation board', icon: 'shield-outline', channelIcon: 'Ban', kind: 'channel', id: 'ban-list' },
      ],
    },
    {
      title: 'Trade Center',
      desc: 'Manage your team board, scan the block feed, and build trade rooms.',
      accent: '#ff8a3d',
      icon: 'swap-horizontal-outline',
      actions: [
        { label: 'Trade Desk', desc: 'My Team, Block Feed, and Trade tools', icon: 'swap-horizontal-outline', kind: 'trade', id: 'trade-center' },
        { label: 'League Rosters', desc: 'Browse every team by roster strength', icon: 'list-outline', kind: 'route', pathname: '/screens/league-rosters' },
        { label: 'Salary Tools', desc: 'Commissioner salary overrides', icon: 'cash-outline', kind: 'route', pathname: '/screens/salary-overrides', commissionerOnly: true },
      ],
    },
    {
      title: 'League News',
      desc: 'Announcements, award reveals, activity, and league-wide stories.',
      accent: '#f4c542',
      icon: 'newspaper-outline',
      actions: [
        { label: 'News Board', desc: 'Commissioner posts and league updates', icon: 'megaphone-outline', channelIcon: 'News', kind: 'channel', id: 'announcements' },
        { label: 'Activity Report', desc: 'Moves, claims, resets, and league events', icon: 'receipt-outline', kind: 'route', pathname: '/screens/league-activity' },
        { label: 'Awards', desc: 'Trophy case and season honors', icon: 'trophy-outline', kind: 'route', pathname: '/screens/season/awards' },
      ],
    },
    {
      title: 'Front Office',
      desc: 'Contracts, draft class, free agency, and offseason control.',
      accent: '#d7b56d',
      icon: 'briefcase-outline',
      actions: [
        { label: 'Offseason HQ', desc: 'Timed offseason stages and readiness', icon: 'calendar-number-outline', kind: 'route', pathname: '/screens/offseason' },
        { label: 'Finances', desc: 'Payroll, cap room, and player contracts', icon: 'wallet-outline', kind: 'route', pathname: '/screens/season/finances' },
        { label: 'Draft Class', desc: 'Upcoming prospects and draft board', icon: 'school-outline', kind: 'route', pathname: '/screens/offseason/draft-class' },
        { label: 'Re-Signing', desc: 'Keep your own free agents', icon: 'create-outline', kind: 'route', pathname: '/screens/offseason/re-signing' },
        { label: 'Free Agency', desc: 'Open-market contract offers', icon: 'person-add-outline', kind: 'route', pathname: '/screens/offseason/free-agency' },
      ],
    },
    {
      title: 'Coaching Room',
      desc: 'Gameplan identity, rotations, matchup prep, and system fit.',
      accent: '#ff5f85',
      icon: 'clipboard-outline',
      actions: [
        { label: 'Coaching', desc: 'Preset styles and team strategy', icon: 'clipboard-outline', kind: 'route', pathname: '/screens/season/coaching-presets' },
        { label: 'Rotation', desc: 'Drag order and minute allocation', icon: 'reorder-three-outline', kind: 'route', pathname: '/screens/season/rotation', nbaOnly: true },
        { label: 'Development League', desc: 'Send one minimum-contract player for one-week grade training', icon: 'barbell-outline', kind: 'route', pathname: '/screens/season/development-league', nbaOnly: true },
        { label: 'Draft Room', desc: 'Live draft and pre-draft list', icon: 'timer-outline', kind: 'route', pathname: '/screens/offseason/live-draft' },
      ],
    },
    {
      title: 'Stats & Standings',
      desc: 'Calendar, standings, playoff picture, and league performance.',
      accent: '#b18cff',
      icon: 'stats-chart-outline',
      actions: [
        { label: 'Calendar', desc: 'Schedule and game access', icon: 'calendar-outline', kind: 'route', pathname: '/screens/season/calendar' },
        { label: 'Standings', desc: 'Season standings', icon: 'podium-outline', kind: 'route', pathname: '/screens/season/standings' },
        { label: 'Player Stats', desc: 'Your team player stat leaders', icon: 'people-circle-outline', kind: 'route', pathname: '/screens/season/standings', statsMode: 'teamPlayers' },
        { label: 'League Stats', desc: 'All player stat leaders across the league', icon: 'analytics-outline', kind: 'route', pathname: '/screens/season/standings', statsMode: 'leaguePlayers' },
        { label: 'Playoff Picture', desc: 'Live seeds, bracket, and postseason start', icon: 'git-branch-outline', kind: 'route', pathname: '/screens/season/playoffs' },
      ],
    },
    {
      title: 'Player Wire',
      desc: 'Player stories, injuries, scouting, upgrades, and shared game media.',
      accent: '#00e58b',
      icon: 'pulse-outline',
      actions: [
        { label: 'Highlights', desc: 'Clips, box scores, and comments', icon: 'film-outline', channelIcon: 'Media', kind: 'channel', id: 'highlights' },
        { label: 'Scouting', desc: 'Upcoming matchup reports and intel', icon: 'search-outline', kind: 'route', pathname: '/screens/season/scouting' },
        { label: 'Injuries', desc: 'League injury report', icon: 'medkit-outline', kind: 'route', pathname: '/screens/season/injuries' },
        { label: 'Upgrades', desc: 'Spend earned player upgrade points', icon: 'trending-up-outline', kind: 'route', pathname: '/screens/season/player-upgrades', nbaOnly: true },
      ],
    },
  ];
  return rooms.map(room => ({
    ...room,
    actions: room.actions.filter(action => !action.commissionerOnly || isCommOrCoComm),
  }));
}

export default function ChannelsScreen() {
  const { leagueId, leagueName, sport, commissionerId, coCommissioners } = useLocalSearchParams<{
    leagueId: string;
    sport: string;
    leagueName: string;
    commissionerId: string;
    coCommissioners: string;
  }>();

  const user = auth.currentUser;
  const [resolvedLeagueName, setResolvedLeagueName] = useState(leagueName || '');
  const [resolvedSport, setResolvedSport] = useState(sport || '');
  const [resolvedCommissionerId, setResolvedCommissionerId] = useState(commissionerId || '');
  const [resolvedCoCommissioners, setResolvedCoCommissioners] = useState<string[]>(parseCoCommissioners(coCommissioners));
  const [league, setLeague] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [activeRoomTitle, setActiveRoomTitle] = useState('GM Lounge');
  const [leagueChatMessages, setLeagueChatMessages] = useState<{ uid?: string | null; createdAtMs?: number | null }[]>([]);
  const [leagueChatLastOpenedAtMs, setLeagueChatLastOpenedAtMs] = useState<number | null>(null);
  const isCommOrCoComm = user?.uid === resolvedCommissionerId || resolvedCoCommissioners.includes(user?.uid || '');
  const pitchSensitiveControlsAllowed = canUsePitchSensitiveControls({ profile, league, uid: user?.uid });
  const pitchProtected = isPitchDemoViewer(profile) || isPitchDemoLocked(league);
  const isNba = resolvedSport === 'nba';
  const rooms = useMemo(() => commandRooms(isCommOrCoComm && pitchSensitiveControlsAllowed), [isCommOrCoComm, pitchSensitiveControlsAllowed]);
  const visibleRooms = useMemo(() => rooms
    .map(room => ({
      ...room,
      actions: room.actions.filter(action => !action.nbaOnly || isNba),
    }))
    .filter(room => room.actions.length > 0), [isNba, rooms]);
  const activeRoom = visibleRooms.find(room => room.title === activeRoomTitle) || visibleRooms[0];
  const leagueChatUnreadCount = countUnreadChannelMessages(leagueChatMessages, {
    currentUserId: user?.uid,
    lastOpenedAtMs: leagueChatLastOpenedAtMs,
  });
  const leagueChatUnreadBadge = formatUnreadBadge(leagueChatUnreadCount);

  useEffect(() => {
    let active = true;

    getDoc(doc(db, 'leagues', leagueId)).then(snapshot => {
      if (!active || !snapshot.exists()) return;
      const league = snapshot.data();
      setLeague({ id: snapshot.id, ...league });
      setResolvedLeagueName(league.name || leagueName || '');
      setResolvedSport(league.sport || '');
      setResolvedCommissionerId(league.commissionerId || commissionerId || '');
      setResolvedCoCommissioners(league.coCommissioners || []);
    }).catch(error => {
      console.warn('league load failed', error);
    });

    return () => { active = false; };
  }, [commissionerId, leagueId, leagueName]);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), snapshot => {
      setProfile(snapshot.exists() ? snapshot.data() : null);
    }, () => setProfile(null));
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    if (activeRoom && activeRoom.title !== activeRoomTitle && !visibleRooms.some(room => room.title === activeRoomTitle)) {
      setActiveRoomTitle(activeRoom.title);
    }
  }, [activeRoom, activeRoomTitle, visibleRooms]);

  useEffect(() => {
    if (!leagueId || !user?.uid) return;
    const readKey = channelReadKey(leagueId, 'league-chat');
    const unsub = onSnapshot(doc(db, 'users', user.uid), snapshot => {
      const readState = snapshot.data()?.channelReads?.[readKey];
      const lastOpenedAt = readState?.lastOpenedAt;
      setLeagueChatLastOpenedAtMs(typeof lastOpenedAt?.toMillis === 'function' ? lastOpenedAt.toMillis() : null);
    }, error => {
      console.warn('league chat read state failed', error);
    });
    return () => unsub();
  }, [leagueId, user?.uid]);

  useEffect(() => {
    if (!leagueId || !user?.uid) return;
    const leagueChatQuery = query(
      collection(db, 'leagues', leagueId, 'channels', 'league-chat', 'messages'),
      orderBy('createdAt', 'desc'),
      limit(100),
    );
    const unsub = onSnapshot(leagueChatQuery, snapshot => {
      setLeagueChatMessages(snapshot.docs.map(messageDoc => {
        const message = messageDoc.data();
        return {
          uid: message.uid || null,
          createdAtMs: typeof message.createdAt?.toMillis === 'function' ? message.createdAt.toMillis() : null,
        };
      }));
    }, error => {
      if (error.code !== 'permission-denied') console.warn('league chat unread load failed', error);
    });
    return () => unsub();
  }, [leagueId, user?.uid]);

  const openChannel = (action: RoomAction) => {
    const label = action.label === 'News Board' ? 'League News' : action.label;
    router.push({
      pathname: '/screens/channel',
      params: {
        leagueId,
        leagueName: resolvedLeagueName || leagueName,
        channelId: action.id || '',
        channelLabel: label,
        channelIcon: action.channelIcon || action.label,
        sport: resolvedSport,
        commissionerId: resolvedCommissionerId,
        coCommissioners: JSON.stringify(resolvedCoCommissioners),
      },
    });
  };

  const openAction = (action: RoomAction) => {
    if (action.kind === 'trade') {
      router.push({
        pathname: '/screens/trade-channel',
        params: { leagueId, channelId: action.id || 'trade-center', sport: resolvedSport },
      });
      return;
    }
    if (action.kind === 'channel') {
      openChannel(action);
      return;
    }
    router.push({
      pathname: action.pathname as any,
      params: { leagueId, sport: resolvedSport, mode: action.statsMode },
    });
  };

  return (
    <View style={styles.container}>
      <SportBackground sport={resolvedSport} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons color="#ffffff" name="chevron-back" size={23} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.eyebrow}>{franchiseLabel(resolvedSport)}</Text>
          <Text style={styles.title}>{insideTitle(resolvedSport)}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{resolvedLeagueName}</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 96 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.heroIcon}>
              <Ionicons color="#06130c" name="grid-outline" size={22} />
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.heroTitle}>Command Center</Text>
              <Text style={styles.heroText}>GM modules, player wire, trades, franchise tools, and season control live here.</Text>
            </View>
          </View>
          {pitchProtected ? (
            <View style={styles.pitchNotice}>
              <Text style={styles.pitchNoticeText}>Pitch demo access: private admin tools are hidden while the league remains viewable.</Text>
            </View>
          ) : null}
          <View style={styles.quickRow}>
            {[
              { label: 'Trade', icon: 'swap-horizontal-outline' as const, action: rooms.flatMap(room => room.actions).find(item => item.kind === 'trade') },
              { label: 'Calendar', icon: 'calendar-outline' as const, action: rooms.flatMap(room => room.actions).find(item => item.label === 'Calendar') },
              { label: 'GM Lounge', icon: 'people-outline' as const, action: rooms.flatMap(room => room.actions).find(item => item.label === 'League Chat'), badge: leagueChatUnreadBadge },
            ].map(item => (
              <TouchableOpacity
                key={item.label}
                disabled={!item.action || (item.action.nbaOnly && !isNba)}
                onPress={() => item.action && openAction(item.action)}
                style={[styles.quickButton, (!item.action || (item.action.nbaOnly && !isNba)) && styles.quickButtonDisabled]}
              >
                <Ionicons color="#00e58b" name={item.icon} size={16} />
                <Text style={styles.quickText} numberOfLines={1}>{item.label}</Text>
                {item.badge ? (
                  <View style={styles.quickUnreadBadge}>
                    <Text style={styles.quickUnreadBadgeText}>{item.badge}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.commandDeck}>
          <View style={styles.roomRail}>
            {visibleRooms.map(room => {
              const isActive = activeRoom?.title === room.title;
              return (
                <TouchableOpacity
                  key={room.title}
                  onPress={() => setActiveRoomTitle(room.title)}
                  style={[styles.roomRailItem, isActive && { backgroundColor: room.accent + '22', borderColor: room.accent + '88' }]}
                  activeOpacity={0.84}
                >
                  <Ionicons color={isActive ? room.accent : '#777'} name={room.icon} size={17} />
                  <Text style={[styles.roomRailText, isActive && { color: '#ffffff' }]} numberOfLines={2}>{room.title}</Text>
                  <Text style={[styles.roomRailCount, isActive && { color: room.accent }]}>{room.actions.length}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {activeRoom ? (
            <View style={[styles.activePanel, { borderColor: activeRoom.accent + '66' }]}>
              <View style={styles.roomHeader}>
                <View style={[styles.roomIcon, { backgroundColor: activeRoom.accent + '22', borderColor: activeRoom.accent + '88' }]}>
                  <Ionicons color={activeRoom.accent} name={activeRoom.icon} size={20} />
                </View>
                <View style={styles.roomCopy}>
                  <Text style={styles.roomTitle}>{activeRoom.title}</Text>
                  <Text style={styles.roomDesc}>{activeRoom.desc}</Text>
                </View>
              </View>
              <View style={styles.actionGrid}>
                {activeRoom.actions.map(action => (
                  <TouchableOpacity
                    key={`${activeRoom.title}-${action.label}`}
                    onPress={() => openAction(action)}
                    style={styles.actionCard}
                    activeOpacity={0.82}
                  >
                    <View style={[styles.actionIcon, { borderColor: activeRoom.accent + '55' }]}>
                      <Ionicons color={activeRoom.accent} name={action.icon} size={17} />
                    </View>
                    <View style={styles.actionCopy}>
                      <View style={styles.actionLabelRow}>
                        <Text style={styles.actionLabel}>{action.label}</Text>
                        {action.id === 'league-chat' && leagueChatUnreadBadge ? (
                          <View style={styles.unreadBadge}>
                            <Text style={styles.unreadBadgeText}>{leagueChatUnreadBadge}</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.actionDesc} numberOfLines={2}>{action.desc}</Text>
                    </View>
                    <Ionicons color="#555" name="chevron-forward" size={17} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}
        </View>
        <GlobalNav />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 58, paddingBottom: 14, backgroundColor: 'rgba(5,5,5,0.84)', borderBottomWidth: 1, borderBottomColor: '#202020' },
  backButton: { width: 44, height: 44, borderRadius: 8, backgroundColor: '#151515', alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 12 },
  eyebrow: { color: '#777', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  title: { fontSize: 22, fontWeight: '900', color: '#ffffff', marginTop: 1 },
  subtitle: { fontSize: 12, color: '#888', marginTop: 2, maxWidth: '100%' },
  list: { padding: 18, gap: 14 },
  hero: { backgroundColor: 'rgba(10,20,15,0.92)', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#00e58b44', gap: 13 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroIcon: { width: 42, height: 42, borderRadius: 8, backgroundColor: '#00e58b', alignItems: 'center', justifyContent: 'center' },
  heroCopy: { flex: 1 },
  heroTitle: { color: '#fff', fontSize: 17, fontWeight: '900' },
  heroText: { color: '#9a9a9a', fontSize: 12, fontWeight: '700', lineHeight: 17, marginTop: 3 },
  pitchNotice: { borderRadius: 8, borderWidth: 1, borderColor: '#4ea1ff66', backgroundColor: '#07131f', padding: 9 },
  pitchNoticeText: { color: '#b8c7d8', fontSize: 11, fontWeight: '800', lineHeight: 16 },
  quickRow: { flexDirection: 'row', gap: 8 },
  quickButton: { flex: 1, minWidth: 0, minHeight: 38, borderRadius: 8, borderWidth: 1, borderColor: '#00e58b44', backgroundColor: '#08160f', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5, paddingHorizontal: 8 },
  quickButtonDisabled: { opacity: 0.35 },
  quickText: { color: '#00e58b', fontSize: 11, fontWeight: '900', flexShrink: 1 },
  quickUnreadBadge: { position: 'absolute', top: -8, right: -7, minWidth: 19, height: 19, borderRadius: 10, paddingHorizontal: 5, backgroundColor: '#00e58b', borderWidth: 2, borderColor: '#08160f', alignItems: 'center', justifyContent: 'center' },
  quickUnreadBadgeText: { color: '#06130c', fontSize: 9, fontWeight: '900' },
  unreadBadge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: '#00e58b', alignItems: 'center', justifyContent: 'center' },
  unreadBadgeText: { color: '#06130c', fontSize: 10, fontWeight: '900' },
  commandDeck: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  roomRail: { width: 112, gap: 8 },
  roomRailItem: { minHeight: 68, borderRadius: 8, borderWidth: 1, borderColor: '#222', backgroundColor: 'rgba(10,10,10,0.94)', padding: 9, justifyContent: 'space-between' },
  roomRailText: { color: '#858585', fontSize: 10, lineHeight: 13, fontWeight: '900', marginTop: 5 },
  roomRailCount: { color: '#555', fontSize: 10, fontWeight: '900', marginTop: 3 },
  activePanel: { flex: 1, backgroundColor: 'rgba(17,17,17,0.94)', borderRadius: 10, padding: 12, borderWidth: 1, gap: 12 },
  roomHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  roomIcon: { width: 40, height: 40, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  roomCopy: { flex: 1 },
  roomTitle: { color: '#ffffff', fontSize: 16, fontWeight: '900' },
  roomDesc: { color: '#858585', fontSize: 11, fontWeight: '700', lineHeight: 16, marginTop: 3 },
  actionGrid: { gap: 8 },
  actionCard: { minHeight: 62, borderRadius: 8, backgroundColor: '#080808', borderWidth: 1, borderColor: '#232323', padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  actionIcon: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#141414' },
  actionCopy: { flex: 1 },
  actionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  actionLabel: { color: '#ffffff', fontSize: 13, fontWeight: '900' },
  actionDesc: { color: '#777', fontSize: 10, fontWeight: '700', lineHeight: 14, marginTop: 2 },
});
