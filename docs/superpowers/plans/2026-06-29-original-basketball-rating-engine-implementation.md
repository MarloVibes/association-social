# Original Basketball Rating Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an original NBA Franchise rating engine that generates hidden numeric attributes first, then produces consistent visible grades, tendencies, development labels, impact values, and league-specific player profiles.

**Architecture:** Keep the model in focused `domain/nba` modules so the phone app can display outputs while the full formula can later move behind Firebase Functions. Global era snapshots are immutable starting points; league player ratings are copied from those snapshots and then evolve from GM decisions, progression, upgrades, coaching, injuries, contracts, and performance.

**Tech Stack:** TypeScript domain modules, Jest-style domain tests through the existing npm test scripts, Firebase-ready profile payloads, Expo/React Native UI consumers.

---

## File Structure

- Modify `domain/nba/gradeScale.ts`: single approved grade ladder and rank helper.
- Modify `domain/nba/attributeModel.ts`: expanded hidden numeric attribute model, public stat inputs, category coverage, and compatibility helpers.
- Create `domain/nba/skillGrades.ts`: weighted category ratings and visible grades generated from hidden numeric attributes.
- Create `domain/nba/tendencies.ts`: paint, shooting, passing, rebounding, defensive, foul, and pace tendencies from stats/scouting tags.
- Create `domain/nba/development.ts`: potential calculation, development phase labels, and peak/decline logic.
- Create `domain/nba/ratingProfiles.ts`: global immutable snapshots and league-specific copied profiles.
- Modify `domain/nba/ratingProfile.ts`: keep current imports working while delegating to the new profile builder.
- Modify `domain/nba/ratingImport.ts`: prepare global snapshot import payloads with neutral collection names.
- Create `domain/nba/ratingSeeds.ts`: proof baselines for 2011 LeBron, 2011 Derrick Rose, and 2026 LeBron.
- Modify `scripts/import-player-ratings.mjs`: output neutral import scaffolding without proprietary labels.
- Add tests in `tests/domain`: grade scale, skill grades, tendencies, development, rating profile snapshots, importer safety.

---

### Task 1: Lock the Grade Scale

**Files:**
- Modify: `domain/nba/gradeScale.ts`
- Modify: `domain/nba/attributeModel.ts`
- Create: `tests/domain/gradeScale.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { GRADE_ORDER, gradeFromNumeric, gradeRank } from '../../domain/nba/gradeScale';

describe('gradeScale', () => {
  it('uses the approved public grade ladder only', () => {
    expect(GRADE_ORDER).toEqual(['F', 'D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+', 'S']);
  });

  it.each([
    [100, 'S'],
    [99, 'S'],
    [98, 'A+'],
    [95, 'A+'],
    [94, 'A'],
    [92, 'A'],
    [91, 'A-'],
    [89, 'A-'],
    [88, 'B+'],
    [85, 'B+'],
    [84, 'B'],
    [80, 'B'],
    [79, 'B-'],
    [75, 'B-'],
    [74, 'C+'],
    [70, 'C+'],
    [69, 'C'],
    [65, 'C'],
    [64, 'C-'],
    [60, 'C-'],
    [59, 'D+'],
    [57, 'D+'],
    [56, 'D'],
    [53, 'D'],
    [52, 'D-'],
    [50, 'D-'],
    [49, 'F'],
  ] as const)('maps %s to %s', (rating, grade) => {
    expect(gradeFromNumeric(rating)).toBe(grade);
  });

  it('orders higher grades above lower grades', () => {
    expect(gradeRank('S')).toBeGreaterThan(gradeRank('A+'));
    expect(gradeRank('B')).toBeGreaterThan(gradeRank('B-'));
    expect(gradeRank('D')).toBeGreaterThan(gradeRank('F'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/domain/gradeScale.test.ts`

Expected: FAIL until the shared grade order exactly matches the approved public ladder.

- [ ] **Step 3: Implement the approved grade order**

Set `GRADE_ORDER` in `domain/nba/gradeScale.ts` and the local rank list in `domain/nba/attributeModel.ts` to:

```ts
['F', 'D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+', 'S']
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/domain/gradeScale.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add domain/nba/gradeScale.ts domain/nba/attributeModel.ts tests/domain/gradeScale.test.ts
git commit -m "feat: lock basketball grade scale"
```

---

### Task 2: Expand Hidden Attributes

**Files:**
- Modify: `domain/nba/attributeModel.ts`
- Create: `tests/domain/attributeModelExpanded.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { ATTRIBUTE_KEYS, ATTRIBUTE_UPGRADE_CATEGORIES, buildAttributeModel } from '../../domain/nba/attributeModel';

const leagueContext = { season: 2011, pace: 92, leagueThreePointPct: 0.358, leagueFreeThrowPct: 0.763 };

describe('expanded attribute model', () => {
  it('includes flexible hidden attributes for every upgradeable skill', () => {
    expect(ATTRIBUTE_KEYS).toEqual(expect.arrayContaining([
      'drivingLayup',
      'drivingDunk',
      'standingDunk',
      'drawFoul',
      'hands',
      'shotConsistency',
      'passIq',
      'passVision',
      'speedWithBall',
      'lateralQuickness',
      'vertical',
      'agility',
      'hustle',
      'offensiveRebound',
      'defensiveRebound',
      'durability',
    ]));
  });

  it('assigns every hidden attribute to at least one upgrade category', () => {
    const covered = new Set(Object.values(ATTRIBUTE_UPGRADE_CATEGORIES).flat());
    for (const key of ATTRIBUTE_KEYS) {
      expect(covered.has(key)).toBe(true);
    }
  });

  it('keeps 2011 Derrick Rose elite in rim pressure and development without inflating three point shooting', () => {
    const rose = buildAttributeModel({
      source: {
        player_id: 'rose-2011',
        full_name: 'Derrick Rose',
        team: 'CHI',
        position: 'PG',
        age: 22,
        games: 81,
        minutesPerGame: 37.4,
        pointsPerGame: 25,
        reboundsPerGame: 4.1,
        assistsPerGame: 7.7,
        stealsPerGame: 1,
        blocksPerGame: 0.6,
        fieldGoalPct: 0.445,
        threePointPct: 0.332,
        threePointAttemptsPerGame: 4.8,
        freeThrowPct: 0.858,
        freeThrowAttemptsPerGame: 6.9,
        usagePct: 32.2,
        assistPct: 38.7,
        turnoverPct: 13.1,
        winShares: 13.1,
        defensiveWinShares: 4.8,
        draftPick: 1,
        rimAttemptRate: 0.38,
        driveRate: 0.42,
        scoutingTags: ['mvp', 'elite_rim_pressure', 'elite_burst', 'high_usage_creator'],
      },
      leagueContext,
    });

    expect(rose.drivingLayup).toBeGreaterThanOrEqual(92);
    expect(rose.speedWithBall).toBeGreaterThanOrEqual(95);
    expect(rose.potential).toBeGreaterThanOrEqual(95);
    expect(rose.threePoint).toBeLessThan(85);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/domain/attributeModelExpanded.test.ts`

Expected: FAIL because expanded fields do not exist yet.

- [ ] **Step 3: Implement expanded model**

Expand `PublicStatLine`, `AttributeModel`, `ATTRIBUTE_KEYS`, and `ATTRIBUTE_UPGRADE_CATEGORIES`. Preserve old consumers by keeping broad helpers like `dunking` and `rebounding` only if tests or app files still depend on them; otherwise migrate consumers to the richer names.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- tests/domain/attributeModelExpanded.test.ts tests/domain/ratingProfile.test.ts tests/domain/playerTiers.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add domain/nba/attributeModel.ts tests/domain/attributeModelExpanded.test.ts
git commit -m "feat: expand basketball attribute model"
```

---

### Task 3: Weighted Skill Grades

**Files:**
- Create: `domain/nba/skillGrades.ts`
- Modify: `domain/nba/attributeModel.ts`
- Create: `tests/domain/skillGrades.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { buildSkillGrades } from '../../domain/nba/skillGrades';

describe('weighted skill grades', () => {
  it('does not let one inflated shooting attribute create an elite category grade', () => {
    const grades = buildSkillGrades({
      threePoint: 92,
      shotIq: 76,
      shotConsistency: 72,
      offenseIq: 78,
      midRange: 76,
      freeThrow: 82,
    });

    expect(grades.threePoint.rating).toBeLessThan(85);
    expect(grades.threePoint.grade).toBe('B');
  });

  it('allows a real specialist to grade high in a single skill without becoming a superstar overall', () => {
    const grades = buildSkillGrades({
      threePoint: 91,
      shotIq: 88,
      shotConsistency: 87,
      offenseIq: 82,
      midRange: 74,
      freeThrow: 82,
    });

    expect(grades.threePoint.grade).toMatch(/A-|B\+/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/domain/skillGrades.test.ts`

Expected: FAIL because `buildSkillGrades` does not exist.

- [ ] **Step 3: Implement weighted skill grades**

Create a reusable `weightedRating` helper and category definitions. Three-point grade uses `threePoint` as the strongest weight, but includes shot IQ, consistency, offense IQ, and volume context where available.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/domain/skillGrades.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add domain/nba/skillGrades.ts domain/nba/attributeModel.ts tests/domain/skillGrades.test.ts
git commit -m "feat: add weighted basketball skill grades"
```

---

### Task 4: Tendencies and Possession Inputs

**Files:**
- Create: `domain/nba/tendencies.ts`
- Create: `tests/domain/tendencies.test.ts`

- [ ] **Step 1: Write tests for Rose and a spot-up shooter**

Tests should prove Derrick Rose receives high paint attack, drive, rim finish, and transition tendencies while a low-usage shooter receives high catch-and-shoot and lower paint attack.

- [ ] **Step 2: Implement tendency builder**

Use public stat inputs and scouting tags. Do not use proprietary tendency names or imported commercial formulas.

- [ ] **Step 3: Run tests**

Run: `npm test -- tests/domain/tendencies.test.ts`

- [ ] **Step 4: Commit**

```bash
git add domain/nba/tendencies.ts tests/domain/tendencies.test.ts
git commit -m "feat: derive basketball player tendencies"
```

---

### Task 5: Potential and Development Phase

**Files:**
- Create: `domain/nba/development.ts`
- Create: `tests/domain/development.test.ts`

- [ ] **Step 1: Write tests**

Tests must prove:
- 2011 LeBron and 2011 Rose can both receive A+ potential.
- 2026 LeBron can keep strong current grades but land around B- potential because he is a legacy-stage player.
- Generational players decline slower than normal veterans.

- [ ] **Step 2: Implement development curve**

Use age, current impact, award weight, hidden development, injury history, opportunity, and scouting tags. Labels should include `High Upside`, `Rising Star`, `Prime Star`, `Near Peak`, `Stable Veteran`, `Legacy Star`, `Declining`, and `Sharp Decline Risk`.

- [ ] **Step 3: Run tests**

Run: `npm test -- tests/domain/development.test.ts`

- [ ] **Step 4: Commit**

```bash
git add domain/nba/development.ts tests/domain/development.test.ts
git commit -m "feat: add basketball development phases"
```

---

### Task 6: Global Snapshots and League Copies

**Files:**
- Create: `domain/nba/ratingProfiles.ts`
- Modify: `domain/nba/ratingProfile.ts`
- Modify: `domain/nba/ratingImport.ts`
- Create: `tests/domain/ratingProfiles.test.ts`

- [ ] **Step 1: Write tests**

Tests must prove global snapshots are immutable source profiles and league copies are separate mutable profiles.

- [ ] **Step 2: Implement snapshot/profile builders**

Use neutral field names: `player_ratings`, `attribute_model`, `era_adjusted_profiles`, `skill_grades`, `archetypes`, `traits`, and `development_curve`.

- [ ] **Step 3: Run compatibility tests**

Run: `npm test -- tests/domain/ratingProfiles.test.ts tests/domain/ratingProfile.test.ts tests/domain/ratingImporter.test.ts`

- [ ] **Step 4: Commit**

```bash
git add domain/nba/ratingProfiles.ts domain/nba/ratingProfile.ts domain/nba/ratingImport.ts tests/domain/ratingProfiles.test.ts
git commit -m "feat: add global and league rating profiles"
```

---

### Task 7: Proof Baselines

**Files:**
- Create: `domain/nba/ratingSeeds.ts`
- Create: `tests/domain/ratingSeeds.test.ts`

- [ ] **Step 1: Write baseline tests**

Tests must prove:
- 2011 LeBron has elite finishing/playmaking/athleticism and A+ potential.
- 2011 Derrick Rose has elite rim pressure, speed with ball, playmaking, and A+ potential without an inflated A+ three-point grade.
- 2026 LeBron is still high-impact but has a lower future-growth potential grade.

- [ ] **Step 2: Implement baseline seeds**

Use public stats, season context, and original scouting tags only.

- [ ] **Step 3: Run tests**

Run: `npm test -- tests/domain/ratingSeeds.test.ts tests/domain/skillGrades.test.ts tests/domain/development.test.ts`

- [ ] **Step 4: Commit**

```bash
git add domain/nba/ratingSeeds.ts tests/domain/ratingSeeds.test.ts
git commit -m "feat: seed basketball rating baselines"
```

---

### Task 8: Verification and Push

**Files:**
- Modify as needed after test failures.

- [ ] **Step 1: Run focused domain tests**

Run: `npm run test:domain`

- [ ] **Step 2: Run whitespace check**

Run: `git diff --check`

- [ ] **Step 3: Commit remaining polish**

```bash
git add domain/nba tests/domain scripts/import-player-ratings.mjs docs/superpowers/plans/2026-06-29-original-basketball-rating-engine-implementation.md
git commit -m "feat: build original basketball rating engine"
```

- [ ] **Step 4: Push and Expo update only after app-safe changes**

Run:

```bash
git push
eas update --branch main --auto
```

Expected: GitHub receives the engine work; Expo receives app-facing updates when UI/app code changes require phone testing.

---

## Self-Review

- Spec coverage: covers hidden numeric-first ratings, visible grade conversion, weighted skill categories, tendencies, current/potential separation, immutable global snapshots, mutable league profiles, proof baselines, and neutral naming.
- Placeholder scan: no proprietary brand labels or commercial formula references are used.
- Type consistency: `AttributeModel`, `SkillGrades`, `PlayerTendencies`, and rating profile terms are intentionally separated so UI, simulation, scouting, and upgrade systems can consume the same source.
