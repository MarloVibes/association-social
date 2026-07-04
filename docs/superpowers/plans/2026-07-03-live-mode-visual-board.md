# Live Mode Visual Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first production NBA Live Mode visual board with an authentic SVG court, locked coaching labels, and animated `+2` / `+3` scoring pops.

**Architecture:** Add a small domain projection helper that converts `LiveTimelineEvent` plus teams into renderable board state, then render that state through a dedicated React Native SVG component. `app/screens/season/live-mode.tsx` keeps data subscription, routing, player-card, and result logic, but delegates NBA court visuals to the new component.

**Tech Stack:** Expo SDK 54, React Native, TypeScript, `react-native-svg`, React Native Reanimated, Vitest.

---

## File Structure

- Create `domain/nba/liveVisualBoard.ts`: pure helpers for visual board state, scoring pop derivation, coaching labels, and event labels.
- Create `components/season/NbaLiveVisualBoard.tsx`: SVG court renderer plus token/ball/path/score-pop overlay.
- Modify `app/screens/season/live-mode.tsx`: replace the current basketball `View` court with `NbaLiveVisualBoard`, simplify the top board section, keep non-NBA fallback.
- Modify `tests/domain/liveVisualBoard.test.ts`: direct unit tests for score pops and court-label guardrails.
- Modify `tests/domain/sourceSafety.test.ts`: source guard that Live Mode uses the new visual board and does not hardcode team names near basket sides.

## Task 1: Pure Visual Board State

**Files:**
- Create: `domain/nba/liveVisualBoard.ts`
- Test: `tests/domain/liveVisualBoard.test.ts`

- [x] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { buildLiveVisualBoardState } from '@/domain/nba/liveVisualBoard';
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

describe('live visual board state', () => {
  it('creates a +3 scoring pop for made threes near the active scoring location', () => {
    const state = buildLiveVisualBoardState({
      event: event({ points: 3, x: 38, y: 40 }),
      homeTeamId: 'NYK',
      awayTeamId: 'MEM',
      homeAbbr: 'NYK',
      awayAbbr: 'MEM',
      homeCoachingLabel: 'Pace and Space',
      awayCoachingLabel: 'Grit and Grind',
    });

    expect(state.scorePop).toMatchObject({ value: '+3', x: 38, y: 40, side: 'home' });
    expect(state.coaching.home).toBe('Pace and Space');
    expect(state.coaching.away).toBe('Grit and Grind');
  });

  it('creates a +2 scoring pop for made twos and never emits fixed basket-side team names', () => {
    const state = buildLiveVisualBoardState({
      event: event({ id: 'two', points: 2, x: 12, y: 50 }),
      homeTeamId: 'NYK',
      awayTeamId: 'MEM',
      homeAbbr: 'NYK',
      awayAbbr: 'MEM',
    });

    expect(state.scorePop).toMatchObject({ value: '+2', x: 12, y: 50 });
    expect(state.fixedBasketLabels).toEqual([]);
  });

  it('omits score pops for misses and neutral events', () => {
    const state = buildLiveVisualBoardState({
      event: event({ eventType: 'miss', points: undefined, actingTeamId: 'MEM' }),
      homeTeamId: 'NYK',
      awayTeamId: 'MEM',
      homeAbbr: 'NYK',
      awayAbbr: 'MEM',
    });

    expect(state.scorePop).toBeNull();
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npm run test:domain -- liveVisualBoard`

Expected: FAIL because `domain/nba/liveVisualBoard.ts` does not exist.

- [x] **Step 3: Implement the visual board state helper**

```ts
import { buildLiveCourtState, type LiveCourtPlayer } from './liveCourt';
import { normalizeScheduleKey } from './scheduleView';
import type { LiveTimelineEvent } from './liveTimeline';

export type LiveVisualScorePop = {
  id: string;
  value: '+2' | '+3';
  x: number;
  y: number;
  side: 'home' | 'away';
};

export type LiveVisualBoardState = {
  players: LiveCourtPlayer[];
  ball: { x: number; y: number; side: 'home' | 'away' | 'neutral' };
  scorePop: LiveVisualScorePop | null;
  eventLabel: string;
  coaching: { home: string; away: string };
  fixedBasketLabels: [];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sideForTeam(teamId: string | null | undefined, homeTeamId: string, awayTeamId: string): 'home' | 'away' | null {
  const key = normalizeScheduleKey(teamId || '');
  if (!key) return null;
  if (key === normalizeScheduleKey(homeTeamId)) return 'home';
  if (key === normalizeScheduleKey(awayTeamId)) return 'away';
  return null;
}

function scorePopForEvent(event: LiveTimelineEvent | null | undefined, homeTeamId: string, awayTeamId: string): LiveVisualScorePop | null {
  if (!event || event.eventType !== 'score') return null;
  const points = Number(event.points || event.statDelta?.points || 0);
  if (points !== 2 && points !== 3) return null;
  const side = sideForTeam(event.actingTeamId, homeTeamId, awayTeamId);
  if (!side) return null;
  return {
    id: event.id,
    value: points === 3 ? '+3' : '+2',
    x: clamp(Number(event.x || 50), 5, 95),
    y: clamp(Number(event.y || 50), 8, 92),
    side,
  };
}

export function buildLiveVisualBoardState({
  event,
  homeTeamId,
  awayTeamId,
  homeAbbr,
  awayAbbr,
  homeCoachingLabel = 'Balanced',
  awayCoachingLabel = 'Balanced',
}: {
  event?: LiveTimelineEvent | null;
  homeTeamId: string;
  awayTeamId: string;
  homeAbbr: string;
  awayAbbr: string;
  homeCoachingLabel?: string;
  awayCoachingLabel?: string;
}): LiveVisualBoardState {
  const court = buildLiveCourtState({ event, homeTeamId, awayTeamId, homeAbbr, awayAbbr });
  return {
    ...court,
    scorePop: scorePopForEvent(event, homeTeamId, awayTeamId),
    eventLabel: event?.text || 'Live timeline is loading.',
    coaching: {
      home: homeCoachingLabel,
      away: awayCoachingLabel,
    },
    fixedBasketLabels: [],
  };
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npm run test:domain -- liveVisualBoard`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add domain/nba/liveVisualBoard.ts tests/domain/liveVisualBoard.test.ts
git commit -m "feat: project live visual board state"
```

## Task 2: NBA SVG Visual Board Component

**Files:**
- Create: `components/season/NbaLiveVisualBoard.tsx`
- Test: `tests/domain/sourceSafety.test.ts`

- [x] **Step 1: Write the failing source guard**

Add to `tests/domain/sourceSafety.test.ts`:

```ts
it('renders NBA Live Mode through the authentic visual board component', () => {
  const liveMode = source('app/screens/season/live-mode.tsx');
  const board = source('components/season/NbaLiveVisualBoard.tsx');

  expect(liveMode).toContain('NbaLiveVisualBoard');
  expect(board).toContain('react-native-svg');
  expect(board).toContain('scorePop');
  expect(board).toContain('+2');
  expect(board).toContain('+3');
  expect(board).not.toContain('KNICKS');
  expect(board).not.toContain('GRIZZLIES');
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npm run test:domain -- sourceSafety`

Expected: FAIL because `components/season/NbaLiveVisualBoard.tsx` does not exist and Live Mode does not use it.

- [x] **Step 3: Create the component**

Create `components/season/NbaLiveVisualBoard.tsx` with an exported `NbaLiveVisualBoard` component that accepts:

```ts
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
};
```

Implementation requirements:

- Use `Svg`, `Rect`, `Line`, `Circle`, `Path`, `G`, `Text` from `react-native-svg`.
- Draw hardwood as repeated vertical rect strips.
- Draw court outline, half-court line, center circle, center logo, paint, three-point arcs, restricted arcs, rims, and backboards.
- Do not draw free-throw-line circles.
- Do not hardcode team names near baskets.
- Render `state.scorePop?.value` as an absolutely positioned `Animated.Text` overlay with `+2` / `+3`.
- Render compact coaching labels under the visual board.

- [x] **Step 4: Run the source guard**

Run: `npm run test:domain -- sourceSafety`

Expected: still fails until Live Mode imports and renders the component in Task 3.

## Task 3: Integrate The Board Into Live Mode

**Files:**
- Modify: `app/screens/season/live-mode.tsx`
- Test: `tests/domain/sourceSafety.test.ts`

- [x] **Step 1: Import the component and projection helper**

Add imports:

```ts
import NbaLiveVisualBoard from '@/components/season/NbaLiveVisualBoard';
import { buildLiveVisualBoardState } from '@/domain/nba/liveVisualBoard';
```

- [x] **Step 2: Derive visual board state**

Add inside `LiveModeScreen` after `courtState` derivation:

```ts
const visualBoardState = useMemo(() => buildLiveVisualBoardState({
  event: currentEvent,
  homeTeamId: game?.homeTeamId || '',
  awayTeamId: game?.awayTeamId || '',
  homeAbbr,
  awayAbbr,
  homeCoachingLabel: String(game?.homeCoachingStyleName || game?.homeCoachingPresetName || 'Balanced'),
  awayCoachingLabel: String(game?.awayCoachingStyleName || game?.awayCoachingPresetName || 'Balanced'),
}), [awayAbbr, currentEvent, game?.awayCoachingPresetName, game?.awayCoachingStyleName, game?.awayTeamId, game?.homeCoachingPresetName, game?.homeCoachingStyleName, game?.homeTeamId, homeAbbr]);
```

- [x] **Step 3: Replace the basketball court branch**

Replace the current `isBasketball ? <View style={[styles.courtWrap ...` branch with:

```tsx
{isBasketball ? (
  <NbaLiveVisualBoard
    width={courtWidth}
    state={visualBoardState}
    homeAbbr={homeAbbr}
    awayAbbr={awayAbbr}
    homeScore={homeScore}
    awayScore={awayScore}
    clock={clockText(currentEvent)}
    period={currentEvent?.eventType === 'final_buzzer' ? 'Final' : currentEvent?.periodLabel || defaultPeriodLabel}
    theme={arenaTheme}
  />
) : (
  <View style={styles.panel}>
    <View style={styles.panelHeader}>
      <Text style={styles.panelTitle}>{sport === 'mlb' ? 'Game Flow' : 'Drive Flow'}</Text>
      <Text style={[styles.panelPill, { color: arenaTheme.text, borderColor: arenaTheme.secondary }]}>{currentEvent?.periodLabel || defaultPeriodLabel}</Text>
    </View>
    <Text style={styles.eventText}>{displayScheduleEventText(currentEvent?.text) || 'Live timeline is loading.'}</Text>
  </View>
)}
```

- [x] **Step 4: Remove unused old court animation state**

Remove unused `useSharedValue`, `useAnimatedStyle`, `withTiming`, `ballStyle`, and old court-only styles if TypeScript reports them unused.

- [x] **Step 5: Run focused checks**

Run:

```bash
npm run test:domain -- liveVisualBoard sourceSafety
npx tsc --noEmit
```

Expected: both commands pass.

- [ ] **Step 6: Commit**

```bash
git add app/screens/season/live-mode.tsx components/season/NbaLiveVisualBoard.tsx tests/domain/sourceSafety.test.ts
git commit -m "feat: add NBA live visual board"
```

## Task 4: Final Verification And Expo Update

**Files:**
- Verify only; no code changes expected.

- [x] **Step 1: Run focused and broad checks**

Run:

```bash
npm run test:domain -- liveVisualBoard sourceSafety
npm run test:functions -- matchups
npx tsc --noEmit
git diff --check
```

Expected: all pass.

- [ ] **Step 2: Publish Expo update**

Run:

```bash
eas update --branch main --message "Add NBA live visual board"
```

Expected: EAS publishes iOS and Android update IDs.

- [ ] **Step 3: Manual QA**

Open an NBA Live Mode game in Expo and verify:

- The court board appears as the main visual surface.
- Rims/backboards/paint/three-point arcs/center logo are visible.
- No fixed team names appear beside baskets.
- Locked coaching labels are visible.
- A scoring event shows `+2` or `+3` near the scoring location and fades.
- The app does not crash mid-sim.

## Self-Review

- Spec coverage: NBA visual board, locked coaching, no mid-game controls, no fixed basket-side names, center logo, score pops, and future NFL/MLB architecture are covered.
- Placeholder scan: no TBD/TODO/fill-in steps remain.
- Type consistency: `LiveVisualBoardState`, `LiveVisualScorePop`, and `NbaLiveVisualBoardProps` names are consistent across tasks.
