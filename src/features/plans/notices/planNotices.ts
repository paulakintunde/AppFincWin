/**
 * 09-19 (UI-SPEC section 7, D-18, D-19, D-21, D-21a, D-29, D-41, D-42, Owner P4 2026-11-19): which plan notices apply now,
 * in the order Home shows them. Pure: no React, no store, no I/O. Every word is a copy key; names, plan names, period words
 * and prices come in already resolved through the input functions, so this file never decides wording.
 * Home shows only the first notice; You > Subscription shows them all. Audience filtering of events is the server's (RLS).
 */
import type { Href } from 'expo-router';
import type { HouseholdEventRow } from '@/db/householdEvents';
import type { StatusKey } from '@/ui/status/statusMap';
import { APPROVE_PLAN_HREF, ONBOARDING_HREF, plansHref } from '../routes';
import { dateIn, timeIn } from '../subscriptionModel';
import type { PlanKey, PlanPeriod, PlanView } from '../types';

/** Owner P4: what plan_double_cover_state() returns, mapped to camel case (doubleCover.ts re-exports this type). */
export type DoubleCoverState = {
  householdId: string;
  since: string;
  chooseBy: string;
  chosenPayer: string | null;
  chosenBy: 'payer' | 'default' | 'fallback' | null;
  newSide: { payerId: string; planKey: PlanKey; fits: boolean };
  oldSide: { payerId: string; planKey: PlanKey; fits: boolean };
};

export type NoticeId =
  | 'lockExplainerPrompt'
  | 'paymentFailed'
  | 'payerLeft'
  | 'memberLeft'
  | 'payerAfterLeaving'
  | 'doubleCover'
  | 'oldPlanRecovered'
  | 'trialEndsToday'
  | 'trialEndsSoon'
  | 'approvalWaiting'
  | 'offlineSaves'
  | 'downgradeOffer'
  | 'testerEnding'
  | 'existingUser';

/**
 * Home priority (UI-SPEC 7 plus Owner P4). The lock explainer prompt is LockHost's own screen (09-16); it is listed so the
 * order stays the spec's, and this model never produces it. memberLeft and payerAfterLeaving are not in the spec's list:
 * both are about a person's own access or billing after leaving, so they sit with the payer-left group.
 */
export const NOTICE_ORDER: readonly NoticeId[] = [
  'lockExplainerPrompt',
  'paymentFailed',
  'payerLeft',
  'memberLeft',
  'payerAfterLeaving',
  'doubleCover',
  'oldPlanRecovered',
  'trialEndsToday',
  'trialEndsSoon',
  'approvalWaiting',
  'offlineSaves',
  'downgradeOffer',
  'testerEnding',
  'existingUser',
];

export type NoticeActionStyle = 'primary' | 'link';

export type NoticeActionModel =
  | { kind: 'manage'; labelKey: string; style: NoticeActionStyle }
  | { kind: 'navigate'; labelKey: string; style: NoticeActionStyle; href: Href }
  | { kind: 'dismiss'; labelKey: string; style: NoticeActionStyle }
  | { kind: 'moveSolo'; labelKey: string; style: NoticeActionStyle }
  | { kind: 'existingDismiss'; labelKey: string; style: NoticeActionStyle }
  | { kind: 'choose'; labelKey: string; style: 'primary'; params: Record<string, string>; keepPayer: string };

export interface Notice {
  id: NoticeId;
  titleKey: string;
  bodyKey: string;
  /** A line under the body (the double-cover default rule). */
  footKey?: string;
  params: Record<string, string | number>;
  badge?: StatusKey;
  dismissible: boolean;
  /** The dismissed-map key; 'day' hides it until the next local day, 'ever' for good. */
  dismissKey?: string;
  dismissFor?: 'day' | 'ever';
  actions: NoticeActionModel[];
}

export interface PlanNoticeInput {
  plan: PlanView;
  events: readonly HouseholdEventRow[];
  offlineCount: number;
  existingCard: string | null;
  /** dismissKey -> the local day (YYYY-MM-DD) it was dismissed, or 'ever'. */
  dismissed: Record<string, string>;
  now: number;
  tz: string;
  locale?: string;
  /** The store's price string for the held product. */
  price: string | null;
  period: PlanPeriod | null;
  userId: string | null;
  doubleCover: DoubleCoverState | null;
  homeName?: string;
  nameOf?: (userId: string | null) => string;
  planNameOf?: (key: PlanKey) => string;
  periodWord?: (period: PlanPeriod) => string;
  /** The store price string of a plan in the current period, for the downgrade offer. */
  priceFor?: (key: PlanKey) => string | null;
  /** Stands in for the invitee's name, which the server does not show the payer (09-20: "Someone you invited"). */
  inviteeName?: string;
}

const DAY_MS = 86_400_000;
const SIZE_KEY: Record<number, PlanKey> = { 1: 'solo', 2: 'duo', 6: 'household', 12: 'extended' };
const DISMISS_LABEL = 'plans.notices.payerLeft.actions.notNow';

/** The local calendar day (YYYY-MM-DD) of an instant in a timezone. */
export function dayKey(ms: number, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

function time(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Newest event of a kind (events arrive newest first, but do not rely on it). */
function newest(events: readonly HouseholdEventRow[], kind: string, match?: (e: HouseholdEventRow) => boolean): HouseholdEventRow | null {
  let best: HouseholdEventRow | null = null;
  for (const e of events) {
    if (e.kind !== kind || (match && !match(e))) continue;
    if (!best || e.created_at > best.created_at) best = e;
  }
  return best;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

const manage = (labelKey: string, style: NoticeActionStyle = 'primary'): NoticeActionModel => ({ kind: 'manage', labelKey, style });
const go = (labelKey: string, href: Href, style: NoticeActionStyle = 'primary'): NoticeActionModel => ({ kind: 'navigate', labelKey, href, style });
const notNow = (labelKey: string): NoticeActionModel => ({ kind: 'dismiss', labelKey, style: 'link' });

/** Every notice that applies now, in Home order, with dismissed ones removed. */
export function planNotices(input: PlanNoticeInput): Notice[] {
  const { plan, events, now, tz } = input;
  const locale = input.locale ?? 'en';
  const nameOf = input.nameOf ?? (() => '');
  const planNameOf = input.planNameOf ?? ((k: PlanKey) => k);
  const periodWord = input.periodWord ?? ((p: PlanPeriod) => p);
  const home = input.homeName ?? '';
  const price = input.price ?? '...';
  const period = input.period ? periodWord(input.period) : '';
  const out: Notice[] = [];
  const date = (iso: string | null) => dateIn(iso, tz, locale);
  const graceDate = date(plan.graceUntil ?? plan.coveredUntil);

  // Payment failed or payer left (D-19): every member hears; the payer fixes, the others may take over.
  const payerLeftEvent = newest(events, 'plan_payer_left');
  if (plan.status === 'grace' && !plan.leftGrace) {
    if (plan.payerId === null && payerLeftEvent) {
      out.push({
        id: 'payerLeft',
        titleKey: 'plans.notices.payerLeft.title',
        bodyKey: 'plans.notices.payerLeft.body',
        params: { name: nameOf(payerLeftEvent.subject_id), date: date(str(payerLeftEvent.params.grace_until) ?? plan.graceUntil) },
        dismissible: true,
        dismissKey: 'payerLeft',
        dismissFor: 'day',
        actions: [go('plans.notices.payerLeft.actions.takeOver', plansHref({ mode: 'change', trigger: 'notice' })), notNow('plans.notices.payerLeft.actions.notNow')],
      });
    } else if (plan.payerId !== null && (plan.billingIssueAt !== null || newest(events, 'plan_grace') !== null)) {
      out.push(
        plan.payerIsMe
          ? {
              id: 'paymentFailed',
              titleKey: 'plans.notices.paymentFailed.title',
              // Needs owner review: the signed body names the payer in the third person.
              bodyKey: 'plans.notices.paymentFailed.bodyPayer',
              params: { date: graceDate },
              badge: 'paymentFailed',
              dismissible: false,
              actions: [manage('plans.notices.paymentFailed.actions.fix')],
            }
          : {
              id: 'paymentFailed',
              titleKey: 'plans.notices.paymentFailed.title',
              bodyKey: 'plans.notices.paymentFailed.body',
              params: { name: plan.payerName ?? nameOf(plan.payerId), date: graceDate },
              badge: 'paymentFailed',
              dismissible: true,
              dismissKey: 'paymentFailed',
              dismissFor: 'day',
              actions: [
                go('plans.notices.paymentFailed.actions.takeOver', plansHref({ mode: 'change', trigger: 'notice' })),
                notNow('plans.notices.paymentFailed.actions.notNow'),
              ],
            },
      );
    }
  }

  // Member who left: 7 days of full access (D-41).
  if (plan.status === 'grace' && plan.leftGrace) {
    out.push({
      id: 'memberLeft',
      titleKey: 'plans.notices.memberLeft.title',
      bodyKey: 'plans.notices.memberLeft.body',
      params: { date: date(plan.coveredUntil ?? plan.graceUntil) },
      dismissible: true,
      dismissKey: 'memberLeft',
      dismissFor: 'day',
      actions: [
        go('plans.notices.memberLeft.actions.solo', plansHref({ mode: 'change', trigger: 'notice', plan: 'solo' })),
        notNow('plans.notices.memberLeft.actions.notNow'),
      ],
    });
  }

  // Payer after leaving (D-19, D-42): a household plan still bills for a household of one. Quick 261124-2bs: when the payer
  // really left a home (leftAt), the notice names that home; the condition itself is unchanged, so a payer whose partner
  // left still gets the Manage / Move to Solo offer.
  if (plan.payerIsMe && plan.members === 1 && plan.planSize > 1 && (plan.status === 'active' || plan.status === 'trial')) {
    out.push({
      id: 'payerAfterLeaving',
      titleKey: 'plans.notices.payerAfterLeaving.title',
      bodyKey: 'plans.notices.payerAfterLeaving.body',
      params: { home: plan.leftHomeName ?? home },
      dismissible: true,
      dismissKey: 'payerAfterLeaving',
      dismissFor: 'day',
      actions: [manage('plans.notices.payerAfterLeaving.actions.manage'), { kind: 'moveSolo', labelKey: 'plans.notices.payerAfterLeaving.actions.moveSolo', style: 'link' }],
    });
  }

  // Owner P4: two plans cover the home; only the two payers see the pick, until a plan is picked or the default applies.
  const dc = input.doubleCover;
  if (dc && dc.chosenPayer === null && input.userId !== null && (input.userId === dc.newSide.payerId || input.userId === dc.oldSide.payerId)) {
    const actions: NoticeActionModel[] = [];
    if (dc.newSide.fits) {
      actions.push({
        kind: 'choose',
        style: 'primary',
        labelKey: 'plans.doubleCover.choiceNew',
        params: { plan: planNameOf(dc.newSide.planKey), name: nameOf(dc.newSide.payerId) },
        keepPayer: dc.newSide.payerId,
      });
    }
    if (dc.oldSide.fits) {
      actions.push({
        kind: 'choose',
        style: 'primary',
        labelKey: 'plans.doubleCover.choiceOld',
        params: { plan: planNameOf(dc.oldSide.planKey), name: nameOf(dc.oldSide.payerId) },
        keepPayer: dc.oldSide.payerId,
      });
    }
    out.push({
      id: 'doubleCover',
      titleKey: 'plans.doubleCover.title',
      bodyKey: 'plans.doubleCover.body',
      footKey: 'plans.doubleCover.defaultLine',
      params: {},
      dismissible: false,
      actions,
    });
  }

  // The plan that was not picked (P4), or an extra plan bought while already covered: its payer cancels it in the store.
  const recovered = newest(events, 'plan_recovered_after_takeover');
  const extra = newest(events, 'plan_double_cover', (e) => e.params.mode === 'extra');
  const old = [recovered, extra].filter((e): e is HouseholdEventRow => e !== null).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
  if (old) {
    const notChosen = old.kind === 'plan_recovered_after_takeover';
    out.push({
      id: 'oldPlanRecovered',
      titleKey: notChosen ? 'plans.doubleCover.notChosen.title' : 'plans.notices.oldPlanRecovers.title',
      bodyKey: notChosen ? 'plans.doubleCover.notChosen.body' : 'plans.notices.oldPlanRecovers.body',
      params: { name: nameOf(str(old.params.payer)), home },
      dismissible: true,
      dismissKey: 'oldPlanRecovered:' + old.id,
      dismissFor: 'ever',
      actions: [manage('plans.notices.oldPlanRecovers.actions.manage')],
    });
  }

  // Trial (D-18): the last 3 days, and the last day which cannot be dismissed. Only while it will renew into a charge.
  const trialEnd = time(plan.trialEndsAt);
  if (plan.status === 'trial' && plan.willRenew && trialEnd !== null && trialEnd > now && trialEnd - now <= 3 * DAY_MS) {
    const today = dayKey(trialEnd, tz) === dayKey(now, tz);
    const timeText = timeIn(plan.trialEndsAt, tz, locale);
    out.push(
      today
        ? {
            id: 'trialEndsToday',
            titleKey: 'plans.notices.trialToday.title',
            bodyKey: 'plans.notices.trialToday.body',
            params: { time: timeText, price, period },
            badge: 'trialEnding',
            dismissible: false,
            actions: [manage('plans.notices.trialToday.actions.manage')],
          }
        : {
            id: 'trialEndsSoon',
            titleKey: 'plans.notices.trialReminder.title',
            bodyKey: 'plans.notices.trialReminder.body',
            params: { date: date(plan.trialEndsAt), time: timeText, price, period },
            badge: 'trialEnding',
            dismissible: true,
            dismissKey: 'trialEndsSoon',
            dismissFor: 'day',
            actions: [
              manage('plans.notices.trialReminder.actions.manage'),
              go('plans.notices.trialReminder.actions.change', plansHref({ mode: 'change', trigger: 'notice' }), 'link'),
            ],
          },
    );
  }

  // An invitee waits for a bigger plan (D-21): the payer gets a direct link to the approval screen.
  if (plan.payerIsMe) {
    const req = newest(events, 'plan_approval_needed');
    if (req && req.ref_id) {
      out.push({
        id: 'approvalWaiting',
        titleKey: 'plans.invite.approval.title',
        bodyKey: 'plans.invite.approval.push',
        // The server does not show the invitee's name to the payer (09-20); "Someone you invited" stands in.
        params: { name: input.inviteeName ?? '', home },
        badge: 'waitingApproval',
        dismissible: true,
        dismissKey: 'approvalWaiting:' + req.id,
        dismissFor: 'day',
        actions: [
          go('plans.notices.approvalWaiting.actions.review', { pathname: APPROVE_PLAN_HREF as unknown as string, params: { request: req.ref_id } } as unknown as Href),
          notNow('plans.invite.approval.later'),
        ],
      });
    }
  }

  // Saved on this phone (D-40): drawn by OfflineSavesNotice itself.
  if (input.offlineCount > 0 && plan.status !== 'sample') {
    out.push({ id: 'offlineSaves', titleKey: 'lock.savedOffline.title', bodyKey: 'lock.savedOffline.body', params: { count: input.offlineCount }, dismissible: false, actions: [] });
  }

  // Downgrade offer (D-21a): only while the plan is still bigger than the smaller one that fits. Nothing changes by itself.
  if (plan.payerIsMe && (plan.status === 'active' || plan.status === 'grace')) {
    const offer = newest(events, 'plan_downgrade_offer');
    const size = typeof offer?.params.plan_size === 'number' ? offer.params.plan_size : null;
    const smallKey = size !== null ? SIZE_KEY[size] : undefined;
    if (offer && size !== null && smallKey && size < plan.planSize) {
      out.push({
        id: 'downgradeOffer',
        titleKey: 'plans.notices.downgradeOffer.title',
        bodyKey: 'plans.notices.downgradeOffer.body',
        params: { count: plan.members, plan: planNameOf(smallKey), price: input.priceFor?.(smallKey) ?? '...', period, date: date(plan.coveredUntil) },
        dismissible: true,
        dismissKey: 'downgradeOffer:' + offer.id,
        dismissFor: 'ever',
        actions: [
          go('plans.notices.downgradeOffer.actions.switch', plansHref({ mode: 'change', trigger: 'notice', plan: smallKey })),
          notNow('plans.notices.downgradeOffer.actions.notNow'),
        ],
      });
    }
  }

  // Testers: their end date within 30 days (D-29).
  const covered = time(plan.coveredUntil);
  if (plan.status === 'tester' && plan.promoKind === 'tester' && covered !== null && covered > now && covered - now <= 30 * DAY_MS) {
    out.push({
      id: 'testerEnding',
      titleKey: 'appLife.status.freeAccess',
      bodyKey: 'plans.subscription.tester.endsNotice',
      params: { date: date(plan.coveredUntil) },
      dismissible: true,
      dismissKey: 'testerEnding',
      dismissFor: 'ever',
      actions: [go('plans.subscription.tester.seePlans', plansHref({ mode: 'change', trigger: 'notice' }))],
    });
  }

  // Existing users, one time (D-29). "Not now" removes it for good (server flag).
  if (input.existingCard === 'pending') {
    out.push({
      id: 'existingUser',
      titleKey: 'plans.notices.existingUser.title',
      bodyKey: 'plans.notices.existingUser.body',
      params: {},
      dismissible: false,
      actions: [
        go('plans.notices.existingUser.actions.run', { pathname: ONBOARDING_HREF as unknown as string, params: { mode: 'rerun' } } as unknown as Href),
        { kind: 'existingDismiss', labelKey: 'plans.notices.existingUser.actions.notNow', style: 'link' },
      ],
    });
  }

  const todayKey = dayKey(now, tz);
  const shown = out.filter((n) => {
    if (!n.dismissible || !n.dismissKey) return true;
    const at = input.dismissed[n.dismissKey];
    if (at === undefined) return true;
    if (at === 'ever') return false;
    return n.dismissFor === 'day' ? at !== todayKey : false;
  });
  const rank = (id: NoticeId) => NOTICE_ORDER.indexOf(id);
  return shown.sort((a, b) => rank(a.id) - rank(b.id));
}

/** What a dismissal writes into the dismissed map. */
export function dismissValue(n: Notice, now: number, tz: string): string {
  return n.dismissFor === 'ever' ? 'ever' : dayKey(now, tz);
}

/** A dismissible notice with no "Not now" of its own gets one from the slot (the trial reminder, old-plan notice). */
export function needsDismissLink(n: Notice): boolean {
  return n.dismissible && !n.actions.some((a) => a.kind === 'dismiss');
}
export const DISMISS_LINK_KEY = DISMISS_LABEL;

const PAYMENT_IDS: readonly NoticeId[] = ['paymentFailed', 'payerLeft', 'trialEndsToday', 'trialEndsSoon'];

/** True when a trial or payment notice shows today: in-context offers stay away that day (09-22). */
export function hasPaymentNoticeToday(notices: readonly Notice[]): boolean {
  return notices.some((n) => PAYMENT_IDS.includes(n.id));
}

/**
 * The one-time "{name} now pays for this home" toast (D-19): the newest takeover after the last one seen, never to the new
 * payer themselves. Returns the event id to remember as seen.
 */
export function takeoverToast(
  events: readonly HouseholdEventRow[],
  seenAt: string | null,
  userId: string | null,
  nameOf: (userId: string | null) => string,
): { key: string; params: { name: string }; seenAt: string } | null {
  const e = newest(events, 'plan_takeover');
  if (!e || (seenAt !== null && e.created_at <= seenAt)) return null;
  const payer = str(e.params.payer);
  if (payer !== null && payer === userId) return null;
  return { key: 'plans.notices.takeoverDone.toast', params: { name: nameOf(payer) }, seenAt: e.created_at };
}
