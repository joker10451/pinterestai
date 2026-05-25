import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBot } from '../src/bot';
import type { CryptoPayUpdate } from '../src/services/crypto-pay';
import { verifyWebhookSignature } from '../src/services/crypto-pay';
import {
  findTransactionByProviderRef,
  updateTransactionStatus,
} from '../src/services/transactions';
import { setPremiumStatus } from '../src/services/users';

// Vercel parses JSON bodies by default; we need raw bytes for HMAC verification.
export const config = { api: { bodyParser: false } };

async function readRawBody(req: VercelRequest): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const raw = await readRawBody(req);
  const signature =
    (req.headers['crypto-pay-api-signature'] as string | undefined) ??
    (req.headers['Crypto-Pay-Api-Signature'.toLowerCase()] as string | undefined);

  if (!verifyWebhookSignature(raw, signature)) {
    console.warn('CryptoPay webhook signature mismatch');
    res.status(401).json({ error: 'invalid_signature' });
    return;
  }

  let update: CryptoPayUpdate;
  try {
    update = JSON.parse(raw) as CryptoPayUpdate;
  } catch {
    res.status(400).json({ error: 'invalid_json' });
    return;
  }

  if (update.update_type !== 'invoice_paid') {
    res.status(200).json({ ok: true });
    return;
  }

  const invoice = update.payload;
  let telegramId: number | null = null;
  try {
    const parsed = JSON.parse(invoice.payload ?? '{}') as { telegram_id?: number };
    if (typeof parsed.telegram_id === 'number') telegramId = parsed.telegram_id;
  } catch {
    /* fall through */
  }

  if (!telegramId) {
    console.error('CryptoPay invoice paid but payload missing telegram_id', invoice.invoice_id);
    res.status(200).json({ ok: true });
    return;
  }

  // Idempotency: webhook can be delivered more than once.
  const existing = await findTransactionByProviderRef('crypto', String(invoice.invoice_id));
  if (existing) {
    if (existing.status === 'paid') {
      res.status(200).json({ ok: true, duplicate: true });
      return;
    }
    await updateTransactionStatus(existing.tx_id, 'paid', invoice as unknown as Record<string, unknown>);
  }

  await setPremiumStatus(telegramId, 'active');

  try {
    await getBot().api.sendMessage(
      telegramId,
      `✅ Payment confirmed — your *Premium* access is now active. Welcome aboard!`,
      { parse_mode: 'Markdown' },
    );
  } catch (err) {
    // Don't 5xx — CryptoPay would retry; access is already granted.
    console.error('failed to notify user about crypto payment', err);
  }

  res.status(200).json({ ok: true });
}
