import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import SportTeamLogo from '@/components/SportTeamLogo';
import type { BroadcastActor } from '@/domain/nba/broadcastActors';

type BroadcastGameCastProps = {
  awayAbbr: string;
  homeAbbr: string;
  awayScore?: number;
  homeScore?: number;
  era?: string | number;
  actors: BroadcastActor[];
  topPerformers?: { name?: string; position?: string; points?: number; rebounds?: number; assists?: number; blocks?: number; steals?: number }[];
};

type Highlight = {
  label: string;
  description: string;
  points: 2 | 3;
  scorerSide: 'home' | 'away';
  ballPath: [number, number, number, number];
  scoringSpot: 'rim' | 'arc' | 'paint';
};

const BASE_SPOTS = [
  { left: 18, top: 63 },
  { left: 30, top: 67 },
  { left: 42, top: 71 },
  { left: 54, top: 67 },
  { left: 67, top: 63 },
  { left: 22, top: 49 },
  { left: 35, top: 45 },
  { left: 48, top: 42 },
  { left: 61, top: 45 },
  { left: 73, top: 49 },
];

const EVENT_LIBRARY: Highlight[] = [
  {
    label: 'Step-back three',
    description: 'The guard creates separation and lets it fly from deep.',
    points: 3,
    scorerSide: 'away',
    ballPath: [44, 62, 39, 52],
    scoringSpot: 'arc',
  },
  {
    label: 'Poster finish',
    description: 'A hard rim attack shakes the building.',
    points: 2,
    scorerSide: 'home',
    ballPath: [51, 69, 52, 77],
    scoringSpot: 'rim',
  },
  {
    label: 'Chase-down block',
    description: 'The weak-side defender erases a clean look at the glass.',
    points: 2,
    scorerSide: 'away',
    ballPath: [58, 54, 50, 27],
    scoringSpot: 'rim',
  },
  {
    label: 'Transition trailer',
    description: 'The break pulls help inside and the trailer spots up.',
    points: 3,
    scorerSide: 'home',
    ballPath: [46, 48, 62, 60],
    scoringSpot: 'arc',
  },
  {
    label: 'Inside touch',
    description: 'The big seals deep and finishes through contact.',
    points: 2,
    scorerSide: 'home',
    ballPath: [49, 61, 53, 76],
    scoringSpot: 'paint',
  },
];

function score(value: unknown) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function playerInitial(name: string | undefined) {
  return String(name || 'P').trim().slice(0, 1).toUpperCase() || 'P';
}

function performerLabel(highlight: Highlight, performers: BroadcastGameCastProps['topPerformers']) {
  const candidates = (performers || []).filter(player => Number(player.points || 0) > 0);
  const player = candidates[highlight.points === 3 ? 0 : 1] || candidates[0] || performers?.[0];
  if (!player?.name) return highlight.label;
  if (highlight.label === 'Chase-down block') return `${player.name} changes the shot`;
  return `${player.name}: ${highlight.label}`;
}

export default function BroadcastGameCast({
  awayAbbr,
  homeAbbr,
  awayScore,
  homeScore,
  era,
  actors,
  topPerformers = [],
}: BroadcastGameCastProps) {
  const [highlightIndex, setHighlightIndex] = useState(0);
  const phase = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const highlights = useMemo(() => EVENT_LIBRARY, []);
  const highlight = highlights[highlightIndex % highlights.length];
  const awayTotal = score(awayScore);
  const homeTotal = score(homeScore);
  const leader = awayTotal === homeTotal ? 'EVEN' : awayTotal > homeTotal ? awayAbbr : homeAbbr;
  const momentumLeft = awayTotal + homeTotal > 0
    ? Math.max(12, Math.min(88, 50 + ((homeTotal - awayTotal) / Math.max(12, awayTotal + homeTotal)) * 80))
    : 50;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(phase, {
        toValue: 1,
        duration: 2600,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    );
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 450, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 850, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    );
    animation.start();
    pulseAnimation.start();
    const interval = setInterval(() => {
      phase.setValue(0);
      setHighlightIndex(index => index + 1);
    }, 2800);
    return () => {
      clearInterval(interval);
      animation.stop();
      pulseAnimation.stop();
    };
  }, [phase, pulse]);

  const ballTranslateX = phase.interpolate({
    inputRange: [0, 0.55, 1],
    outputRange: [0, (highlight.ballPath[2] - highlight.ballPath[0]) * 3.1, (highlight.ballPath[2] - highlight.ballPath[0]) * 3.1],
  });
  const ballTranslateY = phase.interpolate({
    inputRange: [0, 0.55, 1],
    outputRange: [0, (highlight.ballPath[3] - highlight.ballPath[1]) * 3.4 - 40, (highlight.ballPath[3] - highlight.ballPath[1]) * 3.4],
  });
  const scorePopScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1.16] });
  const scorePopOpacity = pulse.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] });

  return (
    <View style={styles.wrap}>
      <View style={styles.scoreBug}>
        <View style={styles.scoreTeam}>
          <SportTeamLogo sport="nba" abbr={awayAbbr} era={era} style={styles.logo} fontSize={9} />
          <Text style={styles.scoreAbbr}>{awayAbbr}</Text>
          <Text style={styles.scoreNumber}>{awayTotal}</Text>
        </View>
        <View style={styles.clockBlock}>
          <Text style={styles.clock}>Broadcast GameCast</Text>
          <Text style={styles.clockSub}>{leader === 'EVEN' ? 'Even game' : `${leader} controls momentum`}</Text>
        </View>
        <View style={styles.scoreTeam}>
          <SportTeamLogo sport="nba" abbr={homeAbbr} era={era} style={styles.logo} fontSize={9} />
          <Text style={styles.scoreAbbr}>{homeAbbr}</Text>
          <Text style={styles.scoreNumber}>{homeTotal}</Text>
        </View>
      </View>

      <View style={styles.arena}>
        <View style={styles.crowd}>
          {Array.from({ length: 40 }).map((_, index) => (
            <View key={`seat-${index}`} style={[styles.seat, index % 5 === 0 && styles.seatAlt]} />
          ))}
        </View>
        <View style={styles.jumbotron}>
          <Text style={styles.jumbotronTitle}>LIVE LOOK</Text>
          <Text style={styles.jumbotronScore}>{awayAbbr} at {homeAbbr}</Text>
        </View>
        <View style={styles.spotlightLeft} />
        <View style={styles.spotlightRight} />

        <View style={styles.court}>
          <View style={styles.halfLine} />
          <View style={styles.centerCircle}><Text style={styles.centerLogo}>{homeAbbr}</Text></View>
          <View style={[styles.paint, styles.leftPaint]} />
          <View style={[styles.paint, styles.rightPaint]} />
          <View style={[styles.arc, styles.leftArc]} />
          <View style={[styles.arc, styles.rightArc]} />
          <View style={[styles.backboard, styles.leftBackboard]} />
          <View style={[styles.backboard, styles.rightBackboard]} />
          <View style={[styles.rim, styles.leftRim]} />
          <View style={[styles.rim, styles.rightRim]} />

          {actors.slice(0, 10).map((actor, index) => {
            const spot = BASE_SPOTS[index] || BASE_SPOTS[0];
            const direction = actor.side === highlight.scorerSide ? 1 : -1;
            const translateX = phase.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, direction * (6 + (index % 3) * 4), direction * (2 + (index % 2) * 3)] });
            const translateY = phase.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, index % 2 === 0 ? -10 : 8, index % 3 === 0 ? 6 : -4] });
            return (
              <Animated.View
                key={`${actor.id}-${index}`}
                style={[
                  styles.actor,
                  { left: `${spot.left}%`, top: `${spot.top}%`, transform: [{ translateX }, { translateY }] },
                  actor.identity.bodyBuild === 'big' && styles.actorBig,
                ]}
              >
                <View style={[styles.actorHead, styles[`skin_${actor.identity.skinTone}`]]} />
                <View style={[styles.actorJersey, { backgroundColor: actor.uniform.primary, borderColor: actor.uniform.secondary }]}>
                  <Text style={[styles.actorNumber, { color: actor.uniform.numberColor }]}>{actor.label || playerInitial(actor.name)}</Text>
                </View>
                <View style={styles.actorShadow} />
              </Animated.View>
            );
          })}

          <Animated.View
            style={[
              styles.ball,
              {
                left: `${highlight.ballPath[0]}%`,
                top: `${highlight.ballPath[1]}%`,
                transform: [{ translateX: ballTranslateX }, { translateY: ballTranslateY }],
              },
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.scorePop,
              {
                left: highlight.scoringSpot === 'arc' ? '62%' : '51%',
                top: highlight.scoringSpot === 'arc' ? '47%' : '73%',
                opacity: scorePopOpacity,
                transform: [{ scale: scorePopScale }],
              },
            ]}
          >
            <Text style={styles.scorePopText}>+{highlight.points}</Text>
          </Animated.View>
        </View>
      </View>

      <View style={styles.eventPanel}>
        <Text style={styles.eventLabel}>Visual Play Event</Text>
        <Text style={styles.eventTitle}>{performerLabel(highlight, topPerformers)}</Text>
        <Text style={styles.eventBody}>{highlight.description}</Text>
        <View style={styles.momentumTrack}>
          <View style={[styles.momentumMarker, { left: `${momentumLeft}%` }]} />
        </View>
        <View style={styles.momentumLabels}>
          <Text style={styles.momentumText}>{awayAbbr}</Text>
          <Text style={styles.momentumText}>Momentum</Text>
          <Text style={styles.momentumText}>{homeAbbr}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 8, borderWidth: 1, borderColor: '#163d2c', backgroundColor: '#070b0a', padding: 10, marginBottom: 14, gap: 10 },
  scoreBug: { minHeight: 74, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0f1513', borderWidth: 1, borderColor: '#20372d', borderRadius: 8, paddingHorizontal: 10 },
  scoreTeam: { width: 82, alignItems: 'center', gap: 2 },
  logo: { width: 28, height: 28 },
  scoreAbbr: { color: '#f4f4f4', fontSize: 11, fontWeight: '900' },
  scoreNumber: { color: '#00e58b', fontSize: 22, fontWeight: '900' },
  clockBlock: { flex: 1, alignItems: 'center', gap: 3 },
  clock: { color: '#ffffff', fontSize: 13, fontWeight: '900', textAlign: 'center' },
  clockSub: { color: '#888', fontSize: 10, fontWeight: '800', textAlign: 'center', textTransform: 'uppercase' },
  arena: { overflow: 'hidden', borderRadius: 8, borderWidth: 1, borderColor: '#0c8bdc', backgroundColor: '#07101c' },
  crowd: { height: 98, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-start', gap: 5, paddingHorizontal: 14, paddingTop: 16, backgroundColor: '#10294f' },
  seat: { width: 14, height: 20, borderRadius: 5, backgroundColor: '#12b5a6', opacity: 0.8 },
  seatAlt: { backgroundColor: '#5fe2dc', opacity: 0.55 },
  jumbotron: { position: 'absolute', top: 24, alignSelf: 'center', width: 116, minHeight: 52, borderRadius: 8, borderWidth: 3, borderColor: '#1f7ad6', backgroundColor: '#132846', alignItems: 'center', justifyContent: 'center', zIndex: 4 },
  jumbotronTitle: { color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 0 },
  jumbotronScore: { color: '#b6c6d7', fontSize: 10, fontWeight: '900', marginTop: 3 },
  spotlightLeft: { position: 'absolute', top: 0, left: 34, width: 76, height: 172, backgroundColor: '#ffffff30', transform: [{ skewX: '-12deg' }], zIndex: 2 },
  spotlightRight: { position: 'absolute', top: 0, right: 34, width: 76, height: 172, backgroundColor: '#ffffff24', transform: [{ skewX: '12deg' }], zIndex: 2 },
  court: { height: 290, backgroundColor: '#d88b3a', borderTopWidth: 1, borderTopColor: '#2b1b10', overflow: 'hidden' },
  halfLine: { position: 'absolute', top: 0, bottom: 0, left: '50%', width: 3, backgroundColor: '#fff8e9' },
  centerCircle: { position: 'absolute', left: '41%', top: '39%', width: '18%', aspectRatio: 1, borderRadius: 999, borderWidth: 3, borderColor: '#fff8e9', backgroundColor: '#7e486055', alignItems: 'center', justifyContent: 'center' },
  centerLogo: { color: '#fff', fontSize: 18, fontWeight: '900' },
  paint: { position: 'absolute', top: '39%', width: '22%', height: '36%', borderWidth: 3, borderColor: '#fff8e9', backgroundColor: '#8e5d5244' },
  leftPaint: { left: 0 },
  rightPaint: { right: 0 },
  arc: { position: 'absolute', top: '31%', width: '35%', height: '50%', borderWidth: 3, borderColor: '#fff8e9', borderRadius: 999 },
  leftArc: { left: -56 },
  rightArc: { right: -56 },
  backboard: { position: 'absolute', top: '55%', width: 7, height: 72, borderRadius: 3, backgroundColor: '#e8eef9' },
  leftBackboard: { left: 18 },
  rightBackboard: { right: 18 },
  rim: { position: 'absolute', top: '62%', width: 21, height: 21, borderRadius: 11, borderWidth: 4, borderColor: '#ff7b2c' },
  leftRim: { left: 28 },
  rightRim: { right: 28 },
  actor: { position: 'absolute', width: 34, height: 54, alignItems: 'center', zIndex: 8 },
  actorBig: { transform: [{ scale: 1.08 }] },
  actorHead: { width: 18, height: 18, borderRadius: 10, borderWidth: 1, borderColor: '#1a100b' },
  skin_light: { backgroundColor: '#d8a06f' },
  skin_medium: { backgroundColor: '#ad7248' },
  skin_dark: { backgroundColor: '#7b482d' },
  skin_deep: { backgroundColor: '#4c291e' },
  actorJersey: { minWidth: 26, height: 26, borderRadius: 5, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: -2 },
  actorNumber: { fontSize: 10, fontWeight: '900' },
  actorShadow: { width: 26, height: 7, borderRadius: 13, backgroundColor: '#00000035', marginTop: -1 },
  ball: { position: 'absolute', width: 14, height: 14, borderRadius: 8, backgroundColor: '#ff741f', borderWidth: 2, borderColor: '#ffd2a8', zIndex: 20 },
  scorePop: { position: 'absolute', width: 48, height: 35, borderRadius: 999, backgroundColor: '#00e58b', alignItems: 'center', justifyContent: 'center', zIndex: 30 },
  scorePopText: { color: '#00150d', fontSize: 18, fontWeight: '900' },
  eventPanel: { backgroundColor: '#101010', borderRadius: 8, borderWidth: 1, borderColor: '#202020', padding: 12 },
  eventLabel: { color: '#00e58b', fontSize: 10, fontWeight: '900', textTransform: 'uppercase', marginBottom: 5 },
  eventTitle: { color: '#fff', fontSize: 15, fontWeight: '900' },
  eventBody: { color: '#9d9d9d', fontSize: 12, fontWeight: '700', lineHeight: 17, marginTop: 4 },
  momentumTrack: { height: 6, borderRadius: 999, backgroundColor: '#222', marginTop: 12 },
  momentumMarker: { position: 'absolute', top: -5, width: 16, height: 16, marginLeft: -8, borderRadius: 8, backgroundColor: '#00e58b', borderWidth: 2, borderColor: '#063520' },
  momentumLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 7 },
  momentumText: { color: '#777', fontSize: 10, fontWeight: '900' },
});
