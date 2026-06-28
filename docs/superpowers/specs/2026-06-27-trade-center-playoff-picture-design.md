# Trade Center and Playoff Picture Design

## Goal

Make league home feel more like a full franchise hub by improving trade access and replacing premature postseason generation with a live, standings-based playoff picture.

## Trade Center

The league home screen should expose a clearer Trade Center area instead of making GMs hunt through rosters to begin negotiations.

Trade Center should include:

- `Trade`: opens a team/GM picker and routes into the existing Trade Room with the selected team.
- `Trade Block`: opens the existing trade channel / trade center feed.
- `CPU Trade Requests`: visible to commissioners when relevant.
- Existing trade-room behavior remains the source of truth for offers, picks, salary checks, approvals, vetoes, and execution.

The goal is navigation clarity, not a second trade system.

## Live Playoff Picture

The playoff picture should be dynamic all season. It should not create playoff games early.

It should be calculated from current standings and update as regular-season results change:

- Current playoff seeds.
- Current play-in area when the league format uses play-in.
- Bubble teams just outside the field.
- Completed games and remaining games.
- Clear labels such as `Projected Playoffs`, `Projected Play-In`, and `Outside Looking In`.

The live picture is informational only. It should not lock teams, create series, or create playoff games while regular-season games are still unfinished.

## Season Complete State

When every regular-season game is final, the app should recognize the season as complete.

At that point:

- Standings become the final seed source.
- The playoff picture can show `Final Seeds`.
- Commissioners see a clear action to start the playable postseason schedule.
- Non-commissioners see the final picture and wait for the commissioner to start the postseason.

## Playable Postseason Schedule

Only the playable postseason schedule needs to be created.

This should happen after the regular season is complete and commissioner confirms:

- For play-in format, create the play-in games first.
- After play-in winners are known, create / reveal the full playoff bracket using final seeds plus play-in winners.
- For non-play-in formats, create the bracket directly from final standings.

Existing playoff series and matchup screens should remain the runtime for simulating postseason games.

## Main League Screen Placement

League home should eventually group these as:

- `Trade Center`
  - Trade
  - Trade Block
  - CPU Trade Requests
- `Season`
  - Calendar
  - Standings
  - Playoff Picture
  - Playoff Bracket once postseason has started

This keeps daily season actions visible without burying franchise controls in settings.

## Data Flow

Live playoff picture:

- Reads regular-season schedule games.
- Reads schedule participants and teams.
- Uses standings calculations as the base source.
- Derives projected seeds at render time.

Postseason start:

- Verifies all regular-season games are final.
- Uses final standings as seed source.
- Writes actual playoff/play-in games into the schedule document.
- Keeps commissioner control over the moment the playable postseason begins.

## Error Handling

- If standings cannot be calculated, show a friendly empty state.
- If the season is incomplete, disable postseason start and show remaining game count.
- If too few teams exist for the selected playoff format, show the required team count.
- If a commissioner tries to start postseason twice, preserve the existing bracket and show the current bracket instead of duplicating games.

## Testing

Coverage should include:

- Trade Center `Trade` routes to the right trade room setup.
- Playoff picture updates from standings without writing playoff games.
- Incomplete seasons cannot start postseason.
- Complete seasons can create the playable postseason schedule.
- Play-in format creates play-in first and does not pretend the first round is final before play-in winners exist.
