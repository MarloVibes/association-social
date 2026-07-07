# Franchise Mobile Draft Career Mode Design

## Purpose

Franchise Mobile Draft becomes the public main mode for the app while the current GM/franchise mode is finished as a private prototype and later hidden or gated. The new mode avoids reliance on real NBA, NFL, MLB, NCAA, school, team, player, league, logo, or draft branding by building an original basketball universe around user-created players.

The core promise is:

> Create a player. Enter the Franchise Mobile Draft. Earn your spot. Build a career.

This mode should feel like a multiplayer sports career RPG. Users are not running real-world teams. They are building their own player, entering a shared draft showcase, getting drafted into a personal solo career universe, and earning more influence over their team as their player grows.

## Product Positioning

Franchise Mobile Draft is the main user-facing mode for launch direction. GM/franchise mode remains valuable as a demo and technology base, but it should not be the public default while licensing risk exists.

Short-term positioning:

- Finish GM mode enough to use as a private demo and investor pitch.
- Build Franchise Mobile Draft as the public main mode.
- Hide or gate GM mode later through a dev flag, admin-only flag, private demo toggle, or inactive route.
- Reuse stable GM systems where appropriate: simulation, seasons, awards, contracts, CPU decisions, chat/social, scheduling, progression, and roster logic.

## Player Ownership

Each account starts with one created player. That player has a permanent playstyle identity.

Extra player slots:

- Slot 1: free.
- Slot 2: unlock through a major career milestone or purchase early.
- Slot 3: unlock through a larger legacy milestone or purchase early.

Rules:

- Playstyles cannot be changed after creation.
- Extra slots do not share upgrade points or performance progress.
- Cosmetics can be account-wide, but grades, stats, awards, contracts, and team history stay player-specific.
- Only one player from the same user can enter a given tournament or league event.
- No deleting or restarting during an active tournament to manipulate draft stock.

## Starting Ratings

All created players start equal in total value, but their starting grades are distributed by selected playstyle. Nobody starts strong. Each player starts raw, with a small identity.

General baseline:

- Playstyle-relevant categories begin around D-.
- Secondary categories begin around F+ or F.
- Weak categories begin around F or F-.

Example: Stretch Big

- 3PT: D-
- Rebounding: D-
- Interior Defense: D-
- Finishing: F+
- Passing: F
- Handle: F-
- Perimeter Defense: F

Example: Slasher

- Finishing: D-
- Athleticism: D-
- Handle: D-
- Midrange: F+
- 3PT: F
- Interior Defense: F-

Example: Floor General

- Passing: D-
- Handle: D-
- Basketball IQ: D-
- 3PT: F+
- Finishing: F
- Rebounding: F-

Playstyle skills should grow faster than off-identity skills, but users can still train weaknesses over time.

## Franchise Mobile Draft Flow

The onboarding career path is:

1. Create a player.
2. Choose a permanent playstyle.
3. Join the next Franchise Mobile Draft showcase.
4. Get randomly assigned to a tournament team.
5. Play through the 64-team showcase tournament.
6. Complete a five-question Draft Interview Quiz.
7. Complete three universal tap drills.
8. Receive draft stock, scouting notes, and draft projection.
9. Enter a personal solo pro career universe.
10. Get drafted by an original CPU team.

The showcase is the multiplayer taste of the mode. The solo career is the main long-term loop.

## Showcase Tournament

The showcase is a 64-team basketball tournament.

Rules:

- A tournament opens on a recurring 30-minute cycle.
- Users enter solo.
- Users are randomly assigned to teams.
- Each team has five roster spots.
- CPU prospects fill empty spots.
- Teams are temporary showcase teams, not pro teams.
- Each team selects an offense preset and defense preset.
- Each user selects a personal playstyle/game approach for the tournament.
- Each round sims every 30 minutes.

The tournament should feel like a draft showcase, not a licensed college tournament. Do not use real NCAA, school, March Madness, Final Four, conference, or real player branding.

## Team Gameplans

Each showcase team uses the existing basketball counter concept.

Examples:

- 5-Out
- Pick and Roll
- Motion Offense
- Star Isolation
- Post / Inside
- Transition Pace
- 2-3 Zone
- 3-2 Zone
- Switch Everything
- Double Star
- Half Court Press
- Protect Paint

The better matchup gives a meaningful advantage, but it should not guarantee victory. Player grades, roster balance, player playstyle choices, activity, and randomness still matter.

## Personal Playstyle Choice

Before showcase games, users pick how they want to play. This is different from their permanent archetype. It is a game approach for the event.

Examples:

- Hunt Shots
- Attack the Rim
- Facilitate
- Lock In Defensively
- Crash the Glass
- Play Efficient
- Take Over Late
- Team First

The personal approach should influence stat tendencies and coach trust:

- Hunt Shots raises shot volume but can hurt efficiency.
- Facilitate raises assists and team rhythm.
- Lock In Defensively raises defensive event chance and coach trust.
- Crash the Glass raises rebounding chances.
- Play Efficient lowers bad-shot risk.
- Take Over Late raises clutch usage but increases turnover/miss risk.

## Draft Stock Formula

Every user who completes the showcase enters the draft in their personal solo universe. The question is not whether they are drafted. The question is how high they go.

Recommended draft stock weighting:

- 70% showcase performance.
- 15% tap drills.
- 10% Draft Interview Quiz.
- 5% activity/readiness.

Showcase performance should include:

- Box score production.
- Efficiency.
- Role fit.
- Defensive impact.
- Team success.
- Turnovers and decision quality.
- Strength of opposing matchups.

A great individual performance in a loss can still create strong draft stock. Winning helps, but it should not erase individual evaluation.

Draft outcome examples:

- "Marlon King was selected with the 1st pick in the Franchise Mobile Draft."
- "Jalen Cross was selected with the 18th pick in the Franchise Mobile Draft."
- "Devon Price was selected with the 30th pick in the Franchise Mobile Draft."

Use "Franchise Mobile Draft" or another original league term. Do not use "NBA Draft" in the public original mode.

## Draft Interview Quiz

After the showcase, users answer five randomly selected questions from a 20-question bank.

Rules:

- Questions are universal for all playstyles.
- Questions cover Franchise Mobile rules, basketball basics, player roles, stats, and gameplan counters.
- All answers should be discoverable through FAQ/help.
- Correct answers provide a small draft stock boost and Basketball IQ XP.
- Wrong answers do not punish heavily; users simply miss the bonus.

Example topics:

- Which offense is strong against 2-3 Zone?
- What is the paint?
- What does a floor general usually help with?
- What is a stretch big?
- What does a double team try to do?
- What does a turnover mean?
- What is an assist?
- What does a rim protector do?
- Why does spacing matter?
- What does switching everything mean?

Result labels:

- 5/5: Strong Interview.
- 3-4/5: Solid Interview.
- 0-2/5: Rough Interview.

## Tap Drills

After the interview, users complete three universal tap drills. The drills are a mix of timing and reaction gameplay. They are quick, lightweight, and repeatable.

Drill 1: Shooting Rhythm

- Tap when the meter hits the green zone.
- Rewards shooting, 3PT, midrange, and focus XP.

Drill 2: Defensive Read

- React to the attacker by tapping the correct direction or icon.
- Rewards perimeter defense, interior defense, and Basketball IQ XP.

Drill 3: Rebound Timing

- Tap at the peak window as the ball comes off the rim.
- Rewards rebounding, athleticism, and hustle XP.

Scoring:

- Bronze
- Silver
- Gold
- Perfect

Bad drill results should not destroy draft stock. They should only miss bonus value.

## Solo Career Universe

After the Franchise Mobile Draft, each player enters their own personal solo pro universe.

Important rule:

- The showcase is shared multiplayer.
- The pro career world is personal to that user/player.

This solves scale issues. A 64-team tournament can include many real users, but each user branches into their own draft and career result after the event.

The solo universe contains:

- Original pro teams.
- CPU GMs.
- CPU coaches.
- CPU teammates and opponents.
- Original awards.
- Original league history.
- Contracts.
- Trades.
- Role battles.
- Season schedules.
- Playoffs.
- Legacy progression.

## Career Influence Progression

The user begins with limited control and earns influence as their player becomes more important.

Rookie / Bench Player:

- Controls training, playstyle, attitude, and game approach.
- CPU coach controls minutes and role.
- CPU GM controls roster decisions.
- User can request more minutes, but cannot force it.

Starter / Key Player:

- Can influence role and gameplan.
- Can ask coach to run more actions for them.
- Can select personal matchup focus.
- Can build chemistry with teammates.

Star / Franchise Player:

- Can suggest trades.
- Can recruit free agents.
- Can influence coaching style.
- Can ask GM to keep or sign certain teammates.
- Can push for higher usage.
- CPU GM can still say no.

Legend / Face of Franchise:

- Gets near full team influence.
- Can approve major roster direction.
- Can shape team identity.
- Can influence coach/gameplan more heavily.
- Unlocks legacy quests and league-wide influence.

The long-term hook is:

> Earn minutes. Earn touches. Earn control.

## Progression Sources

Progression comes from:

- Training minigames.
- Game performance.
- Awards and milestones.
- Role success.
- Coach trust.
- Activity/readiness.
- Seasonal goals.

Performance should improve relevant skills. Example: a Stretch Big earns more 3PT and rebounding XP by hitting threes and grabbing boards.

Award and milestone grants should be player-bound and follow the player across teams.

## CPU GM And Coach Logic

CPU teams should make decisions based on:

- Player grade.
- Recent performance.
- Potential.
- Role fit.
- Contract.
- Activity.
- Team direction.
- Team needs.
- Chemistry.
- Draft position.

CPU outcomes:

- More minutes.
- Starter promotion.
- Bench demotion.
- Trade.
- Contract extension.
- Waiver/drop for inactivity.
- Development assignment.
- Franchise player treatment.

Users should feel like the league is alive and not fully under their control.

## Multiplayer Expansion Later

The first public version should focus on the shared draft showcase plus solo career.

Later multiplayer expansions can include:

- Player-vs-player pro leagues.
- User-created players drafted into shared online leagues.
- Friends entering the same showcase.
- Seasonal world events.
- Player rivalries.
- Agent systems.
- Team chemistry groups.

Do not build full multiplayer career league first. The solo career branch keeps scope controlled and gives users a complete loop sooner.

## Original Branding Requirements

The public mode must avoid real-world protected sports IP.

Avoid:

- NBA, NFL, MLB, NCAA, March Madness, Final Four.
- Real team names.
- Real logos.
- Real school names.
- Real player names/likenesses.
- Real league draft names.
- Protected uniforms, mascots, arenas, and presentation marks.

Use:

- Original pro teams.
- Original showcase teams.
- Franchise Mobile Draft.
- Original awards.
- Original player universe.
- Original league names.
- Original team colors and identities.

## UI Entry Points

Future public main navigation should emphasize:

- Create Player.
- Franchise Mobile Draft.
- Career Locker.
- My Career.
- Training.
- Draft Interview.
- Drills.
- Career News.
- My Team.
- League History.

GM/franchise mode can remain hidden or gated until legally safe and strategically useful.

## Testing Strategy

Domain tests:

- Starter grade distribution by playstyle.
- Draft stock formula.
- Random five-question selection from 20-question bank.
- Tap drill scoring.
- Showcase team fill with CPU prospects.
- Tournament advancement.
- Solo draft placement.
- CPU role/minutes decisions.
- CPU trade/waiver/contract decisions.

Function tests:

- Tournament creation every 30 minutes.
- Team assignment.
- CPU fill.
- Round simulation.
- Draft result generation.
- Solo career world creation.
- Player-bound awards and progression.

UI/source tests:

- GM mode can be hidden without deleting code.
- Main mode routes point to Franchise Mobile Draft.
- Quiz/drill/draft screens render required state.
- Player slot locks and unlocks display correctly.

## First Build Recommendation

Build this in phases after GM mode is finished and parked.

Phase 1:

- Career Locker.
- Create Player.
- Playstyle starter grades.
- Franchise Mobile Draft entry.
- 64-team showcase generation with CPU fill.
- Simmed tournament rounds.

Phase 2:

- Draft Interview Quiz.
- Tap drills.
- Draft stock formula.
- Personal draft result screen.

Phase 3:

- Solo career world creation.
- Rookie role/minutes.
- Training progression.
- CPU coach decisions.

Phase 4:

- Contracts, trades, awards, playoffs, legacy, and deeper CPU GM logic.

## Open Decisions

The design intentionally leaves these for later:

- Final original league name.
- Original pro team count and team identities.
- Exact playstyle list.
- Exact 20 quiz questions.
- Exact tap drill UI.
- Paid slot pricing.
- Whether GM mode is hidden by admin flag, dev flag, or release channel.

These are not blockers for approving the direction.
