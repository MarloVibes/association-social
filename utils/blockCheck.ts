import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/constants/firebase';

/**
 * Returns true if EITHER user has blocked the other.
 * Used for silent enforcement: blocked users can't message, can't view profile,
 * can't interact. Reads 2 user docs (acceptable for occasional checks).
 *
 * Cache-friendly: callers can call once on screen mount and reuse the result.
 */
export async function isMutuallyBlocked(myUid: string, otherUid: string): Promise<boolean> {
  if (!myUid || !otherUid || myUid === otherUid) return false;
  try {
    const [meSnap, themSnap] = await Promise.all([
      getDoc(doc(db, 'users', myUid)),
      getDoc(doc(db, 'users', otherUid)),
    ]);
    const myBlocked: string[] = meSnap.exists() ? (meSnap.data().blockedUsers || []) : [];
    const theirBlocked: string[] = themSnap.exists() ? (themSnap.data().blockedUsers || []) : [];
    return myBlocked.includes(otherUid) || theirBlocked.includes(myUid);
  } catch (e) {
    // Default to NOT blocked on failure — fail open. Erring on the side of
    // delivery rather than silent loss. UI layer can decide otherwise.
    console.warn('isMutuallyBlocked check failed', e);
    return false;
  }
}

/**
 * Lighter variant that only reads your OWN blocked list. Faster for cases
 * where you only need to know "did I block this user?" — e.g., filtering
 * a list of messages you're rendering.
 */
export async function didIBlock(myUid: string, otherUid: string): Promise<boolean> {
  if (!myUid || !otherUid) return false;
  try {
    const snap = await getDoc(doc(db, 'users', myUid));
    const blocked: string[] = snap.exists() ? (snap.data().blockedUsers || []) : [];
    return blocked.includes(otherUid);
  } catch {
    return false;
  }
}
