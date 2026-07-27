# Franchise Mobile Pitch Security Plan

Last updated: 2026-07-27

This is the working plan for sharing Franchise Mobile with publishers, investors, advisors, or contractors while reducing the risk that code, data, formulas, roadmap details, or private product strategy are exposed.

This is not legal advice. Use this as an engineering and founder-prep checklist, then review the legal items with a qualified attorney before any major 2K / Take-Two / publisher pitch.

## Core Principle

Show the product experience, not the internals.

Pitch viewers should see:

- the strongest demo flow
- realistic league/gameplay outcomes
- product vision and market positioning
- enough proof that the system works

Pitch viewers should not get:

- source code
- Firebase console access
- production database access
- raw player rating formulas
- private roadmap docs
- admin/commissioner controls unless needed
- service accounts, API keys, or `.env` files
- editable design/source assets unless intentionally shared

## Demo Environment

Preferred setup:

- Create a separate Firebase demo project.
- Create a separate EAS update branch or demo build profile.
- Seed only demo leagues, demo users, scrubbed data, and sample game results.
- Use demo-only API keys and environment variables.
- Remove or disable destructive admin actions in demo builds.
- Use approved demo accounts with limited permissions.
- Expire demo access after the pitch window.

Minimum acceptable setup if a separate Firebase project is not ready:

- Use a locked private demo league.
- Use demo accounts only.
- Hide/disable commissioner-only and debug actions for non-admin demo users.
- Remove sensitive data from any seeded demo league.
- Confirm Firestore and Storage rules block non-members from reading private league data.
- Never share Firebase Console, GitHub repo, or service-account access.

## Pitch Demo League Seed

Use the pitch demo seed when you need a controlled league for a private walkthrough. It creates a locked private league, fills all NBA teams with CPU-controlled team documents, keeps commissioner/admin actions protected by the existing pitch demo flags, and locks a schedule through the same backend schedule generator the app uses.

Dry-run first:

```bash
npm run demo:pitch:seed
```

Create the demo league:

```bash
npm run demo:pitch:seed -- --write --ownerUid=<your_firebase_uid>
```

Optional flags:

- `--leagueId=<id>` to choose the Firestore league id.
- `--name="Franchise Mobile Pitch Demo"` to change the visible league name.
- `--ownerTeam=LAL` to attach the owner account to one team; omit it for all CPU-controlled teams.
- `--gamesPerTeam=82` to set the schedule length.
- `--skipSchedule` to create teams without locking a schedule.

The script requires the local gitignored `service-account.json`; do not share that file with pitch viewers.

## Current App Demo Access Flags

The app now supports a first-pass pitch-safe access layer:

- Set `users/{uid}.pitchAccessRole` to `viewer` to make a pitch viewer account.
- Set `users/{uid}.pitchAccessRole` to `founder` for a labeled founder account.
- Set `leagues/{leagueId}.pitchDemoLocked` to `true` to lock destructive/admin controls for that league.
- Older aliases also work: `demoAccessRole`, `isPitchDemoViewer`, `pitchDemoViewer`, `demoAccessLocked`, and `pitchMode: locked`.

Protected viewers can still explore approved leagues, rosters, stats, chats, schedules, and final scores. The app hides league creation/join shortcuts, commissioner settings, invite/find-GM controls, salary tools, reset buttons, and other private admin actions. Backend functions also reject league deletion and game reset attempts when pitch demo protection is active.

## Technical Security Checklist

- Run `npm run security:pitch` before sharing any private pitch build or demo access.
- Use `docs/FIREBASE_RULES_VERSIONING.md` to capture console rules safely before any rules deploy.
- Firestore rules: confirm users can only read/write league data they are allowed to access.
- Storage rules: confirm uploaded chat/photos/media are scoped to allowed users/leagues.
- Callable Functions: confirm sensitive mutations require auth plus role checks.
- Service accounts: confirm `service-account.json` and private keys are not committed.
- Environment variables: confirm secrets are not bundled into client code.
- API keys: confirm client-exposed keys are restricted where supported.
- GitHub: keep repo private; remove outside collaborators after work ends.
- Branches: use a demo branch/build for pitch-safe features when possible.
- Logs: avoid logging sensitive user data, secrets, formulas, or full documents.
- Data export: do not hand over database exports unless under signed agreement.
- Admin tools: hide or gate commissioner/debug screens in demo mode.
- Screenshots/video: watermark private demos when practical.

## Legal / IP Checklist For Attorney Review

- Founder ownership: confirm all code, designs, docs, and assets are owned by the company/founder or properly assigned.
- Contractor assignment: anyone who contributed code/art/design should have invention/IP assignment paperwork.
- NDA: use before small private demos, contractors, consultants, or lower-trust conversations.
- Publisher pitch: understand large publishers may resist NDAs; disclose carefully and avoid giving implementation detail until there is stronger relationship/legal cover.
- Copyright: consider registering software code and original art/content.
- Trademark: consider searching and filing for the app/game name and logo if the brand will be used publicly.
- Patent/provisional patent: ask counsel whether any gameplay, matchmaking, simulation, or league mechanics are technically novel enough to protect.
- Trade secrets: keep rating formulas, simulation formulas, proprietary datasets, and roadmap documents private and access-controlled.
- Licensing risk: keep NBA/NFL/MLB/player-likeness assets out of any public build unless licensed or clearly private/internal.

Official references to review with counsel:

- USPTO provisional patent application overview: https://www.uspto.gov/patents/basics/apply/provisional-application
- USPTO trademark basics: https://www.uspto.gov/trademarks/basics
- U.S. Copyright Office Circular 61 for computer programs: https://www.copyright.gov/circs/circ61.pdf
- USPTO trade secret policy: https://www.uspto.gov/ip-policy/trade-secret-policy

## Pitch Package

Prepare these assets:

- Private pitch deck.
- Short product demo video.
- Pitch-safe test build or Expo preview.
- One-page security/confidentiality notice.
- Feature roadmap without raw formulas.
- Demo account credentials that expire.
- Technical appendix that describes capabilities at a high level without exposing code.

## Demo Sharing Rules

- Send demo access only to named people.
- Use unique demo accounts per viewer when possible.
- Record who received access and when.
- Set an expiration date.
- Do not share GitHub, Firebase, or source assets.
- Do not send raw algorithm documents unless counsel approves and an agreement is signed.
- After the pitch, revoke accounts/tokens and rotate demo secrets if needed.

## Next Engineering Tasks

1. Add a Firebase demo project or staging environment.
2. Create a private pitch build/update branch separate from normal development.

Completed:

- Added a demo-mode flag that hides admin/debug/destructive controls for pitch viewers.
- Added demo account role detection.
- Added `npm run security:pitch` to check `.env`, service-account files, versioned rules, indexes, and obvious sensitive TODO markers.
- Added `npm run demo:pitch:seed` to create a controlled CPU-filled pitch demo league.
- Captured and versioned the published Firestore and Storage rules from Firebase Console.
- Added `npm run test:security` to protect the versioned Firebase permission contract.
