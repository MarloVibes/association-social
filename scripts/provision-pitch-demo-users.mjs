import admin from 'firebase-admin';
import { randomBytes } from 'node:crypto';
import { chmodSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readDemoServiceAccount } from './seed-pitch-demo-league.mjs';

const DEMO_PROJECT_ID = 'association-social-demo';
const DEFAULT_SERVICE_ACCOUNT = './demo-service-account.json';
const DEFAULT_CREDENTIALS_FILE = './pitch-demo-credentials.json';

function parseArgs(argv) {
  const values = new Map();
  argv.forEach((arg) => {
    if (!arg.startsWith('--')) return;
    const separator = arg.indexOf('=');
    if (separator > 2) values.set(arg.slice(2, separator), arg.slice(separator + 1));
  });
  return {
    get: (name, fallback = '') => values.get(name) || fallback,
  };
}

function securePassword() {
  return `${randomBytes(18).toString('base64url')}Aa1!`;
}

async function upsertUser(auth, { email, displayName, role }) {
  let existing = null;
  try {
    existing = await auth.getUserByEmail(email);
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
  }

  const password = securePassword();
  const user = existing
    ? await auth.updateUser(existing.uid, { displayName, password, disabled: false, emailVerified: true })
    : await auth.createUser({ email, displayName, password, disabled: false, emailVerified: true });

  await auth.setCustomUserClaims(user.uid, { pitchAccessRole: role, pitchDemo: true });
  return { uid: user.uid, email, password, displayName, role };
}

async function provisionPitchDemoUsers() {
  const args = parseArgs(process.argv.slice(2));
  const serviceAccountPath = args.get('serviceAccount', DEFAULT_SERVICE_ACCOUNT);
  const credentialsPath = resolve(args.get('credentialsFile', DEFAULT_CREDENTIALS_FILE));
  const serviceAccount = readDemoServiceAccount(serviceAccountPath);

  const app = admin.apps.length
    ? admin.app()
    : admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: DEMO_PROJECT_ID,
    });
  const auth = app.auth();
  const db = app.firestore();

  const founder = await upsertUser(auth, {
    email: args.get('founderEmail', 'founder@franchisemobile.demo'),
    displayName: 'Franchise Mobile Founder',
    role: 'founder',
  });
  const viewer = await upsertUser(auth, {
    email: args.get('viewerEmail', 'viewer@franchisemobile.demo'),
    displayName: 'Pitch Viewer',
    role: 'viewer',
  });

  const now = admin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.set(db.collection('users').doc(founder.uid), {
    email: founder.email,
    displayName: founder.displayName,
    pitchAccessRole: founder.role,
    pitchDemoAccount: true,
    updatedAt: now,
  }, { merge: true });
  batch.set(db.collection('users').doc(viewer.uid), {
    email: viewer.email,
    displayName: viewer.displayName,
    pitchAccessRole: viewer.role,
    pitchDemoAccount: true,
    updatedAt: now,
  }, { merge: true });
  await batch.commit();

  writeFileSync(credentialsPath, `${JSON.stringify({
    projectId: DEMO_PROJECT_ID,
    generatedAt: new Date().toISOString(),
    founder,
    viewer,
  }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  chmodSync(credentialsPath, 0o600);

  console.log('Pitch demo accounts are ready.');
  console.log(`Founder UID: ${founder.uid}`);
  console.log(`Viewer UID: ${viewer.uid}`);
  console.log(`Credentials saved locally: ${credentialsPath}`);
  console.log('Passwords were not printed. This file is gitignored and restricted to the local user.');
}

provisionPitchDemoUsers()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
