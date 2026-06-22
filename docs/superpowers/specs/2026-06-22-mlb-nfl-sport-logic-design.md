# MLB and NFL Sport Logic Design

## Purpose

Remove inherited NBA behavior from Madden NFL and MLB The Show leagues, then add game-style, sport-specific offseason systems. NBA behavior remains unchanged.

The implementation must make the league document's `sport` field the source of truth. Navigation parameters may assist initial rendering, but they must never override the stored league sport.

## Supported Sports

| Sport key | Product label | Teams | Active roster limit | Financial model |
| --- | --- | ---: | ---: | --- |
| `nba` | NBA 2K | 30 | Existing behavior | Existing NBA cap and matching rules |
| `madden` | Madden NFL | 32 | 53 | Hard salary cap |
| `mlb` | MLB The Show | 30 | 40 | Team budget, no league-wide hard cap |

New leagues default `maxMembers` to the number of teams for their sport. Commissioners may lower the membership limit, but may not raise it above the sport's team count or below the current membership.

## Architecture

Create a central sport-rules module that exposes immutable configuration and pure helpers. Shared screens consume this module instead of embedding NBA defaults.

The rules module owns:

- Team and membership limits
- Current season formatting
- Position lists and position groups
- Roster limits
- Draft rounds and class sizes
- Contract and financial modes
- Trade-validation mode
- Player-stat fields and awards
- Player photo resolution
- Chat presentation theme
- Offseason stages and stage labels

NBA-specific logic stays available through the same interface, but this project does not redesign the NBA offseason.

Firestore stores league-specific settings and mutable offseason state. Pure calculations remain in TypeScript so they can be tested without Firebase.

## League Creation

### Madden NFL

- Initial season year: `2025`
- Initial season label: `2025`
- Maximum members: `32`
- Roster limit: `53`
- Draft rounds: `7`
- Financial mode: `hard_cap`
- Trade matching: cap-room and post-trade cap compliance, not NBA salary matching
- Default draft timer: `120` seconds

### MLB The Show

- Initial season year: `2026`
- Initial season label: `2026`
- Maximum members: `30`
- Roster limit: `40`
- Draft rounds: `5` for the app's major-league-focused draft
- Financial mode: `team_budget`
- Trade matching: budget compliance and roster capacity, not NBA salary matching
- Default draft timer: `120` seconds

### Shared Settings

The commissioner may configure the draft timer from 30 to 600 seconds. Existing MLB and NFL leagues missing new fields receive sport defaults at read time and persist them on the next settings save.

## Trade Logic

### NBA

Retain the current tolerance multiplier, salary override, and optional Stepien Rule.

### NFL

A trade is valid when:

- Both teams still own all offered players and picks.
- Neither post-trade roster exceeds 53 players.
- Neither team's post-trade payroll exceeds its hard salary cap.
- The offered assets are not locked in another active trade.

There is no NBA 125% salary-matching requirement. Commissioner override may bypass financial validation but must not bypass ownership or roster-limit validation.

### MLB

A trade is valid when:

- Both teams still own all offered players and picks.
- Neither post-trade roster exceeds 40 players.
- Neither team's post-trade payroll exceeds its configured team budget.
- The offered assets are not locked in another active trade.

There is no league-wide salary cap and no NBA 125% salary-matching requirement. Commissioner override follows the same restrictions as NFL.

All execution paths, including instant, veto-approved, vote-approved, and CPU trades, run the same sport-aware validator inside a transaction.

## Rosters and Player Presentation

### NFL Positions

`QB, HB, RB, FB, WR, TE, LT, LG, C, RG, RT, OL, EDGE, DE, DT, NT, LOLB, ROLB, OLB, MLB, ILB, LB, CB, FS, SS, S, DB, K, P, LS`

### MLB Positions

`SP, RP, CP, P, C, 1B, 2B, 3B, SS, LF, CF, RF, OF, DH, IF, UT, UTIL, TWP`

Roster, free-agent, target-list, and trade-block filters use the current sport's positions. Position grouping continues to provide depth-chart-style sections.

Player images use the existing sport-aware resolver:

- NBA: Basketball Reference
- MLB: MLB person image
- NFL: seeded photo URL

Trade rooms and Trade Center use that resolver instead of constructing Basketball Reference URLs.

Salary labels use sport terminology:

- NBA: salary and minimum salary
- NFL: cap hit
- MLB: annual salary and team budget impact

## Custom Players

The custom-player screen reads the league sport and renders a sport-specific editor.

### NBA

Retain existing positions, basketball statistics, and awards.

### NFL

Fields:

- Identity, age, height, weight, jersey number
- NFL position
- Annual salary, contract years, role
- Position-relevant ratings
- Season statistics such as passing, rushing, receiving, tackles, interceptions, sacks, kicking, or punting
- Awards such as MVP, Offensive Player of the Year, Defensive Player of the Year, Rookie of the Year, Pro Bowl, All-Pro, and championship

### MLB

Fields:

- Identity, age, height, weight, jersey number
- MLB position
- Annual salary, contract years, role
- Position-relevant ratings
- Hitting statistics for position players
- Pitching statistics for pitchers
- Awards such as MVP, Cy Young, Rookie of the Year, Gold Glove, Silver Slugger, All-Star, and championship

Pending-player review uses the same sport-specific summary. Custom player documents store `sport`, preventing players from appearing in a different sport's league.

## Offseason State Machine

MLB and NFL use these ordered stages:

1. `season_end`
2. `re_signing`
3. `free_agency`
4. `draft_class_review`
5. `live_draft`
6. `roster_cuts`
7. `ready_for_season`
8. `regular_season`

The league stores:

- `offseason.stage`
- `offseason.seasonYear`
- `offseason.stageStartedAt`
- `offseason.completedTeamIds`
- `offseason.draftTimerSeconds`
- `offseason.draftStatus`
- `offseason.version`

Every stage transition runs transactionally, verifies the expected current stage, and increments `version`. Repeated taps or reconnects therefore cannot advance a stage twice.

Commissioners control stage advancement. A stage cannot advance while a claimed team has unresolved required actions, unless the commissioner explicitly invokes automated completion for those teams.

Vacant teams always use automated decisions.

## Re-signing

Each expiring player receives team interest and role expectations derived from:

- Overall or archetype tier
- Age
- Position value
- Recent production
- Expected role
- Team competitiveness
- Team positional need
- Requested salary and years

Claimed-team GMs submit offers. Players evaluate offers through a deterministic score with a small seeded variance stored on the negotiation, ensuring retries do not produce different outcomes.

NFL offers must fit under the hard cap. MLB offers must fit within the team budget.

Vacant teams prioritize valuable starters, young players, and scarce positions while maintaining financial and roster compliance.

Unresolved players become free agents when the stage closes.

## Free Agency

Free agency runs in configurable rounds rather than requiring always-online bidding. During each round, GMs submit one offer per player.

Offer score combines:

- Guaranteed or annual value
- Contract years
- Promised role
- Contender status
- Position need
- Player preference

When the commissioner resolves a round, each player accepts the highest valid preference score. Ties use the player's stored seeded preference. Losing offers are released automatically.

CPU teams bid only when they have a positional need, sufficient budget or cap space, and roster room.

## Draft Class Generation and Editing

When entering `draft_class_review`, the app generates a fictional class from sport-specific templates.

### NFL Class

- Seven rounds for 32 teams
- Position distribution weighted toward realistic Madden franchise classes
- Prospect data includes position, age, height, weight, archetype, projected round, ratings, development trait, and scouting summary

### MLB Class

- Five rounds for 30 teams
- Prospect distribution includes pitchers, catchers, infielders, outfielders, designated hitters, utility players, and occasional two-way players
- Prospect data includes position, age, handedness, archetype, projected round, ratings, potential, and scouting summary

Generation uses a stored seed, making the class stable across devices and reloads.

Commissioners may:

- Edit prospect identity and attributes
- Change position and projected round
- Add or remove prospects
- Regenerate the class before publishing
- Publish and lock the class

Once the live draft begins, the class cannot be regenerated.

## Live Draft

The draft stores:

- Current overall pick
- Current team
- Draft order for every round
- Pick deadline
- Selected prospects
- Available prospects
- Status

The commissioner configures 30 to 600 seconds per pick, defaulting to 120.

When time expires, the current team receives an automatic selection. The commissioner also has an `Auto-Pick Now` action.

Auto-pick scoring considers:

- Best available talent
- Positional need
- Existing depth
- Age at the position
- Sport-specific positional value

Claimed teams select manually while present. Vacant teams always auto-pick. An absent claimed GM is auto-picked when the timer expires.

Draft selections and pick advancement occur in one Firestore transaction. A unique pick number prevents duplicate selections from simultaneous clients.

Drafted players are added with rookie contracts appropriate to sport and round.

## Roster Cuts

Before the new season:

- NFL teams must reach 53 players and satisfy the hard cap.
- MLB teams must reach 40 players and satisfy the team budget.

Claimed-team GMs release players manually. The UI shows the number of required cuts and financial status.

Vacant teams automatically release the lowest-value surplus players while preserving positional minimums.

The commissioner may invoke auto-completion for an absent GM. The league cannot enter `ready_for_season` until every team is compliant.

## New Season

Advancing from `ready_for_season`:

- Increments the sport's season year by one
- Ages active players
- Advances contract years and marks newly expiring contracts
- Moves retired players out of active rosters
- Clears completed offseason actions
- Resets draft state
- Marks the league `regular_season`

It never changes NBA eras, applies NBA salary caps, loads NBA draft classes, or creates basketball-position rookies for MLB/NFL.

## CPU Team Behavior

CPU decisions are deterministic for a given stored decision seed. They:

- Retain high-value players
- Fill positional needs
- Respect roster and financial rules
- Avoid duplicate or contradictory offers
- Auto-draft using team need and talent
- Make required roster cuts

CPU processing is idempotent. Re-running a stage does not create duplicate contracts, offers, or selections.

## Chat Presentation

General channel behavior stays shared. Background presentation becomes sport-aware:

- NBA: basketball court
- NFL: football field
- MLB: baseball diamond

The channel screen receives or loads the authoritative sport. A neutral dark background is used while league data loads or for unknown sports.

## Error Handling and Recovery

- Every mutating offseason action checks league stage and authorization.
- Commissioner-only operations reject non-commissioners.
- Team actions reject users who do not control the team.
- Transactions verify current ownership, roster state, financial state, and draft state.
- Failed network operations leave the stage unchanged and can be retried.
- Draft timers use server deadlines rather than client countdown state.
- Reopening any offseason screen reconstructs state from Firestore.
- Existing MLB/NFL leagues receive defaults without destructive migration.

## Testing

Pure unit tests cover:

- Sport configuration and defaults
- Position lists
- Membership limits
- Season labels
- Financial and roster validation
- Contract offer scoring
- CPU decisions
- Draft generation stability
- Auto-pick behavior
- Stage transitions
- Roster-cut selection

Firestore emulator or transaction-level tests cover:

- Duplicate stage advancement prevention
- Simultaneous draft selection prevention
- Trade execution under each sport
- CPU and user action idempotency
- Authorization

Screen-level tests or focused manual QA cover:

- MLB and NFL league creation
- Settings labels and limits
- Sport-specific player creation
- Roster and trade filters
- Correct player images
- Re-signing and free agency
- Draft editing and live timer
- Auto-pick and commissioner override
- Roster compliance
- Sport-themed chat backgrounds

## Launch Acceptance Criteria

- A 32nd GM can join and claim the final NFL team.
- MLB and NFL never display NBA positions, awards, stat fields, era transitions, salary-matching language, or basketball imagery.
- NFL trades enforce ownership, 53-player limit, and hard-cap compliance.
- MLB trades enforce ownership, 40-player limit, and team-budget compliance.
- Commissioners can complete a full MLB or NFL offseason without using NBA data.
- Claimed teams are controlled by their GMs; vacant and timed-out teams complete actions automatically.
- Generated draft classes are stable, editable before publication, and locked once drafting starts.
- Draft timers support 30 to 600 seconds and commissioner-triggered immediate auto-picks.
- Stage and draft operations remain correct after reloads, retries, and simultaneous clients.
