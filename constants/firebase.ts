import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApps, initializeApp } from 'firebase/app';
import { getAuth, initializeAuth } from 'firebase/auth';
// getReactNativePersistence exists at runtime but is missing from the installed
// firebase/auth type definitions, so import it separately and silence the type error.
// @ts-ignore
import { getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';

import { firebaseConfigFor, resolveFirebaseTarget } from './firebaseProjects';

export const firebaseTarget = resolveFirebaseTarget(process.env.EXPO_PUBLIC_FIREBASE_TARGET);
const firebaseConfig = firebaseConfigFor(firebaseTarget);

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// initializeAuth must run exactly once. On Fast Refresh / re-import it would throw
// "auth/already-initialized", so fall back to getAuth in that case.
function initAuth() {
  try {
    return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch {
    return getAuth(app);
  }
}

export const auth = initAuth();
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, 'us-central1');
