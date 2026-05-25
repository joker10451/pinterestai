/* eslint-disable no-console */
import { env } from '../src/config/env';

async function main() {
  if (!env.publicUrl) throw new Error('PUBLIC_URL is required to register the webhook');
  const url = `${env.publicUrl.replace(/\/$/, '')}/api/webhook`;
  const res = await fetch(`https://api.telegram.org/bot${env.botToken}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      secret_token: env.webhookSecret,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: false,
    }),
  });
  const body = await res.json();
  console.log('setWebhook →', body);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
