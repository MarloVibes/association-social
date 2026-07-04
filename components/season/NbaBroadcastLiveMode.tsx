import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import SportTeamLogo from '@/components/SportTeamLogo';
import type { ArenaTheme } from '@/domain/nba/arenaTheme';
import type { BroadcastActor } from '@/domain/nba/broadcastActors';
import { buildBroadcastScene, type BroadcastScene } from '@/domain/nba/broadcastDirector';
import { buildBroadcastMotionFrame } from '@/domain/nba/broadcastMotion';
import type { LiveTimelineEvent } from '@/domain/nba/liveTimeline';

export type NbaBroadcastLiveModeProps = {
  width: number;
  event: LiveTimelineEvent | null;
  homeTeamId: string;
  awayTeamId: string;
  homeAbbr: string;
  awayAbbr: string;
  homeScore: number;
  awayScore: number;
  clock: string;
  period: string;
  theme: ArenaTheme;
  era?: unknown;
  actors: BroadcastActor[];
  elapsedAfterFinalMs?: number;
};

const COURT_W = 60;
const COURT_H = 96;
const WOOD_STRIPS = Array.from({ length: 14 }, (_, index) => index);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function x(value: number) {
  return (value / 100) * COURT_W;
}

function y(value: number) {
  return (value / 100) * COURT_H;
}

function translucentColor(value: string | null | undefined, alpha: string, fallback: string) {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) && /^[0-9a-f]{2}$/i.test(alpha) ? `${color}${alpha}` : fallback;
}

function Jumbotron({ scene, homeAbbr, awayAbbr, theme }: { scene: BroadcastScene; homeAbbr: string; awayAbbr: string; theme: ArenaTheme }) {
  return (
    <View style={[styles.jumbotron, { borderColor: theme.secondary || '#2f2f2f' }]}>
      <Text style={styles.jumbotronKicker}>Jumbotron</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.jumbotronCue, { color: theme.text || '#ffffff' }]}>{scene.jumbotronCue}</Text>
      <Text numberOfLines={1} style={styles.jumbotronSub}>{awayAbbr} at {homeAbbr}</Text>
    </View>
  );
}

export default function NbaBroadcastLiveMode(props: NbaBroadcastLiveModeProps) {
  const {
    width,
    event,
    homeTeamId,
    awayTeamId,
    homeAbbr,
    awayAbbr,
    homeScore,
    awayScore,
    clock,
    period,
    theme,
    era,
    actors,
    elapsedAfterFinalMs = 0,
  } = props;
  const [tick, setTick] = useState(0);
  const boardWidth = Math.max(300, Math.min(width, 430));
  const boardHeight = Math.round(boardWidth * 1.56);
  const scene = useMemo(() => buildBroadcastScene({ event, homeTeamId, awayTeamId, elapsedAfterFinalMs }), [awayTeamId, elapsedAfterFinalMs, event, homeTeamId]);
  const motionFrame = useMemo(() => buildBroadcastMotionFrame({ actors, scene, tick }), [actors, scene, tick]);
  const homeAccent = theme.primary || '#006bb6';
  const awayAccent = '#5d76a9';
  const crowdOpacity = scene.crowdEnergy === 'eruption' ? 0.95 : scene.crowdEnergy === 'swell' ? 0.72 : scene.crowdEnergy === 'quiet' ? 0.28 : 0.46;

  useEffect(() => {
    const interval = setInterval(() => setTick(value => value + 1), 120);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.wrap}>
      <View style={[styles.scorebug, { borderColor: theme.scoreboardTint }]}>
        <View style={styles.scoreTeam}>
          <SportTeamLogo sport="nba" abbr={awayAbbr} era={era} style={styles.logo} fontSize={8} />
          <Text style={styles.teamText}>{awayAbbr}</Text>
          <Text style={styles.scoreText}>{awayScore}</Text>
        </View>
        <View style={styles.centerScore}>
          <Text style={[styles.clock, { color: theme.text || '#ffffff' }]}>{period} {clock}</Text>
          <Text style={styles.liveTag}>{scene.type === 'postgame' ? scene.postgameStage.replace('_', ' ') : 'LIVE BROADCAST'}</Text>
        </View>
        <View style={styles.scoreTeam}>
          <SportTeamLogo sport="nba" abbr={homeAbbr} era={era} style={styles.logo} fontSize={8} />
          <Text style={styles.teamText}>{homeAbbr}</Text>
          <Text style={styles.scoreText}>{homeScore}</Text>
        </View>
      </View>

      <Jumbotron scene={scene} homeAbbr={homeAbbr} awayAbbr={awayAbbr} theme={theme} />

      <View style={[styles.arena, { borderColor: theme.scoreboardTint }]}>
        <View style={[styles.crowd, { opacity: crowdOpacity }]}>
          {Array.from({ length: 42 }, (_, index) => (
            <View key={index} style={[styles.crowdDot, { backgroundColor: index % 4 === 0 ? homeAccent : index % 4 === 1 ? awayAccent : '#f8fafc' }]} />
          ))}
        </View>
        <Svg width={boardWidth} height={boardHeight} viewBox={`0 0 ${COURT_W} ${COURT_H}`}>
          <Rect x="0" y="0" width={COURT_W} height={COURT_H} rx="2" fill="#b8753b" />
          {WOOD_STRIPS.map(index => (
            <Rect key={index} x={index * (COURT_W / WOOD_STRIPS.length)} y="0" width={COURT_W / WOOD_STRIPS.length} height={COURT_H} fill={index % 3 === 0 ? '#d59755' : index % 3 === 1 ? '#c37b3f' : '#e1a766'} opacity={0.96} />
          ))}
          <Rect x="1" y="1" width={COURT_W - 2} height={COURT_H - 2} rx="1.4" fill="none" stroke="#fff7eb" strokeWidth="0.8" />
          <Line x1="1" y1="48" x2="59" y2="48" stroke="#fff7eb" strokeWidth="0.65" />
          <Circle cx="30" cy="48" r="7" fill={translucentColor(homeAccent, 'aa', 'rgba(0,107,182,0.66)')} stroke="#fff7eb" strokeWidth="0.55" />
          <SvgText x="30" y="49.4" fill="#ffffff" fontSize="4" fontWeight="900" textAnchor="middle">{homeAbbr.slice(0, 3)}</SvgText>
          <Rect x="17" y="1" width="26" height="18" fill={translucentColor(awayAccent, '66', 'rgba(93,118,169,0.4)')} stroke="#fff7eb" strokeWidth="0.55" />
          <Rect x="17" y="77" width="26" height="18" fill={translucentColor(homeAccent, '66', 'rgba(0,107,182,0.4)')} stroke="#fff7eb" strokeWidth="0.55" />
          <Path d="M14 1A23 23 0 0 0 46 1" fill="none" stroke="#fff7eb" strokeWidth="0.65" />
          <Path d="M14 95A23 23 0 0 1 46 95" fill="none" stroke="#fff7eb" strokeWidth="0.65" />
          <Circle cx="30" cy="15" r="5.2" fill="none" stroke="#fff7eb" strokeWidth="0.45" />
          <Circle cx="30" cy="81" r="5.2" fill="none" stroke="#fff7eb" strokeWidth="0.45" />
          <Rect x="24" y="5.5" width="12" height="1.2" rx="0.4" fill="#2f2f2f" />
          <Rect x="24" y="89.3" width="12" height="1.2" rx="0.4" fill="#2f2f2f" />
          <Circle cx="30" cy="8" r="1.5" fill="none" stroke="#f97316" strokeWidth="1" />
          <Circle cx="30" cy="88" r="1.5" fill="none" stroke="#f97316" strokeWidth="1" />
          {motionFrame.players.map(player => {
            const actor = player.actor;
            const isBig = actor.identity.bodyBuild === 'big';
            const skin = actor.identity.skinTone === 'deep' ? '#5b321d' : actor.identity.skinTone === 'dark' ? '#7b4a2a' : actor.identity.skinTone === 'medium' ? '#b8754b' : '#d7a376';
            const actionLift = player.action === 'shoot' || player.action === 'block' ? -1.8 : player.action === 'celebrate' ? Math.sin(tick / 3 + actor.slot) * 1.8 : 0;
            return (
              <G key={actor.id}>
                <Circle cx={x(clamp(player.x, 8, 92))} cy={y(clamp(player.y, 6, 94)) - (isBig ? 2.8 : 2.4) + actionLift} r={isBig ? 2.1 : 1.8} fill={skin} stroke="#111111" strokeWidth="0.25" />
                <Rect x={x(player.x) - (isBig ? 2.4 : 2)} y={y(player.y) - 1.3 + actionLift} width={isBig ? 4.8 : 4} height={isBig ? 5.5 : 4.8} rx="0.9" fill={actor.uniform.primary} stroke={actor.uniform.secondary} strokeWidth="0.45" />
                <SvgText x={x(player.x)} y={y(player.y) + 2 + actionLift} fill={actor.uniform.numberColor} fontSize="2.4" fontWeight="900" textAnchor="middle">{actor.label}</SvgText>
              </G>
            );
          })}
          <Circle cx={x(motionFrame.ball.x)} cy={y(motionFrame.ball.y)} r="1.35" fill="#f97316" stroke="#fff1d6" strokeWidth="0.5" />
        </Svg>
      </View>

      <View style={styles.caption}>
        <Text style={styles.captionKicker}>{scene.type === 'postgame' ? 'Locker Room Exit' : 'Visual Play Event'}</Text>
        <Text style={styles.captionText}>{scene.caption}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  scorebug: { borderWidth: 1, borderRadius: 8, padding: 10, minHeight: 76, flexDirection: 'row', alignItems: 'center' },
  scoreTeam: { flex: 1, alignItems: 'center', gap: 3 },
  logo: { width: 32, height: 32 },
  teamText: { color: '#ffffff', fontSize: 12, fontWeight: '900' },
  scoreText: { color: '#ffffff', fontSize: 24, fontWeight: '900', fontVariant: ['tabular-nums'] },
  centerScore: { width: 122, alignItems: 'center', gap: 4 },
  clock: { fontSize: 14, fontWeight: '900', fontVariant: ['tabular-nums'] },
  liveTag: { color: '#8b8b8b', fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  jumbotron: { borderWidth: 1, borderRadius: 8, backgroundColor: '#101010', padding: 10, alignItems: 'center' },
  jumbotronKicker: { color: '#777777', fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  jumbotronCue: { fontSize: 24, fontWeight: '900', letterSpacing: 0 },
  jumbotronSub: { color: '#a9a9a9', fontSize: 11, fontWeight: '800' },
  arena: { borderWidth: 1, borderRadius: 8, padding: 8, backgroundColor: '#050505', overflow: 'hidden' },
  crowd: { minHeight: 30, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 3, paddingBottom: 6 },
  crowdDot: { width: 4, height: 4, borderRadius: 2 },
  caption: { borderRadius: 8, borderWidth: 1, borderColor: '#202020', backgroundColor: '#101010', padding: 12 },
  captionKicker: { color: '#00e58b', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  captionText: { color: '#ffffff', fontSize: 15, fontWeight: '800', marginTop: 4 },
});
