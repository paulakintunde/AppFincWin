// 05.3-34: the pure half of the refine choices (no data hooks), so components and the home card import it cheaply.
import type { RefineCard, RefineCardKind } from '@/engine/decide/v3';
import { addDays } from '@/features/record/entry/seriesStatus';

export type RefineIntent = 'update' | 'keep';
export type RefineDecision = 'updated' | 'kept';

/**
 * Which of a card's two buttons (REFINE_CHOICES order) is the write and which is the keep. Exhaustive over
 * RefineCardKind, so a new kind cannot ship without a row. Only the saving bucket puts "Looks right" (keep) first.
 */
export const INTENTS: Readonly<Record<RefineCardKind, readonly [RefineIntent, RefineIntent]>> = {
  pay: ['update', 'keep'],
  pay_stopped: ['update', 'keep'],
  everyday: ['update', 'keep'],
  everyday_override_expiring: ['update', 'keep'],
  new_regular: ['update', 'keep'],
  saving_bucket: ['keep', 'update'],
  unspent: ['update', 'keep'],
  changing_income: ['update', 'keep'],
  steady_above_income: ['update', 'keep'],
  series_drift: ['update', 'keep'],
  card_not_paid_in_full: ['update', 'keep'],
  under_logged_month: ['update', 'keep'],
};

export const cardKey = (c: Pick<RefineCard, 'kind' | 'ref'>): string => `${c.kind}:${c.ref ?? ''}`;

/** 14 days from today (the Later snooze). */
export const SNOOZE_DAYS = 14;
export const snoozeUntil = (today: string): string => addDays(today, SNOOZE_DAYS);
