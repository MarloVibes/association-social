import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  pendingRequests?: number;
  pendingInvites?: number;
};

export default function GlobalNav({ pendingRequests = 0, pendingInvites = 0 }: Props) {
  return (
    <View style={styles.bar}>
      <TouchableOpacity style={styles.btn} onPress={() => router.replace('/(tabs)/dashboard')}>
        <Text style={styles.btnIcon}>🏠</Text>
        <Text style={styles.btnLabel}>Home</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.btn} onPress={() => router.push('/screens/friends')}>
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
      <TouchableOpacity style={styles.btn} onPress={() => router.push('/screens/notifications')}>
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
      <TouchableOpacity style={styles.btn} onPress={() => router.push('/screens/search-users')}>
        <Text style={styles.btnIcon}>🔍</Text>
        <Text style={styles.btnLabel}>Search</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: '#0a0a0a',
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
    paddingBottom: 24,
    paddingTop: 10,
  },
  btn: { flex: 1, alignItems: 'center', gap: 3 },
  iconWrap: { position: 'relative' },
  btnIcon: { fontSize: 20 },
  btnLabel: { fontSize: 10, color: '#555', fontWeight: '600' },
  badge: { position: 'absolute', top: -4, right: -8, backgroundColor: '#ff4444', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
});
