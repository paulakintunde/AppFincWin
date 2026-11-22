// Pure (no React or I/O). 09-22: when a hidden feature may be offered in context (D-36, D-37, TIER-05, UI-SPEC 12).
// At most one offer a week across the app (counted when one is shown), "Not now" hides one feature for 30 days,
// "Don't suggest" stops it for good. Nothing here turns anything on: only a yes does.
import { FEATURES, type FeatureId } from './featureRegistry';
import type { AccessReason } from './evaluateAccess';

export const DAY_MS = 24 * 60 * 60 * 1000;
/** One offer a week, across the app. */
export const OFFER_GAP_MS = 7 * DAY_MS;
/** "Not now" hides that feature's offer this long. */
export const SNOOZE_MS = 30 * DAY_MS;
/** A trial that ends within this many days is a notice day (UI-SPEC 7). */
const TRIAL_NOTICE_DAYS = 3;

/** Where the offer would show. Decide answers and onboarding never get one. */
export type OfferContext = 'home' | 'decide' | 'onboarding';

export type OfferPlanStatus = 'trial' | 'active' | 'grace' | 'locked' | 'tester' | 'sample';

export interface OfferState {
  /** ISO time the last offer was shown; null when none has been. */
  lastShownAt: string | null;
  /** Feature id to the ISO time its "Not now" ends. */
  snoozed: Record<string, string>;
  /** Feature ids the person said "Don't suggest" to. */
  never: string[];
}

export const EMPTY_OFFER_STATE: OfferState = { lastShownAt: null, snoozed: {}, never: [] };

export interface OfferAccess {
  visible: boolean;
  reason: AccessReason;
}

export interface CanShowInput {
  featureId: string;
  now: number;
  state: OfferState;
  context: OfferContext;
  planStatus: OfferPlanStatus;
  /** Whether the plan lets the person write (a locked household is read-only). */
  planWritable: boolean;
  paymentNoticeToday: boolean;
  access: OfferAccess;
}

/** True on a day a trial or payment notice is due: grace, or a trial ending within three days. */
export function paymentNoticeDue(plan: { status: OfferPlanStatus; trialEndsAt: string | null }, now: number): boolean {
  if (plan.status === 'grace') return true;
  if (plan.status !== 'trial' || plan.trialEndsAt === null) return false;
  const ends = Date.parse(plan.trialEndsAt);
  return Number.isFinite(ends) && ends - now <= TRIAL_NOTICE_DAYS * DAY_MS;
}

export function canShowOffer(i: CanShowInput): boolean {
  if (i.context === 'decide' || i.context === 'onboarding') return false;
  if (i.planStatus === 'sample' || i.planStatus === 'locked' || !i.planWritable) return false;
  if (i.paymentNoticeToday) return false;
  if (i.access.reason === 'household' || i.access.reason === 'plan') return false;
  if (i.access.visible) return false;
  if (i.state.never.includes(i.featureId)) return false;
  const until = i.state.snoozed[i.featureId];
  if (until !== undefined && Date.parse(until) > i.now) return false;
  if (i.state.lastShownAt !== null && i.now - Date.parse(i.state.lastShownAt) < OFFER_GAP_MS) return false;
  return true;
}

export interface PickInput extends Omit<CanShowInput, 'featureId' | 'access'> {
  triggered: ReadonlySet<string>;
  accessById: (id: FeatureId) => OfferAccess;
}

/** The first triggered, eligible feature in registry order, or null. */
export function pickOffer(i: PickInput): FeatureId | null {
  for (const f of FEATURES) {
    if (!i.triggered.has(f.id)) continue;
    if (canShowOffer({ ...i, featureId: f.id, access: i.accessById(f.id) })) return f.id;
  }
  return null;
}

/** State after an offer is shown. */
export function withShown(state: OfferState, now: number): OfferState {
  return { ...state, lastShownAt: new Date(now).toISOString() };
}

/** State after "Not now": that feature is hidden for 30 days. */
export function withSnooze(state: OfferState, featureId: string, now: number): OfferState {
  return { ...state, snoozed: { ...state.snoozed, [featureId]: new Date(now + SNOOZE_MS).toISOString() } };
}

/** State after "Don't suggest": never again. */
export function withNever(state: OfferState, featureId: string): OfferState {
  return state.never.includes(featureId) ? state : { ...state, never: [...state.never, featureId] };
}
