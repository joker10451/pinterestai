import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { config } from '../config';
import { createInvoice, type CryptoAsset } from '../services/crypto-pay';
import { createTransaction } from '../services/transactions';
import { setFunnelStage } from '../services/users';

const SUPPORTED_CRYPTO: Record<string, { asset: CryptoAsset; amount: number }> = {
  USDT: { asset: 'USDT', amount: 0 }, // amount filled from config at call time
  TON: { asset: 'TON', amount: 0 },
};

export async function handleCryptoPayment(ctx: Context, assetKey: string): Promise<void> {
  if (!ctx.from) return;
  const choice = SUPPORTED_CRYPTO[assetKey];
  if (!choice) {
    await ctx.answerCallbackQuery({ text: 'Unsupported asset', show_alert: true });
    return;
  }
  const amount =
    choice.asset === 'USDT' ? config.premium.priceUsdt : config.premium.priceTon;

  await ctx.answerCallbackQuery();

  try {
    const invoice = await createInvoice({
      asset: choice.asset,
      amount,
      telegramId: ctx.from.id,
      description: `Premium access (${choice.asset})`,
    });

    await createTransaction({
      telegram_id: ctx.from.id,
      amount,
      currency: choice.asset,
      gateway: 'crypto',
      provider_ref: String(invoice.invoice_id),
      status: 'pending',
      raw: { hash: invoice.hash },
    });

    const kb = new InlineKeyboard().url(`Pay ${amount} ${choice.asset}`, invoice.pay_url);
    await ctx.reply(
      `💎 Invoice created.\n\nTap the button below to pay *${amount} ${choice.asset}*. ` +
        `Your access will be activated automatically the moment the transaction is confirmed.`,
      { parse_mode: 'Markdown', reply_markup: kb },
    );
    await setFunnelStage(ctx.from.id, 'premium_offered');
  } catch (err) {
    console.error('crypto invoice creation failed', err);
    await ctx.reply('⚠️ Could not create a crypto invoice right now. Please try again in a minute.');
  }
}

export async function handleBoostyPayment(ctx: Context): Promise<void> {
  if (!ctx.from) return;
  await ctx.answerCallbackQuery();

  // Boosty doesn't accept a custom payload on the standard subscription link, so we
  // ask the user to mention their Telegram username in the order comment. The webhook
  // handler reconciles by external_id when available, else falls back to email match
  // (collected on a follow-up step), else holds the payment for manual linking.
  const kb = new InlineKeyboard().url(
    '💳 Open Boosty',
    `${config.premium.boostyUrl}${config.premium.boostyUrl.includes('?') ? '&' : '?'}comment=${ctx.from.id}`,
  );
  await ctx.reply(
    `💳 You'll be redirected to Boosty.\n\n*Important:* leave your Telegram ID \`${ctx.from.id}\` ` +
      `in the order comment so we can match your payment automatically.`,
    { parse_mode: 'Markdown', reply_markup: kb },
  );
  await setFunnelStage(ctx.from.id, 'premium_offered');
}
