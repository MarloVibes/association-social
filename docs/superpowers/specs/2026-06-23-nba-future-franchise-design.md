# NBA Future Franchise Design

## Purpose

Allow NBA leagues to continue indefinitely beyond the 2025-26 season with schedules, asynchronous matchup requests, full game simulation, standings, playoffs, injuries, player development, contracts, drafts, free agency, and optional expansion.

The system must not depend on a visible player overall rating. It must use a distinctive Player Identity Model built from skill grades, roles, strengths, weaknesses, chemistry, consistency, reputation, and hidden simulation values.

## Architecture

Use one unified franchise engine for the full in-app franchise game.

Every completed game enters the same authoritative result pipeline:

1. Validate the scheduled game and participating teams.
2. Accept a server-generated or GM-entered box score from the in-app franchise flow.
3. Finalize the game exactly once.
4. Update standings, player statistics, fatigue, injuries, team history, tendencies, and notifications.
5. Feed season results into playoffs, draft order, reputation, contracts, and progression.

Game execution, progression, awards, and offseason advancement all live inside this app. No separate mini-game result handoff is part of the design.

## Season Configuration

Commissioners choose one of these regular-season lengths:

- 14 games
- 29 games
- 58 games
- 82 games

The schedule generator distributes opponents as evenly as the selected length and current league size allow. Home and away assignments remain balanced.

Scheduled games may be completed in any order. A game is independent and can be finalized only once. Standings and cumulative player statistics are order-independent, while mild fatigue follows each team's game-completion order.

## Calendar and Matchup Requests

Each GM can open the league calendar, inspect any unplayed game involving their team, and request the matchup.

Request states:

- `available`
- `requested`
- `accepted`
- `preparing`
- `simulating`
- `completed`
- `expired`

A request:

- Notifies the opposing GM.
- Expires after one hour if it is not accepted.
- May be sent again after expiration.
- Cannot be accepted after expiration.
- Cannot create a second active request for the same scheduled game.

After acceptance:

- Both GMs receive a five-minute preparation window.
- Each GM may select or adjust a saved rotation and coaching preset.
- Current selections remain hidden from the opponent.
- The game starts automatically when the server deadline expires.
- Results are delivered within a 15-minute simulation window.
- Both GMs receive start and result notifications.

If a matchup is never accepted, either GM may choose `Simulate Game`. This immediately uses both teams' saved defaults without an additional preparation window.

Games against vacant CPU teams can be simulated immediately using generated CPU rotations and coaching styles.

All deadlines are server timestamps. Closing the app does not pause, extend, or reset a request, preparation window, or simulation.

## Game Result Pipeline

Each result contains:

- Final score and quarter scores
- Winner and loser
- Player minutes
- Field goals, three-pointers, and free throws
- Points, rebounds, assists, steals, blocks, turnovers, and fouls
- Offensive and defensive rebounds
- Plus/minus
- Starter and bench designation
- Team totals
- Pace and possession estimates
- Shot-zone distribution
- Lineup usage
- Coaching style used
- Fatigue changes
- New injuries
- A short generated game story

The result source is recorded as `simulation` or `manual`.

Finalization uses a transaction and a unique completion marker. Retried requests and concurrent clients cannot count a game twice.

## Player Identity Model

Players do not have a visible universal overall.

### Visible Identity

Users see:

- Exact A+ through F skill grades
- Primary and secondary roles
- Strengths and weaknesses
- Consistency
- Chemistry and team fit
- Reputation
- Development trait
- Production and awards
- Contract and age

Core skill grades include:

- Interior scoring
- Midrange scoring
- Three-point shooting
- Free-throw shooting
- Shot creation
- Playmaking
- Ball security
- Perimeter defense
- Interior defense
- Help defense
- Rebounding
- Athleticism
- Basketball IQ
- Durability
- Stamina

Grades are exact and visible immediately. There is no scouting uncertainty around the published grade.

### Hidden Simulation Values

Each grade maps to a hidden numeric range. The exact value remains invisible to all users, including commissioners.

Simulation also uses hidden modifiers for:

- Hot and cold variance
- Matchup fit
- Role comfort
- Chemistry
- Fatigue
- Injury limitations
- Coaching-system fit
- Consistency
- Development trajectory

These values provide calculation precision without exposing an OVR-style number.

### Reputation

Reputation changes through:

- Recent production
- Awards
- Playoff performance
- Team success
- Consistency
- Age and career stage
- Role
- Contract value
- League history

Reputation affects contract interest, trade value, player expectations, and generated game stories. It does not directly replace basketball skills.

## Team Strength

There is no displayed team overall.

Team performance is derived for each matchup from:

- Active rotation
- Minute allocation
- Player roles
- Skill interaction
- Coaching fit
- Lineup balance
- Chemistry
- Fatigue and injuries
- Opponent matchup
- Home-court advantage
- Moderate game variance

Stronger roster and coaching fits win more often, but hot shooting, foul trouble, turnovers, bench performance, and tactical matchups create realistic upsets.

## Rotations and Rest

GMs control:

- Starters
- Bench order
- Minutes
- Roles
- Inactive players
- Rest designations
- Closing lineup

There is no limit on inactive players, but active players must cover 240 regulation minutes. The editor prevents invalid or incomplete minute allocations from becoming the saved default.

Vacant teams and incomplete matchup submissions receive an automatically generated legal rotation.

Resting a player:

- Removes that player from the game.
- Produces substantial fatigue recovery.
- Does not count as an injury.
- May reduce chemistry or role satisfaction if overused.

## Fatigue

Fatigue follows each team's game-completion order, even when scheduled games are played out of chronological order.

Fatigue remains mild:

- Normal workloads create small temporary penalties.
- Heavy minutes and high-tempo styles create larger, but still controlled, penalties.
- Normal recovery occurs after every completed game.
- Reduced minutes, bench roles, and rest designations accelerate recovery.
- Fatigue cannot permanently damage ratings.

The simulation records each team's monotonic `fatigueSequence`. Concurrent game finalizations for the same team are serialized transactionally so both games cannot consume the same pregame fatigue state.

## Coaching Presets

GMs may create, name, duplicate, edit, and save multiple presets. A preset includes rotation, roles, and tactical selections.

Current matchup selections are hidden from the opponent until the result is finalized.

### Offensive Styles

- Triangle Offense
- Post-Centric
- Five-Out
- Seven Seconds
- Motion Offense
- Pick-and-Roll Heavy
- Three-Point First
- Shoot at Will
- Attack the Paint
- Midrange Craft
- Star Isolation
- Twin Towers
- Bench Mob

### Defensive Styles

- Man Up
- Zone
- Switch Everything
- Drop Coverage
- Full-Court Pressure
- Pack the Paint
- Run Shooters Off the Line
- Trap Stars
- Flop and Bait
- Protect Without Fouling
- Crash Glass
- Leak Out

Styles affect shot distribution, pace, turnovers, rebounding, fouls, fatigue, lineup value, and player production. Every style has strengths, counters, and roster-fit drawbacks.

## Game-History Scouting

The active preset remains hidden before a matchup.

Opponent scouting shows:

- Coaching styles used in previous games
- Player box scores
- Player minute trends
- Starting lineups
- Bench usage
- Head-to-head history

It does not reveal the opponent's currently selected preset or hidden simulation values.

## Injuries

Injuries are generated automatically. Commissioners may edit, remove, or manually add injuries.

### Minor Injuries and Illnesses

Examples include:

- Soreness
- Illness
- COVID
- Bruises
- Minor strains
- Minor sprains

Rules:

- More common than moderate or severe injuries
- Average absence of one to two games
- Maximum of six minor injury events per team per season
- Mild or no long-term progression impact

### Moderate and Severe Injuries

Examples include fractures, significant sprains, major strains, and ACL tears.

Rules:

- Rare and occasional
- Maximum absence of 15 games
- Mild long-term progression and durability impact
- Significantly less frequent than minor injuries

Most teams should not experience frequent serious injuries. The generator considers durability, fatigue, minutes, coaching pace, and prior injury history while maintaining strict seasonal caps.

An injured player cannot be activated until the absence counter reaches zero or a commissioner edits the injury.

## Standings and Playoffs

The result pipeline maintains wins, losses, conference record, point differential, streak, and head-to-head results.

Commissioners select:

- Traditional 16-team playoff bracket
- Play-In plus 16-team bracket
- Shortened 8-team bracket

Playoff series use best-of-seven by default. The chosen format is locked once playoffs begin.

Playoff games use the same request, preparation, simulation, result, fatigue, injury, and notification systems as regular-season games.

## Player Progression and Regression

Annual development considers:

- Age curve
- Development trait
- Minutes and role
- Production
- Efficiency
- Team and coaching fit
- Consistency
- Injuries
- Workload
- Awards
- Playoff performance

Changes apply to hidden values first, then visible grades are recalculated.

Progression is gradual. A single season cannot produce extreme grade movement without exceptional age, development, and production circumstances. Injuries have mild influence and do not normally destroy a player's career trajectory.

## Offseason Stages

NBA future seasons use:

1. `season_end`
2. `lottery_and_draft_order`
3. `player_progression`
4. `team_options`
5. `re_signing`
6. `free_agency`
7. `draft_class_review`
8. `live_draft`
9. `expansion`
10. `roster_cuts`
11. `ready_for_season`
12. `regular_season`

The expansion stage is skipped unless the commissioner has created an expansion proposal.

Stage transitions are versioned and transactional. Commissioners control advancement. Vacant teams and absent GMs may be completed automatically.

## Contracts and Free Agency

NBA financial behavior retains salary-cap and trade-matching rules.

Players evaluate offers using:

- Salary
- Contract length
- Role
- Team competitiveness
- Team fit
- Market reputation
- Playing time
- Loyalty

Claimed teams are GM-controlled. Vacant teams make automated compliant offers.

Free agency resolves in rounds. A deterministic stored preference seed prevents retries from changing a player's choice.

## Salary-Cap Growth

The salary cap grows by 5% each future season by default.

Commissioners may adjust the annual percentage. The selected rate applies when entering the new season and is recorded in cap history.

Derived values, including minimum contracts, rookie scales, and matching thresholds, grow from the resulting cap or their explicit configured formulas.

## NBA Draft

Future classes are generated automatically and remain commissioner-editable before publication.

Each class contains two rounds multiplied by the current team count.

Prospects include:

- Identity and background
- Position
- Exact visible skill grades
- Roles, strengths, and weaknesses
- Development trait
- Reputation
- Projected range
- Hidden simulation values

Commissioners may edit, add, remove, or regenerate prospects before publishing. Publication locks the class.

The live draft supports a commissioner-configurable 30-to-600-second timer, defaulting to 120 seconds. Expired picks auto-select using talent, fit, positional need, and roster construction. Commissioners also have `Auto-Pick Now`.

Drafted players receive rookie-scale contracts and join the selecting team's roster.

## Roster Rules

Each team supports:

- 15 standard NBA contracts
- 3 two-way contracts

The league cannot enter a new season until every team is compliant. GMs control cuts and contract conversion for claimed teams. Vacant or unresolved teams use automatic decisions.

## Expansion

Leagues remain at 30 teams by default.

Commissioners may optionally expand the league up to 36 teams.

An expansion proposal defines:

- Number of new teams
- City
- Team name
- Abbreviation
- Colors
- Logo
- Conference and division placement
- Expansion season

Expansion requires an expansion draft:

- Existing teams protect a configured number of players.
- Expansion teams select from unprotected players.
- CPU logic handles vacant or incomplete teams.
- Expansion selections respect contracts and roster limits.
- The regular draft and schedule generator use the new team count afterward.

Expansion cannot begin once the regular season schedule for that year is locked.

## Notifications

Notifications cover:

- Matchup request received
- Request accepted
- Request expired
- Five-minute preparation started
- Simulation started
- Game result available
- Injury update
- Playoff qualification
- Offseason stage opened
- Contract response
- Free-agent signing
- Draft turn
- Auto-pick
- Expansion action required
- Roster compliance required

Push notifications must remain deduplicated when notification read state changes.

## Recovery and Concurrency

- Server deadlines control every timed state.
- Game requests and completions are idempotent.
- Two games involving the same team cannot finalize against the same fatigue state.
- Box-score totals and standings update in one authoritative operation.
- Offseason stages cannot advance twice.
- Draft picks cannot be made twice.
- Failed simulations can be retried with the stored seed.
- Existing leagues receive future-season defaults without destructive migration.

## Testing

Pure tests cover:

- Schedule generation for 14, 29, 58, and 82 games
- Schedule balance for 30 through 36 teams
- Player Identity grade conversion
- Rotation validation
- Coaching-style effects and counters
- Moderate result variance
- Mild completion-order fatigue
- Injury frequency and caps
- Progression and regression limits
- Cap growth
- Draft generation
- Expansion scheduling
- CPU rotations and decisions

Transaction and emulator tests cover:

- Request expiration
- Duplicate acceptance prevention
- Duplicate game finalization prevention
- Same-team concurrent fatigue updates
- Standings and box-score atomicity
- Simulation retries
- Draft auto-picks
- Offseason transitions
- Expansion draft ownership

End-to-end QA covers:

- Request, accept, prepare, and receive results
- Immediate GM simulation
- Immediate CPU matchup simulation
- Saved hidden coaching presets
- Game-history scouting
- Injuries and recovery
- Configurable season lengths
- Every playoff format
- Full offseason into 2026-27 and later
- Optional expansion through 36 teams

## Launch Acceptance Criteria

- NBA leagues can advance beyond 2025-26 indefinitely.
- Every scheduled game can produce a full box score.
- Matchup requests expire after one hour.
- Accepted games use five-minute preparation and a 15-minute result window.
- Any unplayed matchup can be simulated immediately by either participating GM.
- CPU matchups simulate immediately.
- Games can be completed in any schedule order without duplicate standings or statistics.
- No visible player or team overall exists.
- Exact grades, roles, reputation, strengths, and weaknesses remain understandable.
- Current coaching choices remain hidden while historical coaching styles and player statistics are scoutable.
- Minor injuries are more common but short; serious injuries remain rare and never exceed 15 missed games.
- The salary cap grows 5% by default and remains commissioner-adjustable.
- Teams support 15 standard and 3 two-way contracts.
- Draft classes are generated, editable, publishable, and draftable.
- The league remains at 30 teams unless the commissioner expands it, with a hard maximum of 36.
- The app itself remains the full franchise game, including eras, team assignment, season simulation, awards, player upgrades, and offseason advancement.
