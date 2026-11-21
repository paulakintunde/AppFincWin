// 09-06 (D-13): RevenueCat REST client and the normaliser shared by plan-webhook, plan-refresh and plan-grant.
// Plan state is always computed from a fresh GET /v1/subscribers, never from a webhook event type, so late or
// reordered events cannot roll state back. Nothing here logs; callers log type and result only.

export interface PlanSnapshot {
  entitled: boolean;
  product_id: string | null;
  store: 'APP_STORE' | 'PLAY_STORE' | 'PROMOTIONAL' | null;
  environment: 'PRODUCTION' | 'SANDBOX';
  period_type: 'TRIAL' | 'INTRO' | 'NORMAL' | 'PROMOTIONAL' | null;
  expires_at: string | null;
  grace_period_expires_at: string | null;
  billing_issue_detected_at: string | null;
  unsubscribe_detected_at: string | null;
  original_transaction_id: string | null;
  purchased_at: string | null;
}

export const RC_API_BASE = 'https://api.revenuecat.com/v1/subscribers/';
// The one entitlement key RevenueCat grants for every paid product.
export const ENTITLEMENT_KEY = 'access';

export async function fetchSubscriber(
  appUserId: string,
  deps: { apiKey: string; fetch: typeof fetch },
): Promise<unknown> {
  const res = await deps.fetch(RC_API_BASE + encodeURIComponent(appUserId), {
    method: 'GET',
    headers: { Authorization: 'Bearer ' + deps.apiKey, 'content-type': 'application/json' },
  });
  if (!res.ok) throw new Error('revenuecat_' + res.status);
  return await res.json();
}

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === 'object' ? (v as Rec) : {});
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

const STORES = { app_store: 'APP_STORE', play_store: 'PLAY_STORE', promotional: 'PROMOTIONAL' } as const;
const PERIODS = { trial: 'TRIAL', intro: 'INTRO', normal: 'NORMAL', promotional: 'PROMOTIONAL' } as const;

export function toSnapshot(body: unknown, now: number): PlanSnapshot {
  const subscriber = rec(rec(body).subscriber);
  const access = rec(rec(subscriber.entitlements)[ENTITLEMENT_KEY]);
  const hasAccess = Object.keys(access).length > 0;
  const expires = str(access.expires_date);
  const entitled = hasAccess && (expires === null || Date.parse(expires) > now);

  const productId = str(access.product_identifier);
  const sub = productId ? rec(rec(subscriber.subscriptions)[productId]) : {};
  const storeKey = str(sub.store) as keyof typeof STORES | null;
  const periodKey = str(sub.period_type) as keyof typeof PERIODS | null;

  return {
    entitled,
    product_id: productId,
    store: storeKey && STORES[storeKey] ? STORES[storeKey] : null,
    environment: sub.is_sandbox === true ? 'SANDBOX' : 'PRODUCTION',
    period_type: periodKey && PERIODS[periodKey] ? PERIODS[periodKey] : null,
    expires_at: hasAccess ? expires : null,
    grace_period_expires_at: str(sub.grace_period_expires_date) ?? str(access.grace_period_expires_date),
    billing_issue_detected_at: str(sub.billing_issues_detected_at),
    unsubscribe_detected_at: str(sub.unsubscribe_detected_at),
    original_transaction_id: str(sub.store_transaction_id),
    purchased_at: str(sub.original_purchase_date),
  };
}

const KEEP = ['id', 'type', 'app_user_id', 'environment', 'product_id', 'store', 'event_timestamp_ms'];

// Privacy: stored payloads carry no email or subscriber attributes. Keep-list first, then drop any email key.
export function scrubEvent(e: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of KEEP) if (k in e) out[k] = e[k];
  for (const k of Object.keys(out)) if (/^\$?email$/i.test(k)) delete out[k];
  return out;
}

export function isUuid(s: unknown): s is string {
  return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
