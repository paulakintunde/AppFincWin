/**
 * 06.1-82: what the answer screen shows of an engine evaluation. Screen-side only: the engine's answer is never changed, only what
 * this screen has already been told is left out. Pure: no React, no I/O.
 *
 * - G-61-8: the engine asks about unrecorded loans, cards and overdrafts (ask_debts_not_recorded) whatever the person said. Once
 *   "None" is answered (decide_settings.answered_no_debts_at), the ask is not shown again, so "None" always resolves it.
 * - G-61-3: a decided check's own Grow goal (savings_goals.check_id, made by Save for it) has no account yet, and every envelope
 *   with no account is a readiness item (D-54), so the check's own answer turned Not ready. That check's answer leaves its own
 *   goals out of the readiness items, recounting `missing` and `ready` the way readinessOf does.
 * - G-61-11: Purchase.monthly carries the running costs' monthly share (runningMonthly); the plan payment alone is the difference.
 */
import type { Evaluation, Purchase, Readiness } from '@/engine/decide/v3';

export interface ShownAnswerOptions {
  /** "None" was answered on the debts ask. */
  readonly noDebtsAnswered: boolean;
  /** Grow goals linked to this decided check; [] for an open check. */
  readonly ownGoalIds: readonly string[];
}

function withoutOwnGoals(readiness: Readiness, own: ReadonlySet<string>): Readiness {
  const items = readiness.items;
  if (items === undefined) return readiness;
  const kept = items.filter((i) => !(i.kind === 'envelopes' && i.envelopeId !== null && own.has(i.envelopeId)));
  if (kept.length === items.length) return readiness;
  return { ...readiness, ready: kept.length === 0, missing: [...new Set(kept.map((i) => i.code))].sort(), items: kept };
}

/** The evaluation the answer screen shows; the same object when nothing is left out. */
export function shownEvaluation(evaluation: Evaluation | null, opts: ShownAnswerOptions): Evaluation | null {
  if (evaluation === null) return null;
  const r = evaluation.result;
  const facts = opts.noDebtsAnswered ? r.facts.filter((f) => f.code !== 'ask_debts_not_recorded') : r.facts;
  const readiness = r.readiness === undefined || opts.ownGoalIds.length === 0 ? r.readiness : withoutOwnGoals(r.readiness, new Set(opts.ownGoalIds));
  if (facts.length === r.facts.length && readiness === r.readiness) return evaluation;
  return { ...evaluation, result: { ...r, facts, ...(readiness === undefined ? {} : { readiness }) } };
}

/** The plan payment a month without the running costs (minor units, my share); null with no purchase. */
export function planPaymentOf(purchase: Pick<Purchase, 'monthly' | 'runningMonthly'> | null | undefined): number | null {
  if (purchase == null) return null;
  return Math.max(0, purchase.monthly - purchase.runningMonthly);
}
