import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';

export default function MVPLockerRoomScreen() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.backLink}>← Back</Text></TouchableOpacity>
        <Text style={styles.title}>The Locker Room</Text>
        <View style={{ width: 60 }} />
      </View>
      <View style={styles.center}>
        <Text style={styles.icon}>🔓</Text>
        <Text style={styles.heading}>Coming Soon</Text>
        <Text style={styles.desc}>Chat with friends. Find pickup runs. Connect with players hanging out before the next game.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  backLink: { color: '#22c55e', fontSize: 16, fontWeight: '600' },
  title: { color: '#fff', fontSize: 18, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  icon: { fontSize: 64, marginBottom: 16 },
  heading: { color: '#fff', fontSize: 24, fontWeight: '900', marginBottom: 10 },
  desc: { color: '#888', fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
