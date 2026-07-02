# Franchise Engine QA

Use this checklist before merging or deploying the franchise-engine branch.

## Local Verification

- [x] Domain tests: `npm run test:domain`
- [x] Functions tests: `npm run test:functions`
- [x] Full test suite: `npm test`
- [x] Type check: `npx tsc --noEmit`
- [x] Lint: `npm run lint` exits 0 with warnings only
- [x] Functions syntax: `node --check functions/index.js`
- [x] Diff hygiene: `git diff --check`
- [x] iOS export: `npx expo export --platform ios --output-dir /tmp/franchise-final-ios`
- [x] Android export: `npx expo export --platform android --output-dir /tmp/franchise-final-android`
- [ ] Firebase emulator suite: blocked locally until Java is installed and available on PATH

## Deploy Verification

- [ ] Functions deploy: `npx firebase-tools deploy --only functions --project association-social`
- [ ] Index deploy: `npx firebase-tools deploy --only firestore:indexes --project association-social`
- [ ] Versioned index coverage includes `players`, `leagues`, `teams`, `preparation`, `draft_sessions`, `contract_offers`, and `trade_rooms`.
- [ ] Deploy prompts do not ask to delete the existing `mvp_players` index or `trade_rooms.status` field override.
- [ ] Firebase Console shows all function updates complete.
- [ ] Firestore rules remain published for league schedules, teams, offseason, draft classes, draft sessions, and preparation docs.

## Simulator QA Matrix

- [ ] NBA schedule creation works for 14, 29, 58, and 82-game seasons.
- [ ] Calendar shows My Team and League views with logo-vs-logo matchup cards.
- [ ] Week labels show game ranges, and individual cards do not show confusing W1/Game 12 labels.
- [ ] NBA Cup appears only for supported eras and advances through group, knockout, and champion states.
- [ ] A claimed team can request, accept, play, report, simulate, reset, and finalize games.
- [ ] CPU games can be simulated from the matchup screen when allowed.
- [ ] Final games update standings, box scores, player stats, fatigue, and injuries.
- [ ] Final games open the dedicated result screen from calendar cards and game-result notifications.
- [ ] Live Mode opens after simulated regular season, NBA Cup, and playoff games.
- [ ] Live Mode shows home-team arena colors and logo/abbreviation.
- [ ] Live Mode has no in-game GM adjustment buttons.
- [ ] Live Mode reveals score-by-score events and then links to final result.
- [ ] Overtime games show OT columns in Live Mode and final result.
- [ ] Resetting a final game rolls back team/player season stats and condition.
- [ ] Playoffs generate from standings, advance series, and record champion/runner-up outcomes.
- [ ] Trophy Case shows rings, NBA Cup, MVP, Finals MVP, DPOY, ROY, Sixth Man, MIP, All-NBA, All-Defense, and All-Star records.
- [ ] Finalized awards write back to player accolades and archived stat history.
- [ ] Player upgrades spend one point per grade, enforce Star/Superstar/Legend season limits, and reserve S for Superstar/Legend players.
- [ ] Lottery boost grants go to the bottom five teams in each conference.
- [ ] Offseason hub routes to re-signing, free agency, draft class, live draft, roster cuts, expansion, and next season.
- [ ] Live draft supports commissioner start, GM pick, timer expiration, and auto-pick.
- [ ] Roster cuts enforce NBA 15 standard and 3 two-way slots.
- [ ] New season archives award history, player stat history, and resets seasonal condition.
- [ ] Expansion validates custom teams, caps the league at 36, and supports expansion draft flow.
- [ ] Notifications route to matchup, result, calendar, offseason, live draft, roster cuts, expansion, Trophy Case, and Player Upgrades screens.

## Regression Checks

- [ ] Web dashboard does not call native push notification response APIs.
- [ ] Deleted leagues do not notify the commissioner who deleted them.
- [ ] NBA court backgrounds are not forced onto unrelated league/channel screens.
- [ ] MLB and NFL screens do not show NBA-only fields, salary-matching language, or basketball-only imagery.
