import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  authorizeTradeAction,
  resolveVote,
} = require('../../functions/domain/tradeActions.js');
const {
  signAuthorizationReceipt,
  verifyAuthorizationReceipt,
} = require('../../functions/domain/tradeAuthorization.js');

describe('trade decision domain', () => {
  const league = {
    commissionerId: 'comm',
    coCommissioners: ['co'],
    members: ['host', 'guest', 'voter-a', 'voter-b', 'voter-c'],
    votePassThreshold: 'majority',
  };
  const room = {
    status: 'pending_vote',
    hostUid: 'host',
    guestUid: 'guest',
    voteDeadline: 2000,
    tradeVotes: {},
  };

  it('allows only eligible active league members to cast votes', () => {
    expect(authorizeTradeAction({
      action: 'cast_vote', uid: 'voter-a', league, source: room, now: 1000,
    })).toEqual({ authorized: true });
    expect(authorizeTradeAction({
      action: 'cast_vote', uid: 'host', league, source: room, now: 1000,
    }).authorized).toBe(false);
    expect(authorizeTradeAction({
      action: 'cast_vote', uid: 'outsider', league, source: room, now: 1000,
    }).authorized).toBe(false);
    expect(authorizeTradeAction({
      action: 'cast_vote', uid: 'voter-a', league: { ...league, paused: true }, source: room, now: 1000,
    }).authorized).toBe(false);
  });

  it('uses fresh eligible members and ignores participant and stale votes', () => {
    expect(resolveVote({
      league,
      source: {
        ...room,
        tradeVotes: {
          host: 'approve',
          'former-member': 'approve',
          'voter-a': 'approve',
          'voter-b': 'approve',
        },
      },
    })).toEqual(expect.objectContaining({
      status: 'vote_passed',
      eligibleCount: 3,
      approve: 2,
      reject: 0,
      needed: 2,
    }));
  });

  it('rejects early when remaining votes cannot reach the threshold', () => {
    expect(resolveVote({
      league: { ...league, votePassThreshold: 'unanimous' },
      source: {
        ...room,
        tradeVotes: { 'voter-a': 'reject' },
      },
    }).status).toBe('rejected');
  });

  it('allows deadline force resolution only to commissioners or participants after deadline', () => {
    expect(authorizeTradeAction({
      action: 'cast_vote', forceResolve: true, uid: 'host', league, source: room, now: 2000,
    }).authorized).toBe(true);
    expect(authorizeTradeAction({
      action: 'cast_vote', forceResolve: true, uid: 'comm', league, source: room, now: 2000,
    }).authorized).toBe(true);
    expect(authorizeTradeAction({
      action: 'cast_vote', forceResolve: true, uid: 'voter-a', league, source: room, now: 2000,
    }).authorized).toBe(false);
    expect(authorizeTradeAction({
      action: 'cast_vote', forceResolve: true, uid: 'host', league, source: room, now: 1999,
    }).authorized).toBe(false);
  });

  it('requires an active commissioner and pending state for override and CPU decisions', () => {
    const override = { pendingOverrideReview: true };
    expect(authorizeTradeAction({
      action: 'approve_override', uid: 'co', league, source: override,
    }).authorized).toBe(true);
    expect(authorizeTradeAction({
      action: 'deny_override', uid: 'host', league, source: override,
    }).authorized).toBe(false);
    expect(authorizeTradeAction({
      action: 'approve_override', uid: 'comm', league, source: { pendingOverrideReview: false },
    }).authorized).toBe(false);
    expect(authorizeTradeAction({
      action: 'decline_cpu', uid: 'comm', league, source: { status: 'pending' },
    }).authorized).toBe(true);
    expect(authorizeTradeAction({
      action: 'decline_cpu', uid: 'comm', league, source: { status: 'approved' },
    }).authorized).toBe(false);
  });

  it('allows only an active commissioner to veto a pending-veto room', () => {
    const pendingVeto = { status: 'pending_veto' };
    expect(authorizeTradeAction({
      action: 'veto_trade', uid: 'comm', league, source: pendingVeto,
    })).toEqual({ authorized: true });
    expect(authorizeTradeAction({
      action: 'veto_trade', uid: 'co', league, source: pendingVeto,
    })).toEqual({ authorized: true });
    expect(authorizeTradeAction({
      action: 'veto_trade', uid: 'host', league, source: pendingVeto,
    })).toEqual({ authorized: false, reason: 'commissioner_required' });
    expect(authorizeTradeAction({
      action: 'veto_trade', uid: 'comm', league, source: { status: 'open' },
    })).toEqual({ authorized: false, reason: 'invalid_state' });
    expect(authorizeTradeAction({
      action: 'veto_trade', uid: 'comm', league: { ...league, paused: true }, source: pendingVeto,
    })).toEqual({ authorized: false, reason: 'league_inactive' });
  });

  it('accepts signed receipts and rejects forged or tampered receipts', () => {
    const payload = {
      leagueId: 'league',
      roomId: 'room',
      kind: 'salary_override',
      tradeFingerprint: 'fingerprint',
      approved: true,
      approvedBy: 'comm',
    };
    const receipt = signAuthorizationReceipt(payload, 'server-secret');

    expect(verifyAuthorizationReceipt(receipt, payload, 'server-secret')).toBe(true);
    expect(verifyAuthorizationReceipt(
      { ...receipt, approvedBy: 'attacker' },
      { ...payload, approvedBy: 'attacker' },
      'server-secret',
    )).toBe(false);
    expect(verifyAuthorizationReceipt(
      { ...payload, signature: '0'.repeat(64) },
      payload,
      'server-secret',
    )).toBe(false);
  });

  it('requires a signed vote-pass receipt and fails closed without a secret', () => {
    const payload = {
      leagueId: 'league',
      roomId: 'room',
      kind: 'vote_passed',
      tradeFingerprint: 'fingerprint',
      status: 'vote_passed',
      eligibleCount: 3,
      approve: 2,
      reject: 0,
      needed: 2,
      resolvedBy: 'voter-a',
    };
    const receipt = signAuthorizationReceipt(payload, 'server-secret');

    expect(verifyAuthorizationReceipt(null, payload, 'server-secret')).toBe(false);
    expect(verifyAuthorizationReceipt(receipt, payload, '')).toBe(false);
    expect(() => signAuthorizationReceipt(payload, '')).toThrow(/secret/i);
    expect(verifyAuthorizationReceipt(receipt, payload, 'server-secret')).toBe(true);
  });
});
