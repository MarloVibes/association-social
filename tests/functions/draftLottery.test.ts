import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  buildDraftLottery,
  createRunDraftLotteryHandler,
  hasLotteryComplete,
  standingsFromSchedule,
} = require('../../functions/franchise/draftLottery.js');

class FakeHttpsError extends Error {
  code: string;
  details: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

function game(homeTeamId: string, awayTeamId: string, homeScore: number, awayScore: number) {
  return {
    id: `${homeTeamId}-${awayTeamId}`,
    stage: 'regular',
    status: 'final',
    homeTeamId,
    awayTeamId,
    homeScore,
    awayScore,
  };
}

describe('draft lottery callable', () => {
  it('builds standings and deterministic lottery order for NBA teams', () => {
    const teams = Array.from({ length: 30 }, (_, index) => ({
      id: `T${index + 1}`,
      teamId: `T${index + 1}`,
      abbreviation: `T${index + 1}`,
      name: `Team ${index + 1}`,
    }));
    const games = [
      ...teams.slice(0, 16).map((team, index) => game(team.teamId, `T${30 - index}`, 120, 90)),
      ...teams.slice(16, 30).map((team, index) => game(`T${index + 1}`, team.teamId, 118, 92)),
    ];
    const standings = standingsFromSchedule({ teams, games });
    const lottery = buildDraftLottery({
      standings,
      playoffTeamIds: teams.slice(0, 16).map(team => team.teamId),
      seed: 'league:2032',
    });

    expect(lottery.picks).toHaveLength(30);
    expect(lottery.drawnPicks).toHaveLength(4);
    expect(new Set(lottery.drawnPicks.map((pick: any) => pick.teamId)).size).toBe(4);
    expect(lottery.draftOrder).toEqual(lottery.picks.map((pick: any) => pick.teamId));
  });

  it('detects completed lottery state', () => {
    expect(hasLotteryComplete({ lotteryComplete: true })).toBe(true);
    expect(hasLotteryComplete({ draftLottery: { complete: true } })).toBe(true);
    expect(hasLotteryComplete({})).toBe(false);
  });

  it('writes lottery result, draft order, and member notifications', async () => {
    const leagueRef = {
      collection: (name: string) => ({
        doc: (id: string) => ({ kind: name, id }),
        kind: name,
      }),
    };
    const teams = Array.from({ length: 30 }, (_, index) => ({
      id: `T${index + 1}`,
      data: () => ({
        teamId: `T${index + 1}`,
        abbreviation: `T${index + 1}`,
        name: `Team ${index + 1}`,
        gmId: index === 29 ? 'gm-last' : null,
      }),
    }));
    const leagueSnap = {
      exists: true,
      data: () => ({
        name: 'NBA Test',
        sport: 'nba',
        commissionerId: 'comm',
        members: ['comm', 'gm-last'],
        currentYear: 2032,
        offseason: { stage: 'lottery_and_draft_order', seasonYear: 2032, version: 1 },
      }),
    };
    const teamsSnap = { docs: teams };
    const scheduleSnap = {
      exists: true,
      data: () => ({
        games: teams.map((team, index) => game(`T${Math.max(1, 30 - index)}`, team.id, 120, 90)),
        playoffs: { seeds: teams.slice(0, 16).map(team => ({ teamId: team.id })) },
      }),
    };
    const writes: any[] = [];
    const userWrites: any[] = [];
    const tx = {
      get: vi.fn(async (ref) => {
        if (ref === leagueRef) return leagueSnap;
        if (ref.kind === 'teams') return teamsSnap;
        return scheduleSnap;
      }),
      update: vi.fn((_ref, update) => writes.push(update)),
      set: vi.fn((ref, data) => userWrites.push({ ref, data })),
    };
    const db = {
      collection: (name: string) => ({
        doc: (id: string) => (name === 'leagues' ? leagueRef : { kind: name, id }),
      }),
      runTransaction: vi.fn(async (callback) => callback(tx)),
    };
    const handler = createRunDraftLotteryHandler({
      getFirestore: () => db,
      serverTimestamp: () => 'server-time',
      HttpsError: FakeHttpsError,
      FieldValue: { arrayUnion: (...items: any[]) => ({ op: 'arrayUnion', items }) },
    });

    await expect(handler({
      auth: { uid: 'comm' },
      data: { leagueId: 'league-1', expectedVersion: 1 },
    })).resolves.toEqual({
      draftLottery: expect.objectContaining({ complete: true, seasonYear: 2032 }),
    });
    expect(writes[0]).toEqual(expect.objectContaining({
      draftOrder: expect.any(Array),
      'offseason.lotteryComplete': true,
      'offseason.completedTeamIds': ['T30'],
    }));
    expect(userWrites).toHaveLength(2);
  });
});
