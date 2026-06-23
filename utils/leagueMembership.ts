import { arrayRemove, arrayUnion, doc, runTransaction, serverTimestamp } from 'firebase/firestore';

const DEFAULT_MAX_MEMBERS = 30;

function leagueFullMessage(name?: string) {
  return (name || 'This league') + ' is full.';
}

export async function addLeagueMemberIfSpace(
  db: any,
  leagueId: string,
  uid: string,
  options: {
    leagueName?: string;
    inviteToRemove?: any;
    userNotification?: any;
    requestId?: string;
    resolvedBy?: string;
  } = {}
) {
  const leagueRef = doc(db, 'leagues', leagueId);
  const userRef = doc(db, 'users', uid);
  const requestRef = options.requestId ? doc(db, 'leagues', leagueId, 'join_requests', options.requestId) : null;

  return runTransaction(db, async (tx) => {
    const leagueSnap = await tx.get(leagueRef);
    if (!leagueSnap.exists()) throw new Error('League not found.');

    const league = leagueSnap.data() || {};
    const members: string[] = Array.isArray(league.members) ? league.members : [];
    const alreadyMember = members.includes(uid);
    const maxMembers = typeof league.maxMembers === 'number' ? league.maxMembers : DEFAULT_MAX_MEMBERS;

    if (!alreadyMember && members.length >= maxMembers) {
      throw new Error(leagueFullMessage(options.leagueName || league.name));
    }

    if (!alreadyMember) {
      tx.update(leagueRef, { members: arrayUnion(uid) });
    }

    const userPatch: any = { leagues: arrayUnion(leagueId) };
    if (options.inviteToRemove) userPatch.leagueInvites = arrayRemove(options.inviteToRemove);
    if (options.userNotification) userPatch.notifications = arrayUnion(options.userNotification);
    tx.set(userRef, userPatch, { merge: true });

    if (requestRef) {
      tx.update(requestRef, {
        status: 'accepted',
        resolvedAt: serverTimestamp(),
        resolvedBy: options.resolvedBy || '',
      });
    }

    return { alreadyMember };
  });
}
