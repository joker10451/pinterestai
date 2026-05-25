# Pinterest → Telegram Funnel Bot

Serverless Telegram bot that:

1. Receives international Pinterest traffic via deep-link `t.me/<BotName>?start=pin_tracker`.
2. Registers the user in Firestore and delivers a free lead magnet.
3. Upsells Premium access through **Crypto Pay** (USDT / TON) and **Boosty** (RUB).
4. Sends a follow-up reminder via a Vercel cron job (runs once daily on the Hobby plan; users are reminded 24–48h after joining).

## Stack

- **TypeScript / Node 18+**
- **[grammY](https://grammy.dev/)** bot framework
- **Vercel Serverless Functions** (`api/*.ts`)
- **Firebase Firestore** (via `firebase-admin`)
- **Crypto Pay API** + **Boosty webhooks**

## Project structure

```
.
├── api/
│   ├── webhook.ts              # Telegram webhook entrypoint
│   ├── payments/
│   │   ├── crypto.ts           # Crypto Pay webhook
│   │   └── boosty.ts           # Boosty webhook
│   └── cron/
│       └── follow-up.ts        # 24h reminder (Vercel cron)
├── src/
│   ├── bot/
│   │   ├── index.ts            # Bot factory, /start + callbacks
│   │   ├── keyboards.ts        # Inline keyboards
│   │   └── messages.ts         # User-facing copy
│   ├── lib/
│   │   ├── firebase.ts         # firebase-admin singleton
│   │   ├── repo.ts             # Firestore data access
│   │   ├── cryptopay.ts        # Crypto Pay client + signature check
│   │   ├── boosty.ts           # Boosty signature + linking helpers
│   │   └── raw-body.ts         # Raw-body reader for webhooks
│   ├── config/env.ts           # Env validation
│   └── types/index.ts          # Domain types
├── scripts/set-webhook.ts      # One-shot: registers Telegram webhook
├── vercel.json
├── tsconfig.json
└── package.json
```

## Firestore schema

**`users/{telegram_id}`**

| Field             | Type            | Notes                                                 |
| ----------------- | --------------- | ----------------------------------------------------- |
| telegram_id       | number          |                                                       |
| username          | string \| null  |                                                       |
| first_name        | string \| null  |                                                       |
| language_code     | string \| null  |                                                       |
| source            | string \| null  | `start` payload (e.g. `pin_tracker`)                  |
| joined_at         | Timestamp       |                                                       |
| funnel_stage      | enum            | `joined` → `lead_delivered` → `reminded_24h` → `paid` |
| premium_status    | boolean         |                                                       |
| premium_since     | Timestamp\|null |                                                       |
| last_reminder_at  | Timestamp\|null |                                                       |

**`transactions/{tx_id}`**

| Field        | Type                             | Notes                                          |
| ------------ | -------------------------------- | ---------------------------------------------- |
| tx_id        | string                           | crypto: invoice_id, boosty: `boosty:tg-<id>`   |
| telegram_id  | number                           |                                                |
| amount       | number                           |                                                |
| currency     | `USDT \| TON \| RUB`             |                                                |
| gateway      | `crypto \| boosty`               |                                                |
| status       | `pending \| paid \| failed \| expired` |                                          |
| created_at   | Timestamp                        |                                                |
| updated_at   | Timestamp                        |                                                |
| raw          | map                              | Gateway-specific payload                       |

Required composite index for the cron query:

```
collection: users
fields:     funnel_stage ASC, joined_at ASC
```

Firestore will print the exact "Create index" link the first time the cron runs.

## Environment variables

See [`.env.example`](./.env.example). Configure them all in the Vercel project before deploying.

Quick checklist:

- `BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `PUBLIC_URL`
- `LEAD_MAGNET_URL`, `LEAD_MAGNET_TITLE`, `PREMIUM_CONTENT_URL`
- `PREMIUM_PRICE_USDT`, `PREMIUM_PRICE_TON`, `PREMIUM_PRICE_RUB`
- `FIREBASE_SERVICE_ACCOUNT_B64`, `FIREBASE_PROJECT_ID`
- `CRYPTO_PAY_TOKEN`, `CRYPTO_PAY_API_URL`
- `BOOSTY_WEBHOOK_SECRET`, `BOOSTY_PREMIUM_LEVEL_IDS`
- `CRON_SECRET`

## Local development

```bash
npm install
cp .env.example .env   # fill values
npx vercel dev         # runs on http://localhost:3000
```

For Telegram to reach a local instance, tunnel it:

```bash
npx untun tunnel http://localhost:3000
PUBLIC_URL=https://<tunnel>.ngrok.app npx ts-node scripts/set-webhook.ts
```

## Deploy

```bash
npx vercel --prod
PUBLIC_URL=https://<your>.vercel.app npx ts-node scripts/set-webhook.ts
```

Then register the webhook URLs with the payment providers:

- **Crypto Pay** → `https://<your>.vercel.app/api/payments/crypto`
- **Boosty** → `https://<your>.vercel.app/api/payments/boosty` (use the same secret as `BOOSTY_WEBHOOK_SECRET`)

## Cold-start notes

- `firebase-admin` and the `Bot` instance are cached in module scope (`src/lib/firebase.ts`, `src/bot/index.ts`) so warm invocations skip re-initialization.
- The service account is decoded from a single base64 env var to avoid `readFile` syscalls.
- All async work is `await`-ed before responding so Vercel does not freeze the function mid-flight.
- Webhook signature verification reads the raw body (`bodyParser: false`) — never trust the parsed JSON for HMAC.

## Boosty linking

Boosty has no per-user metadata field, so the bot generates a code like `tg-<telegram_id>` and asks the user to paste it into the payment comment. The webhook handler extracts the Telegram ID with a regex (`src/lib/boosty.ts`) and grants Premium. If the user forgets, the transaction is acknowledged with `200` and surfaced in logs for manual reconciliation.
