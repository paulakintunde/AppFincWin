/**
 * 05.4 FIN-25 / ENG-10 / ENG-18 / UX-04: what an answer rests on, as reasons with their numbers, one plain basis and at most
 * one next step. There is no level and no hidden score (settled dispute 3). Pure: no clock, the caller passes the dates.
 *
 * Reasons are sorted by REASON_WEIGHT, lowest first: how much each could move the answer (fix plan Theme H). Ties cannot
 * happen (each code appears once and has its own weight). A reason can only be added, never removed, once the month model
 * has built the list (I35 kept: thin data or a careful answer can only lower what the answer rests on).
 */
import type { MinorUnits } from '../../../money/types';
import { CONFIDENCE_FIRM_MIN_DAY, CONFIDENCE_MIN_MONTHS } from '../constants';
import type { Basis, Confidence, ConfidenceReason, LocalDate, NextStep, NextStepCode, ReasonAudience, ReasonItem } from '../types';

/** Theme H order: your own word, quick estimates, few months, spare money drifted, missed pay, close to the line, then the rest. */
export const REASON_WEIGHT: Readonly<Record<ConfidenceReason, number>> = Object.freeze({
  user_said_cover: 10,
  quick_estimates: 20,
  few_months: 30,
  unspent_drifted: 40,
  pay_missed: 50,
  close_to_line: 60,
  early_in_month: 70,
  under_logged: 80,
  unspent_stale: 90,
  provisional_rates: 110,
  no_setup: 120,
});

/** ENG-18: every reason has a declared audience. A reason that can change the answer is 'answer' and is always shown. */
export const REASON_AUDIENCE: Readonly<Record<ConfidenceReason, ReasonAudience>> = Object.freeze({
  user_said_cover: 'answer',
  quick_estimates: 'answer',
  few_months: 'answer',
  pay_missed: 'answer',
  close_to_line: 'answer',
  unspent_drifted: 'detail',
  early_in_month: 'detail',
  under_logged: 'detail',
  unspent_stale: 'detail',
  provisional_rates: 'detail',
  no_setup: 'detail',
});

/** The fix the user can make for a reason; absent = nothing the user can do (your own word, the day of the month, the line). */
export const NEXT_STEP_OF: Readonly<Partial<Record<ConfidenceReason, NextStepCode>>> = Object.freeze({
  quick_estimates: 'add_records',
  few_months: 'add_records',
  unspent_drifted: 'confirm_unspent',
  pay_missed: 'record_pay',
  under_logged: 'log_spending',
  unspent_stale: 'confirm_unspent',
  no_setup: 'finish_setup',
});

/** What the basis is built from: quick estimates alone, the months of records used and the records date. */
export interface BasisBase {
  readonly typedOnly: boolean;
  readonly monthsUsed: number;
  readonly upTo: LocalDate;
}

export interface ConfidenceInput {
  readonly monthsUsed: number;
  readonly day: number;
  readonly everydayLogged: MinorUnits;
  readonly e: MinorUnits | null;
  readonly typedEstimatesUsed: boolean;
  readonly provisionalRates: boolean;
  /** The records date when known, otherwise the day of the answer (ENG-14). */
  readonly upTo: LocalDate;
}

export function reasonItem(code: ConfidenceReason, numbers: Readonly<Record<string, number>> = {}): ReasonItem {
  return { code, numbers, weight: REASON_WEIGHT[code], audience: REASON_AUDIENCE[code] };
}

function sorted(items: readonly ReasonItem[]): readonly ReasonItem[] {
  return items.slice().sort((a, b) => a.weight - b.weight);
}

/**
 * UX-04 / CMP-F12: quick estimates alone; fewer than the months Decide looks for; or the months of records with their date.
 * The clean "Based on N months of your records" is used only when no 'answer' reason is present (I46): otherwise the top
 * such reason joins the sentence.
 */
export function buildBasis(base: BasisBase, reasons: readonly ReasonItem[]): Basis {
  if (base.typedOnly) return { kind: 'quick_estimates' };
  if (base.monthsUsed < CONFIDENCE_MIN_MONTHS) return { kind: 'partial', used: base.monthsUsed, lookedFor: CONFIDENCE_MIN_MONTHS, upTo: base.upTo };
  const lead = sorted(reasons).find((r) => r.audience === 'answer');
  if (lead === undefined) return { kind: 'records', months: base.monthsUsed, upTo: base.upTo };
  return { kind: 'records_with_reason', months: base.monthsUsed, upTo: base.upTo, reason: lead.code };
}

/** At most one next step: the top-weighted reason with a fix the user can make. */
export function pickNextStep(reasons: readonly ReasonItem[]): NextStep | null {
  for (const r of sorted(reasons)) {
    const step = NEXT_STEP_OF[r.code];
    if (step !== undefined) return { reason: r.code, step };
  }
  return null;
}

function baseOf(b: Basis): BasisBase {
  if (b.kind === 'quick_estimates') return { typedOnly: true, monthsUsed: 0, upTo: '' };
  return { typedOnly: false, monthsUsed: b.kind === 'partial' ? b.used : b.months, upTo: b.upTo };
}

function assemble(base: BasisBase, items: readonly ReasonItem[]): Confidence {
  const reasons = sorted(items);
  return { reasons, basis: buildBasis(base, reasons), nextStep: pickNextStep(reasons) };
}

/** The month model's reasons (05.1 S2; I5, I7, I8, I25). */
export function confidenceOf(input: ConfidenceInput): Confidence {
  const items: ReasonItem[] = [];
  if (input.monthsUsed < CONFIDENCE_MIN_MONTHS) items.push(reasonItem('few_months', { used: input.monthsUsed, lookedFor: CONFIDENCE_MIN_MONTHS }));
  if (input.typedEstimatesUsed) items.push(reasonItem('quick_estimates'));
  if (input.day < CONFIDENCE_FIRM_MIN_DAY) items.push(reasonItem('early_in_month', { day: input.day, from: CONFIDENCE_FIRM_MIN_DAY }));
  if (input.e !== null && 2 * input.everydayLogged < input.e) items.push(reasonItem('under_logged', { logged: input.everydayLogged, usual: input.e }));
  if (input.provisionalRates) items.push(reasonItem('provisional_rates'));
  return assemble({ typedOnly: input.typedEstimatesUsed, monthsUsed: input.monthsUsed, upTo: input.upTo }, items);
}

/** I35: add a reason (never remove one). A reason already present keeps its first numbers. */
export function withReason(c: Confidence, code: ConfidenceReason, numbers: Readonly<Record<string, number>> = {}): Confidence {
  if (c.reasons.some((r) => r.code === code)) return c;
  return assemble(baseOf(c.basis), [...c.reasons, reasonItem(code, numbers)]);
}

/**
 * D-42 (stricterOf): two readings of the same records. The union of the reasons (the first reading's numbers kept for a
 * code both carry) and the basis built from the smaller one, so a thin month can never make the sentence surer.
 */
export function mergeConfidence(a: Confidence, b: Confidence): Confidence {
  const ba = baseOf(a.basis);
  const bb = baseOf(b.basis);
  const base: BasisBase = {
    typedOnly: ba.typedOnly || bb.typedOnly,
    monthsUsed: Math.min(ba.monthsUsed, bb.monthsUsed),
    upTo: ba.typedOnly ? bb.upTo : ba.upTo,
  };
  const items = [...a.reasons, ...b.reasons.filter((r) => !a.reasons.some((x) => x.code === r.code))];
  return assemble(base, items);
}
