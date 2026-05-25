import { cert, getApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { config } from './config';

// Vercel reuses the Node.js process across invocations on warm starts, so we
// must guard against re-initializing the Admin SDK (it throws if you do).
let cachedApp: App | null = null;
let cachedDb: Firestore | null = null;

function loadServiceAccount(): { projectId: string; clientEmail: string; privateKey: string } {
  const raw = Buffer.from(config.firebase.serviceAccountBase64, 'base64').toString('utf8');
  const parsed = JSON.parse(raw) as {
    project_id: string;
    client_email: string;
    private_key: string;
  };
  return {
    projectId: parsed.project_id,
    clientEmail: parsed.client_email,
    // Firebase service-account private keys ship with literal \n sequences after JSON encoding.
    privateKey: parsed.private_key.replace(/\\n/g, '\n'),
  };
}

export function getFirebaseApp(): App {
  if (cachedApp) return cachedApp;
  if (getApps().length > 0) {
    cachedApp = getApp();
    return cachedApp;
  }
  const sa = loadServiceAccount();
  cachedApp = initializeApp({
    credential: cert(sa),
    projectId: config.firebase.projectId,
  });
  return cachedApp;
}

export function db(): Firestore {
  if (cachedDb) return cachedDb;
  cachedDb = getFirestore(getFirebaseApp());
  cachedDb.settings({ ignoreUndefinedProperties: true });
  return cachedDb;
}

export const collections = {
  users: () => db().collection('users'),
  transactions: () => db().collection('transactions'),
};
