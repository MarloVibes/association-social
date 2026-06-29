# NBA Free Agency Engine Design

## Goal

Build an NBA-only free agency and contract engine that feels like a full franchise mode on mobile. GMs can submit contract offers, commissioners can resolve offer rounds, players decide through an original preference model, league members receive notifications, and signed contracts stay attached to player records.

## Source Boundaries

This system must not copy or reference proprietary basketball game formulas, source code, UI labels, or branding. Public inspiration is limited to broad franchise-mode concepts, public basketball management games, and real NBA contract structure. Internal code and UI should use neutral terms such as `contract`, `free_agency`, `player_preferences`, `decision_score`, and `contractHistory`.

## Existing Foundation

The app already has:

- Mobile screens at `app/screens/offseason/free-agency.tsx` and `app/screens/offseason/re-signing.tsx`.
- Shared mobile component `components/offseason/ContractStageScreen.tsx`.
- Server handlers in `functions/franchise/contracts.js`:
  - `submitContractOffer`
  - `resolveFreeAgencyRound`
  - `completeOffseasonTeamAction`
- Domain scoring in `domain/offseason/contracts.ts`.
- Rotation cleanup after trades/signings through `functions/domain/rotationSync.js`.

The current system is too simple: offer scoring is shallow, the UI is list-first instead of hub-first, player motivation is not visible, notifications are limited, and contracts are stored as loose salary fields rather than a clear active contract record.

## Player Decision Model

Each player decision should be driven by an original weighted model. The model evaluates:

- Annual salary
- Contract length/security
- Role promise: Franchise, Starter, Rotation, Depth
- Team contender score
- Team need at the player position
- Player loyalty
- Team reputation
- Market appeal
- Age timeline fit
- Randomized but deterministic tie-breaker from offer/player/team seed

Players may have hidden preference weights:

- `money`
- `loyalty`
- `winning`
- `role`
- `market`
- `security`

Preferences should be inferred from the player and vault data before falling back to generic defaults. The first pass should use:

- Existing salary and salary percentile in the active era.
- Existing contract length and remaining years.
- Team longevity: repeated seasons with the same team increases loyalty.
- Team movement history: frequent team changes lowers loyalty and raises money/role sensitivity.
- Playoff-caliber context: players with history on strong teams or older veterans value winning more.
- Age and career stage.
- Player tier/label and overall impact.

If a player lacks enough historical context, defaults should be derived from age, overall, tier/label, loyalty, and career stage. Young players lean role/security, prime stars lean money/winning/role, older vets lean winning/security.

The model should not create random identities for known players when contract and team history exists. Randomness is only a deterministic tie-breaker.

## Contract Record

When an offer is accepted, the signed player should receive:

```ts
contract: {
  teamId: string;
  salary: number;
  years: number;
  role: 'franchise' | 'starter' | 'rotation' | 'depth';
  signedSeason: number;
  stage: 're_signing' | 'free_agency';
  status: 'active';
}
contractHistory: Array<{
  teamId: string;
  salary: number;
  years: number;
  role: string;
  signedSeason: number;
  stage: string;
  signedAt: string | number;
}>
```

Legacy fields `salary`, `contractYears`, `contractRole`, and `signedSeason` should remain for existing screens, but the new `contract` object becomes the source for richer franchise features.

## Era Salary Baseline

The engine should use the salaries already attached to players as the first anchor for asking price. A player's expected annual salary should be derived from:

- Current player salary when available.
- Era salary percentile among available/rostered players.
- Player impact/tier.
- Age curve.
- Contract role requested by the GM.
- Whether the player is re-signing with a long-term team.

This keeps 2011 salaries from being judged like 2026 salaries and lets each era feel financially different.

## Mobile Free Agency Hub

The mobile screen should be redesigned as a compact hub:

- Header with current stage, team, and completion state.
- Summary strip showing candidates, submitted offers, accepted decisions, and team payroll.
- Segmented views:
  - Available
  - My Offers
  - Decisions
- Player cards with:
  - Name, position, age, current salary
  - Interest profile badges such as Money, Loyalty, Winning, Role
  - Expected role/market hint
  - Existing offer state if the GM already submitted
- Offer modal with:
  - Salary
  - Years
  - Role
  - Live “offer strength” preview
  - Clear mobile buttons

The UI should avoid dense tables and use scan-friendly cards sized for phones.

## Notifications

Notifications should be written to user documents through `FieldValue.arrayUnion`:

- Commissioner notification when a GM submits an offer.
- GM notification when a player accepts or rejects their offer.
- League member notification when a free agency/re-signing round resolves, with count of decisions.

Notifications should include `type`, `leagueId`, stage, and concise message text. Existing push infrastructure can forward those user notifications.

## Resolution Flow

1. GM submits offers during active `re_signing` or `free_agency`.
2. Offers are stored with terms, player snapshot, team context, preference breakdown, and pending status.
3. Commissioner resolves the round.
4. Server ranks valid offers per player with the decision model.
5. Winning offer signs the player to the team.
6. Offer results are updated with accepted/rejected/invalid status and reason.
7. Contract record is attached to the player.
8. Team rotation is reconciled against the new roster.
9. Notifications are issued.
10. League offseason metadata records the last contract resolution.

## Error Handling

- Invalid salary, years, role, stage, and version should fail before storing the offer.
- Non-NBA leagues should continue using existing simple handling until their own engines are built.
- Duplicate offers for the same team/player/stage should overwrite the prior pending offer by deterministic offer id.
- Already-rostered free agents should be rejected during resolution.
- Roster limit failures should return explicit invalid offer results.

## Testing

Add tests for:

- Preference-derived offer scoring.
- Money-first player choosing salary over team fit.
- Ring-chasing veteran choosing contender over slightly higher salary.
- Contract object and history attached after signing.
- Notifications generated for submission and resolution.
- Mobile source safety: screens use neutral terms and callable functions.

## Rollout

This is NBA-only. NFL and MLB should adapt the architecture later with sport-specific roster, payroll, and contract terms.
