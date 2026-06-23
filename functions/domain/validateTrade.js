'use strict';

function playerKey(player) {
  return String(player.player_id || player.id || player.bref_id || player.full_name || '');
}

function pickKey(pick) {
  return String(pick.id || '');
}

function salary(player) {
  return Number.isFinite(player.salary) ? Number(player.salary) : 0;
}

function sumPayroll(players) {
  return players.reduce((total, player) => total + salary(player), 0);
}

function ownedAssets(owned, offered, keyOf) {
  const ownedKeys = new Set(owned.map(keyOf).filter(Boolean));
  return offered.every((asset) => {
    const key = keyOf(asset);
    return !!key && ownedKeys.has(key);
  });
}

function offeredSalary(owned, offered) {
  const byKey = new Map(owned.map((player) => [playerKey(player), player]));
  return offered.reduce((total, asset) => {
    const authoritative = byKey.get(playerKey(asset));
    return total + (authoritative ? salary(authoritative) : 0);
  }, 0);
}

function validateTrade(input) {
  const sport = input.sport === 'nfl' ? 'madden' : (input.sport || 'nba');
  const playersA = input.teamA.players || [];
  const playersB = input.teamB.players || [];
  const picksA = input.teamA.picks || [];
  const picksB = input.teamB.picks || [];
  const offerA = input.offerA || [];
  const offerB = input.offerB || [];
  const pickOfferA = input.pickOfferA || [];
  const pickOfferB = input.pickOfferB || [];
  const errors = new Set();

  if (
    !ownedAssets(playersA, offerA, playerKey)
    || !ownedAssets(playersB, offerB, playerKey)
    || !ownedAssets(picksA, pickOfferA, pickKey)
    || !ownedAssets(picksB, pickOfferB, pickKey)
  ) {
    errors.add('ownership');
  }

  const outgoingA = offeredSalary(playersA, offerA);
  const outgoingB = offeredSalary(playersB, offerB);
  const payrollAfter = {
    teamA: sumPayroll(playersA) - outgoingA + outgoingB,
    teamB: sumPayroll(playersB) - outgoingB + outgoingA,
  };
  const rosterAfter = {
    teamA: playersA.length - offerA.length + offerB.length,
    teamB: playersB.length - offerB.length + offerA.length,
  };

  const rosterLimit = sport === 'madden' ? 53 : sport === 'mlb' ? 40 : 15;
  if (rosterAfter.teamA > rosterLimit || rosterAfter.teamB > rosterLimit) {
    errors.add('roster_limit');
  }

  const limitA = sport === 'mlb' ? input.teamABudget : input.teamACap;
  const limitB = sport === 'mlb' ? input.teamBBudget : input.teamBCap;
  if (
    (Number.isFinite(limitA) && payrollAfter.teamA > Number(limitA))
    || (Number.isFinite(limitB) && payrollAfter.teamB > Number(limitB))
  ) {
    errors.add('financial_limit');
  }

  if (sport === 'nba' && (outgoingA > 0 || outgoingB > 0)) {
    const tolerance = Number.isFinite(input.nbaMatchingTolerance)
      ? Number(input.nbaMatchingTolerance)
      : 1.25;
    const buffer = Number.isFinite(input.nbaMatchingBuffer)
      ? Number(input.nbaMatchingBuffer)
      : 100000;
    if (
      outgoingB > outgoingA * tolerance + buffer
      || outgoingA > outgoingB * tolerance + buffer
    ) {
      errors.add('nba_matching');
    }
  }

  if (input.commissionerOverride) {
    errors.delete('financial_limit');
    errors.delete('nba_matching');
  }

  const errorList = Array.from(errors);
  return {
    valid: errorList.length === 0,
    errors: errorList,
    payrollAfter,
    rosterAfter,
  };
}

module.exports = { validateTrade };
