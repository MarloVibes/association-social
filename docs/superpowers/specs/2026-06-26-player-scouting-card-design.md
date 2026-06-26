# Player Scouting Card Design

## Goal

Redesign the player card into a full franchise scouting surface. When a GM taps a player from a roster, the card should lead with detailed ability grades, show the player's Franchise Mobile season history, and let the GM compare that player against any NBA player side by side.

## Approved Direction

Use the expanded scouting-card layout from the browser mockup:

- Player header with headshot, name, position, team, reputation, and archetype.
- Full grade report grouped by basketball area.
- Franchise Mobile league stats directly under grades, with multiple seasons available.
- Compare mode that searches any player in league rosters, CPU teams, free agents, or the player vault.
- Original NBA Stats tab for real-life stat history from the vault.

Franchise Mobile stats are not a tab. They belong under the grades so the card immediately tells the story of who the player is in this league.

## Grade Categories

Grades should be granular enough that players feel meaningfully different. The first NBA grade set is:

- Scoring: close shot, mid range, three-point shot, free throw, dunking, shot IQ.
- Playmaking and IQ: passing, ball handle, offense IQ, clutch.
- Defense: perimeter defense, post defense, blocking, steals, defense IQ, help defense.
- Physical and interior: speed, acceleration, strength, rebounding, post offense, stamina.

Grade colors:

- `S`: gold.
- `A` range: green.
- `B` range: blue.
- `C` range: yellow.
- `D` range: orange.
- `F` / bottom grades: red.

The UI should support future categories without requiring a redesign.

## Data Model

Existing broad grades can remain supported for backward compatibility, but the card should prefer an expanded grade object when present.

Recommended player field:

```ts
scoutingGrades: {
  closeShot: 'A-',
  midRange: 'A',
  threePoint: 'B+',
  freeThrow: 'B+',
  dunking: 'C',
  shotIq: 'A',
  passing: 'S',
  ballHandle: 'S',
  offenseIq: 'S',
  clutch: 'A',
  perimeterDefense: 'A',
  postDefense: 'D',
  blocking: 'C-',
  steals: 'S',
  defenseIq: 'A+',
  helpDefense: 'B+',
  speed: 'B+',
  acceleration: 'A-',
  strength: 'C',
  rebounding: 'C+',
  postOffense: 'F',
  stamina: 'A'
}
```

Fallback order:

1. `player.scoutingGrades`.
2. `player.visible.scoutingGrades`.
3. Expanded grades derived from `player.hidden`.
4. Existing `player.grades`, `player.abilityGrades`, or `player.visible.grades` mapped into broader category defaults.
5. Stats-derived grades when no grade data exists.

## Franchise Mobile Stats

The card should show the current season plus previous Franchise Mobile seasons. Each season row should include core stats and key achievements.

Use existing `player.statHistory` when available and current `player.seasonStats` for the active season. A future season advance should archive the current `seasonStats` into `statHistory` before resetting.

NBA default stat row:

- Games
- Points
- Rebounds
- Assists
- Steals
- Blocks
- Field-goal percentage
- Three-point percentage

Rows should be expandable later for playoff stats, awards, rings, and full box-score totals.

## Compare Mode

The Compare tab should let a GM search any NBA player, not only players on their team.

Search sources:

- League team rosters.
- CPU/vacant era teams.
- Free agents.
- Player vault.

The comparison result should show two compact player cards and a side-by-side grade matchup. Winning grades should be visually highlighted so the GM can quickly see where each player is better.

Each comparison row should use one shared ability label in the center rather than repeating the label for both players. Example:

`Curry  B+  Passing  S  Paul`

The compare view should also support comparing current Franchise Mobile stats against original NBA stats for the same player.

## Original NBA Stats

Original NBA Stats should remain a separate tab. It should use the existing vault profile data and show real-life season rows. This gives the GM a clean separation between:

- What the player was in real life.
- What the player is becoming in this Franchise Mobile league.

## UI Notes

- Use the existing dark app style and 8px-ish card radius.
- Keep the default card focused on grades and league stats.
- Use a small icon button for compare/details actions.
- Keep grade sections scan-friendly and collapsible if the screen becomes too long.
- Avoid hiding value-critical grades behind too many taps.

## Tests

Add tests for:

- Grade color mapping.
- Expanded grade fallback from hidden values and legacy grades.
- PlayerCard source safety for Scouting Grades, Franchise Mobile Stats, Compare, and Original NBA Stats.
- Season stat history rendering from `statHistory` plus active `seasonStats`.
- Compare utility ranking/highlighting stronger grades.
