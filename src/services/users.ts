import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { collections } from '../firebase';
import type { FunnelStage, PremiumStatus, UserDoc } from '../types';

function userRef(telegramId: number) {
  return collections.users().doc(String(telegramId));
}

export async function getUser(telegramId: number): Promise<UserDoc | null> {
  const snap = await userRef(telegramId).get();
  return snap.exists ? (snap.data() as UserDoc) : null;
}

/**
 * Idempotent: creates the user document the first time we see them, otherwise
 * just refreshes mutable profile fields. Returns whether the user is new.
 */
export async function upsertUser(input: {
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  source: string | null;
}): Promise<{ created: boolean; user: UserDoc }> {
  const ref = userRef(input.telegram_id);
  const result = await db_runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const existing = snap.data() as UserDoc;
      tx.update(ref, {
        username: input.username,
        first_name: input.first_name,
      });
      return { created: false, user: { ...existing, username: input.username, first_name: input.first_name } };
    }
    const doc: UserDoc = {
      telegram_id: input.telegram_id,
      username: input.username,
      first_name: input.first_name,
      source: input.source,
      joined_at: Timestamp.now(),
      funnel_stage: 'joined',
      premium_status: 'free',
      followup_sent_at: null,
      premium_activated_at: null,
      boosty_email: null,
    };
    tx.set(ref, doc);
    return { created: true, user: doc };
  });
  return result;
}

export async function setFunnelStage(telegramId: number, stage: FunnelStage): Promise<void> {
  await userRef(telegramId).update({ funnel_stage: stage });
}

export async function markFollowupSent(telegramId: number): Promise<void> {
  await userRef(telegramId).update({
    funnel_stage: 'followup_sent',
    followup_sent_at: FieldValue.serverTimestamp(),
  });
}

export async function setPremiumStatus(
  telegramId: number,
  status: PremiumStatus,
): Promise<void> {
  await userRef(telegramId).update({
    premium_status: status,
    premium_activated_at: status === 'active' ? FieldValue.serverTimestamp() : null,
    funnel_stage: status === 'active' ? 'premium_paid' : 'premium_offered',
  });
}

export async function findUsersAwaitingFollowup(opts: {
  before: Date;
  limit: number;
}): Promise<UserDoc[]> {
  const cutoff = Timestamp.fromDate(opts.before);
  // Users who joined more than 24h ago, never received a follow-up, and haven't paid yet.
  const snap = await collections
    .users()
    .where('funnel_stage', 'in', ['joined', 'lead_magnet_delivered', 'premium_offered'])
    .where('joined_at', '<=', cutoff)
    .where('premium_status', '==', 'free')
    .limit(opts.limit)
    .get();
  return snap.docs.map((d) => d.data() as UserDoc);
}

export async function findUserByBoostyEmail(email: string): Promise<UserDoc | null> {
  const snap = await collections.users().where('boosty_email', '==', email).limit(1).get();
  return snap.empty ? null : (snap.docs[0].data() as UserDoc);
}

// Tiny wrapper so we can import runTransaction without pulling firestore types into every file.
async function db_runTransaction<T>(
  fn: (tx: FirebaseFirestore.Transaction) => Promise<T>,
): Promise<T> {
  const { db } = await import('../firebase');
  return db().runTransaction(fn);
}
