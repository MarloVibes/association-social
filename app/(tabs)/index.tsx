import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const { width, height } = Dimensions.get('window');

export default function LandingScreen() {
  const ballY = useRef(new Animated.Value(-120)).current;
  const ballScale = useRef(new Animated.Value(0.5)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleY = useRef(new Animated.Value(30)).current;
  const accentOpacity = useRef(new Animated.Value(0)).current;
  const accentX = useRef(new Animated.Value(-width)).current;
  const lineWidth = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineY = useRef(new Animated.Value(20)).current;
  const buttonsY = useRef(new Animated.Value(100)).current;
  const buttonsOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      // Ball bounces in
      Animated.parallel([
        Animated.spring(ballY, { toValue: 0, tension: 40, friction: 6, useNativeDriver: true }),
        Animated.spring(ballScale, { toValue: 1, tension: 40, friction: 6, useNativeDriver: true }),
      ]),
      Animated.delay(200),
      // FRANCHISE fades in
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(titleY, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
      Animated.delay(100),
      // SOCIAL slides in from left
      Animated.parallel([
        Animated.timing(accentOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(accentX, { toValue: 0, tension: 60, friction: 8, useNativeDriver: true }),
      ]),
      Animated.delay(100),
      // Green line sweeps across
      Animated.timing(lineWidth, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.delay(200),
      // Tagline fades in
      Animated.parallel([
        Animated.timing(taglineOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(taglineY, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
      Animated.delay(300),
      // Buttons slide up
      Animated.parallel([
        Animated.timing(buttonsOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(buttonsY, { toValue: 0, tension: 50, friction: 8, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const lineScaleX = lineWidth.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <View style={styles.container}>
      {/* Background glow */}
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      {/* Center content */}
      <View style={styles.centerContent}>
        {/* Basketball */}
        <Animated.View style={[styles.ballContainer, { transform: [{ translateY: ballY }, { scale: ballScale }] }]}>
          <Text style={styles.ball}>🏀</Text>
        </Animated.View>

        {/* ASSOCIATION */}
        <Animated.Text style={[styles.titleTop, { opacity: titleOpacity, transform: [{ translateY: titleY }] }]}>
          FRANCHISE
        </Animated.Text>

        {/* SOCIAL */}
        <Animated.Text style={[styles.titleBottom, { opacity: accentOpacity, transform: [{ translateX: accentX }] }]}>
          SOCIAL
        </Animated.Text>

        {/* Green line */}
        <View style={styles.lineContainer}>
          <Animated.View style={[styles.line, { transform: [{ scaleX: lineScaleX }] }]} />
        </View>

        {/* Tagline */}
        <Animated.Text style={[styles.tagline, { opacity: taglineOpacity, transform: [{ translateY: taglineY }] }]}>
          Run Your League. Own Your Era.
        </Animated.Text>
      </View>

      {/* Buttons */}
      <Animated.View style={[styles.buttonsContainer, { opacity: buttonsOpacity, transform: [{ translateY: buttonsY }] }]}>
        <TouchableOpacity
          style={styles.createBtn}
          onPress={() => router.push({ pathname: '/(tabs)/auth', params: { mode: 'signup' } })}
          activeOpacity={0.85}
        >
          <Text style={styles.createBtnText}>Create Account</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.signInBtn}
          onPress={() => router.push({ pathname: '/(tabs)/auth', params: { mode: 'signin' } })}
          activeOpacity={0.85}
        >
          <Text style={styles.signInBtnText}>Sign In</Text>
        </TouchableOpacity>
        <Text style={styles.footerText}>The #1 franchise league manager</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000', justifyContent: 'space-between', paddingBottom: 60 },
  glowTop: { position: 'absolute', top: -100, left: '50%', marginLeft: -150, width: 300, height: 300, borderRadius: 150, backgroundColor: '#00ff87', opacity: 0.06 },
  glowBottom: { position: 'absolute', bottom: -50, right: -50, width: 200, height: 200, borderRadius: 100, backgroundColor: '#00ff87', opacity: 0.04 },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  ballContainer: { marginBottom: 32 },
  ball: { fontSize: 72 },
  titleTop: { fontSize: 32, fontWeight: '900', color: '#ffffff', letterSpacing: 3, textAlign: 'center' },
  titleBottom: { fontSize: 32, fontWeight: '900', color: '#00ff87', letterSpacing: 3, textAlign: 'center', marginTop: -4 },
  lineContainer: { width: '80%', height: 2, backgroundColor: 'transparent', marginTop: 16, marginBottom: 20, overflow: 'hidden' },
  line: { height: 2, backgroundColor: '#00ff87', transformOrigin: 'left', width: '100%' },
  tagline: { fontSize: 15, color: '#888888', textAlign: 'center', letterSpacing: 1, fontWeight: '500' },
  buttonsContainer: { paddingHorizontal: 32, gap: 12 },
  createBtn: { backgroundColor: '#00ff87', borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  createBtnText: { color: '#000000', fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },
  signInBtn: { backgroundColor: 'transparent', borderRadius: 16, paddingVertical: 18, alignItems: 'center', borderWidth: 1, borderColor: '#333333' },
  signInBtnText: { color: '#ffffff', fontSize: 17, fontWeight: '600' },
  footerText: { color: '#333', fontSize: 12, textAlign: 'center', marginTop: 8 },
});