import type { VercelRequest, VercelResponse } from '@vercel/node';
import { webhookCallback } from 'grammy';
import { getBot } from '../src/bot';
import { config } from '../src/config';

// Cold-start optimization for Vercel:
//   * grammY's webhookCallback awaits all inflight work before resolving, so
//     Firestore writes and sendMessage calls are never killed by Vercel cutting
//     the lambda the instant the handler returns.
//   * The Bot instance is built once at module scope and reused on warm invocations.
//   * timeoutMilliseconds (25s) fires safely under Vercel's 30s ceiling. Telegram
//     retries on 5xx so we'd rather fail fast than queue duplicates.
const handleUpdate = webhookCallback(getBot(), 'http', {
  timeoutMilliseconds: 25_000,
  secretToken: config.bot.webhookSecret || undefined,
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(200).send('OK');
    return;
  }
  try {
    // VercelRequest/Response extend Node's IncomingMessage/ServerResponse,
    // which is what grammY's 'http' adapter expects.
    await handleUpdate(req, res);
  } catch (err) {
    console.error('webhook handler crashed', err);
    // Always 2xx — Telegram retries non-2xx, which queues duplicate updates.
    if (!res.headersSent) res.status(200).send('OK');
  }
}
