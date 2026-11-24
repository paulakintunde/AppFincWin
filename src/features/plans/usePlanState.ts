// 09 D-13: the server record is the only authority. No screen reads a feature flag or CustomerInfo for access (PROJECT.md).
// The lock lifts only when plan_state says writable (UI-SPEC 9e).
import { usePlanStateQuery } from '@/data/queries/plan';
import { useAuth } from '@/features/auth/AuthProvider';
import type { PlanStateRow, PlanStatus, PlanView } from './types';

export interface PlanViewMeta {
  loading: boolean;
  isError: boolean;
}

function statusFor(state: PlanStateRow['state']): PlanStatus {
  switch (state) {
    case 'prelaunch':
    case 'promo':
      return 'tester';
    case 'none':
      return 'sample';
    case 'trial':
      return 'trial';
    case 'active':
      return 'active';
    case 'grace':
    case 'left_grace':
      return 'grace';
    default:
      return 'locked'; // lapsed, and anything the server adds later: never open by default
  }
}

const EMPTY_META: PlanViewMeta = { loading: false, isError: false };

/** Pure: server row to the view. `writable` is the server's field, never recomputed from dates here. */
export function toPlanView(row: PlanStateRow, meta: PlanViewMeta = EMPTY_META): PlanView {
  return {
    status: statusFor(row.state),
    kind: row.state,
    writable: row.writable === true,
    householdId: row.household_id ?? null,
    planKey: row.plan_key ?? null,
    planSize: row.plan_size ?? 0,
    period: row.period ?? null,
    seats: row.seats ?? 0,
    members: row.members ?? 0,
    payerId: row.payer_id ?? null,
    payerIsMe: row.payer_is_me === true,
    payerName: row.payer_name ?? null,
    store: row.store ?? null,
    productId: row.product_id ?? null,
    willRenew: row.will_renew === true,
    coveredUntil: row.covered_until ?? null,
    trialEndsAt: row.trial_ends_at ?? null,
    graceUntil: row.grace_until ?? null,
    promoKind: row.promo_kind ?? (row.state === 'promo' ? 'tester' : null),
    prelaunch: row.state === 'prelaunch',
    leftGrace: row.state === 'left_grace',
    trialAvailable: row.trial_available === true,
    billingIssueAt: row.billing_issue_at ?? null,
    leftAt: row.left_at ?? null,
    leftHomeName: row.left_home_name ?? null,
    loading: meta.loading,
    isError: meta.isError,
  };
}

const NO_ROW: PlanStateRow = {
  household_id: null,
  state: 'none',
  plan_key: null,
  plan_size: null,
  period: null,
  payer_id: null,
  payer_is_me: null,
  payer_name: null,
  store: null,
  product_id: null,
  environment: null,
  will_renew: null,
  covered_until: null,
  store_expires_at: null,
  grace_until: null,
  trial_ends_at: null,
  promo_kind: null,
  trial_available: null,
  members: null,
  seats: null,
  writable: false,
  billing_issue_at: null,
  last_synced_at: null,
  left_at: null,
  left_home_name: null,
};

export function usePlanState(): PlanView {
  const { user } = useAuth();
  const q = usePlanStateQuery(user?.id);
  // A cached value (kept across restarts by the persisted query cache) is returned as is: no optimistic unlock.
  if (q.data) return toPlanView(q.data, { loading: false, isError: q.isError });
  // Nothing known yet: never writable, still loading. A guess of "locked" would flash the wrong screen.
  return { ...toPlanView(NO_ROW, { loading: true, isError: q.isError }), kind: 'unknown', writable: false };
}
