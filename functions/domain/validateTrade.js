'use strict';

function playerKey(player) {
  return String(player.player_id || player.id || player.bref_id || player.full_name || '');
}

function pickKey(pick) {
  return String(pick.id || '');
}

function normalizeSport(sport) {
  if (sport === 'nfl' || sport === 'madden') return 'madden';
  if (sport === 'mlb') return 'mlb';
  return 'nba';
}

function validSalary(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function salary(player) {
  return validSalary(player.salary) ? player.salary : 0;
}

function sumPayroll(players) {
  return players.reduce((total, player) => total + salary(player), 0);
}

function teamLabel(value, fallback) {
  const label = String(value || '').trim();
  return label || fallback;
}

function money(value) {
  return `$${(Math.max(0, value) / 1000000).toFixed(1)}M`;
}

function limitMessage(label, kind, payroll, limit) {
  if (!Number.isFinite(limit)) {
    return `${label} needs a valid ${kind === 'budget' ? 'team budget' : 'salary cap'} before this trade can be checked.`;
  }
  const excess = payroll - limit;
  return `${label} will exceed the ${kind === 'budget' ? 'team budget' : 'salary cap'} by about ${money(excess)} after this trade.`;
}

function ownedAssets(owned, offered, keyOf) {
  const ownedKeys = new Set(owned.map(keyOf).filter(Boolean));
  return offered.every((asset) => {
    const key = keyOf(asset);
    return !!key && ownedKeys.has(key);
  });
}

function uniqueAssets(offered, keyOf) {
  const keys = offered.map(keyOf);
  return keys.every(Boolean) && new Set(keys).size === keys.length;
}

function offeredSalariesValid(owned, offered) {
  const byKey = new Map(owned.map((player) => [playerKey(player), player]));
  return offered.every((asset) => {
    const authoritative = byKey.get(playerKey(asset));
    return !!authoritative && validSalary(authoritative.salary);
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
  const sport = normalizeSport(input.sport);
  const playersA = input.teamA.players || [];
  const playersB = input.teamB.players || [];
  const picksA = input.teamA.picks || [];
  const picksB = input.teamB.picks || [];
  const offerA = input.offerA || [];
  const offerB = input.offerB || [];
  const pickOfferA = input.pickOfferA || [];
  const pickOfferB = input.pickOfferB || [];
  const errors = new Set();
  const messages = [];
  const labelA = teamLabel(input.teamALabel, 'Team A');
  const labelB = teamLabel(input.teamBLabel, 'Team B');

  if (
    !ownedAssets(playersA, offerA, playerKey)
    || !ownedAssets(playersB, offerB, playerKey)
    || !ownedAssets(picksA, pickOfferA, pickKey)
    || !ownedAssets(picksB, pickOfferB, pickKey)
    || !uniqueAssets(offerA, playerKey)
    || !uniqueAssets(offerB, playerKey)
    || !uniqueAssets(pickOfferA, pickKey)
    || !uniqueAssets(pickOfferB, pickKey)
  ) {
    errors.add('ownership');
    messages.push('One side includes a player or pick that is not on that roster, or the same asset was added twice.');
  }

  if (!offeredSalariesValid(playersA, offerA) || !offeredSalariesValid(playersB, offerB)) {
    errors.add('invalid_salary');
    messages.push('One offered player has a missing or invalid contract. Refresh the room or check salary overrides.');
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
  if (rosterAfter.teamA > rosterLimit) {
    errors.add('roster_limit');
    messages.push(`${labelA} will exceed the ${rosterLimit}-player roster limit with ${rosterAfter.teamA} players after this trade.`);
  }
  if (rosterAfter.teamB > rosterLimit) {
    errors.add('roster_limit');
    messages.push(`${labelB} will exceed the ${rosterLimit}-player roster limit with ${rosterAfter.teamB} players after this trade.`);
  }

  if (sport !== 'nba') {
    const limitA = sport === 'mlb' ? input.teamABudget : input.teamACap;
    const limitB = sport === 'mlb' ? input.teamBBudget : input.teamBCap;
    const kind = sport === 'mlb' ? 'budget' : 'cap';
    if (!Number.isFinite(limitA) || payrollAfter.teamA > Number(limitA)) {
      errors.add('financial_limit');
      messages.push(limitMessage(labelA, kind, payrollAfter.teamA, Number(limitA)));
    }
    if (!Number.isFinite(limitB) || payrollAfter.teamB > Number(limitB)) {
      errors.add('financial_limit');
      messages.push(limitMessage(labelB, kind, payrollAfter.teamB, Number(limitB)));
    }
  }

  if (sport === 'nba' && (outgoingA > 0 || outgoingB > 0)) {
    const tolerance = Number.isFinite(input.nbaMatchingTolerance)
      ? Number(input.nbaMatchingTolerance)
      : 1.25;
    const buffer = Number.isFinite(input.nbaMatchingBuffer)
      ? Number(input.nbaMatchingBuffer)
      : 100000;
    if (outgoingB > outgoingA * tolerance + buffer) {
      errors.add('nba_matching');
      const shortfall = Math.ceil((outgoingB - buffer) / tolerance - outgoingA);
      messages.push(`${labelA} needs to add about ${money(shortfall)} more outgoing salary for NBA matching.`);
    }
    if (outgoingA > outgoingB * tolerance + buffer) {
      errors.add('nba_matching');
      const shortfall = Math.ceil((outgoingA - buffer) / tolerance - outgoingB);
      messages.push(`${labelB} needs to add about ${money(shortfall)} more outgoing salary for NBA matching.`);
    }
  }

  if (input.commissionerOverride) {
    const removedFinancial = errors.delete('financial_limit');
    const removedMatching = errors.delete('nba_matching');
    if (removedFinancial || removedMatching) {
      messages.push('Commissioner override can bypass salary matching or finance limits, but roster and ownership checks still apply.');
    }
  }

  const errorList = Array.from(errors);
  return {
    valid: errorList.length === 0,
    errors: errorList,
    messages: errorList.length === 0 ? [] : [...new Set(messages)],
    payrollAfter,
    rosterAfter,
  };
}

module.exports = { validateTrade };
