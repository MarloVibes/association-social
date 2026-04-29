import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY",
  authDomain: "association-social.firebaseapp.com",
  projectId: "association-social",
  storageBucket: "association-social.firebasestorage.app",
  messagingSenderId: "444786220612",
  appId: "1:444786220612:web:53724911dead483995e611"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);
export const db = getFirestore(app);
