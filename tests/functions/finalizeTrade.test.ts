import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  authorizeFinalization,
  canonicalCpuTeams,
  matchesCpuIdentity,
  validateTeamBindings,
  resolveCpuIdentity,
  swapAssets,
  tradeFingerprint,
  validationInput,
} = require('../../functions/domain/finalizeTrade.js');

describe('finalizeTrade domain', () => {
  it('allows participants only for mutually confirmed instant trades', () => {
    const league = { tradeApprovalMode: 'instant', commissionerId: 'comm' };
    const room = {
      status: 'open',
      hostUid: 'host',
      guestUid: 'guest',
      hostConfirmed: true,
      guestConfirmed: true,
    };

    expect(authorizeFinalization({ uid: 'host', league, source: room, type: 'room' })).toBe(true);
    expect(authorizeFinalization({
      uid: 'host',
      league: { ...league, tradeApprovalMode: 'veto' },
      source: room,
      type: 'room',
    })).toBe(false);
  });

  it('allows commissioners to finalize pending veto and CPU requests', () => {
    const league = { commissionerId: 'comm', coCommissioners: ['co'] };

    expect(authorizeFinalization({
      uid: 'co',
      league,
      source: { status: 'pending_veto' },
      type: 'room',
    })).toBe(true);
    expect(authorizeFinalization({
      uid: 'comm',
      league,
      source: { status: 'pending' },
      type: 'cpu',
    })).toBe(true);
  });

  it('allows vote-passed rooms only for league members, commissioners, or participants', () => {
    const league = { commissionerId: 'comm', members: ['member'] };

    expect(authorizeFinalization({
      uid: 'member',
      league,
      source: { status: 'vote_passed' },
      type: 'room',
    })).toBe(true);
    expect(authorizeFinalization({
      uid: 'host',
      league: { commissionerId: 'comm', members: [] },
      source: { status: 'vote_passed', hostUid: 'host', guestUid: 'guest' },
      type: 'room',
    })).toBe(true);
    expect(authorizeFinalization({
      uid: 'outsider',
      league,
      source: { status: 'vote_passed', hostUid: 'host', guestUid: 'guest' },
      type: 'room',
    })).toBe(false);
    expect(authorizeFinalization({
      uid: 'member',
      league,
      source: { status: 'pending_vote' },
      type: 'room',
    })).toBe(false);
  });

  it('allows pending veto auto-approval after the deadline only for participants or commissioners', () => {
    const league = { commissionerId: 'comm', members: ['member'] };
    const expired = {
      status: 'pending_veto',
      hostUid: 'host',
      guestUid: 'guest',
      vetoDeadline: 999,
    };
    const pending = { ...expired, vetoDeadline: 1001 };

    expect(authorizeFinalization({
      uid: 'member', league, source: expired, type: 'room', now: 1000,
    })).toBe(false);
    expect(authorizeFinalization({
      uid: 'host', league: { ...league, members: [] }, source: expired, type: 'room', now: 1000,
    })).toBe(true);
    expect(authorizeFinalization({
      uid: 'member', league, source: pending, type: 'room', now: 1000,
    })).toBe(false);
    expect(authorizeFinalization({
      uid: 'comm', league, source: pending, type: 'room', now: 1000,
    })).toBe(true);
  });

  it('rejects active finalization in paused or archived leagues', () => {
    const room = {
      status: 'open',
      hostUid: 'host',
      guestUid: 'guest',
      hostConfirmed: true,
      guestConfirmed: true,
    };

    expect(authorizeFinalization({
      uid: 'host',
      league: { commissionerId: 'comm', tradeApprovalMode: 'instant', paused: true },
      source: room,
      type: 'room',
    })).toBe(false);
    expect(authorizeFinalization({
      uid: 'comm',
      league: { commissionerId: 'comm', archived: true },
      source: { status: 'pending', proposerUid: 'host' },
      type: 'cpu',
    })).toBe(false);
  });

  it('swaps authoritative players and picks', () => {
    const teamA = {
      players: [{ player_id: 'a' }, { player_id: 'stay-a' }],
      picks: [{ id: 'pick-a' }],
    };
    const teamB = {
      players: [{ player_id: 'b' }],
      picks: [{ id: 'pick-b' }],
    };

    expect(swapAssets({
      teamA,
      teamB,
      offerA: [{ player_id: 'a' }],
      offerB: [{ player_id: 'b' }],
      pickOfferA: [{ id: 'pick-a' }],
      pickOfferB: [{ id: 'pick-b' }],
    })).toEqual({
      teamA: {
        players: [{ player_id: 'stay-a' }, { player_id: 'b' }],
        picks: [{ id: 'pick-b' }],
      },
      teamB: {
        players: [{ player_id: 'a' }],
        picks: [{ id: 'pick-a' }],
      },
    });
  });

  it('requires room teams to be distinct, league-bound, and owned by participants', () => {
    const valid = {
      leagueId: 'league',
      type: 'room',
      source: { leagueId: 'league', hostUid: 'host', guestUid: 'guest' },
      teamAId: 'a',
      teamBId: 'b',
      teamA: { gmId: 'host' },
      teamB: { gmId: 'guest' },
    };

    expect(validateTeamBindings(valid)).toEqual({ valid: true });
    expect(validateTeamBindings({ ...valid, teamBId: 'a' }).valid).toBe(false);
    expect(validateTeamBindings({
      ...valid, source: { ...valid.source, leagueId: 'other' },
    }).valid).toBe(false);
    expect(validateTeamBindings({
      ...valid, teamA: { gmId: 'outsider' },
    }).valid).toBe(false);
  });

  it('requires CPU proposer ownership and trusted unclaimed CPU identity', () => {
    expect(validateTeamBindings({
      leagueId: 'league',
      type: 'cpu',
      source: { proposerUid: 'proposer' },
      teamAId: 'a',
      teamBId: 'cpu_BOS',
      teamA: { gmId: 'other' },
      teamB: {},
    }).valid).toBe(false);

    const identity = resolveCpuIdentity({
      requestedId: 'bos',
      requestedAbbr: 'BOS',
      eraTeams: [{ id: 'bos', abbreviation: 'BOS', full_name: 'Boston' }],
      liveTeams: [{ teamId: 'ny', abbreviation: 'NYK', gmId: 'gm' }],
    });
    expect(identity).toEqual(expect.objectContaining({ id: 'bos', abbreviation: 'BOS' }));
    expect(resolveCpuIdentity({
      requestedId: 'bos',
      requestedAbbr: 'BOS',
      eraTeams: [],
      liveTeams: [],
    })).toBeNull();
    expect(resolveCpuIdentity({
      requestedId: 'bos',
      requestedAbbr: 'BOS',
      eraTeams: [{ id: 'bos', abbreviation: 'BOS' }],
      liveTeams: [{ teamId: 'bos', abbreviation: 'BOS', gmId: 'gm' }],
    })).toBeNull();
    expect(matchesCpuIdentity(
      { teamId: 'bos', abbreviation: 'BOS' },
      { id: 'bos', abbreviation: 'BOS' },
    )).toBe(true);
    expect(matchesCpuIdentity(
      { teamId: 'ny', abbreviation: 'NYK' },
      { id: 'bos', abbreviation: 'BOS' },
    )).toBe(false);
  });

  it('derives Madden and MLB CPU identities from trusted pool abbreviations', () => {
    const players = [{ team: 'KC' }, { team: 'kc' }, { team: 'LAD' }, { team: '' }];
    expect(canonicalCpuTeams('madden', players, [])).toEqual([
      { id: 'KC', abbreviation: 'KC' },
      { id: 'LAD', abbreviation: 'LAD' },
    ]);
    expect(canonicalCpuTeams('mlb', players, [])).toEqual([
      { id: 'KC', abbreviation: 'KC' },
      { id: 'LAD', abbreviation: 'LAD' },
    ]);
  });

  it('rejects mismatched requested CPU id and abbreviation', () => {
    expect(resolveCpuIdentity({
      requestedId: 'bos',
      requestedAbbr: 'NYK',
      eraTeams: [
        { id: 'bos', abbreviation: 'BOS' },
        { id: 'nyk', abbreviation: 'NYK' },
      ],
      liveTeams: [],
    })).toBeNull();
  });

  it('honors salary override only when finalization supplies a server approval receipt', () => {
    const base = {
      league: { sport: 'nba', commissionerCanOverride: true, commissionerId: 'comm' },
      source: {
        salaryOverrideApplied: true,
        overrideApprovedBy: 'comm',
        hostOffer: [],
        guestOffer: [],
      },
      teamA: {},
      teamB: {},
      type: 'room',
    };

    expect(validationInput(base).commissionerOverride).toBe(false);
    expect(validationInput({ ...base, approvedOverride: true }).commissionerOverride).toBe(true);
  });

  it('binds override receipts to the exact teams and assets', () => {
    const source = {
      hostTeamId: 'a',
      guestTeamId: 'b',
      hostOffer: [{ player_id: 'p2' }, { player_id: 'p1' }],
      guestOffer: [{ player_id: 'p3' }],
      hostPicks: [{ id: 'pick-1' }],
      guestPicks: [],
    };
    expect(tradeFingerprint(source)).toBe(tradeFingerprint({
      ...source,
      hostOffer: [...source.hostOffer].reverse(),
    }));
    expect(tradeFingerprint(source)).not.toBe(tradeFingerprint({
      ...source,
      guestOffer: [{ player_id: 'changed' }],
    }));
  });
});
