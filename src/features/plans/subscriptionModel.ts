// 09-15 (UI-SPEC section 6): which variant of You > Subscription a plan view gets, and its rows as copy keys with params.
// Pure: no React, no store. Dates use the person's timezone and locale; the zone abbreviation appears once, on the trial end.
// Every word is a plans.subscription.* key (09-12); no price is written here (it is the store's string, passed in).
import type { StatusKey } from '@/ui/status/statusMap';
import type { PlanView } from './types';

export type SubscriptionVariant = 'payer' | 'member' | 'tester' | 'owner' | 'none' | 'locked';
export type SubscriptionPlatform = 'ios' | 'android';

export interface SubscriptionCtx {
  platform: SubscriptionPlatform;
  /** The store's own price string for the held product; null while it loads or when the store cannot answer. */
  offerPrice: string | null;
  homeName: string | null;
  /** The translated plan name (Solo, Duo, ...), or an empty string when there is no plan. */
  planName: string;
  tz: string;
  locale: string;
  now: number;
}

export interface SubscriptionRow {
  id: 'plan' | 'paidBy' | 'trialEnds' | 'firstCharge' | 'renews' | 'ends' | 'places' | 'freeUntil';
  labelKey: string;
  /** A copy key for the value, or null when `raw` carries it. */
  valueKey: string | null;
  params: Record<string, string | number>;
  raw?: string;
  /** Places only: shows the "See members" link. */
  seeMembers?: boolean;
  /** The value is a whole sentence with no label. */
  fullLine?: boolean;
}

export interface SubscriptionModel {
  variant: SubscriptionVariant;
  badge: StatusKey | null;
  /** The Manage subscription row: the payer of a store subscription only (D-23). */
  showManage: boolean;
  manageSubParams: { store: string };
  /** The "When a plan ends..." line under Manage. */
  showEndsLine: boolean;
  rows: SubscriptionRow[];
  /** Tester variant: the one note line. */
  noteKey: string | null;
  noteParams: Record<string, string>;
  /** Member variant: the card body. */
  memberBodyParams: { payer: string; count: number; date: string };
  showRestore: boolean;
  showChangePlan: boolean;
  /** No plan yet: the entry card with the trial button. */
  showEntry: boolean;
  /** Trial ends within the next day is still "trial"; the notice slot decides reminders, not this model. */
  planStatusCard: boolean;
}

const STORE_NAME: Record<SubscriptionPlatform, string> = { ios: 'App Store', android: 'Google Play' };

function validDate(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmt(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat(locale, options);
  } catch {
    return new Intl.DateTimeFormat('en', { ...options, timeZone: 'UTC' });
  }
}

/** "Dec 4, 2026" in the person's timezone and locale. */
export function dateIn(iso: string | null, tz: string, locale: string): string {
  const d = validDate(iso);
  return d ? fmt(locale, { timeZone: tz, dateStyle: 'medium' }).format(d) : '';
}

/** "6:42 PM EST": the time with the timezone abbreviation. */
export function timeIn(iso: string | null, tz: string, locale: string): string {
  const d = validDate(iso);
  return d ? fmt(locale, { timeZone: tz, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(d) : '';
}

export function variantFor(plan: PlanView): SubscriptionVariant {
  switch (plan.status) {
    case 'sample':
      return 'none';
    case 'tester':
      return plan.promoKind === 'owner' ? 'owner' : 'tester';
    case 'locked':
      return 'locked';
    default:
      return plan.payerIsMe ? 'payer' : 'member';
  }
}

function badgeFor(plan: PlanView, variant: SubscriptionVariant): StatusKey | null {
  if (variant === 'tester' || variant === 'owner') return 'freeAccess';
  if (variant === 'locked') return 'readOnly';
  if (variant === 'payer') {
    if (plan.status === 'trial') return 'trial';
    if (plan.status === 'grace') return 'paymentFailed';
    return 'planActive';
  }
  return null;
}

export function subscriptionModel(plan: PlanView, ctx: SubscriptionCtx): SubscriptionModel {
  const variant = variantFor(plan);
  // A locale key (plans.paywall.periodWord.*), resolved to words by PlanStatusCard, as the paywall disclosure does.
  const period = plan.period === 'month' ? 'plans.paywall.periodWord.month' : 'plans.paywall.periodWord.year';
  const price = ctx.offerPrice ?? '...';
  const rows: SubscriptionRow[] = [];
  const count = plan.seats || plan.planSize;

  if (variant === 'payer' || variant === 'locked') {
    if (plan.planKey) {
      rows.push({ id: 'plan', labelKey: 'plans.subscription.row.plan', valueKey: 'plans.subscription.row.planValue', params: { plan: ctx.planName, count: plan.planSize } });
    }
  }
  if (variant === 'payer') {
    rows.push({ id: 'paidBy', labelKey: 'plans.subscription.row.paidBy', valueKey: 'plans.subscription.row.paidByYou', params: {} });
    if (plan.status === 'trial') {
      rows.push(
        {
          id: 'trialEnds',
          labelKey: 'plans.subscription.row.trialEnds',
          valueKey: 'plans.subscription.row.trialEndsValue',
          params: { date: dateIn(plan.trialEndsAt, ctx.tz, ctx.locale), time: timeIn(plan.trialEndsAt, ctx.tz, ctx.locale) },
        },
        { id: 'firstCharge', labelKey: 'plans.subscription.row.firstCharge', valueKey: 'plans.subscription.row.firstChargeValue', params: { price, period } },
      );
    } else if (plan.status === 'active') {
      const date = dateIn(plan.coveredUntil, ctx.tz, ctx.locale);
      if (plan.willRenew) {
        rows.push({ id: 'renews', labelKey: 'plans.subscription.row.renews', valueKey: 'plans.subscription.row.renewsValue', params: { date, price } });
      } else {
        // The signed line is the whole sentence ("Ends Jan 9. Not renewing"), so it has no label.
        rows.push({ id: 'ends', labelKey: '', valueKey: 'plans.subscription.row.endsNotRenewing', params: { date }, fullLine: true });
      }
    }
    if (plan.seats > 0) {
      rows.push({
        id: 'places',
        labelKey: 'plans.subscription.row.places',
        valueKey: 'plans.subscription.row.placesValue',
        params: { used: plan.members, count: plan.seats },
        seeMembers: true,
      });
    }
  }
  if (variant === 'tester') {
    const d = dateIn(plan.coveredUntil, ctx.tz, ctx.locale);
    if (d) rows.push({ id: 'freeUntil', labelKey: 'plans.subscription.tester.freeUntil', valueKey: null, params: {}, raw: d });
  }

  const testerDate = variant === 'tester' ? dateIn(plan.coveredUntil, ctx.tz, ctx.locale) : '';
  return {
    variant,
    badge: badgeFor(plan, variant),
    showManage: variant === 'payer',
    manageSubParams: { store: STORE_NAME[ctx.platform] },
    showEndsLine: variant === 'payer',
    rows,
    noteKey: variant === 'tester' && testerDate ? 'plans.subscription.tester.note' : null,
    noteParams: { date: testerDate },
    memberBodyParams: { payer: plan.payerName ?? ctx.homeName ?? '', count, date: dateIn(plan.coveredUntil, ctx.tz, ctx.locale) },
    showRestore: variant !== 'tester' && variant !== 'owner',
    showChangePlan: variant === 'payer' || variant === 'locked' || variant === 'tester',
    showEntry: variant === 'none',
    planStatusCard: variant === 'payer' || variant === 'tester' || variant === 'owner' || variant === 'locked',
  };
}
