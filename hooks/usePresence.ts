import { useEffect } from 'react';
import { AppState } from 'react-native';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/constants/firebase';

/**
 * Writes lastActive timestamp to user's Firestore doc whenever
 * the app is opened or comes back from background.
 * Lightweight presence indicator for "online friends" features.
 */
export function usePresence() {
  useEffect(() => {
    const ping = async () => {
      const u = auth.currentUser;
      if (!u) return;
      try {
        await setDoc(
          doc(db, 'users', u.uid),
          { lastActive: serverTimestamp() },
          { merge: true }
        );
      } catch (e) {
        // Silently fail - presence is non-critical
      }
    };

    // Ping immediately on mount
    ping();

    // Ping when app returns to foreground
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') ping();
    });

    return () => sub.remove();
  }, []);
}
