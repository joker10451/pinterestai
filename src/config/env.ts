function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function opt(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export const env = {
  botToken: req('BOT_TOKEN'),
  webhookSecret: req('TELEGRAM_WEBHOOK_SECRET'),
  publicUrl: opt('PUBLIC_URL'),

  leadMagnetUrl: req('LEAD_MAGNET_URL'),
  leadMagnetTitle: opt('LEAD_MAGNET_TITLE', 'Free guide'),

  premiumPriceUsdt: Number(opt('PREMIUM_PRICE_USDT', '15')),
  premiumPriceTon: Number(opt('PREMIUM_PRICE_TON', '4.5')),
  premiumPriceRub: Number(opt('PREMIUM_PRICE_RUB', '990')),
  premiumContentUrl: req('PREMIUM_CONTENT_URL'),

  firebaseServiceAccountB64: req('FIREBASE_SERVICE_ACCOUNT_B64'),
  firebaseProjectId: req('FIREBASE_PROJECT_ID'),

  cryptoPayToken: req('CRYPTO_PAY_TOKEN'),
  cryptoPayApiUrl: opt('CRYPTO_PAY_API_URL', 'https://pay.crypt.bot/api'),

  boostyWebhookSecret: req('BOOSTY_WEBHOOK_SECRET'),
  boostyPremiumLevelIds: opt('BOOSTY_PREMIUM_LEVEL_IDS')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  cronSecret: req('CRON_SECRET'),
};

export type Env = typeof env;
