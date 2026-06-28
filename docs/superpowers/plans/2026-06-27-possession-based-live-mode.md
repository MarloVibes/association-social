# Possession-Based Live Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current final-score-first Live Mode generator with a possession-first basketball simulator and a starters-first head-to-head player feed.

**Architecture:** Add a focused possession simulator in Firebase functions, then have matchup simulation derive final score, box score, quarter scoring, and replay data from that simulator. Keep the existing app timeline reader compatible with version 1 timelines while adding support for version 2 timeline metadata used by the new head-to-head feed.

**Tech Stack:** Expo Router, React Native, TypeScript, Firebase Functions CommonJS modules, Firestore, Vitest.

---

## File Structure

- Create `functions/franchise/possessionTimeline.js`: backend source of truth for possession-by-possession simulation.
- Create `tests/functions/possessionTimeline.test.ts`: backend tests for possession rules, stat totals, overtime, and Firestore safety.
- Modify `functions/franchise/matchups.js`: call the possession simulator from `simulateRosterGame`, remove dependency on final-score-first timeline building for new games.
- Modify `tests/functions/matchups.test.ts`: assert simulated games store version 2 timelines and generated box scores.
- Modify `domain/nba/liveTimeline.ts`: add TypeScript support for version 2 timeline fields and starter matchup helpers.
- Modify `tests/domain/liveTimeline.test.ts`: assert version 2 player stats and starter matchup helpers.
- Modify `app/screens/season/live-mode.tsx`: redesign the live player feed as starters-first head-to-head with a See More expansion for bench/full rotation.
- Modify `tests/domain/sourceSafety.test.ts`: add static checks for the Live Mode route showing the starter matchup feed.

---

### Task 1: Possession Timeline Engine

**Files:**
- Create: `functions/franchise/possessionTimeline.js`
- Test: `tests/functions/possessionTimeline.test.ts`

- [ ] **Step 1: Write failing tests for possession rules**

Add `tests/functions/possessionTimeline.test.ts`:

```ts
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  buildPossessionTimeline,
  totalsFromPossessionEvents,
} = require('../../functions/franchise/possessionTimeline.js');

function team(teamId: string, skill: number) {
  return {
    teamId,
    name: teamId,
    players: Array.from({ length: 9 }, (_, index) => ({
      player_id: `${teamId}-${index}`,
      full_name: `${teamId} Player ${index + 1}`,
      position: ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F', 'F', 'C'][index],
      minutes: index < 5 ? 30 : 15,
      hidden: {
        shooting: skill + (index === 1 ? 8 : 0),
        playmaking: skill + (index === 0 ? 8 : 0),
        defense: skill + (index === 2 ? 8 : 0),
        rebounding: skill + (index === 4 ? 10 : 0),
        basketballIq: skill,
      },
    })),
  };
}

function undefinedPaths(value: unknown, path = 'timeline'): string[] {
  if (value === undefined) return [path];
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap((item, index) => undefinedPaths(item, `${path}.${index}`));
  return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => undefinedPaths(item, `${path}.${key}`));
}

describe('possession timeline engine', () => {
  it('generates a Firestore-safe version 2 timeline from basketball possessions', () => {
    const timeline = buildPossessionTimeline({
      gameId: 'game-1',
      seed: 'seed-1',
      homeTeamId: 'CHI',
      awayTeamId: 'PHI',
      homeTeam: team('CHI', 82),
      awayTeam: team('PHI', 78),
      nowMs: 10_000,
    });

    expect(timeline.version).toBe(2);
    expect(timeline.events.length).toBeGreaterThan(120);
    expect(timeline.starterMatchups).toHaveLength(5);
    expect(undefinedPaths(timeline)).toEqual([]);
    expect(timeline.events.at(-1)).toMatchObject({ eventType: 'final_buzzer', clockSeconds: 0 });
    expect(timeline.revealDurationMs).toBe(Math.round((48 * 60 / 3) * 1000));
  });

  it('keeps assists, rebounds, and steals attached to valid possession actions', () => {
    const timeline = buildPossessionTimeline({
      gameId: 'game-2',
      seed: 'seed-2',
      homeTeamId: 'CHI',
      awayTeamId: 'PHI',
      homeTeam: team('CHI', 82),
      awayTeam: team('PHI', 78),
      nowMs: 10_000,
    });

    const statEvents = timeline.events.filter((event: any) => !['period_end', 'final_buzzer'].includes(event.eventType));
    expect(statEvents.some((event: any) => event.text.includes('Assist:'))).toBe(true);
    expect(statEvents.some((event: any) => event.text.includes('Rebound:'))).toBe(true);
    expect(statEvents.some((event: any) => event.text.includes('Steal:'))).toBe(true);
    expect(statEvents.every((event: any) => !['assist', 'rebound', 'steal'].includes(event.eventType))).toBe(true);

    statEvents.forEach((event: any) => {
      const merged = Object.assign({}, ...(event.statDeltas || []).map((delta: any) => delta.stats));
      if (merged.assists) expect(event.eventType).toBe('score');
      if (merged.rebounds) expect(['miss', 'free_throw_trip'].includes(event.eventType)).toBe(true);
      if (merged.steals) expect(event.eventType).toBe('turnover');
    });
  });

  it('derives final score and player box score from the possession events', () => {
    const timeline = buildPossessionTimeline({
      gameId: 'game-3',
      seed: 'seed-3',
      homeTeamId: 'CHI',
      awayTeamId: 'PHI',
      homeTeam: team('CHI', 82),
      awayTeam: team('PHI', 78),
      nowMs: 10_000,
    });
    const totals = totalsFromPossessionEvents(timeline);

    expect(totals.homeScore).toBe(timeline.homeScore);
    expect(totals.awayScore).toBe(timeline.awayScore);
    expect(totals.players.length).toBeGreaterThanOrEqual(10);
    expect(totals.players.reduce((sum: number, player: any) => sum + player.points, 0)).toBe(timeline.homeScore + timeline.awayScore);
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run: `npm run test:functions -- tests/functions/possessionTimeline.test.ts`

Expected: fail because `functions/franchise/possessionTimeline.js` does not exist.

- [ ] **Step 3: Implement the minimal possession engine**

Create `functions/franchise/possessionTimeline.js` with these exported functions and keep helper functions in the same file:

```js
'use strict';

const REGULATION_PERIOD_SECONDS = 720;
const OVERTIME_PERIOD_SECONDS = 300;
const LIVE_MODE_SPEED_MULTIPLIER = 3;

function buildPossessionTimeline(input) {
  const rng = createRng(hashString(String(input.seed || input.gameId || 'game')));
  const home = buildTeamContext(input.homeTeamId, input.homeTeam, 'home');
  const away = buildTeamContext(input.awayTeamId, input.awayTeam, 'away');
  const events = [];
  const stats = new Map();
  const periods = [];
  let homeScore = 0;
  let awayScore = 0;
  let period = 1;
  let offense = rng() >= 0.5 ? 'home' : 'away';

  while (period <= 4 || homeScore === awayScore) {
    const periodSeconds = period > 4 ? OVERTIME_PERIOD_SECONDS : REGULATION_PERIOD_SECONDS;
    let clockSeconds = periodSeconds;
    let periodHome = 0;
    let periodAway = 0;
    while (clockSeconds > 0) {
      const possession = resolvePossession({
        rng,
        input,
        period,
        clockSeconds,
        offense,
        home,
        away,
        stats,
        homeScore,
        awayScore,
      });
      clockSeconds = Math.max(0, clockSeconds - possession.clockUsed);
      homeScore += possession.homePoints;
      awayScore += possession.awayPoints;
      periodHome += possession.homePoints;
      periodAway += possession.awayPoints;
      events.push(eventFromPossession({
        input,
        period,
        clockSeconds,
        possession,
        elapsedIndex: events.length,
        homeScore,
        awayScore,
      }));
      offense = possession.nextOffense;
    }
    periods.push({ period, label: periodLabel(period), home: periodHome, away: periodAway });
    events.push(periodEndEvent({ input, period, elapsedIndex: events.length, homeScore, awayScore }));
    period += 1;
  }

  const finalPeriod = periods.at(-1) || { period: 4, label: 'Q4' };
  events.push(withoutUndefined({
    id: `${input.gameId}-final`,
    period: finalPeriod.period,
    periodLabel: finalPeriod.label,
    clockSeconds: 0,
    elapsedMs: elapsedMsForIndex(events.length, periods),
    homeScore,
    awayScore,
    eventType: 'final_buzzer',
    actingTeamId: homeScore > awayScore ? input.homeTeamId : input.awayTeamId,
    text: `Final: ${displayTeam(away)} ${awayScore} - ${displayTeam(home)} ${homeScore}`,
    x: 50,
    y: 50,
    momentum: homeScore - awayScore,
    tags: ['final'],
    currentLineups: { home: home.starters.map(player => player.playerId), away: away.starters.map(player => player.playerId) },
  }));

  const timeline = withoutUndefined({
    version: 2,
    gameId: input.gameId,
    homeTeamId: input.homeTeamId,
    awayTeamId: input.awayTeamId,
    homeScore,
    awayScore,
    revealDurationMs: elapsedMsForIndex(events.length - 1, periods),
    speedMultiplier: LIVE_MODE_SPEED_MULTIPLIER,
    periods,
    starterMatchups: buildStarterMatchups(home, away),
    benchPreview: buildBenchPreview(home, away, stats),
    events,
  });
  return timeline;
}

function resolvePossession(ctx) {
  const offenseTeam = ctx.offense === 'home' ? ctx.home : ctx.away;
  const defenseTeam = ctx.offense === 'home' ? ctx.away : ctx.home;
  const shooter = weightedPick(offenseTeam.rotation, player => player.usage, ctx.rng);
  const assister = weightedPick(offenseTeam.rotation.filter(player => player.playerId !== shooter.playerId), player => player.playmaking, ctx.rng);
  const defender = weightedPick(defenseTeam.rotation, player => player.defense, ctx.rng);
  const shotValue = chooseShotValue(shooter, ctx.rng);
  const makeChance = clamp((shooter.scoring + shooter.iq + offenseTeam.coachingBoost - defender.defense - defenseTeam.defensiveBoost) / 180, 0.28, shotValue === 3 ? 0.48 : 0.68);
  const roll = ctx.rng();
  const clockUsed = 8 + Math.floor(ctx.rng() * 16);
  const actingTeamId = offenseTeam.teamId;
  const nextOffense = ctx.offense === 'home' ? 'away' : 'home';
  const deltas = [];

  if (roll < 0.11) {
    addStats(ctx.stats, shooter, { turnovers: 1 });
    const stolen = ctx.rng() < 0.62;
    if (stolen) {
      addStats(ctx.stats, defender, { steals: 1 });
      deltas.push(deltaFor(shooter, { turnovers: 1 }), deltaFor(defender, { steals: 1 }));
    } else {
      deltas.push(deltaFor(shooter, { turnovers: 1 }));
    }
    return withoutUndefined({
      eventType: 'turnover',
      actingTeamId,
      player: shooter,
      text: stolen ? `${shortName(shooter.name)} lost ball turnover. Steal: ${shortName(defender.name)}.` : `${shortName(shooter.name)} committed a turnover.`,
      statDeltas: deltas,
      clockUsed,
      homePoints: 0,
      awayPoints: 0,
      nextOffense,
      x: ctx.offense === 'home' ? 70 : 30,
      y: 45,
    });
  }

  if (roll < 0.18) {
    const freeThrows = shotValue === 3 && ctx.rng() < 0.08 ? 3 : 2;
    const made = Array.from({ length: freeThrows }).filter(() => ctx.rng() < clamp(shooter.iq / 110, 0.58, 0.92)).length;
    addStats(ctx.stats, shooter, { points: made });
    deltas.push(deltaFor(shooter, { points: made }));
    return withoutUndefined({
      eventType: 'free_throw_trip',
      actingTeamId,
      player: shooter,
      points: made,
      text: `${shortName(shooter.name)} drew a shooting foul and made ${made} of ${freeThrows}.`,
      statDeltas: deltas,
      clockUsed,
      homePoints: ctx.offense === 'home' ? made : 0,
      awayPoints: ctx.offense === 'away' ? made : 0,
      nextOffense,
      x: 50,
      y: 22,
    });
  }

  if (roll < makeChance) {
    addStats(ctx.stats, shooter, { points: shotValue });
    deltas.push(deltaFor(shooter, { points: shotValue }));
    const assisted = shotValue > 1 && ctx.rng() < clamp(assister.playmaking / 115, 0.22, 0.74);
    if (assisted) {
      addStats(ctx.stats, assister, { assists: 1 });
      deltas.push(deltaFor(assister, { assists: 1 }));
    }
    return withoutUndefined({
      eventType: 'score',
      actingTeamId,
      player: shooter,
      points: shotValue,
      text: `${shortName(shooter.name)} made ${shotValue === 3 ? '3PT jumper' : shotValue === 2 ? 'field goal' : 'free throw'}${assisted ? `. Assist: ${shortName(assister.name)}.` : '.'}`,
      statDeltas: deltas,
      clockUsed,
      homePoints: ctx.offense === 'home' ? shotValue : 0,
      awayPoints: ctx.offense === 'away' ? shotValue : 0,
      nextOffense,
      x: ctx.offense === 'home' ? 75 : 25,
      y: 38 + Math.floor(ctx.rng() * 24),
    });
  }

  const rebounder = weightedPick([...offenseTeam.rotation, ...defenseTeam.rotation], player => player.rebounding * (player.side === ctx.offense ? 0.32 : 0.68), ctx.rng);
  addStats(ctx.stats, rebounder, { rebounds: 1 });
  deltas.push(deltaFor(rebounder, { rebounds: 1 }));
  const offensiveBoard = rebounder.side === ctx.offense;
  return withoutUndefined({
    eventType: 'miss',
    actingTeamId,
    player: shooter,
    text: `${shortName(shooter.name)} missed ${shotValue === 3 ? '3PT jumper' : 'field goal'}. Rebound: ${shortName(rebounder.name)}.`,
    statDeltas: deltas,
    clockUsed,
    homePoints: 0,
    awayPoints: 0,
    nextOffense: offensiveBoard ? ctx.offense : nextOffense,
    x: ctx.offense === 'home' ? 76 : 24,
    y: 38 + Math.floor(ctx.rng() * 24),
  });
}

module.exports = {
  buildPossessionTimeline,
  totalsFromPossessionEvents,
};
```

The implementation must also include `buildTeamContext`, `normalizePlayer`, `buildStarterMatchups`, `buildBenchPreview`, `totalsFromPossessionEvents`, `addStats`, `deltaFor`, `weightedPick`, `hashString`, `createRng`, `periodLabel`, `elapsedMsForIndex`, `withoutUndefined`, `clamp`, `shortName`, and `displayTeam` in the same file.

- [ ] **Step 4: Run the possession timeline tests**

Run: `npm run test:functions -- tests/functions/possessionTimeline.test.ts`

Expected: pass all possession timeline tests.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add functions/franchise/possessionTimeline.js tests/functions/possessionTimeline.test.ts
git commit -m "feat: add possession timeline engine"
```

---

### Task 2: Matchup Simulation Integration

**Files:**
- Modify: `functions/franchise/matchups.js`
- Modify: `tests/functions/matchups.test.ts`

- [ ] **Step 1: Add failing matchup integration assertions**

Update the existing "stores live mode replay metadata for simulated games" test in `tests/functions/matchups.test.ts` so it expects:

```ts
expect(result.liveTimeline).toMatchObject({
  version: 2,
  gameId: game.id,
  homeTeamId: game.homeTeamId,
  awayTeamId: game.awayTeamId,
  homeScore: result.homeScore,
  awayScore: result.awayScore,
});
expect(result.liveTimeline.starterMatchups).toHaveLength(5);
expect(result.liveTimeline.events.some((event: { eventType: string }) => event.eventType === 'score')).toBe(true);
expect(result.liveTimeline.events.some((event: { text: string }) => event.text.includes('Assist:'))).toBe(true);
expect(result.liveTimeline.events.some((event: { text: string }) => event.text.includes('Rebound:'))).toBe(true);
expect(result.liveTimeline.events.every((event: { eventType: string }) => !['assist', 'rebound', 'steal'].includes(event.eventType))).toBe(true);
expect(result.boxScore.home.players.reduce((sum: number, player: { points: number }) => sum + player.points, 0)).toBe(result.homeScore);
expect(result.boxScore.away.players.reduce((sum: number, player: { points: number }) => sum + player.points, 0)).toBe(result.awayScore);
```

- [ ] **Step 2: Run matchup tests to verify they fail**

Run: `npm run test:functions -- tests/functions/matchups.test.ts`

Expected: fail because `simulateRosterGame` still returns timeline version 1.

- [ ] **Step 3: Wire possession timeline into simulated games**

In `functions/franchise/matchups.js`:

```js
const { buildPossessionTimeline, totalsFromPossessionEvents } = require('./possessionTimeline');
```

Change `simulateRosterGame` so it:

```js
const liveTimeline = buildPossessionTimeline({
  gameId: game.id,
  seed,
  homeTeamId: game.homeTeamId,
  awayTeamId: game.awayTeamId,
  homeTeam: simulatedHomeTeam,
  awayTeam: simulatedAwayTeam,
  homeCoachingPresetIds: homePresetIds,
  awayCoachingPresetIds: awayPresetIds,
  nowMs,
});
const timelineTotals = totalsFromPossessionEvents(liveTimeline);
let homeScore = timelineTotals.homeScore;
let awayScore = timelineTotals.awayScore;
```

Then build `quarters`, `boxScore`, `winnerTeamId`, and `liveMode` from `liveTimeline` and `timelineTotals`. If `winnerTeamId` is passed, bias the possession simulator through the seed/input rather than editing the score after the fact.

- [ ] **Step 4: Keep old timeline builder for legacy/manual paths**

Leave `buildLiveTimeline` in place for version 1 and any legacy completed games. New `simulateScheduledGame` output should use `version: 2`.

- [ ] **Step 5: Run matchup tests**

Run: `npm run test:functions -- tests/functions/matchups.test.ts`

Expected: pass.

- [ ] **Step 6: Commit Task 2**

Run:

```bash
git add functions/franchise/matchups.js tests/functions/matchups.test.ts
git commit -m "feat: simulate matchups from possessions"
```

---

### Task 3: App Timeline Types And Helpers

**Files:**
- Modify: `domain/nba/liveTimeline.ts`
- Modify: `tests/domain/liveTimeline.test.ts`

- [ ] **Step 1: Add failing domain tests for version 2 helper support**

Add to `tests/domain/liveTimeline.test.ts`:

```ts
it('reads starter matchup rows from version 2 timelines', () => {
  const timeline = {
    version: 2,
    gameId: 'game-1',
    homeTeamId: 'CHI',
    awayTeamId: 'PHI',
    homeScore: 100,
    awayScore: 98,
    revealDurationMs: 960000,
    periods: [],
    starterMatchups: [
      { position: 'PG', awayPlayer: { playerId: 'a1', name: 'Away PG', teamId: 'PHI' }, homePlayer: { playerId: 'h1', name: 'Home PG', teamId: 'CHI' } },
      { position: 'SG', awayPlayer: { playerId: 'a2', name: 'Away SG', teamId: 'PHI' }, homePlayer: { playerId: 'h2', name: 'Home SG', teamId: 'CHI' } },
      { position: 'SF', awayPlayer: { playerId: 'a3', name: 'Away SF', teamId: 'PHI' }, homePlayer: { playerId: 'h3', name: 'Home SF', teamId: 'CHI' } },
      { position: 'PF', awayPlayer: { playerId: 'a4', name: 'Away PF', teamId: 'PHI' }, homePlayer: { playerId: 'h4', name: 'Home PF', teamId: 'CHI' } },
      { position: 'C', awayPlayer: { playerId: 'a5', name: 'Away C', teamId: 'PHI' }, homePlayer: { playerId: 'h5', name: 'Home C', teamId: 'CHI' } },
    ],
    events: [],
  } as any;

  expect(starterMatchupsForTimeline(timeline)).toHaveLength(5);
});
```

- [ ] **Step 2: Run domain test to verify it fails**

Run: `npm run test:domain -- tests/domain/liveTimeline.test.ts`

Expected: fail because `starterMatchupsForTimeline` does not exist.

- [ ] **Step 3: Add version 2 types and helper**

In `domain/nba/liveTimeline.ts`, update timeline types to allow `version: 1 | 2`, add starter matchup types, add `eventType: 'free_throw_trip'`, and export:

```ts
export function starterMatchupsForTimeline(timeline: LiveTimeline | null | undefined) {
  return Array.isArray((timeline as any)?.starterMatchups) ? (timeline as any).starterMatchups : [];
}
```

- [ ] **Step 4: Run domain tests**

Run: `npm run test:domain -- tests/domain/liveTimeline.test.ts`

Expected: pass.

- [ ] **Step 5: Commit Task 3**

Run:

```bash
git add domain/nba/liveTimeline.ts tests/domain/liveTimeline.test.ts
git commit -m "feat: support possession timeline metadata"
```

---

### Task 4: Head-To-Head Live Feed

**Files:**
- Modify: `app/screens/season/live-mode.tsx`
- Modify: `tests/domain/sourceSafety.test.ts`

- [ ] **Step 1: Add source safety expectations**

Add a test in `tests/domain/sourceSafety.test.ts`:

```ts
it('renders Live Mode player stats as head-to-head matchups', () => {
  const liveMode = source('app/screens/season/live-mode.tsx');
  expect(liveMode).toContain('starterMatchupsForTimeline');
  expect(liveMode).toContain('See More Player Stats');
  expect(liveMode).toContain('Matchups');
});
```

- [ ] **Step 2: Run source safety test to verify it fails**

Run: `npm run test:domain -- tests/domain/sourceSafety.test.ts`

Expected: fail until the screen imports and renders the new helper.

- [ ] **Step 3: Update Live Mode screen imports and state**

In `app/screens/season/live-mode.tsx`, import:

```ts
import { currentTimelineEvent, livePlayerStatsAt, starterMatchupsForTimeline, type LiveTimeline, type LiveTimelineEvent } from '@/domain/nba/liveTimeline';
```

Add local state:

```ts
const [showFullPlayerStats, setShowFullPlayerStats] = useState(false);
```

Add memoized matchup rows:

```ts
const starterMatchups = useMemo(() => starterMatchupsForTimeline(liveTimeline), [liveTimeline]);
```

- [ ] **Step 4: Replace the old player stats list with matchup rows**

Render a section titled `Matchups` before play-by-play:

```tsx
<View style={styles.panel}>
  <View style={styles.panelHeaderRow}>
    <Text style={styles.panelTitle}>Matchups</Text>
    <TouchableOpacity onPress={() => setShowFullPlayerStats(value => !value)} style={styles.smallOutlineButton}>
      <Text style={styles.smallOutlineButtonText}>{showFullPlayerStats ? 'Hide' : 'See More Player Stats'}</Text>
    </TouchableOpacity>
  </View>
  {starterMatchups.map(row => (
    <View key={row.position} style={styles.matchupRow}>
      <View style={styles.matchupPlayer}>
        <Text numberOfLines={1} style={styles.matchupName}>{row.awayPlayer.name}</Text>
        <Text style={styles.matchupStats}>{statsTextForPlayer(row.awayPlayer.playerId, livePlayerStats)}</Text>
      </View>
      <Text style={styles.matchupPosition}>{row.position}</Text>
      <View style={[styles.matchupPlayer, styles.matchupPlayerRight]}>
        <Text numberOfLines={1} style={styles.matchupName}>{row.homePlayer.name}</Text>
        <Text style={styles.matchupStats}>{statsTextForPlayer(row.homePlayer.playerId, livePlayerStats)}</Text>
      </View>
    </View>
  ))}
</View>
```

When `showFullPlayerStats` is true, render the existing team-grouped player stat rows below the starter matchups.

- [ ] **Step 5: Add compact styles**

Add styles for `panelHeaderRow`, `smallOutlineButton`, `smallOutlineButtonText`, `matchupRow`, `matchupPlayer`, `matchupPlayerRight`, `matchupName`, `matchupStats`, and `matchupPosition`. Keep row heights stable so names and stats do not resize the layout.

- [ ] **Step 6: Run source safety tests**

Run: `npm run test:domain -- tests/domain/sourceSafety.test.ts`

Expected: pass.

- [ ] **Step 7: Commit Task 4**

Run:

```bash
git add app/screens/season/live-mode.tsx tests/domain/sourceSafety.test.ts
git commit -m "feat: add starter matchup live feed"
```

---

### Task 5: Full Verification And Shipping

**Files:**
- Verify changed files only; no new source files expected.

- [ ] **Step 1: Run function tests**

Run: `npm run test:functions`

Expected: pass.

- [ ] **Step 2: Run domain tests**

Run: `npm run test:domain`

Expected: pass.

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`

Expected: pass.

- [ ] **Step 4: Run whitespace check**

Run: `git diff --check`

Expected: no output.

- [ ] **Step 5: Deploy Firebase functions**

Run:

```bash
npx firebase-tools deploy --only functions --project association-social
```

Expected: deploy completes with `simulateScheduledGame` updated.

- [ ] **Step 6: Publish Expo update**

Run:

```bash
eas update --branch main --auto
```

Expected: update publishes and returns an update id.

- [ ] **Step 7: Push commits**

Run:

```bash
git push
```

Expected: branch pushes successfully.
