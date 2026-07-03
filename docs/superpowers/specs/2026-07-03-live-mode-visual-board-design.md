# Live Mode Visual Board Design

## Goal

Live Mode should feel like watching the game play out, not reading a recap. The first implementation will replace the current text-heavy NBA Live Mode presentation with a rich animated 5v5 court board inside the existing app screen.

The design keeps GM strategy meaningful without turning games into mid-game controls: each team locks its coaching style before the game starts, then the live replay visualizes how that style shaped possessions.

## Product Direction

- Animated board first.
- Pregame coaching style stays locked once the game starts.
- No mid-game style switching.
- Text supports the visual board instead of becoming the main experience.
- NBA ships first; NFL and MLB reuse the same board architecture with sport-specific surfaces.

## NBA Live Mode Screen

The screen keeps the current app structure:

- Header with back button, league label, Live Mode title, and live badge.
- Scorebug showing both teams, score, clock, and locked coaching style.
- Main animated court board as the hero surface.
- Short visual play event card below the board.
- Compact coaching identity cards.
- Small event ticker for recent plays.

The board should not be buried under long feed panels.

## Court Visual Standard

The court must feel like basketball, not a generic diagram.

Required visual elements:

- Hardwood floor texture.
- Real court outline.
- Half-court line.
- Center circle.
- Center-court logo mark.
- Paint areas on both ends.
- Three-point arcs.
- Restricted-area arcs.
- Rims and backboards on both ends.
- Team-color accents from the home arena.

Do not place team names permanently near either basket because teams switch sides.

## Animated Gameplay Layer

The animated layer sits on top of the court:

- Player tokens for visible 5v5 action.
- Ball position.
- Ball/pass path.
- Movement lanes.
- Hot-hand glow for current focal player.
- Momentum or pressure highlights where useful.
- Scoring pop animation near the rim when a team scores.

Score pops:

- Show `+2` for made two-point field goals.
- Show `+3` for made three-point field goals.
- Appear near the scoring rim or shot-result location.
- Animate quickly upward/fade out.
- Should not block player tokens or the scoreboard.

## Data Shape

The board should use existing `liveTimeline` events where possible, with a small visual projection layer that converts timeline events into renderable court state.

Suggested derived state:

- `players`: token positions, labels, team side, active state.
- `ball`: x/y position.
- `paths`: pass, drive, shot, or movement paths.
- `scorePop`: value, x/y position, team side, createdAt/event id.
- `eventLabel`: short visible sentence.
- `coachingContext`: locked home and away style labels.

Do not require live user interaction during the game.

## Implementation Boundary

Phase 1 is NBA-only in the production app.

Phase 1 includes:

- Replace the current Live Mode basketball board with a proper SVG court renderer.
- Use the existing screen route and data subscriptions.
- Keep locked coaching style visible.
- Add scoring pop animations.
- Keep event text short.
- Preserve existing result unlock and player-card behavior where practical.

Phase 1 does not include:

- 3D player models.
- Licensed player likeness.
- Mid-game coaching changes.
- Full NFL/MLB implementation.
- Rebuilding the simulation engine.

## NFL and MLB Follow-Up Standard

The architecture should allow future sport boards:

- NFL: field, yard lines, hash marks, end zones, line of scrimmage, first-down line, route paths, pressure/blitz lanes.
- MLB: diamond, grass, dirt, bases, mound, batter box, base runners, pitch path, hit trajectory.

These should reuse the same conceptual board renderer pattern, but each sport must have authentic venue markings.

## Testing

Add tests for:

- Live Mode uses the visual NBA board renderer for basketball games.
- Locked coaching styles render without mid-game controls.
- Score pop appears for made two and three point events.
- Free-throw-circle-style extra markings do not return unless intentionally designed.
- Team names are not hardcoded near fixed basket sides.

Manual QA:

- Open Live Mode for an NBA game in Expo.
- Confirm the court renders on iPhone-sized viewport.
- Simulate a game and confirm the board appears without crashing.
- Confirm +2/+3 score pops are visible and fade out.
- Confirm text remains compact and does not dominate the screen.
