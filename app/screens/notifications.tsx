import { router } from 'expo-router';
import { arrayUnion, collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where, deleteDoc } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View, RefreshControl } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { auth, db } from '@/constants/firebase';
import { addLeagueMemberIfSpace } from '@/utils/leagueMembership';
import GlobalNav from '@/components/GlobalNav';

function routeNotification(n: any) {
  if (!n?.leagueId) return;
  const type = String(n.type || '');
  const leagueId = n.leagueId;
  const gameId = n.gameId || n.scheduleGameId || n.matchupId || '';
  const competition = n.competition || n.scheduleCompetition || 'regular';

  if (
    type === 'trade_offer'
    || type === 'trade_executed'
    || type === 'trade_declined'
    || type === 'trade_cancelled'
    || type === 'trade_room_opened'
    || type === 'trade_override_review'
    || type === 'trade_override_approved'
    || type === 'trade_override_denied'
  ) {
    router.push({ pathname: '/screens/trade-room', params: { leagueId, otherUid: n.otherUid || n.fromUid || '', otherTeamId: n.otherTeamId || '', otherTeamName: n.otherTeamName || n.fromTeamName || '' } });
  } else if (type === 'custom_player_submitted') {
    router.push({ pathname: '/screens/pending-players', params: { leagueId } });
  } else if (type === 'custom_player_approved' || type === 'custom_player_denied') {
    router.push({ pathname: '/screens/league', params: { leagueId } });
  } else if (type === 'tradeblock' || type === 'trade_listing') {
    router.push({ pathname: '/screens/trade-channel', params: { leagueId, channelId: 'trade-center' } });
  } else if (type === 'mention') {
    router.push({ pathname: '/screens/channel', params: { leagueId, leagueName: n.leagueName || '', channelId: n.channelId || 'league-chat', channelLabel: n.channelLabel || 'League Chat', channelIcon: n.channelIcon || '💬', commissionerId: '', coCommissioners: '[]' } });
  } else if (type === 'cpu_trade_request') {
    router.push({ pathname: '/screens/cpu-trade-requests', params: { leagueId } });
  } else if (type === 'cpu_trade_result') {
    router.push({ pathname: '/screens/league-rosters', params: { leagueId } });
  } else if (type === 'reset_request' || type === 'reset_request_opponent' || type === 'reset_disputed') {
    router.push({ pathname: '/screens/channel', params: { leagueId, leagueName: n.leagueName || '', channelId: 'reset-requests', channelLabel: 'Game Resets', channelIcon: '🔁', commissionerId: '', coCommissioners: '[]' } });
  } else if (type === 'announcement') {
    router.push({ pathname: '/screens/channel', params: { leagueId, leagueName: n.leagueName || '', channelId: 'announcements', channelLabel: 'League News', channelIcon: '📰', commissionerId: '', coCommissioners: '[]' } });
  } else if (['game_simulated', 'game_final', 'score_reported'].includes(type) && gameId) {
    router.push({ pathname: '/screens/season/game-result', params: { leagueId, gameId, competition } });
  } else if (type === 'injury_update') {
    router.push({ pathname: '/screens/season/injuries', params: { leagueId } });
  } else if (type === 'extension_interest' || type === 'extension_offer_submitted') {
    router.push({ pathname: '/screens/season/contracts' as any, params: { leagueId } });
  } else if (type === 'contract_deadline') {
    if (n.deadlineKind === 'trade') router.push({ pathname: '/screens/trade-channel', params: { leagueId, channelId: 'trade-center' } });
    else router.push({ pathname: '/screens/season/contracts' as any, params: { leagueId } });
  } else if (['matchup_request', 'matchup_accepted', 'game_ready'].includes(type)) {
    if (gameId && type === 'game_ready') router.push({ pathname: '/screens/season/game-result', params: { leagueId, gameId, competition } });
    else if (gameId) router.push({ pathname: '/screens/season/matchup', params: { leagueId, gameId, competition } });
    else router.push({ pathname: '/screens/season/calendar', params: { leagueId } });
  } else if (['schedule_created', 'schedule_updated', 'nba_cup', 'nba_cup_advanced', 'game_reset'].includes(type)) {
    router.push({ pathname: '/screens/season/calendar', params: { leagueId } });
  } else if (['draft_started', 'draft_pick', 'draft_auto_pick', 'draft_turn'].includes(type)) {
    router.push({ pathname: '/screens/offseason/live-draft', params: { leagueId } });
  } else if (['draft_class_ready', 'contract_round', 'free_agency', 'offseason_stage'].includes(type)) {
    router.push({ pathname: '/screens/offseason', params: { leagueId } });
  } else if (type === 'roster_compliance' || type === 'roster_cuts') {
    router.push({ pathname: '/screens/offseason/roster-cuts', params: { leagueId } });
  } else if (type === 'expansion' || type === 'expansion_draft') {
    router.push({ pathname: '/screens/offseason/expansion', params: { leagueId } });
  } else if (type === 'season_awards' || type === 'awards_finalized') {
    router.push({ pathname: '/screens/season/awards', params: { leagueId } });
  } else if (type === 'upgrade_points') {
    router.push({ pathname: '/screens/season/player-upgrades', params: { leagueId } });
  } else {
    router.push({ pathname: '/screens/league', params: { leagueId } });
  }
}

function sportIconForNotification(sport?: string | null) {
  if (sport === 'madden' || sport === 'nfl') return '🏈';
  if (sport === 'mlb') return '⚾';
  if (sport === 'nba') return '🏀';
  return '🎮';
}

function notificationIcon(type: string, sport?: string | null) {
  if (type === 'join_accepted' || type === 'trade_executed' || type === 'trade_override_approved' || type === 'custom_player_approved') return '✅';
  if (type === 'join_denied' || type === 'trade_declined' || type === 'trade_cancelled' || type === 'trade_override_denied' || type === 'custom_player_denied') return '❌';
  if (type === 'trade_offer' || type === 'trade_room_opened') return '🤝';
  if (type === 'trade_override_review') return '🔓';
  if (type === 'custom_player_submitted') return '📝';
  if (type === 'mention') return '📣';
  if (['matchup_request', 'matchup_accepted', 'game_ready', 'game_simulated', 'game_final', 'score_reported'].includes(type)) return sportIconForNotification(sport);
  if (['schedule_created', 'schedule_updated', 'game_reset'].includes(type)) return '📅';
  if (['nba_cup', 'nba_cup_advanced', 'season_awards', 'awards_finalized'].includes(type)) return '🏆';
  if (['draft_started', 'draft_pick', 'draft_auto_pick', 'draft_turn', 'draft_class_ready'].includes(type)) return '🎙️';
  if (['contract_round', 'free_agency', 'offseason_stage', 'extension_interest', 'extension_offer_submitted', 'contract_deadline'].includes(type)) return '💼';
  if (type === 'roster_compliance' || type === 'roster_cuts') return '✂️';
  if (type === 'expansion' || type === 'expansion_draft') return '🌆';
  if (type === 'upgrade_points') return '⬆️';
  if (type === 'injury_update') return '🩺';
  return '🔔';
}

function notificationActionLabel(type: string) {
  if (type === 'trade_offer') return 'Review Offer →';
  if (type === 'trade_executed') return 'View Trade →';
  if (type === 'trade_declined' || type === 'trade_cancelled') return 'View Room →';
  if (type === 'trade_room_opened') return 'Join Negotiation →';
  if (type === 'trade_override_review') return 'Review Trade →';
  if (type === 'trade_override_approved') return 'View Trade →';
  if (type === 'trade_override_denied') return 'View Room →';
  if (type === 'tradeblock') return 'View Trade Center →';
  if (type === 'reset_request' || type === 'reset_request_opponent') return 'View Reset Requests →';
  if (type === 'cpu_trade_request') return 'Review CPU Trade →';
  if (type === 'cpu_trade_result') return 'View Rosters →';
  if (type === 'mention') return 'View Message →';
  if (type === 'announcement') return 'View League News →';
  if (['game_simulated', 'game_final', 'score_reported'].includes(type)) return 'View Result →';
  if (type === 'injury_update') return 'View Injuries →';
  if (type === 'extension_interest' || type === 'extension_offer_submitted') return 'View Contract →';
  if (type === 'contract_deadline') return 'Review Deadline →';
  if (type === 'game_ready') return 'View Result →';
  if (['matchup_request', 'matchup_accepted', 'game_ready'].includes(type)) return 'View Matchup →';
  if (['schedule_created', 'schedule_updated', 'nba_cup', 'nba_cup_advanced', 'game_reset'].includes(type)) return 'View Calendar →';
  if (['draft_started', 'draft_pick', 'draft_auto_pick', 'draft_turn'].includes(type)) return 'View Draft →';
  if (['draft_class_ready', 'contract_round', 'free_agency', 'offseason_stage'].includes(type)) return 'View Offseason →';
  if (type === 'roster_compliance' || type === 'roster_cuts') return 'View Roster Cuts →';
  if (type === 'expansion' || type === 'expansion_draft') return 'View Expansion →';
  if (type === 'season_awards' || type === 'awards_finalized') return 'View Trophy Case →';
  if (type === 'upgrade_points') return 'View Upgrade Points →';
  return 'View League →';
}

export default function NotificationsScreen() {
  const [invites, setInvites] = useState<any[]>([]);
  const [joinRequests, setJoinRequests] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const user = auth.currentUser;

  const loadAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) {
        const data = snap.data();
        setInvites(data.leagueInvites || []);
        setNotifications((data.notifications || []).reverse());
      }
      const leaguesSnap = await getDocs(query(collection(db, 'leagues'), where('commissionerId', '==', user.uid)));
      const allRequests: any[] = [];
      for (const leagueDoc of leaguesSnap.docs) {
        const reqSnap = await getDocs(collection(db, 'leagues', leagueDoc.id, 'join_requests'));
        reqSnap.docs.forEach(r => {
          const data = r.data();
          if (data.status === 'pending') {
            allRequests.push({ id: r.id, leagueDocId: leagueDoc.id, ...data });
          }
        });
      }
      setJoinRequests(allRequests);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [user]);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      const notifs = snap.data()?.notifications || [];
      const updated = notifs.map((n: any) => ({ ...n, read: true }));
      await updateDoc(doc(db, 'users', user.uid), { notifications: updated });
    } catch (e) { console.error(e); }
  }, [user]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => markAllRead(), 2000);
    return () => clearTimeout(timer);
  }, [markAllRead, user]);

  const acceptInvite = async (invite: any) => {
    if (!user) return;
    try {
      await addLeagueMemberIfSpace(db, invite.leagueId, user.uid, {
        leagueName: invite.leagueName,
        inviteToRemove: invite,
      });
      // Clean up the invite/request docs so they don't resurface later
      try { await deleteDoc(doc(db, 'leagues', invite.leagueId, 'sent_invites', user.uid)); } catch {}
      try {
        const reqs = await getDocs(query(
          collection(db, 'leagues', invite.leagueId, 'join_requests'),
          where('uid', '==', user.uid)
        ));
        await Promise.all(reqs.docs.map(d => deleteDoc(d.ref)));
      } catch {}
      setInvites(prev => prev.filter(i => i.leagueId !== invite.leagueId));
      router.push({ pathname: '/screens/league', params: { leagueId: invite.leagueId } });
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const denyInvite = async (invite: any) => {
    if (!user) return;
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      const current = snap.data()?.leagueInvites || [];
      await updateDoc(doc(db, 'users', user.uid), {
        leagueInvites: current.filter((i: any) => i.leagueId !== invite.leagueId),
      });
      setInvites(prev => prev.filter(i => i.leagueId !== invite.leagueId));
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const acceptJoinRequest = async (req: any) => {
    if (!user) return;
    try {
      await addLeagueMemberIfSpace(db, req.leagueDocId, req.uid, {
        leagueName: req.leagueName,
        requestId: req.id,
        resolvedBy: user.uid,
        userNotification: {
          type: 'join_accepted',
          leagueId: req.leagueDocId,
          leagueName: req.leagueName,
          createdAt: new Date().toISOString(),
        },
      });
      setJoinRequests(prev => prev.filter(r => r.id !== req.id));
      Alert.alert('Accepted!', req.displayName + ' has been added to ' + req.leagueName);
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const denyJoinRequest = async (req: any) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', req.uid), {
        notifications: arrayUnion({
          type: 'join_denied',
          leagueId: req.leagueDocId,
          leagueName: req.leagueName,
          createdAt: new Date().toISOString(),
        }),
      });
      await updateDoc(doc(db, 'leagues', req.leagueDocId, 'join_requests', req.id), {
        status: 'declined',
        resolvedAt: serverTimestamp(),
        resolvedBy: user?.uid || '',
      });
      setJoinRequests(prev => prev.filter(r => r.id !== req.id));
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const confirmAccept = (req: any) => {
    const who = req.username ? '@' + req.username : req.displayName;
    Alert.alert(
      'Accept Request',
      'Accept ' + who + ' request to join ' + req.leagueName + '?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Accept', onPress: () => acceptJoinRequest(req) },
      ]
    );
  };

  const confirmDecline = (req: any) => {
    const who = req.username ? '@' + req.username : req.displayName;
    Alert.alert(
      'Decline Request',
      'Decline ' + who + ' request to join ' + req.leagueName + '?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Decline', style: 'destructive', onPress: () => denyJoinRequest(req) },
      ]
    );
  };

  const deleteNotification = async (n: any, idx: number) => {
    if (!user) return;
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      const notifs = snap.data()?.notifications || [];
      // We display notifications reversed; idx is the reversed index, compute real
      const realIdx = notifs.length - 1 - idx;
      if (realIdx < 0 || realIdx >= notifs.length) return;
      const next = [...notifs.slice(0, realIdx), ...notifs.slice(realIdx + 1)];
      await updateDoc(doc(db, 'users', user.uid), { notifications: next });
      setNotifications(prev => prev.filter((_, i) => i !== idx));
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const clearAllActivity = () => {
    if (notifications.length === 0) return;
    Alert.alert(
      'Clear all notifications?',
      'This will remove all activity notifications. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear All', style: 'destructive', onPress: async () => {
          if (!user) return;
          try {
            await updateDoc(doc(db, 'users', user.uid), { notifications: [] });
            setNotifications([]);
          } catch (e: any) { Alert.alert('Error', e.message); }
        }},
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Notifications</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={markAllRead}><Text style={styles.markAllText}>✓ All Read</Text></TouchableOpacity>
          <TouchableOpacity onPress={clearAllActivity} style={{ marginLeft: 12 }}><Text style={styles.clearAllText}>🗑️</Text></TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size='large' color='#00ff87' />
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.content, { paddingBottom: 90 }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00ff87" colors={["#00ff87"]} />}>

          {joinRequests.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Join Requests</Text>
              {joinRequests.map((req: any) => (
                <TouchableOpacity
                  key={req.id}
                  style={styles.joinRequestCard}
                  activeOpacity={0.85}
                  onPress={() => router.push({
                    pathname: '/screens/invite-members',
                    params: { leagueId: req.leagueDocId, leagueName: req.leagueName || '', tab: 'invitations' },
                  })}
                >
                  <View style={styles.joinRequestInfo}>
                    <Text style={styles.joinRequestMessage}>
                      <Text
                        style={styles.joinRequestNameLink}
                        onPress={(e) => { e.stopPropagation?.(); router.push({ pathname: '/screens/profile', params: { uid: req.fromUid || req.uid } }); }}
                      >
                        {req.username ? '@' + req.username : req.displayName}
                      </Text>
                      <Text style={styles.joinRequestText}> has requested to join </Text>
                      <Text style={styles.joinRequestLeagueLink}>{req.leagueName}</Text>
                    </Text>
                  </View>
                  <View style={styles.joinRequestActions}>
                    <TouchableOpacity
                      style={styles.acceptBtn}
                      onPress={(e) => { e.stopPropagation?.(); confirmAccept(req); }}
                    >
                      <Text style={styles.acceptBtnText}>✓</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.denyBtn}
                      onPress={(e) => { e.stopPropagation?.(); confirmDecline(req); }}
                    >
                      <Text style={styles.denyBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))}
            </>
          )}

          {invites.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>League Invites</Text>
              {invites.map((invite: any, i: number) => (
                <View key={i} style={styles.inviteCard}>
                  <View style={styles.inviteInfo}>
                    <Text style={styles.inviteName}>{invite.leagueName}</Text>
                    <Text style={styles.inviteMeta}>Invited by {invite.inviterName}</Text>
                  </View>
                  <View style={styles.joinRequestActions}>
                    <TouchableOpacity style={styles.acceptBtn} onPress={() => acceptInvite(invite)}>
                      <Text style={styles.acceptBtnText}>✓</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.denyBtn} onPress={() => denyInvite(invite)}>
                      <Text style={styles.denyBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </>
          )}

          {notifications.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Activity</Text>
              {notifications.map((n: any, i: number) => (
                <Swipeable
                  key={i}
                  renderRightActions={() => (
                    <View style={styles.swipeDelete}>
                      <Text style={styles.swipeDeleteText}>Delete</Text>
                    </View>
                  )}
                  onSwipeableOpen={() => deleteNotification(n, i)}
                  rightThreshold={60}
                >
                <View style={styles.notifCard}>
                  <Text style={styles.notifIcon}>
                    {notificationIcon(n.type, n.sport || n.leagueSport)}
                  </Text>
                  <View style={styles.notifInfo}>
                    {n.type === 'join_accepted' && <Text style={styles.notifText}>Your request to join <Text style={styles.notifBold}>{n.leagueName}</Text> was accepted!</Text>}
                    {n.type === 'join_denied' && <Text style={styles.notifText}>Your request to join <Text style={styles.notifBold}>{n.leagueName}</Text> was denied.</Text>}
                    {n.type === 'custom_player_submitted' && <Text style={styles.notifText}><Text style={styles.notifBold}>{n.playerName}</Text> submitted for review</Text>}
                    {n.type === 'custom_player_approved' && <Text style={styles.notifText}>Your player <Text style={styles.notifBold}>{n.playerName}</Text> was approved!</Text>}
                    {n.type === 'custom_player_denied' && <Text style={styles.notifText}>Your player <Text style={styles.notifBold}>{n.playerName}</Text> was denied.</Text>}
                    {n.type === 'trade_listing' && (
                      <TouchableOpacity onPress={() => router.push({ pathname: '/screens/trade-channel', params: { leagueId: n.leagueId, channelId: 'trade-talk' } })}>
                        <Text style={styles.notifText}>{n.message}</Text>
                        <Text style={styles.notifLink}>View trade talks →</Text>
                      </TouchableOpacity>
                    )}
                    {n.type !== 'join_accepted' && n.type !== 'join_denied' && n.type !== 'trade_listing' && (
                      <TouchableOpacity onPress={() => routeNotification(n)}>
                        <Text style={styles.notifText}>{n.message || n.type}</Text>
                        {n.leagueId && <Text style={styles.notifLink}>
                          {notificationActionLabel(n.type)}
                        </Text>}
                      </TouchableOpacity>
                    )}
                    <Text style={styles.notifTime}>{n.createdAt ? new Date(n.createdAt).toLocaleDateString() : ''}</Text>
                  </View>
                </View>
                </Swipeable>
              ))}
            </>
          )}

          {joinRequests.length === 0 && invites.length === 0 && notifications.length === 0 && (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🔔</Text>
              <Text style={styles.emptyText}>No notifications yet</Text>
            </View>
          )}
        </ScrollView>
      )}
      <GlobalNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  backText: { color: '#00ff87', fontSize: 15, fontWeight: '600', width: 60 },
  title: { fontSize: 18, fontWeight: '800', color: '#ffffff' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingBottom: 100 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#ffffff', marginBottom: 12, marginTop: 8 },
  joinRequestMessage: { fontSize: 14, lineHeight: 20, color: '#ffffff', flexWrap: 'wrap' },
  joinRequestNameLink: { color: '#F5A623', fontWeight: '800', textDecorationLine: 'underline' },
  joinRequestText: { color: '#cccccc' },
  joinRequestLeagueLink: { color: '#00ff87', fontWeight: '700' },
  joinRequestSub: { color: '#555', fontSize: 11, marginTop: 4 },
  joinRequestCard: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#2a2a2a', flexDirection: 'row', alignItems: 'center', gap: 12 },
  joinRequestInfo: { flex: 1 },
  joinRequestName: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  joinRequestMeta: { color: '#888', fontSize: 12, marginTop: 2 },
  joinRequestLeague: { color: '#00ff87', fontSize: 12, fontWeight: '600', marginTop: 4 },
  joinRequestActions: { flexDirection: 'row', gap: 8 },
  acceptBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#0a2a1a', borderWidth: 1, borderColor: '#00ff87', alignItems: 'center', justifyContent: 'center' },
  acceptBtnText: { color: '#00ff87', fontSize: 16, fontWeight: '700' },
  denyBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2a0a0a', borderWidth: 1, borderColor: '#ff4444', alignItems: 'center', justifyContent: 'center' },
  denyBtnText: { color: '#ff4444', fontSize: 16, fontWeight: '700' },
  inviteCard: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#2a2a2a', flexDirection: 'row', alignItems: 'center', gap: 12 },
  inviteInfo: { flex: 1 },
  inviteName: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  inviteMeta: { color: '#888', fontSize: 12, marginTop: 2 },
  markAllText: { color: '#F5A623', fontSize: 12, fontWeight: '700' },
  notifCardUnread: { borderLeftWidth: 3, borderLeftColor: '#F5A623', backgroundColor: '#1a1500' },
  notifCard: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#2a2a2a', flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  notifIcon: { fontSize: 22 },
  notifInfo: { flex: 1 },
  notifText: { color: '#cccccc', fontSize: 14, lineHeight: 20 },
  notifBold: { color: '#ffffff', fontWeight: '700' },
  notifTime: { color: '#555', fontSize: 11, marginTop: 4 },
  notifPreview: { color: '#888', fontSize: 12, fontStyle: 'italic', marginTop: 2 },
  notifLink: { color: '#ff9900', fontSize: 11, marginTop: 2, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', paddingTop: 80, gap: 16 },
  emptyIcon: { fontSize: 48 },
  emptyText: { color: '#555', fontSize: 15 },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  clearAllText: { fontSize: 16 },
  swipeDelete: { backgroundColor: '#ff4444', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, marginBottom: 10, borderRadius: 14 },
  swipeDeleteText: { color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 1 },
});
