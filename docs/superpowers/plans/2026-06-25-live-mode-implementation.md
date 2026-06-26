# Live Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build NBA Live Mode: a fair, no-control, score-by-score animated simulation viewer with overtime and home-team arena themes.

**Architecture:** The server generates a deterministic final result and a matching live timeline before the reveal starts. The app renders the timeline based on stored server timestamps and never sends live strategy changes. Domain modules own timeline math and arena themes; callable functions own Firestore writes; Expo screens own the visual experience.

**Tech Stack:** TypeScript domain modules, Firebase callable functions, Firestore schedule documents, Expo Router, React Native, `react-native-reanimated`, existing NBA team color/logo assets, Vitest.

---

## File Structure

- `domain/nba/liveTimeline.ts`
  - Owns Live Mode event types, period labels, deterministic timeline generation, overtime rules, and current-event lookup by elapsed time.
- `domain/nba/arenaTheme.ts`
  - Resolves home-team court colors, crowd glow, lane accents, logo abbreviation, and safe fallbacks.
- `functions/franchise/liveTimeline.js`
  - CommonJS mirror of the timeline logic for Firebase functions.
- `functions/franchise/arenaTheme.js`
  - CommonJS mirror of arena theme fallback logic for stored game theme metadata.
- `functions/franchise/matchups.js`
  - Changes simulation flow to attach `liveTimeline`, `liveMode`, overtime-aware `quarters`, and `simulationStartedAtMs` / `simulationEndsAtMs`.
- `app/screens/season/live-mode.tsx`
  - New Live Mode screen with animated court, scoreboard, event feed, momentum card, period scoring, and result button.
- `app/_layout.tsx`
  - Registers `/screens/season/live-mode`.
- `app/screens/season/_layout.tsx`
  - Registers nested `live-mode`.
- `app/screens/season/matchup.tsx`
  - Routes simulation starts and simulating games into Live Mode.
- `app/screens/season/calendar.tsx`
  - Opens simulating games in Live Mode and final games in the result screen.
- `app/screens/season/game-result.tsx`
  - Displays overtime columns and links to deterministic replay when timeline data exists.
- `tests/domain/liveTimeline.test.ts`
  - Verifies deterministic timelines, score matching, overtime, period labels, event ordering, and current-event lookup.
- `tests/domain/arenaTheme.test.ts`
  - Verifies home-team theme resolution and fallbacks.
- `tests/functions/liveTimeline.test.ts`
  - Verifies CommonJS timeline parity for function-side use.
- `tests/functions/matchups.test.ts`
  - Verifies simulation writes timeline, timestamps, overtime result shape, and no duplicate timelines.
- `tests/domain/sourceSafety.test.ts`
  - Verifies Live Mode route registration, no live adjustment callable, and home arena theme usage.

## Task 1: Add Domain Live Timeline With Overtime

**Files:**
- Create: `domain/nba/liveTimeline.ts`
- Test: `tests/domain/liveTimeline.test.ts`

- [ ] **Step 1: Write the failing timeline tests**

Create `tests/domain/liveTimeline.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildLiveTimeline,
  currentTimelineEvent,
  periodLabel,
  type LiveTimelineInput,
} from '@/domain/nba/liveTimeline';

const baseInput: LiveTimelineInput = {
  gameId: 'game-live-1',
  seed: 'seed-live-1',
  homeTeamId: 'LAL',
  awayTeamId: 'BOS',
  homeScore: 104,
  awayScore: 101,
  quarters: [
    { quarter: 1, home: 25, away: 23 },
    { quarter: 2, home: 26, away: 27 },
    { quarter: 3, home: 24, away: 24 },
    { quarter: 4, home: 29, away: 27 },
  ],
  homePlayers: [
    { playerId: 'h1', name: 'Home Star', points: 34 },
    { playerId: 'h2', name: 'Home Wing', points: 21 },
  ],
  awayPlayers: [
    { playerId: 'a1', name: 'Away Star', points: 31 },
    { playerId: 'a2', name: 'Away Guard', points: 19 },
  ],
};

describe('Live Mode timeline', () => {
  it('generates a deterministic score timeline that ends at the final score', () => {
    const first = buildLiveTimeline(baseInput);
    const second = buildLiveTimeline(baseInput);

    expect(first).toEqual(second);
    expect(first.events.length).toBeGreaterThan(20);
    expect(first.events[0]).toMatchObject({ period: 1, homeScore: expect.any(Number), awayScore: expect.any(Number) });
    expect(first.events.at(-1)).toMatchObject({
      homeScore: 104,
      awayScore: 101,
      eventType: 'final_buzzer',
    });
  });

  it('keeps events sorted by period and descending game clock', () => {
    const timeline = buildLiveTimeline(baseInput);
    const keys = timeline.events.map(event => `${String(event.period).padStart(2, '0')}:${String(720 - event.clockSeconds).padStart(3, '0')}`);

    expect(keys).toEqual([...keys].sort());
  });

  it('labels overtime periods clearly', () => {
    expect(periodLabel(1)).toBe('Q1');
    expect(periodLabel(4)).toBe('Q4');
    expect(periodLabel(5)).toBe('OT');
    expect(periodLabel(6)).toBe('2OT');
    expect(periodLabel(7)).toBe('3OT');
  });

  it('creates overtime events when regulation ends tied', () => {
    const timeline = buildLiveTimeline({
      ...baseInput,
      homeScore: 112,
      awayScore: 109,
      quarters: [
        { quarter: 1, home: 25, away: 25 },
        { quarter: 2, home: 28, away: 26 },
        { quarter: 3, home: 24, away: 26 },
        { quarter: 4, home: 24, away: 24 },
        { quarter: 5, home: 11, away: 8 },
      ],
    });

    expect(timeline.events.some(event => event.period === 5)).toBe(true);
    expect(timeline.periods.at(-1)).toMatchObject({ period: 5, label: 'OT', home: 11, away: 8 });
    expect(timeline.events.at(-1)).toMatchObject({ homeScore: 112, awayScore: 109 });
  });

  it('finds the visible event from elapsed reveal time', () => {
    const timeline = buildLiveTimeline(baseInput);
    const visible = currentTimelineEvent(timeline, 45_000);

    expect(visible.event.elapsedMs).toBeLessThanOrEqual(45_000);
    expect(visible.index).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify RED**

Run:

```bash
npx vitest run tests/domain/liveTimeline.test.ts
```

Expected: FAIL because `domain/nba/liveTimeline.ts` does not exist.

- [ ] **Step 3: Implement `domain/nba/liveTimeline.ts`**

Create `domain/nba/liveTimeline.ts`:

```ts
export type LiveTimelinePlayer = {
  playerId: string;
  name: string;
  points?: number;
};

export type LiveTimelinePeriod = {
  period: number;
  label: string;
  home: number;
  away: number;
};

export type LiveTimelineEvent = {
  id: string;
  period: number;
  periodLabel: string;
  clockSeconds: number;
  elapsedMs: number;
  homeScore: number;
  awayScore: number;
  eventType: 'score' | 'turnover' | 'rebound' | 'foul' | 'run' | 'momentum' | 'period_end' | 'final_buzzer';
  actingTeamId: string;
  playerId?: string;
  playerName?: string;
  text: string;
  x: number;
  y: number;
  momentum: number;
  tags: string[];
};

export type LiveTimelineInput = {
  gameId: string;
  seed: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  quarters: { quarter: number; home: number; away: number }[];
  homePlayers?: LiveTimelinePlayer[];
  awayPlayers?: LiveTimelinePlayer[];
};

export type LiveTimeline = {
  version: 1;
  revealDurationMs: number;
  periods: LiveTimelinePeriod[];
  events: LiveTimelineEvent[];
};

function hash(value: string): number {
  let h = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function periodLabel(period: number): string {
  if (period <= 4) return `Q${period}`;
  if (period === 5) return 'OT';
  return `${period - 4}OT`;
}

function periodLength(period: number): number {
  return period <= 4 ? 720 : 300;
}

function eventCountForPoints(points: number) {
  return Math.max(1, Math.round(points / 2.25));
}

function scorer(players: LiveTimelinePlayer[] | undefined, seed: string, index: number): LiveTimelinePlayer | undefined {
  if (!players || players.length === 0) return undefined;
  const weighted = [...players].sort((a, b) => Number(b.points || 0) - Number(a.points || 0) || a.playerId.localeCompare(b.playerId));
  return weighted[hash(`${seed}:${index}`) % weighted.length];
}

function scoringBursts(total: number, count: number, seed: string): number[] {
  const values = Array.from({ length: count }, (_, index) => (hash(`${seed}:${index}`) % 3) + 1);
  const sum = values.reduce((next, value) => next + value, 0) || 1;
  const points = values.map(value => Math.max(1, Math.floor((value / sum) * total)));
  let diff = total - points.reduce((next, value) => next + value, 0);
  let cursor = 0;
  while (diff > 0 && points.length > 0) {
    points[cursor] += 1;
    diff -= 1;
    cursor = (cursor + 1) % points.length;
  }
  return points;
}

function tagForPoints(points: number): string[] {
  if (points >= 3) return ['three'];
  if (points === 1) return ['free_throw'];
  return ['paint'];
}

export function buildLiveTimeline(input: LiveTimelineInput): LiveTimeline {
  const periods = input.quarters.map(period => ({
    period: period.quarter,
    label: periodLabel(period.quarter),
    home: period.home,
    away: period.away,
  }));
  const revealDurationMs = Math.max(120_000, Math.min(300_000, periods.length * 45_000));
  const events: LiveTimelineEvent[] = [];
  let homeScore = 0;
  let awayScore = 0;
  let elapsedCursor = 0;
  const totalGameSeconds = periods.reduce((total, period) => total + periodLength(period.period), 0);

  periods.forEach((period) => {
    const length = periodLength(period.period);
    const homeBursts = scoringBursts(period.home, eventCountForPoints(period.home), `${input.seed}:home:${period.period}`);
    const awayBursts = scoringBursts(period.away, eventCountForPoints(period.away), `${input.seed}:away:${period.period}`);
    const periodEvents = [
      ...homeBursts.map((points, index) => ({ side: 'home' as const, points, slot: index })),
      ...awayBursts.map((points, index) => ({ side: 'away' as const, points, slot: index })),
    ].sort((left, right) => hash(`${input.seed}:${period.period}:${left.side}:${left.slot}`) - hash(`${input.seed}:${period.period}:${right.side}:${right.slot}`));

    periodEvents.forEach((item, index) => {
      const eventClock = Math.max(0, length - Math.floor(((index + 1) / (periodEvents.length + 1)) * length));
      const elapsedSecondsBeforePeriod = periods
        .filter(candidate => candidate.period < period.period)
        .reduce((total, candidate) => total + periodLength(candidate.period), 0);
      const elapsedSeconds = elapsedSecondsBeforePeriod + (length - eventClock);
      elapsedCursor = Math.floor((elapsedSeconds / totalGameSeconds) * revealDurationMs);
      const teamId = item.side === 'home' ? input.homeTeamId : input.awayTeamId;
      const player = scorer(item.side === 'home' ? input.homePlayers : input.awayPlayers, `${input.seed}:${period.period}:${item.side}`, index);
      if (item.side === 'home') homeScore += item.points;
      if (item.side === 'away') awayScore += item.points;
      events.push({
        id: `${input.gameId}_${period.period}_${index}_${item.side}`,
        period: period.period,
        periodLabel: period.label,
        clockSeconds: eventClock,
        elapsedMs: elapsedCursor,
        homeScore,
        awayScore,
        eventType: 'score',
        actingTeamId: teamId,
        playerId: player?.playerId,
        playerName: player?.name,
        text: `${player?.name || teamId} scores ${item.points}`,
        x: item.side === 'home' ? 58 + (hash(`${input.seed}:x:${index}`) % 32) : 10 + (hash(`${input.seed}:x:${index}`) % 32),
        y: 18 + (hash(`${input.seed}:y:${period.period}:${index}`) % 64),
        momentum: homeScore - awayScore,
        tags: tagForPoints(item.points),
      });
    });

    events.push({
      id: `${input.gameId}_${period.period}_end`,
      period: period.period,
      periodLabel: period.label,
      clockSeconds: 0,
      elapsedMs: Math.floor((periods.filter(candidate => candidate.period <= period.period).reduce((total, candidate) => total + periodLength(candidate.period), 0) / totalGameSeconds) * revealDurationMs),
      homeScore,
      awayScore,
      eventType: period.period === periods.at(-1)?.period ? 'final_buzzer' : 'period_end',
      actingTeamId: homeScore >= awayScore ? input.homeTeamId : input.awayTeamId,
      text: period.period === periods.at(-1)?.period ? 'Final buzzer' : `${period.label} ends`,
      x: 50,
      y: 50,
      momentum: homeScore - awayScore,
      tags: period.period > 4 ? ['overtime'] : [],
    });
  });

  const finalEvent = events.at(-1);
  if (finalEvent) {
    finalEvent.homeScore = input.homeScore;
    finalEvent.awayScore = input.awayScore;
  }

  return { version: 1, revealDurationMs, periods, events };
}

export function currentTimelineEvent(timeline: LiveTimeline, elapsedMs: number) {
  const index = Math.max(0, timeline.events.findLastIndex(event => event.elapsedMs <= elapsedMs));
  return { index, event: timeline.events[index] || timeline.events[0] };
}
```

- [ ] **Step 4: Run the domain timeline tests**

Run:

```bash
npx vitest run tests/domain/liveTimeline.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add domain/nba/liveTimeline.ts tests/domain/liveTimeline.test.ts
git commit -m "feat: add live mode timeline"
```

## Task 2: Add Arena Theme Resolution

**Files:**
- Create: `domain/nba/arenaTheme.ts`
- Test: `tests/domain/arenaTheme.test.ts`

- [ ] **Step 1: Write failing arena theme tests**

Create `tests/domain/arenaTheme.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildArenaTheme } from '@/domain/nba/arenaTheme';

describe('Live Mode arena theme', () => {
  it('uses home team colors and identity for the arena', () => {
    expect(buildArenaTheme({ homeAbbr: 'LAL', currentYear: 2026 })).toMatchObject({
      homeAbbr: 'LAL',
      primary: '#552583',
      secondary: '#FDB927',
      centerText: 'LAL',
      laneColor: '#552583',
      scoreboardTint: '#FDB927',
    });
  });

  it('falls back safely for custom expansion teams', () => {
    expect(buildArenaTheme({
      homeAbbr: 'VEG',
      primaryColor: '#111111',
      secondaryColor: '#d4af37',
    })).toMatchObject({
      homeAbbr: 'VEG',
      primary: '#111111',
      secondary: '#d4af37',
      centerText: 'VEG',
    });
  });
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npx vitest run tests/domain/arenaTheme.test.ts
```

Expected: FAIL because `domain/nba/arenaTheme.ts` does not exist.

- [ ] **Step 3: Implement `domain/nba/arenaTheme.ts`**

Create `domain/nba/arenaTheme.ts`:

```ts
import { getCurrentTeamAbbr, getTeamColors } from '@/constants/teamColors';

export type ArenaThemeInput = {
  homeAbbr?: string | null;
  currentYear?: number | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
};

export type ArenaTheme = {
  homeAbbr: string;
  primary: string;
  secondary: string;
  text: string;
  centerText: string;
  laneColor: string;
  sidelineColor: string;
  crowdGlow: string;
  scoreboardTint: string;
};

function normalizeAbbr(abbr?: string | null) {
  return String(abbr || 'NBA').trim().toUpperCase() || 'NBA';
}

export function buildArenaTheme(input: ArenaThemeInput): ArenaTheme {
  const rawAbbr = normalizeAbbr(input.homeAbbr);
  const homeAbbr = input.currentYear ? getCurrentTeamAbbr(rawAbbr, input.currentYear) : rawAbbr;
  const colors = getTeamColors(homeAbbr, input.currentYear || undefined);
  const primary = input.primaryColor || colors[0] || '#0b1f16';
  const secondary = input.secondaryColor || colors[1] || '#00e58b';
  const text = colors[2] || '#ffffff';
  return {
    homeAbbr,
    primary,
    secondary,
    text,
    centerText: homeAbbr,
    laneColor: primary,
    sidelineColor: secondary,
    crowdGlow: primary,
    scoreboardTint: secondary,
  };
}
```

- [ ] **Step 4: Run arena theme tests**

Run:

```bash
npx vitest run tests/domain/arenaTheme.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git add domain/nba/arenaTheme.ts tests/domain/arenaTheme.test.ts
git commit -m "feat: add live mode arena themes"
```

## Task 3: Mirror Live Timeline And Arena Theme In Functions

**Files:**
- Create: `functions/franchise/liveTimeline.js`
- Create: `functions/franchise/arenaTheme.js`
- Test: `tests/functions/liveTimeline.test.ts`

- [ ] **Step 1: Write failing function parity tests**

Create `tests/functions/liveTimeline.test.ts`:

```ts
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { buildLiveTimeline, currentTimelineEvent, periodLabel } = require('../../functions/franchise/liveTimeline.js');
const { buildArenaTheme } = require('../../functions/franchise/arenaTheme.js');

describe('function Live Mode helpers', () => {
  it('builds a deterministic timeline with overtime labels', () => {
    const timeline = buildLiveTimeline({
      gameId: 'fn-game-1',
      seed: 'fn-seed',
      homeTeamId: 'LAL',
      awayTeamId: 'BOS',
      homeScore: 111,
      awayScore: 108,
      quarters: [
        { quarter: 1, home: 25, away: 25 },
        { quarter: 2, home: 25, away: 25 },
        { quarter: 3, home: 25, away: 25 },
        { quarter: 4, home: 25, away: 25 },
        { quarter: 5, home: 11, away: 8 },
      ],
    });

    expect(periodLabel(5)).toBe('OT');
    expect(timeline.periods.at(-1)).toMatchObject({ label: 'OT' });
    expect(timeline.events.at(-1)).toMatchObject({ homeScore: 111, awayScore: 108 });
    expect(currentTimelineEvent(timeline, 60_000).event).toBeTruthy();
  });

  it('builds a stored arena theme from the home team', () => {
    expect(buildArenaTheme({ homeAbbr: 'BOS' })).toMatchObject({
      homeAbbr: 'BOS',
      primary: '#007A33',
      centerText: 'BOS',
    });
  });
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npx vitest run tests/functions/liveTimeline.test.ts
```

Expected: FAIL because function helper files do not exist.

- [ ] **Step 3: Implement `functions/franchise/liveTimeline.js`**

Create `functions/franchise/liveTimeline.js` as a CommonJS mirror of Task 1. Use the same exported names:

```js
'use strict';

function hash(value) {
  let h = 2166136261;
  for (let index = 0; index < String(value).length; index += 1) {
    h ^= String(value).charCodeAt(index);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function periodLabel(period) {
  if (period <= 4) return `Q${period}`;
  if (period === 5) return 'OT';
  return `${period - 4}OT`;
}

function periodLength(period) {
  return period <= 4 ? 720 : 300;
}

function scoringBursts(total, count, seed) {
  const values = Array.from({ length: Math.max(1, count) }, (_, index) => (hash(`${seed}:${index}`) % 3) + 1);
  const sum = values.reduce((next, value) => next + value, 0) || 1;
  const points = values.map(value => Math.max(1, Math.floor((value / sum) * total)));
  let diff = total - points.reduce((next, value) => next + value, 0);
  let cursor = 0;
  while (diff > 0 && points.length > 0) {
    points[cursor] += 1;
    diff -= 1;
    cursor = (cursor + 1) % points.length;
  }
  return points;
}

function eventCountForPoints(points) {
  return Math.max(1, Math.round(points / 2.25));
}

function scorer(players, seed, index) {
  if (!Array.isArray(players) || players.length === 0) return null;
  const weighted = [...players].sort((a, b) => Number(b.points || 0) - Number(a.points || 0) || String(a.playerId).localeCompare(String(b.playerId)));
  return weighted[hash(`${seed}:${index}`) % weighted.length];
}

function tagForPoints(points) {
  if (points >= 3) return ['three'];
  if (points === 1) return ['free_throw'];
  return ['paint'];
}

function buildLiveTimeline(input) {
  const periods = (input.quarters || []).map(period => ({
    period: period.quarter,
    label: periodLabel(period.quarter),
    home: period.home,
    away: period.away,
  }));
  const revealDurationMs = Math.max(120000, Math.min(300000, periods.length * 45000));
  const totalGameSeconds = periods.reduce((total, period) => total + periodLength(period.period), 0) || 1;
  const events = [];
  let homeScore = 0;
  let awayScore = 0;

  periods.forEach((period) => {
    const length = periodLength(period.period);
    const homeBursts = scoringBursts(period.home, eventCountForPoints(period.home), `${input.seed}:home:${period.period}`);
    const awayBursts = scoringBursts(period.away, eventCountForPoints(period.away), `${input.seed}:away:${period.period}`);
    const periodEvents = [
      ...homeBursts.map((points, index) => ({ side: 'home', points, slot: index })),
      ...awayBursts.map((points, index) => ({ side: 'away', points, slot: index })),
    ].sort((left, right) => hash(`${input.seed}:${period.period}:${left.side}:${left.slot}`) - hash(`${input.seed}:${period.period}:${right.side}:${right.slot}`));
    const elapsedBefore = periods
      .filter(candidate => candidate.period < period.period)
      .reduce((total, candidate) => total + periodLength(candidate.period), 0);

    periodEvents.forEach((item, index) => {
      const clockSeconds = Math.max(0, length - Math.floor(((index + 1) / (periodEvents.length + 1)) * length));
      const elapsedSeconds = elapsedBefore + (length - clockSeconds);
      const elapsedMs = Math.floor((elapsedSeconds / totalGameSeconds) * revealDurationMs);
      const teamId = item.side === 'home' ? input.homeTeamId : input.awayTeamId;
      const player = scorer(item.side === 'home' ? input.homePlayers : input.awayPlayers, `${input.seed}:${period.period}:${item.side}`, index);
      if (item.side === 'home') homeScore += item.points;
      if (item.side === 'away') awayScore += item.points;
      events.push({
        id: `${input.gameId}_${period.period}_${index}_${item.side}`,
        period: period.period,
        periodLabel: period.label,
        clockSeconds,
        elapsedMs,
        homeScore,
        awayScore,
        eventType: 'score',
        actingTeamId: teamId,
        playerId: player && player.playerId,
        playerName: player && player.name,
        text: `${player && player.name ? player.name : teamId} scores ${item.points}`,
        x: item.side === 'home' ? 58 + (hash(`${input.seed}:x:${index}`) % 32) : 10 + (hash(`${input.seed}:x:${index}`) % 32),
        y: 18 + (hash(`${input.seed}:y:${period.period}:${index}`) % 64),
        momentum: homeScore - awayScore,
        tags: tagForPoints(item.points),
      });
    });

    events.push({
      id: `${input.gameId}_${period.period}_end`,
      period: period.period,
      periodLabel: period.label,
      clockSeconds: 0,
      elapsedMs: Math.floor(((elapsedBefore + length) / totalGameSeconds) * revealDurationMs),
      homeScore,
      awayScore,
      eventType: period.period === periods[periods.length - 1].period ? 'final_buzzer' : 'period_end',
      actingTeamId: homeScore >= awayScore ? input.homeTeamId : input.awayTeamId,
      text: period.period === periods[periods.length - 1].period ? 'Final buzzer' : `${period.label} ends`,
      x: 50,
      y: 50,
      momentum: homeScore - awayScore,
      tags: period.period > 4 ? ['overtime'] : [],
    });
  });

  if (events.length > 0) {
    events[events.length - 1].homeScore = input.homeScore;
    events[events.length - 1].awayScore = input.awayScore;
  }
  return { version: 1, revealDurationMs, periods, events };
}

function currentTimelineEvent(timeline, elapsedMs) {
  const events = Array.isArray(timeline && timeline.events) ? timeline.events : [];
  let index = events.findLastIndex(event => Number(event.elapsedMs) <= elapsedMs);
  if (index < 0) index = 0;
  return { index, event: events[index] || null };
}

module.exports = { buildLiveTimeline, currentTimelineEvent, periodLabel };
```

- [ ] **Step 4: Implement `functions/franchise/arenaTheme.js`**

Create `functions/franchise/arenaTheme.js`:

```js
'use strict';

const TEAM_COLORS = {
  ATL: ['#C1D32F', '#E03A3E', '#ffffff'],
  BOS: ['#007A33', '#FFFFFF', '#ffffff'],
  BKN: ['#000000', '#FFFFFF', '#ffffff'],
  CHA: ['#00788C', '#FFFFFF', '#ffffff'],
  CHI: ['#CE1141', '#000000', '#ffffff'],
  CLE: ['#860038', '#FDBB30', '#ffffff'],
  DAL: ['#00538C', '#FFFFFF', '#ffffff'],
  DEN: ['#0E2240', '#FEC524', '#ffffff'],
  DET: ['#1D42BA', '#C8102E', '#ffffff'],
  GSW: ['#FFC72C', '#1D428A', '#ffffff'],
  HOU: ['#A40012', '#FFFFFF', '#ffffff'],
  IND: ['#002D62', '#FDBB30', '#ffffff'],
  LAC: ['#1D428A', '#C8102E', '#ffffff'],
  LAL: ['#552583', '#FDB927', '#ffffff'],
  MEM: ['#00B2A9', '#12173F', '#ffffff'],
  MIA: ['#98002E', '#F9A01B', '#ffffff'],
  MIL: ['#EEE1C6', '#00471B', '#ffffff'],
  MIN: ['#0C2340', '#78BE20', '#ffffff'],
  NOP: ['#85714D', '#0C2340', '#ffffff'],
  NYK: ['#F58426', '#006BB6', '#ffffff'],
  OKC: ['#007AC1', '#EF3B24', '#ffffff'],
  ORL: ['#0B1F3F', '#0077C0', '#ffffff'],
  PHI: ['#ED174C', '#006BB6', '#ffffff'],
  PHX: ['#E56020', '#1D1160', '#ffffff'],
  POR: ['#E03A3E', '#FFFFFF', '#ffffff'],
  SAC: ['#5A2D81', '#63727A', '#ffffff'],
  SAS: ['#C4CED4', '#6D6E71', '#ffffff'],
  TOR: ['#C4A26C', '#000000', '#ffffff'],
  UTA: ['#0E1B36', '#F9A01B', '#ffffff'],
  WAS: ['#002B5C', '#E31837', '#ffffff'],
};

function normalizeAbbr(abbr) {
  return String(abbr || 'NBA').trim().toUpperCase() || 'NBA';
}

function buildArenaTheme(input = {}) {
  const homeAbbr = normalizeAbbr(input.homeAbbr);
  const colors = TEAM_COLORS[homeAbbr] || ['#0b1f16', '#00e58b', '#ffffff'];
  const primary = input.primaryColor || colors[0];
  const secondary = input.secondaryColor || colors[1];
  return {
    homeAbbr,
    primary,
    secondary,
    text: colors[2] || '#ffffff',
    centerText: homeAbbr,
    laneColor: primary,
    sidelineColor: secondary,
    crowdGlow: primary,
    scoreboardTint: secondary,
  };
}

module.exports = { buildArenaTheme };
```

- [ ] **Step 5: Run function helper tests**

Run:

```bash
npx vitest run tests/functions/liveTimeline.test.ts
node --check functions/franchise/liveTimeline.js
node --check functions/franchise/arenaTheme.js
```

Expected: all pass.

- [ ] **Step 6: Commit Task 3**

Run:

```bash
git add functions/franchise/liveTimeline.js functions/franchise/arenaTheme.js tests/functions/liveTimeline.test.ts
git commit -m "feat: mirror live mode helpers in functions"
```

## Task 4: Generate Live Mode Data In Matchup Simulation

**Files:**
- Modify: `functions/franchise/matchups.js`
- Test: `tests/functions/matchups.test.ts`

- [ ] **Step 1: Add failing function tests**

Append to `tests/functions/matchups.test.ts`:

```ts
it('attaches Live Mode timeline and reveal timestamps to simulated games', () => {
  const game = seedAvailableGame({ id: 'live-game-1', homeTeamId: 'LAL', awayTeamId: 'BOS' });
  const result = simulateScheduledGame({
    game,
    uid: game.homeGmId,
    nowMs: 10_000,
    homeTeam: { abbreviation: 'LAL', players: Array.from({ length: 8 }, (_, index) => ({ player_id: `h${index}`, full_name: `Home ${index}`, hidden: { shooting: 80, playmaking: 80, defense: 80 } })) },
    awayTeam: { abbreviation: 'BOS', players: Array.from({ length: 8 }, (_, index) => ({ player_id: `a${index}`, full_name: `Away ${index}`, hidden: { shooting: 78, playmaking: 78, defense: 78 } })) },
  });

  expect(result.liveMode).toMatchObject({
    status: 'unfolding',
    simulationStartedAtMs: 10_000,
    simulationEndsAtMs: expect.any(Number),
  });
  expect(result.liveTimeline.events.length).toBeGreaterThan(20);
  expect(result.liveTimeline.events.at(-1)).toMatchObject({
    homeScore: result.homeScore,
    awayScore: result.awayScore,
  });
  expect(result.arenaTheme).toMatchObject({ homeAbbr: 'LAL', primary: '#552583' });
});

it('keeps overtime periods when a simulated game reaches overtime', () => {
  const game = seedAvailableGame({ id: 'live-ot-game', homeTeamId: 'LAL', awayTeamId: 'BOS' });
  const result = simulateScheduledGameResult({
    game,
    uid: game.homeGmId,
    nowMs: 11_000,
    forceOvertime: true,
    homeTeam: { abbreviation: 'LAL', players: [] },
    awayTeam: { abbreviation: 'BOS', players: [] },
  });

  expect(result.game.quarters.some((period: any) => period.quarter === 5)).toBe(true);
  expect(result.game.liveTimeline.periods.at(-1).label).toBe('OT');
  expect(result.game.homeScore).not.toBe(result.game.awayScore);
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npx vitest run tests/functions/matchups.test.ts
```

Expected: FAIL because `liveTimeline`, `liveMode`, `arenaTheme`, and `forceOvertime` are not implemented.

- [ ] **Step 3: Import helper modules in `functions/franchise/matchups.js`**

Add near the top:

```js
const { buildLiveTimeline } = require('./liveTimeline');
const { buildArenaTheme } = require('./arenaTheme');
```

- [ ] **Step 4: Replace silent tie-breaking with overtime-aware scoring**

Update `quarterScores` to accept period totals and keep overtime periods:

```js
function periodScores(homeScore, awayScore, seed, forceOvertime = false) {
  const regulationHomeTarget = forceOvertime ? Math.floor(homeScore * 0.88) : homeScore;
  const regulationAwayTarget = forceOvertime ? regulationHomeTarget : awayScore;
  const split = (total, label, count) => {
    const raw = Array.from({ length: count }, (_, index) => 20 + (hash(`${seed}:${label}:${index}`) % 12));
    const rawTotal = raw.reduce((sum, value) => sum + value, 0) || 1;
    const scores = raw.map(value => Math.floor((value / rawTotal) * total));
    let diff = total - scores.reduce((sum, value) => sum + value, 0);
    let cursor = 0;
    while (diff > 0) {
      scores[cursor] += 1;
      diff -= 1;
      cursor = (cursor + 1) % scores.length;
    }
    return scores;
  };
  const home = split(regulationHomeTarget, 'home', 4);
  const away = split(regulationAwayTarget, 'away', 4);
  const periods = [0, 1, 2, 3].map(index => ({ quarter: index + 1, home: home[index], away: away[index] }));
  const tiedAfterRegulation = periods.reduce((sum, period) => sum + period.home, 0) === periods.reduce((sum, period) => sum + period.away, 0);
  if (forceOvertime || tiedAfterRegulation) {
    periods.push({
      quarter: 5,
      home: Math.max(1, homeScore - regulationHomeTarget),
      away: Math.max(0, awayScore - regulationAwayTarget),
    });
  }
  return periods;
}
```

- [ ] **Step 5: Attach Live Mode fields in `simulateRosterGame`**

After computing `homeScore`, `awayScore`, `home`, `away`, and `winnerTeamId`, add:

```js
const periods = periodScores(homeScore, awayScore, seed, Boolean(arguments[0] && arguments[0].forceOvertime));
const liveTimeline = buildLiveTimeline({
  gameId: game.id,
  seed,
  homeTeamId: game.homeTeamId,
  awayTeamId: game.awayTeamId,
  homeScore,
  awayScore,
  quarters: periods,
  homePlayers: home.players.map(player => ({ playerId: player.playerId, name: player.name, points: player.points })),
  awayPlayers: away.players.map(player => ({ playerId: player.playerId, name: player.name, points: player.points })),
});
const simulationStartedAtMs = nowMs;
const simulationEndsAtMs = nowMs + liveTimeline.revealDurationMs;
```

Return:

```js
return {
  homeScore,
  awayScore,
  boxScore: { home, away },
  quarters: periods,
  story: `${winnerTeamId} controlled the decisive stretches behind roster strength and rotation production.`,
  liveTimeline,
  liveMode: {
    status: 'unfolding',
    simulationStartedAtMs,
    simulationEndsAtMs,
    revealDurationMs: liveTimeline.revealDurationMs,
  },
  arenaTheme: buildArenaTheme({ homeAbbr: game.homeTeamId }),
};
```

- [ ] **Step 6: Pass `forceOvertime` through `simulateScheduledGameResult` for tests**

Inside `simulateScheduledGameResult`, pass:

```js
forceOvertime: Boolean(arguments[0] && arguments[0].forceOvertime),
```

to `simulateRosterGame`.

- [ ] **Step 7: Spread Live Mode fields into the persisted game**

In the `status: 'final'` game object built by `simulateScheduledGameResult`, add:

```js
liveTimeline: rosterSimulation.liveTimeline,
liveMode: rosterSimulation.liveMode,
arenaTheme: rosterSimulation.arenaTheme,
simulationStartedAtMs: rosterSimulation.liveMode.simulationStartedAtMs,
simulationEndsAtMs: rosterSimulation.liveMode.simulationEndsAtMs,
```

Keep the persisted `status: 'final'` for this first implementation so existing standings, stat updates, reset, result screen, calendar, playoffs, and NBA Cup flows keep working. Live Mode uses `liveMode.status` and timestamps to reveal the already-authoritative result without adding a new scheduled-function dependency.

- [ ] **Step 8: Run function tests**

Run:

```bash
npx vitest run tests/functions/matchups.test.ts tests/functions/liveTimeline.test.ts
node --check functions/franchise/matchups.js
```

Expected: PASS.

- [ ] **Step 9: Commit Task 4**

Run:

```bash
git add functions/franchise/matchups.js tests/functions/matchups.test.ts
git commit -m "feat: attach live mode timelines to simulations"
```

## Task 5: Build The Live Mode Screen

**Files:**
- Create: `app/screens/season/live-mode.tsx`
- Modify: `app/_layout.tsx`
- Modify: `app/screens/season/_layout.tsx`
- Test: `tests/domain/sourceSafety.test.ts`

- [ ] **Step 1: Add failing source safety test**

Append to `tests/domain/sourceSafety.test.ts`:

```ts
  it('registers Live Mode without live adjustment controls', () => {
    const rootLayout = source('app/_layout.tsx');
    const seasonLayout = source('app/screens/season/_layout.tsx');
    const liveMode = source('app/screens/season/live-mode.tsx');

    expect(rootLayout).toContain('screens/season/live-mode');
    expect(seasonLayout).toContain('live-mode');
    expect(liveMode).toContain('liveTimeline');
    expect(liveMode).toContain('arenaTheme');
    expect(liveMode).toContain('currentTimelineEvent');
    expect(liveMode).not.toContain('httpsCallable(functions');
    expect(liveMode).not.toContain('Push Tempo');
    expect(liveMode).not.toContain('Trap Star');
  });
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npx vitest run tests/domain/sourceSafety.test.ts
```

Expected: FAIL because the route and screen do not exist.

- [ ] **Step 3: Create `app/screens/season/live-mode.tsx`**

Create a screen with these imports and type boundaries:

```tsx
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import SportTeamLogo from '@/components/SportTeamLogo';
import { db } from '@/constants/firebase';
import { currentTimelineEvent, type LiveTimeline, type LiveTimelineEvent } from '@/domain/nba/liveTimeline';
import { normalizeScheduleKey, teamScheduleKeys } from '@/domain/nba/scheduleView';
```

Use these local types:

```tsx
type Team = {
  id: string;
  teamId?: string;
  abbreviation?: string;
  name?: string;
  gmId?: string;
};

type LiveGame = {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore?: number;
  awayScore?: number;
  status?: string;
  liveTimeline?: LiveTimeline;
  liveMode?: {
    status?: string;
    simulationStartedAtMs?: number;
    simulationEndsAtMs?: number;
    revealDurationMs?: number;
  };
  arenaTheme?: {
    homeAbbr: string;
    primary: string;
    secondary: string;
    text: string;
    centerText: string;
    laneColor: string;
    sidelineColor: string;
    crowdGlow: string;
    scoreboardTint: string;
  };
};
```

Implement this behavior:

```tsx
const { leagueId, gameId, competition } = useLocalSearchParams<{ leagueId: string; gameId: string; competition?: string }>();
const [nowMs, setNowMs] = useState(Date.now());

useEffect(() => {
  const interval = setInterval(() => setNowMs(Date.now()), 1000);
  return () => clearInterval(interval);
}, []);
```

Compute visible event:

```tsx
const elapsedMs = Math.max(0, nowMs - Number(game?.liveMode?.simulationStartedAtMs || nowMs));
const timeline = game?.liveTimeline || null;
const visible = timeline ? currentTimelineEvent(timeline, elapsedMs) : null;
const visibleEvent = visible?.event || null;
const visibleEvents = timeline?.events.slice(0, (visible?.index || 0) + 1).slice(-8).reverse() || [];
```

Render structure:

```tsx
return (
  <View style={[styles.screen, { backgroundColor: theme.primary || '#050706' }]}>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>...</View>
      <View style={styles.scoreboard}>...</View>
      <View style={[styles.arena, { borderColor: theme.secondary }]}>
        <View style={[styles.centerLogo, { borderColor: theme.secondary }]}>
          <Text style={styles.centerLogoText}>{theme.centerText}</Text>
        </View>
        <Animated.View style={[styles.ball, ballStyle]} />
        {tokens.map(token => <Animated.View key={token.id} style={[styles.token, tokenStyle(token, visibleEvent)]} />)}
      </View>
      <View style={styles.momentCard}>...</View>
      <View style={styles.periodPanel}>...</View>
      <View style={styles.feedPanel}>...</View>
      <TouchableOpacity onPress={() => router.push({ pathname: '/screens/season/game-result', params: { leagueId, gameId, competition: competition || 'regular' } })}>
        <Text>View Final Result</Text>
      </TouchableOpacity>
    </ScrollView>
  </View>
);
```

Do not import `httpsCallable` or render any strategy buttons.

- [ ] **Step 4: Register routes**

In `app/_layout.tsx`, add:

```tsx
<Stack.Screen name="screens/season/live-mode" />
```

In `app/screens/season/_layout.tsx`, add:

```tsx
<Stack.Screen name="live-mode" />
```

- [ ] **Step 5: Run source safety test**

Run:

```bash
npx vitest run tests/domain/sourceSafety.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

Run:

```bash
git add app/screens/season/live-mode.tsx app/_layout.tsx app/screens/season/_layout.tsx tests/domain/sourceSafety.test.ts
git commit -m "feat: add live mode screen"
```

## Task 6: Route Simulated Games Into Live Mode

**Files:**
- Modify: `app/screens/season/matchup.tsx`
- Modify: `app/screens/season/calendar.tsx`
- Modify: `app/screens/season/game-result.tsx`
- Test: `tests/domain/sourceSafety.test.ts`

- [ ] **Step 1: Add failing source safety assertions**

Extend the Live Mode source safety test with:

```ts
    const matchup = source('app/screens/season/matchup.tsx');
    const calendar = source('app/screens/season/calendar.tsx');
    const result = source('app/screens/season/game-result.tsx');

    expect(matchup).toContain('/screens/season/live-mode');
    expect(calendar).toContain('/screens/season/live-mode');
    expect(result).toContain('/screens/season/live-mode');
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npx vitest run tests/domain/sourceSafety.test.ts
```

Expected: FAIL until routing is added.

- [ ] **Step 3: Route simulation responses in `matchup.tsx`**

After `simulateScheduledGame` resolves, replace direct result routing with:

```tsx
if (name === 'simulateScheduledGame') {
  router.push({
    pathname: '/screens/season/live-mode',
    params: { leagueId, gameId, competition: isCupGame ? 'nbaCup' : isPlayoffGame ? 'playoffs' : 'regular' },
  });
  return;
}
```

Keep manual score reporting routed to `game-result`.

- [ ] **Step 4: Route simulating/final timeline games in `calendar.tsx`**

When opening a card, use:

```tsx
const target = game.liveTimeline
  ? '/screens/season/live-mode'
  : game.status === 'final'
    ? '/screens/season/game-result'
    : '/screens/season/matchup';
router.push({ pathname: target, params: { leagueId, gameId: game.id, competition: game.competition || 'regular' } });
```

- [ ] **Step 5: Add replay link in `game-result.tsx`**

If the game has `liveTimeline`, render:

```tsx
<TouchableOpacity
  onPress={() => router.push({ pathname: '/screens/season/live-mode', params: { leagueId, gameId, competition: isCupGame ? 'nbaCup' : isPlayoffGame ? 'playoffs' : 'regular' } })}
  style={styles.liveReplayButton}
>
  <Ionicons color="#00e58b" name="play-circle" size={18} />
  <Text style={styles.liveReplayButtonText}>Watch Live Mode Replay</Text>
</TouchableOpacity>
```

- [ ] **Step 6: Run source safety tests**

Run:

```bash
npx vitest run tests/domain/sourceSafety.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 6**

Run:

```bash
git add app/screens/season/matchup.tsx app/screens/season/calendar.tsx app/screens/season/game-result.tsx tests/domain/sourceSafety.test.ts
git commit -m "feat: route games to live mode"
```

## Task 7: Overtime Display In Result Screen

**Files:**
- Modify: `app/screens/season/game-result.tsx`
- Test: `tests/domain/sourceSafety.test.ts`

- [ ] **Step 1: Add source safety assertion for overtime labels**

Add:

```ts
  it('shows overtime period labels in game results', () => {
    const result = source('app/screens/season/game-result.tsx');

    expect(result).toContain('periodLabel');
    expect(result).toContain("quarter.quarter === 5 ? 'OT'");
  });
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npx vitest run tests/domain/sourceSafety.test.ts
```

Expected: FAIL until result period labels are updated.

- [ ] **Step 3: Add period label helper in `game-result.tsx`**

Add above the screen component:

```tsx
function periodLabel(quarter: { quarter?: number }) {
  const period = Number(quarter.quarter || 0);
  if (period <= 4) return `Q${period}`;
  return quarter.quarter === 5 ? 'OT' : `${period - 4}OT`;
}
```

Replace `Q{quarter.quarter}` in quarter tables with:

```tsx
{periodLabel(quarter)}
```

- [ ] **Step 4: Run source safety test**

Run:

```bash
npx vitest run tests/domain/sourceSafety.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 7**

Run:

```bash
git add app/screens/season/game-result.tsx tests/domain/sourceSafety.test.ts
git commit -m "feat: show overtime in game results"
```

## Task 8: Final Verification

**Files:**
- Modify: `docs/FRANCHISE_ENGINE_QA.md`

- [ ] **Step 1: Add QA checklist items**

In `docs/FRANCHISE_ENGINE_QA.md`, add these simulator checks:

```md
- [ ] Live Mode opens after simulated regular season, NBA Cup, and playoff games.
- [ ] Live Mode shows home-team arena colors and logo/abbreviation.
- [ ] Live Mode has no in-game GM adjustment buttons.
- [ ] Live Mode reveals score-by-score events and then links to final result.
- [ ] Overtime games show OT columns in Live Mode and final result.
```

- [ ] **Step 2: Run targeted tests**

Run:

```bash
npx vitest run tests/domain/liveTimeline.test.ts tests/domain/arenaTheme.test.ts tests/functions/liveTimeline.test.ts tests/functions/matchups.test.ts tests/domain/sourceSafety.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run full verification**

Run:

```bash
npm test
npx tsc --noEmit
node --check functions/index.js
node --check functions/franchise/matchups.js
node --check functions/franchise/liveTimeline.js
node --check functions/franchise/arenaTheme.js
git diff --check
npx expo export --platform ios --output-dir /tmp/franchise-live-mode-ios
npx expo export --platform android --output-dir /tmp/franchise-live-mode-android
```

Expected:

- `npm test`: all test files pass.
- `npx tsc --noEmit`: exits 0.
- `node --check`: exits 0 for each file.
- `git diff --check`: exits 0.
- iOS export completes.
- Android export completes.

- [ ] **Step 4: Commit final QA update**

Run:

```bash
git add docs/FRANCHISE_ENGINE_QA.md
git commit -m "docs: add live mode qa checks"
```

## Deployment Notes

Live Mode changes require deploying functions because `simulateScheduledGame` and result payloads change:

```bash
npx firebase-tools deploy --only functions --project association-social
```

No new Firestore indexes are expected because Live Mode fields are stored on existing schedule game arrays and read through existing schedule document listeners.

## Plan Self-Review

- Spec coverage:
  - Pregame-only fairness: Task 5 source test forbids Live Mode mutation callables and strategy buttons.
  - Live score-by-score reveal: Tasks 1, 3, 4, and 5 generate and render `liveTimeline`.
  - Overtime: Tasks 1, 4, and 7 cover timeline, function payloads, and result labels.
  - Home arena themes: Tasks 2, 3, and 5 cover theme generation and rendering.
  - Final result path: Tasks 4, 6, and 7 keep existing final result behavior and add replay.
- Placeholder scan: This plan uses concrete file paths, function names, test names, commands, and expected outcomes.
- Type consistency: `liveTimeline`, `liveMode`, `arenaTheme`, `simulationStartedAtMs`, and `simulationEndsAtMs` are used consistently in domain, functions, and app tasks.
