# NBA Free Agency Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first NBA-only free agency engine pass with player preference scoring, mobile-friendly offer flow, notifications, and contract records on signed players.

**Architecture:** Keep the existing callable flow, but enrich the shared contract domain and server contract resolver. The mobile screen remains one reusable component for re-signing and free agency, with segmented views and offer previews.

**Tech Stack:** Expo Router, React Native, Firebase Firestore, Firebase Functions v2, Vitest, TypeScript.

---

### Task 1: Contract Decision Model

**Files:**
- Modify: `domain/offseason/contracts.ts`
- Modify: `functions/franchise/contracts.js`
- Test: `tests/domain/contracts.test.ts`
- Test: `tests/functions/contracts.test.ts`

- [ ] Add player preference types and score breakdown helpers to `domain/offseason/contracts.ts`.
- [ ] Infer preference weights from existing salary, contract years, team longevity, career stage, tier/label, and team movement history.
- [ ] Add era salary baseline helpers so 2011 salaries are compared against 2011 player salaries, not modern money.
- [ ] Mirror the same scoring logic in `functions/franchise/contracts.js`.
- [ ] Tests prove a money-first player picks a larger salary and a winning-first veteran can prefer a contender.

### Task 2: Contract Records

**Files:**
- Modify: `functions/franchise/contracts.js`
- Test: `tests/functions/contracts.test.ts`

- [ ] Extend `applyContract` so accepted offers write `contract` and append `contractHistory`.
- [ ] Preserve legacy `salary`, `contractYears`, `contractRole`, and `signedSeason`.
- [ ] Tests prove signed players have both current contract and history.

### Task 3: Notifications

**Files:**
- Modify: `functions/index.js`
- Modify: `functions/franchise/contracts.js`
- Test: `tests/functions/contracts.test.ts`

- [ ] Pass `FieldValue` into `submitContractOffer` and `resolveFreeAgencyRound`.
- [ ] Notify commissioners when offers are submitted.
- [ ] Notify GMs when offers resolve.
- [ ] Notify league members when a round resolves.

### Task 4: Mobile Hub

**Files:**
- Modify: `components/offseason/ContractStageScreen.tsx`
- Test: `tests/domain/sourceSafety.test.ts`

- [ ] Redesign the screen around Available, My Offers, and Decisions views.
- [ ] Add compact player cards with preference badges and current contract context.
- [ ] Add offer strength preview in the modal.
- [ ] Keep the layout mobile-first and avoid dense tables.

### Task 5: Verification and Release

**Files:**
- All modified files

- [ ] Run `npm test`.
- [ ] Run `npx tsc --noEmit`.
- [ ] Commit.
- [ ] Deploy functions.
- [ ] Publish Expo update.
