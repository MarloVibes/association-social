# Upgrade Point Economy Design

## Goal

Upgrade points should feel like a front-office development budget, not a simple award bonus. Teams should earn currency through winning, rebuilding, activity, and awards, while award-winning players also receive personal development momentum.

## Currencies

### Team Development Points

The main team-wide currency. These points can be spent on any eligible player, subject to grade cost and player-season limits.

### Player-Bound Credits

Credits attached to a specific player. They can only be spent on that player. Some credits are open, and some are restricted to a category such as defense.

### Star Training Tokens

Rare team currency for elite upgrades. A team must spend a Star Training Token to move a player from A+ to S. Only Superstar and Legend players can reach S.

## Earning Rules

Championship teams receive 4 Team Development Points. Finals runner-up teams receive 2 Team Development Points. NBA Cup winners receive 1 Team Development Point. Bottom-five lottery teams in each conference receive 2 Team Development Points, and the bottom-three teams in the league receive one extra rebuild point.

Player awards create both team and player value:

- MVP and Finals MVP: 1 Team Development Point, 1 Star Training Token, and 1 player-bound credit for the winner.
- DPOY: 1 Team Development Point and 1 defense-bound player credit.
- ROY and MIP: 1 Team Development Point and 1 player-bound credit.
- Sixth Man: 1 Team Development Point and 1 player-bound credit.
- All-NBA: 1 player-bound credit.
- All-Defense: 1 defense-bound player credit.
- All-Star: 1 player-bound credit only for first-time All-Stars when that data is available; otherwise no team points.

## Spending Rules

One grade step no longer always costs one point. Costs scale by the target grade:

- Up to B+: 1 point
- A- or A: 2 points
- A+: 3 points
- S: 4 points plus 1 Star Training Token

Player-bound credits reduce the team-point cost by one when the credit applies to the selected player and ability. They do not bypass the Star Training Token requirement for S.

Star, Superstar, and Legend players remain limited to one upgrade per season. Lower tiers can receive multiple upgrades if the team has enough currency.

## UI

The Upgrade Points page should show:

- Team Development Points
- Star Training Tokens
- A short rule summary explaining variable costs and player-bound credits
- Per-player credit badges when a player has available credits
- The actual cost for each possible upgrade

## Storage

Teams store:

- `upgradePoints`
- `starTrainingTokens`
- `upgradePointGrants[seasonKey]`

Players store:

- `playerUpgradeCredits[seasonKey]` as an array of credits
- Existing `upgradeUsage[seasonKey]`

Each credit contains an id, label, remaining count, and optional allowed ability list.

## Testing

Domain tests must prove grant calculations, variable upgrade costs, S-token requirements, and player-bound credit discounts. Function tests must prove grants persist team points, star tokens, and player credits, and spending updates the right balances.
