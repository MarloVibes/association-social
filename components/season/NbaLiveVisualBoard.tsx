import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import SportTeamLogo from '@/components/SportTeamLogo';
import type { ArenaTheme } from '@/domain/nba/arenaTheme';
import { buildBasketballMotionFrame, type LiveVisualBoardState } from '@/domain/nba/liveVisualBoard';

export type NbaLiveVisualBoardProps = {
  width: number;
  state: LiveVisualBoardState;
  homeAbbr: string;
  awayAbbr: string;
  homeScore: number;
  awayScore: number;
  clock: string;
  period: string;
  theme: ArenaTheme;
  era?: any;
  isFinal?: boolean;
};

const VIEWBOX_WIDTH = 94;
const VIEWBOX_HEIGHT = 50;
const WOOD_STRIPS = Array.from({ length: 16 }, (_, index) => index);
const SCORE_POP_VALUES = new Set(['+2', '+3']);
const MOTION_STEPS = 96;

function x(value: number) {
  return (value / 100) * VIEWBOX_WIDTH;
}

function y(value: number) {
  return (value / 100) * VIEWBOX_HEIGHT;
}

function scoreText(value: number) {
  return Number.isFinite(value) ? String(value) : '0';
}

function scorePopText(value: string) {
  return SCORE_POP_VALUES.has(value) ? value : '';
}

function tokenText(label: string) {
  const raw = String(label || '').trim();
  const digit = raw.match(/\d+$/)?.[0];
  return digit || raw.slice(0, 2).toUpperCase() || '5';
}

function translucentColor(value: string | null | undefined, alpha: string, fallback: string) {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) && /^[0-9a-f]{2}$/i.test(alpha) ? `${color}${alpha}` : fallback;
}

export default function NbaLiveVisualBoard({
  width,
  state,
  homeAbbr,
  awayAbbr,
  homeScore,
  awayScore,
  clock,
  period,
  theme,
  era,
  isFinal = false,
}: NbaLiveVisualBoardProps) {
  const boardWidth = Math.max(280, Math.min(width, 430));
  const boardHeight = Math.round(boardWidth * (VIEWBOX_HEIGHT / VIEWBOX_WIDTH));
  const [motionTick, setMotionTick] = useState(0);
  const scorePopOpacity = useSharedValue(0);
  const scorePopLift = useSharedValue(0);
  const homeAccent = theme.primary || '#006bb6';
  const awayAccent = '#5d76a9';
  const homeText = theme.text || '#ffffff';
  const paintHome = translucentColor(homeAccent, '70', 'rgba(0,43,92,0.56)');
  const paintAway = translucentColor(awayAccent, '66', 'rgba(93,118,169,0.42)');
  const scorePop = state.scorePop;

  useEffect(() => {
    setMotionTick(0);
  }, [state.motionCue.id]);

  useEffect(() => {
    if (isFinal) return;
    const interval = setInterval(() => {
      setMotionTick(value => (value + 1) % MOTION_STEPS);
    }, 140);
    return () => clearInterval(interval);
  }, [isFinal, state.motionCue.id]);

  const motionFrame = useMemo(() => buildBasketballMotionFrame({
    progress: motionTick / MOTION_STEPS,
    cue: state.motionCue,
  }), [motionTick, state.motionCue]);

  useEffect(() => {
    if (!scorePop) {
      scorePopOpacity.value = withTiming(0, { duration: 120 });
      scorePopLift.value = 0;
      return;
    }
    scorePopOpacity.value = 1;
    scorePopLift.value = 0;
    scorePopOpacity.value = withTiming(0, { duration: 1150 });
    scorePopLift.value = withTiming(-22, { duration: 1150 });
  }, [scorePop, scorePopLift, scorePopOpacity]);

  const scorePopStyle = useAnimatedStyle(() => ({
    opacity: scorePopOpacity.value,
    transform: [{ translateY: scorePopLift.value }],
  }));

  return (
    <View style={styles.wrap}>
      <View style={[styles.scorebug, { borderColor: theme.scoreboardTint, backgroundColor: translucentColor(homeAccent, '1f', 'rgba(255,255,255,0.06)') }]}>
        <View style={styles.scoreTeam}>
          <View style={styles.scoreLogoShell}>
            <SportTeamLogo sport="nba" abbr={awayAbbr} era={era} style={styles.scoreLogo} fontSize={8} />
          </View>
          <Text numberOfLines={1} style={styles.scoreTeamName}>{awayAbbr}</Text>
          <Text style={[styles.scoreValue, { color: awayScore > homeScore ? '#ffffff' : '#b8b8b8' }]}>{scoreText(awayScore)}</Text>
        </View>
        <View style={styles.scoreClock}>
          <Text style={[styles.clockText, { color: homeText }]}>{clock}</Text>
          <Text numberOfLines={1} style={styles.periodText}>{period}</Text>
        </View>
        <View style={styles.scoreTeam}>
          <View style={[styles.scoreLogoShell, { borderColor: theme.secondary || '#3a3a3a' }]}>
            <SportTeamLogo sport="nba" abbr={homeAbbr} era={era} style={styles.scoreLogo} fontSize={8} />
          </View>
          <Text numberOfLines={1} style={styles.scoreTeamName}>{homeAbbr}</Text>
          <Text style={[styles.scoreValue, { color: homeScore >= awayScore ? homeText : '#b8b8b8' }]}>{scoreText(homeScore)}</Text>
        </View>
      </View>

      <View style={[styles.arena, { borderColor: theme.scoreboardTint }]}>
        <View style={[styles.crowdGlow, { backgroundColor: translucentColor(theme.crowdGlow, '33', 'rgba(255,255,255,0.08)') }]} />
        <View style={styles.courtShell}>
          <Svg width={boardWidth} height={boardHeight} viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}>
            <Rect x="0" y="0" width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} fill="#c88446" />
            {WOOD_STRIPS.map(index => (
              <Rect
                key={index}
                x={index * (VIEWBOX_WIDTH / WOOD_STRIPS.length)}
                y="0"
                width={VIEWBOX_WIDTH / WOOD_STRIPS.length}
                height={VIEWBOX_HEIGHT}
                fill={index % 3 === 0 ? '#d79a59' : index % 3 === 1 ? '#bd783d' : '#e0a466'}
                opacity={0.96}
              />
            ))}
            {WOOD_STRIPS.map(index => (
              <Line
                key={`plank-${index}`}
                x1={index * (VIEWBOX_WIDTH / WOOD_STRIPS.length)}
                y1="0"
                x2={index * (VIEWBOX_WIDTH / WOOD_STRIPS.length)}
                y2={VIEWBOX_HEIGHT}
                stroke="rgba(80,35,8,0.28)"
                strokeWidth="0.16"
              />
            ))}
            <Rect x="0" y="0" width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} fill="rgba(255,255,255,0.05)" />
            <Rect x="0.45" y="0.45" width="93.1" height="49.1" rx="1.2" fill="none" stroke="rgba(255,255,255,0.92)" strokeWidth="0.9" />

            <Line x1="47" y1="0" x2="47" y2="50" stroke="rgba(255,255,255,0.92)" strokeWidth="0.9" />
            <Circle cx="47" cy="25" r="6" fill="none" stroke="rgba(255,255,255,0.92)" strokeWidth="0.9" />
            <Circle cx="47" cy="25" r="3.9" fill={translucentColor(homeAccent, 'c2', 'rgba(0,43,92,0.76)')} stroke={theme.secondary || '#f58426'} strokeWidth="0.7" />
            <Path d="M47 21.7l3.6 3.3-3.6 3.3-3.6-3.3z" fill={theme.secondary || '#f58426'} opacity={0.9} />
            <SvgText x="47" y="26.05" fill="#ffffff" fontSize="3.5" fontWeight="900" textAnchor="middle">
              {homeAbbr.slice(0, 3)}
            </SvgText>

            <Rect x="0" y="17" width="19" height="16" fill={paintAway} />
            <Rect x="75" y="17" width="19" height="16" fill={paintHome} />
            <Rect x="0.45" y="17" width="18.55" height="16" fill="none" stroke="rgba(255,255,255,0.92)" strokeWidth="0.9" />
            <Rect x="75" y="17" width="18.55" height="16" fill="none" stroke="rgba(255,255,255,0.92)" strokeWidth="0.9" />
            <Path d="M0 5.4h8.8M0 44.6h8.8M94 5.4h-8.8M94 44.6h-8.8" fill="none" stroke="rgba(255,255,255,0.92)" strokeWidth="0.9" />
            <Path d="M8.8 5.4A21 21 0 0 1 8.8 44.6" fill="none" stroke="rgba(255,255,255,0.92)" strokeWidth="0.9" />
            <Path d="M85.2 5.4A21 21 0 0 0 85.2 44.6" fill="none" stroke="rgba(255,255,255,0.92)" strokeWidth="0.9" />
            <Path d="M5.1 20.8A4.2 4.2 0 0 1 5.1 29.2" fill="none" stroke="rgba(255,255,255,0.62)" strokeWidth="0.65" />
            <Path d="M88.9 20.8A4.2 4.2 0 0 0 88.9 29.2" fill="none" stroke="rgba(255,255,255,0.62)" strokeWidth="0.65" />

            <Rect x="4.65" y="20.2" width="0.8" height="9.6" rx="0.35" fill="rgba(255,255,255,0.96)" />
            <Rect x="88.55" y="20.2" width="0.8" height="9.6" rx="0.35" fill="rgba(255,255,255,0.96)" />
            <Circle cx="7.15" cy="25" r="1.55" fill="none" stroke={theme.secondary || '#f97316'} strokeWidth="1.45" />
            <Circle cx="86.85" cy="25" r="1.55" fill="none" stroke={theme.secondary || '#f97316'} strokeWidth="1.45" />
            <Path d="M6.1 25.4l1 1.8 1-1.8M85.8 25.4l1 1.8 1-1.8" fill="none" stroke="rgba(255,255,255,0.58)" strokeWidth="0.45" />

            {motionFrame.players.map(player => {
              const playerX = x(player.x);
              const playerY = y(player.y);
              const isHome = player.side === 'home';
              return (
                <G key={player.id}>
                  <Circle
                    cx={playerX}
                    cy={playerY}
                    r={player.active ? 3.5 : 3}
                    fill={player.active ? '#061f16' : isHome ? translucentColor(homeAccent, 'e6', '#11204c') : '#111111'}
                    stroke={player.active ? '#00e58b' : isHome ? theme.secondary || '#6fa5ff' : '#ffffff'}
                    strokeWidth="1.1"
                  />
                  <SvgText x={playerX} y={playerY + 1.1} fill="#ffffff" fontSize="3.7" fontWeight="900" textAnchor="middle">
                    {tokenText(player.label)}
                  </SvgText>
                </G>
              );
            })}

            <Circle cx={x(motionFrame.ball.x)} cy={y(motionFrame.ball.y)} r="1.35" fill="#f97316" stroke="#fff1d6" strokeWidth="0.55" />
          </Svg>
          {scorePop ? (
            <Animated.Text
              key={scorePop.id}
              pointerEvents="none"
              style={[
                styles.scorePop,
                {
                  left: `${scorePop.x}%`,
                  top: `${scorePop.y}%`,
                  color: scorePop.side === 'home' ? homeText : '#ffffff',
                },
                scorePopStyle,
              ]}
            >
              {scorePopText(scorePop.value)}
            </Animated.Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  scorebug: { minHeight: 74, borderRadius: 8, borderWidth: 1, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  scoreTeam: { flex: 1, minWidth: 0, alignItems: 'center', gap: 3 },
  scoreLogoShell: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: '#2f2f2f', backgroundColor: '#161616', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  scoreLogo: { width: 30, height: 30 },
  scoreTeamName: { color: '#ffffff', fontSize: 13, fontWeight: '900', maxWidth: '100%' },
  scoreValue: { fontSize: 25, fontWeight: '900', fontVariant: ['tabular-nums'] },
  scoreClock: { width: 78, alignItems: 'center', gap: 4 },
  clockText: { fontSize: 17, fontWeight: '900', fontVariant: ['tabular-nums'] },
  periodText: { color: '#999999', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  arena: { borderWidth: 1, borderRadius: 8, backgroundColor: '#101010', padding: 12, overflow: 'hidden' },
  crowdGlow: { position: 'absolute', left: 18, right: 18, top: 18, bottom: 18, borderRadius: 8, opacity: 0.46 },
  courtShell: { alignSelf: 'center', borderRadius: 8, backgroundColor: '#141414', padding: 8, overflow: 'hidden' },
  scorePop: { position: 'absolute', marginLeft: -18, marginTop: -24, minWidth: 36, textAlign: 'center', fontSize: 24, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.75)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
});
