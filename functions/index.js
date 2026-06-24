const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { validateTrade } = require('./domain/validateTrade');
const {
  authorizeFinalization,
  canonicalCpuTeams,
  matchesCpuIdentity,
  resolveCpuIdentity,
  swapAssets,
  validateTeamBindings,
  validationInput,
} = require('./domain/finalizeTrade');

initializeApp();

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Title shown on the device. Body falls back to the notification's own message.
function titleFor(type) {
  switch (type) {
    case 'trade_offer': return '🤝 New Trade Offer';
    case 'trade_executed': return '✅ Trade Completed';
    case 'trade_declined': return '❌ Trade Declined';
    case 'trade_cancelled': return '⚠️ Trade Cancelled';
    case 'trade_room_opened': return '🤝 Trade Negotiation';
    case 'trade_pending_veto': return '🏛️ Trade Awaiting Review';
    case 'trade_pending_vote': return '🗳️ Trade Up for Vote';
    case 'trade_override_review': return '🔓 Salary Override Review';
    case 'trade_override_approved': return '✅ Override Approved';
    case 'trade_override_denied': return '❌ Override Denied';
    case 'join_accepted': return '🎉 Request Accepted';
    case 'join_denied': return '🚫 Request Declined';
    case 'cocomm_promoted': return '🏛️ You\'re a Co-Commissioner';
    case 'cocomm_demoted': return 'Role Updated';
    case 'mention': return '📣 You were mentioned';
    default: return 'Franchise Social';
  }
}

function notificationKey(n) {
  if (!n || typeof n !== 'object') return JSON.stringify(n);
  if (n.id) return `id:${n.id}`;
  return [
    n.type || '',
    n.leagueId || '',
    n.otherUid || n.fromUid || '',
    n.message || '',
    n.createdAt || '',
  ].join('|');
}

// Notifications present in `after` but not in `before`. Read/unread changes
// must not count as a fresh notification, or opening the inbox can resend pushes.
function newNotifications(before, after) {
  const seen = new Map();
  (before || []).forEach((n) => {
    const key = notificationKey(n);
    seen.set(key, (seen.get(key) || 0) + 1);
  });
  return (after || []).filter((n) => {
    const key = notificationKey(n);
    const count = seen.get(key) || 0;
    if (count === 0) return true;
    seen.set(key, count - 1);
    return false;
  });
}

exports.pushOnNotification = onDocumentUpdated('users/{uid}', async (event) => {
  const before = event.data.before.data() || {};
  const after = event.data.after.data() || {};

  const token = after.pushToken;
  if (!token) return; // device not registered for push

  const fresh = newNotifications(before.notifications, after.notifications);
  if (fresh.length === 0) return; // this update wasn't a new notification

  // Expo accepts a batch array of messages in one POST.
  const messages = fresh.map((n) => ({
    to: token,
    sound: 'default',
    title: titleFor(n.type),
    body: n.message || 'You have a new update.',
    data: {
      type: n.type || '',
      leagueId: n.leagueId || '',
      otherUid: n.otherUid || n.fromUid || '',
      otherTeamId: n.otherTeamId || '',
      otherTeamName: n.otherTeamName || n.fromTeamName || '',
    },
  }));

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });
    const json = await res.json();
    console.log('Expo push sent:', JSON.stringify(json));
  } catch (e) {
    console.error('Expo push failed:', e);
  }
});

/**
 * Atomically redeem a promo code. This is the ONLY path that can mark a code
 * used, which is what makes single-use enforceable — the client cannot bypass
 * it (the promo_codes collection is locked to admin-only access).
 *
 * Code doc shape (promo_codes/{CODE}, CODE uppercased):
 *   active: boolean, plan: 'lifetime'|'promo', months: number, label: string,
 *   maxUses: number (1 = single use), uses: number, redeemedBy: string[]
 *
 * Returns the resolved grant { plan, months, label } on success, or throws an
 * HttpsError the client can show ('not-found', 'failed-precondition',
 * 'already-exists', 'resource-exhausted').
 */
exports.redeemPromoCode = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');

  const code = (request.data && request.data.code ? String(request.data.code) : '').trim().toUpperCase();
  if (!code) throw new HttpsError('invalid-argument', 'No promo code provided.');
  const profile = request.data && request.data.profile;

  const db = getFirestore();
  const ref = db.collection('promo_codes').doc(code);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', "That promo code isn't valid.");
    const c = snap.data() || {};
    if (c.active === false) throw new HttpsError('failed-precondition', 'That code is no longer active.');

    const maxUses = typeof c.maxUses === 'number' ? c.maxUses : 1;
    const uses = typeof c.uses === 'number' ? c.uses : 0;
    const redeemedBy = Array.isArray(c.redeemedBy) ? c.redeemedBy : [];

    if (redeemedBy.includes(uid)) throw new HttpsError('already-exists', "You've already used this code.");
    if (uses >= maxUses) throw new HttpsError('resource-exhausted', 'That code has already been used.');

    let accessUntil = null;
    if ((c.plan || 'promo') !== 'lifetime') {
      const months = typeof c.months === 'number' ? c.months : 0;
      if (months > 0) {
        const d = new Date();
        d.setMonth(d.getMonth() + months);
        accessUntil = d.toISOString();
      }
    }

    tx.update(ref, {
      uses: uses + 1,
      redeemedBy: FieldValue.arrayUnion(uid),
      lastRedeemedAt: FieldValue.serverTimestamp(),
    });

    const profileData = profile && typeof profile === 'object' ? {
      uid,
      email: typeof profile.email === 'string' ? profile.email : '',
      displayName: typeof profile.displayName === 'string' ? profile.displayName : '',
      username: typeof profile.username === 'string' ? profile.username : '',
      usernameLower: typeof profile.usernameLower === 'string' ? profile.usernameLower : '',
      age: typeof profile.age === 'string' ? profile.age : '',
      gender: typeof profile.gender === 'string' ? profile.gender : '',
      gamerTag: typeof profile.gamerTag === 'string' ? profile.gamerTag : '',
      bio: typeof profile.bio === 'string' ? profile.bio : '',
      console: typeof profile.console === 'string' ? profile.console : '',
      favSports: Array.isArray(profile.favSports) ? profile.favSports : [],
      createdAt: typeof profile.createdAt === 'string' ? profile.createdAt : new Date().toISOString(),
      leagues: Array.isArray(profile.leagues) ? profile.leagues : [],
      friends: Array.isArray(profile.friends) ? profile.friends : [],
      friendRequestsSent: Array.isArray(profile.friendRequestsSent) ? profile.friendRequestsSent : [],
      friendRequestsReceived: Array.isArray(profile.friendRequestsReceived) ? profile.friendRequestsReceived : [],
      blockedUsers: Array.isArray(profile.blockedUsers) ? profile.blockedUsers : [],
      dmEnabled: profile.dmEnabled !== false,
      socials: profile.socials && typeof profile.socials === 'object' ? profile.socials : {},
    } : {};

    tx.set(db.collection('users').doc(uid), {
      ...profileData,
      plan: c.plan || 'promo',
      promoCode: code,
      promoLabel: c.label || 'Promo',
      accessUntil,
    }, { merge: true });

    return {
      plan: c.plan || 'promo',
      months: typeof c.months === 'number' ? c.months : 0,
      label: c.label || 'Promo',
      accessUntil,
    };
  });
});

exports.deleteLeague = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');

  const leagueId = request.data && request.data.leagueId ? String(request.data.leagueId) : '';
  if (!leagueId) throw new HttpsError('invalid-argument', 'No league provided.');

  const db = getFirestore();
  const leagueRef = db.collection('leagues').doc(leagueId);
  const leagueSnap = await leagueRef.get();
  if (!leagueSnap.exists) throw new HttpsError('not-found', 'League not found.');

  const league = leagueSnap.data() || {};
  if (league.commissionerId !== uid) {
    throw new HttpsError('permission-denied', 'Only the original commissioner can delete this league.');
  }

  const memberIds = Array.isArray(league.members) ? league.members : [];
  await db.recursiveDelete(leagueRef);

  if (memberIds.length > 0) {
    const batch = db.batch();
    memberIds.forEach((memberId) => {
      batch.set(db.collection('users').doc(memberId), {
        leagues: FieldValue.arrayRemove(leagueId),
      }, { merge: true });
    });
    await batch.commit();
  }

  return { deleted: true };
});

exports.finalizeTrade = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');

  const data = request.data || {};
  const leagueId = data.leagueId ? String(data.leagueId) : '';
  const roomId = data.roomId || data.tradeRoomId;
  const cpuRequestId = data.cpuRequestId || data.requestId;
  if (!leagueId || (!roomId && !cpuRequestId) || (roomId && cpuRequestId)) {
    throw new HttpsError('invalid-argument', 'Provide a league and exactly one trade source.');
  }

  const db = getFirestore();
  const leagueRef = db.collection('leagues').doc(leagueId);
  const type = cpuRequestId ? 'cpu' : 'room';
  const sourceRef = type === 'cpu'
    ? leagueRef.collection('cpu_trade_requests').doc(String(cpuRequestId))
    : leagueRef.collection('trade_rooms').doc(String(roomId));

  return db.runTransaction(async (tx) => {
    const [leagueSnap, sourceSnap] = await Promise.all([
      tx.get(leagueRef),
      tx.get(sourceRef),
    ]);
    if (!leagueSnap.exists) throw new HttpsError('not-found', 'League not found.');
    if (!sourceSnap.exists) throw new HttpsError('not-found', 'Trade not found.');

    const league = leagueSnap.data() || {};
    const source = sourceSnap.data() || {};
    if (
      (type === 'room' && source.status === 'executed')
      || (type === 'cpu' && source.status === 'approved')
    ) {
      return { executed: false, alreadyFinalized: true };
    }
    if (!authorizeFinalization({ uid, league, source, type })) {
      throw new HttpsError('permission-denied', 'This trade cannot be finalized by this user in its current state.');
    }

    const teamAId = type === 'cpu' ? source.proposerTeamId : source.hostTeamId;
    const rawCpuId = String(source.cpuTeamId || '').replace(/^cpu_/, '');
    const requestedCpuAbbr = String(source.cpuAbbr || '');
    let teamBId = type === 'cpu' ? '' : source.guestTeamId;
    if (!teamAId || (type === 'room' && !teamBId) || (type === 'cpu' && !rawCpuId && !requestedCpuAbbr)) {
      throw new HttpsError('failed-precondition', 'Trade is missing a team.', { errors: ['team_missing'] });
    }

    const teamARef = leagueRef.collection('teams').doc(String(teamAId));
    let teamBRef = type === 'room' ? leagueRef.collection('teams').doc(String(teamBId)) : null;
    const sport = league.sport === 'nfl' ? 'madden' : (league.sport || 'nba');
    const eraKey = league.era || 'current';
    const poolKey = sport === 'madden' || sport === 'mlb' ? sport : eraKey;
    const poolRef = db.collection('era_player_pools').doc(poolKey);
    const eraTeamsRef = db.collection('era_rosters').doc(eraKey).collection('teams');
    const liveTeamsRef = leagueRef.collection('teams');
    const reads = [tx.get(teamARef)];
    if (type === 'room') reads.push(tx.get(teamBRef));
    if (type === 'cpu') {
      reads.push(tx.get(poolRef), tx.get(liveTeamsRef));
      if (sport === 'nba') reads.push(tx.get(eraTeamsRef));
    }
    const results = await Promise.all(reads);
    const teamASnap = results[0];
    const teamBSnap = type === 'room' ? results[1] : null;
    const poolSnap = type === 'cpu' ? results[1] : null;
    const liveTeamsSnap = type === 'cpu' ? results[2] : null;
    const eraTeamsSnap = type === 'cpu' && sport === 'nba' ? results[3] : null;
    if (!teamASnap.exists) {
      throw new HttpsError('failed-precondition', 'A trade team no longer exists.', { errors: ['team_missing'] });
    }

    const teamA = teamASnap.data() || {};
    let teamBExists = type === 'room' && teamBSnap.exists;
    let teamB = teamBExists ? (teamBSnap.data() || {}) : {};
    if (type === 'room' && !teamBExists) {
      throw new HttpsError('failed-precondition', 'A trade team no longer exists.', { errors: ['team_missing'] });
    }

    let cpuIdentity = null;
    if (type === 'cpu') {
      const poolPlayers = poolSnap.exists && Array.isArray(poolSnap.data().players)
        ? poolSnap.data().players
        : null;
      if (!poolPlayers) {
        throw new HttpsError('failed-precondition', 'Trusted CPU roster or identity is unavailable.', {
          errors: ['cpu_identity_unavailable'],
        });
      }
      const eraTeams = eraTeamsSnap
        ? eraTeamsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        : [];
      const canonicalTeams = canonicalCpuTeams(sport, poolPlayers, eraTeams);
      const liveTeamDocs = liveTeamsSnap.docs.map((doc) => ({ ref: doc.ref, id: doc.id, ...doc.data() }));
      const liveTeams = liveTeamDocs.map(({ ref, ...team }) => team);
      cpuIdentity = resolveCpuIdentity({
        requestedId: rawCpuId,
        requestedAbbr: requestedCpuAbbr,
        eraTeams: canonicalTeams,
        liveTeams,
      });
      const cpuAbbr = cpuIdentity && String(cpuIdentity.abbreviation || cpuIdentity.abbr || '').toUpperCase();
      const trustedPlayers = poolPlayers && cpuAbbr
        ? poolPlayers.filter((player) => String(player.team || '').toUpperCase() === cpuAbbr)
        : [];
      if (!cpuIdentity || trustedPlayers.length === 0) {
        throw new HttpsError('failed-precondition', 'Trusted CPU roster or identity is unavailable.', {
          errors: ['cpu_identity_unavailable'],
        });
      }
      const existingCpu = liveTeamDocs.find((team) => matchesCpuIdentity(team, cpuIdentity) && !team.gmId);
      teamBId = existingCpu ? existingCpu.id : `cpu_${cpuIdentity.id || cpuIdentity.abbreviation}`;
      teamBRef = existingCpu ? existingCpu.ref : leagueRef.collection('teams').doc(teamBId);
      teamBExists = !!existingCpu;
      teamB = existingCpu || {};
      if (teamBExists && teamB.gmId) {
        throw new HttpsError('permission-denied', 'The requested CPU team is already claimed.');
      }
      if (teamBExists && !matchesCpuIdentity(teamB, cpuIdentity)) {
        throw new HttpsError('failed-precondition', 'CPU team identity does not match the request.', {
          errors: ['cpu_identity_mismatch'],
        });
      }
      if (!teamBExists) {
        teamB = { players: trustedPlayers, picks: [] };
      }
    }

    const binding = validateTeamBindings({
      leagueId, type, source, teamAId, teamBId, teamA, teamB,
    });
    if (!binding.valid) {
      throw new HttpsError('permission-denied', 'Trade team ownership does not match the source.', {
        errors: [binding.reason],
      });
    }

    const input = validationInput({ league, source, teamA, teamB, type });
    const validation = validateTrade(input);
    if (!validation.valid) {
      throw new HttpsError(
        'failed-precondition',
        'Trade validation failed.',
        {
          errors: validation.errors,
          payrollAfter: validation.payrollAfter,
          rosterAfter: validation.rosterAfter,
        },
      );
    }

    const swapped = swapAssets(input);
    tx.update(teamARef, swapped.teamA);
    if (teamBExists) {
      tx.update(teamBRef, swapped.teamB);
    } else {
      tx.set(teamBRef, {
        gmId: null,
        isCpu: true,
        teamId: cpuIdentity.id || cpuIdentity.teamId || source.cpuTeamId,
        name: cpuIdentity.full_name || cpuIdentity.name || source.cpuName || source.cpuAbbr || '',
        abbreviation: cpuIdentity.abbreviation || cpuIdentity.abbr || source.cpuAbbr || '',
        era: league.era || 'current',
        tradeBlock: [],
        ...swapped.teamB,
      });
    }

    const timestamp = FieldValue.serverTimestamp();
    if (type === 'cpu') {
      tx.update(sourceRef, {
        status: 'approved',
        resolvedAt: timestamp,
        resolvedBy: uid,
      });
    } else {
      tx.update(sourceRef, {
        status: 'executed',
        executedAt: timestamp,
        updatedAt: timestamp,
      });
    }
    return {
      executed: true,
      sourceType: type,
      validation: {
        payrollAfter: validation.payrollAfter,
        rosterAfter: validation.rosterAfter,
      },
    };
  });
});
