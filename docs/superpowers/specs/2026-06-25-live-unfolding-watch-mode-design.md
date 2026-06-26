# Live Unfolding Watch Mode Design

## Purpose

Make simulated NBA games feel like something users want to watch without turning the app into a manual arcade game. GMs set their rotation and gameplan before tipoff. Once the game starts, nobody can make live adjustments, so users do not have to monitor their phone during work or risk losing because another GM was actively controlling the game.

The live screen is a cinematic reveal of a locked simulation: animated court movement, score-by-score events, momentum moments, quarter scoring, and final box-score payoff.

## Core Decision

Use **Live Unfolding** instead of instant replay.

The server creates the deterministic game result and a matching event timeline. The app reveals that timeline over a short watch window. Users can join at any time, watch the score unfold, leave, return, or skip to the final result after the game is complete. No live input changes the result.

## User Experience

### Pregame

Before the simulation starts, each GM can set:

- Rotation and minutes
- Coaching preset
- Pace preference
- Defensive style
- Focus scorer or balanced offense
- Bench trust
- Risk level

These choices become immutable gameplan snapshots when the game begins.

### Live Watch

The live screen shows:

- Home-arena themed court and crowd environment
- Logo-vs-logo scoreboard
- Current quarter and clock
- Animated player tokens moving like a tactical board
- Ball movement and shot location hints
- Score-by-score feed
- Momentum swings
- Quarter score table
- Key stat callouts such as runs, foul trouble, hot shooting, turnovers, and rebounding edge
- Pregame plan labels for context only

There are no GM buttons during live watch. The only actions are viewer actions such as pause animation, jump to latest, view box score, or leave the screen.

### Final Result

When the timeline completes, the app opens the same final result experience:

- Final score
- Quarter scores
- Game story
- Top performers
- Full box score
- Injuries and fatigue impact
- Standings and player stat updates

## Arena Theme

Each game uses the home team's arena style.

The first implementation should use team-aware visual themes instead of trying to model full 3D arenas. This gives the right feel quickly while staying performant in Expo:

- Home team primary and secondary colors
- Center-court logo or abbreviation
- Painted lane and sideline accents
- Subtle crowd glow using home colors
- Scoreboard and possession highlights tinted to the home team
- Era-aware colors when the app has historical team colors available

The design goal is that a Lakers home game, Celtics home game, Bulls home game, and Hornets home game should immediately feel different before reading the team names.

Exact real-world arena replicas can come later if the app adds dedicated arena artwork or licensed-style assets. The base system should be flexible enough for per-team arena overrides.

## Data Model

Scheduled games gain a live simulation state:

- `status`: `scheduled`, `requested`, `accepted`, `preparing`, `simulating`, `final`
- `simulationStartedAtMs`
- `simulationEndsAtMs`
- `liveTimeline`
- `liveTimelineVersion`
- `boxScore`
- `quarters`
- `story`
- `winnerTeamId`

Each timeline event contains:

- Stable event ID
- Quarter
- Game clock
- Home score
- Away score
- Event type
- Acting team ID
- Optional player ID and player name
- Short display text
- Shot zone or court coordinates when useful
- Momentum value
- Tags such as `three`, `turnover`, `rebound`, `foul`, `timeout`, `run`, `injury`, `clutch`

The timeline is generated from the same simulation seed as the box score, so replaying the same game always shows the same sequence.

## Simulation Flow

1. Matchup reaches simulation.
2. Server snapshots both teams' pregame plans.
3. Server generates the final result, box score, quarter scores, and live timeline in one authoritative path.
4. Server stores `simulationStartedAtMs` and `simulationEndsAtMs`.
5. Clients render the timeline based on server time.
6. Users who join late start at the event matching the current server-time position.
7. Once `simulationEndsAtMs` passes, the game is final and the result screen is available.

No client-side choice can alter the timeline or final result after the simulation starts.

## Rendering Approach

Use a lightweight 2D tactical board in React Native:

- Animated token positions with `react-native-reanimated`
- Team logos from existing logo assets
- Court and arena shapes drawn with standard React Native views and SVG where needed
- Event feed rendered as native list/cards
- Reduced-motion fallback for older devices

Avoid a heavy 3D engine for the first version. The experience should feel smooth on mobile before becoming visually extravagant.

## Fairness Rules

- Pregame choices lock before simulation.
- Live watch has no strategy controls.
- If one GM watches and the other does not, neither gains control advantage.
- Leaving the screen does not pause or change the result.
- Network drops do not corrupt the game; users can reopen and continue from server state.
- Commissioner reset remains the only way to reopen a finalized result.

## Error Handling

- If timeline data is missing but a final box score exists, show the final result and mark live replay unavailable.
- If timeline data exists but the game has already ended, open at final state with replay controls.
- If the user's clock differs from server time, use stored server timestamps and Firestore state, not local assumptions.
- If animation fails, keep the score feed and quarter table visible.

## Testing

Domain tests:

- Timeline generation is deterministic for a seed.
- Timeline final score matches the box score.
- Quarter scoring in the timeline matches stored quarter totals.
- Events are sorted by quarter and clock.
- No timeline event mutates after generation.
- Arena theme resolves from the home team and falls back safely.

Function tests:

- Starting simulation writes timeline, final result, and timestamps together.
- Late joiners can derive the correct visible event from server time.
- Duplicate simulation attempts do not generate conflicting timelines.

App/source tests:

- Matchup screen links to Watch Mode for simulating games.
- Watch Mode has no live adjustment callables or mutation buttons.
- Result screen remains reachable after the timeline completes.
- Home arena theme is used for NBA regular season, NBA Cup, and playoff games.

## Out Of Scope For First Version

- Manual possession control
- Live play-calling
- 3D player models
- Exact real-world arena replicas
- Multiplayer spectators with chat
- Betting-style win probability

## Acceptance Criteria

- A GM can start or enter a simulated game and watch the score unfold live.
- A GM can ignore the phone during the simulation without losing any strategic advantage.
- The home arena visually matches the home team's color scheme.
- The final score, quarter scores, and box score match the revealed timeline.
- The same game can be reopened later as a deterministic replay.
