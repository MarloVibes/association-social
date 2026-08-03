# Franchise Mobile Current Task List

Last updated: 2026-07-27

This file is the source of truth for active Franchise Mobile work. When Marlano says "we need to", "add", "fix", "change", "later", "park", or "continue", update this file before or during the work so the task does not disappear in chat history.

## Ground Rules

- Finish Franchise Mobile GM/franchise mode before building Franchise Player mode.
- Franchise Player mode is parked until Franchise Mobile GM mode is finished and parked.
- Deleted/parked Live Mode should not be rebuilt unless Marlano explicitly reopens that work.
- Do not treat old docs as current truth without checking this file first.
- Keep tasks in the order Marlano wants them handled.
- Move completed work into "Completed Recently" with the commit/update when possible.

## Active Order

### 1. Stabilize Current Franchise Mobile GM Mode

Status: Active

- Keep the current app stable after every feature batch.
- Run focused tests for touched systems.
- Push GitHub and publish Expo updates after verified stable batches.
- Do not start Franchise Player implementation during this lane.

### 2. Player Identity, Tiers, Archetypes, And Cards

Status: Active

- Fix roster player-card layout when cards overlap the position filter/sorting chips; cards should sit a little lower under the filters.
- Continue auditing NBA player identities across all eras, not only 2025-26.
- Treat free agents, draft classes, and every era player equally.
- Remove stale broad `Role Player` language from visible NBA player surfaces.
- Fix wrong archetypes and tiers when screenshots or audits reveal them.
- Known examples to protect against:
  - Luka Doncic should not show as a 3-and-D wing.
  - Mikal Bridges should not show as a floor-spacing big.
  - Trade Center and player cards should not show old `Role Player` labels.
- Keep tier, archetype, skill grades, potential, and development outlook separate.
- Shared roster/trade player rows now prefer stored visible NBA identities and build a modern visible fallback instead of leaking old playstyle labels. Completed in current stabilization batch.

### 3. Trade Center Polish And Functionality

Status: Active

- Keep the official front-office board look.
- Confirm player names stay inside cards.
- Keep block feed grouped by team with multiple players visible together.
- Confirm Offer and DM actions work from the block feed.
- Confirm active trade rooms expire after 15 minutes.
- Confirm chat appears only when another GM is present in the trade room.
- Keep CPU trade logic difficult enough to feel realistic when CPU trading is allowed.

### 4. Team Pages And League Operations Pages

Status: Active

- Revamp team/league pages to feel official while keeping the current color scheme.
- Fix overflow issues such as names sitting outside cards.
- Keep Schedule easily accessible under League Rosters on the dashboard/league page.
- Make sure Command Center pages route correctly.

### 5. Command Center Page Order

Status: Active

Current intended order:

1. GM Lounge
2. Trade Center
3. League News
4. Front Office
5. Coaching Room
6. Stats & Standings
7. Player Wire

Required checks:

- Each section should have working routes.
- No duplicate headers.
- No white chat/feed surfaces in dark mode.
- Counts and badges should not overflow.

### 6. GM Lounge And League Chat

Status: Active

- Keep League Chat dark and polished.
- Keep one clean header.
- Preserve chat features:
  - reactions
  - GIFs
  - photos
  - block/report
  - edit/delete
  - mentions
  - commissioner-only posting where applicable
- Keep unread badge behavior:
  - badge appears beside League Chat / GM Lounge entry
  - count resets when the user enters the chat
  - no push notification required
  - badge must not spill outside its button/card

### 7. Gameplay And Gameplan System

Status: Active

- Fix crash when opening League Schedule or pressing Sim Season.
  - Calendar should not run heavy phone-side schedule repair writes on open.
  - Sim Season must require a confirmation action before it starts, then run continuously one game at a time in schedule order.
  - Calendar should stay readable while simming so Marlano can follow the completed games down the schedule.
  - Auto-follow should pause when the user manually scrolls, with Stop always reachable.
  - Follow should reliably re-lock onto the next unfinished game after manual scrolling.
  - During Sim Season, Follow should scroll to the next exact game row, not only the next week section.
  - Follow should use the same scheduled/preparing sequence that the backend sim uses, so it starts where sim progress actually begins.
  - League schedule rows should stay stable before and during sim so Follow does not cause scroll jumps.
  - Follow should move from the server-returned last simulated game id to the next scheduled/preparing game immediately, not wait only for Firestore snapshots.
  - Long full-season sims need list layout recovery so the visible calendar scroll follows hundreds of simulated games down the schedule.
  - During full-season sim, the followed game should stay centered in the visible calendar area instead of pinned near the top. Completed in `35ca341`.
  - League schedule should be paged by week blocks so users do not manually scroll through all 1,230 games. Completed in `a16b483`.
  - One-game sim delay should be faster than the initial slow broadcast pace.
- Season sim final games must have playable box-score result details:
  - new one-game sims write full details to `gameResults`
  - already-final games missing details can be repaired through the Sim Season flow
  - schedule docs remain lightweight to avoid Firestore 1MB failures
  - completed in `2f01080` and `0e6b5e9`
- Correct NBA Cup schedule logic so Cup games that count toward the regular season live in regular schedule/results, with only the Cup Final treated as Cup-only.
- Fix simulation failure when saving/running matchup with quarter gameplans: `INVALID_ARGUMENT: Property array contains an invalid nested entity`.
- Fix Sim Season reliability so large batch sims do not overload Firebase memory or stall mid-season.
- Change Sim Season to process games one by one in week/sequence order if batch writes continue to fail.
- Continue the basketball gameplan system as the current gameplay direction.
- Pregame/quarter choices should feel like coaching, not random buttons.
- Condense choice UI into side-by-side offense/defense selections.
- Use basketball language.
- Current gameplay idea:
  - users choose offense and defense presets
  - good counters create closer games and better outcomes
  - same or neutral choices balance out
  - box scores should reflect choices
  - matchup recap should explain why the game played out that way
- Keep FAQ updated with the gameplan/counter system.
- Marlano still feels something is missing in gameplay during simulation, so continue ideating after the core system is stable.
- Added a first-pass NBA Broadcast GameCast visual panel to final score pages, using team logos, jersey colors, animated players, ball movement, jumbotron, scoring popups, momentum, and top performer-driven highlight text. Pending simulator approval before expanding deeper into gameplay flow.
- Broadcast GameCast now chooses visual highlight types from the actual box score when available, including deep threes, poster finishes, assists, blocks, rebounds, and steals.
- Calendar final scores should appear only once on schedule tiles, and matchup simulation should show normal Simulate for commissioner-accessible games with manual winner as an optional override.

### 8. Stats And Standings

Status: Active

- Under Stats & Standings:
  - Player Stats means team player stats.
  - League Stats means all players in the league.
- Confirm labels and routes match this meaning.
- Confirm standings and player stat screens work after simulated games.
- Fix League Stats so it shows every player across the league, not only players from teams that already have simulated games.
- Fix League Stats so vacant CPU-controlled teams use their trusted era/sport roster pool instead of disappearing from the player table.
- Revamp League Stats into a combined stat table similar to NBA.com, with stat columns lined up in each row instead of showing only one category value.
  - Schedule-derived CPU teams now backfill League Stats when `participants` is sparse. Completed in current stabilization batch.

### 9. Roster Limits, Two-Way Players, And Development League

Status: Active

- NBA roster limit should support 18 players total:
  - 15 standard roster spots
  - 3 two-way/minimum-style extra spots
- The app should clearly explain when extra slots are two-way/minimum slots.
- Development League belongs under Coaching Room, not the upgrade screen.
- Development League behavior:
  - one eligible minimum/two-way player at a time
  - trains for one week
  - raises one selected grade by two levels

### 10. CPU Team Identity And Solo Support

Status: Active

- CPU teams need their own identity when no user is present.
- Users should be able to play solo if they want.
- Commissioner should be able to enable:
  - sim vs CPU when user is not present
  - trade with CPU when user is not present
- CPU trade logic should account for:
  - competing vs rebuilding
  - team needs
  - roster balance
  - fair value
  - not making trades too easy

### 11. NFL And MLB Parity

Status: Active but lower priority than current NBA GM-mode polish

- Keep NFL and MLB franchise flows aligned with NBA where appropriate.
- Remove lingering NBA-only language/functions from MLB/NFL surfaces.
- Respect sport-specific rules and labels.
- Continue auditing NFL/MLB players after NBA identity systems are stable.

### 12. Firebase, Indexes, And Launch Infrastructure

Status: Active as needed

- Keep Firebase functions deployed when backend code changes.
- Keep Expo updates published when app code changes.
- Confirm Firestore indexes are versioned for current features.
- Avoid deleting existing important indexes/overrides by accident.
- Firebase emulator is blocked locally until Java is installed and available on PATH.

### 13. Pitch Security, Demo Access, And IP Protection

Status: Active as needed before investor / publisher demos

- Prepare Franchise Mobile for private pitching to 2K / Take-Two or other partners.
- Protect the app idea, code, data, player rating logic, simulation formulas, and private roadmap before sharing demos.
- Create a pitch-safe demo flow that lets outsiders experience the app without exposing production data, source code, admin tools, Firebase internals, or private docs.
- Isolated Firebase demo environment is now created:
  - project: `association-social-demo`
  - production `association-social` remains the default target
  - demo runtime must be selected explicitly with `EXPO_PUBLIC_FIREBASE_TARGET=demo`
  - demo Firestore is initialized with delete protection and reviewed rules/indexes
  - Email/Password Authentication is enabled
  - EAS demo profile/channel is `pitch-demo`
- Billing decision required before continuing backend setup:
  - Firebase Storage cannot be initialized without upgrading the demo project
  - Cloud Functions deployment is expected to require Blaze billing
  - do not enable billing or deploy these services without explicit founder approval
- After billing approval:
  - initialize Storage and deploy `storage.rules`
  - deploy required Cloud Functions to the demo project
  - seed scrubbed data and controlled pitch accounts
  - publish the first private `pitch-demo` build/update
- Demo seed isolation is implemented:
  - dry runs use the checked-in local current-roster snapshot and do not connect to Firebase
  - write mode accepts only `demo-service-account.json` from `association-social-demo`
  - production and unknown service-account credentials are rejected
  - all 30 teams and 530 players are covered by the current dry run
- Generate the demo-only service-account key after explicit approval to download and store the credential.
- Seed demo leagues with scrubbed / sample data only.
- Use `npm run demo:pitch:seed` for controlled, CPU-filled demo leagues when a separate demo environment is not ready.
- Gate demo access by approved accounts, expiring invites, or private TestFlight / Expo preview links.
- First-pass pitch demo guards are now implemented:
  - `users/{uid}.pitchAccessRole = viewer` makes an account a protected pitch viewer.
  - `leagues/{leagueId}.pitchDemoLocked = true` locks destructive/admin controls for that league.
  - dashboard, league home, command center, league settings, salary tools, game reset UI, `deleteLeague`, and admin game reset now respect pitch protection.
- Remove or hide commissioner/admin controls from demo accounts unless specifically needed for the pitch.
- Add a security review checklist covering Firestore rules, Storage rules, Functions permissions, API keys, service accounts, repo access, env files, and logging.
- Use `npm run security:pitch` before sharing pitch builds; current expected warnings are the local ignored `.env` and `service-account.json`.
- Firestore and Storage rules are now captured from the live Firebase Console and versioned in `firestore.rules` and `storage.rules`.
- Use `docs/FIREBASE_RULES_VERSIONING.md` before reviewing or deploying future rule changes.
- Prepare legal/IP action items for attorney review:
  - founder ownership / assignment cleanup
  - NDA template for smaller private demos
  - copyright registration consideration for code/art/content
  - trademark search / filing consideration for the app name
  - patent / provisional patent discussion if unique gameplay or sim mechanics may qualify
  - trade-secret handling for algorithms, rating formulas, and roadmap docs
- Keep a pitch package that shares product value and demo access without sharing implementation details.

## Parked

### Broadcast / Rive / Live Mode Rebuild

Status: Parked

- Live Mode was deleted/parked.
- Rive broadcast visuals are not active implementation work.
- Do not rebuild this unless Marlano explicitly reopens it.

### Franchise Player / Franchise Mobile League Career Mode

Status: Parked until Franchise Mobile GM mode is finished

- The concept is documented but not active.
- Do not build it yet.
- Future direction includes:
  - created player
  - online tournaments
  - open gym
  - original teams
  - no NBA/NFL/MLB licensing dependency

## Completed Recently

- 2026-07-13: Fixed Sim Season box-score detail storage and repair flow. Firebase Functions deployed, Expo update published.
- 2026-07-13: Fixed season sim follow centering and added week paging for the 1,230-game league calendar.
- 2026-07-13: Fixed League Stats to include CPU/vacant schedule teams from the trusted player pool even when participant records are sparse.
- Deleted old Live Mode page and routes.
- Added Schedule shortcut under League Rosters.
- Reorganized Command Center.
- Restyled GM Lounge dark chat and removed duplicate chat header.
- Added League Chat unread badge and fixed badge overflow.
- Revamped Trade Center board and grouped block feed by team.
- Added quarter gameplan presets.
- Added basketball gameplan counter logic.
- Condensed NBA prep choices.
- Added tier/archetype display and stale NBA tier-label normalization.
- Pushed and published Expo update for stale NBA tier-label fixes.

## Intake Log

- 2026-07-10: Investigating Sim Season trouble; `simScheduleBatch` Firebase logs showed memory-limit crashes while the app was requesting 35 games per batch.
- 2026-07-10: Second Sim Season failure traced to the schedule document growing past Firestore's 1MB document limit as completed games accumulated box scores/game detail. Fix stores full result detail per game and keeps calendar rows lightweight.
- 2026-07-11: User still saw `Season sim stopped INTERNAL` after refresh; switch season sim toward one-game-at-a-time week/sequence processing for maximum reliability.

Add new tasks here first, then move them into the ordered sections above.

- 2026-07-10: Created this real task list because chat-only tracking became unreliable.
- 2026-07-10: Add roster screen layout fix for player cards overlapping the position sorting categories and sitting too high.
- 2026-07-10: Fix game simulation failure caused by invalid nested array data in matchup/gameplan writes.
- 2026-07-10: Correct NBA Cup schedule behavior so regular-season Cup games count in the regular schedule while the final stays separate.
