# Possession-Based Live Mode Design

## Goal

Live Mode should still start instantly and reveal at 3x speed, but the engine must stop building the game backward from a final score. The new flow should simulate basketball possessions first, then derive score, player stats, period scoring, play-by-play, final result, and standings updates from those possessions.

This keeps the app fair for users who cannot watch live, while making the feed and stats feel like a real basketball game.

## Current Problem

The current flow creates final score and box score first, then builds a live timeline to explain those results. That causes fake-feeling distribution:

- assists can feel detached from real made baskets
- rebounds and steals can appear like random stat events
- player totals can look mathematically forced
- wrong or fallback team names can leak into the feed
- Live Mode looks active, but the underlying basketball logic is not the source of truth

## Target Flow

When a GM taps simulate, the function immediately creates a full possession timeline:

`rosters + rotations + minutes + player grades + coaching presets + stamina + matchup context -> possessions`

Then the app derives:

- live score
- final score
- player box score
- team box score
- quarter and overtime scoring
- play-by-play events
- live court movement
- standings/stat writes after the reveal is complete

The final result can be known to the server immediately, but it must stay hidden from the UI until the Live Mode reveal reaches the final event.

## Possession Engine

Each possession should be one coherent basketball sequence:

1. pick offense and defense lineups from rotation/minute plans
2. choose ball handler and action type from usage, grades, coaching style, stamina, and matchup
3. resolve outcome:
   - made field goal
   - missed field goal plus rebound
   - shooting foul plus free throws
   - non-shooting foul
   - turnover, optionally with steal
   - timeout or substitution
   - period end
4. update score, player stats, team stats, possession, fatigue, and clock
5. write one readable event to the timeline

Validation rules:

- assists only attach to made field goals
- rebounds only attach to missed field goals or missed free throws
- steals only attach to turnovers
- defensive rebounds and live-ball turnovers flip possession
- every possession advances the clock realistically
- overtime is 5 minutes when regulation ends tied
- final score only appears on the final event

## Skill And Coaching Inputs

The possession engine should use the existing original rating model as the source of truth. It should consume numeric attributes and calculated grades, not separate hardcoded grades.

Examples:

- shooting outcomes use shot type, shot grade, shot IQ, consistency, defender pressure, and playmaking setup
- finishing uses layup, dunking, close shot, strength, speed, foul draw, and rim protection
- passing uses ball handle, pass accuracy, pass IQ, vision, pressure, and defensive IQ
- rebounding uses offensive/defensive rebound, vertical, strength, position, and lineup size
- turnovers use ball handle, pass IQ, usage, pressure, steals skill, and fatigue

Coaching presets should modify tendencies and small grade/context bonuses, not directly guarantee results. First-half and second-half presets should both be supported.

## Rotation And Minutes

Rotations should be generated from the saved rotation plan. If it is missing or stale after a trade/free-agent signing, the engine should rebuild a safe default before simulating.

The timeline should track:

- starters
- current on-court players
- bench players
- minute targets
- substitutions
- player fatigue

This prevents generic names and stale players from appearing after roster changes.

## Live Player Feed UI

The Live Mode player feed should use the approved starter-first head-to-head layout:

- starting five always visible as PG/SG/SF/PF/C matchups
- each row shows player name, team, live stat line, and 1-2 key skill chips
- a bench preview shows the strongest bench contributors for each side
- a See More action opens full rotation stats
- play-by-play remains underneath the matchup view

The feed should prefer real player names, team display names, and current team abbreviations from the game snapshot.

## Data Shape

The timeline should include enough structured data for the UI without recalculating basketball logic on the device:

- game id, teams, reveal duration, speed multiplier
- starter matchup rows
- full roster stat snapshots by event
- event list with period, clock, score, possession team, event type, text, and stat deltas
- lineup changes and current on-court player ids
- final box score generated from the possession events

The app can still render the timeline from Firestore snapshots and local elapsed time.

## Migration

Old completed games can continue using the existing replay data. New simulations should use possession timeline version 2. The UI should gracefully render both versions during the transition.

## Testing

Add domain/function tests for:

- no undefined Firestore fields
- assists require made baskets
- rebounds require misses
- steals require turnovers
- overtime is 5 minutes and only occurs after ties
- generated box score equals timeline stat totals
- final score is hidden until reveal completion
- reset removes game result and player stats from that game
- stale rotations are rebuilt after roster changes
- starter matchup feed includes both teams and five starter rows

## Non-Goals

This design does not add manual in-game controls. GMs plan before the game through coaching and rotations, then watch the sim unfold.

This design does not use proprietary game ratings, formulas, labels, badge systems, or branding. It is an original basketball simulation model based on public basketball concepts, player attributes, coaching logic, and era-adjusted profiles.
