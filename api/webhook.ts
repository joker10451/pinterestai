import type { VercelRequest, VercelResponse } from '@vercel/node';
import { webhookCallback } from 'grammy';
import { getBot } from '../src/bot';
import { env } from '../src/config/env';

// Build the grammY → Vercel adapter once per warm instance.
const handler = webhookCallback(getBot(), 'http', {
  // grammY's default 10s timeout is risky on cold starts; align with Vercel function limit.
  timeoutMilliseconds: 25_000,
  // Telegram sends the secret in this header — grammY checks it for us.
  secretToken: env.webhookSecret,
});

export default async function (req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    return;
  }
  try {
    // CRITICAL: await the adapter so Vercel does not terminate the function
    // before grammY finishes processing the update (Firestore writes, API replies).
    await handler(req, res);
  } catch (err) {
    console.error('webhook handler error', err);
    if (!res.headersSent) res.status(500).json({ ok: false });
  }
}

export const config = {
  api: {
    // Telegram updates are small; we don't need a large body parser.
    bodyParser: { sizeLimit: '1mb' },
  },
};
