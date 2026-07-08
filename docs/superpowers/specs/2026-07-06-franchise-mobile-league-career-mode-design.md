# Franchise Mobile League And Franchise Player Mode Design

## Purpose

Franchise Mobile League becomes the long-term public direction for the app while the current GM/franchise mode is finished as a private prototype and later hidden or gated. The first public gameplay mode is Franchise Player Mode: an online-created-player experience built around tournaments, 5v5 Open Gym games, bots, skill-based matchmaking, and upgrade-point progression.

The new mode avoids reliance on real NBA, NFL, MLB, NCAA, school, team, player, league, logo, or draft branding by building an original basketball universe around user-created players.

The core promise is:

> Create a player. Enter Franchise Player Mode. Compete online. Earn points. Build your game.

This mode should feel like a multiplayer sports career RPG. Users are not running real-world teams. They are building their own player, entering shared online events, improving through performance and training, and preparing for the full Franchise Mobile League once enough users exist.

## Product Positioning

Franchise Player Mode is the main user-facing mode for launch direction. Franchise Mobile League becomes the larger online GM/player ecosystem that is marked as coming soon until there are enough users. GM/franchise mode remains valuable as a demo and technology base, but it should not be the public default while licensing risk exists.

Short-term positioning:

- Finish GM mode enough to use as a private demo and investor pitch.
- Build Franchise Player Mode as the public main mode.
- Mark the full online GM/player Franchise Mobile League as coming soon.
- Hide or gate GM mode later through a dev flag, admin-only flag, private demo toggle, or inactive route.
- Reuse stable GM systems where appropriate: simulation, seasons, awards, contracts, CPU decisions, chat/social, scheduling, progression, and roster logic.
- Do not build or market an offline mode. Bots can fill online games, but the product identity is online.

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
- No deleting or restarting during an active tournament to manipulate showcase stock.

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

Playstyle defines starting identity only. It does not make certain skills grow faster. Users can train any skill, and all skills use the same upgrade-point economy as GM mode. A Stretch Big starts with better shooting/rebounding/interior-defense grades than a Floor General, but passing, handle, defense, shooting, and other categories all improve through the same point rules once the career begins.

## Grade Point Engine

Every visible grade maps to a point ceiling. This keeps player growth readable while giving the sim a stable numeric backbone.

Grade ceilings:

- S: 40 points or less.
- A+: 36 points or less.
- A: 34 points or less.
- A-: 31 points or less.
- B+: 29 points or less.
- B: 26 points or less.
- B-: 23 points or less.
- C+: 21 points or less.
- C: 19 points or less.
- C-: 17 points or less.
- D+: 15 points or less.
- D: 13 points or less.
- D-: 11 points or less.
- F+: 8 points or less.
- F: 5 points or less.
- F-: 3 points or less.

The sim should not treat every category as raw scoring. Each stat family gets its own conversion so box scores feel like basketball instead of one generic rating table.

Recommended category conversions:

- Scoring grades use the full grade ceiling as the base scoring pool.
- 3PT adds roughly 2 points of scoring pressure per grade band when the player's approach and team offense create perimeter attempts.
- Finishing and midrange add scoring pressure based on shot profile, usage, and defensive matchup.
- Defense subtracts matchup value. Each defensive grade band should reduce the opposing matchup by about 2 points before role, size, and gameplan modifiers.
- Rebounding uses a smaller scale. S rebounding should top out around 20 rebound impact points.
- Assists use a smaller scale. S passing/playmaking should top out around 15 assist impact points.
- Steals use a smaller scale. S steal impact should top out around 10 steal impact points.
- Blocks use a smaller scale. S block impact should top out around 10 block impact points.

Grade band order for matchup modifiers:

- F- = 1
- F = 2
- F+ = 3
- D- = 4
- D = 5
- D+ = 6
- C- = 7
- C = 8
- C+ = 9
- B- = 10
- B = 11
- B+ = 12
- A- = 13
- A = 14
- A+ = 15
- S = 16

Example conversion helpers:

- 3PT bonus = grade band x 2 when the possession creates a three-point look.
- Defense penalty = defender grade band x 2 removed from the opponent's matching scoring lane.
- Assist impact = passing grade ceiling scaled down so S is about 15.
- Rebound impact = rebounding grade ceiling scaled down so S is about 20.
- Steal impact = steal/perimeter-pressure grade ceiling scaled down so S is about 10.
- Block impact = block/rim-protection grade ceiling scaled down so S is about 10.

The basic equation should be:

> Player output = grade ceiling by category + playstyle tendency + team gameplan modifier + personal approach modifier - opponent matchup defense + randomness + role/minutes modifier.

This means two users with the same grade can still produce different stat lines depending on matchup, offense/defense selections, teammates, minutes, and personal approach.

Example:

- A 3PT shooter with A 3PT gains strong scoring pressure from 3PT, but that pressure can be reduced by a strong perimeter defender, a bad gameplan matchup, or low touches.
- A rim protector with S blocks does not become a 40-point scorer. The S grade converts into block deterrence and interior-defense pressure, closer to a 10-point block-event ceiling plus defensive matchup reduction.
- A rebounder with S rebounding can swing possessions and box score rebounds, but that value converts through a 20-point rebounding scale, not the full scoring scale.

This should make box scores reflect playstyles and matchups:

- 5-Out plus strong shooters should create more threes and spacing-driven assists.
- Pick and Roll plus a good passer and roll big should create assists, rim attempts, and efficient big scoring.
- Post / Inside should raise paint touches, rebounds, fouls, and interior scoring.
- Lockdown defenders should reduce opponent efficiency before the score is generated.
- Rebound-heavy teams should create extra possessions and second-chance points.

## Franchise Player Mode Flow

The launch gameplay path is:

1. Create a player.
2. Choose a permanent playstyle.
3. Enter 5v5 Open Gym for repeatable games and point rewards.
4. Join recurring Franchise Player showcase tournaments.
5. Get randomly assigned to tournament teams.
6. Play through tournament rounds against real users and CPU-filled teams.
7. Complete optional Draft Interview Quiz and tap drills when tied to showcase events.
8. Earn upgrade points, scouting notes, badges, and rankings.
9. Build toward future eligibility for the full Franchise Mobile League.

Open Gym is the repeatable daily loop. Showcase tournaments are the bigger scheduled event loop. The full online GM/player league is the future long-form loop.

## Open Gym

Open Gym is a 5v5 online team-game mode.

Rules:

- Users queue with their created player.
- The system uses skill-based matchmaking where possible.
- Bots fill missing roster spots so games can start without waiting for perfect user volume.
- Teams are temporary pickup teams, not pro teams.
- Games reward upgrade points based on participation, performance, team result, and role fit.
- Rewards should be smaller than major tournament rewards but consistent enough to make Open Gym the daily grind.
- Players can use Open Gym to test playstyles, game approaches, and builds.

Open Gym should feel like quick pickup basketball, not a full league season. It is the safest first multiplayer loop because it can work with a small user base and still feel alive through bots.

## Showcase Tournament

The showcase is a 64-team basketball tournament.

Rules:

- A tournament opens on a recurring 30-minute cycle.
- Users enter as individual created players.
- Users are randomly assigned to teams.
- Each team has five roster spots.
- CPU prospects fill empty spots.
- Teams are temporary showcase teams, not pro teams.
- Each team selects an offense preset and defense preset.
- Each user selects a personal playstyle/game approach for the tournament.
- Each round sims every 30 minutes.

The tournament should feel like an original online showcase, not a licensed college tournament. Do not use real NCAA, school, March Madness, Final Four, conference, or real player branding.

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

## Showcase Stock Formula

Every user who completes a showcase receives a stock score. This score affects rankings, rewards, future league readiness, and eventual Franchise Mobile League draft/event placement once that larger mode is active.

Recommended showcase stock weighting:

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

A great individual performance in a loss can still create strong showcase stock. Winning helps, but it should not erase individual evaluation.

Draft outcome examples:

- "Marlon King was selected with the 1st pick in the Franchise Mobile Draft."
- "Jalen Cross was selected with the 18th pick in the Franchise Mobile Draft."
- "Devon Price was selected with the 30th pick in the Franchise Mobile Draft."

Use "Franchise Mobile Draft" only as the original in-universe draft event for the future league. Do not use "NBA Draft" in the public original mode.

## Draft Interview Quiz

After the showcase, users answer five randomly selected multiple-choice questions from a 20-question bank.

Rules:

- Questions are universal for all playstyles.
- Every question must be multiple choice.
- Each question should have four answer choices.
- One answer should be clearly correct.
- Wrong choices should be believable but not confusing or trick-based.
- Questions cover Franchise Mobile rules, basketball basics, player roles, stats, and gameplan counters.
- All answers should be discoverable through FAQ/help.
- Correct answers provide a small showcase stock boost and Basketball IQ XP.
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

Bad drill results should not destroy showcase stock. They should only miss bonus value.

## Franchise Mobile League Coming Soon

The full Franchise Mobile League is the future online GM/player ecosystem.

It should not launch as the first public mode because it needs enough users to feel real. Until then, it should appear as a coming-soon destination tied to player progress, showcase rankings, and Open Gym reputation.

Future Franchise Mobile League contains:

- Original pro teams.
- User-created players.
- CPU GMs until enough human GM/user volume exists.
- Online GM/player structure.
- Drafts.
- Contracts.
- Trades.
- Role battles.
- Season schedules.
- Playoffs.
- Awards.
- Legacy progression.

This keeps the dream visible without forcing a large online league before the player base is ready.

## Future League Influence Progression

Once Franchise Mobile League launches, the user begins with limited control and earns influence as their player becomes more important.

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

- 5v5 Open Gym games.
- Showcase tournaments.
- Training minigames.
- Quiz and drill events.
- Awards and milestones.
- Activity/readiness.
- Weekly challenges or streaks.
- Future league role success and coach trust once Franchise Mobile League launches.

All rewards grant upgrade points through the same point economy as GM mode. Performance should influence the amount and type of reward, but users can spend earned points on any trainable skill.

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

The first public version should focus on Franchise Player Mode: 5v5 Open Gym, skill-based matchmaking, bot-filled teams, showcase tournaments, drills, quiz events, and player progression.

Later multiplayer expansions can include:

- Full Franchise Mobile League.
- Online GM/player leagues.
- User-created players drafted into shared online teams.
- Friends entering the same showcase or Open Gym squad queues.
- Seasonal world events.
- Player rivalries.
- Agent systems.
- Team chemistry groups.

Do not build the full online GM/player league first. Open Gym plus showcase tournaments keeps scope controlled, works with a smaller player base, and gives users a repeatable online loop sooner.

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
- Franchise Mobile League.
- Franchise Mobile Draft as the original in-universe draft event.
- Original awards.
- Original player universe.
- Original league names.
- Original team colors and identities.

## UI Entry Points

Future public main navigation should emphasize:

- Create Player.
- Franchise Player.
- Open Gym.
- Showcase Tournament.
- Career Locker.
- Training.
- Draft Interview.
- Drills.
- Career News.
- Player Progression.
- Franchise Mobile League Coming Soon.

GM/franchise mode can remain hidden or gated until legally safe and strategically useful.

## Testing Strategy

Domain tests:

- Starter grade distribution by playstyle.
- Grade point ceiling mapping.
- Category conversion scales for scoring, defense, 3PT, rebounds, assists, steals, and blocks.
- Showcase stock formula.
- Random five-question selection from 20-question bank.
- Tap drill scoring.
- Open Gym matchmaking buckets.
- 5v5 bot fill.
- Open Gym point rewards.
- Showcase team fill with CPU prospects.
- Tournament advancement.
- Future draft placement.
- CPU role/minutes decisions.
- CPU trade/waiver/contract decisions.

Function tests:

- Open Gym queue creation.
- Skill-based matchmaking.
- Bot fill for 5v5 games.
- Open Gym result and point rewards.
- Tournament creation every 30 minutes.
- Team assignment.
- CPU fill.
- Round simulation.
- Draft result generation.
- Player-bound awards and progression.

UI/source tests:

- GM mode can be hidden without deleting code.
- Main mode routes point to Franchise Player Mode.
- Open Gym route is visible.
- Franchise Mobile League displays as coming soon.
- Quiz/drill/showcase screens render required state.
- Player slot locks and unlocks display correctly.

## First Build Recommendation

Build this in phases after GM mode is finished and parked.

Phase 1:

- Career Locker.
- Create Player.
- Playstyle starter grades.
- Grade point engine.
- Franchise Player entry.
- 5v5 Open Gym queue.
- Skill-based matchmaking.
- Bot fill.
- Open Gym result and point rewards.

Phase 2:

- 64-team showcase generation with CPU fill.
- Simmed tournament rounds.
- Draft Interview Quiz.
- Tap drills.
- Showcase stock formula.
- Showcase result screen.

Phase 3:

- Training progression.
- Weekly rewards.
- Player rankings.
- Franchise Mobile League coming-soon hub.

Phase 4:

- Full online GM/player league once enough users exist.
- Contracts, trades, awards, playoffs, legacy, and deeper CPU GM logic.

## Open Decisions

The design intentionally leaves these for later:

- Final original league name.
- Original pro team count and team identities.
- Exact playstyle list.
- Exact 20 quiz questions.
- Open Gym reward values.
- Skill-based matchmaking buckets.
- Bot difficulty curve.
- Whether Open Gym supports friend parties later.
- Exact trigger for Franchise Mobile League unlock or launch.
- Exact tap drill UI.
- Paid slot pricing.
- Whether GM mode is hidden by admin flag, dev flag, or release channel.

These are not blockers for approving the direction.
