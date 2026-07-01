# Original Basketball Rating Engine Design

## Purpose

Build the core NBA Franchise rating engine. This system creates the trusted starting point for every era league, fantasy draft, free agent pool, draft class, player card, trade screen, scouting screen, rotation screen, progression period, and game simulation.

The goal is not to patch individual players after users notice mistakes. The goal is to produce a believable basketball universe where 2011 LeBron James, 2011 Derrick Rose, 2026 LeBron James, free agents, rookies, and role players all start with ratings that make basketball sense.

The model is an original basketball simulation rating model built from public statistics, public context, internal scouting logic, and era-adjusted performance. It must not copy commercial-game ratings, proprietary trait systems, proprietary formulas, proprietary descriptions, proprietary layouts, or official game branding.

## Core Principles

- Every player starts from a trusted global era snapshot.
- Every league receives its own copy of those ratings at league creation.
- Global snapshots are never mutated by league play.
- League player ratings evolve based on that league's timeline.
- Numeric attributes are generated first.
- Visible grades are generated from numeric attributes.
- Screens never manually calculate their own grades.
- Current ability and potential are separate.
- Role, usage, impact, trade value, and development phase are separate.
- Fantasy drafts, free agency, trades, scouting, player cards, simulation, and upgrades all read from the same rating source.

## Data Layers

### Global Era Snapshots

Global snapshots are read-only baseline profiles. They power new league creation, fantasy drafts, era rosters, free agent pools, and draft class previews.

Collection shape:

```ts
type GlobalPlayerRatingSnapshot = {
  collection: 'global_player_rating_snapshots';
  snapshot_id: string;
  player_id: string;
  full_name: string;
  era_key: string;
  season_year: number;
  team_abbr: string | null;
  roster_status: 'active' | 'free_agent' | 'draft_prospect' | 'draft_rights' | 'retired_era_pool';
  position_primary: string;
  position_secondary?: string;
  source_snapshot_id: string;
  source_confidence: 'high' | 'medium' | 'low';
  attribute_model: AttributeModel;
  skill_grades: SkillGrades;
  role_profile: RoleProfile;
  impact_profile: ImpactProfile;
  development_curve: DevelopmentCurve;
  tendencies: PlayerTendencies;
  archetypes: string[];
  traits: string[];
  audit_flags: string[];
  model_version: string;
  generated_at_ms: number;
};
```

### League Player Ratings

League ratings are copied from global snapshots when the league is created. These records evolve forever inside that league.

Collection shape:

```ts
type LeaguePlayerRating = GlobalPlayerRatingSnapshot & {
  collection: 'league_player_ratings';
  league_id: string;
  copied_from_snapshot_id: string;
  league_season_year: number;
  progression_history: ProgressionEvent[];
  upgrade_history: UpgradeEvent[];
  injury_adjustments: RatingAdjustment[];
  morale_adjustments: RatingAdjustment[];
  coaching_fit_adjustments: RatingAdjustment[];
};
```

This prevents one user's 2011 LeBron from changing every other league. Two users can start the same era and produce different basketball histories.

## Attribute Model

The hidden numeric model uses 0-100 values. These numbers are not shown to users unless a future product decision explicitly enables it.

```ts
type AttributeModel = {
  closeShot: number;
  drivingLayup: number;
  drivingDunk: number;
  standingDunk: number;
  drawFoul: number;
  hands: number;
  midRange: number;
  threePoint: number;
  freeThrow: number;
  shotIq: number;
  shotConsistency: number;
  passing: number;
  passIq: number;
  passVision: number;
  ballHandle: number;
  speedWithBall: number;
  offenseIq: number;
  clutch: number;
  perimeterDefense: number;
  lateralQuickness: number;
  postDefense: number;
  blocking: number;
  steals: number;
  defenseIq: number;
  helpDefense: number;
  speed: number;
  acceleration: number;
  vertical: number;
  agility: number;
  strength: number;
  stamina: number;
  hustle: number;
  offensiveRebound: number;
  defensiveRebound: number;
  postOffense: number;
  durability: number;
  potential: number;
};
```

The current app model already has several of these fields. Implementation should migrate carefully rather than breaking existing player cards, rotations, upgrades, and simulation.

## Visible Skill Grades

Visible grades are generated from weighted category formulas, not from one raw attribute.

```ts
type SkillGrades = {
  finishing: string;
  midRange: string;
  threePoint: string;
  playmaking: string;
  perimeterDefense: string;
  interiorDefense: string;
  athleticism: string;
  rebounding: string;
  basketballIq: string;
  postOffense: string;
  durability: string;
  potential: string;
};
```

Example category formulas:

- Finishing: closeShot, drivingLayup, drivingDunk, standingDunk, drawFoul, hands
- Three-point: threePoint, shotIq, shotConsistency, offenseIq, shot volume modifier
- Mid-range: midRange, shotIq, shotConsistency, offenseIq, self-creation modifier
- Playmaking: passing, passIq, passVision, ballHandle, speedWithBall, turnover protection
- Perimeter defense: perimeterDefense, lateralQuickness, steals, defenseIq, helpDefense
- Interior defense: postDefense, blocking, strength, defenseIq, helpDefense
- Athleticism: speed, acceleration, vertical, agility, stamina, hustle
- Rebounding: offensiveRebound, defensiveRebound, vertical, strength, hustle
- Basketball IQ: offenseIq, defenseIq, shotIq, passIq, helpDefense
- Potential: age curve, current ability, production relative to age, draft status, hidden development, performance trend, injury history, minutes opportunity

Skill grades should reward true skills. Role players can have elite skills without being elite overall players.

Example:

- A bench shooter can have `threePoint: A-`
- The same player can have `usageGrade: C+`
- The same player can have `overallImpactGrade: B-`

This prevents limited-minute specialists from becoming fake superstars while still preserving their real value.

## Grade Scale

The shared grade conversion function must be used everywhere.

- S: 99-100
- A+: 95-98
- A: 92-94
- A-: 89-91
- B+: 85-88
- B: 80-84
- B-: 75-79
- C+: 70-74
- C: 65-69
- C-: 60-64
- D+: 57-59
- D: 53-56
- D-: 50-52
- F: 0-49

No screen may assign `S`, `A+`, `A`, or any other grade directly. It must call the shared conversion function.

## Current Ability, Potential, And Development Phase

Potential means future growth room, not current role.

Examples:

- 2011 LeBron James should have elite current ability and `A+` potential because he is age 26 and still in his prime runway.
- 2011 Derrick Rose should have elite current ability and `A+` potential because he is age 22 and playing at MVP level.
- 2026 LeBron James can still have high current ability in passing, IQ, strength, finishing, and clutch while having lower potential such as `B-` because he has already peaked.

Development labels explain the potential grade:

- High Upside
- Breakout Candidate
- Rising Star
- Prime Star
- Near Peak
- Stable Veteran
- Legacy Star
- Declining
- Sharp Decline Risk

Scouting screens must not label a `C` potential as "Contributor." Role labels and potential labels are different ideas.

## Role, Usage, Impact, And Trade Value

The model separates skill from influence.

```ts
type RoleProfile = {
  minutesGrade: string;
  usageGrade: string;
  offensiveRole: 'primary_creator' | 'secondary_creator' | 'spot_up' | 'rim_runner' | 'post_hub' | 'connector' | 'defense_first' | 'bench_scorer';
  defensiveRole: 'point_of_attack' | 'wing_stopper' | 'help_defender' | 'rim_protector' | 'post_defender' | 'team_defender';
  roleStability: number;
};

type ImpactProfile = {
  overallImpactGrade: string;
  starPowerGrade: string;
  tradeValueGrade: string;
  contractValueGrade: string;
  playoffReliabilityGrade: string;
};
```

This gives users better roster-building information. A player can be an elite shooter, a poor defender, a low-usage bench piece, a high-value young prospect, or an expensive declining star without those ideas collapsing into one vague grade.

## Tendencies

Tendencies are essential because box-score stats alone do not describe how a player plays.

```ts
type PlayerTendencies = {
  paintAttack: number;
  rimFinishFrequency: number;
  dunkFrequency: number;
  drawFoulPressure: number;
  midRangeFrequency: number;
  threePointFrequency: number;
  catchAndShootFrequency: number;
  pullUpFrequency: number;
  postTouchFrequency: number;
  transitionFrequency: number;
  passFirst: number;
  isolationFrequency: number;
  pickAndRollBallHandler: number;
  pickAndRollRollMan: number;
  defensivePlaymaking: number;
  foulRisk: number;
  reboundCrash: number;
};
```

Tendencies are derived from all available public indicators:

- shot attempts by zone when available
- shooting volume and efficiency
- free throw rate
- assist rate
- turnover rate
- usage
- position
- height and weight
- age and athletic curve
- offensive rebound and defensive rebound rates
- steal and block rates
- minutes role
- public scouting notes supplied by internal patch files

When a stat source cannot explain a known basketball behavior, the model can use a neutral manual scouting tag. The tag should describe observable basketball style, not copy a proprietary tendency or badge.

Examples:

- `elite_rim_pressure`
- `vertical_lob_threat`
- `low_volume_shooter`
- `high_usage_creator`
- `defensive_wing_assignment`
- `post_touch_big`

## Source Inputs

The source pipeline should prefer public, auditable inputs:

- player identity and biographical data
- season per-game stats
- per-minute stats
- shooting splits
- advanced stats
- play-by-play derived stats when available
- public tracking-style data when available
- salary and contract context
- awards and honors
- playoff role
- draft position
- team context
- era league averages
- neutral manual scouting tags for missing style information

The system must keep raw source snapshots separate from generated ratings. If formulas improve, the app can regenerate ratings without losing source evidence.

## Era Adjustment

Era adjustment compares players to their actual basketball environment.

The model should account for:

- league pace
- league shot profile
- league three-point rate
- position norms
- role norms
- minutes norms
- playoff context
- salary context within that era
- team style
- age and career stage

Example: a 2011 wing who guarded elite scorers, played heavy playoff minutes, rebounded well, and carried real two-way responsibility should not be treated as an average role player because his scoring average was not superstar-level.

## Free Agents

Free agents need the same rating quality as rostered players.

Free agent snapshots should include:

- last known team
- last known season
- contract expectation
- role expectation
- morale/loyalty/finance tendencies
- current ability
- potential
- durability and decline risk

Free agency screens, CPU signing logic, extension logic, and trade value must all use these profiles.

## Draft Classes

Draft class prospects need baseline ratings before the draft starts.

Prospect profiles should include:

- projected pick
- position
- archetype
- height and weight when available
- age when available
- school or source league
- current ability range
- potential grade
- development curve
- scouting strengths
- scouting weaknesses
- bust risk
- NBA readiness
- hidden numeric attributes
- visible grades

Historic era draft classes should be fixed source classes, not randomly generated unless the league has advanced beyond known real draft classes or the commissioner explicitly chooses generated prospects.

Fantasy drafts and live drafts must show enough information for users to make informed decisions.

## Player Vault Relationship

The player vault should store stable identity and history. Ratings should live in rating snapshots.

Identity:

- player_id
- name
- birth date
- height
- weight
- handedness if known
- photo/avatar reference if available
- real-world history references

Ratings:

- global era snapshots
- league-evolved copies
- season stat history
- progression and upgrade history

This prevents identity fields from being duplicated across eras while still allowing each era to have different ratings.

## Simulation Relationship

Game simulation must use league player ratings, not display-only roster fields.

Simulation should consider:

- current league attributes
- tendencies
- coaching first-half preset
- coaching second-half preset
- rotation minutes
- position fit
- fatigue
- injuries
- morale
- home arena context
- player role and usage

The live game feed, final box score, awards, standings, and player season stats should all come from this same simulation result.

## Upgrade Relationship

Upgrade points modify league player ratings only. They do not modify global snapshots.

Every upgradeable attribute must belong to an upgrade category. If an attribute is added later, tests must fail until it is assigned to a category.

Upgrade UI should be able to show:

- current visible grade
- whether the grade can be upgraded
- next grade target
- point cost
- locked reason if not eligible
- season limit if star/superstar rules apply

The detailed upgrade-points design will be handled after this rating engine design.

## UI Consumers

These screens must read from the same rating source:

- league home team preview
- roster
- player card
- player compare
- trade center
- fantasy draft
- live draft
- free agency
- scouting
- coaching/rotation fit
- live mode matchup display
- box score player links
- player upgrades

If a player is presented anywhere, the player should be tappable into the same player card.

## Acceptance Criteria

- 2011 LeBron James starts as an elite current player with `A+` potential.
- 2011 Derrick Rose starts as an elite current player with `A+` potential.
- 2026 LeBron James keeps strong current skill grades but has lower future-growth potential, around `B-`, explained as a late-career or legacy phase.
- Fantasy draft uses global rating snapshots.
- League play uses league-copied ratings.
- Free agents and draft prospects use the same rating profile structure as rostered players.
- Every visible grade comes from hidden numeric values.
- Every screen uses the shared grade conversion function.
- No commercial-game rating source, naming, branding, formulas, badges, tendencies, or layouts are copied.
- Manual scouting tags can fill public-stat gaps, but they must use original neutral basketball language.
- Simulated games use current league ratings, tendencies, coaching, rotations, injuries, and morale.
- Tests prove that elite grades cannot be shown unless the hidden numeric value qualifies.

## Rollout

Phase 1: Schema and grade source of truth.

- Expand attribute model.
- Add global snapshot and league rating types.
- Add shared category grade calculations.
- Add strict grade conversion tests.
- Add upgrade category coverage tests.

Phase 2: Source snapshot importer.

- Store raw public stat snapshots.
- Add manual neutral scouting tags.
- Generate model profiles from source data.
- Produce audit reports for outliers and missing fields.

Phase 3: Era baselines.

- Build 2011 sample with LeBron, Derrick Rose, Heat, Bulls, and obvious stars.
- Build current-era sample with 2026 LeBron and current stars.
- Add free agent baseline profiles.
- Add draft class baseline profiles.

Phase 4: App integration.

- Make fantasy draft read global snapshots.
- Copy snapshots into league ratings on league creation.
- Make roster, compare, trade, scouting, free agency, and simulation read league ratings.
- Remove screen-local grade fallbacks where possible.

Phase 5: Full audit and tuning.

- Run star/core-player audits by era.
- Tune tendencies and potential curves.
- Validate simulation output against plausible player roles.
- Add missing source patches where public stats under-explain player style.
