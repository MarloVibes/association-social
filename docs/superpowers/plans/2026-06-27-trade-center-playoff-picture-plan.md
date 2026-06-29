# Trade Center Playoff Picture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a clear Trade Center hub from league home and make playoff/play-in positioning live from standings until the commissioner starts the playable postseason schedule.

**Architecture:** Add a small domain helper for playoff picture projections and season-complete readiness, then wire the existing league and playoff screens to that helper. Keep actual playoff game creation in the existing `domain/nba/playoffs.ts` bracket builder so the live picture never writes schedule games.

**Tech Stack:** Expo Router, React Native, Firebase Firestore, TypeScript domain helpers, Vitest.

---

## File Structure

- Create: `domain/nba/playoffPicture.ts`
  - Owns pure standings-derived playoff picture logic.
  - Exports `regularSeasonCompletion`, `buildPlayoffPicture`, and related types.
- Create: `tests/domain/playoffPicture.test.ts`
  - Tests live projection, season completeness, and play-in grouping.
- Modify: `app/screens/season/playoffs.tsx`
  - Shows live playoff picture when no playable bracket exists.
  - Shows final seeds and enables postseason start only after all regular-season games are final.
- Modify: `app/screens/league.tsx`
  - Consolidates trade entry points into a Trade Center section.
  - Adds `Playoff Picture` label in Season Hub while preserving existing Playoffs route.
- Modify: `docs/superpowers/specs/2026-06-27-trade-center-playoff-picture-design.md`
  - Only update if implementation reveals a necessary wording correction.

---

### Task 1: Add Pure Playoff Picture Domain Helper

**Files:**
- Create: `domain/nba/playoffPicture.ts`
- Test: `tests/domain/playoffPicture.test.ts`

- [ ] **Step 1: Write the failing domain tests**

Create `tests/domain/playoffPicture.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildPlayoffPicture, regularSeasonCompletion } from '@/domain/nba/playoffPicture';
import type { NbaScheduleGame } from '@/domain/nba/schedule';
import type { StandingsRow } from '@/domain/nba/standings';

function row(seed: number): StandingsRow {
  return {
    teamId: `T${seed}`,
    abbreviation: `T${seed}`,
    name: `Team ${seed}`,
    gmId: `gm-${seed}`,
    wins: 30 - seed,
    losses: seed,
    pointsFor: 1000,
    pointsAgainst: 900 + seed,
    pointDiff: 100 - seed,
    pct: (30 - seed) / 30,
  };
}

function game(status: NbaScheduleGame['status'], id: string): NbaScheduleGame {
  return {
    id,
    week: 1,
    sequence: Number(id.replace(/\D/g, '')) || 1,
    homeTeamId: 'T1',
    awayTeamId: 'T2',
    status,
    homeScore: status === 'final' ? 100 : undefined,
    awayScore: status === 'final' ? 90 : undefined,
  };
}

describe('NBA playoff picture', () => {
  it('tracks regular-season completion without creating playoff games', () => {
    expect(regularSeasonCompletion([game('final', 'g1'), game('scheduled', 'g2')])).toEqual({
      totalGames: 2,
      finalGames: 1,
      remainingGames: 1,
      complete: false,
    });
    expect(regularSeasonCompletion([game('final', 'g1'), game('final', 'g2')])).toMatchObject({
      remainingGames: 0,
      complete: true,
    });
  });

  it('projects a short eight-team playoff field and bubble from standings', () => {
    const picture = buildPlayoffPicture({
      standings: Array.from({ length: 12 }, (_, index) => row(index + 1)),
      format: 'short_8',
      completion: { totalGames: 82, finalGames: 40, remainingGames: 42, complete: false },
    });

    expect(picture.label).toBe('Projected Playoffs');
    expect(picture.playoffSeeds.map(seed => seed.seed)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(picture.playInSeeds).toEqual([]);
    expect(picture.bubble.map(seed => seed.seed)).toEqual([9, 10, 11, 12]);
    expect(picture.bracketLocked).toBe(false);
  });

  it('projects play-in teams separately and labels final seeds after completion', () => {
    const picture = buildPlayoffPicture({
      standings: Array.from({ length: 22 }, (_, index) => row(index + 1)),
      format: 'play_in_16',
      completion: { totalGames: 1230, finalGames: 1230, remainingGames: 0, complete: true },
    });

    expect(picture.label).toBe('Final Seeds');
    expect(picture.playoffSeeds.map(seed => seed.seed)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(picture.playInSeeds.map(seed => seed.seed)).toEqual([13, 14, 15, 16, 17, 18, 19, 20]);
    expect(picture.bubble.map(seed => seed.seed)).toEqual([21, 22]);
    expect(picture.readyToStartPostseason).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run:

```bash
npx vitest run tests/domain/playoffPicture.test.ts
```

Expected: fail because `@/domain/nba/playoffPicture` does not exist.

- [ ] **Step 3: Implement `domain/nba/playoffPicture.ts`**

Create `domain/nba/playoffPicture.ts`:

```ts
import type { NbaScheduleGame } from './schedule';
import type { PlayoffFormat } from './playoffs';
import type { StandingsRow } from './standings';

export type SeasonCompletion = {
  totalGames: number;
  finalGames: number;
  remainingGames: number;
  complete: boolean;
};

export type PlayoffPictureSeed = StandingsRow & {
  seed: number;
  zone: 'playoff' | 'play_in' | 'bubble';
};

export type PlayoffPicture = {
  format: PlayoffFormat;
  label: 'Projected Playoffs' | 'Final Seeds';
  completion: SeasonCompletion;
  playoffSeeds: PlayoffPictureSeed[];
  playInSeeds: PlayoffPictureSeed[];
  bubble: PlayoffPictureSeed[];
  readyToStartPostseason: boolean;
  bracketLocked: boolean;
};

const FORMAT_LIMITS: Record<PlayoffFormat, { playoff: number; playInStart: number; playInEnd: number; bubbleCount: number }> = {
  short_8: { playoff: 8, playInStart: 0, playInEnd: 0, bubbleCount: 4 },
  traditional_16: { playoff: 16, playInStart: 0, playInEnd: 0, bubbleCount: 4 },
  play_in_16: { playoff: 12, playInStart: 13, playInEnd: 20, bubbleCount: 4 },
};

export function regularSeasonCompletion(games: NbaScheduleGame[]): SeasonCompletion {
  const regularGames = games.filter(game => game.stage !== 'playoffs');
  const totalGames = regularGames.length;
  const finalGames = regularGames.filter(game => game.status === 'final').length;
  const remainingGames = Math.max(0, totalGames - finalGames);
  return {
    totalGames,
    finalGames,
    remainingGames,
    complete: totalGames > 0 && remainingGames === 0,
  };
}

function seededRows(standings: StandingsRow[]): PlayoffPictureSeed[] {
  return standings.map((row, index) => ({
    ...row,
    seed: index + 1,
    zone: 'bubble',
  }));
}

export function buildPlayoffPicture({
  standings,
  format,
  completion,
  bracketExists = false,
}: {
  standings: StandingsRow[];
  format: PlayoffFormat;
  completion: SeasonCompletion;
  bracketExists?: boolean;
}): PlayoffPicture {
  const limits = FORMAT_LIMITS[format];
  const seeds = seededRows(standings);
  const playoffSeeds = seeds.slice(0, limits.playoff).map(seed => ({ ...seed, zone: 'playoff' as const }));
  const playInSeeds = limits.playInStart > 0
    ? seeds.slice(limits.playInStart - 1, limits.playInEnd).map(seed => ({ ...seed, zone: 'play_in' as const }))
    : [];
  const consumed = limits.playInEnd || limits.playoff;
  const bubble = seeds.slice(consumed, consumed + limits.bubbleCount).map(seed => ({ ...seed, zone: 'bubble' as const }));

  return {
    format,
    label: completion.complete ? 'Final Seeds' : 'Projected Playoffs',
    completion,
    playoffSeeds,
    playInSeeds,
    bubble,
    readyToStartPostseason: completion.complete && !bracketExists,
    bracketLocked: bracketExists,
  };
}
```

- [ ] **Step 4: Run focused domain tests**

Run:

```bash
npx vitest run tests/domain/playoffPicture.test.ts tests/domain/playoffs.test.ts
```

Expected: both files pass.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add domain/nba/playoffPicture.ts tests/domain/playoffPicture.test.ts
git commit -m "feat: add nba playoff picture projection"
```

---

### Task 2: Show Live Playoff Picture on the Playoffs Screen

**Files:**
- Modify: `app/screens/season/playoffs.tsx`
- Test: `tests/domain/playoffPicture.test.ts`

- [ ] **Step 1: Add a failing readiness test**

Append to `tests/domain/playoffPicture.test.ts`:

```ts
it('does not allow postseason start when a bracket already exists', () => {
  const picture = buildPlayoffPicture({
    standings: Array.from({ length: 20 }, (_, index) => row(index + 1)),
    format: 'traditional_16',
    completion: { totalGames: 1230, finalGames: 1230, remainingGames: 0, complete: true },
    bracketExists: true,
  });

  expect(picture.readyToStartPostseason).toBe(false);
  expect(picture.bracketLocked).toBe(true);
});
```

- [ ] **Step 2: Run the test**

Run:

```bash
npx vitest run tests/domain/playoffPicture.test.ts
```

Expected: pass if Task 1 already supports `bracketExists`. If it fails, add the `bracketExists` handling shown in Task 1.

- [ ] **Step 3: Update imports in `app/screens/season/playoffs.tsx`**

Add:

```ts
import { buildPlayoffPicture, regularSeasonCompletion } from '@/domain/nba/playoffPicture';
```

- [ ] **Step 4: Add derived picture state in `PlayoffsScreen`**

After `standings` and `bracket` are defined, add:

```ts
const completion = useMemo(() => regularSeasonCompletion(schedule?.games || []), [schedule?.games]);
const picture = useMemo(() => buildPlayoffPicture({
  standings,
  format,
  completion,
  bracketExists: Boolean(bracket),
}), [standings, format, completion, bracket]);
```

- [ ] **Step 5: Prevent early postseason start in `startPlayoffs`**

At the top of `startPlayoffs`, after the null guard, add:

```ts
if (!picture.readyToStartPostseason) {
  Alert.alert(
    'Season not complete',
    picture.bracketLocked
      ? 'The playoff bracket already exists.'
      : `${picture.completion.remainingGames} regular season game${picture.completion.remainingGames === 1 ? '' : 's'} still need to be finalized.`,
  );
  return;
}
```

- [ ] **Step 6: Replace the no-bracket summary UI**

In the `ListHeaderComponent`, keep existing bracket summary when `bracket` exists. When no bracket exists, render:

```tsx
<View style={styles.summary}>
  <Text style={styles.summaryText}>{picture.label}</Text>
  <Text style={styles.summaryMeta}>
    {picture.completion.finalGames}/{picture.completion.totalGames} games final · {picture.completion.remainingGames} remaining
  </Text>
</View>
```

- [ ] **Step 7: Add playoff picture cards before the start controls**

Still in `ListHeaderComponent`, after the summary and before `startCard`, render:

```tsx
{!bracket ? (
  <View style={styles.pictureCard}>
    <Text style={styles.pictureTitle}>Playoff Field</Text>
    {picture.playoffSeeds.map(seed => (
      <View key={seed.teamId} style={styles.pictureRow}>
        <Text style={styles.pictureSeed}>{seed.seed}</Text>
        <Text style={styles.pictureTeam}>{seed.name}</Text>
        <Text style={styles.pictureRecord}>{seed.wins}-{seed.losses}</Text>
      </View>
    ))}
    {picture.playInSeeds.length > 0 ? (
      <>
        <Text style={styles.pictureTitle}>Play-In</Text>
        {picture.playInSeeds.map(seed => (
          <View key={seed.teamId} style={styles.pictureRow}>
            <Text style={styles.pictureSeed}>{seed.seed}</Text>
            <Text style={styles.pictureTeam}>{seed.name}</Text>
            <Text style={styles.pictureRecord}>{seed.wins}-{seed.losses}</Text>
          </View>
        ))}
      </>
    ) : null}
    {picture.bubble.length > 0 ? (
      <>
        <Text style={styles.pictureTitle}>Outside Looking In</Text>
        {picture.bubble.map(seed => (
          <View key={seed.teamId} style={styles.pictureRowMuted}>
            <Text style={styles.pictureSeed}>{seed.seed}</Text>
            <Text style={styles.pictureTeam}>{seed.name}</Text>
            <Text style={styles.pictureRecord}>{seed.wins}-{seed.losses}</Text>
          </View>
        ))}
      </>
    ) : null}
  </View>
) : null}
```

- [ ] **Step 8: Disable start button until ready**

Change the start button to:

```tsx
<TouchableOpacity
  disabled={starting || !picture.readyToStartPostseason}
  style={[styles.startButton, (starting || !picture.readyToStartPostseason) && styles.disabled]}
  onPress={startPlayoffs}
>
  {starting ? <ActivityIndicator color="#06130c" /> : <Text style={styles.startText}>{picture.readyToStartPostseason ? 'Start Playoffs' : 'Finish Regular Season'}</Text>}
</TouchableOpacity>
```

- [ ] **Step 9: Add styles**

Add to the StyleSheet:

```ts
pictureCard: { backgroundColor: '#101010', borderRadius: 8, borderWidth: 1, borderColor: '#202020', padding: 12, marginBottom: 14 },
pictureTitle: { color: '#00e58b', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', marginTop: 8, marginBottom: 8 },
pictureRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: '#1d1d1d' },
pictureRowMuted: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: 0.65, borderBottomWidth: 1, borderBottomColor: '#1d1d1d' },
pictureSeed: { width: 24, color: '#888', fontSize: 12, fontWeight: '900', textAlign: 'center' },
pictureTeam: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '800' },
pictureRecord: { color: '#777', fontSize: 12, fontWeight: '800' },
```

- [ ] **Step 10: Run checks**

Run:

```bash
npx tsc --noEmit
npx vitest run tests/domain/playoffPicture.test.ts tests/domain/playoffs.test.ts
```

Expected: type check and tests pass.

- [ ] **Step 11: Commit Task 2**

Run:

```bash
git add app/screens/season/playoffs.tsx tests/domain/playoffPicture.test.ts domain/nba/playoffPicture.ts
git commit -m "feat: show live playoff picture"
```

---

### Task 3: Consolidate League Home Trade Center Actions

**Files:**
- Modify: `app/screens/league.tsx`

- [ ] **Step 1: Identify existing trade entry points**

Confirm these existing behaviors in `app/screens/league.tsx`:

```tsx
router.push({ pathname: '/screens/trade-channel', params: { leagueId, channelId: 'trade-center' } })
setTradePickerOpen(true)
router.push({ pathname: '/screens/cpu-trade-requests', params: { leagueId } })
```

- [ ] **Step 2: Replace the standalone Trade button with a Trade Center section**

Remove the standalone Trade button below `League Rosters`.

Insert this section after the `Season Hub` block and before `Recent Activity`:

```tsx
<View style={[styles.tradeCenterHub, { borderColor: teamTheme.borderColor, backgroundColor: tintColor + '16' }]}>
  <View style={styles.tradeCenterHeader}>
    <View style={{ flex: 1 }}>
      <Text style={[styles.tradeCenterTitle, { color: titleColor }]}>Trade Center</Text>
      <Text style={styles.tradeCenterSub}>Propose deals, browse the trade block, and manage CPU requests</Text>
    </View>
    <Text style={[styles.tradeCenterBadge, { color: titleColor }]}>GM</Text>
  </View>
  <View style={styles.tradeCenterGrid}>
    <TouchableOpacity
      style={[styles.tradeCenterButton, { borderColor: teamTheme.borderColor + '88' }]}
      onPress={() => {
        if (!myTeam) { Alert.alert('No team yet', 'Claim a team in this league before proposing a trade.'); return; }
        setTradePickerOpen(true);
      }}
    >
      <Text style={styles.tradeCenterButtonIcon}>🔁</Text>
      <Text style={[styles.tradeCenterButtonText, { color: titleColor }]}>Trade</Text>
    </TouchableOpacity>
    <TouchableOpacity
      style={[styles.tradeCenterButton, { borderColor: teamTheme.borderColor + '88' }]}
      onPress={() => router.push({ pathname: '/screens/trade-channel', params: { leagueId, channelId: 'trade-center' } })}
    >
      <Text style={styles.tradeCenterButtonIcon}>📣</Text>
      <Text style={[styles.tradeCenterButtonText, { color: titleColor }]}>Trade Block</Text>
    </TouchableOpacity>
    {isCommissioner ? (
      <TouchableOpacity
        style={[styles.tradeCenterButton, { borderColor: teamTheme.borderColor + '88' }]}
        onPress={() => router.push({ pathname: '/screens/cpu-trade-requests', params: { leagueId } })}
      >
        <Text style={styles.tradeCenterButtonIcon}>🤖</Text>
        <Text style={[styles.tradeCenterButtonText, { color: titleColor }]}>CPU Requests</Text>
      </TouchableOpacity>
    ) : null}
  </View>
</View>
```

- [ ] **Step 3: Add Trade Center styles**

Add to the StyleSheet:

```ts
tradeCenterHub: { borderRadius: 14, padding: 12, borderWidth: 1, marginBottom: 18 },
tradeCenterHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
tradeCenterTitle: { fontSize: 16, fontWeight: '900' },
tradeCenterSub: { color: '#777', fontSize: 11, marginTop: 2 },
tradeCenterBadge: { fontSize: 11, fontWeight: '900' },
tradeCenterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
tradeCenterButton: { width: '48%', minHeight: 62, borderRadius: 10, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 6, backgroundColor: '#11111188', alignItems: 'center', justifyContent: 'center' },
tradeCenterButtonIcon: { fontSize: 18, marginBottom: 4 },
tradeCenterButtonText: { fontSize: 12, fontWeight: '800', textAlign: 'center' },
```

- [ ] **Step 4: Update Season Hub Playoffs label**

In the existing Season Hub button that routes to `/screens/season/playoffs`, change the visible label from:

```tsx
<Text style={[styles.seasonHubButtonText, { color: titleColor }]}>Playoffs</Text>
```

to:

```tsx
<Text style={[styles.seasonHubButtonText, { color: titleColor }]}>Playoff Picture</Text>
```

- [ ] **Step 5: Run type check**

Run:

```bash
npx tsc --noEmit
```

Expected: pass.

- [ ] **Step 6: Commit Task 3**

Run:

```bash
git add app/screens/league.tsx
git commit -m "feat: add league trade center hub"
```

---

### Task 4: Final Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run full test suite**

Run:

```bash
npm test -- --testTimeout=60000
```

Expected: all tests pass.

- [ ] **Step 2: Run type check**

Run:

```bash
npx tsc --noEmit
```

Expected: no output and exit code `0`.

- [ ] **Step 3: Run diff check**

Run:

```bash
git diff --check
```

Expected: no output and exit code `0`.

- [ ] **Step 4: Review status**

Run:

```bash
git status --short
```

Expected: only `.superpowers/` remains untracked, or a clean tree if that scratch folder is ignored locally.
