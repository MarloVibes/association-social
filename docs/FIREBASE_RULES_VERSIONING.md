# Firebase Rules Versioning

Last updated: 2026-07-27

Franchise Mobile currently versions `firestore.indexes.json`, but Firestore and Storage security rules are still managed in the Firebase Console. Before any investor, publisher, contractor, or outside demo access, capture and review the live rules so the repo becomes the source of truth.

## Why This Matters

Console-only rules are easy to lose, change by accident, or forget during a pitch/demo push. Versioned rules let us review exactly who can read and write league data, chat media, schedules, teams, player pools, game results, and private admin surfaces.

## Safe Capture Process

1. Open Firebase Console for `association-social`.
2. Go to Firestore Database > Rules.
3. Copy the full published rules text into a local `firestore.rules` file.
4. Go to Storage > Rules.
5. Copy the full published rules text into a local `storage.rules` file.
6. Update `firebase.json` only after both files are captured and reviewed:

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "storage": {
    "rules": "storage.rules"
  }
}
```

7. Run `npm run security:pitch`.
8. Review the diff carefully before deploying rules.

Do not deploy newly created rules files until they have been compared against the live console rules. A guessed rules file can accidentally lock users out or expose private league data.

## Pre-Pitch Rule Review Checklist

- Non-members cannot read private league details.
- League members can read only league data needed for gameplay.
- Only allowed users can write team, roster, prep, chat, invite, and trade-room data.
- Pitch viewers cannot write destructive/admin-only documents.
- Schedule and game result reads allow approved league members to see final scores and box scores.
- Chat photos/media are scoped to the league/channel they belong to.
- Service-account-backed scripts are not needed for demo viewers.
- No rule grants broad public read/write access to production collections.
