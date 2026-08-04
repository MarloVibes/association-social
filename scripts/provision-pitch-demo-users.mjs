import admin from 'firebase-admin';
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readDemoServiceAccount } from './seed-pitch-demo-league.mjs';

const DEMO_PROJECT_ID = 'association-social-demo';
const DEFAULT_SERVICE_ACCOUNT = './demo-service-account.json';
const DEFAULT_CREDENTIALS_FILE = './pitch-demo-credentials.json';

function parseArgs(argv) {
  const flags = new Set();
  const values = new Map();
  argv.forEach((arg) => {
    if (!arg.startsWith('--')) return;
    const separator = arg.indexOf('=');
    if (separator > 2) values.set(arg.slice(2, separator), arg.slice(separator + 1));
    else flags.add(arg.slice(2));
  });
  return {
    has: name => flags.has(name),
    get: (name, fallback = '') => values.get(name) || fallback,
  };
}

function securePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(10);
  const body = [...bytes].map(byte => alphabet[byte % alphabet.length]).join('');
  return `${body}Aa1!`;
}

function readExistingCredentials(credentialsPath) {
  if (!existsSync(credentialsPath)) return {};
  try {
    return JSON.parse(readFileSync(credentialsPath, 'utf8'));
  } catch {
    return {};
  }
}

async function upsertUser(auth, { existingUid, email, displayName, role, password = securePassword() }) {
  let existing = null;
  if (existingUid) {
    try {
      existing = await auth.getUser(existingUid);
    } catch (error) {
      if (error?.code !== 'auth/user-not-found') throw error;
    }
  }
  if (!existing) {
    try {
      existing = await auth.getUserByEmail(email);
    } catch (error) {
      if (error?.code !== 'auth/user-not-found') throw error;
    }
  }

  const user = existing
    ? await auth.updateUser(existing.uid, { displayName, password, disabled: false, emailVerified: true })
    : await auth.createUser({ email, displayName, password, disabled: false, emailVerified: true });

  await auth.setCustomUserClaims(user.uid, { pitchAccessRole: role, pitchDemo: true });
  return { uid: user.uid, email, password, displayName, role };
}

async function provisionPitchDemoUsers() {
  const args = parseArgs(process.argv.slice(2));
  const founderOnly = args.has('founderOnly');
  const viewerOnly = args.has('viewerOnly');
  if (founderOnly && viewerOnly) throw new Error('Choose either --founderOnly or --viewerOnly, not both.');
  const serviceAccountPath = args.get('serviceAccount', DEFAULT_SERVICE_ACCOUNT);
  const credentialsPath = resolve(args.get('credentialsFile', DEFAULT_CREDENTIALS_FILE));
  const existingCredentials = readExistingCredentials(credentialsPath);
  const serviceAccount = readDemoServiceAccount(serviceAccountPath);

  const app = admin.apps.length
    ? admin.app()
    : admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: DEMO_PROJECT_ID,
    });
  const auth = app.auth();
  const db = app.firestore();

  const founder = viewerOnly
    ? existingCredentials.founder
    : await upsertUser(auth, {
      existingUid: existingCredentials.founder?.uid,
      email: args.get('founderEmail', 'founder@fm.demo'),
      displayName: 'Franchise Mobile Founder',
      role: 'founder',
      password: process.env.PITCH_DEMO_FOUNDER_PASSWORD || securePassword(),
    });
  const viewer = founderOnly
    ? existingCredentials.viewer
    : await upsertUser(auth, {
      existingUid: existingCredentials.viewer?.uid,
      email: args.get('viewerEmail', 'viewer@fm.demo'),
      displayName: 'Pitch Viewer',
      role: 'viewer',
      password: process.env.PITCH_DEMO_VIEWER_PASSWORD || securePassword(),
    });

  const now = admin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();
  if (!viewerOnly && founder?.uid) {
    batch.set(db.collection('users').doc(founder.uid), {
      email: founder.email,
      displayName: founder.displayName,
      pitchAccessRole: founder.role,
      pitchDemoAccount: true,
      updatedAt: now,
    }, { merge: true });
  }
  if (!founderOnly && viewer?.uid) {
    batch.set(db.collection('users').doc(viewer.uid), {
      email: viewer.email,
      displayName: viewer.displayName,
      pitchAccessRole: viewer.role,
      pitchDemoAccount: true,
      updatedAt: now,
    }, { merge: true });
  }
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
  if (viewer?.uid) console.log(`Viewer UID: ${viewer.uid}`);
  console.log(`Credentials saved locally: ${credentialsPath}`);
  console.log('Passwords were not printed. This file is gitignored and restricted to the local user.');
}

provisionPitchDemoUsers()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
