# Player Evaluation System v2 Design

## Goal

Make NBA player evaluation detailed enough that average, above-average, core rotation, star, and rare elite players separate clearly. The system must stay original to Franchise Mobile: hidden numeric scores remain hidden, while GMs see letter grades, tiers, form, and potential.

## Core Layers

Each NBA player should have separate evaluation layers:

- **Overall Talent**: long-term true ability. This changes slowly through development, regression, injuries, aging, and upgrades.
- **Current Form**: recent performance. This can rise above or fall below true talent after games.
- **Potential**: visible letter grade representing growth ceiling and progression strength.
- **Confidence**: hidden mental rhythm that affects shot quality, mistakes, free throws, clutch moments, and defensive awareness.
- **Team Chemistry**: team-level and player-fit rhythm that affects passing, help defense, morale, and role acceptance.
- **Fatigue / Health**: short-term availability and performance drag.

Hidden numeric values should not appear on the player card unless explicitly changed later. The UI should show letters and tier names only.

## Grade Scale

Use a tighter grade ladder so players stop bunching together:

| Grade | Hidden Score Range | Tier |
| --- | --- | --- |
| S | 99-100 | Legend |
| A+ | 95-98 | Elite |
| A | 92-94 | Elite |
| A- | 89-91 | Elite |
| B+ | 86-88 | Pro |
| B | 83-85 | Pro |
| B- | 80-82 | Pro |
| C+ | 77-79 | Contributor |
| C | 74-76 | Contributor |
| C- | 71-73 | Contributor |
| D+ | 68-70 | Prospect |
| D | 65-67 | Prospect |
| D- | 60-64 | Prospect |
| F | 0-59 | Development |

## Potential Grade

Potential is visible as a grade and tier, not a number.

Potential should control offseason progression:

- High potential players receive better grade-growth chances.
- Low potential players can still improve from strong seasons, but less often.
- Player playstyle should influence which grades improve.
- Yearly performance should influence which grades improve.
- Awards, rings, playoff success, and league role can add progression weight.

Example:

- A young defensive wing with `A- Potential`, strong minutes, and a good defensive season should be more likely to improve perimeter defense, help defense, stamina, and offense IQ.
- A shooter with `B Potential` and a great shooting season should be more likely to improve three-point shooting, free throw, shot IQ, and clutch.
- A veteran with `C Potential` can still improve from an elite year, but regression risk should be higher.

Potential should not be a hard cap. Rare breakouts can exceed expectation, but they should require strong season signals.

## Ability Categories

The detailed grade model should include:

- Scoring: close shot, mid range, three-point shot, free throw, dunking, shot IQ.
- Playmaking and IQ: passing, ball handle, offense IQ, clutch.
- Defense: perimeter defense, post defense, blocking, steals, defense IQ, help defense.
- Physical and interior: speed, acceleration, strength, rebounding, post offense, stamina.
- Growth: potential.

## Simulation Impact

Grades must affect simulated games directly:

- **Close Shot / Dunking / Post Offense**: rim attempts, paint scoring, foul pressure.
- **Mid Range**: half-court shot creation and late-clock scoring.
- **Three-Point Shot**: 3PA rate and 3PM efficiency.
- **Free Throw**: free throw conversion.
- **Shot IQ / Offense IQ**: shot selection, efficiency stability, clutch possessions.
- **Passing / Ball Handle**: assist creation, turnovers, pace control.
- **Perimeter Defense / Steals**: opponent guard efficiency, forced turnovers.
- **Post Defense / Blocking / Rebounding**: paint defense, blocks, defensive boards.
- **Defense IQ / Help Defense**: team defensive rating and opponent shot quality.
- **Speed / Acceleration / Stamina**: transition scoring, defensive recovery, late-game fatigue.
- **Current Form / Confidence / Chemistry**: short-term multipliers that can create hot streaks, slumps, and role-player breakouts.

The sim should not treat all `B` players the same. A `B+` shooter and `B+` defender must produce different box-score and game-flow outcomes.

## Era Player Audit

Before NBA is considered complete, run a full vault audit across all NBA era pools and player vault data.

The audit should produce:

- Players whose generated grades look too low or too high.
- Core-player flags based on minutes, usage, salary, starts, playoff importance, awards, and team context.
- Defensive/core role overrides for players who do not pop through basic box-score stats.
- Example review cases such as 2011 Luol Deng, who should evaluate as a high-value two-way core wing rather than a generic average role player.

The audit should not blindly overwrite live data. It should create a report first, then apply reviewed grade updates.

## NBA Completion Gate

NBA should not be marked complete until:

- Player evaluation v2 exists.
- Potential is visible and used by progression.
- Simulation uses detailed grades, form, confidence, chemistry, fatigue, and health.
- The era player vault audit has been run and reviewed.
- Known core-player misses have been corrected.

MLB and NFL remain separate sport setup tracks after the NBA foundation is stable.
