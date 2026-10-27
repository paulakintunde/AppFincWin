/**
 * Confidence in the typical month (05.1 S2; I5, I7, I8, I25, I35). Pure: no clock, the caller passes the day.
 * Firm is rare on purpose: it needs 3 full months, day 20 or later, half of E already logged, nothing unsaved,
 * real history (not rough figures) and settled rates. A confidence can only be capped downward afterwards.
 */
import type { MinorUnits } from '../../../money/types';
import { CONFIDENCE_FIRM_MIN_DAY, CONFIDENCE_MIN_MONTHS } from '../constants';
import type { Confidence, ConfidenceLevel, ConfidenceReason } from '../types';

export interface ConfidenceInput {
  readonly monthsUsed: number;
  readonly day: number;
  readonly everydayLogged: MinorUnits;
  readonly e: MinorUnits | null;
  readonly unsavedWrites: number;
  readonly roughUsed: boolean;
  readonly provisionalRates: boolean;
}

const LEVEL_RANK: Readonly<Record<ConfidenceLevel, number>> = { rough: 0, fair: 1, firm: 2 };

// Fixed order so two equal confidences always compare equal.
const REASON_ORDER: readonly ConfidenceReason[] = [
  'few_months',
  'rough_figures',
  'early_in_month',
  'under_logged',
  'unsaved_changes',
  'provisional_rates',
  'unspent_stale',
  'unspent_drifted',
  'pay_missed',
  'no_setup',
];

function lower(a: ConfidenceLevel, b: ConfidenceLevel): ConfidenceLevel {
  return LEVEL_RANK[a] <= LEVEL_RANK[b] ? a : b;
}

function ordered(reasons: ReadonlySet<ConfidenceReason>): readonly ConfidenceReason[] {
  return REASON_ORDER.filter((r) => reasons.has(r));
}

export function confidenceOf(input: ConfidenceInput): Confidence {
  const reasons = new Set<ConfidenceReason>();
  let level: ConfidenceLevel = 'firm';
  if (input.monthsUsed < CONFIDENCE_MIN_MONTHS) {
    reasons.add('few_months');
    level = 'rough';
  }
  if (input.roughUsed) {
    reasons.add('rough_figures');
    level = 'rough';
  }
  if (input.day < CONFIDENCE_FIRM_MIN_DAY) {
    reasons.add('early_in_month');
    level = lower(level, 'fair');
  }
  if (input.e !== null && 2 * input.everydayLogged < input.e) {
    reasons.add('under_logged');
    level = lower(level, 'fair');
  }
  if (input.unsavedWrites > 0) {
    reasons.add('unsaved_changes');
    level = lower(level, 'fair');
  }
  if (input.provisionalRates) {
    reasons.add('provisional_rates');
    level = lower(level, 'fair');
  }
  return { level, reasons: ordered(reasons) };
}

/** I35: lower the level to `cap` (never raise it) and record why. */
export function capConfidence(c: Confidence, reason: ConfidenceReason, cap: ConfidenceLevel = 'fair'): Confidence {
  const reasons = new Set<ConfidenceReason>(c.reasons);
  reasons.add(reason);
  return { level: lower(c.level, cap), reasons: ordered(reasons) };
}
