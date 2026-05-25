import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config';

/**
 * Boosty does not publish a unified webhook spec — different integrations (Zapier-style,
 * partner programs) deliver slightly different payloads. This module assumes a payload
 * shape that includes at minimum: event type, subscriber email, amount, and (optionally)
 * a custom field carrying the telegram_id captured at checkout.
 *
 * If your Boosty setup posts a different shape, adapt parsePayload accordingly.
 */
export interface BoostyEvent {
  event: 'subscription.paid' | 'subscription.cancelled' | string;
  user: {
    email: string | null;
    name: string | null;
  };
  level: { id: number; name: string } | null;
  amount: number;
  currency: string;
  // Some Boosty integrations let you forward a custom "external_id" or "comment"
  // captured from the checkout form. We use it to carry the Telegram user id.
  external_id?: string | null;
  subscription_id: string;
  paid_at: string;
}

export function parsePayload(raw: unknown): BoostyEvent {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Boosty payload is not an object');
  }
  const r = raw as Record<string, any>;
  return {
    event: String(r.event ?? r.type ?? ''),
    user: {
      email: r.user?.email ?? r.email ?? null,
      name: r.user?.name ?? r.name ?? null,
    },
    level: r.level ?? null,
    amount: Number(r.amount ?? r.price ?? 0),
    currency: String(r.currency ?? 'RUB'),
    external_id: r.external_id ?? r.telegram_id ?? r.comment ?? null,
    subscription_id: String(r.subscription_id ?? r.id ?? ''),
    paid_at: String(r.paid_at ?? new Date().toISOString()),
  };
}

/**
 * Verifies a Boosty webhook signature. We implement HMAC-SHA256 of the raw body
 * with BOOSTY_WEBHOOK_SECRET as the key — this matches the most common Boosty
 * webhook setup and is what you should configure in the Boosty integrations UI.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
  if (!signature) return false;
  const expected = createHmac('sha256', config.boosty.webhookSecret).update(rawBody).digest('hex');
  if (expected.length !== signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

/**
 * Returns the telegram_id encoded in the Boosty payload, or null if not present.
 * external_id is the preferred channel; some integrations stash it in `comment`.
 */
export function extractTelegramId(event: BoostyEvent): number | null {
  const candidate = event.external_id;
  if (candidate == null) return null;
  const n = Number(String(candidate).trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}
