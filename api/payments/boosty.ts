import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBot, premiumAccessKeyboard } from '../../src/bot';
import {
  extractTelegramIdFromMessage,
  isPremiumLevel,
  verifyBoostySignature,
  type BoostyEvent,
} from '../../src/lib/boosty';
import { readRawBody } from '../../src/lib/raw-body';
import {
  createTransaction,
  findTransaction,
  grantPremium,
  updateTransactionStatus,
} from '../../src/lib/repo';
import { paymentReceived } from '../../src/bot/messages';

export default async function (req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false });
    return;
  }

  let raw: string;
  try {
    raw = await readRawBody(req);
  } catch {
    res.status(400).json({ ok: false });
    return;
  }

  const signature = (req.headers['x-boosty-signature'] as string | undefined) ?? undefined;
  if (!verifyBoostySignature(raw, signature)) {
    console.warn('boosty: invalid signature');
    res.status(401).json({ ok: false });
    return;
  }

  let event: BoostyEvent;
  try {
    event = JSON.parse(raw) as BoostyEvent;
  } catch {
    res.status(400).json({ ok: false });
    return;
  }

  // Ignore anything that isn't a successful payment / subscription created event.
  const succeeded =
    event.data.status === 'succeeded' ||
    event.event === 'subscription.created' ||
    event.event === 'payment.succeeded';

  if (!succeeded) {
    res.status(200).json({ ok: true });
    return;
  }

  if (!isPremiumLevel(event.data.level_id)) {
    res.status(200).json({ ok: true, skipped: 'non-premium-level' });
    return;
  }

  const telegramId = extractTelegramIdFromMessage(event.data.message);
  if (!telegramId) {
    console.warn('boosty: no tg-<id> link code in payment message', event.data.id);
    // 200 so Boosty stops retrying — we cannot link this purchase automatically.
    res.status(200).json({ ok: true, skipped: 'unlinked' });
    return;
  }

  const txId = `boosty:tg-${telegramId}`;
  const existing = await findTransaction(txId);
  if (existing && existing.status === 'paid') {
    res.status(200).json({ ok: true });
    return;
  }
  if (!existing) {
    // User paid without first clicking the bot button — register the tx now.
    await createTransaction({
      txId,
      telegramId,
      amount: Number(event.data.amount ?? 0),
      currency: 'RUB',
      gateway: 'boosty',
      raw: { link_code: `tg-${telegramId}` },
    });
  }

  await updateTransactionStatus(txId, 'paid', {
    boosty_payment_id: String(event.data.id),
    level_id: event.data.level_id ?? null,
    amount: event.data.amount ?? null,
  });
  await grantPremium(telegramId);

  try {
    await getBot().api.sendMessage(telegramId, paymentReceived(), {
      parse_mode: 'Markdown',
      reply_markup: premiumAccessKeyboard(),
    });
  } catch (err) {
    console.error('boosty: failed to notify user', telegramId, err);
  }

  res.status(200).json({ ok: true });
}

export const config = {
  api: {
    bodyParser: false,
  },
};
