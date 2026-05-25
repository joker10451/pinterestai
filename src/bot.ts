import { Bot, GrammyError, HttpError } from 'grammy';
import { config } from './config';
import { handleBoostyPayment, handleCryptoPayment } from './handlers/payments';
import { handleStart, premiumKeyboard } from './handlers/start';

// Single bot instance reused across warm invocations on Vercel.
let cachedBot: Bot | null = null;

export function getBot(): Bot {
  if (cachedBot) return cachedBot;

  const bot = new Bot(config.bot.token);

  bot.command('start', handleStart);

  bot.command('premium', async (ctx) => {
    await ctx.reply('Choose your payment method:', { reply_markup: premiumKeyboard() });
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      'Commands:\n/start — get the free guide\n/premium — buy premium access\n/help — this message',
    );
  });

  bot.callbackQuery(/^pay:crypto:(USDT|TON)$/, async (ctx) => {
    const asset = ctx.match![1];
    await handleCryptoPayment(ctx, asset);
  });

  bot.callbackQuery('pay:boosty', handleBoostyPayment);

  bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`bot error for update ${ctx.update.update_id}:`, err.error);
    if (err.error instanceof GrammyError) {
      console.error('telegram api error', err.error.description);
    } else if (err.error instanceof HttpError) {
      console.error('network error', err.error);
    }
  });

  cachedBot = bot;
  return bot;
}
