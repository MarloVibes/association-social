import { useRouter } from 'expo-router';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import GlobalNav from '@/components/GlobalNav';

export default function MyMVPScreen() {
  const router = useRouter();

  const sections = [
    {
      key: 'players',
      title: 'My Players',
      desc: 'Your created MyCareer player cards',
      icon: '🏀',
      colors: ['#1a4d99', '#0a2d6b'] as const,
      route: '/screens/mvp-players',
    },
    {
      key: 'locker',
      title: 'The Locker Room',
      desc: 'Chat with friends, find pickup games',
      icon: '🔓',
      colors: ['#7a4d99', '#3a1d6b'] as const,
      route: '/screens/mvp-locker-room',
    },
    {
      key: 'proam',
      title: 'Pro-Am',
      desc: 'Manage your team and game history',
      icon: '🏆',
      colors: ['#996d1a', '#6b3d0a'] as const,
      route: '/screens/mvp-proam',
    },
    {
      key: 'stats',
      title: 'My Stats',
      desc: 'Track your performance stats',
      icon: '📊',
      colors: ['#1a8a4d', '#0a5d2b'] as const,
      route: '/screens/mvp-stats',
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backLink}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.titleWrap}>
          <Text style={styles.titleStar}>⭐</Text>
          <Text style={styles.title}>MY MVP</Text>
          <Text style={styles.titleStar}>⭐</Text>
        </View>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {sections.map(s => (
          <TouchableOpacity
            key={s.key}
            onPress={() => router.push(s.route as any)}
            activeOpacity={0.85}
            style={[styles.cardShadow, { shadowColor: s.colors[0] }]}
          >
            <LinearGradient
              colors={s.colors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.card}
            >
              <LinearGradient
                colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 0.6 }}
                style={styles.gloss}
                pointerEvents='none'
              />
              <Text style={styles.cardIcon}>{s.icon}</Text>
              <View style={styles.cardInfo}>
                <Text style={styles.cardTitle}>{s.title}</Text>
                <Text style={styles.cardDesc}>{s.desc}</Text>
              </View>
              <Text style={styles.cardChevron}>›</Text>
            </LinearGradient>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <GlobalNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  backLink: { color: '#22c55e', fontSize: 16, fontWeight: '600' },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titleStar: { fontSize: 18 },
  title: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 3 },
  cardShadow: { marginBottom: 14, borderRadius: 16, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 8 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 18, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  gloss: { position: 'absolute', top: 0, left: 0, right: 0, height: '60%', borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  cardIcon: { fontSize: 36, marginRight: 16 },
  cardInfo: { flex: 1 },
  cardTitle: { color: '#fff', fontSize: 19, fontWeight: '900', letterSpacing: 0.5, marginBottom: 4 },
  cardDesc: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '500' },
  cardChevron: { color: '#fff', fontSize: 28, fontWeight: '300' },
});
