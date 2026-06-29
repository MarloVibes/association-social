import { describe, expect, it } from 'vitest';
import {
  NBA_STANDARD_LOTTERY_ODDS,
  buildDraftLottery,
  lotteryCandidatesFromStandings,
} from '@/domain/nba/draftLottery';
import type { StandingsRow } from '@/domain/nba/standings';

function row(seed: number): StandingsRow {
  return {
    teamId: `T${seed}`,
    abbreviation: `T${seed}`,
    name: `Team ${seed}`,
    gmId: `gm-${seed}`,
    wins: 31 - seed,
    losses: seed,
    pointsFor: 1000 - seed,
    pointsAgainst: 900 + seed,
    pointDiff: 100 - seed,
    pct: (31 - seed) / 31,
  };
}

describe('NBA draft lottery', () => {
  it('uses flattened current-style odds that total 1000 weighted combinations', () => {
    expect(NBA_STANDARD_LOTTERY_ODDS).toEqual([140, 140, 140, 125, 105, 90, 75, 60, 45, 30, 20, 15, 10, 5]);
    expect(NBA_STANDARD_LOTTERY_ODDS.reduce((sum, value) => sum + value, 0)).toBe(1000);
  });

  it('selects the worst fourteen non-playoff teams from final standings', () => {
    const standings = Array.from({ length: 30 }, (_, index) => row(index + 1));
    const candidates = lotteryCandidatesFromStandings({
      standings,
      playoffTeamIds: standings.slice(0, 16).map(team => team.teamId),
    });

    expect(candidates).toHaveLength(14);
    expect(candidates.map(team => team.teamId)).toEqual([
      'T30', 'T29', 'T28', 'T27', 'T26', 'T25', 'T24',
      'T23', 'T22', 'T21', 'T20', 'T19', 'T18', 'T17',
    ]);
  });

  it('draws four unique lottery picks and appends the rest by reverse standings', () => {
    const standings = Array.from({ length: 30 }, (_, index) => row(index + 1));
    const lottery = buildDraftLottery({
      standings,
      playoffTeamIds: standings.slice(0, 16).map(team => team.teamId),
      seed: 'league:2032:lottery',
    });

    expect(lottery.picks).toHaveLength(30);
    expect(lottery.drawnPicks).toHaveLength(4);
    expect(new Set(lottery.drawnPicks.map(pick => pick.teamId)).size).toBe(4);
    expect(lottery.picks.map(pick => pick.pick)).toEqual(Array.from({ length: 30 }, (_, index) => index + 1));
    expect(lottery.picks.slice(14).map(pick => pick.teamId)).toEqual(standings.slice(0, 16).map(team => team.teamId).reverse());
  });

  it('is deterministic for the same seed and changes for another seed', () => {
    const standings = Array.from({ length: 30 }, (_, index) => row(index + 1));
    const input = {
      standings,
      playoffTeamIds: standings.slice(0, 16).map(team => team.teamId),
    };

    const first = buildDraftLottery({ ...input, seed: 'same' });
    const second = buildDraftLottery({ ...input, seed: 'same' });
    const third = buildDraftLottery({ ...input, seed: 'different' });

    expect(second).toEqual(first);
    expect(third.drawnPicks.map(pick => pick.teamId)).not.toEqual(first.drawnPicks.map(pick => pick.teamId));
  });
});
