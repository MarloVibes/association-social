# Player Evaluation v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working slice of Player Evaluation v2: tighter hidden grade ladder, visible Potential grade, hidden form/confidence/chemistry layers, sim-ready detailed skills, and an NBA era audit report generator.

**Architecture:** Keep hidden numeric values in pure domain modules and expose only letter grades/tier labels to UI. `domain/nba/evaluation.ts` owns the grade scale, Potential, form, confidence, chemistry, and sim conversion; `domain/nba/scoutingGrades.ts` consumes it for card sections; `domain/nba/simulateGame.ts` consumes detailed sim skills without exposing hidden numbers. A script generates a local audit report before any live vault writes.

**Tech Stack:** Expo React Native, TypeScript domain modules, Vitest, Node scripts, Firestore read-only audit.

---

### Task 1: Evaluation v2 Domain Model

**Files:**
- Create: `domain/nba/evaluation.ts`
- Modify: `domain/nba/identity.ts`
- Test: `tests/domain/evaluation.test.ts`

- [ ] **Step 1: Write failing tests**

Create tests for:

```ts
import { describe, expect, it } from 'vitest';
import {
  gradeFromScore,
  gradeTier,
  buildEvaluationLayers,
  simSkillsFromEvaluation,
} from '@/domain/nba/evaluation';

describe('NBA evaluation v2', () => {
  it('uses the tighter hidden-score grade ladder without exposing scores', () => {
    expect(gradeFromScore(100)).toBe('S');
    expect(gradeFromScore(98)).toBe('A+');
    expect(gradeFromScore(91)).toBe('A-');
    expect(gradeFromScore(88)).toBe('B+');
    expect(gradeFromScore(79)).toBe('C+');
    expect(gradeFromScore(70)).toBe('D+');
    expect(gradeFromScore(64)).toBe('D-');
    expect(gradeTier('B+')).toBe('Pro');
  });

  it('builds visible potential while keeping numeric layers hidden', () => {
    const layers = buildEvaluationLayers({
      hidden: {
        shooting: 82,
        playmaking: 74,
        defense: 87,
        basketballIq: 85,
        potential: 91,
        confidence: 79,
      },
      seasonStats: { points: 16, assists: 3, rebounds: 6, steals: 1.2, games: 8 },
    });

    expect(layers.overallTalent.grade).toBe('B');
    expect(layers.currentForm.grade).toBe('B');
    expect(layers.potential.grade).toBe('A-');
    expect(layers.potential.tier).toBe('Elite');
    expect((layers as Record<string, unknown>).potentialScore).toBeUndefined();
    expect((layers.confidence as Record<string, unknown>).score).toBeUndefined();
  });

  it('converts detailed grades and hidden layers into sim-ready skills', () => {
    const skills = simSkillsFromEvaluation({
      hidden: {
        threePoint: 95,
        midRange: 89,
        passing: 78,
        defenseIq: 90,
        confidence: 88,
        stamina: 80,
      },
    });

    expect(skills.threePoint).toBeGreaterThan(skills.midRange);
    expect(skills.defensiveImpact).toBeGreaterThanOrEqual(85);
    expect(skills.formMultiplier).toBeGreaterThan(0.95);
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `npx vitest run tests/domain/evaluation.test.ts`

Expected: failure because `domain/nba/evaluation.ts` does not exist.

- [ ] **Step 3: Implement evaluation module**

Add a pure domain module with:

```ts
export function gradeFromScore(score: unknown): NbaGrade
export function gradeTier(grade: NbaGrade): GradeTier
export function buildEvaluationLayers(player: Record<string, any>, profile?: Record<string, any> | null): EvaluationLayers
export function simSkillsFromEvaluation(player: Record<string, any>, profile?: Record<string, any> | null): SimEvaluationSkills
```

The module must include `D+` and `D-` in the grade ladder and must never return numeric hidden scores from `buildEvaluationLayers`.

- [ ] **Step 4: Run passing test**

Run: `npx vitest run tests/domain/evaluation.test.ts`

Expected: pass.

### Task 2: Potential Grade in Scouting Cards

**Files:**
- Modify: `domain/nba/scoutingGrades.ts`
- Modify: `components/PlayerCard.tsx`
- Test: `tests/domain/scoutingGrades.test.ts`
- Test: `tests/domain/sourceSafety.test.ts`

- [ ] **Step 1: Write failing tests**

Update tests to require a Growth section with Potential:

```ts
const growth = getScoutingGradeSections({ hidden: { potential: 91 } }).find(section => section.title === 'Growth');
expect(growth?.items.find(item => item.key === 'potential')?.grade).toBe('A-');
```

Add source safety expectations:

```ts
expect(playerCard).toContain('buildEvaluationLayers');
expect(playerCard).toContain('Potential');
expect(playerCard).toContain('Current Form');
```

- [ ] **Step 2: Run failing tests**

Run: `npx vitest run tests/domain/scoutingGrades.test.ts tests/domain/sourceSafety.test.ts`

Expected: failure because Potential is not wired.

- [ ] **Step 3: Implement card wiring**

Add `potential` to the grade map, render a Growth section, and show small visible summary chips for `Overall Talent`, `Current Form`, and `Potential` without numeric hidden values.

- [ ] **Step 4: Run passing tests**

Run: `npx vitest run tests/domain/scoutingGrades.test.ts tests/domain/sourceSafety.test.ts`

Expected: pass.

### Task 3: Detailed Simulation Inputs

**Files:**
- Modify: `domain/nba/simulateGame.ts`
- Test: `tests/domain/simulateGame.test.ts`

- [ ] **Step 1: Write failing tests**

Add a test that a high three-point player attempts more threes than a paint scorer, and a defensive wing lowers opponent output:

```ts
const result = simulateGame({ ... }, 'v2-sim-seed');
expect(shooter.threePointersAttempted).toBeGreaterThan(driver.threePointersAttempted);
expect(lockdown.plusMinus).toBeGreaterThanOrEqual(0);
```

- [ ] **Step 2: Run failing tests**

Run: `npx vitest run tests/domain/simulateGame.test.ts`

Expected: failure until detailed inputs affect shot profile.

- [ ] **Step 3: Implement sim weighting**

Extend `SimPlayerInput` with detailed optional skills:

```ts
closeShot?: number;
midRange?: number;
threePoint?: number;
freeThrow?: number;
dunking?: number;
shotIq?: number;
passing?: number;
ballHandle?: number;
offenseIq?: number;
perimeterDefense?: number;
postDefense?: number;
blocking?: number;
stealsSkill?: number;
defenseIq?: number;
helpDefense?: number;
stamina?: number;
currentForm?: number;
confidence?: number;
chemistry?: number;
```

Use these fields in point distribution, shooting lines, turnovers, defensive events, and team points.

- [ ] **Step 4: Run passing tests**

Run: `npx vitest run tests/domain/simulateGame.test.ts`

Expected: pass.

### Task 4: Era Player Audit Report

**Files:**
- Create: `scripts/audit-nba-era-grades.mjs`
- Create: `tests/domain/evaluationAudit.test.ts`
- Create: `domain/nba/evaluationAudit.ts`

- [ ] **Step 1: Write failing tests**

Add tests that flag a high-minute, high-defense, playoff/core wing as not generic average:

```ts
expect(auditEraPlayer({
  full_name: 'Luol Deng',
  team: 'CHI',
  minutes: 39,
  ppg: 17.4,
  rpg: 5.8,
  spg: 1,
  hidden: { defense: 86, basketballIq: 84, stamina: 92 },
})).toMatchObject({
  coreRole: true,
  suggestedArchetype: expect.stringContaining('Two-Way'),
});
```

- [ ] **Step 2: Run failing tests**

Run: `npx vitest run tests/domain/evaluationAudit.test.ts`

Expected: failure until audit helpers exist.

- [ ] **Step 3: Implement audit helpers and script**

The script reads `era_player_pools/{era}` and writes a local markdown report under `docs/reports/nba-era-grade-audit.md`. It does not write Firestore updates.

- [ ] **Step 4: Run passing tests**

Run: `npx vitest run tests/domain/evaluationAudit.test.ts`

Expected: pass.

### Task 5: Verification and Commit

**Files:**
- All files above.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npx vitest run tests/domain/evaluation.test.ts tests/domain/scoutingGrades.test.ts tests/domain/simulateGame.test.ts tests/domain/evaluationAudit.test.ts tests/domain/sourceSafety.test.ts
```

- [ ] **Step 2: Run full verification**

Run:

```bash
npm test
npx tsc --noEmit
git diff --check
npx expo export --platform web --output-dir /private/tmp/franchise-expo-export-evaluation-v2
```

- [ ] **Step 3: Commit**

Run:

```bash
git add domain/nba/evaluation.ts domain/nba/evaluationAudit.ts domain/nba/identity.ts domain/nba/scoutingGrades.ts domain/nba/simulateGame.ts components/PlayerCard.tsx tests/domain/evaluation.test.ts tests/domain/evaluationAudit.test.ts tests/domain/scoutingGrades.test.ts tests/domain/simulateGame.test.ts tests/domain/sourceSafety.test.ts scripts/audit-nba-era-grades.mjs docs/superpowers/plans/2026-06-26-player-evaluation-v2-implementation.md
git commit -m "feat: add player evaluation v2 foundation"
```

Expected: commit succeeds, leaving only `.superpowers/` untracked.

## Self-Review

- Spec coverage: hidden scores stay hidden, Potential is visible, tighter grade ladder exists, sim receives detailed skills, era audit exists.
- Scope control: this does not overwrite live vault grades. It creates the audit report path first.
- Type consistency: `NbaGrade` includes `D+` and `D-`; `potential` is a `ScoutingGradeKey`; sim input names match the evaluation adapter.
