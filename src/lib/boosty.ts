import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';

/**
 * Boosty publishes webhook events for new subscriptions / payments. The exact field set
 * varies across event types; we normalize what we need here.
 *
 * The webhook is HMAC-signed with the shared secret you configure in Boosty's webhook UI.
 * Signature ships in `X-Boosty-Signature` as `sha256=<hex>` (compatible with the format
 * Boosty's own examples use).
 */
export interface BoostyEvent {
  event: string;
  data: {
    /** Numeric Boosty payment / subscription id */
    id: number | string;
    user?: { id?: number | string; email?: string; name?: string };
    /** Free-form text the user attached to the payment — we ask them to paste a link code here */
    message?: string;
    /** Subscription level id (if event is for a subscription) */
    level_id?: number | string;
    amount?: number;
    currency?: string;
    status?: 'succeeded' | 'pending' | 'failed';
  };
}

export function verifyBoostySignature(rawBody: string, header: string | undefined): boolean {
  if (!header) return false;
  const value = header.startsWith('sha256=') ? header.slice('sha256='.length) : header;
  const expected = createHmac('sha256', env.boostyWebhookSecret).update(rawBody).digest('hex');
  if (expected.length !== value.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(value, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Pulls the `tg-<telegram_id>` link code we asked the user to paste into the payment
 * comment. Returns the parsed Telegram ID or null if not found.
 */
export function extractTelegramIdFromMessage(message: string | undefined): number | null {
  if (!message) return null;
  const m = message.match(/tg-(\d{4,15})/i);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isFinite(id) ? id : null;
}

export function isPremiumLevel(levelId: string | number | undefined): boolean {
  if (env.boostyPremiumLevelIds.length === 0) return true; // no filter configured = accept all
  if (levelId === undefined) return false;
  return env.boostyPremiumLevelIds.includes(String(levelId));
}
