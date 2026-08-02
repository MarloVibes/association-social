export type FirebaseTarget = 'production' | 'demo';

export const firebaseProjects = {
  production: {
    apiKey: 'AIzaSyCyGdEjmV3B4ZpxBq-h1gJFWqY9sD7kvDY',
    authDomain: 'association-social.firebaseapp.com',
    projectId: 'association-social',
    storageBucket: 'association-social.firebasestorage.app',
    messagingSenderId: '444786220612',
    appId: '1:444786220612:web:53724911dead483995e611',
  },
  demo: {
    apiKey: 'AIzaSyDlyN5bWtfi0I5OHtxSdocVDRZop3AyX2g',
    authDomain: 'association-social-demo.firebaseapp.com',
    projectId: 'association-social-demo',
    storageBucket: 'association-social-demo.firebasestorage.app',
    messagingSenderId: '735819364046',
    appId: '1:735819364046:web:d67235b85b8ddc34f8429f',
  },
} as const;

export function resolveFirebaseTarget(value?: string): FirebaseTarget {
  return value === 'demo' ? 'demo' : 'production';
}

export function firebaseConfigFor(target: FirebaseTarget) {
  return firebaseProjects[target];
}
