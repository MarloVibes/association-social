# Player Scouting Card Implementation Plan

## Goal

Build the approved player scouting card into the app: detailed ability grades, Franchise Mobile season stats under grades, Compare, and Original NBA Stats.

## Tasks

1. Add a reusable NBA scouting grade utility that expands legacy/player hidden data into detailed grade categories.
2. Add tests for grade colors, fallback generation, comparison winners, and the compact compare-row model.
3. Replace the old broad Player Identity section in `components/PlayerCard.tsx` with Scouting Grades plus Franchise Mobile Stats.
4. Add Compare and Original NBA Stats tabs to the player card.
5. Verify with focused tests, full tests, TypeScript, Expo export, and whitespace checks.

## Compare Row Correction

Compare rows should read as one matchup line, not duplicated labels:

`Curry  B+  Passing  S  Paul`

The ability label appears once in the center. Each player's name and grade stay on their own side.
