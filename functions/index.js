const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

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
