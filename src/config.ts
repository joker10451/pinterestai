function required(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export const config = {
  bot: {
    token: required('BOT_TOKEN'),
    username: optional('BOT_USERNAME'),
    webhookSecret: optional('TELEGRAM_WEBHOOK_SECRET'),
  },
  leadMagnet: {
    url: optional('LEAD_MAGNET_URL'),
    fileId: optional('LEAD_MAGNET_FILE_ID'),
  },
  premium: {
    priceUsdt: Number(optional('PREMIUM_PRICE_USDT', '9.99')),
    priceTon: Number(optional('PREMIUM_PRICE_TON', '3')),
    boostyUrl: optional('PREMIUM_BOOSTY_URL'),
  },
  firebase: {
    projectId: required('FIREBASE_PROJECT_ID'),
    serviceAccountBase64: required('FIREBASE_SERVICE_ACCOUNT_BASE64'),
  },
  cryptoPay: {
    token: required('CRYPTO_PAY_TOKEN'),
    network: (optional('CRYPTO_PAY_NETWORK', 'mainnet') === 'testnet'
      ? 'testnet'
      : 'mainnet') as 'mainnet' | 'testnet',
    get baseUrl(): string {
      return this.network === 'testnet'
        ? 'https://testnet-pay.crypt.bot/api'
        : 'https://pay.crypt.bot/api';
    },
  },
  boosty: {
    webhookSecret: required('BOOSTY_WEBHOOK_SECRET'),
  },
  cron: {
    secret: optional('CRON_SECRET'),
  },
};

export type AppConfig = typeof config;
