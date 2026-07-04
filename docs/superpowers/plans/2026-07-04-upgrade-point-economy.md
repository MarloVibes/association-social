# Upgrade Point Economy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat upgrade-point reward loop with team development points, player-bound credits, star tokens, and variable upgrade costs.

**Architecture:** Extend the existing upgrade-point domain module first, mirror the rules into the Firebase function module, then update the Upgrade Points screen to show and spend the new balances. Keep existing `upgradePoints` as Team Development Points so old leagues continue working.

**Tech Stack:** Expo Router, React Native, TypeScript, Firebase Functions, Vitest.

---

### Task 1: Domain Economy

**Files:**
- Modify: `domain/nba/upgradePoints.ts`
- Modify: `tests/domain/upgradePoints.test.ts`

- [ ] Write failing tests for variable costs, star-token requirements, award-bound player credits, and rebuild grant values.
- [ ] Implement `upgradeCost`, `creditAppliesToAbility`, `spendUpgradePoint` with team points, star tokens, and player credits.
- [ ] Extend `SeasonUpgradeGrant` with `starTrainingTokens` and `playerCredits`.
- [ ] Run `npm run test:domain -- tests/domain/upgradePoints.test.ts`.

### Task 2: Firebase Function Parity

**Files:**
- Modify: `functions/franchise/playerUpgrades.js`
- Modify: `tests/functions/playerUpgrades.test.ts`

- [ ] Write failing function tests for persisted star tokens and player credits.
- [ ] Mirror the domain economy into `playerUpgrades.js`.
- [ ] Update `spendPlayerUpgrade` to spend team points, star tokens, and player-bound credits atomically.
- [ ] Run `npm run test:functions -- tests/functions/playerUpgrades.test.ts`.

### Task 3: Upgrade Page UI

**Files:**
- Modify: `app/screens/season/player-upgrades.tsx`
- Modify: `tests/domain/sourceSafety.test.ts`

- [ ] Write a source-safety check for Team Development Points, Star Training Tokens, and player-bound credit labels.
- [ ] Update the summary panel and per-grade cost text.
- [ ] Pass player credit and star token balances into the spending helper.
- [ ] Run `npm run test:domain -- tests/domain/sourceSafety.test.ts`.

### Task 4: Final Verification

**Files:**
- Verify all changed files.

- [ ] Run `npm run test:domain`.
- [ ] Run `npm run test:functions`.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `git diff --check`.
