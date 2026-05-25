import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { config } from '../config';

export type CryptoAsset = 'USDT' | 'TON' | 'BTC' | 'ETH' | 'BNB' | 'TRX' | 'LTC' | 'USDC';

export interface CryptoPayInvoice {
  invoice_id: number;
  hash: string;
  currency_type: 'crypto' | 'fiat';
  asset?: CryptoAsset;
  amount: string;
  pay_url: string;
  bot_invoice_url: string;
  status: 'active' | 'paid' | 'expired';
  description?: string;
  payload?: string;
  created_at: string;
  paid_at?: string;
}

interface CryptoPayResponse<T> {
  ok: boolean;
  result?: T;
  error?: { code: number; name: string };
}

async function call<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${config.cryptoPay.baseUrl}/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Crypto-Pay-API-Token': config.cryptoPay.token,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as CryptoPayResponse<T>;
  if (!json.ok || !json.result) {
    throw new Error(`CryptoPay ${method} failed: ${JSON.stringify(json.error ?? json)}`);
  }
  return json.result;
}

export async function createInvoice(input: {
  asset: CryptoAsset;
  amount: number;
  telegramId: number;
  description: string;
}): Promise<CryptoPayInvoice> {
  return call<CryptoPayInvoice>('createInvoice', {
    currency_type: 'crypto',
    asset: input.asset,
    amount: input.amount.toString(),
    description: input.description,
    // payload is echoed back on the webhook — we use it to find the user.
    payload: JSON.stringify({ telegram_id: input.telegramId }),
    paid_btn_name: 'callback',
    paid_btn_url: `https://t.me/${config.bot.username || 'bot'}`,
    allow_comments: false,
    allow_anonymous: false,
    expires_in: 60 * 60, // 1h
  });
}

/**
 * Verifies a CryptoPay webhook signature.
 *
 * CryptoPay signs the raw JSON body with HMAC-SHA256 using SHA256(API_TOKEN)
 * as the secret key, and sends the hex digest in the `crypto-pay-api-signature`
 * header. See: https://help.crypt.bot/crypto-pay-api#webhooks
 */
export function verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
  if (!signature) return false;
  const secret = createHash('sha256').update(config.cryptoPay.token).digest();
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  // Constant-time compare; lengths must match for timingSafeEqual.
  if (expected.length !== signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export interface CryptoPayUpdate {
  update_id: number;
  update_type: 'invoice_paid';
  request_date: string;
  payload: CryptoPayInvoice;
}
