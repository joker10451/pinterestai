# Pinterest → Telegram Funnel Bot

Serverless Telegram bot built for monetizing Pinterest traffic. Delivers a free lead magnet on
`t.me/<Bot>?start=pin_tracker`, upsells a premium offer, and accepts payment via **Crypto Pay**
(USDT / TON) or **Boosty** (RUB / card). Runs entirely on **Vercel Serverless Functions** with
**Firestore** for state.

## Project layout

```
.
├── api/
│   ├── webhook.ts          # Telegram update entry point (grammY)
│   ├── crypto-webhook.ts   # CryptoPay invoice_paid webhook
│   ├── boosty-webhook.ts   # Boosty subscription.paid webhook
│   └── cron-followup.ts    # Hourly cron — sends 24h follow-up to free users
├── src/
│   ├── bot.ts              # Single cached Bot instance + handler registration
│   ├── config.ts           # Strict env loader
│   ├── firebase.ts         # Admin SDK init (cached across warm starts)
│   ├── types.ts            # UserDoc / TransactionDoc / FunnelStage
│   ├── handlers/
│   │   ├── start.ts        # /start, deep-link parsing, lead magnet, upsell keyboard
│   │   └── payments.ts     # crypto + boosty callback handlers
│   └── services/
│       ├── users.ts        # upsertUser, funnel stage, premium status, follow-up query
│       ├── transactions.ts # tx CRUD + idempotency lookup
│       ├── crypto-pay.ts   # createInvoice + HMAC verify (CryptoPay)
│       └── boosty.ts       # payload parsing + HMAC verify (Boosty)
├── scripts/
│   └── set-webhook.ts      # Registers the Vercel URL with Telegram
├── vercel.json             # routes, function limits, cron schedule
├── package.json
├── tsconfig.json
└── .env.example
```

## Firestore schema

### `users/{telegram_id}`
| field                 | type             | notes                                            |
| --------------------- | ---------------- | ------------------------------------------------ |
| `telegram_id`         | number           | document id = string version of this             |
| `username`            | string \| null   |                                                  |
| `first_name`          | string \| null   |                                                  |
| `source`              | string \| null   | `pin_tracker` for Pinterest deep-link            |
| `joined_at`           | Timestamp        |                                                  |
| `funnel_stage`        | enum             | joined → lead_magnet_delivered → followup_sent → premium_offered → premium_paid |
| `premium_status`      | enum             | free / active / expired                          |
| `premium_activated_at`| Timestamp        |                                                  |
| `followup_sent_at`    | Timestamp        | used by the cron to avoid double-sends           |
| `boosty_email`        | string \| null   | for fallback Boosty reconciliation               |

### `transactions/{auto_id}`
| field         | type      | notes                                              |
| ------------- | --------- | -------------------------------------------------- |
| `tx_id`       | string    | same as doc id                                      |
| `telegram_id` | number    |                                                    |
| `amount`      | number    |                                                    |
| `currency`    | string    | USDT / TON / RUB / …                               |
| `gateway`     | enum      | `crypto` / `boosty`                                |
| `status`      | enum      | pending / paid / expired / failed                  |
| `provider_ref`| string    | CryptoPay `invoice_id` or Boosty `subscription_id` |
| `created_at`  | Timestamp |                                                    |
| `updated_at`  | Timestamp |                                                    |
| `raw`         | map       | full provider payload for audit                    |

## User flow

1. User taps a Pinterest pin → `t.me/<Bot>?start=pin_tracker`.
2. `/start` handler upserts the user, stamps `source = pin_tracker`, sends welcome + lead magnet.
3. Inline keyboard offers Premium via **USDT / TON / Boosty**.
4. On `pay:crypto:*` → `createInvoice` → user pays → CryptoPay POSTs to `/api/crypto-webhook` → `premium_status = active` → confirmation DM.
5. On `pay:boosty` → user redirected to Boosty (telegram_id in `comment`) → on payment Boosty POSTs to `/api/boosty-webhook` → same flow.
6. The hourly cron picks up users who joined > 24h ago, are still on `free`, and haven't been followed up — sends one reminder.

## Local dev

```bash
npm install
cp .env.example .env       # fill in real values
vercel dev                 # exposes /api/* on http://localhost:3000

# expose to Telegram (use ngrok / cloudflared):
PUBLIC_URL=https://<tunnel>.ngrok.app npm run set-webhook
```

## Deployment

```bash
vercel link
vercel env add BOT_TOKEN production        # … and every other var from .env.example
vercel --prod
PUBLIC_URL=https://<your-app>.vercel.app npm run set-webhook
```

Then register the webhooks on the provider side:

* **CryptoPay**: `@CryptoBot` → My Apps → Webhooks → `https://<your-app>.vercel.app/api/crypto-webhook`
* **Boosty**: integration settings → outgoing webhook → `https://<your-app>.vercel.app/api/boosty-webhook` (use `BOOSTY_WEBHOOK_SECRET` as the shared secret)

## Required environment variables

See `.env.example` for the canonical list. Summary:

| Var | Purpose |
| --- | --- |
| `BOT_TOKEN`, `BOT_USERNAME` | Telegram bot identity |
| `TELEGRAM_WEBHOOK_SECRET` | grammY rejects updates without this header — set the same value in `setWebhook` |
| `LEAD_MAGNET_URL` / `LEAD_MAGNET_FILE_ID` | what to deliver as the freebie (file_id takes precedence) |
| `PREMIUM_PRICE_USDT`, `PREMIUM_PRICE_TON`, `PREMIUM_BOOSTY_URL` | upsell |
| `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_BASE64` | service account JSON, base64-encoded |
| `CRYPTO_PAY_TOKEN`, `CRYPTO_PAY_NETWORK` | Crypto Pay API |
| `BOOSTY_WEBHOOK_SECRET` | HMAC shared secret for Boosty inbound |
| `CRON_SECRET` | Vercel cron auth header |

## Cold-start / async-safety notes

* `Bot` and `firebase-admin` are constructed once at module scope and cached so warm invocations reuse them — keeps p99 cold start in the 300–600 ms range.
* `webhookCallback(..., { timeoutMilliseconds: 25_000 })` ensures grammY surfaces a 504 before Vercel cuts the lambda, so we never partially-complete a Firestore write.
* All Firestore writes and `bot.api.*` calls are `await`-ed; the function only resolves after every effect has been flushed. Telegram retries on non-2xx, so we always respond 200 on transient errors and let observability catch the underlying failure.
* Both payment webhooks set `bodyParser: false` and verify HMAC against the raw bytes (timing-safe compare).
* Both payment webhooks are idempotent on `provider_ref` — duplicate deliveries do not grant double access or send duplicate confirmations.

## Operational notes

* Required Firestore composite indexes:
  * `users`: `funnel_stage ASC, premium_status ASC, joined_at ASC` (used by the cron query).
* Vercel cron is hourly (`0 * * * *`). Within each run we filter for users that joined >24h ago, so the practical fire-window for each user is t+24h ± 1h.
