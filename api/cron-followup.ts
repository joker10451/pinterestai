import type { VercelRequest, VercelResponse } from '@vercel/node';
import { InlineKeyboard } from 'grammy';
import { getBot } from '../src/bot';
import { config } from '../src/config';
import { findUsersAwaitingFollowup, markFollowupSent } from '../src/services/users';

const FOLLOWUP_TEXT =
  `👋 Quick reminder!\n\n` +
  `You grabbed the free guide yesterday — did it help?\n\n` +
  `The *Premium Pack* picks up where the free guide stops: full library, advanced templates, ` +
  `and our private community. Limited launch pricing.`;

function followupKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('💎 Unlock Premium', 'pay:crypto:USDT')
    .row()
    .text('💳 Pay via Boosty', 'pay:boosty');
}

/**
 * Vercel cron entrypoint. Configured in vercel.json to run hourly.
 *
 * Each run picks up at most BATCH_SIZE users who joined >24h ago and haven't
 * been followed up yet. We keep the batch small so we comfortably finish under
 * the 60s function ceiling even if Telegram is slow.
 */
const BATCH_SIZE = 50;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel sends `Authorization: Bearer <CRON_SECRET>` for managed cron requests.
  // We also accept ?secret= for manual invocation during local testing.
  const authz = req.headers['authorization'];
  const provided =
    (authz && authz.startsWith('Bearer ') ? authz.slice(7) : null) ??
    (typeof req.query.secret === 'string' ? req.query.secret : null);

  if (config.cron.secret && provided !== config.cron.secret) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const users = await findUsersAwaitingFollowup({ before: cutoff, limit: BATCH_SIZE });

  const bot = getBot();
  let sent = 0;
  let skipped = 0;

  // Process serially — Telegram rate limits to ~30 msg/sec to different chats.
  // For BATCH_SIZE=50 this completes in ~2s under normal conditions.
  for (const user of users) {
    try {
      await bot.api.sendMessage(user.telegram_id, FOLLOWUP_TEXT, {
        parse_mode: 'Markdown',
        reply_markup: followupKeyboard(),
      });
      await markFollowupSent(user.telegram_id);
      sent++;
    } catch (err) {
      // User may have blocked the bot — mark them so we don't retry every hour.
      console.warn('followup send failed', user.telegram_id, err);
      try {
        await markFollowupSent(user.telegram_id);
      } catch (e) {
        console.error('failed to mark followup sent', e);
      }
      skipped++;
    }
  }

  res.status(200).json({ ok: true, processed: users.length, sent, skipped });
}
