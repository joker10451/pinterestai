import { Bot, GrammyError, HttpError } from 'grammy';
import { env } from '../config/env';
import { createInvoice, type CryptoAsset } from '../lib/cryptopay';
import {
  createTransaction,
  setFunnelStage,
  upsertUser,
} from '../lib/repo';
import { premiumOfferKeyboard, premiumAccessKeyboard } from './keyboards';
import {
  boostyInstructions,
  leadMagnet,
  paymentCreated,
  premiumInfo,
  upsellPitch,
  welcome,
} from './messages';

// Singleton bot — keeps the underlying Api client warm across warm Vercel invocations.
let botInstance: Bot | null = null;

export function getBot(): Bot {
  if (botInstance) return botInstance;

  const bot = new Bot(env.botToken);

  bot.command('start', async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    const payload = ctx.match?.toString().trim() || null;

    const { created } = await upsertUser({
      telegramId: from.id,
      username: from.username ?? null,
      firstName: from.first_name ?? null,
      languageCode: from.language_code ?? null,
      source: payload,
    });

    await ctx.reply(welcome(from.first_name ?? null));

    // Deep-link from Pinterest: deliver the free magnet immediately.
    if (payload === 'pin_tracker' || created) {
      await ctx.reply(leadMagnet(), {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true },
      });
      await setFunnelStage(from.id, 'lead_delivered');
      // Soft upsell right after delivery.
      await ctx.reply(upsellPitch(), {
        parse_mode: 'Markdown',
        reply_markup: premiumOfferKeyboard(),
      });
    } else {
      await ctx.reply(upsellPitch(), {
        parse_mode: 'Markdown',
        reply_markup: premiumOfferKeyboard(),
      });
    }
  });

  bot.command('premium', async (ctx) => {
    await ctx.reply(upsellPitch(), {
      parse_mode: 'Markdown',
      reply_markup: premiumOfferKeyboard(),
    });
  });

  bot.callbackQuery('premium:info', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(premiumInfo(), {
      parse_mode: 'Markdown',
      reply_markup: premiumOfferKeyboard(),
    });
  });

  bot.callbackQuery(/^pay:crypto:(USDT|TON)$/, async (ctx) => {
    const asset = ctx.match[1] as CryptoAsset;
    const amount = asset === 'USDT' ? env.premiumPriceUsdt : env.premiumPriceTon;
    const telegramId = ctx.from.id;

    await ctx.answerCallbackQuery({ text: 'Generating invoice…' });

    const invoice = await createInvoice({
      asset,
      amount,
      description: `Premium Access for @${ctx.from.username ?? telegramId}`,
      payload: String(telegramId),
    });

    await createTransaction({
      txId: String(invoice.invoice_id),
      telegramId,
      amount,
      currency: asset,
      gateway: 'crypto',
      raw: { hash: invoice.hash },
    });

    await ctx.reply(paymentCreated(invoice.pay_url, asset), {
      link_preview_options: { is_disabled: true },
    });
  });

  bot.callbackQuery('pay:boosty', async (ctx) => {
    await ctx.answerCallbackQuery();
    const code = `tg-${ctx.from.id}`;
    // Pre-register a pending Boosty transaction keyed by the linking code so the webhook
    // can resolve it without ambiguity.
    await createTransaction({
      txId: `boosty:${code}`,
      telegramId: ctx.from.id,
      amount: env.premiumPriceRub,
      currency: 'RUB',
      gateway: 'boosty',
      raw: { link_code: code },
    });
    await ctx.reply(boostyInstructions().replace('{code}', code), {
      parse_mode: 'Markdown',
    });
  });

  bot.catch((err) => {
    const ctx = err.ctx;
    if (err.error instanceof GrammyError) {
      console.error('Grammy API error', err.error.description, 'update', ctx?.update.update_id);
    } else if (err.error instanceof HttpError) {
      console.error('Network error', err.error);
    } else {
      console.error('Bot error', err.error);
    }
  });

  botInstance = bot;
  return bot;
}

export { premiumAccessKeyboard };
