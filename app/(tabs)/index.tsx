import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { collection, collectionGroup, getCountFromServer, query, where, Timestamp } from 'firebase/firestore';
import { db } from '@/constants/firebase';

const { width } = Dimensions.get('window');

export default function LandingScreen() {
  const gradAnim = useRef(new Animated.Value(0)).current;
  const titleY = useRef(new Animated.Value(40)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const accentPulse = useRef(new Animated.Value(1)).current;
  const tickerX = useRef(new Animated.Value(width)).current;
  const buttonsY = useRef(new Animated.Value(100)).current;
  const buttonsOpacity = useRef(new Animated.Value(0)).current;

  const [stats, setStats] = useState({ gms: 0, leagues: 0, tradesAll: 0, tradesToday: 0 });

  useEffect(() => {
    // Fetch stats (best-effort; ticker still shows even if any fail)
    (async () => {
      const next = { gms: 0, leagues: 0, tradesAll: 0, tradesToday: 0 };
      try {
        const s = await getCountFromServer(collection(db, 'users'));
        next.gms = s.data().count;
      } catch (e) { /* ignore */ }
      try {
        const s = await getCountFromServer(collection(db, 'leagues'));
        next.leagues = s.data().count;
      } catch (e) { /* ignore */ }
      try {
        const q1 = query(collectionGroup(db, 'trade_rooms'), where('status', '==', 'executed'));
        const s = await getCountFromServer(q1);
        next.tradesAll = s.data().count;
      } catch (e) { /* ignore - needs index */ }
      try {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const q2 = query(
          collectionGroup(db, 'trade_rooms'),
          where('status', '==', 'executed'),
          where('executedAt', '>=', Timestamp.fromDate(start))
        );
        const s = await getCountFromServer(q2);
        next.tradesToday = s.data().count;
      } catch (e) { /* ignore - needs index */ }
      setStats(next);
    })();
  }, []);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(gradAnim, { toValue: 1, duration: 8000, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(gradAnim, { toValue: 0, duration: 8000, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      ])
    ).start();

    Animated.loop(
      Animated.timing(tickerX, { toValue: -width * 2, duration: 18000, easing: Easing.linear, useNativeDriver: true })
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(accentPulse, { toValue: 1.05, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(accentPulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();

    Animated.sequence([
      Animated.parallel([
        Animated.timing(titleY, { toValue: 0, duration: 700, useNativeDriver: true }),
        Animated.timing(titleOpacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
      Animated.delay(200),
      Animated.parallel([
        Animated.timing(buttonsOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(buttonsY, { toValue: 0, tension: 50, friction: 8, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const tickerItems = [
    'TOTAL GMs · ' + stats.gms,
    'TRADES COMPLETED · ' + stats.tradesAll,
    'LEAGUES ACTIVE · ' + stats.leagues,
    'TRADES TODAY · ' + stats.tradesToday,
  ];

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0a0a1f', '#1a0a2f', '#0a1f1a', '#000000']}
        locations={[0, 0.35, 0.7, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.glowGreen} />
      <View style={styles.glowPurple} />

      {/* Ticker */}
      <View style={styles.tickerWrap}>
        <Animated.View style={[styles.ticker, { transform: [{ translateX: tickerX }] }]}>
          {tickerItems.concat(tickerItems).map((t, i) => (
            <Text key={i} style={styles.tickerItem}>{t}<Text style={styles.tickerDot}>  •  </Text></Text>
          ))}
        </Animated.View>
      </View>

      <View style={styles.centerContent}>
        <Animated.View style={{ opacity: titleOpacity, transform: [{ translateY: titleY }] }}>
          <Text style={styles.titleTop} numberOfLines={1} adjustsFontSizeToFit>FRANCHISE</Text>
          <Animated.Text numberOfLines={1} adjustsFontSizeToFit style={[styles.titleBottom, { transform: [{ scale: accentPulse }] }]}>
            MOBILE
          </Animated.Text>
          <View style={styles.divider} />
          <Text style={styles.tagline}>RUN YOUR LEAGUE. OWN YOUR ERA.</Text>
        </Animated.View>
      </View>

      <Animated.View style={[styles.buttonsContainer, { opacity: buttonsOpacity, transform: [{ translateY: buttonsY }] }]}>
        <TouchableOpacity
          style={styles.createBtn}
          onPress={() => router.push({ pathname: '/(tabs)/auth', params: { mode: 'signup' } })}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={['#00ff87', '#00cc6a']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.createBtnInner}
          >
            <Text style={styles.createBtnText}>GET STARTED</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.signInBtn}
          onPress={() => router.push({ pathname: '/(tabs)/auth', params: { mode: 'signin' } })}
          activeOpacity={0.85}
        >
          <Text style={styles.signInBtnText}>Sign In</Text>
        </TouchableOpacity>
        <Text style={styles.footerText}>EST · 2026</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', justifyContent: 'space-between', paddingBottom: 60 },
  glowGreen: { position: 'absolute', top: -150, left: -100, width: 400, height: 400, borderRadius: 200, backgroundColor: '#00ff87', opacity: 0.08 },
  glowPurple: { position: 'absolute', bottom: -100, right: -100, width: 400, height: 400, borderRadius: 200, backgroundColor: '#8844ff', opacity: 0.1 },
  tickerWrap: { marginTop: 60, height: 28, overflow: 'hidden', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#1a1a1a', backgroundColor: 'rgba(0,255,135,0.04)' },
  ticker: { flexDirection: 'row', alignItems: 'center', height: '100%', position: 'absolute' },
  tickerItem: { color: '#00ff87', fontSize: 11, fontWeight: '800', letterSpacing: 2, paddingHorizontal: 4 },
  tickerDot: { color: '#444', fontSize: 11 },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  titleTop: { fontSize: 42, fontWeight: '900', color: '#ffffff', letterSpacing: 4, textAlign: 'center' },
  titleBottom: { fontSize: 42, fontWeight: '900', color: '#00ff87', letterSpacing: 4, textAlign: 'center', textShadowColor: '#00ff87', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 20 },
  divider: { height: 2, width: 60, backgroundColor: '#00ff87', alignSelf: 'center', marginTop: 18, marginBottom: 14 },
  tagline: { fontSize: 12, color: '#aaaaaa', textAlign: 'center', letterSpacing: 3, fontWeight: '600' },
  buttonsContainer: { paddingHorizontal: 32, gap: 12 },
  createBtn: { borderRadius: 16, overflow: 'hidden' },
  createBtnInner: { paddingVertical: 18, alignItems: 'center' },
  createBtnText: { color: '#000000', fontSize: 15, fontWeight: '900', letterSpacing: 2 },
  signInBtn: { backgroundColor: 'transparent', borderRadius: 16, paddingVertical: 18, alignItems: 'center', borderWidth: 1, borderColor: '#333333' },
  signInBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '700', letterSpacing: 1 },
  footerText: { color: '#444', fontSize: 10, textAlign: 'center', marginTop: 12, letterSpacing: 4, fontWeight: '700' },
});
