import { cert, getApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { env } from '../config/env';

// Vercel keeps the Node.js process warm between invocations on the same instance,
// so we cache the App + Firestore handles in module scope to avoid re-initializing
// on every request (which is the #1 cold-start tax for firebase-admin).
let appHandle: App | null = null;
let dbHandle: Firestore | null = null;

function decodeServiceAccount(): Record<string, unknown> {
  const json = Buffer.from(env.firebaseServiceAccountB64, 'base64').toString('utf8');
  return JSON.parse(json);
}

export function firebaseApp(): App {
  if (appHandle) return appHandle;
  appHandle = getApps().length
    ? getApp()
    : initializeApp({
        credential: cert(decodeServiceAccount() as Parameters<typeof cert>[0]),
        projectId: env.firebaseProjectId,
      });
  return appHandle;
}

export function db(): Firestore {
  if (dbHandle) return dbHandle;
  const fs = getFirestore(firebaseApp());
  // ignoreUndefinedProperties = avoid throwing on accidental undefineds in writes.
  fs.settings({ ignoreUndefinedProperties: true });
  dbHandle = fs;
  return dbHandle;
}
