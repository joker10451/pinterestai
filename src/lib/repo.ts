import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from './firebase';
import type {
  Currency,
  FunnelStage,
  Gateway,
  TransactionDoc,
  TxStatus,
  UserDoc,
} from '../types';

const USERS = 'users';
const TX = 'transactions';

export function userRef(telegramId: number) {
  return db().collection(USERS).doc(String(telegramId));
}

export function txRef(txId: string) {
  return db().collection(TX).doc(txId);
}

interface UpsertUserInput {
  telegramId: number;
  username: string | null;
  firstName: string | null;
  languageCode: string | null;
  source: string | null;
}

export async function upsertUser(input: UpsertUserInput): Promise<{ created: boolean }> {
  const ref = userRef(input.telegramId);
  const snap = await ref.get();
  if (snap.exists) {
    // Only refresh mutable identity fields; don't reset funnel progress.
    await ref.update({
      username: input.username,
      first_name: input.firstName,
      language_code: input.languageCode,
    });
    return { created: false };
  }
  const doc: UserDoc = {
    telegram_id: input.telegramId,
    username: input.username,
    first_name: input.firstName,
    language_code: input.languageCode,
    source: input.source,
    joined_at: Timestamp.now(),
    funnel_stage: 'joined',
    premium_status: false,
    premium_since: null,
    last_reminder_at: null,
  };
  await ref.set(doc);
  return { created: true };
}

export async function setFunnelStage(telegramId: number, stage: FunnelStage): Promise<void> {
  await userRef(telegramId).update({ funnel_stage: stage });
}

export async function markReminded(telegramId: number): Promise<void> {
  await userRef(telegramId).update({
    funnel_stage: 'reminded_24h',
    last_reminder_at: FieldValue.serverTimestamp(),
  });
}

export async function grantPremium(telegramId: number): Promise<void> {
  await userRef(telegramId).update({
    premium_status: true,
    premium_since: FieldValue.serverTimestamp(),
    funnel_stage: 'paid',
  });
}

interface CreateTxInput {
  txId: string;
  telegramId: number;
  amount: number;
  currency: Currency;
  gateway: Gateway;
  raw?: Record<string, unknown>;
}

export async function createTransaction(input: CreateTxInput): Promise<void> {
  const now = Timestamp.now();
  const doc: TransactionDoc = {
    tx_id: input.txId,
    telegram_id: input.telegramId,
    amount: input.amount,
    currency: input.currency,
    gateway: input.gateway,
    status: 'pending',
    created_at: now,
    updated_at: now,
    raw: input.raw,
  };
  await txRef(input.txId).set(doc, { merge: true });
}

export async function updateTransactionStatus(
  txId: string,
  status: TxStatus,
  raw?: Record<string, unknown>,
): Promise<TransactionDoc | null> {
  const ref = txRef(txId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  await ref.update({
    status,
    updated_at: Timestamp.now(),
    ...(raw ? { raw } : {}),
  });
  const updated = await ref.get();
  return updated.data() as TransactionDoc;
}

export async function findTransaction(txId: string): Promise<TransactionDoc | null> {
  const snap = await txRef(txId).get();
  return snap.exists ? (snap.data() as TransactionDoc) : null;
}

/**
 * Returns users joined more than `hoursAgo` ago that have not yet been reminded
 * and have not converted. Capped by `limit` to keep cron runs bounded.
 */
export async function findUsersDueForReminder(hoursAgo: number, limit: number) {
  const cutoff = Timestamp.fromMillis(Date.now() - hoursAgo * 3600 * 1000);
  const snap = await db()
    .collection(USERS)
    .where('funnel_stage', '==', 'lead_delivered')
    .where('joined_at', '<=', cutoff)
    .limit(limit)
    .get();
  return snap.docs.map((d) => d.data() as UserDoc);
}
