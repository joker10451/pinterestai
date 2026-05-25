import { InlineKeyboard } from 'grammy';
import { env } from '../config/env';

export function premiumOfferKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text(`💎 Premium — ${env.premiumPriceUsdt} USDT`, 'pay:crypto:USDT')
    .row()
    .text(`💎 Premium — ${env.premiumPriceTon} TON`, 'pay:crypto:TON')
    .row()
    .text(`💳 Pay via Boosty (${env.premiumPriceRub}₽)`, 'pay:boosty')
    .row()
    .text('ℹ️ What is inside?', 'premium:info');
}

export function premiumAccessKeyboard(): InlineKeyboard {
  return new InlineKeyboard().url('🔓 Open Premium Vault', env.premiumContentUrl);
}
