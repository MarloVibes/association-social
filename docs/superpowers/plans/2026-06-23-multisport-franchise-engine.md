# Multisport Franchise Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace inherited NBA behavior in MLB/NFL leagues and build a tested franchise engine that supports sport-specific offseasons plus indefinite NBA seasons, simulation, playoffs, development, and expansion.

**Architecture:** Pure TypeScript domain modules own sport rules, roster/finance validation, offseason state, simulation, and deterministic CPU decisions. Firebase callable functions are the only authority for timed, concurrent, or multi-document mutations; Expo screens display state and invoke those functions. The work ships in four phases so each phase is independently testable and usable.

**Tech Stack:** Expo SDK 54, React Native, Expo Router, TypeScript, Firebase Auth/Firestore/Functions v2, Node.js 22, Vitest, Firebase Emulator Suite.

---

## Delivery Phases

1. **Foundation and MLB/NFL cleanup:** testing, central sport rules, correct league creation/settings, sport-aware players, trades, and chat.
2. **Shared offseason engine:** contracts, CPU decisions, editable draft classes, live drafts, roster cuts, and MLB/NFL season advancement.
3. **NBA season engine:** Player Identity Model, rotations/coaching, schedules, requests, simulation, full box scores, standings, fatigue, injuries, and playoffs.
4. **NBA future offseason:** progression, free agency, cap growth, future drafts, 15+3 roster rules, expansion, and player upgrade points.

## File Structure

### Domain modules

- `domain/sports/types.ts`: shared sport and league-rule types.
- `domain/sports/rules.ts`: immutable NBA, Madden, and MLB defaults.
- `domain/sports/playerFields.ts`: positions, custom-player statistics, awards, and display labels.
- `domain/finance/validateTrade.ts`: sport-aware trade and roster validation.
- `domain/offseason/types.ts`: offseason stages and persisted state shapes.
- `domain/offseason/contracts.ts`: offer scoring and contract progression.
- `domain/offseason/cpu.ts`: deterministic vacant-team decisions.
- `domain/draft/generateClass.ts`: seeded sport-specific prospect generation.
- `domain/draft/autoPick.ts`: need-and-talent draft selection.
- `domain/nba/identity.ts`: hidden values, visible grades, roles, and reputation.
- `domain/nba/rotation.ts`: 240-minute rotation validation and CPU fallback.
- `domain/nba/coaching.ts`: coaching presets and matchup effects.
- `domain/nba/schedule.ts`: balanced schedules for 14, 29, 58, and 82 games.
- `domain/nba/simulateGame.ts`: deterministic full-box-score simulation.
- `domain/nba/injuries.ts`: capped minor and severe injury generation.
- `domain/nba/progression.ts`: annual development and regression.
- `domain/nba/playoffs.ts`: standings seeding, Play-In, and brackets.
- `domain/nba/expansion.ts`: expansion proposals and protection logic.

### Firebase services

- `functions/domain/*.js`: server-compatible copies or compiled output of shared pure domain logic.
- `functions/index.js`: callable registration only.
- `functions/franchise/*.js`: authorization, transactions, deadlines, notifications, and orchestration.

### Expo screens

- Existing shared screens are updated for sport-aware behavior.
- New offseason screens live under `app/screens/offseason/`.
- New NBA season screens live under `app/screens/season/`.

### Tests

- `tests/domain/**/*.test.ts`: pure deterministic behavior.
- `tests/functions/**/*.test.ts`: callable and transaction behavior using emulators.

---

## Phase 1: Foundation and MLB/NFL Cleanup

### Task 1: Add the Test Harness

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Create: `tests/domain/smoke.test.ts`

- [ ] **Step 1: Add a failing smoke test**

```ts
import { describe, expect, it } from 'vitest';
import { getSportRules } from '@/domain/sports/rules';

describe('sport rules', () => {
  it('exposes 32 NFL teams', () => {
    expect(getSportRules('madden').teamCount).toBe(32);
  });
});
```

- [ ] **Step 2: Install and configure Vitest**

Run:

```bash
npm install --save-dev vitest @firebase/rules-unit-testing
```

Add scripts:

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:domain": "vitest run tests/domain",
  "test:functions": "vitest run tests/functions"
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: { environment: 'node', setupFiles: ['./tests/setup.ts'] },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
});
```

- [ ] **Step 3: Verify the test fails for the missing module**

Run: `npm run test:domain`

Expected: FAIL because `domain/sports/rules` does not exist.

- [ ] **Step 4: Commit the harness**

```bash
git add package.json package-lock.json vitest.config.ts tests
git commit -m "test: add franchise domain test harness"
```

### Task 2: Create the Central Sport-Rules Engine

**Files:**
- Create: `domain/sports/types.ts`
- Create: `domain/sports/rules.ts`
- Test: `tests/domain/sportRules.test.ts`

- [ ] **Step 1: Write failing rules tests**

```ts
import { describe, expect, it } from 'vitest';
import { getSportRules, seasonLabel } from '@/domain/sports/rules';

describe('getSportRules', () => {
  it('uses sport-specific league and roster limits', () => {
    expect(getSportRules('nba')).toMatchObject({ teamCount: 30, standardRosterLimit: 15, twoWayLimit: 3 });
    expect(getSportRules('madden')).toMatchObject({ teamCount: 32, standardRosterLimit: 53, financeMode: 'hard_cap' });
    expect(getSportRules('mlb')).toMatchObject({ teamCount: 30, standardRosterLimit: 40, financeMode: 'team_budget' });
  });

  it('formats seasons by sport', () => {
    expect(seasonLabel('nba', 2026)).toBe('2026-27');
    expect(seasonLabel('madden', 2026)).toBe('2026');
    expect(seasonLabel('mlb', 2027)).toBe('2027');
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/domain/sportRules.test.ts`

Expected: FAIL because the exports are missing.

- [ ] **Step 3: Implement immutable rules**

```ts
export type SportKey = 'nba' | 'madden' | 'mlb';
export type FinanceMode = 'nba_cap' | 'hard_cap' | 'team_budget';

export interface SportRules {
  key: SportKey;
  teamCount: number;
  standardRosterLimit: number;
  twoWayLimit: number;
  draftRounds: number;
  initialSeasonYear: number;
  financeMode: FinanceMode;
  defaultDraftTimerSeconds: number;
}
```

```ts
const RULES: Record<SportKey, SportRules> = {
  nba: { key: 'nba', teamCount: 30, standardRosterLimit: 15, twoWayLimit: 3, draftRounds: 2, initialSeasonYear: 2025, financeMode: 'nba_cap', defaultDraftTimerSeconds: 120 },
  madden: { key: 'madden', teamCount: 32, standardRosterLimit: 53, twoWayLimit: 0, draftRounds: 7, initialSeasonYear: 2025, financeMode: 'hard_cap', defaultDraftTimerSeconds: 120 },
  mlb: { key: 'mlb', teamCount: 30, standardRosterLimit: 40, twoWayLimit: 0, draftRounds: 5, initialSeasonYear: 2026, financeMode: 'team_budget', defaultDraftTimerSeconds: 120 },
};

export function getSportRules(sport: string): SportRules {
  return RULES[(sport === 'nfl' ? 'madden' : sport) as SportKey] || RULES.nba;
}

export function seasonLabel(sport: SportKey, year: number): string {
  return sport === 'nba' ? `${year}-${String(year + 1).slice(-2)}` : String(year);
}
```

- [ ] **Step 4: Verify GREEN**

Run: `npx vitest run tests/domain/sportRules.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add domain/sports tests/domain/sportRules.test.ts
git commit -m "feat: centralize sport rules"
```

### Task 3: Correct League Creation, Membership, and Settings

**Files:**
- Modify: `app/screens/create-league.tsx`
- Modify: `app/screens/league-settings.tsx`
- Modify: `app/screens/join-league.tsx`
- Modify: `app/screens/league-waitlist.tsx`
- Modify: `utils/leagueMembership.ts`
- Test: `tests/domain/leagueDefaults.test.ts`

- [ ] **Step 1: Write failing default tests**

```ts
import { expect, it } from 'vitest';
import { buildLeagueDefaults } from '@/domain/sports/rules';

it('creates NFL and MLB leagues with correct defaults', () => {
  expect(buildLeagueDefaults('madden')).toMatchObject({ maxMembers: 32, currentYear: 2025, currentSeason: '2025', rosterLimit: 53 });
  expect(buildLeagueDefaults('mlb')).toMatchObject({ maxMembers: 30, currentYear: 2026, currentSeason: '2026', rosterLimit: 40 });
});
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/domain/leagueDefaults.test.ts`

Expected: FAIL because `buildLeagueDefaults` is missing.

- [ ] **Step 3: Add `buildLeagueDefaults`**

```ts
export function buildLeagueDefaults(sportInput: string) {
  const rules = getSportRules(sportInput);
  return {
    maxMembers: rules.teamCount,
    currentYear: rules.initialSeasonYear,
    currentSeason: seasonLabel(rules.key, rules.initialSeasonYear),
    rosterLimit: rules.standardRosterLimit,
    twoWayLimit: rules.twoWayLimit,
    draftRounds: rules.draftRounds,
    draftTimerSeconds: rules.defaultDraftTimerSeconds,
    financeMode: rules.financeMode,
  };
}
```

- [ ] **Step 4: Wire all membership limits to stored sport defaults**

In creation, spread `buildLeagueDefaults(sport)`. In settings, validate:

```ts
const teamLimit = getSportRules(league.sport).teamCount;
if (mm < currentMembers || mm > teamLimit) {
  Alert.alert('Invalid', `Max GMs must be between ${currentMembers} and ${teamLimit}.`);
  return;
}
```

Use `getSportRules(league.sport).teamCount` as the legacy fallback in join and waitlist flows.

- [ ] **Step 5: Verify**

Run:

```bash
npx vitest run tests/domain/leagueDefaults.test.ts
npx expo export --platform ios --output-dir /tmp/franchise-phase1-defaults
```

Expected: test PASS and export succeeds.

- [ ] **Step 6: Commit**

```bash
git add domain/sports app/screens/create-league.tsx app/screens/league-settings.tsx app/screens/join-league.tsx app/screens/league-waitlist.tsx utils/leagueMembership.ts tests/domain/leagueDefaults.test.ts
git commit -m "fix: apply sport-specific league defaults"
```

### Task 4: Make Player Fields and Filters Sport-Aware

**Files:**
- Create: `domain/sports/playerFields.ts`
- Modify: `app/screens/roster.tsx`
- Modify: `app/screens/trade-channel.tsx`
- Modify: `app/screens/create-player.tsx`
- Modify: `app/screens/pending-players.tsx`
- Test: `tests/domain/playerFields.test.ts`

- [ ] **Step 1: Write failing field tests**

```ts
import { expect, it } from 'vitest';
import { getPlayerEditorSchema, getPositionFilters } from '@/domain/sports/playerFields';

it('does not expose basketball fields in NFL or MLB', () => {
  expect(getPositionFilters('madden')).toContain('QB');
  expect(getPositionFilters('mlb')).toContain('SP');
  expect(getPlayerEditorSchema('madden').stats.map(x => x.key)).not.toContain('ppg');
  expect(getPlayerEditorSchema('mlb').awards.map(x => x.key)).toContain('cy_young');
});
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/domain/playerFields.test.ts`

Expected: FAIL because the schema module is missing.

- [ ] **Step 3: Implement explicit schemas**

Export `NBA_POSITIONS`, `NFL_POSITIONS`, `MLB_POSITIONS`, and:

```ts
export function getPositionFilters(sport: string): string[] {
  if (sport === 'madden' || sport === 'nfl') return ['ALL', ...NFL_POSITIONS];
  if (sport === 'mlb') return ['ALL', ...MLB_POSITIONS];
  return ['ALL', ...NBA_POSITIONS];
}
```

Define editor schemas with concrete stat keys and awards from the approved specifications. Every saved custom player includes:

```ts
{ sport: leagueSport, contractYears, role, ratings, seasons, awards }
```

- [ ] **Step 4: Wire shared screens**

Replace hardcoded basketball filter arrays with `getPositionFilters(authoritativeSport)`. Load the league document before rendering the custom-player editor. Filter vault custom players by both `created_by_league` and `sport`.

- [ ] **Step 5: Verify**

Run:

```bash
npx vitest run tests/domain/playerFields.test.ts
npx expo export --platform ios --output-dir /tmp/franchise-phase1-players
```

Expected: PASS and successful export.

- [ ] **Step 6: Commit**

```bash
git add domain/sports/playerFields.ts app/screens/roster.tsx app/screens/trade-channel.tsx app/screens/create-player.tsx app/screens/pending-players.tsx tests/domain/playerFields.test.ts
git commit -m "fix: use sport-specific player fields"
```

### Task 5: Centralize Sport-Aware Trade Validation

**Files:**
- Create: `domain/finance/validateTrade.ts`
- Create: `functions/domain/validateTrade.js`
- Modify: `app/screens/trade-room.tsx`
- Modify: `app/screens/cpu-trade-requests.tsx`
- Modify: `app/screens/league-settings.tsx`
- Test: `tests/domain/validateTrade.test.ts`

- [ ] **Step 1: Write failing validation tests**

```ts
import { expect, it } from 'vitest';
import { validateTrade } from '@/domain/finance/validateTrade';

const team = (players: number, payroll: number) => ({ players: Array.from({ length: players }, (_, i) => ({ player_id: String(i), salary: payroll / players })), picks: [] });

it('does not apply NBA matching to MLB', () => {
  const result = validateTrade({ sport: 'mlb', teamA: team(39, 100), teamB: team(39, 100), offerA: [{ player_id: '0', salary: 1 }], offerB: [{ player_id: '0', salary: 20 }], teamABudget: 150, teamBBudget: 150 });
  expect(result.valid).toBe(true);
});

it('rejects an NFL roster above 53', () => {
  const result = validateTrade({ sport: 'madden', teamA: team(53, 100), teamB: team(53, 100), offerA: [], offerB: [{ player_id: '0', salary: 1 }], teamACap: 200, teamBCap: 200 });
  expect(result.errors).toContain('roster_limit');
});
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/domain/validateTrade.test.ts`

Expected: FAIL because the validator is missing.

- [ ] **Step 3: Implement one validator**

Return:

```ts
type TradeValidation = {
  valid: boolean;
  errors: Array<'ownership' | 'roster_limit' | 'financial_limit' | 'nba_matching'>;
  payrollAfter: { teamA: number; teamB: number };
  rosterAfter: { teamA: number; teamB: number };
};
```

NBA applies current matching logic. NFL applies 53-player and hard-cap checks. MLB applies 40-player and team-budget checks. Commissioner override can remove only `financial_limit` and `nba_matching`.

- [ ] **Step 4: Use the validator in every execution path**

Move final instant/veto/vote trade execution into a callable `finalizeTrade`. Re-run ownership and `validateTrade` inside the server transaction. CPU approvals invoke the same callable.

- [ ] **Step 5: Replace trade images**

Pass `sport` into `PlayerHeadshot` from Trade Center and Trade Room. Remove direct Basketball Reference URL construction.

- [ ] **Step 6: Verify**

Run:

```bash
npx vitest run tests/domain/validateTrade.test.ts
node --check functions/index.js
npx expo export --platform ios --output-dir /tmp/franchise-phase1-trades
```

Expected: all commands succeed.

- [ ] **Step 7: Commit**

```bash
git add domain/finance functions app/screens/trade-room.tsx app/screens/cpu-trade-requests.tsx app/screens/league-settings.tsx tests/domain/validateTrade.test.ts
git commit -m "fix: validate trades by sport"
```

### Task 6: Apply Sport-Aware Channel Presentation

**Files:**
- Create: `components/channel/SportBackground.tsx`
- Modify: `app/screens/channels.tsx`
- Modify: `app/screens/channel.tsx`
- Test: `tests/domain/channelTheme.test.ts`

- [ ] **Step 1: Write a failing theme test**

```ts
import { expect, it } from 'vitest';
import { getChannelTheme } from '@/domain/sports/rules';

it('maps each sport to its field presentation', () => {
  expect(getChannelTheme('nba')).toBe('court');
  expect(getChannelTheme('madden')).toBe('field');
  expect(getChannelTheme('mlb')).toBe('diamond');
});
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/domain/channelTheme.test.ts`

- [ ] **Step 3: Add the helper and component**

`SportBackground` receives `sport` and renders the existing court, a football field, a baseball diamond, or a neutral loading background. It uses React Native views and gradients, with no network dependency.

- [ ] **Step 4: Pass authoritative sport into every channel route**

Include `sport` in `channels.tsx` navigation parameters and verify it against the league document in `channel.tsx`.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npx vitest run tests/domain/channelTheme.test.ts
npx expo export --platform ios --output-dir /tmp/franchise-phase1-chat
```

Commit:

```bash
git add components/channel app/screens/channels.tsx app/screens/channel.tsx domain/sports tests/domain/channelTheme.test.ts
git commit -m "feat: theme channels by sport"
```

---

## Phase 2: Shared Offseason Engine

### Task 7: Implement the Versioned Offseason State Machine

**Files:**
- Create: `domain/offseason/types.ts`
- Create: `domain/offseason/stateMachine.ts`
- Create: `functions/franchise/offseason.js`
- Modify: `functions/index.js`
- Create: `app/screens/offseason/index.tsx`
- Test: `tests/domain/offseasonState.test.ts`
- Test: `tests/functions/offseasonTransitions.test.ts`

- [ ] **Step 1: Write failing transition tests**

```ts
import { expect, it } from 'vitest';
import { nextOffseasonStage } from '@/domain/offseason/stateMachine';

it('uses MLB/NFL stage order and skips NBA-only expansion', () => {
  expect(nextOffseasonStage('madden', 'season_end', false)).toBe('re_signing');
  expect(nextOffseasonStage('mlb', 'live_draft', false)).toBe('roster_cuts');
});
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/domain/offseasonState.test.ts`

- [ ] **Step 3: Implement typed stages**

Persist:

```ts
type OffseasonState = {
  stage: OffseasonStage;
  seasonYear: number;
  stageStartedAt: unknown;
  completedTeamIds: string[];
  draftTimerSeconds: number;
  draftStatus: 'none' | 'review' | 'published' | 'live' | 'complete';
  version: number;
};
```

- [ ] **Step 4: Add callable `advanceOffseasonStage`**

The callable checks commissioner authorization, expected stage, unresolved claimed teams, and current version in one transaction. It increments `version` exactly once.

- [ ] **Step 5: Verify emulator behavior**

Run:

```bash
firebase emulators:exec --only firestore,functions "npm run test:functions -- offseasonTransitions"
```

Expected: simultaneous advances yield one success and one conflict.

- [ ] **Step 6: Commit**

```bash
git add domain/offseason functions app/screens/offseason tests
git commit -m "feat: add versioned offseason state machine"
```

### Task 8: Build Contract Offers, Free Agency, and CPU Decisions

**Files:**
- Create: `domain/offseason/contracts.ts`
- Create: `domain/offseason/cpu.ts`
- Create: `functions/franchise/contracts.js`
- Create: `app/screens/offseason/re-signing.tsx`
- Create: `app/screens/offseason/free-agency.tsx`
- Test: `tests/domain/contracts.test.ts`
- Test: `tests/domain/cpuDecisions.test.ts`

- [ ] **Step 1: Write failing deterministic scoring tests**

```ts
import { expect, it } from 'vitest';
import { scoreContractOffer } from '@/domain/offseason/contracts';

it('produces a stable preference score', () => {
  const input = { salary: 20_000_000, years: 4, role: 'starter', contender: 0.8, need: 0.9, loyalty: 0.5, seed: 'player-team-2027' };
  expect(scoreContractOffer(input)).toBe(scoreContractOffer(input));
});
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/domain/contracts.test.ts`

- [ ] **Step 3: Implement offer scoring and sport finance checks**

Use salary, years, role, contender status, need, loyalty, reputation, and seeded variance. NFL rejects offers above hard cap. MLB rejects offers above team budget. NBA uses cap exceptions defined in Phase 4.

- [ ] **Step 4: Implement CPU actions**

CPU teams retain valuable young starters, bid only for needs, avoid duplicate offers, and remain roster/finance compliant. Every decision ID is derived from league, season, stage, team, and player.

- [ ] **Step 5: Add callable round resolution**

`resolveFreeAgencyRound` validates the stage, resolves each player once, signs the best valid offer, releases losing offers, and records the stored preference score.

- [ ] **Step 6: Verify and commit**

Run: `npx vitest run tests/domain/contracts.test.ts tests/domain/cpuDecisions.test.ts`

Commit:

```bash
git add domain/offseason functions/franchise app/screens/offseason tests/domain
git commit -m "feat: add sport-aware contracts and free agency"
```

### Task 9: Generate and Edit Sport-Specific Draft Classes

**Files:**
- Create: `domain/draft/random.ts`
- Create: `domain/draft/generateClass.ts`
- Create: `functions/franchise/draftClass.js`
- Create: `app/screens/offseason/draft-class.tsx`
- Test: `tests/domain/draftClass.test.ts`

- [ ] **Step 1: Write failing seeded-generation tests**

```ts
import { expect, it } from 'vitest';
import { generateDraftClass } from '@/domain/draft/generateClass';

it('generates stable class sizes', () => {
  expect(generateDraftClass({ sport: 'madden', teams: 32, seed: 'x' })).toHaveLength(224);
  expect(generateDraftClass({ sport: 'mlb', teams: 30, seed: 'x' })).toHaveLength(150);
  expect(generateDraftClass({ sport: 'madden', teams: 32, seed: 'x' })).toEqual(generateDraftClass({ sport: 'madden', teams: 32, seed: 'x' }));
});
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/domain/draftClass.test.ts`

- [ ] **Step 3: Implement seeded prospect templates**

NFL prospects include physical profile, position, archetype, projected round, ratings, development trait, and summary. MLB prospects include handedness, position, archetype, projected round, ratings, potential, and summary.

- [ ] **Step 4: Add commissioner editing and publication**

Callables permit add/edit/remove/regenerate only in `draft_class_review`. `publishDraftClass` locks the class and rejects later mutation.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run tests/domain/draftClass.test.ts`

Commit:

```bash
git add domain/draft functions/franchise/draftClass.js app/screens/offseason/draft-class.tsx tests/domain/draftClass.test.ts
git commit -m "feat: generate editable sport draft classes"
```

### Task 10: Implement the Live Draft and Auto-Pick

**Files:**
- Create: `domain/draft/autoPick.ts`
- Create: `functions/franchise/liveDraft.js`
- Create: `app/screens/offseason/live-draft.tsx`
- Test: `tests/domain/autoPick.test.ts`
- Test: `tests/functions/liveDraft.test.ts`

- [ ] **Step 1: Write failing auto-pick tests**

```ts
import { expect, it } from 'vitest';
import { chooseAutoPick } from '@/domain/draft/autoPick';

it('balances talent and positional need', () => {
  const pick = chooseAutoPick({
    sport: 'madden',
    needs: { QB: 1, WR: 0.2 },
    prospects: [
      { id: 'qb', position: 'QB', talent: 82 },
      { id: 'wr', position: 'WR', talent: 84 },
    ],
  });
  expect(pick.id).toBe('qb');
});
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/domain/autoPick.test.ts`

- [ ] **Step 3: Implement server-deadline drafting**

Persist current overall pick, team ID, round, deadline, selected IDs, and version. `makeDraftPick` transactionally verifies the clock, ownership, prospect availability, and pick number.

- [ ] **Step 4: Add timed and commissioner auto-pick**

`autoPickDraftSelection` can run after the deadline or immediately for a commissioner. Vacant teams always auto-pick.

- [ ] **Step 5: Verify concurrency**

Run:

```bash
firebase emulators:exec --only firestore,functions "npm run test:functions -- liveDraft"
```

Expected: two simultaneous selections produce one recorded pick.

- [ ] **Step 6: Commit**

```bash
git add domain/draft functions/franchise/liveDraft.js app/screens/offseason/live-draft.tsx tests
git commit -m "feat: add transactional live drafts"
```

### Task 11: Add Roster Cuts and MLB/NFL Season Advancement

**Files:**
- Create: `domain/offseason/rosterCuts.ts`
- Create: `functions/franchise/newSeason.js`
- Create: `app/screens/offseason/roster-cuts.tsx`
- Replace: `app/screens/advance-season.tsx`
- Test: `tests/domain/rosterCuts.test.ts`
- Test: `tests/functions/newSeason.test.ts`

- [ ] **Step 1: Write failing compliance tests**

```ts
import { expect, it } from 'vitest';
import { rosterCompliance } from '@/domain/offseason/rosterCuts';

it('enforces NFL and MLB limits', () => {
  expect(rosterCompliance('madden', { standard: 54, payroll: 100, limit: 200 }).valid).toBe(false);
  expect(rosterCompliance('mlb', { standard: 40, payroll: 151, limit: 150 }).errors).toContain('financial_limit');
});
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/domain/rosterCuts.test.ts`

- [ ] **Step 3: Implement cuts and CPU completion**

Automatic cuts preserve positional minimums and remove the lowest-value surplus players until roster and finance rules pass.

- [ ] **Step 4: Implement sport-aware new season**

NFL and MLB increment numeric season labels, age players, advance contracts, retire eligible players, clear offseason state, and never call NBA era or draft-class logic.

- [ ] **Step 5: Replace the old screen with an offseason router**

NBA historical leagues may enter the NBA flow. MLB/NFL route to the current offseason stage.

- [ ] **Step 6: Verify and commit**

Run:

```bash
npx vitest run tests/domain/rosterCuts.test.ts
firebase emulators:exec --only firestore,functions "npm run test:functions -- newSeason"
npx expo export --platform ios --output-dir /tmp/franchise-phase2
```

Commit:

```bash
git add domain/offseason functions/franchise app/screens/offseason app/screens/advance-season.tsx tests
git commit -m "feat: complete MLB and NFL offseasons"
```

---

## Phase 3: NBA Season Engine

### Task 12: Implement the Player Identity Model

**Files:**
- Create: `domain/nba/identity.ts`
- Create: `domain/nba/reputation.ts`
- Modify: `components/PlayerCard.tsx`
- Modify: `app/screens/create-player.tsx`
- Test: `tests/domain/nbaIdentity.test.ts`

- [ ] **Step 1: Write failing grade tests**

```ts
import { expect, it } from 'vitest';
import { gradeFromHiddenValue, buildVisibleIdentity } from '@/domain/nba/identity';

it('maps hidden values to exact grades without exposing overall', () => {
  expect(gradeFromHiddenValue(91)).toBe('A');
  const identity = buildVisibleIdentity({ shooting: 91, playmaking: 78, defense: 65 });
  expect(identity).not.toHaveProperty('overall');
  expect(identity.grades.shooting).toBe('A');
});
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/domain/nbaIdentity.test.ts`

- [ ] **Step 3: Implement hidden values and visible identity**

Use A+ through F grades, primary/secondary roles, strengths, weaknesses, consistency, chemistry, reputation, and development trait. Hidden numeric values never render or enter client-editable documents.

- [ ] **Step 4: Update player UI**

Player cards display grades, roles, reputation, strengths, and weaknesses. Remove any future OVR field from NBA custom-player creation.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run tests/domain/nbaIdentity.test.ts`

Commit:

```bash
git add domain/nba components/PlayerCard.tsx app/screens/create-player.tsx tests/domain/nbaIdentity.test.ts
git commit -m "feat: add NBA player identity model"
```

### Task 13: Add Rotations and Saved Coaching Presets

**Files:**
- Create: `domain/nba/rotation.ts`
- Create: `domain/nba/coaching.ts`
- Create: `app/screens/season/rotation.tsx`
- Create: `app/screens/season/coaching-presets.tsx`
- Test: `tests/domain/rotation.test.ts`
- Test: `tests/domain/coaching.test.ts`

- [ ] **Step 1: Write failing rotation tests**

```ts
import { expect, it } from 'vitest';
import { validateRotation } from '@/domain/nba/rotation';

it('requires exactly 240 active minutes', () => {
  expect(validateRotation([{ playerId: 'a', minutes: 48 }]).valid).toBe(false);
  expect(validateRotation(Array.from({ length: 10 }, (_, i) => ({ playerId: String(i), minutes: 24 }))).valid).toBe(true);
});
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/domain/rotation.test.ts`

- [ ] **Step 3: Implement legal rotations and CPU fallback**

Support starters, bench order, roles, inactive/rest status, closing lineup, and exactly 240 minutes. CPU fallback fills incomplete rotations.

- [ ] **Step 4: Implement named coaching presets**

Model the approved offensive and defensive styles as explicit modifiers for pace, shot profile, turnovers, fouls, rebounding, fatigue, and matchup counters.

- [ ] **Step 5: Build save/select screens**

Persist multiple named presets per team. Store a default preset ID. Matchup preparation copies a preset snapshot so later edits do not change an in-progress game.

- [ ] **Step 6: Verify and commit**

Run: `npx vitest run tests/domain/rotation.test.ts tests/domain/coaching.test.ts`

Commit:

```bash
git add domain/nba app/screens/season tests/domain
git commit -m "feat: add NBA rotations and coaching presets"
```

### Task 14: Generate NBA Schedules

**Files:**
- Create: `domain/nba/schedule.ts`
- Create: `functions/franchise/schedule.js`
- Create: `app/screens/season/calendar.tsx`
- Modify: `app/screens/league-settings.tsx`
- Test: `tests/domain/schedule.test.ts`

- [ ] **Step 1: Write failing schedule tests**

```ts
import { expect, it } from 'vitest';
import { generateSchedule } from '@/domain/nba/schedule';

for (const games of [14, 29, 58, 82]) {
  it(`creates ${games} games per team`, () => {
    const teams = Array.from({ length: 30 }, (_, i) => `t${i}`);
    const schedule = generateSchedule({ teams, gamesPerTeam: games, seed: `s-${games}` });
    for (const team of teams) {
      expect(schedule.filter(g => g.homeTeamId === team || g.awayTeamId === team)).toHaveLength(games);
    }
  });
}
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/domain/schedule.test.ts`

- [ ] **Step 3: Implement balanced deterministic scheduling**

Support 30 through 36 teams and all four approved season lengths. Balance opponents and home/away assignments. Store immutable scheduled game IDs.

- [ ] **Step 4: Add callable schedule creation and calendar UI**

Only commissioners create/lock a schedule. GMs can view and select any unplayed game involving their team.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run tests/domain/schedule.test.ts`

Commit:

```bash
git add domain/nba/schedule.ts functions/franchise/schedule.js app/screens/season/calendar.tsx app/screens/league-settings.tsx tests/domain/schedule.test.ts
git commit -m "feat: generate configurable NBA schedules"
```

### Task 15: Implement Matchup Requests and Server Deadlines

**Files:**
- Create: `functions/franchise/matchups.js`
- Create: `app/screens/season/matchup.tsx`
- Modify: `functions/index.js`
- Test: `tests/functions/matchups.test.ts`

- [ ] **Step 1: Write emulator tests**

```ts
it('expires an unaccepted request after one hour', async () => {
  const request = await seedRequestedGame({ requestedAtMs: 0 });
  const result = await expireMatchupRequest({ gameId: request.gameId, nowMs: 3_600_001 });
  expect(result.status).toBe('expired');
});

it('prevents duplicate active requests', async () => {
  const game = await seedAvailableGame();
  await requestMatchup({ gameId: game.id, uid: game.homeGmId });
  await expect(requestMatchup({ gameId: game.id, uid: game.awayGmId })).rejects.toMatchObject({ code: 'already-exists' });
});

it('starts five-minute preparation after acceptance', async () => {
  const request = await seedRequestedGame({ requestedAtMs: 1_000 });
  const result = await acceptMatchup({ gameId: request.gameId, uid: request.awayGmId, nowMs: 2_000 });
  expect(result).toMatchObject({ status: 'preparing', preparationDeadlineMs: 302_000 });
});

it('permits immediate simulation by either participating GM', async () => {
  const game = await seedAvailableGame();
  const result = await simulateScheduledGame({ gameId: game.id, uid: game.homeGmId });
  expect(result.status).toBe('simulating');
});

it('permits immediate CPU matchup simulation', async () => {
  const game = await seedCpuOpponentGame();
  const result = await simulateScheduledGame({ gameId: game.id, uid: game.humanGmId });
  expect(result.status).toBe('simulating');
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
firebase emulators:exec --only firestore,functions "npm run test:functions -- matchups"
```

- [ ] **Step 3: Implement callables**

Add `requestMatchup`, `acceptMatchup`, `simulateScheduledGame`, and `expireMatchupRequest`. Use server timestamps for the one-hour request and five-minute preparation deadlines.

- [ ] **Step 4: Build preparation UI**

Allow each GM to select a saved preset and make private changes. Do not read the opponent's active selection.

- [ ] **Step 5: Verify and commit**

Run the emulator tests and an iOS export.

```bash
git add functions/franchise/matchups.js functions/index.js app/screens/season/matchup.tsx tests/functions/matchups.test.ts
git commit -m "feat: add asynchronous matchup requests"
```

### Task 16: Build Full Box-Score Simulation

**Files:**
- Create: `domain/nba/simulateGame.ts`
- Create: `domain/nba/boxScore.ts`
- Create: `functions/franchise/simulate.js`
- Create: `app/screens/season/game-result.tsx`
- Test: `tests/domain/simulateGame.test.ts`

- [ ] **Step 1: Write failing deterministic simulation tests**

```ts
import { expect, it } from 'vitest';
import { simulateGame } from '@/domain/nba/simulateGame';

it('returns a stable legal full box score', () => {
  const a = simulateGame(fixture, 'game-seed');
  const b = simulateGame(fixture, 'game-seed');
  expect(a).toEqual(b);
  expect(a.home.players.reduce((n, p) => n + p.minutes, 0)).toBe(240);
  expect(a.home.points).toBe(a.home.players.reduce((n, p) => n + p.points, 0));
  expect(a.home.points).not.toBe(a.away.points);
});
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/domain/simulateGame.test.ts`

- [ ] **Step 3: Implement possession-based simulation**

Use identity values, rotation, coaching, chemistry, matchup, fatigue, injuries, home court, and moderate seeded variance. Produce quarter scores, full player/team statistics, shot zones, lineup usage, tendencies, and game story.

- [ ] **Step 4: Enforce the 15-minute result window**

At preparation expiry, persist a deterministic seed and `resultDueAt`. A scheduled function or opportunistic callable finalizes by that deadline.

- [ ] **Step 5: Build the result screen**

Display score, quarter breakdown, team totals, player box scores, injuries, coaching styles used, and game story.

- [ ] **Step 6: Verify and commit**

Run: `npx vitest run tests/domain/simulateGame.test.ts`

Commit:

```bash
git add domain/nba functions/franchise/simulate.js app/screens/season/game-result.tsx tests/domain/simulateGame.test.ts
git commit -m "feat: simulate full NBA box scores"
```

### Task 17: Finalize Games, Standings, Fatigue, and Injuries Atomically

**Files:**
- Create: `domain/nba/injuries.ts`
- Create: `functions/franchise/finalizeGame.js`
- Create: `app/screens/season/standings.tsx`
- Test: `tests/domain/injuries.test.ts`
- Test: `tests/functions/finalizeGame.test.ts`

- [ ] **Step 1: Write injury-cap tests**

```ts
import { expect, it } from 'vitest';
import { generateInjuryEvent } from '@/domain/nba/injuries';

it('caps minor events and missed games', () => {
  expect(generateInjuryEvent({ minorCount: 6, severeCount: 0, seed: 'x' })).toBeNull();
});

it('never exceeds 15 missed games', () => {
  const event = generateInjuryEvent({ minorCount: 0, severeCount: 0, seed: 'severe-seed', force: 'severe' });
  expect(event!.gamesRemaining).toBeLessThanOrEqual(15);
});
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/domain/injuries.test.ts`

- [ ] **Step 3: Implement mild completion-order fatigue and injury generation**

Minor injuries average one to two missed games and cap at six per team-season. Severe events are rare and cap at 15 missed games.

- [ ] **Step 4: Implement `finalizeGame`**

In one server transaction:

- Verify completion marker is unused.
- Lock both teams' fatigue sequence.
- Write result.
- Update standings and head-to-head.
- Increment player season totals.
- Apply fatigue and injuries.
- Mark scheduled game completed.
- Record coaching style history.

- [ ] **Step 5: Verify concurrency**

Run:

```bash
firebase emulators:exec --only firestore,functions "npm run test:functions -- finalizeGame"
```

Expected: duplicate finalization and same-team concurrent sequence tests pass.

- [ ] **Step 6: Commit**

```bash
git add domain/nba/injuries.ts functions/franchise/finalizeGame.js app/screens/season/standings.tsx tests
git commit -m "feat: finalize NBA games atomically"
```

### Task 18: Add Playoffs and Historical Scouting

**Files:**
- Create: `domain/nba/playoffs.ts`
- Create: `app/screens/season/playoffs.tsx`
- Create: `app/screens/season/scouting.tsx`
- Modify: `functions/franchise/schedule.js`
- Test: `tests/domain/playoffs.test.ts`

- [ ] **Step 1: Write failing bracket tests**

Test traditional 16, Play-In plus 16, and shortened 8-team formats with deterministic seeding and series advancement.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/domain/playoffs.test.ts`

- [ ] **Step 3: Implement brackets**

Lock playoff format at start. Generate scheduled playoff games that use the same matchup and result pipeline.

- [ ] **Step 4: Implement scouting**

Show only historical coaching styles and player game statistics, including minutes, starters, bench usage, and head-to-head history. Never expose the active preset.

- [ ] **Step 5: Verify and commit**

```bash
npx vitest run tests/domain/playoffs.test.ts
npx expo export --platform ios --output-dir /tmp/franchise-phase3
git add domain/nba/playoffs.ts app/screens/season functions/franchise/schedule.js tests/domain/playoffs.test.ts
git commit -m "feat: add NBA playoffs and scouting"
```

---

## Phase 4: NBA Future Offseason and Expansion

### Task 19: Implement NBA Progression, Reputation, and Cap Growth

**Files:**
- Create: `domain/nba/progression.ts`
- Modify: `domain/nba/reputation.ts`
- Create: `domain/nba/cap.ts`
- Test: `tests/domain/progression.test.ts`
- Test: `tests/domain/capGrowth.test.ts`

- [ ] **Step 1: Write failing progression and cap tests**

```ts
import { expect, it } from 'vitest';
import { nextSalaryCap } from '@/domain/nba/cap';
import { progressPlayer } from '@/domain/nba/progression';

it('grows the cap five percent by default', () => {
  expect(nextSalaryCap(154_647_000, 0.05)).toBe(162_379_350);
});

it('keeps annual grade movement controlled', () => {
  const next = progressPlayer(playerFixture, seasonFixture, 'seed');
  expect(Math.abs(next.hidden.shooting - playerFixture.hidden.shooting)).toBeLessThanOrEqual(8);
});
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/domain/progression.test.ts tests/domain/capGrowth.test.ts`

- [ ] **Step 3: Implement gradual development**

Use age, trait, role, minutes, production, efficiency, fit, consistency, injuries, workload, awards, and playoffs. Recalculate visible grades after hidden-value updates.

- [ ] **Step 4: Implement cap history**

Apply commissioner-configured growth, default 5%, when entering the new season. Record each year's cap and derived minimum/rookie values.

- [ ] **Step 5: Verify and commit**

```bash
npx vitest run tests/domain/progression.test.ts tests/domain/capGrowth.test.ts
git add domain/nba tests/domain
git commit -m "feat: progress NBA players and salary cap"
```

### Task 20: Extend Contracts, Future Drafts, and 15+3 Compliance to NBA

**Files:**
- Modify: `domain/offseason/contracts.ts`
- Modify: `domain/draft/generateClass.ts`
- Modify: `domain/offseason/rosterCuts.ts`
- Modify: `app/screens/offseason/*.tsx`
- Test: `tests/domain/nbaOffseason.test.ts`

- [ ] **Step 1: Write failing NBA offseason tests**

Cover NBA offer preferences, two-round class size, rookie contracts, 15 standard contracts, and 3 two-way slots.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/domain/nbaOffseason.test.ts`

- [ ] **Step 3: Add NBA-specific behavior**

NBA offers use salary, years, role, contender, fit, reputation, minutes, and loyalty. Future draft classes use the Player Identity Model. Roster compliance distinguishes standard and two-way contracts.

- [ ] **Step 4: Remove the 2025 progression stop**

Delete `FINAL_YEAR`. Route every post-season NBA league into the versioned offseason state machine. Historical era transitions end at modern NBA, after which cap growth and generated classes continue indefinitely.

- [ ] **Step 5: Verify and commit**

```bash
npx vitest run tests/domain/nbaOffseason.test.ts
npx expo export --platform ios --output-dir /tmp/franchise-phase4-offseason
git add domain app/screens/offseason app/screens/advance-season.tsx tests/domain/nbaOffseason.test.ts
git commit -m "feat: support indefinite NBA offseasons"
```

### Task 21: Add Optional Expansion Through 36 Teams

**Files:**
- Create: `domain/nba/expansion.ts`
- Create: `functions/franchise/expansion.js`
- Create: `app/screens/offseason/expansion.tsx`
- Modify: `domain/nba/schedule.ts`
- Modify: `domain/draft/generateClass.ts`
- Test: `tests/domain/expansion.test.ts`
- Test: `tests/functions/expansionDraft.test.ts`

- [ ] **Step 1: Write failing expansion tests**

```ts
import { expect, it } from 'vitest';
import { validateExpansionProposal } from '@/domain/nba/expansion';

it('allows optional expansion but caps the league at 36', () => {
  expect(validateExpansionProposal({ currentTeams: 30, addedTeams: 2 }).valid).toBe(true);
  expect(validateExpansionProposal({ currentTeams: 36, addedTeams: 1 }).valid).toBe(false);
});
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/domain/expansion.test.ts`

- [ ] **Step 3: Implement proposals and custom identities**

Store city, name, abbreviation, colors, logo, conference, division, and expansion season. Reject expansion after the target season schedule is locked.

- [ ] **Step 4: Implement expansion draft**

Existing GMs submit protected players. CPU completes missing lists. Expansion teams draft unprotected players transactionally while respecting contracts and roster limits.

- [ ] **Step 5: Update schedule and draft class sizes**

Both use the current team count from 30 through 36.

- [ ] **Step 6: Verify and commit**

```bash
npx vitest run tests/domain/expansion.test.ts
firebase emulators:exec --only firestore,functions "npm run test:functions -- expansionDraft"
git add domain/nba functions/franchise/expansion.js app/screens/offseason/expansion.tsx tests
git commit -m "feat: add optional NBA expansion"
```

### Task 22: Add Player Upgrade Points

**Files:**
- Create: `domain/nba/upgradePoints.ts`
- Create: `functions/franchise/playerUpgrades.js`
- Create: `app/screens/season/player-upgrades.tsx`
- Test: `tests/domain/upgradePoints.test.ts`
- Test: `tests/functions/playerUpgrades.test.ts`

- [ ] **Step 1: Write failing upgrade balance tests**

Test award point grants, lottery boost grants, one-grade-per-point movement, Star/Superstar/Legend seasonal limits, and the Superstar/Legend-only `A+` to `S` upgrade.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/domain/upgradePoints.test.ts`

- [ ] **Step 3: Implement grade-step upgrades**

Use `F -> D -> C- -> C -> C+ -> B- -> B -> B+ -> A- -> A -> A+ -> S`. `S` is allowed only for Superstar and Legend players. Star, Superstar, and Legend players can receive one upgrade per season; lower labels can receive multiple upgrades.

- [ ] **Step 4: Implement award and lottery point grants**

Championships, runner-up finishes, MVP-level awards, and other accolades grant team upgrade points. Bottom-five teams in each conference receive lottery boost points.

- [ ] **Step 5: Implement upgrade spending**

Commissioners and eligible GMs can spend available team upgrade points in a controlled offseason/player-development window.

- [ ] **Step 6: Verify and commit**

```bash
npx vitest run tests/domain/upgradePoints.test.ts
firebase emulators:exec --only firestore,functions "npm run test:functions -- playerUpgrades"
git add domain/nba/upgradePoints.ts functions/franchise/playerUpgrades.js app/screens/season/player-upgrades.tsx tests
git commit -m "feat: add NBA player upgrade points"
```

### Task 23: Complete Navigation, Notifications, and Production Verification

**Files:**
- Modify: `app/_layout.tsx`
- Modify: `app/screens/league.tsx`
- Modify: `app/screens/notifications.tsx`
- Modify: `functions/index.js`
- Modify: `firebase.json`
- Create: `firestore.indexes.json`
- Create: `docs/FRANCHISE_ENGINE_QA.md`

- [ ] **Step 1: Register all new routes and deep links**

Add offseason, calendar, matchup, standings, playoffs, scouting, rotation, coaching, and result screens. League home shows the correct season or offseason action.

- [ ] **Step 2: Add notification routing**

Map matchup, simulation, injury, draft, contract, free-agent, expansion, and roster-compliance notifications to their screens. Preserve push deduplication.

- [ ] **Step 3: Version required indexes**

Add indexes for scheduled-game status/team queries, active matchup deadlines, standings, draft order, free-agent offers, and offseason stage actions.

- [ ] **Step 4: Run the complete verification suite**

Run:

```bash
npm test
node --check functions/index.js
git diff --check
npx expo export --platform ios --output-dir /tmp/franchise-final-ios
npx expo export --platform android --output-dir /tmp/franchise-final-android
firebase emulators:exec --only firestore,functions "npm run test:functions"
```

Expected: zero test failures, valid functions syntax, clean diff, successful iOS/Android exports, and successful emulator tests.

- [ ] **Step 5: Execute the QA matrix**

Record passes in `docs/FRANCHISE_ENGINE_QA.md` for:

- 32nd NFL GM joins and claims a team.
- MLB/NFL contain no NBA fields or trade matching.
- Full MLB and NFL offseason.
- NBA 14/29/58/82-game schedule creation.
- Request expiration, acceptance, preparation, immediate simulation, CPU simulation, and full result.
- Out-of-order games with correct standings and fatigue.
- Injury caps.
- Every playoff format.
- NBA offseason into 2026-27 and another generated year.
- Expansion from 30 to 32 and schedule regeneration.

- [ ] **Step 6: Commit**

```bash
git add app functions firebase.json firestore.indexes.json docs/FRANCHISE_ENGINE_QA.md
git commit -m "feat: complete multisport franchise engine"
```

## Deployment Order

1. Deploy Firestore indexes and functions to a staging Firebase project.
2. Run the QA matrix against staging.
3. Publish an internal EAS update.
4. Test on physical iOS and Android devices.
5. Deploy functions and indexes to `association-social`.
6. Publish the production EAS update.
7. Monitor function errors, duplicate finalization attempts, and notification delivery for 48 hours.

## Rollback Boundaries

- Each phase has independent commits and callable names.
- New league fields are additive.
- Existing leagues use read-time defaults.
- Old screens remain routable until their replacement phase passes QA.
- Timed operations use version fields, allowing disabled callables without corrupting persisted state.
