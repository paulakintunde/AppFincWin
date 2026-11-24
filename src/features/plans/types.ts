// 09-10: the client plan contract. The server record (plan_state()) is the only authority; these types are what the
// screens of plans 09-13..09-24 read. No type here carries a store object.
export type PlanKey = 'solo' | 'duo' | 'household' | 'extended';
export type PlanPeriod = 'month' | 'year';
export type PlanStatus = 'trial' | 'active' | 'grace' | 'locked' | 'tester' | 'sample';

export type PlanStore = 'APP_STORE' | 'PLAY_STORE' | 'PROMOTIONAL' | 'BACKFILL' | 'NONE';

/** The server state names returned by plan_state(). */
export type PlanServerState = 'prelaunch' | 'none' | 'trial' | 'active' | 'grace' | 'promo' | 'left_grace' | 'lapsed';

/** The raw jsonb from plan_state(), keys as the server writes them. */
export interface PlanStateRow {
  household_id: string | null;
  state: PlanServerState;
  plan_key: PlanKey | null;
  plan_size: number | null;
  period: PlanPeriod | null;
  payer_id: string | null;
  payer_is_me: boolean | null;
  payer_name: string | null;
  store: PlanStore | null;
  product_id: string | null;
  environment: string | null;
  will_renew: boolean | null;
  covered_until: string | null;
  store_expires_at: string | null;
  grace_until: string | null;
  trial_ends_at: string | null;
  promo_kind: 'tester' | 'owner' | null;
  trial_available: boolean | null;
  members: number | null;
  seats: number | null;
  writable: boolean | null;
  billing_issue_at: string | null;
  last_synced_at: string | null;
  /** quick 261124-2bs: set only for someone alone in a home made by their own leave. Absent on older servers and cached rows. */
  left_at?: string | null;
  left_home_name?: string | null;
}

export interface PlanView {
  status: PlanStatus;
  kind: string;
  writable: boolean;
  householdId: string | null;
  planKey: PlanKey | null;
  planSize: number;
  period: PlanPeriod | null;
  seats: number;
  members: number;
  payerId: string | null;
  payerIsMe: boolean;
  payerName: string | null;
  store: PlanStore | null;
  productId: string | null;
  willRenew: boolean;
  coveredUntil: string | null;
  trialEndsAt: string | null;
  graceUntil: string | null;
  promoKind: 'tester' | 'owner' | null;
  prelaunch: boolean;
  leftGrace: boolean;
  trialAvailable: boolean;
  billingIssueAt: string | null;
  /** quick 261124-2bs (UAT C2-1): when this person left a home and now lives alone; null otherwise. Optional so fixtures need no edit. */
  leftAt?: string | null;
  /** The name of the home they left; null when that home is gone. */
  leftHomeName?: string | null;
  loading: boolean;
  isError: boolean;
}

export interface PlanOffer {
  planKey: PlanKey;
  period: PlanPeriod;
  packageId: string;
  productId: string;
  priceString: string;
  hasTrial: boolean;
  trialDays: number | null;
  currencyCode: string;
}

export type PurchaseOutcome =
  | { kind: 'purchased' }
  | { kind: 'cancelled' }
  | { kind: 'pending' }
  | { kind: 'failed'; notCharged: boolean }
  | { kind: 'already-used-by-another-account' };

export type ChangeTiming = 'now' | 'renewal' | 'trialContinues';
