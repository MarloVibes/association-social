# Broadcast Live Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an NBA Broadcast Live Mode that shows a watchable animated court with 2-bit/Rive-ready players, player likeness plus team-uniform logic, jumbotron/crowd reactions, event-directed basketball scenes, and a postgame celebration/sportsmanship/locker-room sequence.

**Architecture:** Keep the current Live Mode route and existing `NbaLiveVisualBoard` fallback stable while adding a separate broadcast projection/rendering path. Domain code derives compact broadcast scenes from the existing `liveTimeline` events; React Native components render the court, crowd, jumbotron, player actors, ball, and postgame sequence locally without storing animation frames in Firestore.

**Tech Stack:** Expo SDK 54, React Native, TypeScript, `react-native-svg`, `react-native-reanimated`, Vitest domain/source-safety tests, existing Firebase `liveTimeline` data.

---

## File Structure

- Create `domain/nba/broadcastActors.ts`: player visual identity, team uniform, and actor assembly helpers.
- Create `domain/nba/broadcastDirector.ts`: event-to-scene projection, coaching spacing hints, jumbotron/crowd state, endgame stage calculation.
- Create `tests/domain/broadcastActors.test.ts`: identity follows player while uniform follows current team.
- Create `tests/domain/broadcastDirector.test.ts`: basketball event types map to scenes, coaching affects hints, final sequence progresses.
- Create `components/season/NbaBroadcastLiveMode.tsx`: full broadcast surface with scorebug, jumbotron, crowd, portrait court, actors, ball, event caption.
- Modify `app/screens/season/live-mode.tsx`: select broadcast board for NBA games, preserve existing fallback.
- Modify `tests/domain/sourceSafety.test.ts`: guard broadcast wiring, no command-insight/possession panels, no huge replay writes.

## Task 1: Player Identity And Uniform Model

**Files:**
- Create: `domain/nba/broadcastActors.ts`
- Test: `tests/domain/broadcastActors.test.ts`

- [ ] **Step 1: Write the failing actor tests**

Create `tests/domain/broadcastActors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildBroadcastActor, buildBroadcastActorsForLineup } from '@/domain/nba/broadcastActors';

describe('broadcast actors', () => {
  it('keeps player likeness while applying the current team uniform after a trade', () => {
    const player = {
      playerId: 'tatum',
      name: 'Jayson Tatum',
      jerseyNumber: 0,
      position: 'SF',
      visualIdentity: {
        skinTone: 'medium',
        hairStyle: 'short-fade',
        hairColor: 'black',
        bodyBuild: 'wing',
        facialHair: 'beard',
        accessories: ['arm-sleeve'],
      },
    };

    const celticsActor = buildBroadcastActor({
      player,
      team: { teamId: 'BOS', abbreviation: 'BOS', primaryColor: '#007A33', secondaryColor: '#BA9653' },
      side: 'away',
      slot: 2,
    });
    const lakersActor = buildBroadcastActor({
      player,
      team: { teamId: 'LAL', abbreviation: 'LAL', primaryColor: '#552583', secondaryColor: '#FDB927' },
      side: 'home',
      slot: 2,
    });

    expect(lakersActor.identity).toEqual(celticsActor.identity);
    expect(celticsActor.uniform).toMatchObject({ teamId: 'BOS', primary: '#007A33', secondary: '#BA9653', number: '0' });
    expect(lakersActor.uniform).toMatchObject({ teamId: 'LAL', primary: '#552583', secondary: '#FDB927', number: '0' });
  });

  it('creates stable fallback identities for unaudited or generated players', () => {
    const actor = buildBroadcastActor({
      player: { playerId: 'rookie-42', name: 'Draft Prospect', position: 'C' },
      team: { teamId: 'MEM', abbreviation: 'MEM', primaryColor: '#5D76A9', secondaryColor: '#12173F' },
      side: 'home',
      slot: 4,
    });

    expect(actor.identity.skinTone).toMatch(/light|medium|dark|deep/);
    expect(actor.identity.bodyBuild).toBe('big');
    expect(actor.uniform.number).toBe('42');
    expect(actor.label).toBe('42');
  });

  it('builds exactly ten actors from two five-player lineups', () => {
    const actors = buildBroadcastActorsForLineup({
      homeTeam: { teamId: 'NYK', abbreviation: 'NYK', primaryColor: '#006BB6', secondaryColor: '#F58426' },
      awayTeam: { teamId: 'BOS', abbreviation: 'BOS', primaryColor: '#007A33', secondaryColor: '#BA9653' },
      homePlayers: Array.from({ length: 5 }, (_, index) => ({ playerId: `home-${index}`, name: `Home ${index}`, jerseyNumber: index + 1 })),
      awayPlayers: Array.from({ length: 5 }, (_, index) => ({ playerId: `away-${index}`, name: `Away ${index}`, jerseyNumber: index + 6 })),
    });

    expect(actors).toHaveLength(10);
    expect(actors.filter(actor => actor.side === 'home')).toHaveLength(5);
    expect(actors.filter(actor => actor.side === 'away')).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:domain -- broadcastActors`

Expected: FAIL because `domain/nba/broadcastActors.ts` does not exist.

- [ ] **Step 3: Implement actor helpers**

Create `domain/nba/broadcastActors.ts`:

```ts
export type BroadcastTeamUniformSource = {
  teamId?: string;
  id?: string;
  abbreviation?: string;
  primaryColor?: string | null;
  secondaryColor?: string | null;
};

export type BroadcastPlayerSource = {
  playerId?: string;
  player_id?: string;
  id?: string;
  name?: string;
  full_name?: string;
  jerseyNumber?: string | number | null;
  jersey_number?: string | number | null;
  number?: string | number | null;
  position?: string | null;
  visualIdentity?: Partial<BroadcastPlayerIdentity> | null;
};

export type BroadcastPlayerIdentity = {
  skinTone: 'light' | 'medium' | 'dark' | 'deep';
  hairStyle: 'short' | 'short-fade' | 'braids' | 'headband' | 'bald';
  hairColor: 'black' | 'brown' | 'blond';
  bodyBuild: 'guard' | 'wing' | 'big';
  facialHair: 'none' | 'goatee' | 'beard';
  accessories: string[];
};

export type BroadcastUniform = {
  teamId: string;
  abbr: string;
  primary: string;
  secondary: string;
  number: string;
  numberColor: string;
};

export type BroadcastActor = {
  id: string;
  name: string;
  label: string;
  side: 'home' | 'away';
  slot: number;
  position: string;
  identity: BroadcastPlayerIdentity;
  uniform: BroadcastUniform;
};

const DEFAULT_PRIMARY = '#1f2937';
const DEFAULT_SECONDARY = '#f8fafc';
const SKIN_TONES: BroadcastPlayerIdentity['skinTone'][] = ['light', 'medium', 'dark', 'deep'];
const HAIR_STYLES: BroadcastPlayerIdentity['hairStyle'][] = ['short', 'short-fade', 'braids', 'headband', 'bald'];

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function cleanHex(value: unknown, fallback: string) {
  const raw = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw : fallback;
}

function playerId(player: BroadcastPlayerSource) {
  return String(player.playerId || player.player_id || player.id || player.full_name || player.name || 'player').trim();
}

function playerName(player: BroadcastPlayerSource) {
  return String(player.name || player.full_name || playerId(player)).trim();
}

function jerseyNumber(player: BroadcastPlayerSource) {
  const raw = player.jerseyNumber ?? player.jersey_number ?? player.number;
  const text = String(raw ?? '').trim();
  if (text) return text.replace(/[^\d]/g, '').slice(0, 2) || text.slice(0, 2).toUpperCase();
  const fromId = playerId(player).match(/\d+$/)?.[0];
  return fromId?.slice(-2) || '0';
}

function bodyBuildFor(player: BroadcastPlayerSource, hash: number): BroadcastPlayerIdentity['bodyBuild'] {
  const position = String(player.position || '').toUpperCase();
  if (position === 'C' || position === 'PF') return 'big';
  if (position === 'SF') return 'wing';
  if (position === 'PG' || position === 'SG') return 'guard';
  return (['guard', 'wing', 'big'] as const)[hash % 3];
}

export function buildBroadcastIdentity(player: BroadcastPlayerSource): BroadcastPlayerIdentity {
  const hash = stableHash(playerId(player));
  const provided = player.visualIdentity || {};
  return {
    skinTone: provided.skinTone || SKIN_TONES[hash % SKIN_TONES.length],
    hairStyle: provided.hairStyle || HAIR_STYLES[Math.floor(hash / 3) % HAIR_STYLES.length],
    hairColor: provided.hairColor || (hash % 7 === 0 ? 'brown' : 'black'),
    bodyBuild: provided.bodyBuild || bodyBuildFor(player, hash),
    facialHair: provided.facialHair || (hash % 5 === 0 ? 'beard' : hash % 3 === 0 ? 'goatee' : 'none'),
    accessories: Array.isArray(provided.accessories) ? provided.accessories : [],
  };
}

export function buildBroadcastActor({
  player,
  team,
  side,
  slot,
}: {
  player: BroadcastPlayerSource;
  team: BroadcastTeamUniformSource;
  side: 'home' | 'away';
  slot: number;
}): BroadcastActor {
  const number = jerseyNumber(player);
  const teamId = String(team.teamId || team.id || team.abbreviation || side).trim();
  return {
    id: playerId(player),
    name: playerName(player),
    label: number,
    side,
    slot,
    position: String(player.position || '').toUpperCase() || ['PG', 'SG', 'SF', 'PF', 'C'][slot] || 'G',
    identity: buildBroadcastIdentity(player),
    uniform: {
      teamId,
      abbr: String(team.abbreviation || teamId).toUpperCase(),
      primary: cleanHex(team.primaryColor, DEFAULT_PRIMARY),
      secondary: cleanHex(team.secondaryColor, DEFAULT_SECONDARY),
      number,
      numberColor: side === 'home' ? '#ffffff' : '#111111',
    },
  };
}

export function buildBroadcastActorsForLineup({
  homeTeam,
  awayTeam,
  homePlayers,
  awayPlayers,
}: {
  homeTeam: BroadcastTeamUniformSource;
  awayTeam: BroadcastTeamUniformSource;
  homePlayers: BroadcastPlayerSource[];
  awayPlayers: BroadcastPlayerSource[];
}): BroadcastActor[] {
  const home = homePlayers.slice(0, 5).map((player, slot) => buildBroadcastActor({ player, team: homeTeam, side: 'home', slot }));
  const away = awayPlayers.slice(0, 5).map((player, slot) => buildBroadcastActor({ player, team: awayTeam, side: 'away', slot }));
  return [...away, ...home];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:domain -- broadcastActors`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add domain/nba/broadcastActors.ts tests/domain/broadcastActors.test.ts
git commit -m "feat: add broadcast player actors"
```

## Task 2: Broadcast Director Domain

**Files:**
- Create: `domain/nba/broadcastDirector.ts`
- Test: `tests/domain/broadcastDirector.test.ts`

- [ ] **Step 1: Write failing director tests**

Create `tests/domain/broadcastDirector.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildBroadcastScene, buildPostgameStage, spacingForCoachingStyle } from '@/domain/nba/broadcastDirector';
import type { LiveTimelineEvent } from '@/domain/nba/liveTimeline';

function event(overrides: Partial<LiveTimelineEvent>): LiveTimelineEvent {
  return {
    id: 'event-1',
    period: 4,
    periodLabel: 'Q4',
    clockSeconds: 161,
    elapsedMs: 120_000,
    homeScore: 84,
    awayScore: 82,
    eventType: 'score',
    actingTeamId: 'NYK',
    text: 'Jalen Brunson made 3-pointer',
    x: 35,
    y: 42,
    momentum: 6,
    tags: ['score'],
    points: 3,
    ...overrides,
  };
}

describe('broadcast director', () => {
  it('maps signature basketball events to broadcast scenes and arena reactions', () => {
    expect(buildBroadcastScene({ event: event({ points: 3, text: 'Stephen Curry made deep 3PT jumper' }), homeTeamId: 'NYK', awayTeamId: 'BOS' })).toMatchObject({
      type: 'deep_three',
      jumbotronCue: 'DEEP THREE',
      crowdEnergy: 'swell',
    });
    expect(buildBroadcastScene({ event: event({ points: 2, text: 'Anthony Edwards throws down a poster dunk' }), homeTeamId: 'NYK', awayTeamId: 'BOS' })).toMatchObject({
      type: 'dunk',
      jumbotronCue: 'POSTER',
      crowdEnergy: 'eruption',
    });
    expect(buildBroadcastScene({ event: event({ eventType: 'block', points: undefined, text: 'Rudy Gobert blocks the shot' }), homeTeamId: 'NYK', awayTeamId: 'BOS' })).toMatchObject({
      type: 'block',
      jumbotronCue: 'BLOCK',
    });
  });

  it('uses coaching style to change spacing hints without creating mid-game controls', () => {
    expect(spacingForCoachingStyle('Pace and Space')).toMatchObject({ width: 'wide', tempo: 'fast', paintTouch: 'low' });
    expect(spacingForCoachingStyle('Grit and Grind')).toMatchObject({ width: 'tight', tempo: 'slow', paintTouch: 'high' });
    expect(spacingForCoachingStyle('Blitz Pressure')).toMatchObject({ defenseDepth: 'high' });
  });

  it('builds a postgame sequence instead of freezing at final', () => {
    expect(buildPostgameStage({ elapsedAfterFinalMs: 800 })).toBe('buzzer');
    expect(buildPostgameStage({ elapsedAfterFinalMs: 3_200 })).toBe('celebration');
    expect(buildPostgameStage({ elapsedAfterFinalMs: 8_200 })).toBe('sportsmanship');
    expect(buildPostgameStage({ elapsedAfterFinalMs: 13_400 })).toBe('locker_exit');
    expect(buildPostgameStage({ elapsedAfterFinalMs: 20_000 })).toBe('settled');
  });

  it('marks final scenes as postgame with final-score jumbotron state', () => {
    const scene = buildBroadcastScene({
      event: event({ id: 'final', eventType: 'final_buzzer', points: undefined, text: 'Final buzzer.' }),
      homeTeamId: 'NYK',
      awayTeamId: 'BOS',
      elapsedAfterFinalMs: 4_000,
    });

    expect(scene).toMatchObject({
      type: 'postgame',
      postgameStage: 'celebration',
      jumbotronCue: 'FINAL',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:domain -- broadcastDirector`

Expected: FAIL because `domain/nba/broadcastDirector.ts` does not exist.

- [ ] **Step 3: Implement director helpers**

Create `domain/nba/broadcastDirector.ts`:

```ts
import type { LiveTimelineEvent } from './liveTimeline';
import { normalizeScheduleKey } from './scheduleView';

export type BroadcastSceneType = 'flow' | 'three' | 'deep_three' | 'dunk' | 'rim_finish' | 'miss' | 'rebound' | 'block' | 'steal' | 'turnover' | 'free_throw' | 'postgame';
export type CrowdEnergy = 'idle' | 'swell' | 'eruption' | 'dip' | 'quiet';
export type PostgameStage = 'none' | 'buzzer' | 'celebration' | 'sportsmanship' | 'locker_exit' | 'settled';

export type CoachingSpacingHint = {
  width: 'tight' | 'balanced' | 'wide';
  tempo: 'slow' | 'balanced' | 'fast';
  paintTouch: 'low' | 'balanced' | 'high';
  defenseDepth: 'normal' | 'high';
};

export type BroadcastScene = {
  id: string;
  type: BroadcastSceneType;
  side: 'home' | 'away' | 'neutral';
  shotValue?: 1 | 2 | 3;
  jumbotronCue: string;
  crowdEnergy: CrowdEnergy;
  postgameStage: PostgameStage;
  caption: string;
  x: number;
  y: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function sideForTeam(teamId: string | null | undefined, homeTeamId: string, awayTeamId: string): 'home' | 'away' | 'neutral' {
  const key = normalizeScheduleKey(teamId || '');
  if (key && key === normalizeScheduleKey(homeTeamId)) return 'home';
  if (key && key === normalizeScheduleKey(awayTeamId)) return 'away';
  return 'neutral';
}

export function spacingForCoachingStyle(label: string | null | undefined): CoachingSpacingHint {
  const value = String(label || '').toLowerCase();
  if (value.includes('pace') || value.includes('seven') || value.includes('shoot')) {
    return { width: 'wide', tempo: 'fast', paintTouch: 'low', defenseDepth: 'normal' };
  }
  if (value.includes('grit') || value.includes('post') || value.includes('paint') || value.includes('triangle')) {
    return { width: 'tight', tempo: 'slow', paintTouch: 'high', defenseDepth: 'normal' };
  }
  if (value.includes('blitz') || value.includes('pressure') || value.includes('zone') || value.includes('man')) {
    return { width: 'balanced', tempo: 'balanced', paintTouch: 'balanced', defenseDepth: 'high' };
  }
  return { width: 'balanced', tempo: 'balanced', paintTouch: 'balanced', defenseDepth: 'normal' };
}

export function buildPostgameStage({ elapsedAfterFinalMs }: { elapsedAfterFinalMs: number }): PostgameStage {
  const elapsed = Math.max(0, elapsedAfterFinalMs);
  if (elapsed < 2_000) return 'buzzer';
  if (elapsed < 7_000) return 'celebration';
  if (elapsed < 11_000) return 'sportsmanship';
  if (elapsed < 17_000) return 'locker_exit';
  return 'settled';
}

function sceneTypeFor(event: LiveTimelineEvent | null | undefined): Pick<BroadcastScene, 'type' | 'jumbotronCue' | 'crowdEnergy' | 'shotValue'> {
  if (!event) return { type: 'flow', jumbotronCue: 'LIVE', crowdEnergy: 'idle' };
  if (event.eventType === 'final_buzzer') return { type: 'postgame', jumbotronCue: 'FINAL', crowdEnergy: 'swell' };
  const text = String(event.text || '').toLowerCase();
  const points = Number(event.points || event.statDelta?.points || 0);
  if (event.eventType === 'block' || text.includes('block')) return { type: 'block', jumbotronCue: 'BLOCK', crowdEnergy: 'swell' };
  if (event.eventType === 'steal' || text.includes('steal')) return { type: 'steal', jumbotronCue: 'STEAL', crowdEnergy: 'swell' };
  if (event.eventType === 'turnover' || text.includes('turnover')) return { type: 'turnover', jumbotronCue: 'TURNOVER', crowdEnergy: 'dip' };
  if (event.eventType === 'free_throw_trip' || text.includes('free throw')) return { type: 'free_throw', jumbotronCue: 'AT THE LINE', crowdEnergy: 'idle', shotValue: 1 };
  if (text.includes('rebound') || event.statDelta?.rebounds) return { type: 'rebound', jumbotronCue: 'REBOUND', crowdEnergy: 'swell' };
  if (event.eventType === 'miss') return { type: 'miss', jumbotronCue: 'MISS', crowdEnergy: 'quiet' };
  if (points === 3 || /\b(3pt|3-point|3 pointer|three|3-pointer)\b/.test(text)) {
    const deep = /\b(deep|logo|curry|range)\b/.test(text);
    return { type: deep ? 'deep_three' : 'three', jumbotronCue: deep ? 'DEEP THREE' : 'THREE', crowdEnergy: 'swell', shotValue: 3 };
  }
  if (text.includes('dunk') || text.includes('poster')) return { type: 'dunk', jumbotronCue: 'POSTER', crowdEnergy: 'eruption', shotValue: 2 };
  if (event.eventType === 'score') return { type: 'rim_finish', jumbotronCue: 'BUCKET', crowdEnergy: 'swell', shotValue: points === 1 ? 1 : 2 };
  return { type: 'flow', jumbotronCue: 'LIVE', crowdEnergy: 'idle' };
}

export function buildBroadcastScene({
  event,
  homeTeamId,
  awayTeamId,
  elapsedAfterFinalMs = 0,
}: {
  event?: LiveTimelineEvent | null;
  homeTeamId: string;
  awayTeamId: string;
  elapsedAfterFinalMs?: number;
}): BroadcastScene {
  const type = sceneTypeFor(event);
  return {
    id: event?.id || 'loading',
    ...type,
    side: sideForTeam(event?.actingTeamId, homeTeamId, awayTeamId),
    postgameStage: type.type === 'postgame' ? buildPostgameStage({ elapsedAfterFinalMs }) : 'none',
    caption: event?.text || 'Live replay is loading.',
    x: clamp(Number(event?.x ?? 50), 5, 95),
    y: clamp(Number(event?.y ?? 50), 8, 92),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:domain -- broadcastDirector`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add domain/nba/broadcastDirector.ts tests/domain/broadcastDirector.test.ts
git commit -m "feat: add broadcast director scenes"
```

## Task 3: Broadcast Renderer Component

**Files:**
- Create: `components/season/NbaBroadcastLiveMode.tsx`
- Modify: `tests/domain/sourceSafety.test.ts`

- [ ] **Step 1: Add source-safety guardrails**

Append tests to `tests/domain/sourceSafety.test.ts` inside the existing top-level `describe` block:

```ts
  it('renders NBA broadcast live mode with crowd, jumbotron, and player actors', () => {
    const sourceText = source('components/season/NbaBroadcastLiveMode.tsx');

    expect(sourceText).toContain('Jumbotron');
    expect(sourceText).toContain('crowd');
    expect(sourceText).toContain('BroadcastActor');
    expect(sourceText).toContain('postgameStage');
    expect(sourceText).toContain('Locker');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:domain -- sourceSafety`

Expected: FAIL because `components/season/NbaBroadcastLiveMode.tsx` does not exist.

- [ ] **Step 3: Create the broadcast component**

Create `components/season/NbaBroadcastLiveMode.tsx` with:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import SportTeamLogo from '@/components/SportTeamLogo';
import type { ArenaTheme } from '@/domain/nba/arenaTheme';
import { type BroadcastActor } from '@/domain/nba/broadcastActors';
import { buildBroadcastScene, type BroadcastScene } from '@/domain/nba/broadcastDirector';
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

function actorPosition(actor: BroadcastActor, scene: BroadcastScene, tick: number) {
  const side = scene.side === 'neutral' ? (tick % 2 === 0 ? 'home' : 'away') : scene.side;
  const offense = actor.side === side;
  const attackingTop = side === 'away';
  const slot = actor.slot;
  const baseX = [50, 27, 73, 38, 62][slot] ?? 50;
  const offenseY = attackingTop ? [71, 57, 57, 38, 28][slot] : [25, 40, 40, 59, 70][slot];
  const defenseY = attackingTop ? [25, 39, 39, 56, 68][slot] : [72, 58, 58, 39, 28][slot];
  const energy = Math.sin((tick + slot * 9) / 6) * (scene.type === 'postgame' ? 1 : 2.4);
  if (scene.type === 'postgame') {
    if (scene.postgameStage === 'celebration' && actor.side === (scene.side === 'away' ? 'away' : 'home')) {
      return { x: 45 + slot * 2.3, y: 45 + Math.sin(tick / 3 + slot) * 4 };
    }
    if (scene.postgameStage === 'sportsmanship') {
      return { x: 34 + slot * 8, y: actor.side === 'home' ? 51 : 45 };
    }
    if (scene.postgameStage === 'locker_exit' || scene.postgameStage === 'settled') {
      return { x: baseX, y: actor.side === 'home' ? 91 - slot * 2 : 9 + slot * 2 };
    }
  }
  if (offense) {
    if (scene.type === 'deep_three' || scene.type === 'three') return { x: slot === 0 ? scene.x : baseX, y: slot === 0 ? scene.y : offenseY + energy };
    if (scene.type === 'dunk' || scene.type === 'rim_finish') return { x: slot === 0 ? 50 : baseX, y: slot === 0 ? (attackingTop ? 13 : 87) : offenseY + energy };
    return { x: baseX + energy, y: offenseY };
  }
  return { x: baseX - energy, y: defenseY };
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
          {actors.map(actor => {
            const pos = actorPosition(actor, scene, tick);
            const isBig = actor.identity.bodyBuild === 'big';
            const skin = actor.identity.skinTone === 'deep' ? '#5b321d' : actor.identity.skinTone === 'dark' ? '#7b4a2a' : actor.identity.skinTone === 'medium' ? '#b8754b' : '#d7a376';
            return (
              <G key={actor.id}>
                <Circle cx={x(clamp(pos.x, 8, 92))} cy={y(clamp(pos.y, 6, 94)) - (isBig ? 2.8 : 2.4)} r={isBig ? 2.1 : 1.8} fill={skin} stroke="#111111" strokeWidth="0.25" />
                <Rect x={x(pos.x) - (isBig ? 2.4 : 2)} y={y(pos.y) - 1.3} width={isBig ? 4.8 : 4} height={isBig ? 5.5 : 4.8} rx="0.9" fill={actor.uniform.primary} stroke={actor.uniform.secondary} strokeWidth="0.45" />
                <SvgText x={x(pos.x)} y={y(pos.y) + 2} fill={actor.uniform.numberColor} fontSize="2.4" fontWeight="900" textAnchor="middle">{actor.label}</SvgText>
              </G>
            );
          })}
          <Circle cx={x(scene.x)} cy={y(scene.y)} r="1.35" fill="#f97316" stroke="#fff1d6" strokeWidth="0.5" />
        </Svg>
      </View>

      <View style={styles.caption}>
        <Text style={styles.captionKicker}>{scene.type === 'postgame' ? 'Postgame' : 'Visual Play Event'}</Text>
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
```

- [ ] **Step 4: Run source-safety test**

Run: `npm run test:domain -- sourceSafety`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/season/NbaBroadcastLiveMode.tsx tests/domain/sourceSafety.test.ts
git commit -m "feat: render broadcast live mode"
```

## Task 4: Wire Broadcast Mode Into Live Mode

**Files:**
- Modify: `app/screens/season/live-mode.tsx`
- Modify: `tests/domain/sourceSafety.test.ts`

- [ ] **Step 1: Add source-safety wiring test**

Append this source-safety test:

```ts
  it('uses NBA broadcast live mode while preserving the visual board fallback', () => {
    const liveMode = source('app/screens/season/live-mode.tsx');

    expect(liveMode).toContain('NbaBroadcastLiveMode');
    expect(liveMode).toContain('buildBroadcastActorsForLineup');
    expect(liveMode).toContain('NbaLiveVisualBoard');
    expect(liveMode).toContain('elapsedAfterFinalMs');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:domain -- sourceSafety`

Expected: FAIL because `live-mode.tsx` does not import or render `NbaBroadcastLiveMode`.

- [ ] **Step 3: Import the broadcast component and actor builder**

In `app/screens/season/live-mode.tsx`, add imports:

```ts
import NbaBroadcastLiveMode from '@/components/season/NbaBroadcastLiveMode';
import { buildBroadcastActorsForLineup } from '@/domain/nba/broadcastActors';
```

- [ ] **Step 4: Derive broadcast actors and final elapsed time**

Add after `liveStatsByTeam`:

```ts
  const broadcastActors = useMemo(() => buildBroadcastActorsForLineup({
    homeTeam: {
      teamId: game?.homeTeamId || homeTeam?.teamId || homeTeam?.id || 'home',
      abbreviation: homeAbbr,
      primaryColor: homeTeam?.primaryColor || arenaTheme.primary,
      secondaryColor: homeTeam?.secondaryColor || arenaTheme.secondary,
    },
    awayTeam: {
      teamId: game?.awayTeamId || awayTeam?.teamId || awayTeam?.id || 'away',
      abbreviation: awayAbbr,
      primaryColor: awayTeam?.primaryColor || '#5d76a9',
      secondaryColor: awayTeam?.secondaryColor || '#ffffff',
    },
    homePlayers: liveStatsByTeam.home.slice(0, 5).map(player => playerForCard(player, homeTeam)),
    awayPlayers: liveStatsByTeam.away.slice(0, 5).map(player => playerForCard(player, awayTeam)),
  }), [
    arenaTheme.primary,
    arenaTheme.secondary,
    awayAbbr,
    awayTeam,
    game?.awayTeamId,
    game?.homeTeamId,
    homeAbbr,
    homeTeam,
    liveStatsByTeam.away,
    liveStatsByTeam.home,
  ]);
  const elapsedAfterFinalMs = currentEvent?.eventType === 'final_buzzer'
    ? Math.max(0, elapsedMs - Number(currentEvent.elapsedMs || 0))
    : resultVisible
      ? Math.max(0, nowMs - Number(game?.finalAtMs || liveMode?.simulationEndsAtMs || nowMs))
      : 0;
```

- [ ] **Step 5: Render broadcast mode before the fallback board**

Replace the basketball board block with:

```tsx
            {isBasketball && !waitingForStoredTimeline ? (
              <NbaBroadcastLiveMode
                width={courtWidth}
                event={currentEvent}
                homeTeamId={game?.homeTeamId || ''}
                awayTeamId={game?.awayTeamId || ''}
                homeAbbr={homeAbbr}
                awayAbbr={awayAbbr}
                homeScore={homeScore}
                awayScore={awayScore}
                clock={clockText(currentEvent)}
                period={currentEvent?.eventType === 'final_buzzer' ? 'Final' : currentEvent?.periodLabel || defaultPeriodLabel}
                theme={arenaTheme}
                era={league?.currentYear || league?.era}
                actors={broadcastActors}
                elapsedAfterFinalMs={elapsedAfterFinalMs}
              />
            ) : null}
```

Keep the `NbaLiveVisualBoard` import and component file in place as the fallback implementation path, even if this first wiring no longer renders it by default.

- [ ] **Step 6: Run focused tests and type check**

Run:

```bash
npm run test:domain -- broadcastActors broadcastDirector sourceSafety
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/screens/season/live-mode.tsx tests/domain/sourceSafety.test.ts
git commit -m "feat: wire broadcast mode into live screen"
```

## Task 5: Final Verification And Polish

**Files:**
- Modify as needed only if verification finds issues.

- [ ] **Step 1: Run complete focused regression**

Run:

```bash
npm run test:domain -- liveTimeline liveVisualBoard broadcastActors broadcastDirector sourceSafety scheduleView
```

Expected: PASS.

- [ ] **Step 2: Run full domain tests**

Run: `npm run test:domain`

Expected: PASS.

- [ ] **Step 3: Run lint and TypeScript**

Run:

```bash
npm run lint
npx tsc --noEmit
```

Expected: PASS. Existing unrelated hook-dependency warnings may remain if already present, but no new errors should be introduced.

- [ ] **Step 4: Check whitespace**

Run: `git diff --check`

Expected: no output.

- [ ] **Step 5: Manual simulator QA**

Open an NBA Live Mode game and verify:

- Scorebug, jumbotron, crowd, court, actors, ball, and caption all render.
- Made threes, dunks/twos, rebounds, blocks, steals, free throws, turnovers, and final events show different visual behavior.
- Players use current team jersey colors while retaining actor identity.
- Final buzzer transitions through celebration, sportsmanship, locker-room exit, then settled arena.
- Current Live Mode route still loads without the Firestore 1 MB crash.

- [ ] **Step 6: Commit final polish if needed**

If verification required edits:

```bash
git add app components domain tests
git commit -m "fix: polish broadcast live mode"
```

If no edits were required, do not create an empty commit.

## Self-Review

- Spec coverage: player identity/uniform, event director, jumbotron, crowd, postgame sequence, Rive-ready boundary, storage constraint, and fallback preservation are each covered by a task.
- Placeholder scan: no TBD/TODO items; placeholder actor term is intentional product scope for pre-Rive actors.
- Type consistency: `BroadcastActor`, `BroadcastScene`, `buildBroadcastActor`, `buildBroadcastActorsForLineup`, `buildBroadcastScene`, and `buildPostgameStage` are defined before use.
