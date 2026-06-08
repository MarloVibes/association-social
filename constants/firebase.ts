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

const firebaseConfig = {
  apiKey: "AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY",
  authDomain: "association-social.firebaseapp.com",
  projectId: "association-social",
  storageBucket: "association-social.firebasestorage.app",
  messagingSenderId: "444786220612",
  appId: "1:444786220612:web:53724911dead483995e611"
};

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
