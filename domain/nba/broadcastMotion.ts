import type { BroadcastActor } from './broadcastActors';
import type { BroadcastScene } from './broadcastDirector';

export type BroadcastMotionPlayer = {
  actor: BroadcastActor;
  id: string;
  side: 'home' | 'away';
  slot: number;
  x: number;
  y: number;
  stage: BroadcastStageAnchor;
  role: 'handler' | 'wing' | 'corner' | 'big' | 'defender';
  action: 'run' | 'space' | 'defend' | 'shoot' | 'finish' | 'rebound' | 'block' | 'fall' | 'celebrate' | 'sportsmanship' | 'exit';
  riveState: BroadcastRiveState;
  moment: BroadcastAnimationMoment;
  intensity: BroadcastAnimationIntensity;
};

export type BroadcastStageAnchor = {
  x: number;
  y: number;
  scale: number;
  zIndex: number;
};

export type BroadcastAnimationIntensity = 'ambient' | 'normal' | 'highlight';
export type BroadcastAnimationMoment = 'flow' | 'shot' | 'deep_three' | 'rim_finish' | 'poster' | 'ankle_breaker' | 'block' | 'rebound' | 'steal' | 'turnover' | 'postgame';
export type BroadcastRiveState =
  | 'idle'
  | 'run'
  | 'space'
  | 'defend'
  | 'dribble_attack'
  | 'runout_dribble'
  | 'jump_shot'
  | 'deep_three_release'
  | 'rim_finish'
  | 'dunk_finish'
  | 'poster_fall'
  | 'stumble_fall'
  | 'rebound_gather'
  | 'block_jump'
  | 'turnover_react'
  | 'celebrate'
  | 'sportsmanship'
  | 'locker_exit';

export type BroadcastMotionFrame = {
  players: BroadcastMotionPlayer[];
  ball: {
    x: number;
    y: number;
    detached: boolean;
  };
};

const SLOT_X = [50, 24, 76, 36, 64];
const SLOT_LANE_Y = [50, 42, 58, 35, 65];
const ROLE_BY_SLOT: BroadcastMotionPlayer['role'][] = ['handler', 'wing', 'corner', 'wing', 'big'];

function animationMomentForScene(scene: BroadcastScene): BroadcastAnimationMoment {
  if (scene.type === 'deep_three') return 'deep_three';
  if (scene.type === 'three' || scene.type === 'free_throw' || scene.type === 'miss') return 'shot';
  if (scene.type === 'dunk') return 'poster';
  if (scene.type === 'rim_finish') return 'rim_finish';
  if (scene.type === 'ankle_breaker') return 'ankle_breaker';
  if (scene.type === 'block') return 'block';
  if (scene.type === 'rebound') return 'rebound';
  if (scene.type === 'steal') return 'steal';
  if (scene.type === 'turnover') return 'turnover';
  if (scene.type === 'postgame') return 'postgame';
  return 'flow';
}

function intensityFor({ scene, action }: { scene: BroadcastScene; action: BroadcastMotionPlayer['action'] }): BroadcastAnimationIntensity {
  if (scene.type === 'dunk' || scene.type === 'ankle_breaker' || scene.type === 'deep_three') return 'highlight';
  if (action === 'shoot' || action === 'finish' || action === 'block' || action === 'rebound' || action === 'fall' || action === 'celebrate') return 'highlight';
  if (scene.type === 'flow') return 'ambient';
  return 'normal';
}

function riveStateFor({ scene, action, actor, offense }: { scene: BroadcastScene; action: BroadcastMotionPlayer['action']; actor: BroadcastActor; offense: boolean }): BroadcastRiveState {
  if (action === 'celebrate') return 'celebrate';
  if (action === 'sportsmanship') return 'sportsmanship';
  if (action === 'exit') return 'locker_exit';
  if (action === 'block') return 'block_jump';
  if (action === 'rebound') return 'rebound_gather';
  if (scene.type === 'turnover' && offense && actor.slot === 0) return 'turnover_react';
  if (scene.type === 'steal' && offense && actor.slot === 0) return 'runout_dribble';
  if (scene.type === 'ankle_breaker' && action === 'fall') return 'stumble_fall';
  if (scene.type === 'ankle_breaker' && offense && actor.slot === 0) return 'dribble_attack';
  if (scene.type === 'dunk' && action === 'fall') return 'poster_fall';
  if (scene.type === 'dunk' && action === 'finish') return 'dunk_finish';
  if (scene.type === 'rim_finish' && action === 'finish') return 'rim_finish';
  if (scene.type === 'deep_three' && action === 'shoot') return 'deep_three_release';
  if ((scene.type === 'three' || scene.type === 'free_throw' || scene.type === 'miss') && action === 'shoot') return 'jump_shot';
  if (action === 'run') return 'run';
  if (action === 'space') return 'space';
  if (action === 'defend') return 'defend';
  return 'idle';
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function smooth(value: number) {
  return value * value * (3 - 2 * value);
}

function interpolate(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
}

function possessionSide(scene: BroadcastScene, tick: number): 'home' | 'away' {
  if (scene.side === 'home' || scene.side === 'away') return scene.side;
  return Math.floor(tick / 80) % 2 === 0 ? 'home' : 'away';
}

function possessionProgress(tick: number) {
  return smooth((tick % 80) / 79);
}

function attackingRimX(side: 'home' | 'away') {
  return side === 'home' ? 82 : 18;
}

function offenseX({ side, slot, progress, scene }: { side: 'home' | 'away'; slot: number; progress: number; scene: BroadcastScene }) {
  const start = side === 'home'
    ? [22, 15, 25, 18, 31][slot]
    : [78, 85, 75, 82, 69][slot];
  const rim = attackingRimX(side);
  const actionTarget = scene.type === 'deep_three' ? (side === 'home' ? 58 : 42)
    : scene.type === 'three' ? (side === 'home' ? 62 : 38)
      : scene.type === 'dunk' || scene.type === 'rim_finish' || scene.type === 'rebound' || scene.type === 'block'
        ? rim
        : scene.type === 'steal'
          ? (side === 'home' ? 70 : 30)
        : side === 'home' ? 66 : 34;
  const end = slot === 0 ? actionTarget : interpolate(actionTarget, 50, [0, 0.3, -0.28, 0.12, -0.08][slot] + 0.5);
  return interpolate(start, end, progress);
}

function defenseX({ offenseSide, slot, progress, scene }: { offenseSide: 'home' | 'away'; slot: number; progress: number; scene: BroadcastScene }) {
  const start = offenseSide === 'home'
    ? [72, 79, 69, 82, 64][slot]
    : [28, 21, 31, 18, 36][slot];
  if (scene.type === 'ankle_breaker' && slot === 0) {
    return interpolate(start, offenseSide === 'home' ? 32 : 68, progress);
  }
  const rim = attackingRimX(offenseSide);
  const collapse = scene.type === 'dunk' || scene.type === 'rim_finish' || scene.type === 'block' || scene.type === 'rebound';
  const end = collapse
    ? rim + [0, -5, 5, -8, 2][slot] * (offenseSide === 'home' ? -1 : 1)
    : offenseSide === 'home' ? [68, 74, 62, 78, 59][slot] : [32, 26, 38, 22, 41][slot];
  return interpolate(start, end, progress);
}

function laneY(slot: number, tick: number, offense: boolean) {
  const drift = Math.sin((tick + slot * 13) / 17) * (offense ? 3.6 : 2.2);
  return SLOT_LANE_Y[slot] + drift;
}

function stageAnchorFor({ x, y, actor, action }: { x: number; y: number; actor: BroadcastActor; action: BroadcastMotionPlayer['action'] }): BroadcastStageAnchor {
  const depth = clamp(y, 8, 92) / 100;
  const bodyScale = actor.identity.bodyBuild === 'big' ? 1.12 : actor.identity.bodyBuild === 'wing' ? 1.04 : 0.96;
  const actionScale = action === 'finish' || action === 'block' || action === 'rebound' ? 1.08 : action === 'fall' ? 1.04 : 1;
  const perspective = 0.72 + depth * 0.5;
  return {
    x: clamp(x, 6, 94),
    y: clamp(38 + depth * 27, 39, 66),
    scale: Number((bodyScale * actionScale * perspective).toFixed(3)),
    zIndex: Math.round(depth * 1000 + actor.slot),
  };
}

function buildPostgamePlayers(actors: BroadcastActor[], scene: BroadcastScene, tick: number): BroadcastMotionPlayer[] {
  const winner = scene.side === 'away' ? 'away' : 'home';
  return actors.map(actor => {
    const wave = Math.sin((tick + actor.slot * 7) / 7);
    if (scene.postgameStage === 'celebration') {
      const celebrating = actor.side === winner;
      const action: BroadcastMotionPlayer['action'] = celebrating ? 'celebrate' : 'defend';
      const x = celebrating ? 42 + actor.slot * 4.2 : SLOT_X[actor.slot];
      const y = celebrating ? 45 + wave * 3 : actor.side === 'home' ? 72 - actor.slot * 2 : 24 + actor.slot * 2;
      return {
        actor,
        id: actor.id,
        side: actor.side,
        slot: actor.slot,
        x,
        y,
        stage: stageAnchorFor({ x, y, actor, action }),
        role: actor.slot === 0 ? 'handler' : ROLE_BY_SLOT[actor.slot] || 'wing',
        action,
        riveState: riveStateFor({ scene, action, actor, offense: false }),
        moment: 'postgame',
        intensity: intensityFor({ scene, action }),
      };
    }
    if (scene.postgameStage === 'sportsmanship') {
      const action: BroadcastMotionPlayer['action'] = 'sportsmanship';
      const x = 20 + actor.slot * 10;
      const y = actor.side === 'home' ? 53 : 45;
      return {
        actor,
        id: actor.id,
        side: actor.side,
        slot: actor.slot,
        x,
        y,
        stage: stageAnchorFor({ x, y, actor, action }),
        role: actor.slot === 0 ? 'handler' : ROLE_BY_SLOT[actor.slot] || 'wing',
        action,
        riveState: riveStateFor({ scene, action, actor, offense: false }),
        moment: 'postgame',
        intensity: intensityFor({ scene, action }),
      };
    }
    const action: BroadcastMotionPlayer['action'] = 'exit';
    const x = SLOT_X[actor.slot];
    const y = actor.side === 'home' ? 92 - actor.slot * 2 : 8 + actor.slot * 2;
    return {
      actor,
      id: actor.id,
      side: actor.side,
      slot: actor.slot,
      x,
      y,
      stage: stageAnchorFor({ x, y, actor, action }),
      role: actor.slot === 0 ? 'handler' : ROLE_BY_SLOT[actor.slot] || 'wing',
      action,
      riveState: riveStateFor({ scene, action, actor, offense: false }),
      moment: 'postgame',
      intensity: intensityFor({ scene, action }),
    };
  });
}

function actionForScene(scene: BroadcastScene, actor: BroadcastActor, offense: boolean): BroadcastMotionPlayer['action'] {
  if (!offense) {
    if (scene.type === 'dunk' && actor.slot === 4) return 'fall';
    if (scene.type === 'ankle_breaker' && actor.slot === 0) return 'fall';
    if (scene.type === 'block') return actor.slot === 4 ? 'block' : 'defend';
    if (scene.type === 'rebound') return actor.slot === 4 ? 'rebound' : 'defend';
    return 'defend';
  }
  if (actor.slot === 0 && (scene.type === 'three' || scene.type === 'deep_three')) return 'shoot';
  if (actor.slot === 0 && (scene.type === 'dunk' || scene.type === 'rim_finish')) return 'finish';
  if (actor.slot === 0 && scene.type === 'ankle_breaker') return 'run';
  if (actor.slot === 0 && scene.type === 'steal') return 'run';
  return actor.slot === 0 ? 'run' : 'space';
}

export function buildBroadcastMotionFrame({ actors, scene, tick }: { actors: BroadcastActor[]; scene: BroadcastScene; tick: number }): BroadcastMotionFrame {
  if (scene.type === 'postgame') {
    const players = buildPostgamePlayers(actors, scene, tick);
    return {
      players,
      ball: { x: 50, y: 50, detached: true },
    };
  }

  const side = possessionSide(scene, tick);
  const progress = possessionProgress(tick);
  const rimX = attackingRimX(side);
  const rimY = 50;
  const players = actors.map(actor => {
    const offense = actor.side === side;
    const slot = actor.slot;
    const cut = Math.sin((tick + slot * 11) / 14) * (offense ? 1.6 : 0.8);
    const x = offense
      ? offenseX({ side, slot, progress, scene })
      : defenseX({ offenseSide: side, slot, progress, scene });
    const eventLane = scene.side !== 'neutral' && slot === 0 ? scene.y : SLOT_LANE_Y[slot];
    const y = scene.type === 'ankle_breaker' && !offense && slot === 0
      ? interpolate(laneY(slot, tick, offense), 50, progress)
      : scene.type === 'dunk' || scene.type === 'rim_finish' || scene.type === 'block' || scene.type === 'rebound'
      ? interpolate(laneY(slot, tick, offense), 50 + [0, -5, 5, -8, 6][slot], progress)
      : interpolate(laneY(slot, tick, offense), eventLane, offense && slot === 0 ? 0.35 : 0);
    const sceneXShift = scene.type === 'deep_three' || scene.type === 'three'
      ? (slot === 0 ? 0 : slot % 2 === 0 ? 3 : -3)
      : scene.type === 'dunk' || scene.type === 'rim_finish'
        ? (slot === 0 ? 0 : slot % 2 === 0 ? 3 : -3)
        : 0;
    const action = actionForScene(scene, actor, offense);
    const playerX = clamp(x + sceneXShift + cut, 8, 92);
    const playerY = clamp(y, 6, 94);
    return {
      actor,
      id: actor.id,
      side: actor.side,
      slot,
      x: playerX,
      y: playerY,
      stage: stageAnchorFor({ x: playerX, y: playerY, actor, action }),
      role: offense ? (slot === 0 ? 'handler' : ROLE_BY_SLOT[slot] || 'wing') : 'defender',
      action,
      riveState: riveStateFor({ scene, action, actor, offense }),
      moment: animationMomentForScene(scene),
      intensity: intensityFor({ scene, action }),
    };
  });

  const handler = players.find(player => player.side === side && player.slot === 0);
  const shotProgress = clamp((progress - 0.18) / 0.58, 0, 1);
  const shotArc = Math.sin(shotProgress * Math.PI) * 11;
  const isShot = ['three', 'deep_three', 'dunk', 'rim_finish', 'free_throw', 'miss'].includes(scene.type);
  const ball = scene.type === 'turnover' && scene.side !== 'neutral'
    ? {
        x: clamp((handler?.x || scene.x) + (side === 'home' ? -12 : 12), 8, 92),
        y: clamp((handler?.y || scene.y) + Math.sin(tick / 4) * 5, 5, 95),
        detached: true,
      }
    : isShot && scene.side !== 'neutral'
    ? {
        x: clamp(interpolate(handler?.x || scene.x, rimX, shotProgress), 8, 92),
        y: clamp(interpolate(handler?.y || scene.y, rimY, shotProgress) - shotArc, 5, 95),
        detached: shotProgress > 0.12,
      }
    : {
        x: clamp((handler?.x || 50) + (side === 'home' ? 2 : -2), 8, 92),
        y: clamp((handler?.y || 50) + Math.sin(tick / 5) * 1.5, 5, 95),
        detached: false,
      };

  return { players, ball };
}
