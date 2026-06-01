# Player Vault Migration Plan

Status: PLANNING — no code changes yet
Created: 2026-05-25

## The Problem

Player data is fragmented across multiple collections, causing:

1. **Duplication.** Players in multiple eras (LeBron exists in `lebron`, `steph`, and `current`) have identity data (name, photo, position, height) repeated. Update one place, miss the others.
2. **Multiple reads per PlayerCard.** Rendering one player requires reading from `era_player_pools` (for team) AND `player_profiles` (for stats/accolades). 2-3 doc reads per card.
3. **No single source of truth for "does this player exist?"** Have to check `era_player_pools` (real players) AND `leagues/{id}/custom_players` (commish-created players).
4. **Hard to update real-world data.** When a real player gets injured / traded in real life, updating their salary, team, or position means touching multiple era docs.
5. **Era pool docs are large.** `era_player_pools/current` has 530 players each with full identity + stats fields embedded. Heavy doc to read/write for any single-player update.

## The Goal

Single canonical record per player. Era pools become lightweight team-by-bref_id maps. Custom players unified into the same vault with a flag.

## Proposed Data Model

### NEW: players/{bref_id_or_custom_id} — The Vault

One doc per unique player. Source of truth for identity + career data.

Real player example (LeBron James):
- bref_id: "jamesle01"
- full_name: "LeBron James"
- position: "SF"
- height, weight, birth_date, jersey_number
- photo_url, photo_url_bref
- accolades: ["MVP x4", "Champion x4", ...]
- seasons: [{ season, team, games, ppg, rpg, apg, ... }]
- eras: ["lebron", "steph", "current"]
- is_custom: false

Custom player example:
- is_custom: true
- created_by_uid, created_by_league
- full_name, position, height, weight
- photo_url (uploaded image)
- salary
- No seasons[] or accolades[] — custom players don't have history

### CHANGED: era_player_pools/{era} — Lightweight Team Maps

Era pools now ONLY contain team rosters by bref_id reference.
- era: "current"
- season: "2025-26"
- teams: { LAL: ["jamesle01", "doncic01", ...], GSW: [...] }

Smaller doc. Faster reads. Single-player updates don't rewrite the whole pool.

### UNCHANGED: era_stats/{era}

Season snapshots stay separate. Era-specific data.

### REMOVED: leagues/{id}/custom_players

Custom players migrate into players/{custom_id} with is_custom: true.
Query for a league's custom players: where is_custom == true AND created_by_league == leagueId.

### UNCHANGED: leagues/{id}/teams/{teamId}

These already store players as objects in an array. Trade snapshots are preserved with the player's state at the time of trade.

## Migration Plan

### Phase 0: Document & Plan (this doc)
Status: DONE

### Phase 1: Build the Vault (no breakage)
Add players/ collection alongside existing data. App still reads from old collections. Vault is built by scraping/seeding.
Risk: 0. Pure additive.

### Phase 2: Wire One Read Site to the Vault
Switch PlayerCard.tsx to read from players/{bref_id} for accolades/seasons instead of player_profiles/{bref_id}.
Risk: Low. Revert one file if broken.

### Phase 3: Wire Remaining Read Sites
Migrate one at a time: roster.tsx, team-roster.tsx, trade-room.tsx, trade-channel.tsx, league-rosters.tsx, pending-players.tsx, create-player.tsx.
Risk: Medium. Methodical.

### Phase 4: Migrate Custom Players Into Vault
1. Read all leagues/{id}/custom_players/{id}
2. Create players/{custom_id} with is_custom: true
3. Validate counts
4. Update create-player.tsx to write to players/
5. Update reads
6. Delete old collection after validation
Risk: Medium-high.

### Phase 5: Slim Down Era Pools
Migrate era_player_pools/{era} from { players: [{full_object}, ...] } to { teams: { LAL: [bref_id, ...] } }.
Validate ruthlessly before swap.
Risk: HIGH. Every read site touches era pools.

### Phase 6: Cleanup
Retire player_profiles/ and leagues/{id}/custom_players/ collections.
Risk: Low.

## Estimated Effort

Per phase, in 2-4 hour sessions:
- Phase 0: Done
- Phase 1: 1 session
- Phase 2: 1 session
- Phase 3: 2-3 sessions
- Phase 4: 2 sessions
- Phase 5: 2 sessions
- Phase 6: 1 session

Total: ~10 sessions over weeks.

## Backwards Compatibility During Migration

Strategies:
1. **Dual-read pattern** — screens try vault first, fall back to old. No risk if vault is incomplete for some players.
2. **Feature flags** — boolean toggle for which collection is read. Easy revert.
3. **Migration validation** — count docs in both before swap. Numbers must match.

## Things To Decide Before Starting

1. **Photo URL strategy.** Basketball-reference scrape (current default) vs NBA.com CDN vs fallback chain?
2. **Position handling.** Multi-position players: primary only, array, or "SG/SF" string?
3. **Custom player era scope.** Tied to one era, all eras, or per-player choice?
4. **Salary in vault?** Or salary per-era only (current shape)?
5. **Retired players.** Jordan in current era — auto-add via vault.eras array or stay separate?

## Trigger to Start

Don't begin Phase 1 until:
- Open questions above are decided
- In-flight pre-launch features done (auth, RevenueCat, push, league photo Blaze, etc.)
- 3+ uninterrupted weeks for methodical execution

If priorities shift to launch features, park this until after launch.

---

## Update May 31, 2026 — Phase 5 Rejected

Phase 5 (slim down era pools to lightweight team maps) was evaluated and **rejected** as architecturally incorrect for this app.

### Why

The plan assumed lazy-loading of individual player details. The actual screens render entire pool arrays at once (roster.tsx renders all 530 current-era players, team-select.tsx loads a full team's roster, etc.).

Splitting identity into vault + joining at render time would mean:
- Every roster screen load = 500+ extra Firestore reads
- Every team selection = batch vault reads for a team's players
- Production Firestore free tier (50K reads/day) blown through in hours by a few active users

### What we kept

- Phase 1 (build vault) — ✅ shipped
- Phase 2 (PlayerCard reads vault) — ✅ shipped
- Phase 3 (roster + team-roster dual-read) — ✅ shipped
- Phase 4 (custom players in vault) — ✅ shipped
- Phase 5 (slim era pools) — REJECTED. Era pools remain fat with full identity data.
- Phase 6 (cleanup) — Adjusted scope. Only delete `player_profiles/*` and `leagues/*/custom_players/*`. Era pools stay as they are.

### Updated source-of-truth model

- **Identity data:** vault (`players/{bref_id}`) is the canonical source for editing/updating identity. Era pools have COPIES of identity data, which is fine — they're just denormalized for read perf.
- **Per-era data:** stays in era pools (salary, team, jersey_number, age, season). Vault doesn't track these.
- **Custom players:** vault with `is_custom: true` flag. Era pools don't store custom players.
- **Free agents:** vault with `free_in_eras` tag.
- **Career data:** vault (seasons, accolades, height, weight, birth_date).

This is a denormalized read-heavy architecture. If we ever migrate to a different DB or care about perfect normalization, revisit. For Firestore + this app's read patterns, it's the right call.
