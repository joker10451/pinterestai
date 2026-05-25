import { InlineKeyboard, type Context } from 'grammy';
import { config } from '../config';
import { setFunnelStage, upsertUser } from '../services/users';

const WELCOME = (firstName: string) =>
  `👋 Hi ${firstName}! Welcome aboard.\n\nHere's your free guide — enjoy! 🎁`;

const UPSELL = `🔥 Want the full *Premium Pack*?\n\nYou'll get the complete library, advanced templates, and private community access.\n\nChoose how to pay:`;

export function premiumKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text(`💎 Pay ${config.premium.priceUsdt} USDT`, 'pay:crypto:USDT')
    .text(`💎 Pay ${config.premium.priceTon} TON`, 'pay:crypto:TON')
    .row()
    .text('💳 Pay via Boosty (RUB / Card)', 'pay:boosty');
}

export async function handleStart(ctx: Context): Promise<void> {
  if (!ctx.from || !ctx.chat) return;

  // grammY exposes /start payloads on ctx.match when using bot.command('start', ...)
  // but to keep this handler reusable from anywhere, we parse it manually as a fallback.
  const text = ctx.message?.text ?? '';
  const payload = text.startsWith('/start')
    ? text.slice('/start'.length).trim() || null
    : null;

  const { created } = await upsertUser({
    telegram_id: ctx.from.id,
    username: ctx.from.username ?? null,
    first_name: ctx.from.first_name ?? null,
    source: payload,
  });

  await ctx.reply(WELCOME(ctx.from.first_name ?? 'there'));

  // Pinterest funnel: deliver the lead magnet automatically.
  if (payload === 'pin_tracker' || created) {
    await deliverLeadMagnet(ctx);
    await setFunnelStage(ctx.from.id, 'lead_magnet_delivered');
  }

  await ctx.reply(UPSELL, {
    parse_mode: 'Markdown',
    reply_markup: premiumKeyboard(),
  });
  await setFunnelStage(ctx.from.id, 'premium_offered');
}

async function deliverLeadMagnet(ctx: Context): Promise<void> {
  if (config.leadMagnet.fileId) {
    await ctx.replyWithDocument(config.leadMagnet.fileId, {
      caption: '📎 Your free guide',
    });
    return;
  }
  if (config.leadMagnet.url) {
    await ctx.reply(`📎 Your free guide: ${config.leadMagnet.url}`, {
      link_preview_options: { is_disabled: false },
    });
    return;
  }
  await ctx.reply('📎 Your free guide will be sent shortly.');
}
