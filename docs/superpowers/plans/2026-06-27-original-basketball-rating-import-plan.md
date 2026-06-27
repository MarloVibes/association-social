# Original Basketball Rating Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a neutral public-stat-based player rating import system with strict grade gates, era-adjusted profiles, and franchise-mode label cleanup.

**Architecture:** Add pure domain modules first, then wire scripts and source-safety tests around them. The app keeps hidden numeric attributes internal while exposing only grades, archetypes, traits, and development summaries. Import tooling writes neutral rating profile objects that can update the vault without relying on commercial-game ratings or branding.

**Tech Stack:** TypeScript domain modules, Vitest, Expo React Native screens, Node CLI scripts, Firestore-compatible JSON output.

---

## File Structure

- Create: `domain/nba/attributeModel.ts`
  - Converts public basketball stats and manual source facts into internal numeric attributes.
  - Owns grade-gate helpers for `attribute_model` to `skill_grades`.
  - Exports upgrade category coverage so every flexible attribute can be upgraded by GMs.
- Create: `domain/nba/eraAdjustedProfiles.ts`
  - Applies season, pace, position, role, and workload context to internal attributes.
- Create: `domain/nba/ratingProfile.ts`
  - Builds neutral `player_ratings` profile objects from source snapshots, manual patches, attribute model, and era pass.
- Create: `domain/nba/ratingImport.ts`
  - Turns local source snapshots and patch objects into a generated import payload.
- Create: `tests/domain/attributeModel.test.ts`
  - Verifies grade gates and public-stat attribute formulas.
- Create: `tests/domain/eraAdjustedProfiles.test.ts`
  - Verifies era context raises or protects player identities only through numeric attributes.
- Create: `tests/domain/ratingProfile.test.ts`
  - Verifies neutral schema, manual patch safety, archetypes, traits, and development curve.
- Create: `scripts/import-player-ratings.mjs`
  - Reads local public-stat JSON/CSV snapshots and patch JSON, writes a generated neutral JSON artifact, optionally writes to Firestore later.
- Create: `tests/domain/ratingImporter.test.ts`
  - Runs the import script in dry-run mode against fixtures.
- Create: `tests/fixtures/player-rating-snapshot.json`
  - Small local source snapshot for repeatable importer tests.
- Create: `tests/fixtures/player-rating-patch.json`
  - Small manual patch fixture that attempts an invalid elite grade override.
- Modify: `tests/domain/sourceSafety.test.ts`
  - Adds neutral franchise label checks and prohibited-brand scanner.
- Modify: `app/screens/create-league.tsx`
  - Renames visible sport labels.
- Modify: `app/(tabs)/dashboard.tsx`
  - Renames dashboard sport labels.
- Modify: `app/(tabs)/profile-setup.tsx`
  - Renames favorite sport choices.
- Modify: `app/screens/profile.tsx`
  - Renames favorite sport choices.
- Modify: `constants/eraCaps.ts`
  - Removes prohibited commercial-game comment language.
- Modify: existing docs containing visible commercial-game labels
  - Replaces old public labels with neutral franchise labels.

---

### Task 1: Add Source-Safety Scanner And Neutral Franchise Labels

**Files:**
- Modify: `tests/domain/sourceSafety.test.ts`
- Modify: `app/screens/create-league.tsx`
- Modify: `app/(tabs)/dashboard.tsx`
- Modify: `app/(tabs)/profile-setup.tsx`
- Modify: `app/screens/profile.tsx`
- Modify: `constants/eraCaps.ts`
- Modify: docs with old public labels

- [ ] **Step 1: Add failing source-safety tests**

Append these tests to `tests/domain/sourceSafety.test.ts`:

```ts
  it('uses neutral franchise labels for public sport modes', () => {
    const createLeague = source('app/screens/create-league.tsx');
    const dashboard = source('app/(tabs)/dashboard.tsx');
    const profileSetup = source('app/(tabs)/profile-setup.tsx');
    const profile = source('app/screens/profile.tsx');

    for (const file of [createLeague, dashboard, profileSetup, profile]) {
      expect(file).toContain('NBA Franchise');
      expect(file).toContain('NFL Franchise');
      expect(file).toContain('MLB Franchise');
    }
  });

  it('keeps prohibited commercial-game branding out of app source and docs', () => {
    const banned = [
      ['N', 'BA', ' ', '2', 'K'].join(''),
      ['2', 'K', ' ', 'ratings'].join(''),
      ['2', 'K', ' ', 'badges'].join(''),
      ['official', ' ', '2', 'K', ' ', 'attributes'].join(''),
      ['2', 'K', ' ', 'tendencies'].join(''),
      ['N', 'BA', ' ', '2', 'K', ' ', 'database'].join(''),
      ['Ta', 'ke-', 'Two'].join(''),
      ['Vis', 'ual', ' ', 'Con', 'cepts'].join(''),
      ['Mad', 'den', ' ', 'NFL'].join(''),
      ['MLB', ' ', 'The', ' ', 'Show'].join(''),
      ['WWE', ' ', '2', 'K'].join(''),
      ['EA', ' ', 'FC', ' ', '(', 'FI', 'FA', ')'].join(''),
    ].map(term => term.toLowerCase());
    const paths = [
      'app/(tabs)/dashboard.tsx',
      'app/(tabs)/profile-setup.tsx',
      'app/screens/create-league.tsx',
      'app/screens/profile.tsx',
      'constants/eraCaps.ts',
      'docs/superpowers/specs/2026-06-22-mlb-nfl-sport-logic-design.md',
    ];

    const offenders = paths.flatMap(path => {
      const text = source(path).toLowerCase();
      return banned
        .filter(term => text.includes(term))
        .map(term => `${path}:${term}`);
    });

    expect(offenders).toEqual([]);
  });
```

- [ ] **Step 2: Run the tests to verify failure**

Run:

```bash
npx vitest run tests/domain/sourceSafety.test.ts
```

Expected: fail because the old public sport labels still exist.

- [ ] **Step 3: Update visible app labels**

Change these exact values:

In `app/screens/create-league.tsx`:

```ts
const sports = [
  { label: 'NBA Franchise', value: 'nba', emoji: '🏀' },
  { label: 'NFL Franchise', value: 'madden', emoji: '🏈' },
  { label: 'MLB Franchise', value: 'mlb', emoji: '⚾' },
];
```

In `app/(tabs)/dashboard.tsx`:

```ts
const SPORT_LABELS: Record<string, string> = {
  nba: 'NBA Franchise',
  madden: 'NFL Franchise',
  mlb: 'MLB Franchise',
};
```

In `app/(tabs)/profile-setup.tsx`, set:

```ts
const sports = [
  'NBA Franchise', 'NFL Franchise', 'MLB Franchise',
  'Soccer Franchise', 'Hockey Franchise', 'Combat Sports',
  'Motorsports Franchise', 'College Football', 'Rocket League',
  'Skateboarding', 'Golf Franchise',
];
```

In `app/screens/profile.tsx`, set:

```ts
const ALL_SPORTS = [
  'NBA Franchise', 'NFL Franchise', 'MLB Franchise',
  'Soccer Franchise', 'Hockey Franchise', 'Combat Sports',
  'Motorsports Franchise', 'College Football', 'Rocket League',
  'Skateboarding', 'Golf Franchise',
];
```

- [ ] **Step 4: Update neutral comment language**

In `constants/eraCaps.ts`, replace the opening comment with:

```ts
// Per-era NBA salary caps, anchored to each era's representative season.
// Salaries and trade matching stay proportional within the historical season
// environment. Figures are the real league salary cap for the era's anchor
// season, rounded for simulation use.
```

In `docs/superpowers/specs/2026-06-22-mlb-nfl-sport-logic-design.md`, replace visible labels in the sport table with:

```md
| `nba` | NBA Franchise | 30 | Existing behavior | Existing NBA cap and matching rules |
| `madden` | NFL Franchise | 32 | 53 | Hard cap + positional roster rules |
| `mlb` | MLB Franchise | 30 | 40 | Team budget + roster construction rules |
```

- [ ] **Step 5: Run the focused source-safety test**

Run:

```bash
npx vitest run tests/domain/sourceSafety.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit Task 1**

Run:

```bash
git add tests/domain/sourceSafety.test.ts app/screens/create-league.tsx 'app/(tabs)/dashboard.tsx' 'app/(tabs)/profile-setup.tsx' app/screens/profile.tsx constants/eraCaps.ts docs/superpowers/specs/2026-06-22-mlb-nfl-sport-logic-design.md
git commit -m "fix: use neutral franchise labels"
```

---

### Task 2: Add Strict Attribute Model And Grade Gates

**Files:**
- Create: `domain/nba/attributeModel.ts`
- Create: `tests/domain/attributeModel.test.ts`

- [ ] **Step 1: Write failing grade-gate and formula tests**

Create `tests/domain/attributeModel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_UPGRADE_CATEGORIES,
  buildAttributeModel,
  gradeFromAttribute,
  skillGradesFromAttributes,
  validateSkillGrades,
  type PublicStatLine,
} from '@/domain/nba/attributeModel';

const leagueContext = {
  season: 2026,
  pace: 99,
  leagueThreePointPct: 0.36,
  leagueFreeThrowPct: 0.78,
};

function source(overrides: Partial<PublicStatLine> = {}): PublicStatLine {
  return {
    player_id: 'p1',
    full_name: 'Test Player',
    team: 'TST',
    position: 'SG',
    age: 25,
    games: 72,
    minutesPerGame: 34,
    pointsPerGame: 18,
    reboundsPerGame: 5,
    assistsPerGame: 4,
    stealsPerGame: 1,
    blocksPerGame: 0.4,
    fieldGoalPct: 0.46,
    threePointPct: 0.39,
    threePointAttemptsPerGame: 6,
    freeThrowPct: 0.84,
    freeThrowAttemptsPerGame: 4,
    usagePct: 22,
    assistPct: 21,
    turnoverPct: 12,
    offensiveReboundPct: 3,
    defensiveReboundPct: 12,
    stealPct: 1.8,
    blockPct: 1,
    winShares: 6,
    defensiveWinShares: 2.5,
    ...overrides,
  };
}

describe('original basketball attribute model', () => {
  it('never assigns elite grades unless the numeric attribute qualifies', () => {
    expect(gradeFromAttribute(98)).toBe('A+');
    expect(gradeFromAttribute(94)).toBe('A');
    expect(gradeFromAttribute(91)).toBe('A-');
    expect(gradeFromAttribute(88)).toBe('B+');
    expect(gradeFromAttribute(99)).toBe('S');
    expect(validateSkillGrades({ threePoint: 94 }, { threePoint: 'A+' })).toEqual([
      'threePoint requested A+ but numeric value 94 only qualifies for A',
    ]);
    expect(validateSkillGrades({ defenseIq: 88 }, { defenseIq: 'A' })).toEqual([
      'defenseIq requested A but numeric value 88 only qualifies for B+',
    ]);
  });

  it('assigns every flexible attribute to one GM upgrade category', () => {
    const categoryEntries = Object.entries(ATTRIBUTE_UPGRADE_CATEGORIES);
    const covered = new Map<string, string[]>();
    categoryEntries.forEach(([category, attributes]) => {
      attributes.forEach(attribute => {
        covered.set(attribute, [...(covered.get(attribute) || []), category]);
      });
    });

    expect([...covered.keys()].sort()).toEqual([...ATTRIBUTE_KEYS].sort());
    expect([...covered.entries()].filter(([, categories]) => categories.length !== 1)).toEqual([]);
    expect(ATTRIBUTE_UPGRADE_CATEGORIES.Shooting).toEqual(expect.arrayContaining(['midRange', 'threePoint', 'freeThrow', 'shotIq']));
    expect(ATTRIBUTE_UPGRADE_CATEGORIES.Development).toContain('potential');
  });

  it('builds shooter, passer, and defender attributes from public stats', () => {
    const model = buildAttributeModel({
      source: source({
        threePointPct: 0.425,
        threePointAttemptsPerGame: 9.5,
        assistsPerGame: 7.5,
        assistPct: 36,
        stealsPerGame: 1.7,
        defensiveWinShares: 4.2,
      }),
      leagueContext,
    });

    expect(model.threePoint).toBeGreaterThanOrEqual(95);
    expect(model.passing).toBeGreaterThanOrEqual(89);
    expect(model.defenseIq).toBeGreaterThanOrEqual(86);
    expect(skillGradesFromAttributes(model).threePoint).toBe('A+');
  });

  it('keeps low-volume efficient shooting below elite grades', () => {
    const model = buildAttributeModel({
      source: source({
        pointsPerGame: 8,
        threePointPct: 0.44,
        threePointAttemptsPerGame: 1.2,
      }),
      leagueContext,
    });

    expect(model.threePoint).toBeLessThan(89);
    expect(['A-', 'A', 'A+', 'S']).not.toContain(skillGradesFromAttributes(model).threePoint);
  });
});
```

- [ ] **Step 2: Run the test to verify missing module failure**

Run:

```bash
npx vitest run tests/domain/attributeModel.test.ts
```

Expected: fail because `domain/nba/attributeModel.ts` does not exist.

- [ ] **Step 3: Implement `domain/nba/attributeModel.ts`**

Create `domain/nba/attributeModel.ts`:

```ts
import type { NbaGrade } from './identity';
import { gradeFromHiddenValue } from './identity';

export type PublicStatLine = {
  player_id: string;
  full_name: string;
  team: string;
  position: string;
  age?: number;
  games?: number;
  minutesPerGame?: number;
  pointsPerGame?: number;
  reboundsPerGame?: number;
  assistsPerGame?: number;
  stealsPerGame?: number;
  blocksPerGame?: number;
  fieldGoalPct?: number;
  threePointPct?: number;
  threePointAttemptsPerGame?: number;
  freeThrowPct?: number;
  freeThrowAttemptsPerGame?: number;
  usagePct?: number;
  assistPct?: number;
  turnoverPct?: number;
  offensiveReboundPct?: number;
  defensiveReboundPct?: number;
  stealPct?: number;
  blockPct?: number;
  winShares?: number;
  defensiveWinShares?: number;
  salary?: number;
  careerWinShares?: number;
  draftPick?: number;
};

export type LeagueContext = {
  season: number;
  pace?: number;
  leagueThreePointPct?: number;
  leagueFreeThrowPct?: number;
};

export type AttributeModel = {
  closeShot: number;
  midRange: number;
  threePoint: number;
  freeThrow: number;
  dunking: number;
  shotIq: number;
  passing: number;
  ballHandle: number;
  offenseIq: number;
  clutch: number;
  perimeterDefense: number;
  postDefense: number;
  blocking: number;
  steals: number;
  defenseIq: number;
  helpDefense: number;
  speed: number;
  acceleration: number;
  strength: number;
  rebounding: number;
  postOffense: number;
  stamina: number;
  potential: number;
};

export const ATTRIBUTE_KEYS: Array<keyof AttributeModel> = [
  'closeShot',
  'midRange',
  'threePoint',
  'freeThrow',
  'dunking',
  'shotIq',
  'passing',
  'ballHandle',
  'offenseIq',
  'clutch',
  'perimeterDefense',
  'postDefense',
  'blocking',
  'steals',
  'defenseIq',
  'helpDefense',
  'speed',
  'acceleration',
  'strength',
  'rebounding',
  'postOffense',
  'stamina',
  'potential',
];

export type AttributeUpgradeCategory =
  | 'Finishing'
  | 'Shooting'
  | 'Playmaking'
  | 'Defense'
  | 'Rebounding'
  | 'Athleticism'
  | 'Post'
  | 'Intangibles'
  | 'Development';

export const ATTRIBUTE_UPGRADE_CATEGORIES: Record<AttributeUpgradeCategory, Array<keyof AttributeModel>> = {
  Finishing: ['closeShot', 'dunking'],
  Shooting: ['midRange', 'threePoint', 'freeThrow', 'shotIq'],
  Playmaking: ['passing', 'ballHandle', 'offenseIq'],
  Defense: ['perimeterDefense', 'postDefense', 'blocking', 'steals', 'defenseIq', 'helpDefense'],
  Rebounding: ['rebounding'],
  Athleticism: ['speed', 'acceleration', 'strength', 'stamina'],
  Post: ['postOffense'],
  Intangibles: ['clutch'],
  Development: ['potential'],
};

function value(input: unknown, fallback = 0) {
  const numeric = Number(input);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(input: number, min = 25, max = 99) {
  return Math.max(min, Math.min(max, Math.round(input)));
}

function positionGroup(position: string) {
  const pos = String(position || '').toUpperCase();
  if (pos.includes('C')) return 'big';
  if (pos.includes('PF')) return 'forward';
  if (pos.includes('SF')) return 'wing';
  if (pos.includes('SG')) return 'wing';
  if (pos.includes('PG')) return 'guard';
  return 'wing';
}

function volumeGate(score: number, attempts: number, caps: Array<[number, number]>) {
  const cap = caps.find(([limit]) => attempts < limit)?.[1];
  return cap ? Math.min(score, cap) : score;
}

export function gradeFromAttribute(score: number): NbaGrade {
  return gradeFromHiddenValue(score);
}

export function skillGradesFromAttributes(model: Partial<AttributeModel>): Record<string, NbaGrade> {
  return ATTRIBUTE_KEYS.reduce<Record<string, NbaGrade>>((grades, key) => {
    const numeric = value(model[key], 0);
    grades[key] = gradeFromAttribute(numeric);
    return grades;
  }, {});
}

export function validateSkillGrades(
  model: Partial<AttributeModel>,
  requested: Record<string, NbaGrade>,
): string[] {
  return Object.entries(requested).flatMap(([key, grade]) => {
    const numeric = value(model[key as keyof AttributeModel], 0);
    const allowed = gradeFromAttribute(numeric);
    return allowed === grade
      ? []
      : [`${key} requested ${grade} but numeric value ${Math.round(numeric)} only qualifies for ${allowed}`];
  });
}

export function buildAttributeModel({
  source,
  leagueContext,
}: {
  source: PublicStatLine;
  leagueContext: LeagueContext;
}): AttributeModel {
  const group = positionGroup(source.position);
  const mpg = value(source.minutesPerGame);
  const ppg = value(source.pointsPerGame);
  const rpg = value(source.reboundsPerGame);
  const apg = value(source.assistsPerGame);
  const spg = value(source.stealsPerGame);
  const bpg = value(source.blocksPerGame);
  const threePct = value(source.threePointPct, value(leagueContext.leagueThreePointPct, 0.35));
  const threeAvg = value(leagueContext.leagueThreePointPct, 0.35);
  const ftPct = value(source.freeThrowPct, value(leagueContext.leagueFreeThrowPct, 0.76));
  const threeAttempts = value(source.threePointAttemptsPerGame);
  const ftAttempts = value(source.freeThrowAttemptsPerGame);
  const usage = value(source.usagePct, 18);
  const assistPct = value(source.assistPct, apg * 4);
  const turnoverPct = value(source.turnoverPct, 12);
  const stealPct = value(source.stealPct, spg * 1.6);
  const blockPct = value(source.blockPct, bpg * 1.8);
  const defensiveWinShares = value(source.defensiveWinShares);
  const winShares = value(source.winShares);
  const age = value(source.age, 25);

  const threePoint = volumeGate(
    70 + (threePct - threeAvg) * 170 + threeAttempts * 2.8 + ppg * 0.35,
    threeAttempts,
    [[2, 84], [4, 88], [6, 93]],
  );
  const passing = 58 + apg * 3.8 + assistPct * 0.75 - turnoverPct * 0.45 + (group === 'guard' ? 4 : 0);
  const defenseEventScore = spg * 5.5 + bpg * 2.2 + stealPct * 2 + blockPct * 0.9;
  const defenseIq = 58 + mpg * 0.35 + defensiveWinShares * 4 + defenseEventScore + (group === 'wing' ? 3 : 0);
  const rebounding = 54 + rpg * 3.2 + value(source.offensiveReboundPct) * 0.7 + value(source.defensiveReboundPct) * 0.55 + (group === 'big' ? 6 : 0);
  const inside = 58 + ppg * 0.7 + ftAttempts * 1.8 + (group === 'big' ? 6 : 0);
  const touch = 58 + ppg * 0.45 + (ftPct - value(leagueContext.leagueFreeThrowPct, 0.76)) * 75;
  const workload = 58 + mpg * 0.75 + value(source.games) * 0.08;
  const athleticWindow = age <= 23 ? 5 : age <= 27 ? 8 : age <= 31 ? 5 : age <= 34 ? 0 : -5;
  const draftSignal = source.draftPick ? Math.max(0, 9 - Math.floor(value(source.draftPick) / 5)) : 0;

  return {
    closeShot: clamp(inside),
    midRange: clamp(touch + usage * 0.45),
    threePoint: clamp(threePoint),
    freeThrow: clamp(55 + ftPct * 45 + ftAttempts * 1.2),
    dunking: clamp(52 + ftAttempts * 3 + (group === 'big' || group === 'forward' ? 6 : 0) + athleticWindow),
    shotIq: clamp(61 + ppg * 0.65 + winShares * 2.2 + Math.max(0, 14 - turnoverPct) * 0.9),
    passing: clamp(passing),
    ballHandle: clamp(58 + usage * 0.9 + apg * 2.2 - turnoverPct * 0.35 + (group === 'guard' ? 5 : 0)),
    offenseIq: clamp(60 + ppg * 0.45 + apg * 1.8 + winShares * 1.8),
    clutch: clamp(58 + ppg * 0.55 + usage * 0.55 + winShares * 1.1),
    perimeterDefense: clamp(defenseIq + (group === 'wing' || group === 'guard' ? 2 : -4)),
    postDefense: clamp(defenseIq + (group === 'big' || group === 'forward' ? 4 : -6)),
    blocking: clamp(52 + bpg * 8 + blockPct * 2.2 + (group === 'big' ? 7 : 0)),
    steals: clamp(52 + spg * 9 + stealPct * 4 + (group === 'guard' || group === 'wing' ? 3 : 0)),
    defenseIq: clamp(defenseIq),
    helpDefense: clamp(defenseIq + defensiveWinShares * 1.8),
    speed: clamp(66 + athleticWindow + (group === 'guard' ? 7 : group === 'wing' ? 3 : -4)),
    acceleration: clamp(65 + athleticWindow + (group === 'guard' ? 7 : group === 'wing' ? 4 : -5)),
    strength: clamp(59 + rpg * 1.5 + (group === 'big' ? 10 : group === 'forward' ? 6 : 0)),
    rebounding: clamp(rebounding),
    postOffense: clamp(inside + (group === 'big' || group === 'forward' ? 4 : -4)),
    stamina: clamp(workload),
    potential: clamp(63 + draftSignal + Math.max(0, 27 - age) * 1.4 + ppg * 0.28 + winShares * 0.9),
  };
}
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
npx vitest run tests/domain/attributeModel.test.ts tests/domain/evaluation.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git add domain/nba/attributeModel.ts tests/domain/attributeModel.test.ts
git commit -m "feat: add original nba attribute model"
```

---

### Task 3: Add Era-Adjusted Profiles

**Files:**
- Create: `domain/nba/eraAdjustedProfiles.ts`
- Create: `tests/domain/eraAdjustedProfiles.test.ts`

- [ ] **Step 1: Write failing era-adjustment tests**

Create `tests/domain/eraAdjustedProfiles.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildAttributeModel, skillGradesFromAttributes } from '@/domain/nba/attributeModel';
import { applyEraAdjustment } from '@/domain/nba/eraAdjustedProfiles';

describe('era-adjusted profiles', () => {
  it('protects high-minute two-way era wings through numeric attributes before grades', () => {
    const source = {
      player_id: 'deng-luol-2011',
      full_name: 'Luol Deng',
      team: 'CHI',
      position: 'SF',
      age: 25,
      games: 82,
      minutesPerGame: 39.1,
      pointsPerGame: 17.4,
      reboundsPerGame: 5.8,
      assistsPerGame: 2.8,
      stealsPerGame: 1,
      blocksPerGame: 0.6,
      fieldGoalPct: 0.46,
      threePointPct: 0.345,
      threePointAttemptsPerGame: 3,
      freeThrowPct: 0.75,
      freeThrowAttemptsPerGame: 4.4,
      usagePct: 22,
      assistPct: 13,
      turnoverPct: 11,
      offensiveReboundPct: 4,
      defensiveReboundPct: 14,
      stealPct: 1.5,
      blockPct: 1.1,
      winShares: 7.3,
      defensiveWinShares: 4.4,
      salary: 11345000,
      careerWinShares: 74,
    };
    const base = buildAttributeModel({
      source,
      leagueContext: { season: 2011, pace: 92, leagueThreePointPct: 0.358, leagueFreeThrowPct: 0.763 },
    });
    const adjusted = applyEraAdjustment({
      source,
      attribute_model: base,
      context: {
        season: 2011,
        era: 'lebron',
        pace: 92,
        leaguePace: 92,
        leagueThreePointPct: 0.358,
        positionMinutesBaseline: 30,
      },
    });
    const grades = skillGradesFromAttributes(adjusted.era_adjusted_profiles);

    expect(adjusted.adjustments).toContain('core two-way wing role');
    expect(adjusted.era_adjusted_profiles.perimeterDefense).toBeGreaterThanOrEqual(86);
    expect(adjusted.era_adjusted_profiles.defenseIq).toBeGreaterThanOrEqual(83);
    expect(grades.perimeterDefense).toBe('B+');
    expect(['A-', 'A', 'A+', 'S']).not.toContain(grades.threePoint);
  });

  it('does not create elite grades from era context alone', () => {
    const source = {
      player_id: 'low-volume',
      full_name: 'Low Volume Guard',
      team: 'TST',
      position: 'SG',
      age: 29,
      games: 65,
      minutesPerGame: 18,
      pointsPerGame: 6,
      reboundsPerGame: 2,
      assistsPerGame: 1.5,
      stealsPerGame: 0.4,
      blocksPerGame: 0.1,
      threePointPct: 0.41,
      threePointAttemptsPerGame: 1.1,
      freeThrowPct: 0.8,
      usagePct: 13,
      defensiveWinShares: 0.8,
      winShares: 1.5,
    };
    const base = buildAttributeModel({
      source,
      leagueContext: { season: 1992, pace: 96, leagueThreePointPct: 0.331, leagueFreeThrowPct: 0.759 },
    });
    const adjusted = applyEraAdjustment({
      source,
      attribute_model: base,
      context: {
        season: 1992,
        era: 'jordan',
        pace: 96,
        leaguePace: 96,
        leagueThreePointPct: 0.331,
        positionMinutesBaseline: 30,
      },
    });
    const grades = skillGradesFromAttributes(adjusted.era_adjusted_profiles);

    expect(adjusted.era_adjusted_profiles.threePoint).toBeLessThan(89);
    expect(['A-', 'A', 'A+', 'S']).not.toContain(grades.threePoint);
  });
});
```

- [ ] **Step 2: Run test to verify missing module failure**

Run:

```bash
npx vitest run tests/domain/eraAdjustedProfiles.test.ts
```

Expected: fail because `domain/nba/eraAdjustedProfiles.ts` does not exist.

- [ ] **Step 3: Implement `domain/nba/eraAdjustedProfiles.ts`**

Create `domain/nba/eraAdjustedProfiles.ts`:

```ts
import type { AttributeModel, PublicStatLine } from './attributeModel';

export type EraAdjustmentContext = {
  season: number;
  era: string;
  pace?: number;
  leaguePace?: number;
  leagueThreePointPct?: number;
  positionMinutesBaseline?: number;
};

export type EraAdjustmentResult = {
  era_adjusted_profiles: AttributeModel;
  adjustments: string[];
};

function value(input: unknown, fallback = 0) {
  const numeric = Number(input);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(input: number) {
  return Math.max(25, Math.min(99, Math.round(input)));
}

function positionIncludes(position: string, terms: string[]) {
  const pos = String(position || '').toUpperCase();
  return terms.some(term => pos.includes(term));
}

function isWing(source: PublicStatLine) {
  return positionIncludes(source.position, ['SG', 'SF', 'G-F', 'F-G']);
}

function capLowVolumeShooting(score: number, attempts: number) {
  if (attempts < 2) return Math.min(score, 84);
  if (attempts < 4) return Math.min(score, 88);
  if (attempts < 6) return Math.min(score, 93);
  return score;
}

export function applyEraAdjustment({
  source,
  attribute_model,
  context,
}: {
  source: PublicStatLine;
  attribute_model: AttributeModel;
  context: EraAdjustmentContext;
}): EraAdjustmentResult {
  const adjusted: AttributeModel = { ...attribute_model };
  const adjustments: string[] = [];
  const mpg = value(source.minutesPerGame);
  const ppg = value(source.pointsPerGame);
  const rpg = value(source.reboundsPerGame);
  const apg = value(source.assistsPerGame);
  const spg = value(source.stealsPerGame);
  const bpg = value(source.blocksPerGame);
  const salary = value(source.salary);
  const careerWinShares = value(source.careerWinShares);
  const defensiveWinShares = value(source.defensiveWinShares);
  const minutesBaseline = value(context.positionMinutesBaseline, 30);
  const workloadBonus = Math.max(0, mpg - minutesBaseline) * 0.45;
  const pace = value(context.pace, value(context.leaguePace, 98));
  const leaguePace = value(context.leaguePace, pace);
  const pacePenalty = Math.max(-3, Math.min(3, (leaguePace - pace) * 0.08));
  const wingStopperSignal = isWing(source)
    && mpg >= 32
    && ppg >= 11
    && rpg >= 4
    && spg >= 0.7;
  const coreSalarySignal = salary >= 8_000_000 || careerWinShares >= 40;
  const defensiveCore = wingStopperSignal || defensiveWinShares >= 3.5 || (spg + bpg >= 1.6 && mpg >= 28);

  if (wingStopperSignal && coreSalarySignal) {
    adjusted.perimeterDefense = Math.max(adjusted.perimeterDefense, 86);
    adjusted.defenseIq = Math.max(adjusted.defenseIq, 83);
    adjusted.helpDefense = Math.max(adjusted.helpDefense, 82);
    adjusted.stamina = Math.max(adjusted.stamina, 89);
    adjusted.offenseIq = Math.max(adjusted.offenseIq, 80);
    adjustments.push('core two-way wing role');
  }

  if (defensiveCore) {
    adjusted.defenseIq += 2 + workloadBonus;
    adjusted.helpDefense += 2 + defensiveWinShares * 0.25;
    adjusted.perimeterDefense += isWing(source) ? 2 : 0;
    adjusted.postDefense += positionIncludes(source.position, ['PF', 'C']) ? 2 : 0;
    adjustments.push('defensive workload context');
  }

  if (mpg >= 36) {
    adjusted.stamina += 3 + workloadBonus;
    adjustments.push('heavy minutes context');
  }

  if (ppg + rpg + apg >= 24 && mpg >= 30) {
    adjusted.offenseIq += 1 + pacePenalty;
    adjusted.shotIq += 1 + pacePenalty;
    adjustments.push('core offensive role context');
  }

  adjusted.threePoint = capLowVolumeShooting(adjusted.threePoint, value(source.threePointAttemptsPerGame));

  Object.keys(adjusted).forEach((key) => {
    adjusted[key as keyof AttributeModel] = clamp(adjusted[key as keyof AttributeModel]);
  });

  return {
    era_adjusted_profiles: adjusted,
    adjustments,
  };
}
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
npx vitest run tests/domain/eraAdjustedProfiles.test.ts tests/domain/attributeModel.test.ts tests/domain/evaluationAudit.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit Task 3**

Run:

```bash
git add domain/nba/eraAdjustedProfiles.ts tests/domain/eraAdjustedProfiles.test.ts
git commit -m "feat: add nba era adjusted rating profiles"
```

---

### Task 4: Build Neutral Rating Profile Assembly

**Files:**
- Create: `domain/nba/ratingProfile.ts`
- Create: `tests/domain/ratingProfile.test.ts`

- [ ] **Step 1: Write failing profile tests**

Create `tests/domain/ratingProfile.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildPlayerRatingProfile } from '@/domain/nba/ratingProfile';

const source = {
  player_id: 'guard-1',
  full_name: 'Original Guard',
  team: 'TST',
  position: 'PG',
  age: 22,
  games: 76,
  minutesPerGame: 35,
  pointsPerGame: 23,
  reboundsPerGame: 4,
  assistsPerGame: 8.5,
  stealsPerGame: 1.4,
  blocksPerGame: 0.2,
  fieldGoalPct: 0.48,
  threePointPct: 0.385,
  threePointAttemptsPerGame: 7,
  freeThrowPct: 0.88,
  freeThrowAttemptsPerGame: 5,
  usagePct: 29,
  assistPct: 41,
  turnoverPct: 12,
  defensiveWinShares: 3,
  winShares: 9,
  draftPick: 4,
};

describe('neutral player rating profiles', () => {
  it('builds neutral profile fields and hides numeric values from skill grades', () => {
    const profile = buildPlayerRatingProfile({
      source,
      source_snapshot_id: 'snapshot-current-1',
      leagueContext: { season: 2027, pace: 100, leagueThreePointPct: 0.36, leagueFreeThrowPct: 0.78 },
      eraContext: { season: 2027, era: 'current', pace: 100, leaguePace: 100, leagueThreePointPct: 0.36 },
      generated_at_ms: 10,
    });

    expect(profile).toMatchObject({
      player_id: 'guard-1',
      full_name: 'Original Guard',
      source_snapshot_id: 'snapshot-current-1',
      model_version: 'original-attribute-model-v1',
      generated_at_ms: 10,
    });
    expect(profile.attribute_model.passing).toBeGreaterThanOrEqual(89);
    expect(profile.skill_grades.passing).toMatch(/^[A-FS][+-]?$/);
    expect(profile.archetypes).toContain('Floor General');
    expect(profile.traits).toContain('low mistake rate');
    expect(profile.development_curve.potential).toBeGreaterThanOrEqual(profile.era_adjusted_profiles.passing - 4);
    expect(JSON.stringify(profile)).toContain('attribute_model');
    expect(JSON.stringify(profile)).not.toContain('overall');
  });

  it('applies source patches without allowing direct grade overrides', () => {
    const profile = buildPlayerRatingProfile({
      source: { ...source, threePointPct: 0.31, threePointAttemptsPerGame: 2 },
      source_snapshot_id: 'snapshot-current-2',
      patch: {
        team: 'NEW',
        jersey_number: '1',
        skill_grades: { threePoint: 'A+' },
      },
      leagueContext: { season: 2027, pace: 100, leagueThreePointPct: 0.36, leagueFreeThrowPct: 0.78 },
      eraContext: { season: 2027, era: 'current', pace: 100, leaguePace: 100, leagueThreePointPct: 0.36 },
      generated_at_ms: 11,
    });

    expect(profile.team).toBe('NEW');
    expect(profile.jersey_number).toBe('1');
    expect(['A+', 'S']).not.toContain(profile.skill_grades.threePoint);
    expect(profile.validation_warnings).toContain('threePoint requested A+ but numeric value 75 only qualifies for C');
  });
});
```

- [ ] **Step 2: Run test to verify missing module failure**

Run:

```bash
npx vitest run tests/domain/ratingProfile.test.ts
```

Expected: fail because `domain/nba/ratingProfile.ts` does not exist.

- [ ] **Step 3: Implement profile builder**

Create `domain/nba/ratingProfile.ts`:

```ts
import {
  buildAttributeModel,
  skillGradesFromAttributes,
  validateSkillGrades,
  type LeagueContext,
  type PublicStatLine,
  type AttributeModel,
} from './attributeModel';
import { applyEraAdjustment, type EraAdjustmentContext } from './eraAdjustedProfiles';

export type RatingPatch = Partial<Pick<PublicStatLine, 'team' | 'position' | 'age'>> & {
  jersey_number?: string;
  roster_status?: 'active' | 'unsigned' | 'traded' | 'waived' | 'draft_rights';
  notes?: string;
  skill_grades?: Record<string, any>;
};

export type PlayerRatingProfile = {
  player_id: string;
  full_name: string;
  season: number;
  team: string;
  position: string;
  jersey_number?: string;
  roster_status?: string;
  source_snapshot_id: string;
  attribute_model: AttributeModel;
  era_adjusted_profiles: AttributeModel;
  skill_grades: Record<string, string>;
  archetypes: string[];
  traits: string[];
  development_curve: {
    potential: number;
    peak_start_age: number;
    peak_end_age: number;
    aging_resistance: number;
  };
  validation_warnings: string[];
  model_version: 'original-attribute-model-v1';
  generated_at_ms: number;
};

function patchedSource(source: PublicStatLine, patch?: RatingPatch): PublicStatLine {
  return {
    ...source,
    team: patch?.team || source.team,
    position: patch?.position || source.position,
    age: patch?.age ?? source.age,
  };
}

function archetypesFor(model: AttributeModel, source: PublicStatLine) {
  const archetypes: string[] = [];
  if (model.passing >= 89) archetypes.push('Floor General');
  if (model.perimeterDefense >= 86 && model.offenseIq >= 80) archetypes.push('Two-Way Wing');
  if (model.threePoint >= 89 && model.stamina >= 80) archetypes.push('Movement Shooter');
  if (model.blocking >= 86 && model.rebounding >= 83) archetypes.push('Rim Protector');
  if (model.postOffense >= 84 && model.rebounding >= 82) archetypes.push('Post Scorer');
  if (model.dunking >= 86 && model.speed >= 80) archetypes.push('Slashing Creator');
  if (archetypes.length === 0) archetypes.push(String(source.position || '').includes('C') ? 'Interior Contributor' : 'Rotation Contributor');
  return archetypes.slice(0, 3);
}

function traitsFor(model: AttributeModel) {
  const traits: string[] = [];
  if (model.stamina >= 86) traits.push('high motor');
  if (model.threePoint >= 86) traits.push('reliable shooter');
  if (model.defenseIq >= 84) traits.push('defensive communicator');
  if (model.speed >= 84) traits.push('transition threat');
  if (model.freeThrow >= 84 && model.closeShot >= 80) traits.push('foul pressure');
  if (model.offenseIq >= 84 && model.passing >= 84) traits.push('low mistake rate');
  if (model.clutch >= 84) traits.push('late-game poise');
  return traits.length > 0 ? traits.slice(0, 5) : ['steady role fit'];
}

function developmentCurve(model: AttributeModel, source: PublicStatLine) {
  const age = Number(source.age || 25);
  const aging_resistance = model.stamina >= 88 && model.offenseIq >= 84 ? 3 : model.potential >= 89 ? 2 : model.potential >= 82 ? 1 : 0;
  return {
    potential: model.potential,
    peak_start_age: age <= 23 ? 25 : age <= 28 ? age + 1 : age,
    peak_end_age: aging_resistance >= 2 ? 34 : 32,
    aging_resistance,
  };
}

export function buildPlayerRatingProfile({
  source,
  source_snapshot_id,
  patch,
  leagueContext,
  eraContext,
  generated_at_ms = Date.now(),
}: {
  source: PublicStatLine;
  source_snapshot_id: string;
  patch?: RatingPatch;
  leagueContext: LeagueContext;
  eraContext: EraAdjustmentContext;
  generated_at_ms?: number;
}): PlayerRatingProfile {
  const resolvedSource = patchedSource(source, patch);
  const attribute_model = buildAttributeModel({ source: resolvedSource, leagueContext });
  const era = applyEraAdjustment({ source: resolvedSource, attribute_model, context: eraContext });
  const validation_warnings = patch?.skill_grades
    ? validateSkillGrades(era.era_adjusted_profiles, patch.skill_grades)
    : [];
  const skill_grades = skillGradesFromAttributes(era.era_adjusted_profiles);

  return {
    player_id: resolvedSource.player_id,
    full_name: resolvedSource.full_name,
    season: leagueContext.season,
    team: resolvedSource.team,
    position: resolvedSource.position,
    jersey_number: patch?.jersey_number,
    roster_status: patch?.roster_status,
    source_snapshot_id,
    attribute_model,
    era_adjusted_profiles: era.era_adjusted_profiles,
    skill_grades,
    archetypes: archetypesFor(era.era_adjusted_profiles, resolvedSource),
    traits: traitsFor(era.era_adjusted_profiles),
    development_curve: developmentCurve(era.era_adjusted_profiles, resolvedSource),
    validation_warnings,
    model_version: 'original-attribute-model-v1',
    generated_at_ms,
  };
}
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
npx vitest run tests/domain/ratingProfile.test.ts tests/domain/attributeModel.test.ts tests/domain/eraAdjustedProfiles.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit Task 4**

Run:

```bash
git add domain/nba/ratingProfile.ts tests/domain/ratingProfile.test.ts
git commit -m "feat: assemble neutral player rating profiles"
```

---

### Task 5: Add Local Import Core And CLI With Fixtures

**Files:**
- Create: `domain/nba/ratingImport.ts`
- Create: `scripts/import-player-ratings.mjs`
- Create: `tests/domain/ratingImporter.test.ts`
- Create: `tests/fixtures/player-rating-snapshot.json`
- Create: `tests/fixtures/player-rating-patch.json`
- Modify: `package.json` if a script alias is desired

- [ ] **Step 1: Add test fixtures**

Create `tests/fixtures/player-rating-snapshot.json`:

```json
{
  "snapshot_id": "fixture-current-2027",
  "leagueContext": {
    "season": 2027,
    "pace": 100,
    "leagueThreePointPct": 0.36,
    "leagueFreeThrowPct": 0.78
  },
  "eraContext": {
    "season": 2027,
    "era": "current",
    "pace": 100,
    "leaguePace": 100,
    "leagueThreePointPct": 0.36,
    "positionMinutesBaseline": 30
  },
  "players": [
    {
      "player_id": "fixture-1",
      "full_name": "Fixture Creator",
      "team": "TST",
      "position": "PG",
      "age": 23,
      "games": 72,
      "minutesPerGame": 34,
      "pointsPerGame": 22,
      "reboundsPerGame": 4,
      "assistsPerGame": 8,
      "stealsPerGame": 1.5,
      "blocksPerGame": 0.2,
      "fieldGoalPct": 0.47,
      "threePointPct": 0.39,
      "threePointAttemptsPerGame": 7,
      "freeThrowPct": 0.88,
      "freeThrowAttemptsPerGame": 5,
      "usagePct": 28,
      "assistPct": 40,
      "turnoverPct": 12,
      "defensiveWinShares": 3,
      "winShares": 8,
      "draftPick": 3
    }
  ]
}
```

Create `tests/fixtures/player-rating-patch.json`:

```json
{
  "players": {
    "fixture-1": {
      "team": "NEW",
      "jersey_number": "4",
      "skill_grades": {
        "threePoint": "S"
      }
    }
  }
}
```

- [ ] **Step 2: Write failing importer test**

Create `tests/domain/ratingImporter.test.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRatingImportPayload } from '@/domain/nba/ratingImport';
import snapshot from '../fixtures/player-rating-snapshot.json';
import patch from '../fixtures/player-rating-patch.json';

describe('player rating importer', () => {
  it('generates neutral rating profiles from a local source snapshot', () => {
    const payload = buildRatingImportPayload({
      snapshot,
      patch,
      generated_at_ms: 100,
    });

    expect(payload.snapshot_id).toBe('fixture-current-2027');
    expect(payload.collection).toBe('player_ratings');
    expect(payload.profiles).toHaveLength(1);
    expect(payload.profiles[0].team).toBe('NEW');
    expect(payload.profiles[0].skill_grades.threePoint).not.toBe('S');
    expect(payload.profiles[0].validation_warnings[0]).toContain('requested S');
    expect(JSON.stringify(payload)).toContain('attribute_model');
  });
});
```

- [ ] **Step 3: Run test to verify missing module failure**

Run:

```bash
npx vitest run tests/domain/ratingImporter.test.ts
```

Expected: fail because `domain/nba/ratingImport.ts` does not exist.

- [ ] **Step 4: Implement import payload builder**

Create `domain/nba/ratingImport.ts`:

```ts
import { buildPlayerRatingProfile, type RatingPatch, type PlayerRatingProfile } from './ratingProfile';
import type { LeagueContext, PublicStatLine } from './attributeModel';
import type { EraAdjustmentContext } from './eraAdjustedProfiles';

export type RatingSourceSnapshot = {
  snapshot_id: string;
  leagueContext: LeagueContext;
  eraContext: EraAdjustmentContext;
  players: PublicStatLine[];
};

export type RatingPatchSet = {
  players?: Record<string, RatingPatch>;
};

export type RatingImportPayload = {
  collection: 'player_ratings';
  snapshot_id: string;
  generated_at_ms: number;
  profiles: PlayerRatingProfile[];
};

export function buildRatingImportPayload({
  snapshot,
  patch = {},
  generated_at_ms = Date.now(),
}: {
  snapshot: RatingSourceSnapshot;
  patch?: RatingPatchSet;
  generated_at_ms?: number;
}): RatingImportPayload {
  return {
    collection: 'player_ratings',
    snapshot_id: snapshot.snapshot_id,
    generated_at_ms,
    profiles: (snapshot.players || []).map(player => buildPlayerRatingProfile({
      source: player,
      source_snapshot_id: snapshot.snapshot_id,
      patch: patch.players?.[player.player_id],
      leagueContext: snapshot.leagueContext,
      eraContext: snapshot.eraContext,
      generated_at_ms,
    })),
  };
}
```

- [ ] **Step 5: Run importer core tests**

Run:

```bash
npx vitest run tests/domain/ratingImporter.test.ts tests/domain/ratingProfile.test.ts
```

Expected: pass.

- [ ] **Step 6: Add thin CLI script**

Create `scripts/import-player-ratings.mjs`:

```js
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);

function arg(name, fallback = '') {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || fallback : fallback;
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8'));
}

function main() {
  const sourcePath = arg('--source');
  const patchPath = arg('--patch');
  const outPath = arg('--out', 'dist/player-ratings.json');
  if (!sourcePath) throw new Error('Provide --source path.');

  const snapshot = readJson(sourcePath);
  const patch = patchPath ? readJson(patchPath) : { players: {} };
  const payload = {
    collection: 'player_ratings',
    snapshot_id: snapshot.snapshot_id,
    generated_at_ms: Date.now(),
    source_path: sourcePath,
    patch_path: patchPath || null,
    dry_run: args.includes('--dry-run'),
    profiles: (snapshot.players || []).map(player => ({
      player_id: player.player_id,
      full_name: player.full_name,
      team: patch.players?.[player.player_id]?.team || player.team,
      source_snapshot_id: snapshot.snapshot_id,
      import_status: 'ready_for_model',
    })),
  };
  writeFileSync(resolve(process.cwd(), outPath), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Prepared ${payload.profiles.length} player rating source record${payload.profiles.length === 1 ? '' : 's'} at ${outPath}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
```

- [ ] **Step 7: Add CLI smoke test**

Append this second test inside the existing `describe` block in `tests/domain/ratingImporter.test.ts`:

```ts
  it('runs the neutral CLI wrapper without network access', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'rating-import-'));
    const outFile = join(outDir, 'profiles.json');

    execFileSync('node', [
      'scripts/import-player-ratings.mjs',
      '--source',
      'tests/fixtures/player-rating-snapshot.json',
      '--patch',
      'tests/fixtures/player-rating-patch.json',
      '--out',
      outFile,
      '--dry-run',
    ], { stdio: 'pipe' });

    const payload = JSON.parse(readFileSync(outFile, 'utf8'));
    expect(payload.collection).toBe('player_ratings');
    expect(payload.profiles[0]).toMatchObject({
      player_id: 'fixture-1',
      team: 'NEW',
      import_status: 'ready_for_model',
    });
  });
```

- [ ] **Step 8: Run importer tests**

Run:

```bash
npx vitest run tests/domain/ratingImporter.test.ts tests/domain/ratingProfile.test.ts
```

Expected: pass.

- [ ] **Step 9: Commit Task 5**

Run:

```bash
git add domain/nba/ratingImport.ts scripts/import-player-ratings.mjs tests/domain/ratingImporter.test.ts tests/fixtures/player-rating-snapshot.json tests/fixtures/player-rating-patch.json
git commit -m "feat: add local player rating import cli"
```

---

### Task 6: Full Verification And Source Audit

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run all tests**

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

- [ ] **Step 3: Run diff whitespace check**

Run:

```bash
git diff --check
```

Expected: no output and exit code `0`.

- [ ] **Step 4: Run focused prohibited-brand scan**

Run:

```bash
npx vitest run tests/domain/sourceSafety.test.ts
```

Expected: pass. If it fails, replace public-facing labels or comments with neutral franchise wording. Do not weaken the scanner.

- [ ] **Step 5: Review git status**

Run:

```bash
git status --short
```

Expected: clean except for the local `.superpowers/` scratch directory.

- [ ] **Step 6: Commit any verification-only updates**

If only test guard wording or docs were adjusted during verification, run:

```bash
git add tests/domain/sourceSafety.test.ts docs
git commit -m "test: enforce neutral franchise source safety"
```

If no files changed, do not create an empty commit.
