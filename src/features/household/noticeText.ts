// 08-17: one sentence per household event, shared by the Household home and the notices list. Every name goes through the
// member resolver (D-32). The server writes the amount in minor units and the currency in `params`.
import { useCallback } from 'react';
import type { HouseholdEventRow } from '@/db/householdEvents';
import { money } from '@/engine/money';
import { useAuth } from '@/features/auth/AuthProvider';
import { useT } from '@/i18n';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { useDeviceLocale } from '@/services/locale/deviceLocale';
import { useMemberLabel } from './useMemberLabel';

const RULES = ['even', 'weight', 'amount', 'mine'] as const;

export function useNoticeFormat(householdId: string | null | undefined, householdName: string) {
  const t = useT();
  const { user } = useAuth();
  const label = useMemberLabel(householdId);
  const { formatMoney } = useMoneyFormatter(true);
  const { locale } = useDeviceLocale();
  const viewerId = user?.id ?? null;

  const amountOf = useCallback(
    (e: HouseholdEventRow): string => {
      const raw = e.params.amount;
      const currency = e.params.currency;
      if (typeof raw !== 'number' || typeof currency !== 'string') return '';
      try {
        return formatMoney(money(raw, currency));
      } catch {
        return '';
      }
    },
    [formatMoney],
  );

  const ruleOf = useCallback(
    (raw: unknown): string => {
      const key = RULES.find((r) => r === raw);
      return key ? t(`household.rules.names.${key}`) : '';
    },
    [t],
  );

  /** A plan date carried in the event params, in the device locale. */
  const dayOf = useCallback(
    (raw: unknown): string => {
      if (typeof raw !== 'string') return '';
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return '';
      return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(d);
    },
    [locale],
  );

  /** The finished sentence for one event. */
  const text = useCallback(
    (e: HouseholdEventRow): string => {
      const actor = label(e.actor_id);
      const subject = label(e.subject_id);
      const household = householdName;
      const amount = amountOf(e);
      switch (e.kind) {
        case 'joined':
          return t('household.notices.joined', { name: label(e.subject_id ?? e.actor_id), household });
        case 'removed':
          return t('household.notices.removed', { household });
        case 'left':
          return t('household.notices.left', { name: subject, household });
        case 'owner_changed':
          return t('household.notices.owner_change', { household });
        case 'made_private':
          return t('household.notices.made_private', { name: actor });
        case 'split_changed':
          return t('household.notices.split_changed_plain', { name: actor });
        case 'default_changed':
          return t('household.notices.default_changed', { name: actor, rule: ruleOf(e.params.after) });
        case 'category_default_changed':
          return t('household.notices.category_default_changed', { name: actor, rule: ruleOf(e.params.after) });
        case 'weights_changed':
          return t('household.notices.weights_changed', { name: actor });
        case 'renamed':
          return t('household.notices.renamed', { name: actor, newName: typeof e.params.name === 'string' ? e.params.name : household });
        case 'currency_changed':
          return t('household.notices.currency_changed', { name: actor, code: typeof e.params.code === 'string' ? e.params.code : '' });
        case 'departure_undone':
          return t('household.notices.departure_undone', { name: subject, household });
        case 'settle_request':
          return t('household.notices.settle_request', { name: actor, amount });
        case 'settle_reminder':
          return t('household.notices.settle_waiting', { name: subject, amount });
        case 'settle_lapsed':
          return t('household.notices.settle_lapsed', { name: subject, amount });
        case 'settle_departed': {
          // Owner answer 10: a waiting settle-up ends when someone leaves, is removed or deletes. params.reason says which.
          const why = e.params.reason;
          if (why === 'left') return t('household.notices.settle_departed_left', { name: subject, amount });
          if (why === 'removed') return t('household.notices.settle_departed_removed', { name: subject, amount });
          if (why === 'deleted') return t('household.notices.settle_departed_deleted', { name: subject, amount });
          return t('household.notices.settle_departed', { name: subject, amount });
        }
        case 'settle_not_yet':
          return t('household.notices.settle_not_yet', { name: actor });
        case 'settle_ask':
          return t('household.notices.settle_ask', { name: actor, amount });
        case 'settled':
          return e.actor_id !== null && e.actor_id === viewerId
            ? t('household.notices.settled_plain', { amount })
            : t('household.notices.settled', { name: actor, amount });
        case 'settle_cancelled':
          return t('household.notices.settle_cancelled', { name: actor, amount });
        case 'settle_undone':
          return t('household.notices.settle_undone', { name: actor, amount });
        case 'written_off':
          return t('household.notices.written_off', { name: actor, amount });
        // 09-19 (UI-SPEC 7, D-19, D-21, D-21a, Owner P4): plan events in the notices list. Prices are not known here, so the
        // downgrade offer shows its title; the full offer with the price is the notice on Home and Subscription.
        case 'plan_approval_needed':
          return t('plans.invite.approval.push', { name: t('household.join.waitingPerson'), home: household });
        case 'plan_payer_left':
          return t('plans.notices.payerLeft.body', { name: subject, date: dayOf(e.params.grace_until) });
        case 'plan_takeover':
          return t('plans.notices.takeoverDone.toast', { name: label(typeof e.params.payer === 'string' ? e.params.payer : null) });
        case 'plan_grace':
          return t('plans.notices.paymentFailed.body', { name: subject, date: dayOf(e.params.grace_until) });
        case 'plan_locked':
          return t('lock.bannerHousehold', { home: household });
        case 'plan_downgrade_offer':
          return t('plans.notices.downgradeOffer.title');
        case 'plan_recovered_after_takeover':
          return t('plans.doubleCover.notChosen.body', { name: label(typeof e.params.payer === 'string' ? e.params.payer : null), home: household });
        case 'plan_double_cover':
          // mode 'choose' goes to both payers: plans.doubleCover.body opens with the plans.doubleCover.title sentence, so the
          // list line is the body alone. mode 'extra' goes to a member who bought while already covered.
          return e.params.mode === 'extra'
            ? t('plans.notices.oldPlanRecovers.body', { name: label(typeof e.params.payer === 'string' ? e.params.payer : null), home: household })
            : t('plans.doubleCover.body');
        default:
          return t('household.notices.fallback', { name: actor, household });
      }
    },
    [t, label, householdName, amountOf, ruleOf, viewerId, dayOf],
  );

  /** A time for the second line: date and time in the device locale. */
  const when = useCallback(
    (iso: string): string => {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
    },
    [locale],
  );

  /** A date only (invite expiry). */
  const day = useCallback(
    (iso: string): string => {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(d);
    },
    [locale],
  );

  return { text, when, day };
}
