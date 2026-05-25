import { env } from '../config/env';

export const welcome = (firstName: string | null) =>
  `👋 Hey ${firstName ?? 'there'}!\n\n` +
  `Thanks for coming over from Pinterest. Your free gift is on its way ⤵️`;

export const leadMagnet = () =>
  `🎁 *${env.leadMagnetTitle}*\n\n` +
  `Here's your free download:\n${env.leadMagnetUrl}\n\n` +
  `When you're ready to go deeper, tap the button below 👇`;

export const upsellPitch = () =>
  `💎 *Premium Access*\n\n` +
  `Unlock the full Pinterest funnel vault:\n` +
  `• Advanced traffic templates\n` +
  `• Monetization playbooks\n` +
  `• Lifetime updates\n\n` +
  `Pick your payment method:`;

export const reminder24h = () =>
  `⏰ Quick reminder — your *Premium* spot is still open.\n\n` +
  `Most readers grab it within the first day. Want in?`;

export const premiumInfo = () =>
  `*Premium Vault includes:*\n` +
  `✅ Pinterest traffic templates (50+)\n` +
  `✅ Monetization funnels with proven CTR\n` +
  `✅ Private community access\n` +
  `✅ Lifetime updates\n\n` +
  `Tap a payment button below to proceed.`;

export const paymentCreated = (url: string, currency: string) =>
  `🧾 Invoice created (${currency}).\n\n` +
  `Pay here: ${url}\n\n` +
  `Premium activates automatically once payment is confirmed.`;

export const paymentReceived = () =>
  `✅ *Payment received — welcome to Premium!*\n\n` +
  `Your access is unlocked below 👇`;

export const boostyInstructions = () =>
  `💳 Pay via Boosty:\n\n` +
  `1) Open the link and complete the subscription.\n` +
  `2) Use *exactly* this code in the payment comment so we can link your purchase:\n\n` +
  `\`{code}\`\n\n` +
  `Access unlocks automatically within a minute of confirmation.`;
