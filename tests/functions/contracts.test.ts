import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  contractOfferId,
  contractResolutionId,
  buildCpuContractOffers,
  createSubmitContractOfferHandler,
  deriveCpuNeeds,
  pendingTeamOfferIds,
  resolveContractRound,
  selectOfferBatch,
  teamCompletionBlocker,
  validateContractOffer,
} = require('../../functions/franchise/contracts.js');

const player = {
  player_id: 'player-1',
  full_name: 'Test Player',
  position: 'QB',
  overall: 88,
  age: 25,
};

class FakeHttpsError extends Error {
  code: string;
  details: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

describe('contract orchestration', () => {
  it('uses one deterministic offer id per stage, team, and player', () => {
    expect(contractOfferId({
      seasonYear: 2027,
      stage: 'free_agency',
      teamId: 'team/a',
      playerId: 'player/1',
    })).toBe(contractOfferId({
      seasonYear: 2027,
      stage: 'free_agency',
      teamId: 'team/a',
      playerId: 'player/1',
    }));
    expect(contractOfferId({
      seasonYear: 2027,
      stage: 're_signing',
      teamId: 'team/a',
      playerId: 'player/1',
    })).not.toBe(contractOfferId({
      seasonYear: 2027,
      stage: 'free_agency',
      teamId: 'team/a',
      playerId: 'player/1',
    }));
    expect(contractResolutionId({
      seasonYear: 2027,
      stage: 'free_agency',
      playerId: 'player/1',
    })).not.toContain('/');
  });

  it('finds only unresolved offers for the current team round', () => {
    expect(pendingTeamOfferIds([
      { id: 'a', teamId: 'team', stage: 'free_agency', version: 2, status: 'pending' },
      { id: 'b', teamId: 'team', stage: 'free_agency', version: 1, status: 'pending' },
      { id: 'c', teamId: 'other', stage: 'free_agency', version: 2, status: 'pending' },
      { id: 'd', teamId: 'team', stage: 'free_agency', version: 2, status: 'accepted' },
    ], 'team', 'free_agency', 2)).toEqual(['a']);
  });

  it('blocks roster-cut completion until the team is compliant', () => {
    expect(teamCompletionBlocker('roster_cuts', {
      players: Array.from({ length: 54 }, (_, index) => ({ id: String(index), salary: 1 })),
      salaryCap: 100,
    }, {
      sport: 'madden',
      salaryCap: 100,
    })).toMatchObject({ reason: 'roster_noncompliant' });
    expect(teamCompletionBlocker('ready_for_season', {}, {})).toBe(null);
  });

  it('keeps every competing offer for a selected player in the same batch', () => {
    expect(selectOfferBatch([
      { id: 'a1', playerId: 'a' },
      { id: 'a2', playerId: 'a' },
      { id: 'b1', playerId: 'b' },
      { id: 'b2', playerId: 'b' },
    ], 3).map((offer: any) => offer.id)).toEqual(['a1', 'a2']);
  });

  it('creates stage-specific CPU offers for vacant teams only', () => {
    const team = {
      id: 'cpu-a',
      players: [{ ...player, age: 25, overall: 88, salary: 20 }],
      needs: ['WR'],
      salaryCap: 200,
    };
    expect(buildCpuContractOffers({
      leagueId: 'league',
      sport: 'madden',
      league: { salaryCap: 200 },
      seasonYear: 2027,
      stage: 're_signing',
      version: 2,
      teams: [team],
      freeAgents: [{ ...player, player_id: 'wr', position: 'WR' }],
      existingOfferIds: [],
    }).map((offer: any) => offer.playerId)).toEqual(['player-1']);

    expect(buildCpuContractOffers({
      leagueId: 'league',
      sport: 'madden',
      league: { salaryCap: 200 },
      seasonYear: 2027,
      stage: 'free_agency',
      version: 3,
      teams: [team, { ...team, id: 'claimed', gmId: 'gm' }],
      freeAgents: [{ ...player, player_id: 'wr', position: 'WR', salary: 10 }],
      existingOfferIds: [],
    }).map((offer: any) => [offer.teamId, offer.playerId])).toEqual([
      ['cpu-a', 'wr'],
    ]);
  });

  it('derives sport positional needs when a vacant team has none stored', () => {
    expect(deriveCpuNeeds('madden', {
      players: [{ position: 'QB' }, { position: 'WR' }],
    })).toEqual(expect.arrayContaining(['HB', 'TE', 'CB']));
    expect(deriveCpuNeeds('mlb', {
      players: [{ position: 'SP' }, { position: 'SS' }],
    })).toEqual(expect.arrayContaining(['RP', 'C', 'OF']));
  });

  it('rejects invalid stages, terms, ownership, and sport finance violations', () => {
    const valid = {
      uid: 'gm',
      league: {
        sport: 'madden',
        salaryCap: 100,
        offseason: { stage: 'free_agency', seasonYear: 2027, version: 3 },
      },
      team: { id: 'team-a', gmId: 'gm', players: [{ salary: 60 }] },
      offer: {
        player,
        playerId: 'player-1',
        salary: 30,
        years: 3,
        role: 'starter',
        expectedStage: 'free_agency',
        expectedVersion: 3,
      },
    };

    expect(validateContractOffer(valid)).toMatchObject({ valid: true });
    expect(validateContractOffer({
      ...valid,
      uid: 'outsider',
    })).toMatchObject({ valid: false, code: 'permission-denied' });
    expect(validateContractOffer({
      ...valid,
      offer: { ...valid.offer, salary: 50 },
    })).toMatchObject({ valid: false, code: 'failed-precondition' });
    expect(validateContractOffer({
      ...valid,
      league: {
        ...valid.league,
        offseason: { ...valid.league.offseason, stage: 'live_draft' },
      },
    })).toMatchObject({ valid: false, code: 'failed-precondition' });

    expect(validateContractOffer({
      ...valid,
      league: {
        ...valid.league,
        offseason: { ...valid.league.offseason, stage: 're_signing' },
      },
      offer: {
        ...valid.offer,
        expectedStage: 're_signing',
        player: { ...player, player_id: 'not-on-team' },
        playerId: 'not-on-team',
      },
    })).toMatchObject({ valid: false, reason: 'not_incumbent' });

    expect(validateContractOffer({
      ...valid,
      team: { ...valid.team, players: [...valid.team.players, player] },
    })).toMatchObject({ valid: false, reason: 'already_rostered' });
  });

  it('resolves each player once and keeps losing offers without signing them', () => {
    const input = {
      sport: 'madden',
      league: { salaryCap: 200 },
      seasonYear: 2027,
      stage: 'free_agency',
      teams: [
        { id: 'a', players: [{ salary: 50 }] },
        { id: 'b', players: [{ salary: 50 }] },
      ],
      offers: [
        {
          id: 'offer-a',
          teamId: 'a',
          playerId: 'player-1',
          player,
          salary: 30,
          years: 2,
          role: 'starter',
          contender: 0.5,
          need: 0.6,
          loyalty: 0.4,
          reputation: 0.5,
          seed: 'a',
        },
        {
          id: 'offer-b',
          teamId: 'b',
          playerId: 'player-1',
          player,
          salary: 40,
          years: 3,
          role: 'starter',
          contender: 0.8,
          need: 0.8,
          loyalty: 0.4,
          reputation: 0.8,
          seed: 'b',
        },
      ],
      resolvedPlayerIds: [],
    };

    const result = resolveContractRound(input);
    expect(result.resolutions).toHaveLength(1);
    expect(result.resolutions[0]).toMatchObject({
      playerId: 'player-1',
      winnerTeamId: 'b',
      winningOfferId: 'offer-b',
    });
    expect(result.offerResults).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'offer-a', status: 'rejected' }),
      expect.objectContaining({ id: 'offer-b', status: 'accepted' }),
    ]));
    expect(result.teams.find((team: any) => team.id === 'b').players).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          player_id: 'player-1',
          salary: 40,
          contractYears: 3,
        }),
      ]),
    );

    const repeated = resolveContractRound({
      ...input,
      resolvedPlayerIds: ['player-1'],
    });
    expect(repeated.resolutions).toEqual([]);
    expect(repeated.offerResults).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'offer-a', status: 'rejected', reason: 'already_resolved' }),
      expect.objectContaining({ id: 'offer-b', status: 'rejected', reason: 'already_resolved' }),
    ]));
  });

  it('skips an unaffordable high score and signs the best valid offer', () => {
    const result = resolveContractRound({
      sport: 'mlb',
      league: { teamBudget: 100 },
      seasonYear: 2027,
      stage: 'free_agency',
      teams: [
        { id: 'a', players: [{ salary: 95 }] },
        { id: 'b', players: [{ salary: 40 }] },
      ],
      offers: [
        {
          id: 'offer-a',
          teamId: 'a',
          playerId: 'player-1',
          player: { ...player, position: 'SS' },
          salary: 20,
          years: 5,
          role: 'starter',
          contender: 1,
          need: 1,
          loyalty: 1,
          reputation: 1,
          seed: 'a',
        },
        {
          id: 'offer-b',
          teamId: 'b',
          playerId: 'player-1',
          player: { ...player, position: 'SS' },
          salary: 15,
          years: 2,
          role: 'starter',
          contender: 0.4,
          need: 0.6,
          loyalty: 0.4,
          reputation: 0.5,
          seed: 'b',
        },
      ],
      resolvedPlayerIds: [],
    });

    expect(result.resolutions[0].winnerTeamId).toBe('b');
    expect(result.offerResults.find((offer: any) => offer.id === 'offer-a')).toMatchObject({
      status: 'invalid',
      reason: 'financial_limit',
    });
  });

  it('does not resolve a player who is already rostered elsewhere', () => {
    const result = resolveContractRound({
      sport: 'madden',
      league: { salaryCap: 200 },
      seasonYear: 2027,
      stage: 'free_agency',
      teams: [
        { id: 'a', players: [{ ...player, salary: 20 }] },
        { id: 'b', players: [] },
      ],
      offers: [{
        id: 'offer-b',
        teamId: 'b',
        playerId: 'player-1',
        player,
        salary: 30,
        years: 2,
        role: 'starter',
        contender: 1,
        need: 1,
        loyalty: 1,
        reputation: 1,
        seed: 'b',
      }],
      resolvedPlayerIds: [],
    });

    expect(result.resolutions).toEqual([]);
    expect(result.offerResults[0]).toMatchObject({
      status: 'invalid',
      reason: 'already_rostered',
    });
  });

  it('stores the authoritative free-agent record instead of a client player snapshot', async () => {
    const refs: any = {};
    refs.league = {
      kind: 'league',
      collection(name: string) {
        return refs[name];
      },
    };
    for (const name of ['teams', 'free_agents', 'contract_resolutions', 'contract_offers']) {
      refs[name] = {
        kind: name,
        doc(id: string) {
          return { kind: `${name}-doc`, id };
        },
      };
    }
    const authoritative = { ...player, full_name: 'Authoritative Name', salary: 12 };
    const tx = {
      get: vi.fn(async (ref: any) => {
        if (ref.kind === 'league') {
          return {
            exists: true,
            data: () => ({
              sport: 'madden',
              salaryCap: 200,
              offseason: { stage: 'free_agency', seasonYear: 2027, version: 3 },
            }),
          };
        }
        if (ref.kind === 'teams-doc') {
          return {
            exists: true,
            id: 'team-a',
            data: () => ({ gmId: 'gm', players: [], needs: ['QB'] }),
          };
        }
        if (ref.kind === 'free_agents') {
          return { docs: [{ data: () => ({ players: [authoritative] }) }] };
        }
        if (ref.kind === 'contract_resolutions-doc') return { exists: false };
        throw new Error(`Unexpected ref ${ref.kind}`);
      }),
      update: vi.fn(),
      set: vi.fn(),
    };
    const db = {
      collection: () => ({ doc: () => refs.league }),
      runTransaction: (callback: any) => callback(tx),
    };
    const handler = createSubmitContractOfferHandler({
      getFirestore: () => db,
      serverTimestamp: () => 'now',
      HttpsError: FakeHttpsError,
    });

    await handler({
      auth: { uid: 'gm' },
      data: {
        leagueId: 'league',
        teamId: 'team-a',
        playerId: 'player-1',
        player: { ...player, full_name: 'Forged Name', salary: 1 },
        salary: 30,
        years: 2,
        role: 'starter',
        expectedStage: 'free_agency',
        expectedVersion: 3,
      },
    });

    expect(tx.set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ player: authoritative }),
    );
  });
});
