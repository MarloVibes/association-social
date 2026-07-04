import type { BroadcastActor } from './broadcastActors';
import type { BroadcastScene } from './broadcastDirector';

export type BroadcastMotionPlayer = {
  actor: BroadcastActor;
  id: string;
  side: 'home' | 'away';
  slot: number;
  x: number;
  y: number;
  role: 'handler' | 'wing' | 'corner' | 'big' | 'defender';
  action: 'run' | 'space' | 'defend' | 'shoot' | 'finish' | 'rebound' | 'block' | 'celebrate' | 'sportsmanship' | 'exit';
};

export type BroadcastMotionFrame = {
  players: BroadcastMotionPlayer[];
  ball: {
    x: number;
    y: number;
    detached: boolean;
  };
};

const SLOT_X = [50, 24, 76, 36, 64];
const ROLE_BY_SLOT: BroadcastMotionPlayer['role'][] = ['handler', 'wing', 'corner', 'wing', 'big'];

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

function offenseY({ side, slot, progress }: { side: 'home' | 'away'; slot: number; progress: number }) {
  const start = side === 'home'
    ? [79, 86, 86, 70, 76][slot]
    : [17, 10, 10, 28, 22][slot];
  const end = side === 'home'
    ? [22, 31, 31, 43, 15][slot]
    : [74, 65, 65, 53, 83][slot];
  return interpolate(start, end, progress);
}

function defenseY({ offenseSide, slot, progress }: { offenseSide: 'home' | 'away'; slot: number; progress: number }) {
  const start = offenseSide === 'home'
    ? [28, 22, 22, 38, 17][slot]
    : [70, 76, 76, 60, 83][slot];
  const end = offenseSide === 'home'
    ? [18, 27, 27, 41, 12][slot]
    : [80, 69, 69, 57, 88][slot];
  return interpolate(start, end, progress);
}

function buildPostgamePlayers(actors: BroadcastActor[], scene: BroadcastScene, tick: number): BroadcastMotionPlayer[] {
  const winner = scene.side === 'away' ? 'away' : 'home';
  return actors.map(actor => {
    const wave = Math.sin((tick + actor.slot * 7) / 7);
    if (scene.postgameStage === 'celebration') {
      const celebrating = actor.side === winner;
      return {
        actor,
        id: actor.id,
        side: actor.side,
        slot: actor.slot,
        x: celebrating ? 42 + actor.slot * 4.2 : SLOT_X[actor.slot],
        y: celebrating ? 45 + wave * 3 : actor.side === 'home' ? 72 - actor.slot * 2 : 24 + actor.slot * 2,
        role: actor.slot === 0 ? 'handler' : ROLE_BY_SLOT[actor.slot] || 'wing',
        action: celebrating ? 'celebrate' : 'defend',
      };
    }
    if (scene.postgameStage === 'sportsmanship') {
      return {
        actor,
        id: actor.id,
        side: actor.side,
        slot: actor.slot,
        x: 20 + actor.slot * 10,
        y: actor.side === 'home' ? 53 : 45,
        role: actor.slot === 0 ? 'handler' : ROLE_BY_SLOT[actor.slot] || 'wing',
        action: 'sportsmanship',
      };
    }
    return {
      actor,
      id: actor.id,
      side: actor.side,
      slot: actor.slot,
      x: SLOT_X[actor.slot],
      y: actor.side === 'home' ? 92 - actor.slot * 2 : 8 + actor.slot * 2,
      role: actor.slot === 0 ? 'handler' : ROLE_BY_SLOT[actor.slot] || 'wing',
      action: 'exit',
    };
  });
}

function actionForScene(scene: BroadcastScene, actor: BroadcastActor, offense: boolean): BroadcastMotionPlayer['action'] {
  if (!offense) {
    if (scene.type === 'block') return actor.slot === 4 ? 'block' : 'defend';
    if (scene.type === 'rebound') return actor.slot === 4 ? 'rebound' : 'defend';
    return 'defend';
  }
  if (actor.slot === 0 && (scene.type === 'three' || scene.type === 'deep_three')) return 'shoot';
  if (actor.slot === 0 && (scene.type === 'dunk' || scene.type === 'rim_finish')) return 'finish';
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
  const attackingTop = side === 'home';
  const players = actors.map(actor => {
    const offense = actor.side === side;
    const slot = actor.slot;
    const cut = Math.sin((tick + slot * 11) / 14) * (offense ? 3 : 1.4);
    const eventAnchorX = slot === 0 && scene.side !== 'neutral' ? scene.x : SLOT_X[slot];
    const y = offense
      ? offenseY({ side, slot, progress })
      : defenseY({ offenseSide: side, slot, progress });
    const sceneXShift = scene.type === 'deep_three' || scene.type === 'three'
      ? (slot === 0 ? 0 : slot % 2 === 0 ? 5 : -5)
      : scene.type === 'dunk' || scene.type === 'rim_finish'
        ? (slot === 0 ? 0 : slot % 2 === 0 ? 7 : -7)
        : 0;
    return {
      actor,
      id: actor.id,
      side: actor.side,
      slot,
      x: clamp((offense ? eventAnchorX : SLOT_X[slot]) + sceneXShift + cut, 8, 92),
      y: clamp(y, 6, 94),
      role: offense ? (slot === 0 ? 'handler' : ROLE_BY_SLOT[slot] || 'wing') : 'defender',
      action: actionForScene(scene, actor, offense),
    };
  });

  const handler = players.find(player => player.side === side && player.slot === 0);
  const rimY = attackingTop ? 8 : 88;
  const rimX = 50;
  const shotProgress = clamp((progress - 0.18) / 0.58, 0, 1);
  const shotArc = Math.sin(shotProgress * Math.PI) * 11;
  const isShot = ['three', 'deep_three', 'dunk', 'rim_finish', 'free_throw', 'miss'].includes(scene.type);
  const ball = isShot && scene.side !== 'neutral'
    ? {
        x: clamp(interpolate(handler?.x || scene.x, rimX, shotProgress), 8, 92),
        y: clamp(interpolate(handler?.y || scene.y, rimY, shotProgress) - shotArc, 5, 95),
        detached: shotProgress > 0.12,
      }
    : {
        x: clamp((handler?.x || 50) + Math.sin(tick / 5) * 1.5, 8, 92),
        y: clamp((handler?.y || 50) + (attackingTop ? -3 : 3), 5, 95),
        detached: false,
      };

  return { players, ball };
}
