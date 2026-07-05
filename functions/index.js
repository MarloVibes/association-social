const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { validateTrade } = require('./domain/validateTrade');
const {
  authorizeFinalization,
  canonicalCpuTeams,
  evaluateCpuTrade,
  matchesCpuIdentity,
  resolveCpuIdentity,
  swapAssets,
  tradeFingerprint,
  validateTeamBindings,
  validationInput,
} = require('./domain/finalizeTrade');
const {
  authorizeTradeAction,
  resolveVote,
} = require('./domain/tradeActions');
const {
  signAuthorizationReceipt,
  verifyAuthorizationReceipt,
} = require('./domain/tradeAuthorization');
const {
  activeTradeRoomStatuses,
  buildExpiredTradeRoomUpdate,
  isTradeRoomExpired,
  tradeRoomExpiryFromNow,
} = require('./domain/tradeRoomExpiry');
const {
  createAdvanceOffseasonHandler,
  createAdvanceDueOffseasonsHandler,
} = require('./franchise/offseasonCallable');
const {
  createCompleteOffseasonActionHandler,
  createContractDeadlineWarningsHandler,
  createInSeasonExtensionInterestScanHandler,
  createInSeasonExtensionInterestHandler,
  createResolveDueExtensionsHandler,
  createResolveContractRoundHandler,
  createSubmitInSeasonExtensionHandler,
  createSubmitContractOfferHandler,
} = require('./franchise/contracts');
const {
  createMutateDraftClassHandler,
  createPublishDraftClassHandler,
} = require('./franchise/draftClass');
const {
  createRunDraftLotteryHandler,
} = require('./franchise/draftLottery');
const {
  createAutoPickHandler,
  createDraftPickHandler,
  createInitializeLiveDraftHandler,
  createSaveDraftBoardHandler,
} = require('./franchise/liveDraft');
const {
  createCutRosterPlayerHandler,
  createStartNextSeasonHandler,
} = require('./franchise/newSeason');
const {
  createAdvanceNbaCupHandler,
  createGenerateScheduleHandler,
} = require('./franchise/schedule');
const {
  createAcceptMatchupHandler,
  createExpireMatchupRequestHandler,
  createReportGameScoreHandler,
  createRequestMatchupHandler,
  createResetScheduledGameHandler,
  createSimScheduleBatchHandler,
  createSimulateScheduledGameHandler,
} = require('./franchise/matchups');
const {
  createApplyUpgradeGrantsHandler,
  createCompleteDevelopmentAssignmentHandler,
  createSpendPlayerUpgradeHandler,
  createStartDevelopmentAssignmentHandler,
} = require('./franchise/playerUpgrades');
const {
  createFinalizeSeasonAwardsHandler,
} = require('./franchise/awards');
const {
  createManageTeamInjuryHandler,
} = require('./franchise/finalizeGame');
const {
  createRunExpansionDraftHandler,
  createSubmitExpansionProtectionHandler,
} = require('./franchise/expansion');
const {
  createSaveTeamCoachingPresetHandler,
  createSaveTeamRotationHandler,
} = require('./franchise/teamSettings');

initializeApp();

const matchupFunctionOptions = {
  memory: '512MiB',
  timeoutSeconds: 120,
  concurrency: 20,
};

const upgradeFunctionOptions = {
  memory: '512MiB',
  timeoutSeconds: 120,
  concurrency: 20,
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const tradeAuthSecret = defineSecret('TRADE_AUTH_SECRET');

function sportIconForNotification(sport) {
  const normalized = String(sport || 'nba').toLowerCase();
  if (normalized === 'madden' || normalized === 'nfl') return '🏈';
  if (normalized === 'mlb') return '⚾';
  return '🏀';
}

// Title shown on the device. Body falls back to the notification's own message.
function titleFor(type, sport) {
  switch (type) {
    case 'trade_offer': return '🤝 New Trade Offer';
    case 'trade_executed': return '✅ Trade Completed';
    case 'trade_declined': return '❌ Trade Declined';
    case 'trade_cancelled': return '⚠️ Trade Cancelled';
    case 'trade_room_opened': return '🤝 Trade Negotiation';
    case 'trade_pending_veto': return '🏛️ Trade Awaiting Review';
    case 'trade_pending_vote': return '🗳️ Trade Up for Vote';
    case 'trade_vetoed': return '❌ Trade Vetoed';
    case 'trade_override_review': return '🔓 Salary Override Review';
    case 'trade_override_approved': return '✅ Override Approved';
    case 'trade_override_denied': return '❌ Override Denied';
    case 'join_accepted': return '🎉 Request Accepted';
    case 'join_denied': return '🚫 Request Declined';
    case 'cocomm_promoted': return '🏛️ You\'re a Co-Commissioner';
    case 'cocomm_demoted': return 'Role Updated';
    case 'mention': return '📣 You were mentioned';
    case 'matchup_request': return `${sportIconForNotification(sport)} Matchup Request`;
    case 'matchup_accepted': return '✅ Matchup Accepted';
    case 'game_ready': return '🎮 Game Ready';
    case 'game_simulated': return '📊 Game Simulated';
    case 'game_final': return '🏁 Final Score';
    case 'score_reported': return '🧾 Score Reported';
    case 'injury_update': return '🩺 Injury Update';
    case 'schedule_created': return '📅 Schedule Ready';
    case 'schedule_updated': return '📅 Schedule Updated';
    case 'nba_cup':
    case 'nba_cup_advanced': return '🏆 NBA Cup Update';
    case 'game_reset': return '🔁 Game Reset';
    case 'draft_started': return '🎙️ Draft Started';
    case 'draft_pick': return '✅ Draft Pick In';
    case 'draft_auto_pick': return '⏱️ Auto Pick Made';
    case 'draft_turn': return '⏳ You Are On The Clock';
    case 'draft_class_ready': return '📋 Draft Class Ready';
    case 'contract_round': return '💼 Contract Round';
    case 'extension_interest': return '💼 Extension Interest';
    case 'extension_offer_submitted': return '💼 Extension Offer';
    case 'contract_deadline': return '⏳ Deadline Warning';
    case 'free_agency': return '📝 Free Agency';
    case 'offseason_stage': return '🏛️ Offseason Update';
    case 'roster_compliance':
    case 'roster_cuts': return '✂️ Roster Cuts';
    case 'expansion':
    case 'expansion_draft': return '🌆 Expansion Update';
    case 'season_awards':
    case 'awards_finalized': return '🏆 Trophy Case';
    case 'upgrade_points': return '⬆️ Upgrade Points';
    default: return 'Franchise Mobile';
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

function assetKey(asset) {
  return String(asset && (asset.player_id || asset.id || asset.bref_id || asset.full_name) || '');
}

function assetsByKeys(assets, keys) {
  const wanted = new Set((keys || []).map((key) => String(key)));
  return (assets || []).filter((asset) => wanted.has(assetKey(asset)));
}

function cpuStatusForDecision(decision) {
  if (decision === 'accept') return 'cpu_accepted';
  if (decision === 'decline') return 'declined';
  return 'pending';
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
    title: titleFor(n.type, n.sport || n.leagueSport),
    body: n.message || 'You have a new update.',
    data: {
      type: n.type || '',
      leagueId: n.leagueId || '',
      otherUid: n.otherUid || n.fromUid || '',
      otherTeamId: n.otherTeamId || '',
      otherTeamName: n.otherTeamName || n.fromTeamName || '',
      gameId: n.gameId || n.scheduleGameId || n.matchupId || '',
      competition: n.competition || n.scheduleCompetition || 'regular',
      scheduleId: n.scheduleId || '',
      teamId: n.teamId || n.otherTeamId || '',
      seasonYear: n.seasonYear || '',
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

exports.advanceOffseasonStage = onCall(createAdvanceOffseasonHandler({
  getFirestore,
  serverTimestamp: () => FieldValue.serverTimestamp(),
  HttpsError,
  FieldValue,
}));

exports.advanceDueOffseasons = onSchedule('every 1 minutes', createAdvanceDueOffseasonsHandler({
  getFirestore,
  serverTimestamp: () => FieldValue.serverTimestamp(),
  now: () => Date.now(),
  FieldValue,
}));

exports.submitContractOffer = onCall(createSubmitContractOfferHandler({
  getFirestore,
  serverTimestamp: () => FieldValue.serverTimestamp(),
  HttpsError,
  FieldValue,
}));

exports.createInSeasonExtensionInterest = onCall(createInSeasonExtensionInterestHandler({
  getFirestore,
  serverTimestamp: () => FieldValue.serverTimestamp(),
  now: () => Date.now(),
  HttpsError,
  FieldValue,
}));

exports.submitInSeasonExtension = onCall(createSubmitInSeasonExtensionHandler({
  getFirestore,
  serverTimestamp: () => FieldValue.serverTimestamp(),
  now: () => Date.now(),
  HttpsError,
}));

exports.sendContractDeadlineWarnings = onSchedule('every 60 minutes', createContractDeadlineWarningsHandler({
  getFirestore,
  now: () => Date.now(),
  FieldValue,
}));

exports.scanInSeasonExtensionInterest = onSchedule('every 24 hours', createInSeasonExtensionInterestScanHandler({
  getFirestore,
  serverTimestamp: () => FieldValue.serverTimestamp(),
  now: () => Date.now(),
  FieldValue,
}));

exports.resolveDueExtensions = onSchedule('every 10 minutes', createResolveDueExtensionsHandler({
  getFirestore,
  serverTimestamp: () => FieldValue.serverTimestamp(),
  now: () => Date.now(),
  FieldValue,
}));

exports.expireStaleTradeRooms = onSchedule('every 1 minutes', async () => {
  const db = getFirestore();
  const now = Date.now();
  const cutoff = new Date(now - (15 * 60 * 1000));
  const [explicitSnap, fallbackSnap] = await Promise.all([
    db.collectionGroup('trade_rooms').where('expiresAtMs', '<=', now).limit(300).get(),
    db.collectionGroup('trade_rooms').where('updatedAt', '<=', cutoff).limit(300).get(),
  ]);
  const seen = new Set();
  const docs = [];
  explicitSnap.docs.concat(fallbackSnap.docs).forEach((snap) => {
    if (seen.has(snap.ref.path)) return;
    seen.add(snap.ref.path);
    const data = snap.data() || {};
    if (activeTradeRoomStatuses().includes(data.status) && isTradeRoomExpired(data, now)) {
      docs.push(snap);
    }
  });
  if (docs.length === 0) return { expired: 0 };

  let batch = db.batch();
  let count = 0;
  const update = buildExpiredTradeRoomUpdate(FieldValue.serverTimestamp());
  for (const snap of docs) {
    batch.update(snap.ref, update);
    count += 1;
    if (count % 450 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  await batch.commit();
  return { expired: docs.length };
});

exports.resolveFreeAgencyRound = onCall(createResolveContractRoundHandler({
  getFirestore,
  serverTimestamp: () => FieldValue.serverTimestamp(),
  HttpsError,
  FieldValue,
}));

exports.completeOffseasonTeamAction = onCall(createCompleteOffseasonActionHandler({
  getFirestore,
  serverTimestamp: () => FieldValue.serverTimestamp(),
  HttpsError,
}));

exports.mutateDraftClass = onCall(createMutateDraftClassHandler({
  getFirestore,
  serverTimestamp: () => FieldValue.serverTimestamp(),
  HttpsError,
}));

exports.publishDraftClass = onCall(createPublishDraftClassHandler({
  getFirestore,
  serverTimestamp: () => FieldValue.serverTimestamp(),
  HttpsError,
}));

exports.runDraftLottery = onCall(createRunDraftLotteryHandler({
  getFirestore,
  serverTimestamp: () => FieldValue.serverTimestamp(),
  HttpsError,
  FieldValue,
}));

exports.initializeLiveDraft = onCall(createInitializeLiveDraftHandler({
  getFirestore,
  now: () => Date.now(),
  HttpsError,
}));

exports.makeDraftPick = onCall(createDraftPickHandler({
  getFirestore,
  now: () => Date.now(),
  HttpsError,
}));

exports.autoPickDraftSelection = onCall(createAutoPickHandler({
  getFirestore,
  now: () => Date.now(),
  HttpsError,
}));

exports.saveDraftBoard = onCall(createSaveDraftBoardHandler({
  getFirestore,
  serverTimestamp: () => FieldValue.serverTimestamp(),
  HttpsError,
}));

exports.cutRosterPlayer = onCall(createCutRosterPlayerHandler({
  getFirestore,
  serverTimestamp: () => FieldValue.serverTimestamp(),
  HttpsError,
}));

exports.startNextSeason = onCall(createStartNextSeasonHandler({
  getFirestore,
  serverTimestamp: () => FieldValue.serverTimestamp(),
  HttpsError,
}));

exports.generateNbaSchedule = onCall(createGenerateScheduleHandler({
  getFirestore,
  serverTimestamp: () => FieldValue.serverTimestamp(),
  HttpsError,
}));

exports.advanceNbaCup = onCall(createAdvanceNbaCupHandler({
  getFirestore,
  HttpsError,
}));

exports.requestMatchup = onCall(matchupFunctionOptions, createRequestMatchupHandler({
  getFirestore,
  now: () => Date.now(),
  HttpsError,
}));

exports.acceptMatchup = onCall(matchupFunctionOptions, createAcceptMatchupHandler({
  getFirestore,
  now: () => Date.now(),
  HttpsError,
}));

exports.simulateScheduledGame = onCall(matchupFunctionOptions, createSimulateScheduledGameHandler({
  getFirestore,
  FieldValue,
  now: () => Date.now(),
  HttpsError,
}));

exports.simScheduleBatch = onCall(matchupFunctionOptions, createSimScheduleBatchHandler({
  getFirestore,
  now: () => Date.now(),
  HttpsError,
}));

exports.reportGameScore = onCall(matchupFunctionOptions, createReportGameScoreHandler({
  getFirestore,
  now: () => Date.now(),
  HttpsError,
}));

exports.expireMatchupRequest = onCall(matchupFunctionOptions, createExpireMatchupRequestHandler({
  getFirestore,
  now: () => Date.now(),
  HttpsError,
}));

exports.resetScheduledGame = onCall(matchupFunctionOptions, createResetScheduledGameHandler({
  getFirestore,
  now: () => Date.now(),
  HttpsError,
}));

exports.spendPlayerUpgrade = onCall(upgradeFunctionOptions, createSpendPlayerUpgradeHandler({
  getFirestore,
  HttpsError,
}));

exports.applyUpgradeGrants = onCall(upgradeFunctionOptions, createApplyUpgradeGrantsHandler({
  getFirestore,
  HttpsError,
  FieldValue,
}));

exports.startDevelopmentAssignment = onCall(createStartDevelopmentAssignmentHandler({
  getFirestore,
  HttpsError,
}));

exports.completeDevelopmentAssignment = onCall(createCompleteDevelopmentAssignmentHandler({
  getFirestore,
  HttpsError,
}));

exports.finalizeSeasonAwards = onCall(createFinalizeSeasonAwardsHandler({
  getFirestore,
  HttpsError,
  FieldValue,
}));

exports.submitExpansionProtection = onCall(createSubmitExpansionProtectionHandler({
  getFirestore,
  HttpsError,
}));

exports.runExpansionDraft = onCall(createRunExpansionDraftHandler({
  getFirestore,
  HttpsError,
}));

exports.manageTeamInjury = onCall(createManageTeamInjuryHandler({
  getFirestore,
  HttpsError,
}));

exports.saveTeamRotation = onCall(createSaveTeamRotationHandler({
  getFirestore,
  serverTimestamp: () => FieldValue.serverTimestamp(),
  HttpsError,
}));

exports.saveTeamCoachingPreset = onCall(createSaveTeamCoachingPresetHandler({
  getFirestore,
  serverTimestamp: () => FieldValue.serverTimestamp(),
  HttpsError,
}));

exports.submitCpuTradeRequest = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const data = request.data || {};
  const leagueId = data.leagueId ? String(data.leagueId) : '';
  const proposerTeamId = data.proposerTeamId ? String(data.proposerTeamId) : '';
  const rawCpuId = data.cpuTeamId ? String(data.cpuTeamId).replace(/^cpu_/, '') : '';
  const requestedCpuAbbr = data.cpuAbbr ? String(data.cpuAbbr) : '';
  const giveKeys = Array.isArray(data.giveKeys) ? data.giveKeys.map(String).filter(Boolean) : [];
  const getKeys = Array.isArray(data.getKeys) ? data.getKeys.map(String).filter(Boolean) : [];
  if (!leagueId || !proposerTeamId || (!rawCpuId && !requestedCpuAbbr)) {
    throw new HttpsError('invalid-argument', 'Provide league, team, and CPU team.');
  }
  if (giveKeys.length === 0 && getKeys.length === 0) {
    throw new HttpsError('invalid-argument', 'Pick at least one trade asset.');
  }

  const db = getFirestore();
  const leagueRef = db.collection('leagues').doc(leagueId);
  const proposerTeamRef = leagueRef.collection('teams').doc(proposerTeamId);
  const userRef = db.collection('users').doc(uid);
  const requestRef = leagueRef.collection('cpu_trade_requests').doc();
  const createdAt = new Date().toISOString();

  return db.runTransaction(async (tx) => {
    const [leagueSnap, proposerTeamSnap, userSnap] = await Promise.all([
      tx.get(leagueRef),
      tx.get(proposerTeamRef),
      tx.get(userRef),
    ]);
    if (!leagueSnap.exists) throw new HttpsError('not-found', 'League not found.');
    if (!proposerTeamSnap.exists) throw new HttpsError('failed-precondition', 'Your team was not found.');
    const league = leagueSnap.data() || {};
    const proposerTeam = proposerTeamSnap.data() || {};
    const commissioner = league.commissionerId === uid || (league.coCommissioners || []).includes(uid);
    const inactive = league.paused === true || league.archived === true || league.status === 'archived';
    if (inactive) throw new HttpsError('failed-precondition', 'This league is not accepting trades right now.');
    if (proposerTeam.gmId !== uid) throw new HttpsError('permission-denied', 'You can only trade from your own team.');
    if (league.allowCpuTrades !== true && !commissioner) {
      throw new HttpsError('failed-precondition', 'CPU trades are disabled for this league.');
    }

    const sport = league.sport === 'nfl' ? 'madden' : (league.sport || 'nba');
    const eraKey = league.era || 'current';
    const poolKey = sport === 'madden' || sport === 'mlb' ? sport : eraKey;
    const poolRef = db.collection('era_player_pools').doc(poolKey);
    const eraTeamsRef = db.collection('era_rosters').doc(eraKey).collection('teams');
    const liveTeamsRef = leagueRef.collection('teams');
    const reads = [tx.get(poolRef), tx.get(liveTeamsRef)];
    if (sport === 'nba') reads.push(tx.get(eraTeamsRef));
    const [poolSnap, liveTeamsSnap, eraTeamsSnap] = await Promise.all(reads);
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
    const cpuIdentity = resolveCpuIdentity({
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
    if (existingCpu && existingCpu.gmId) {
      throw new HttpsError('permission-denied', 'The requested CPU team is already claimed.');
    }
    const cpuTeam = existingCpu || {
      players: trustedPlayers,
      picks: [],
      teamId: cpuIdentity.id || cpuIdentity.teamId || rawCpuId,
      name: cpuIdentity.full_name || cpuIdentity.name || data.cpuName || requestedCpuAbbr || '',
      abbreviation: cpuIdentity.abbreviation || cpuIdentity.abbr || requestedCpuAbbr || '',
    };
    const give = assetsByKeys(proposerTeam.players || [], giveKeys);
    const get = assetsByKeys(cpuTeam.players || trustedPlayers, getKeys);
    if (give.length !== giveKeys.length || get.length !== getKeys.length) {
      throw new HttpsError('failed-precondition', 'One or more selected players no longer belongs to that team.', {
        errors: ['asset_missing'],
      });
    }

    const user = userSnap.exists ? (userSnap.data() || {}) : {};
    const source = {
      give,
      get,
      givePicks: [],
      getPicks: [],
    };
    const cpuDecision = evaluateCpuTrade({
      league,
      source,
      proposerTeam,
      cpuTeam,
    });
    const status = cpuStatusForDecision(cpuDecision.decision);
    const timestamp = FieldValue.serverTimestamp();
    const proposerName = user.displayName || user.username || 'A GM';
    const requestDoc = {
      leagueId,
      proposerUid: uid,
      proposerName,
      proposerTeamId,
      proposerTeamName: proposerTeam.name || '',
      cpuTeamId: rawCpuId || cpuIdentity.id || cpuIdentity.teamId || '',
      cpuAbbr: cpuIdentity.abbreviation || cpuIdentity.abbr || requestedCpuAbbr || '',
      cpuName: cpuIdentity.full_name || cpuIdentity.name || data.cpuName || requestedCpuAbbr || '',
      cpuRoster: cpuTeam.players || trustedPlayers,
      give,
      get,
      givePicks: [],
      getPicks: [],
      status,
      cpuDecision,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    if (status === 'declined') {
      requestDoc.resolvedAt = timestamp;
      requestDoc.resolvedBy = 'cpu';
    }
    tx.set(requestRef, requestDoc);

    if (status === 'pending' && league.commissionerId) {
      tx.set(db.collection('users').doc(league.commissionerId), {
        notifications: FieldValue.arrayUnion({
          id: `cpu-trade-review:${leagueId}:${requestRef.id}`,
          type: 'cpu_trade_request',
          leagueId,
          leagueName: league.name || '',
          requestId: requestRef.id,
          fromUid: uid,
          fromName: proposerName,
          createdAt,
          message: `${proposerName} requested a close CPU trade for your approval.`,
        }),
      }, { merge: true });
    } else if (status === 'declined') {
      tx.set(userRef, {
        notifications: FieldValue.arrayUnion({
          id: `cpu-trade-declined:${leagueId}:${requestRef.id}`,
          type: 'cpu_trade_result',
          leagueId,
          requestId: requestRef.id,
          createdAt,
          message: `The CPU declined your trade with ${requestDoc.cpuName || requestDoc.cpuAbbr || 'that team'}.`,
        }),
      }, { merge: true });
    }

    return {
      requestId: requestRef.id,
      status,
      cpuDecision,
    };
  });
});

exports.updateTradeDecision = onCall({ secrets: [tradeAuthSecret] }, async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const receiptSecret = tradeAuthSecret.value();
  if (!receiptSecret) {
    throw new HttpsError('failed-precondition', 'Trade authorization is unavailable.');
  }

  const data = request.data || {};
  const leagueId = data.leagueId ? String(data.leagueId) : '';
  const action = data.action ? String(data.action) : '';
  const roomId = data.roomId ? String(data.roomId) : '';
  const cpuRequestId = data.cpuRequestId ? String(data.cpuRequestId) : '';
  const forceResolve = data.forceResolve === true;
  if (!leagueId || !action) {
    throw new HttpsError('invalid-argument', 'Provide leagueId and action.');
  }
  const isCpu = action === 'decline_cpu';
  if ((isCpu && !cpuRequestId) || (!isCpu && !roomId)) {
    throw new HttpsError('invalid-argument', 'Provide the trade source for this action.');
  }
  if (action === 'cast_vote' && !forceResolve && !['approve', 'reject'].includes(data.choice)) {
    throw new HttpsError('invalid-argument', 'Vote choice must be approve or reject.');
  }

  const db = getFirestore();
  const leagueRef = db.collection('leagues').doc(leagueId);
  const sourceRef = isCpu
    ? leagueRef.collection('cpu_trade_requests').doc(cpuRequestId)
    : leagueRef.collection('trade_rooms').doc(roomId);
  const overrideAuthorizationRef = roomId
    ? leagueRef.collection('_trade_authorizations').doc(`${roomId}:salary_override`)
    : null;
  const voteAuthorizationRef = roomId
    ? leagueRef.collection('_trade_authorizations').doc(`${roomId}:vote_passed`)
    : null;
  const createdAt = new Date().toISOString();

  return db.runTransaction(async (tx) => {
    const [leagueSnap, sourceSnap] = await Promise.all([tx.get(leagueRef), tx.get(sourceRef)]);
    if (!leagueSnap.exists) throw new HttpsError('not-found', 'League not found.');
    if (!sourceSnap.exists) throw new HttpsError('not-found', 'Trade not found.');
    const league = leagueSnap.data() || {};
    const source = sourceSnap.data() || {};
    const timestamp = FieldValue.serverTimestamp();
    if (!isCpu && isTradeRoomExpired(source, Date.now())) {
      tx.update(sourceRef, buildExpiredTradeRoomUpdate(timestamp));
      return { action, roomId, expired: true };
    }
    const authorization = authorizeTradeAction({
      action, uid, league, source, forceResolve,
    });
    if (!authorization.authorized) {
      throw new HttpsError('permission-denied', 'This trade decision is not authorized.', {
        reason: authorization.reason,
      });
    }

    if (action === 'cast_vote') {
      const nextSource = forceResolve
        ? source
        : { ...source, tradeVotes: { ...(source.tradeVotes || {}), [uid]: data.choice } };
      const resolution = resolveVote({ league, source: nextSource, forceResolve });
      const update = {
        updatedAt: timestamp,
        voteApproveCount: resolution.approve,
        voteRejectCount: resolution.reject,
        voteEligibleCount: resolution.eligibleCount,
        voteNeededToPass: resolution.needed,
      };
      if (!forceResolve) update[`tradeVotes.${uid}`] = data.choice;
      if (resolution.status !== 'pending_vote') {
        update.status = resolution.status;
        update.voteResolvedAt = timestamp;
        update.voteResolvedBy = uid;
      }
      if (resolution.status === 'vote_passed') {
        const payload = {
          leagueId,
          roomId,
          kind: 'vote_passed',
          tradeFingerprint: tradeFingerprint(nextSource),
          status: resolution.status,
          eligibleCount: resolution.eligibleCount,
          approve: resolution.approve,
          reject: resolution.reject,
          needed: resolution.needed,
          resolvedBy: uid,
        };
        tx.set(voteAuthorizationRef, signAuthorizationReceipt(payload, receiptSecret));
      } else if (resolution.status === 'rejected') {
        tx.delete(voteAuthorizationRef);
      }
      tx.update(sourceRef, update);
      return { action, roomId, choice: forceResolve ? null : data.choice, ...resolution };
    }

    if (action === 'approve_override') {
      tx.set(overrideAuthorizationRef, signAuthorizationReceipt({
        kind: 'salary_override',
        leagueId,
        roomId,
        approved: true,
        approvedBy: uid,
        tradeFingerprint: tradeFingerprint(source),
      }, receiptSecret));
      tx.update(sourceRef, {
        salaryOverrideApplied: true,
        pendingOverrideReview: false,
        overrideApprovedBy: uid,
        overrideApprovedAt: timestamp,
        updatedAt: timestamp,
        ...tradeRoomExpiryFromNow(),
      });
    } else if (action === 'deny_override') {
      tx.delete(overrideAuthorizationRef);
      tx.update(sourceRef, {
        salaryOverrideApplied: false,
        pendingOverrideReview: false,
        overrideDeniedBy: uid,
        overrideDeniedAt: timestamp,
        updatedAt: timestamp,
        ...tradeRoomExpiryFromNow(),
      });
    } else if (action === 'veto_trade') {
      tx.delete(overrideAuthorizationRef);
      tx.delete(voteAuthorizationRef);
      tx.update(sourceRef, {
        status: 'vetoed',
        vetoedBy: uid,
        vetoedAt: timestamp,
        updatedAt: timestamp,
      });
      const participantIds = [...new Set([source.hostUid, source.guestUid].filter(Boolean))];
      participantIds.forEach((participantUid) => {
        tx.set(db.collection('users').doc(participantUid), {
          notifications: FieldValue.arrayUnion({
            id: `trade-decision:${leagueId}:${roomId}:veto_trade:${participantUid}`,
            type: 'trade_vetoed',
            leagueId,
            roomId,
            createdAt,
            message: `A commissioner vetoed the trade between ${source.hostTeamName || 'Team A'} and ${source.guestTeamName || 'Team B'}.`,
          }),
        }, { merge: true });
      });
    } else if (action === 'decline_cpu') {
      tx.update(sourceRef, {
        status: 'declined',
        resolvedAt: timestamp,
        resolvedBy: uid,
      });
    }

    const recipient = action === 'decline_cpu'
      ? source.proposerUid
      : action === 'veto_trade' ? null : source.overrideRequestedBy;
    if (recipient) {
      const approved = action === 'approve_override';
      tx.set(db.collection('users').doc(recipient), {
        notifications: FieldValue.arrayUnion({
          id: `trade-decision:${leagueId}:${roomId || cpuRequestId}:${action}`,
          type: action === 'decline_cpu'
            ? 'cpu_trade_result'
            : approved ? 'trade_override_approved' : 'trade_override_denied',
          leagueId,
          roomId,
          createdAt,
          message: action === 'decline_cpu'
            ? `Your CPU trade with ${source.cpuName || source.cpuAbbr || 'the CPU team'} was declined by the commissioner.`
            : approved
              ? 'Commissioner approved your override. Both sides can confirm now.'
              : 'Commissioner denied your salary override request.',
        }),
      }, { merge: true });
    }
    return { action, roomId: roomId || null, cpuRequestId: cpuRequestId || null, resolved: true };
  });
});

exports.finalizeTrade = onCall({ secrets: [tradeAuthSecret] }, async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const receiptSecret = tradeAuthSecret.value();
  if (!receiptSecret) {
    throw new HttpsError('failed-precondition', 'Trade authorization is unavailable.');
  }

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
  const overrideAuthorizationRef = type === 'room'
    ? leagueRef.collection('_trade_authorizations').doc(`${String(roomId)}:salary_override`)
    : null;
  const voteAuthorizationRef = type === 'room'
    ? leagueRef.collection('_trade_authorizations').doc(`${String(roomId)}:vote_passed`)
    : null;
  const notificationCreatedAt = new Date().toISOString();

  return db.runTransaction(async (tx) => {
    const [leagueSnap, sourceSnap, overrideAuthorizationSnap, voteAuthorizationSnap] = await Promise.all([
      tx.get(leagueRef),
      tx.get(sourceRef),
      overrideAuthorizationRef ? tx.get(overrideAuthorizationRef) : Promise.resolve(null),
      voteAuthorizationRef ? tx.get(voteAuthorizationRef) : Promise.resolve(null),
    ]);
    if (!leagueSnap.exists) throw new HttpsError('not-found', 'League not found.');
    if (!sourceSnap.exists) throw new HttpsError('not-found', 'Trade not found.');

    const league = leagueSnap.data() || {};
    const source = sourceSnap.data() || {};
    if (type === 'room' && isTradeRoomExpired(source, Date.now())) {
      tx.update(sourceRef, buildExpiredTradeRoomUpdate(FieldValue.serverTimestamp()));
      return {
        executed: false,
        expired: true,
        sourceType: type,
        activityId: `trade_${type}_${String(roomId)}`,
        notifiedUserIds: [source.hostUid, source.guestUid].filter(Boolean),
      };
    }
    if (
      (type === 'room' && source.status === 'executed')
      || (type === 'cpu' && source.status === 'approved')
    ) {
      const sourceId = String(cpuRequestId || roomId);
      const participantUids = type === 'cpu'
        ? [source.proposerUid]
        : [source.hostUid, source.guestUid];
      return {
        executed: false,
        alreadyFinalized: true,
        sourceType: type,
        activityId: `trade_${type}_${sourceId}`,
        notifiedUserIds: participantUids.filter(Boolean),
      };
    }
    if (!authorizeFinalization({ uid, league, source, type })) {
      throw new HttpsError('permission-denied', 'This trade cannot be finalized by this user in its current state.');
    }
    const fingerprint = type === 'room' ? tradeFingerprint(source) : '';
    if (type === 'room' && source.status === 'vote_passed') {
      const voteReceipt = voteAuthorizationSnap && voteAuthorizationSnap.exists
        ? voteAuthorizationSnap.data()
        : null;
      const expectedVoteReceipt = {
        leagueId,
        roomId: String(roomId),
        kind: 'vote_passed',
        tradeFingerprint: fingerprint,
        status: 'vote_passed',
        eligibleCount: source.voteEligibleCount,
        approve: source.voteApproveCount,
        reject: source.voteRejectCount,
        needed: source.voteNeededToPass,
        resolvedBy: source.voteResolvedBy,
      };
      if (!verifyAuthorizationReceipt(voteReceipt, expectedVoteReceipt, receiptSecret)) {
        throw new HttpsError('permission-denied', 'Vote approval receipt is invalid.');
      }
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

    const authorization = overrideAuthorizationSnap && overrideAuthorizationSnap.exists
      ? overrideAuthorizationSnap.data()
      : null;
    const expectedOverrideReceipt = {
      kind: 'salary_override',
      leagueId,
      roomId: String(roomId),
      approved: true,
      approvedBy: source.overrideApprovedBy,
      tradeFingerprint: fingerprint,
    };
    const approvedOverride = type === 'room'
      && verifyAuthorizationReceipt(authorization, expectedOverrideReceipt, receiptSecret);
    const input = validationInput({
      league, source, teamA, teamB, type, approvedOverride,
    });
    const validation = validateTrade(input);
    if (!validation.valid) {
      throw new HttpsError(
        'failed-precondition',
        'Trade validation failed.',
        {
          errors: validation.errors,
          messages: validation.messages,
          warnings: validation.warnings,
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
    const sourceId = String(cpuRequestId || roomId);
    const activityId = `trade_${type}_${sourceId}`;
    const activityRef = leagueRef.collection('activity').doc(activityId);
    const participantUids = type === 'cpu'
      ? [source.proposerUid]
      : [source.hostUid, source.guestUid];
    const hostAssets = [...(input.offerA || []), ...(input.pickOfferA || [])]
      .map((asset) => asset.full_name || asset.name || asset.id)
      .filter(Boolean)
      .join(', ') || 'assets';
    const guestAssets = [...(input.offerB || []), ...(input.pickOfferB || [])]
      .map((asset) => asset.full_name || asset.name || asset.id)
      .filter(Boolean)
      .join(', ') || 'assets';
    tx.set(activityRef, {
      type: 'trade_executed',
      sourceType: type,
      sourceId,
      message: type === 'cpu'
        ? `${source.proposerName || 'A GM'} completed a trade with ${source.cpuName || source.cpuAbbr || 'a CPU team'}.`
        : `${source.hostTeamName || 'Team A'} traded ${hostAssets} to ${source.guestTeamName || 'Team B'} for ${guestAssets}`,
      hostTeamId: teamAId,
      guestTeamId: teamBId,
      hostName: source.hostTeamName || source.proposerName || '',
      guestName: source.guestTeamName || source.cpuName || source.cpuAbbr || '',
      createdAt: timestamp,
    }, { merge: true });
    participantUids.filter(Boolean).forEach((recipientUid) => {
      tx.set(db.collection('users').doc(recipientUid), {
        notifications: FieldValue.arrayUnion({
          id: `trade-executed:${leagueId}:${type}:${sourceId}:${recipientUid}`,
          type: type === 'cpu' ? 'cpu_trade_result' : 'trade_executed',
          leagueId,
          roomId: type === 'room' ? sourceId : '',
          createdAt: notificationCreatedAt,
          message: type === 'cpu'
            ? `Your CPU trade with ${source.cpuName || source.cpuAbbr || 'the CPU team'} was approved. Rosters updated.`
            : 'Your trade was approved and has been completed.',
        }),
      }, { merge: true });
    });
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
      tx.delete(overrideAuthorizationRef);
      tx.delete(voteAuthorizationRef);
    }
    return {
      executed: true,
      sourceType: type,
      activityId,
      notifiedUserIds: participantUids.filter(Boolean),
      validation: {
        payrollAfter: validation.payrollAfter,
        rosterAfter: validation.rosterAfter,
      },
    };
  });
});
