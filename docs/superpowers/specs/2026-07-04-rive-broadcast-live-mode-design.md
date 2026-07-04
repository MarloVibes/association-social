# Rive Broadcast Live Mode Design

## Goal

Replace the current code-drawn NBA Live Mode court with a Rive-authored portrait broadcast scene. The app should stop trying to make SVG actors look premium. Rive owns the court, crowd, jumbotron, player rigs, ball motion, and highlight reactions. React Native owns game data, timing, routing, fallback UI, and feeding animation inputs into Rive.

The experience should be fun before it is perfectly realistic: real sim results, exaggerated visual storytelling. Users should see funny, dramatic moments often enough to laugh during most games.

## Product Direction

Live Mode should feel like watching a stylized mobile sports broadcast in portrait mode:

- Full portrait arena scene at the top of the screen.
- Event feed, box score, and matchup stats below the visual by scrolling.
- Rive scene stays visually alive even when detailed replay data is late.
- Game-ending motion does not freeze. The winner celebrates, both teams show sportsmanship, and players exit toward locker rooms.
- Highlights happen often: step-backs, deep threes, posters, ankle breakers, defender falls, bench reactions, crowd eruptions, and jumbotron callouts.

## Rive File Contract

Create one Rive file:

- File: `assets/rive/nba_live_broadcast.riv`
- Artboard: `NBA_Live_Broadcast_Portrait`
- State machine: `GameDirector`

The file should be built as a reusable template. It must not hard-code one team matchup. The app will pass team colors, jersey numbers, scores, clock, play type, and player role triggers.

## Rive Scene Layers

The Rive file should have these top-level layer groups:

1. `Arena_Background`
   - Crowd rows
   - Crowd signs and poster boards
   - Lower bowl
   - Light rigs
   - Ambient arena glow

2. `Jumbotron`
   - Main screen
   - Score strip
   - Cue text area for moments like `LIVE`, `POSTER`, `ANKLE BREAKER`, `DEEP THREE`
   - Optional replay flash animation

3. `Court`
   - Portrait broadcast court perspective
   - Hardwood
   - Paint
   - three-point arcs
   - free throw lines
   - center logo circle
   - left and right baskets/backboards

4. `Players`
   - Ten reusable player rigs
   - Five home, five away
   - Each player rig should support jersey color, number, skin tone, hair style, and body build variation

5. `Ball`
   - Dribble
   - pass
   - shot arc
   - rim bounce
   - dunk finish
   - loose ball

6. `Reactions`
   - Crowd bounce
   - Crowd signs popping up after big plays
   - bench pop
   - camera shake
   - jumbotron flash
   - celebration cluster

## Animation Philosophy

The score and stats remain credible. The presentation is intentionally more entertaining.

Recommended frequency:

- Common every game: step-back shots, flashy passes, hard rebounds, fast-break finishes.
- A few times per game: ankle breakers, chasedown blocks, logo threes, putback dunks.
- Big viral moments: poster dunks, defender falls, bench reactions, jumbotron replay.
- Crowd signs should appear during funny or viral moments, with short messages like `POSTER`, `COOKED`, `LOGO RANGE`, `NO WAY`, and team-colored handmade signs.
- Rare clutch moments: game-winner celebration, team mob, crowd eruption.

The rule is: normal basketball flow, then someone gets embarrassed.

## Required State Machine Inputs

Use these Rive state machine inputs.

### Game Inputs

- `gamePhase`: number
  - `0` pregame
  - `1` live
  - `2` timeout/dead ball
  - `3` final buzzer
  - `4` celebration
  - `5` sportsmanship
  - `6` locker exit

- `playType`: number
  - `0` flow
  - `1` dribble
  - `2` pass
  - `3` jumper
  - `4` pullup_three
  - `5` deep_three
  - `6` stepback_two
  - `7` stepback_three
  - `8` layup
  - `9` dunk
  - `10` poster_dunk
  - `11` putback_dunk
  - `12` block
  - `13` chasedown_block
  - `14` rebound
  - `15` rebound_traffic
  - `16` steal
  - `17` turnover
  - `18` crossover_attack
  - `19` ankle_breaker
  - `20` foul
  - `21` free_throw
  - `22` clutch_celebrate

- `possessionSide`: number
  - `0` away
  - `1` home

- `highlightIntensity`: number
  - `0` ambient
  - `1` normal
  - `2` highlight
  - `3` viral

- `clockPulse`: trigger
- `scorePulse`: trigger
- `jumbotronFlash`: trigger
- `crowdPop`: trigger
- `benchPop`: trigger
- `resetPlay`: trigger

### Team Inputs

Use data binding where possible:

- `homePrimary`
- `homeSecondary`
- `awayPrimary`
- `awaySecondary`
- `homeScore`
- `awayScore`
- `periodLabel`
- `clockText`
- `homeAbbr`
- `awayAbbr`
- `jumbotronCue`

If a value cannot be data-bound cleanly in the first pass, the React Native wrapper may overlay text above the Rive view temporarily. The long-term goal is to keep scorebug and jumbotron text inside Rive.

### Player Inputs

Each player rig should support:

- `playerN_active`
- `playerN_number`
- `playerN_teamSide`
- `playerN_skinTone`
- `playerN_hairStyle`
- `playerN_bodyBuild`
- `playerN_jerseyPrimary`
- `playerN_jerseySecondary`
- `playerN_state`

`playerN_state` should map to:

- `idle`
- `run`
- `space`
- `defend`
- `dribble_attack`
- `runout_dribble`
- `jump_shot`
- `pullup_three`
- `deep_three_release`
- `stepback_two`
- `stepback_three`
- `rim_finish`
- `dunk_finish`
- `poster_dunk`
- `poster_fall`
- `stumble_fall`
- `rebound_gather`
- `rebound_traffic`
- `block_jump`
- `chasedown_block`
- `turnover_react`
- `celebrate`
- `sportsmanship`
- `locker_exit`

## App Integration Contract

React Native will introduce a new component:

- `components/season/NbaRiveBroadcastLiveMode.tsx`

Responsibilities:

- Load `assets/rive/nba_live_broadcast.riv`.
- Use artboard `NBA_Live_Broadcast_Portrait`.
- Use state machine `GameDirector`.
- Map existing `BroadcastMotionPlayer.riveState` into Rive player states.
- Map `BroadcastScene.type` into `playType`.
- Map `BroadcastScene.crowdEnergy` into `highlightIntensity`.
- Pass team colors and scoreboard values.
- Keep the current SVG broadcast component only as fallback if Rive is unavailable.

The app should not attempt to draw premium player animation in SVG after this point.

## Play Type Mapping

Initial mapping from existing app scene data:

- `flow` -> `flow`
- `three` -> `jumper`
- `deep_three` -> `deep_three`
- `dunk` -> `poster_dunk` when defender fall is selected, otherwise `dunk`
- `rim_finish` -> `layup`
- `miss` -> `jumper`
- `rebound` -> `rebound_traffic`
- `block` -> `block`
- `steal` -> `steal`
- `turnover` -> `turnover`
- `ankle_breaker` -> `ankle_breaker`
- `free_throw` -> `free_throw`
- `postgame` -> game phase celebration/sportsmanship/locker exit

The sim should be expanded later to emit more specific tags:

- `stepback_three`
- `stepback_two`
- `pullup_three`
- `poster_dunk`
- `putback_dunk`
- `chasedown_block`
- `clutch_celebrate`

## Highlight Selection Rules

The visual director may embellish the event feed. Example: a normal two-point score can animate as a layup, floater, dunk, or poster depending on player archetype and entertainment roll.

Suggested selection rules:

- High three-point tendency: more pull-up threes, step-back threes, logo threes.
- High handle/playmaking: more crossovers and ankle breakers.
- High dunk/athleticism: more posters and fast-break dunks.
- Bigs: more putbacks, traffic rebounds, blocks.
- Weak defenders: more stumble/fall reactions.
- Clutch pressure: more crowd pop, camera shake, jumbotron flash.

Entertainment rates should be intentionally higher than real life while protecting box score credibility.

## Fallback Behavior

If the `.riv` file is missing or the runtime fails:

- Show the current SVG broadcast fallback.
- Show a small non-blocking message only in development.
- Never block the user with an infinite loading spinner.

If detailed replay events are missing:

- Rive should play pregame/warmup or ambient flow.
- Event Feed should say detailed replay is not available yet.
- The page should remain usable.

## Testing

Add tests for:

- Rive component route guard exists.
- Rive file path constant is correct.
- State mapping covers all existing `BroadcastRiveState` values.
- Missing Rive asset falls back to SVG broadcast.
- Replay loading timeout remains in place.
- No new user-facing `OVR` or raw rating leakage.

Manual verification:

- Open an NBA matchup with no stored timeline yet.
- Confirm the Rive scene appears or fallback appears without infinite loading.
- Simulate a game with events.
- Confirm score, clock, jumbotron, crowd, and player states update.
- Confirm final buzzer transitions through celebration, sportsmanship, locker exit.

## Implementation Phases

### Phase 1: Runtime Contract and Fallback

- Add Rive dependency.
- Add `NbaRiveBroadcastLiveMode` wrapper.
- Add the final asset path constant and fallback behavior.
- Keep current SVG fallback active.
- Wire scene/player state mapping.

### Phase 2: First Rive File

- Create `nba_live_broadcast.riv` in Rive Editor.
- Implement court, crowd, jumbotron, ten simple rigs, ball.
- Implement basic state machine inputs.
- Export `.riv` into `assets/rive/`.

### Phase 3: Highlight Package

- Add step-back 2 and 3.
- Add dramatic poster dunk and poster fall.
- Add crossover and ankle breaker.
- Add chasedown block, putback dunk, rebound in traffic.
- Add crowd, bench, jumbotron reactions.

### Phase 4: Player Identity Binding

- Bind player numbers, colors, body build, skin tone, hair style.
- Make traded players retain visual identity but adopt new team jersey colors.

### Phase 5: Polish and Launch QA

- Reduce old SVG visibility to fallback only.
- Verify memory/performance on iPhone simulator.
- Verify missing replay behavior.
- Verify final game sequence.
- Publish EAS update.

## Open Decision

The first Rive file should start with simple stylized players, not licensed likeness. Player identity should be represented through jersey number, skin tone, hair, accessories, build, and team colors. True likeness can be revisited after launch when licensing and asset pipeline are settled.
