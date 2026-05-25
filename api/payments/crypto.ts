import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBot, premiumAccessKeyboard } from '../../src/bot';
import { verifyWebhookSignature } from '../../src/lib/cryptopay';
import { readRawBody } from '../../src/lib/raw-body';
import {
  findTransaction,
  grantPremium,
  updateTransactionStatus,
} from '../../src/lib/repo';
import { paymentReceived } from '../../src/bot/messages';

interface CryptoPayUpdate {
  update_id: number;
  update_type: 'invoice_paid' | string;
  request_date: string;
  payload: {
    invoice_id: number;
    status: 'paid' | 'active' | 'expired';
    asset: 'USDT' | 'TON';
    amount: string;
    payload?: string;
    paid_at?: string;
  };
}

export default async function (req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false });
    return;
  }

  let raw: string;
  try {
    raw = await readRawBody(req);
  } catch {
    res.status(400).json({ ok: false, error: 'bad body' });
    return;
  }

  const signature = (req.headers['crypto-pay-api-signature'] as string | undefined) ?? undefined;
  if (!verifyWebhookSignature(raw, signature)) {
    console.warn('cryptopay: invalid signature');
    res.status(401).json({ ok: false });
    return;
  }

  let update: CryptoPayUpdate;
  try {
    update = JSON.parse(raw) as CryptoPayUpdate;
  } catch {
    res.status(400).json({ ok: false, error: 'invalid json' });
    return;
  }

  if (update.update_type !== 'invoice_paid' || update.payload.status !== 'paid') {
    // Acknowledge anything else to stop retries; we only care about paid invoices.
    res.status(200).json({ ok: true });
    return;
  }

  const invoiceId = String(update.payload.invoice_id);
  const tx = await findTransaction(invoiceId);
  if (!tx) {
    console.warn('cryptopay: paid invoice for unknown tx', invoiceId);
    res.status(200).json({ ok: true });
    return;
  }
  if (tx.status === 'paid') {
    // Idempotent — Crypto Pay retries until 2xx.
    res.status(200).json({ ok: true });
    return;
  }

  await updateTransactionStatus(invoiceId, 'paid', {
    asset: update.payload.asset,
    amount: update.payload.amount,
    paid_at: update.payload.paid_at,
  });
  await grantPremium(tx.telegram_id);

  // Notify the user. Wrapped so a Telegram outage doesn't make us 5xx and trigger retries.
  try {
    await getBot().api.sendMessage(tx.telegram_id, paymentReceived(), {
      parse_mode: 'Markdown',
      reply_markup: premiumAccessKeyboard(),
    });
  } catch (err) {
    console.error('cryptopay: failed to notify user', tx.telegram_id, err);
  }

  res.status(200).json({ ok: true });
}

export const config = {
  api: {
    // We need the raw body for signature verification.
    bodyParser: false,
  },
};
