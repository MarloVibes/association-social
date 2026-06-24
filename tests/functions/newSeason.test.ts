import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  advancePlayerForNewSeason,
  autoCutTeamRoster,
  buildNextSeasonLeague,
  serverRosterCompliance,
} = require('../../functions/franchise/newSeason.js');

describe('new season orchestration', () => {
  it('uses sport roster and finance limits', () => {
    expect(serverRosterCompliance('madden', {
      players: Array.from({ length: 54 }, (_, index) => ({ id: String(index), salary: 1 })),
      salaryCap: 100,
    }, { salaryCap: 100 }).errors).toContain('roster_limit');
    expect(serverRosterCompliance('mlb', {
      players: [{ id: 'a', salary: 151 }],
      budget: 150,
    }, { teamBudget: 150 }).errors).toContain('financial_limit');
  });

  it('auto-cuts the lowest-value CPU surplus', () => {
    const result = autoCutTeamRoster('madden', {
      id: 'cpu',
      salaryCap: 100,
      players: [
        { id: 'star', position: 'QB', overall: 95, salary: 60 },
        { id: 'backup', position: 'QB', overall: 60, salary: 20 },
        { id: 'fringe', position: 'WR', overall: 40, salary: 30 },
      ],
    }, { salaryCap: 100 }, 2, { QB: 1, WR: 0 });

    expect(result.cut.map((player: any) => player.id)).toEqual(['fringe']);
    expect(result.compliance.valid).toBe(true);
  });

  it('ages players, advances contracts, and identifies retirement', () => {
    expect(advancePlayerForNewSeason({
      id: 'p',
      age: 29,
      contractYears: 3,
    }, 2028)).toMatchObject({
      age: 30,
      contractYears: 2,
      contractExpired: false,
      retired: false,
    });
    expect(advancePlayerForNewSeason({
      id: 'new-deal',
      age: 25,
      contractYears: 1,
      signedSeason: 2027,
    }, 2028)).toMatchObject({
      contractYears: 1,
      contractExpired: false,
    });
    expect(advancePlayerForNewSeason({
      id: 'expired',
      age: 25,
      contractYears: 1,
    }, 2028)).toMatchObject({
      contractYears: 0,
      contractExpired: true,
    });
    expect(advancePlayerForNewSeason({
      id: 'old',
      age: 38,
      retirement_year: 2028,
    }, 2028).retired).toBe(true);
  });

  it('increments numeric MLB/NFL seasons without NBA era logic', () => {
    expect(buildNextSeasonLeague({
      sport: 'madden',
      currentYear: 2027,
      era: null,
      offseason: {
        stage: 'ready_for_season',
        seasonYear: 2027,
        version: 8,
      },
    }, 'now')).toMatchObject({
      currentYear: 2028,
      currentSeason: '2028',
      era: null,
      offseason: {
        stage: 'regular_season',
        seasonYear: 2028,
        version: 9,
        draftStatus: 'none',
        contractRoundsComplete: false,
        stageStartedAt: 'now',
      },
    });
  });
});
