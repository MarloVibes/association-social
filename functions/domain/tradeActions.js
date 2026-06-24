'use strict';

const { isCommissioner } = require('./finalizeTrade');

function isActiveLeague(league) {
  return league.paused !== true
    && league.archived !== true
    && league.status !== 'archived';
}

function deadlineMillis(deadline) {
  if (Number.isFinite(deadline)) return Number(deadline);
  if (deadline && typeof deadline.toMillis === 'function') return deadline.toMillis();
  return NaN;
}

function eligibleVoters(league, source) {
  const participants = new Set([source.hostUid, source.guestUid].filter(Boolean));
  return [...new Set(league.members || [])].filter((uid) => !participants.has(uid));
}

function authorizeTradeAction({
  action, uid, league, source, forceResolve = false, now = Date.now(),
}) {
  if (!isActiveLeague(league)) return { authorized: false, reason: 'league_inactive' };
  const commissioner = isCommissioner(uid, league);
  if (action === 'cast_vote') {
    if (source.status !== 'pending_vote') return { authorized: false, reason: 'invalid_state' };
    if (forceResolve) {
      const participant = source.hostUid === uid || source.guestUid === uid;
      const deadline = deadlineMillis(source.voteDeadline);
      return Number.isFinite(deadline) && now >= deadline && (commissioner || participant)
        ? { authorized: true }
        : { authorized: false, reason: 'force_not_authorized' };
    }
    return eligibleVoters(league, source).includes(uid)
      ? { authorized: true }
      : { authorized: false, reason: 'ineligible_voter' };
  }
  if (action === 'approve_override' || action === 'deny_override') {
    return commissioner && source.pendingOverrideReview === true
      ? { authorized: true }
      : { authorized: false, reason: commissioner ? 'invalid_state' : 'commissioner_required' };
  }
  if (action === 'veto_trade') {
    return commissioner && source.status === 'pending_veto'
      ? { authorized: true }
      : { authorized: false, reason: commissioner ? 'invalid_state' : 'commissioner_required' };
  }
  if (action === 'decline_cpu') {
    return commissioner && source.status === 'pending'
      ? { authorized: true }
      : { authorized: false, reason: commissioner ? 'invalid_state' : 'commissioner_required' };
  }
  return { authorized: false, reason: 'unknown_action' };
}

function resolveVote({ league, source, forceResolve = false }) {
  const eligible = eligibleVoters(league, source);
  const votes = source.tradeVotes || {};
  let approve = 0;
  let reject = 0;
  eligible.forEach((uid) => {
    if (votes[uid] === 'approve') approve += 1;
    if (votes[uid] === 'reject') reject += 1;
  });
  const count = eligible.length;
  const threshold = league.votePassThreshold || 'majority';
  const needed = threshold === 'unanimous'
    ? count
    : threshold === 'two_thirds'
      ? Math.ceil((count * 2) / 3)
      : Math.floor(count / 2) + 1;
  const passed = count === 0 || approve >= needed;
  const cannotPass = count > 0 && reject > count - needed;
  return {
    status: passed ? 'vote_passed' : (forceResolve || cannotPass ? 'rejected' : 'pending_vote'),
    eligibleCount: count,
    approve,
    reject,
    needed,
  };
}

module.exports = {
  authorizeTradeAction,
  eligibleVoters,
  isActiveLeague,
  resolveVote,
};
