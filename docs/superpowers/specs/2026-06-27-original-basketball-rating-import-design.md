# Original Basketball Rating Import Design

## Purpose

Build an original basketball simulation rating model that imports public player statistics, creates internal numeric attributes, applies era context, and exposes only letter grades to users. The system must never copy commercial-game ratings, traits, descriptions, formulas, naming, layouts, or branding.

The first version focuses on NBA Franchise. The data and naming cleanup should also prepare the app to present the other sport modes as NFL Franchise and MLB Franchise.

## Compliance Rules

- All source data must come from public basketball statistics, manually supplied roster patches, or internally generated scouting logic.
- Public-facing app text must use neutral franchise labels: NBA Franchise, NFL Franchise, and MLB Franchise.
- No commercial-game names, publisher names, studio names, branded attribute names, branded trait systems, or branded database labels may appear in app UI, source comments, docs, filenames, marketing copy, or database field names.
- The model may use familiar basketball concepts such as shooting, passing, defense, rebounding, athleticism, role, workload, efficiency, age, and development curve.
- The model must describe itself as an original basketball simulation rating model inspired by public statistics, scouting logic, and era-adjusted performance.

## Source Inputs

### Public Stats Import

The importer reads public season-level and career-level basketball data:

- player identity: name, position, team, height, weight, age, draft year when available
- per-game stats: points, rebounds, assists, steals, blocks, minutes
- shooting profile: field goal attempts, three-point attempts, free throw attempts, percentages
- advanced stats when available: usage, efficiency, win contribution, turnover rate, rebound rates, assist rate, steal rate, block rate
- season context: pace, league averages, team offensive/defensive environment

The importer must save raw public-stat snapshots separately from generated ratings so future model changes can regenerate profiles without re-scraping.

### Manual Patch Import

The system supports CSV or JSON patches for roster moves and missing public fields. Patch files can add:

- current team
- jersey number
- position correction
- injury state
- roster status
- manually reviewed scouting notes

Manual patches cannot directly assign elite visible grades. They can only adjust source facts or request a model rerun.

## Data Model

Use neutral collection and field names:

- `player_ratings`
- `attribute_model`
- `era_adjusted_profiles`
- `skill_grades`
- `archetypes`
- `traits`
- `development_curve`

Each generated player profile should contain:

```ts
type PlayerRatingProfile = {
  player_id: string;
  full_name: string;
  season: number;
  team: string;
  position: string;
  source_snapshot_id: string;
  attribute_model: Record<string, number>;
  era_adjusted_profiles: Record<string, number>;
  skill_grades: Record<string, string>;
  archetypes: string[];
  traits: string[];
  development_curve: {
    potential: number;
    peak_start_age: number;
    peak_end_age: number;
    aging_resistance: number;
  };
  model_version: string;
  generated_at_ms: number;
};
```

Numeric attributes are internal simulation values. User-facing screens display grades, tiers, archetypes, traits, and descriptions without showing the hidden numbers.

## Attribute Model

The model generates internal values from public statistics and scouting logic. Attributes include:

- closeShot
- midRange
- threePoint
- freeThrow
- dunking
- shotIq
- passing
- ballHandle
- offenseIq
- clutch
- perimeterDefense
- postDefense
- blocking
- steals
- defenseIq
- helpDefense
- speed
- acceleration
- strength
- rebounding
- postOffense
- stamina
- potential

Each attribute is calculated from several public indicators. Examples:

- threePoint: attempt rate, accuracy, role volume, era average, assisted creation context
- midRange: scoring volume, shot diet proxy, free throw touch, role context
- dunking: position, rim scoring profile, free throw rate, age, size, public scouting notes when available
- passing: assists, assist rate, turnover context, usage, position
- defenseIq: minutes, team defensive role, steal/block signals, defensive workload, playoff role, size-position match
- stamina: minutes, games played, role consistency, injury availability
- potential: age, production relative to age, draft status when available, development curve, role growth

No single statistic should fully determine a rating. The model should blend volume, efficiency, role, age, and era context.

## Upgrade Categories

Every flexible attribute must be assigned to a GM-upgrade category. If an attribute does not naturally fit an existing category, the model must create a new neutral category instead of leaving it disconnected from the upgrade system.

Initial categories:

- Finishing: closeShot, dunking
- Shooting: midRange, threePoint, freeThrow, shotIq
- Playmaking: passing, ballHandle, offenseIq
- Defense: perimeterDefense, postDefense, blocking, steals, defenseIq, helpDefense
- Rebounding: rebounding
- Athleticism: speed, acceleration, strength, stamina
- Post: postOffense
- Intangibles: clutch
- Development: potential

GM upgrade points can target category grades or direct attributes. Category upgrades should resolve to the attributes assigned to that category, and direct attribute upgrades should still update the owning category grade. The implementation must include a coverage test proving every attribute in the model maps to one category.

## Grade Gate

Visible grades must always come from internal numeric attributes. A manual review can request a rerun or change source facts, but cannot bypass the numeric gate.

The grade ladder:

- S: numeric value 99 or above
- A+: numeric value 95-98
- A: numeric value 92-94
- A-: numeric value 89-91
- B+: numeric value 86-88
- B: numeric value 83-85
- B-: numeric value 80-82
- C+: numeric value 77-79
- C: numeric value 74-76
- C-: numeric value 71-73
- D+: numeric value 68-70
- D: numeric value 65-67
- D-: numeric value 60-64
- F: numeric value below 60

The implementation must include tests proving that A, A+, and S cannot be assigned unless the underlying numeric value qualifies.

## Era Adjustment

Era adjustment compares players to their actual season environment before creating final grades.

The era pass should account for:

- league pace
- league shooting environment
- position norms
- minutes and role context
- team offensive and defensive context
- playoff workload when available
- age and career stage
- known role archetypes from public performance indicators

Example: a defensive wing with heavy minutes, strong salary/workload signal, playoff defensive assignments, and above-average all-around production should not be reduced to a generic average role label just because their box score is not superstar-level.

Era adjustment should create a normalized context score per attribute, then blend that score with raw production and scouting logic.

## Archetypes And Traits

Archetypes and traits are original labels derived from generated attributes:

- Two-Way Wing
- Floor General
- Stretch Big
- Rim Protector
- Slashing Creator
- Movement Shooter
- Glass Cleaner
- Point Forward
- Defensive Anchor
- Bench Spark

Traits are plain basketball descriptors, not branded systems:

- high motor
- reliable shooter
- defensive communicator
- transition threat
- foul pressure
- low mistake rate
- late-game poise

Traits should influence simulation lightly and explain player identity clearly.

## Import Pipeline

1. Pull public current roster and season data.
2. Apply manual roster patches.
3. Store raw source snapshots.
4. Generate base internal attributes from source stats.
5. Run era-adjustment pass.
6. Generate visible skill grades from internal values.
7. Generate archetypes, traits, and development curve.
8. Write rating profiles to neutral fields.
9. Update player vault references without overwriting custom user-created players.
10. Produce an audit report for outliers and missing source data.

## Current Roster Updates

The importer should support quick updates for the 2026-2027 season setup:

- add rookies from the latest draft class already stored in the vault source
- update team rights and current team fields
- support unsigned, traded, waived, and draft-rights statuses
- avoid deleting prior season player history

Current-season imports should create a new snapshot rather than mutating old era data in place.

## UI And App Label Cleanup

App-visible sport labels must be:

- NBA Franchise
- NFL Franchise
- MLB Franchise

Existing mode labels, onboarding preferences, dashboard labels, create-league labels, and docs should be renamed to neutral franchise labels.

Legacy league sport keys can remain internally only where they are already required for routing or backward compatibility. New public labels and new model fields must use neutral names.

## Safety Scanner

Add a source-safety test that prevents banned commercial-game branding from appearing in:

- app labels
- docs
- code comments
- filenames added for this system
- database schema names created for this system

To keep source files clean, the scanner should not store raw banned names in plain text. It can compare normalized hashes or segmented literals that do not appear as final source terms.

## Testing

Tests must cover:

- grade gate boundaries for S, A+, A, and A-
- no elite grade without qualifying numeric value
- public stats to attribute conversion for shooter, passer, defender, rebounder, and athletic finisher profiles
- era-adjusted wing defender audit
- manual patch cannot override the grade gate
- generated profiles use neutral field names
- app mode labels use neutral franchise labels
- source safety scanner blocks banned branding terms

## Rollout

Phase 1:

- neutral label cleanup
- grade gate enforcement tests
- pure attribute model module
- era adjustment module
- source safety scanner

Phase 2:

- importer CLI for public stats snapshots and manual patches
- rating profile writer
- vault update script
- outlier audit report

Phase 3:

- commissioner import/review UI
- full current-season refresh workflow
- expanded manual patch templates

## Acceptance Criteria

- The app no longer shows commercial-game labels for NBA, NFL, or MLB modes.
- The rating system uses only public statistics, manual source facts, and original formulas.
- Generated database fields use neutral names.
- Visible grades are always derived from qualifying internal numeric values.
- Manual review cannot assign elite grades unless the internal numeric value qualifies.
- The system can regenerate a player profile after source stats or formulas change.
- Tests pass for grade gates, era adjustment, import schema, and source safety.
