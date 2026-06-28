import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  contractOfferId,
  contractResolutionId,
  buildCpuContractOffers,
  contractDeadlineWarning,
  createContractDeadlineWarningsHandler,
  createInSeasonExtensionInterestHandler,
  createSubmitInSeasonExtensionHandler,
  createSubmitContractOfferHandler,
  deriveCpuNeeds,
  materializeFreeAgencyPool,
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
  it('materializes expired contracts into the free agency pool and removes them from rosters', () => {
    const result = materializeFreeAgencyPool([
      {
        id: 'CHI',
        players: [
          { player_id: 'rose', full_name: 'Derrick Rose', contractYears: 2, team: 'CHI' },
          { player_id: 'deng', full_name: 'Luol Deng', contractYears: 0, contractExpired: true, team: 'CHI' },
          { player_id: 'noah', full_name: 'Joakim Noah', contractYears: 0, contractExpired: true, retired: true, team: 'CHI' },
        ],
      },
      {
        id: 'SAS',
        players: [
          { player_id: 'duncan', full_name: 'Tim Duncan', contractYears: 1, team: 'SAS' },
        ],
      },
    ], 2027);

    expect(result.freeAgents).toEqual([
      expect.objectContaining({
        player_id: 'deng',
        full_name: 'Luol Deng',
        previousTeamId: 'CHI',
        team: '',
        freeAgencySeason: 2027,
      }),
    ]);
    expect(result.teams.find((team: any) => team.id === 'CHI').players.map((item: any) => item.player_id))
      .toEqual(['rose', 'noah']);
  });

  it('creates an in-season extension interest window without expiring the request before the extension deadline', async () => {
    const now = Date.parse('2027-01-01T12:00:00.000Z');
    const leagueRef: any = {
      collection: (name: string) => ({
        kind: `${name}-query`,
        doc: (id: string) => ({ kind: `${name}-doc`, id }),
      }),
    };
    const teamDoc = {
      id: 'CHI',
      ref: { kind: 'team-doc', id: 'CHI' },
      data: () => ({
        name: 'Chicago Bulls',
        gmId: 'gm-1',
        contender: 0.88,
        reputation: 0.8,
        players: [
          { player_id: 'rose', full_name: 'Derrick Rose', contractYears: 1, salary: 5_500_000, overall: 92, label: 'Superstar', loyalty: 0.88, morale: 0.9 },
        ],
      }),
    };
    const sets: any[] = [];
    const updates: any[] = [];
    const tx = {
      get: vi.fn(async (ref) => {
        if (ref === leagueRef) return { exists: true, data: () => ({ sport: 'nba', currentYear: 2027, name: 'NBA Test' }) };
        if (ref.kind === 'teams-query') return { docs: [teamDoc] };
        if (ref.kind === 'extension_windows-query') return { docs: [] };
        return { exists: false, data: () => ({}) };
      }),
      set: vi.fn((ref, data) => sets.push({ ref, data })),
      update: vi.fn((ref, data) => updates.push({ ref, data })),
    };
    const db = {
      collection: (name: string) => name === 'leagues'
        ? { doc: () => leagueRef }
        : { doc: (id: string) => ({ kind: `${name}-doc`, id }) },
      runTransaction: vi.fn(async (callback) => callback(tx)),
    };
    const handler = createInSeasonExtensionInterestHandler({
      getFirestore: () => db,
      serverTimestamp: () => 'server-time',
      now: () => now,
      HttpsError: FakeHttpsError,
      FieldValue: { arrayUnion: (...values: any[]) => ({ op: 'arrayUnion', values }) },
    });

    const result = await handler({ auth: { uid: 'gm-1' }, data: { leagueId: 'league-1', teamId: 'CHI' } });

    expect(result.window.playerId).toBe('rose');
    expect(sets).toContainEqual({
      ref: { kind: 'extension_windows-doc', id: '2027__CHI__rose' },
      data: expect.objectContaining({
        playerId: 'rose',
        status: 'open',
        ask: expect.objectContaining({ role: 'franchise' }),
      }),
    });
    expect(sets[0].data.expiresAt).toBeUndefined();
    expect(updates).toContainEqual({
      ref: { kind: 'users-doc', id: 'gm-1' },
      data: {
        notifications: {
          op: 'arrayUnion',
          values: [expect.objectContaining({
            type: 'extension_interest',
            playerId: 'rose',
          })],
        },
      },
    });
  });

  it('puts a submitted extension offer on a two-hour player response clock', async () => {
    const now = Date.parse('2027-01-01T12:00:00.000Z');
    const leagueRef: any = {
      collection: (name: string) => ({
        kind: `${name}-query`,
        doc: (id: string) => ({ kind: `${name}-doc`, id }),
      }),
    };
    const teamRef = { kind: 'teams-doc', id: 'CHI' };
    const offerWrites: any[] = [];
    const tx = {
      get: vi.fn(async (ref) => {
        if (ref === leagueRef) {
          return {
            exists: true,
            data: () => ({
              sport: 'nba',
              currentYear: 2027,
              extensionDeadlineAt: '2027-02-01T00:00:00.000Z',
            }),
          };
        }
        if (ref === teamRef || (ref.kind === 'teams-doc' && ref.id === 'CHI')) {
          return {
            exists: true,
            id: 'CHI',
            data: () => ({
              id: 'CHI',
              gmId: 'gm-1',
              players: [
                { player_id: 'rose', full_name: 'Derrick Rose', contractYears: 1, salary: 5_500_000, overall: 92, label: 'Superstar', loyalty: 0.88, morale: 0.9 },
              ],
            }),
          };
        }
        if (ref.kind === 'extension_windows-doc') {
          return {
            exists: true,
            data: () => ({
              playerId: 'rose',
              teamId: 'CHI',
              status: 'open',
              ask: { salary: 16_000_000, years: 5, role: 'franchise', acceptanceFloor: 14_000_000 },
            }),
          };
        }
        return { exists: false, data: () => ({}) };
      }),
      set: vi.fn((ref, data) => offerWrites.push({ ref, data })),
      update: vi.fn(),
    };
    const db = {
      collection: (name: string) => name === 'leagues'
        ? { doc: () => leagueRef }
        : { doc: (id: string) => ({ kind: `${name}-doc`, id }) },
      runTransaction: vi.fn(async (callback) => callback(tx)),
    };
    const handler = createSubmitInSeasonExtensionHandler({
      getFirestore: () => db,
      serverTimestamp: () => 'server-time',
      now: () => now,
      HttpsError: FakeHttpsError,
    });

    const result = await handler({
      auth: { uid: 'gm-1' },
      data: {
        leagueId: 'league-1',
        teamId: 'CHI',
        playerId: 'rose',
        salary: 16_000_000,
        years: 5,
        role: 'franchise',
      },
    });

    expect(result.offer.responseDueAt).toBe('2027-01-01T14:00:00.000Z');
    expect(offerWrites).toContainEqual({
      ref: { kind: 'extension_offers-doc', id: '2027__CHI__rose' },
      data: expect.objectContaining({
        playerId: 'rose',
        status: 'pending',
        responseDueAt: '2027-01-01T14:00:00.000Z',
      }),
    });
  });

  it('builds deadline warnings for 25 games remaining, 10 games remaining, and deadline day', () => {
    expect(contractDeadlineWarning({ gamesPlayed: 30, deadlineGame: 55 })).toBe('25_games_remaining');
    expect(contractDeadlineWarning({ gamesPlayed: 45, deadlineGame: 55 })).toBe('10_games_remaining');
    expect(contractDeadlineWarning({ gamesPlayed: 55, deadlineGame: 55 })).toBe('deadline_reached');
    expect(contractDeadlineWarning({ gamesPlayed: 40, deadlineGame: 55 })).toBe(null);
  });

  it('notifies GMs once when a contract or trade deadline warning is reached', async () => {
    const userWrites: any[] = [];
    const scheduleUpdates: any[] = [];
    const leagueDoc = {
      id: 'league-1',
      ref: { kind: 'league-doc', id: 'league-1' },
      data: () => ({ sport: 'nba', name: 'NBA Test', currentYear: 2027, scheduleId: '2027' }),
    };
    const scheduleRef = { kind: 'schedule-doc', id: '2027' };
    const db = {
      collection: (name: string) => {
        if (name === 'leagues') {
          return {
            get: vi.fn(async () => ({ docs: [leagueDoc] })),
            doc: () => leagueDoc.ref,
          };
        }
        if (name === 'users') {
          return {
            doc: (id: string) => ({ kind: 'users-doc', id }),
          };
        }
        return { doc: (id: string) => ({ kind: `${name}-doc`, id }) };
      },
    };
    const leagueRef: any = {
      collection: (name: string) => ({
        doc: () => scheduleRef,
        get: vi.fn(async () => ({
          docs: [
            {
              id: 'CHI',
              data: () => ({
                name: 'Chicago Bulls',
                gmId: 'gm-1',
              }),
            },
          ],
        })),
      }),
    };
    const handler = createContractDeadlineWarningsHandler({
      getFirestore: () => ({
        ...db,
        collection: (name: string) => name === 'leagues'
          ? { get: vi.fn(async () => ({ docs: [{ ...leagueDoc, ref: leagueRef }] })) }
          : db.collection(name),
      }),
      FieldValue: { arrayUnion: (...values: any[]) => ({ op: 'arrayUnion', values }) },
      now: () => Date.parse('2027-01-01T12:00:00.000Z'),
    });
    leagueRef.collection = (name: string) => {
      if (name === 'schedules') {
        return {
          doc: () => ({
            ...scheduleRef,
            get: vi.fn(async () => ({
              exists: true,
              data: () => ({
                gamesPerTeam: 82,
                deadlineNotificationsSent: {},
                games: Array.from({ length: 30 }, (_, index) => ({
                  id: `g-${index}`,
                  status: 'final',
                  homeTeamId: 'CHI',
                  awayTeamId: 'OPP',
                })),
              }),
            })),
            update: vi.fn((data) => scheduleUpdates.push(data)),
          }),
        };
      }
      if (name === 'teams') {
        return {
          get: vi.fn(async () => ({
            docs: [
              {
                id: 'CHI',
                data: () => ({ name: 'Chicago Bulls', gmId: 'gm-1' }),
              },
            ],
          })),
        };
      }
      return { get: vi.fn(async () => ({ docs: [] })) };
    };
    db.collection = (name: string) => name === 'users'
      ? { doc: (id: string) => ({ update: vi.fn((data) => userWrites.push({ id, data })) }) }
      : { get: vi.fn(async () => ({ docs: [{ ...leagueDoc, ref: leagueRef }] })) };

    const result = await handler();

    expect(result.sent).toBeGreaterThan(0);
    expect(userWrites[0]).toMatchObject({
      id: 'gm-1',
      data: {
        notifications: {
          op: 'arrayUnion',
          values: [expect.objectContaining({ type: 'contract_deadline' })],
        },
      },
    });
    expect(scheduleUpdates[0]).toHaveProperty('deadlineNotificationsSent');
  });

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
        {
          id: 'b',
          players: [{ player_id: 'incumbent-b', salary: 50 }],
          rotation: [
            { playerId: 'incumbent-b', minutes: 32 },
            { playerId: 'ghost-player', minutes: 16 },
          ],
        },
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
          contract: expect.objectContaining({
            teamId: 'b',
            salary: 40,
            years: 3,
            role: 'starter',
            signedSeason: 2027,
            stage: 'free_agency',
            status: 'active',
          }),
          contractHistory: [
            expect.objectContaining({
              teamId: 'b',
              salary: 40,
              years: 3,
              role: 'starter',
              signedSeason: 2027,
              stage: 'free_agency',
            }),
          ],
        }),
      ]),
    );
    expect(result.teams.find((team: any) => team.id === 'b').rotation).toEqual([
      { playerId: 'incumbent-b', minutes: 32 },
    ]);

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

  it('uses inferred NBA preferences from player contract history when resolving offers', () => {
    const ringChasingVeteran = {
      player_id: 'vet-1',
      full_name: 'Veteran Winner',
      position: 'SF',
      age: 35,
      salary: 18_000_000,
      contractYears: 4,
      team: 'SAS',
      teamHistory: ['SAS', 'SAS', 'SAS', 'SAS'],
      playoffAppearances: 12,
      label: 'Star',
      overall: 86,
    };
    const result = resolveContractRound({
      sport: 'nba',
      league: {},
      seasonYear: 2027,
      stage: 'free_agency',
      teams: [
        { id: 'lottery', players: [{ salary: 4_000_000 }], contender: 0.2, reputation: 0.4, needs: ['SF'] },
        { id: 'contender', players: [{ salary: 16_000_000 }], contender: 0.95, reputation: 0.9, needs: ['SF'] },
      ],
      offers: [
        {
          id: 'lottery-offer',
          teamId: 'lottery',
          playerId: 'vet-1',
          player: ringChasingVeteran,
          salary: 24_000_000,
          years: 2,
          role: 'starter',
          contender: 0.2,
          need: 1,
          loyalty: 0.3,
          reputation: 0.4,
          seed: 'lottery',
        },
        {
          id: 'contender-offer',
          teamId: 'contender',
          playerId: 'vet-1',
          player: ringChasingVeteran,
          salary: 19_000_000,
          years: 3,
          role: 'starter',
          contender: 0.95,
          need: 1,
          loyalty: 0.7,
          reputation: 0.9,
          seed: 'contender',
        },
      ],
      resolvedPlayerIds: [],
    });

    expect(result.resolutions[0]).toMatchObject({
      playerId: 'vet-1',
      winnerTeamId: 'contender',
      winningOfferId: 'contender-offer',
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
              commissionerId: 'commish',
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
      FieldValue: {
        arrayUnion: (value: any) => ({ arrayUnion: value }),
      },
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
    expect(tx.set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        notifications: expect.objectContaining({
          arrayUnion: expect.objectContaining({ type: 'contract_offer_submitted' }),
        }),
      }),
      { merge: true },
    );
  });
});
