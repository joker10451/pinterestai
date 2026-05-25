import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';

export type CryptoAsset = 'USDT' | 'TON';

export interface CryptoInvoice {
  invoice_id: number;
  hash: string;
  asset: CryptoAsset;
  amount: string;
  pay_url: string;
  bot_invoice_url: string;
  status: 'active' | 'paid' | 'expired';
  payload?: string;
}

interface CreateInvoiceArgs {
  asset: CryptoAsset;
  amount: number;
  description: string;
  /** Arbitrary string stored on the invoice (we use telegram_id here). Max 4kb. */
  payload: string;
  /** Telegram deep-link returned to user after payment. */
  paid_btn_url?: string;
}

async function call<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${env.cryptoPayApiUrl}/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Crypto-Pay-API-Token': env.cryptoPayToken,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; result?: T; error?: unknown };
  if (!json.ok) {
    throw new Error(`Crypto Pay error (${method}): ${JSON.stringify(json.error)}`);
  }
  return json.result as T;
}

export async function createInvoice(args: CreateInvoiceArgs): Promise<CryptoInvoice> {
  return call<CryptoInvoice>('createInvoice', {
    asset: args.asset,
    amount: args.amount.toString(),
    description: args.description,
    payload: args.payload,
    paid_btn_name: args.paid_btn_url ? 'openBot' : undefined,
    paid_btn_url: args.paid_btn_url,
    allow_anonymous: false,
  });
}

/**
 * Crypto Pay signs webhook bodies with the SHA-256(api_token) HMAC of the raw request body
 * and ships the digest in the `crypto-pay-api-signature` header.
 * See: https://help.crypt.bot/crypto-pay-api#webhooks
 */
export function verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
  if (!signature) return false;
  const secret = createHash('sha256').update(env.cryptoPayToken).digest();
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  // timingSafeEqual requires equal-length buffers.
  if (expected.length !== signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}
