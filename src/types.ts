import type { Timestamp } from 'firebase-admin/firestore';

export type FunnelStage =
  | 'joined'
  | 'lead_magnet_delivered'
  | 'followup_sent'
  | 'premium_offered'
  | 'premium_paid';

export type PaymentGateway = 'crypto' | 'boosty';
export type PaymentStatus = 'pending' | 'paid' | 'expired' | 'failed';
export type PremiumStatus = 'free' | 'active' | 'expired';

export interface UserDoc {
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  source: string | null;
  joined_at: Timestamp;
  funnel_stage: FunnelStage;
  premium_status: PremiumStatus;
  premium_activated_at?: Timestamp | null;
  followup_sent_at?: Timestamp | null;
  // Used to correlate a Boosty payer with a Telegram user when their Boosty payload
  // can't carry the telegram_id directly.
  boosty_email?: string | null;
}

export interface TransactionDoc {
  tx_id: string;
  telegram_id: number;
  amount: number;
  currency: string;
  gateway: PaymentGateway;
  status: PaymentStatus;
  created_at: Timestamp;
  updated_at: Timestamp;
  // Provider-specific reference (CryptoPay invoice id, Boosty subscription id, etc.)
  provider_ref: string;
  raw?: Record<string, unknown>;
}
