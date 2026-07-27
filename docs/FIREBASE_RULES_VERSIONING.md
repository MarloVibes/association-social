# Firebase Rules Versioning

Last updated: 2026-07-27

Franchise Mobile now versions the published Firestore and Storage security rules captured from the `association-social` Firebase Console on July 27, 2026. The repository is the reviewable source of truth, but the captured files have not been redeployed from the repository yet.

## Why This Matters

Console-only rules are easy to lose, change by accident, or forget during a pitch/demo push. Versioned rules let us review exactly who can read and write league data, chat media, schedules, teams, player pools, game results, and private admin surfaces.

## Captured Files

- `firestore.rules`
- `storage.rules`
- `firestore.indexes.json`
- `firebase.json`

## Safe Change Process

1. Make rule changes in the versioned files.
2. Run `npm run security:pitch`.
3. Run `npm run test:security`.
4. Review the full diff carefully.
5. Deploy only the intended rules target.
6. Confirm the published Firebase Console text matches the committed file.

Do not deploy rules changes until they are reviewed. A rule mistake can lock users out or expose private league data.

## Pre-Pitch Rule Review Checklist

- Non-members cannot read private league details.
- League members can read only league data needed for gameplay.
- Only allowed users can write team, roster, prep, chat, invite, and trade-room data.
- Pitch viewers cannot write destructive/admin-only documents.
- Schedule and game result reads allow approved league members to see final scores and box scores.
- Chat photos/media are scoped to the league/channel they belong to.
- Service-account-backed scripts are not needed for demo viewers.
- No rule grants broad public read/write access to production collections.
