# Broadcast Live Mode Design

## Goal

Broadcast Live Mode should feel like watching a small animated basketball broadcast, not reading a game recap. The court, players, ball, crowd, jumbotron, and camera direction should carry the experience. Text should explain only what the visual cannot make obvious.

The current Live Mode remains the stable fallback while this version is built as a new experimental presentation. Once the broadcast version is reliable, it can become the default NBA Live Mode.

## Product Direction

- Portrait broadcast experience built around the court.
- Lightweight 2-bit style placeholder players at first.
- Rive-ready actor model so custom characters can replace placeholders later.
- Pregame coaching style stays locked before the game starts.
- No mid-game coaching switches.
- Event feed drives the action scenes.
- Game action stops when the game is final, then transitions into celebration, sportsmanship, and locker-room exit beats.
- NBA ships first; NFL and MLB can reuse the director concept with sport-specific fields later.

## Screen Composition

The screen should feel like a mobile sports broadcast:

- Compact header with league/team context and back action.
- Scorebug with team logos, score, period, clock, and live/final state.
- Jumbotron strip or arena board above the court for replay cues, team runs, and final buzzer moments.
- Main portrait court as the hero surface.
- Crowd band behind or around the court with animated energy states.
- Short event feed below the court for recent play history.
- Pregame coaching selections remain visible only as compact locked context.

The screen should not add long command-insight panels, possession cards, or heavy text blocks.

## Court And Arena Standard

The court must look like basketball:

- Hardwood floor texture.
- Real sideline and baseline geometry.
- Half-court line.
- Center circle.
- Center-court logo or team-color mark.
- Paint areas.
- Free-throw line and lane markings.
- Three-point arcs.
- Restricted-area arcs.
- Rims and backboards on both ends.
- Home-team accent colors.

Do not place permanent team names across fixed baseline areas because teams switch sides. Team identity should come from the scorebug, logos, jumbotron, court colors, and center mark instead.

## Crowd And Jumbotron

The arena should react to the game:

- Crowd idle loop during normal possessions.
- Crowd swell on made threes, dunks, blocks, steals, big rebounds, and runs.
- Crowd dip or quiet state after away-team runs.
- Final buzzer state when the game ends.
- Winning-team celebration, sportsmanship line, and locker-room exit beats after the final buzzer.
- Jumbotron displays short visual cues such as `RUN`, `BLOCK`, `DEEP THREE`, `POSTER`, `CLUTCH`, or team logo flashes.
- Jumbotron content should be brief, graphic, and timed to the current event.

Crowd and jumbotron animation must be local app animation, not stored as large Firestore replay data.

## Player Actor Model

Each on-court actor is assembled from three layers:

1. Player identity
   - Skin tone.
   - Hair style and hair color.
   - Body build/height category.
   - Facial hair or simple accessory flags.
   - Optional sleeve/headband/accessory flags.

2. Current team uniform
   - Team primary color.
   - Team secondary color.
   - Jersey number.
   - Number/text color.
   - Home/away contrast state.

3. Event motion
   - Idle.
   - Jog.
   - Dribble.
   - Pass.
   - Shoot.
   - Drive.
   - Dunk/finish.
   - Rebound.
   - Block.
   - Steal.
   - Celebrate.
   - Set defense.

Player likeness follows the player across trades, signings, draft classes, and free agency. Uniform styling follows the current team. This means a traded player keeps their recognizable silhouette but immediately wears the new team colors.

## Director Engine

The director engine converts timeline events into staged scenes. It should not require the simulation engine to store full animation frames.

Core scene types:

- Made three: spacing, catch or pull-up, shot rise, ball arc, net result, crowd/jumbotron reaction.
- Made two: drive, cut, post touch, floater, layup, dunk, or midrange based on event context.
- Miss: shot motion, rim/bounce result, rebound setup.
- Rebound: ball drop and rebounder claim.
- Block: shot attempt, defender contest, ball deflection, crowd reaction.
- Steal: pressure, loose ball, possession flip.
- Free throws: half-court setup with shooter at line.
- Turnover: miscue, deflection, or bad pass.
- Final: live play stops, final buzzer hits, winning team celebrates, teams show sportsmanship, players exit toward locker rooms, final score remains.

If an event does not have enough detail, the director picks a believable generic scene based on event type, position, player role, team style, and shot value.

## Coaching Style Influence

Coaching style is selected before the game and locked. It influences the visual language:

- Pace and Space: wide corners, faster ball movement, more threes.
- Grit and Grind: slower entry, post touches, paint bodies, stronger rebounding posture.
- Blitz Pressure: defenders extend higher, more traps, more aggressive steal/block setups.
- Seven Seconds: quicker transitions, early offense, faster shot scenes.
- Triangle/Post: wing, elbow, and low-post geometry.
- Attack the Paint: downhill drives, rim pressure, collapse-and-kick spacing.
- Shoot at Will/Three Point First: more early pull-ups and deep spacing.
- Zone/Man Up variants: visible defensive shell changes.

These styles should change spacing, timing, and likely scene choice. They should not become mid-game buttons.

## Data And Storage

Firestore should store compact basketball events, not animation frames.

The app derives visual state locally from:

- `liveTimeline` events.
- score/period/clock.
- home and away team ids.
- player ids, numbers, positions, and current team.
- optional player visual identity fields.
- locked coaching styles.

The broadcast layer may cache derived state in memory, but it should not write large visual timelines back into Firestore. This keeps the system under the 1 MB document limit.

## Rive Integration Path

Phase 1 should use coded placeholder actors so the director engine can be built immediately.

Rive should be introduced after the event-to-scene system is proven:

- One reusable player rig.
- Inputs for team colors, body style, accessories, and animation state.
- Reusable ball/rim/reaction assets if helpful.
- The React Native app sends state changes to Rive rather than storing Rive-specific replay data.

The actor interface should be designed so placeholder actors and Rive actors can share the same props.

## Endgame Sequence

The game should not keep looping live-play motion after the result is final. It should move into a short postgame broadcast sequence:

1. Final buzzer
   - Clock hits zero.
   - Ball/play motion ends.
   - Jumbotron flashes final score.

2. Winning-team celebration
   - Winning players cluster, jump, clap, or raise hands.
   - Crowd energy rises for home wins and quiets for away wins.
   - Losing team slows into neutral postgame body language.

3. Sportsmanship
   - Players cross half court for quick handshakes/daps.
   - The moment should feel respectful, not long.

4. Locker-room exit
   - Players drift toward tunnel/locker-room sides.
   - Broadcast settles on final score and top event.

After this sequence completes, only subtle idle arena motion should remain. No new basketball possessions should animate.

## Implementation Boundary

Phase 1 includes:

- New NBA Broadcast Live Mode component or route.
- Broadcast court/arena renderer.
- Placeholder 2-bit actor renderer.
- Player identity plus current-uniform model.
- Director projection layer for common event types.
- Crowd and jumbotron reactions.
- Final-buzzer, celebration, sportsmanship, and locker-room exit handling.
- Existing Live Mode fallback preserved.

Phase 1 does not include:

- Licensed likeness assets.
- Custom Rive character files.
- Full 3D player models.
- Real NBA Cup court art unless licensed/provided.
- NFL/MLB broadcast implementations.
- Rewriting the possession simulation engine.

## Testing

Automated tests should cover:

- Broadcast mode derives actors from player identity plus current team uniform.
- A traded/signed player keeps identity fields while uniform colors come from the new team.
- Made three, dunk/two, rebound, block, steal, free throw, turnover, and final events map to scene types.
- Coaching style changes spacing/scene hints without exposing mid-game controls.
- Live-play motion transitions to final buzzer, celebration, sportsmanship, and locker-room exit after the game ends.
- Broadcast mode does not require large replay data in the schedule document.

Manual QA should cover:

- Open Broadcast Live Mode on an iPhone-sized viewport.
- Confirm court, crowd, jumbotron, scorebug, and players are visible.
- Simulate an NBA game and watch multiple event types.
- Confirm game does not keep animating new possessions after final, and instead plays the postgame celebration/sportsmanship/exit sequence.
- Confirm player uniforms match current team colors.
- Confirm the old Live Mode fallback still opens if broadcast mode is disabled.
