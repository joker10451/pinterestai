import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBot } from '../src/bot';
import {
  extractTelegramId,
  parsePayload,
  verifyWebhookSignature,
} from '../src/services/boosty';
import { createTransaction, updateTransactionStatus, findTransactionByProviderRef } from '../src/services/transactions';
import { findUserByBoostyEmail, setPremiumStatus } from '../src/services/users';

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
    (req.headers['x-boosty-signature'] as string | undefined) ??
    (req.headers['x-signature'] as string | undefined);

  if (!verifyWebhookSignature(raw, signature)) {
    console.warn('Boosty webhook signature mismatch');
    res.status(401).json({ error: 'invalid_signature' });
    return;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    res.status(400).json({ error: 'invalid_json' });
    return;
  }

  const event = parsePayload(payload);

  if (event.event !== 'subscription.paid') {
    // Acknowledge non-paid events (cancellations, refunds) without acting on them.
    res.status(200).json({ ok: true, ignored: event.event });
    return;
  }

  // Resolve the Telegram user. Preferred path: external_id / comment carries telegram_id.
  // Fallback: match by email captured during an earlier in-bot step.
  let telegramId = extractTelegramId(event);
  if (!telegramId && event.user.email) {
    const u = await findUserByBoostyEmail(event.user.email);
    if (u) telegramId = u.telegram_id;
  }

  if (!telegramId) {
    console.error('Boosty payment without resolvable telegram_id', {
      subscription_id: event.subscription_id,
      email: event.user.email,
    });
    // Still 200 — we don't want Boosty retrying forever. The event is logged
    // for manual reconciliation.
    res.status(200).json({ ok: true, status: 'unmatched' });
    return;
  }

  // Idempotency by Boosty subscription_id.
  const existing = await findTransactionByProviderRef('boosty', event.subscription_id);
  if (existing && existing.status === 'paid') {
    res.status(200).json({ ok: true, duplicate: true });
    return;
  }
  if (existing) {
    await updateTransactionStatus(existing.tx_id, 'paid', payload as Record<string, unknown>);
  } else {
    await createTransaction({
      telegram_id: telegramId,
      amount: event.amount,
      currency: event.currency,
      gateway: 'boosty',
      provider_ref: event.subscription_id,
      status: 'paid',
      raw: payload as Record<string, unknown>,
    });
  }

  await setPremiumStatus(telegramId, 'active');

  try {
    await getBot().api.sendMessage(
      telegramId,
      `✅ Boosty payment confirmed — your *Premium* access is now active. Welcome aboard!`,
      { parse_mode: 'Markdown' },
    );
  } catch (err) {
    console.error('failed to notify user about boosty payment', err);
  }

  res.status(200).json({ ok: true });
}
