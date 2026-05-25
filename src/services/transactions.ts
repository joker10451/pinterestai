import { Timestamp } from 'firebase-admin/firestore';
import { collections } from '../firebase';
import type { PaymentGateway, PaymentStatus, TransactionDoc } from '../types';

export async function createTransaction(input: {
  telegram_id: number;
  amount: number;
  currency: string;
  gateway: PaymentGateway;
  provider_ref: string;
  status?: PaymentStatus;
  raw?: Record<string, unknown>;
}): Promise<string> {
  const ref = collections.transactions().doc();
  const doc: TransactionDoc = {
    tx_id: ref.id,
    telegram_id: input.telegram_id,
    amount: input.amount,
    currency: input.currency,
    gateway: input.gateway,
    provider_ref: input.provider_ref,
    status: input.status ?? 'pending',
    created_at: Timestamp.now(),
    updated_at: Timestamp.now(),
    raw: input.raw,
  };
  await ref.set(doc);
  return ref.id;
}

export async function findTransactionByProviderRef(
  gateway: PaymentGateway,
  providerRef: string,
): Promise<TransactionDoc | null> {
  const snap = await collections
    .transactions()
    .where('gateway', '==', gateway)
    .where('provider_ref', '==', providerRef)
    .limit(1)
    .get();
  return snap.empty ? null : (snap.docs[0].data() as TransactionDoc);
}

export async function updateTransactionStatus(
  txId: string,
  status: PaymentStatus,
  raw?: Record<string, unknown>,
): Promise<void> {
  await collections
    .transactions()
    .doc(txId)
    .update({
      status,
      updated_at: Timestamp.now(),
      ...(raw ? { raw } : {}),
    });
}
