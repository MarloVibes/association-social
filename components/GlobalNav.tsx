import { router } from 'expo-router';
import { useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getLastLeagueId } from '@/utils/lastLeague';

type Props = {
  pendingRequests?: number;
  pendingInvites?: number;
};

// Time window (ms) within which a second Home tap counts as a double tap.
const DOUBLE_TAP_DELAY = 280;

export default function GlobalNav({ pendingRequests = 0, pendingInvites = 0 }: Props) {
  const lastTap = useRef(0);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Single tap → jump back into the league you were last in (fallback: dashboard).
  const goToLatestLeague = async () => {
    const id = await getLastLeagueId();
    if (id) router.replace({ pathname: '/screens/league', params: { leagueId: id } });
    else router.replace('/(tabs)/dashboard');
  };

  // Double tap → main menu (dashboard).
  const goToMainMenu = () => {
    router.replace('/(tabs)/dashboard');
  };

  const handleHomePress = () => {
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_DELAY) {
      // Second tap arrived in time → double tap.
      if (singleTapTimer.current) {
        clearTimeout(singleTapTimer.current);
        singleTapTimer.current = null;
      }
      lastTap.current = 0;
      goToMainMenu();
    } else {
      // First tap → wait briefly to see if a second one lands.
      lastTap.current = now;
      singleTapTimer.current = setTimeout(() => {
        singleTapTimer.current = null;
        goToLatestLeague();
      }, DOUBLE_TAP_DELAY);
    }
  };

  return (
    <View style={styles.bar}>
      <TouchableOpacity style={styles.btn} onPress={handleHomePress}>
        <Text style={styles.btnIcon}>🏠</Text>
        <Text style={styles.btnLabel}>Home</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.btn} onPress={() => router.navigate('/screens/friends')}>
        <View style={styles.iconWrap}>
          <Text style={styles.btnIcon}>👥</Text>
          {pendingRequests > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{pendingRequests > 99 ? '99+' : pendingRequests}</Text>
            </View>
          )}
        </View>
        <Text style={styles.btnLabel}>Friends</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.btn} onPress={() => router.navigate('/screens/notifications')}>
        <View style={styles.iconWrap}>
          <Text style={styles.btnIcon}>🔔</Text>
          {pendingInvites > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{pendingInvites > 99 ? '99+' : pendingInvites}</Text>
            </View>
          )}
        </View>
        <Text style={styles.btnLabel}>Alerts</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.btn} onPress={() => router.navigate('/screens/search-users')}>
        <Text style={styles.btnIcon}>🔍</Text>
        <Text style={styles.btnLabel}>Search</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: '#0a0a0a',
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
    paddingBottom: 24,
    paddingTop: 10,
    zIndex: 100,
  },
  btn: { flex: 1, alignItems: 'center', gap: 3 },
  iconWrap: { position: 'relative' },
  btnIcon: { fontSize: 20 },
  btnLabel: { fontSize: 11, color: '#888', fontWeight: '600' },
  badge: { position: 'absolute', top: -4, right: -8, backgroundColor: '#ff4444', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
});
