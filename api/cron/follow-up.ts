import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBot } from '../../src/bot';
import { premiumOfferKeyboard } from '../../src/bot/keyboards';
import { reminder24h } from '../../src/bot/messages';
import { env } from '../../src/config/env';
import { findUsersDueForReminder, markReminded } from '../../src/lib/repo';

const BATCH_LIMIT = 50;

export default async function (req: VercelRequest, res: VercelResponse) {
  // Vercel Cron injects `Authorization: Bearer ${CRON_SECRET}`. Reject everything else.
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${env.cronSecret}`) {
    res.status(401).json({ ok: false });
    return;
  }

  const due = await findUsersDueForReminder(24, BATCH_LIMIT);

  // Process sequentially to stay under Telegram's per-bot rate limits (~30 msg/s global).
  // For larger volumes, switch to chunked Promise.all with bottleneck.
  let sent = 0;
  let failed = 0;
  for (const user of due) {
    try {
      await getBot().api.sendMessage(user.telegram_id, reminder24h(), {
        parse_mode: 'Markdown',
        reply_markup: premiumOfferKeyboard(),
      });
      await markReminded(user.telegram_id);
      sent++;
    } catch (err) {
      failed++;
      // Most common: user blocked the bot (403). We still mark them so we stop trying.
      const status = (err as { error_code?: number }).error_code;
      if (status === 403) {
        await markReminded(user.telegram_id).catch(() => {});
      }
      console.error('cron: send failed', user.telegram_id, err);
    }
  }

  res.status(200).json({ ok: true, considered: due.length, sent, failed });
}
