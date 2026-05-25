import type { Timestamp } from 'firebase-admin/firestore';

export type FunnelStage =
  | 'joined'
  | 'lead_delivered'
  | 'reminded_24h'
  | 'paid';

export type Gateway = 'crypto' | 'boosty';
export type Currency = 'USDT' | 'TON' | 'RUB';
export type TxStatus = 'pending' | 'paid' | 'failed' | 'expired';

export interface UserDoc {
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  language_code: string | null;
  source: string | null; // e.g. "pin_tracker"
  joined_at: Timestamp;
  funnel_stage: FunnelStage;
  premium_status: boolean;
  premium_since: Timestamp | null;
  last_reminder_at: Timestamp | null;
}

export interface TransactionDoc {
  tx_id: string; // gateway-side id (crypto invoice_id or boosty payment id)
  telegram_id: number;
  amount: number;
  currency: Currency;
  gateway: Gateway;
  status: TxStatus;
  created_at: Timestamp;
  updated_at: Timestamp;
  raw?: Record<string, unknown>;
}
