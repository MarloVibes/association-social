import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
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

const WOOD_STRIPS = Array.from({ length: 14 }, (_, index) => index);
const seatRows = Array.from({ length: 4 }, (_, row) => row);
const seatColumns = Array.from({ length: 14 }, (_, column) => column);
const ARENA_VIEWBOX_HEIGHT = 128;

function stageX(value: number) {
  return (value / 100) * 100;
}

function stageY(value: number) {
  return (value / 100) * ARENA_VIEWBOX_HEIGHT;
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
  const boardHeight = Math.round(boardWidth * 1.28);
  const scene = useMemo(() => buildBroadcastScene({ event, homeTeamId, awayTeamId, elapsedAfterFinalMs }), [awayTeamId, elapsedAfterFinalMs, event, homeTeamId]);
  const motionFrame = useMemo(() => buildBroadcastMotionFrame({ actors, scene, tick }), [actors, scene, tick]);
  const stagedPlayers = useMemo(() => [...motionFrame.players].sort((a, b) => a.stage.zIndex - b.stage.zIndex), [motionFrame.players]);
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
        <Svg width={boardWidth} height={boardHeight} viewBox={`0 0 100 ${ARENA_VIEWBOX_HEIGHT}`}>
          <Rect x="0" y="0" width="100" height={ARENA_VIEWBOX_HEIGHT} rx="2" fill="#071229" />
          <Rect x="0" y="0" width="100" height="52" fill="#10234f" />
          {seatRows.map(row => seatColumns.map(column => (
            <Rect
              key={`seat-${row}-${column}`}
              x={3 + column * 6.9}
              y={13 + row * 7.2}
              width="4.7"
              height="5.9"
              rx="1.4"
              fill={column % 3 === 0 ? '#00b7a8' : column % 3 === 1 ? '#18c7b9' : '#55d5ca'}
              opacity={0.55 + row * 0.08}
            />
          )))}
          <Path d="M8 7h11l-7 43H1z" fill="rgba(255,255,255,0.16)" />
          <Path d="M81 7h11l7 43H88z" fill="rgba(255,255,255,0.16)" />
          <Path d="M38 1h24l-4 49H42z" fill="rgba(255,255,255,0.18)" />
          <Rect x="35" y="8" width="30" height="18" rx="1.4" fill="#151b37" stroke={theme.secondary || '#ff3366'} strokeWidth="1" />
          <SvgText x="50" y="16" fill="#f8fafc" fontSize="5" fontWeight="900" textAnchor="middle">{scene.jumbotronCue}</SvgText>
          <SvgText x="50" y="22" fill="#cbd5e1" fontSize="2.8" fontWeight="900" textAnchor="middle">{awayAbbr} at {homeAbbr}</SvgText>
          <Rect x="43" y="29" width="14" height="3.2" rx="0.9" fill={theme.secondary || '#f97316'} />
          <Path d="M18 5h20l-5 70H9z" fill="rgba(255,255,255,0.1)" />
          <Path d="M62 5h20l9 70H67z" fill="rgba(255,255,255,0.1)" />
          <G id="broadcastFloor">
            <Path d="M0 52h100v76H0z" fill="#d9873d" />
            {WOOD_STRIPS.map(index => (
              <Rect key={index} x={index * (100 / WOOD_STRIPS.length)} y="52" width={100 / WOOD_STRIPS.length} height="76" fill={index % 3 === 0 ? '#f0ad5f' : index % 3 === 1 ? '#d8873e' : '#eaa459'} opacity={0.9} />
            ))}
          </G>
          <Path d="M4 124h92L82 60H18z" fill={translucentColor(homeAccent, '24', 'rgba(255,255,255,0.1)')} stroke="#fff7eb" strokeWidth="1" />
          <Line x1="50" y1="62" x2="50" y2="124" stroke="#fff7eb" strokeWidth="0.8" />
          <Circle cx="50" cy="94" r="8.2" fill={translucentColor(homeAccent, '99', 'rgba(0,107,182,0.58)')} stroke="#fff7eb" strokeWidth="0.8" />
          <Path d="M4 124a36 31 0 0 1 36-56" fill="none" stroke="#fff7eb" strokeWidth="0.8" />
          <Path d="M96 124a36 31 0 0 0-36-56" fill="none" stroke="#fff7eb" strokeWidth="0.8" />
          <Rect x="11" y="72" width="18" height="32" fill={translucentColor(awayAccent, '5f', 'rgba(93,118,169,0.38)')} stroke="#fff7eb" strokeWidth="0.65" />
          <Rect x="71" y="72" width="18" height="32" fill={translucentColor(homeAccent, '5f', 'rgba(0,107,182,0.38)')} stroke="#fff7eb" strokeWidth="0.65" />
          <G id="left-backboard">
            <Rect x="5" y="57" width="1.3" height="38" rx="0.4" fill="#d7e5ff" />
            <Rect x="6" y="55" width="12" height="8" fill="rgba(220,237,255,0.72)" stroke="#d7e5ff" strokeWidth="0.7" />
            <Rect x="9.6" y="57" width="5.2" height="4" fill="none" stroke="#ffffff" strokeWidth="0.5" />
            <Circle cx="18.8" cy="66" r="2" fill="none" stroke="#f97316" strokeWidth="0.9" />
            <Path d="M17.5 67.7q1.3 2.9 2.6 0" fill="none" stroke="#ffffff" strokeWidth="0.45" />
          </G>
          <G id="right-backboard">
            <Rect x="93.7" y="57" width="1.3" height="38" rx="0.4" fill="#d7e5ff" />
            <Rect x="82" y="55" width="12" height="8" fill="rgba(220,237,255,0.72)" stroke="#d7e5ff" strokeWidth="0.7" />
            <Rect x="85.2" y="57" width="5.2" height="4" fill="none" stroke="#ffffff" strokeWidth="0.5" />
            <Circle cx="81.2" cy="66" r="2" fill="none" stroke="#f97316" strokeWidth="0.9" />
            <Path d="M79.9 67.7q1.3 2.9 2.6 0" fill="none" stroke="#ffffff" strokeWidth="0.45" />
          </G>
          <Circle cx="12" cy="4" r="3.4" fill="rgba(255,255,255,0.9)" />
          <Circle cx="50" cy="3" r="3.4" fill="rgba(255,255,255,0.9)" />
          <Circle cx="88" cy="4" r="3.4" fill="rgba(255,255,255,0.9)" />
          <G id="spotlight">
            <Path d="M12 7L2 74h28z" fill="rgba(255,255,255,0.13)" />
            <Path d="M50 6L32 98h36z" fill="rgba(255,255,255,0.11)" />
            <Path d="M88 7L70 74h28z" fill="rgba(255,255,255,0.13)" />
          </G>
          <SvgText x="50" y="96.5" fill="#ffffff" fontSize="5.2" fontWeight="900" textAnchor="middle">{homeAbbr.slice(0, 3)}</SvgText>
          {stagedPlayers.map(player => {
            const actor = player.actor;
            const isBig = actor.identity.bodyBuild === 'big';
            const skin = actor.identity.skinTone === 'deep' ? '#5b321d' : actor.identity.skinTone === 'dark' ? '#7b4a2a' : actor.identity.skinTone === 'medium' ? '#b8754b' : '#d7a376';
            const actionLift = player.action === 'shoot' || player.action === 'block' ? -1.8 : player.action === 'celebrate' ? Math.sin(tick / 3 + actor.slot) * 1.8 : 0;
            const sx = stageX(player.stage.x);
            const sy = stageY(player.stage.y);
            const scale = player.stage.scale;
            const fallRotate = player.action === 'fall' ? (actor.side === 'home' ? -74 : 74) : 0;
            const fallY = player.action === 'fall' ? 3.2 : 0;
            const shadowWidth = (isBig ? 7.4 : 6.4) * scale;
            return (
              <G key={actor.id} data-rive-state={player.riveState} transform={`rotate(${fallRotate} ${sx} ${sy}) translate(0 ${fallY})`}>
                <Ellipse cx={sx} cy={sy + 5.7 * scale} rx={shadowWidth / 2} ry={1.35 * scale} fill="rgba(0,0,0,0.3)" />
                <G transform={`translate(${sx} ${sy}) scale(${scale}) translate(${-sx} ${-sy})`}>
                  <Circle cx={sx} cy={sy - (isBig ? 3.1 : 2.7) + actionLift} r={isBig ? 2.2 : 1.9} fill={skin} stroke="#111111" strokeWidth="0.25" />
                  <Rect x={sx - (isBig ? 2.6 : 2.2)} y={sy - 1.4 + actionLift} width={isBig ? 5.2 : 4.4} height={isBig ? 5.8 : 5.1} rx="0.9" fill={actor.uniform.primary} stroke={actor.uniform.secondary} strokeWidth="0.5" />
                  <SvgText x={sx} y={sy + 2.2 + actionLift} fill={actor.uniform.numberColor} fontSize="2.5" fontWeight="900" textAnchor="middle">{actor.label}</SvgText>
                </G>
              </G>
            );
          })}
          <Circle cx={stageX(motionFrame.ball.x)} cy={stageY(54 + motionFrame.ball.y * 0.6)} r="1.35" fill="#f97316" stroke="#fff1d6" strokeWidth="0.5" />
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
