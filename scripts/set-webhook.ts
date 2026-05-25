/**
 * Registers the Vercel webhook with Telegram. Run once after each deployment to a new URL.
 *
 *   PUBLIC_URL=https://your-app.vercel.app npx ts-node scripts/set-webhook.ts
 *
 * Required env: BOT_TOKEN, PUBLIC_URL. Optional: TELEGRAM_WEBHOOK_SECRET.
 */
import { Bot } from 'grammy';

async function main(): Promise<void> {
  const token = process.env.BOT_TOKEN;
  const url = process.env.PUBLIC_URL;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !url) {
    throw new Error('BOT_TOKEN and PUBLIC_URL are required');
  }
  const bot = new Bot(token);
  await bot.init();
  const fullUrl = `${url.replace(/\/$/, '')}/api/webhook`;
  await bot.api.setWebhook(fullUrl, {
    secret_token: secret || undefined,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true,
  });
  console.log(`webhook set to ${fullUrl}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
