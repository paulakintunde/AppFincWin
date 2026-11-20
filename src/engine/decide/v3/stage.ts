/**
 * 08.1-19 (DCU-10, owner 2026-11-18 "Decide stages by data"): the stage of an answer, read from the one months-of-records count.
 * Read-model only: it never changes a Result, so no answer moves and no revision bumps. Pure; imports only ./constants and ./types.
 * First read = quick estimates or 0 full months; Full answer = 1 or 2; Deeper parts = 3 or more.
 * Only the parts that read a 3-month constant are held back below 3 months (see 08.1-STAGE-CHECK.md).
 */
import { CONFIDENCE_MIN_MONTHS, HISTORY_PAY_MIN_MONTHS, INCOME_SWING_MIN_MONTHS, STAGE_DEEPER_MIN_MONTHS, STAGE_FULL_MIN_MONTHS, V3_HISTORY_MONTHS, V3_VARIABLE_HISTORY_MONTHS } from './constants';
import type { Basis, Caveat, MonthModel } from './types';

export type DecideStage = 'first_read' | 'full' | 'deeper';
export type HeldBackPart = 'answer_range' | 'pay_swings' | 'history_pay';
export interface StageWindow {
  /** Months of records the answer rests on (the same count the screens show). */
  readonly recordMonths: number;
  /** Months of pay history used for variable or seasonal pay (up to 12); null for steady or unknown pay. */
  readonly payMonths: number | null;
  /** True when the pay window is longer than the everyday window. */
  readonly payWindowLonger: boolean;
}
export interface StageReading {
  readonly stage: DecideStage;
  readonly monthsUsed: number;
  readonly windowUsed: StageWindow;
  readonly heldBackParts: readonly HeldBackPart[];
  readonly nextUnlock: { readonly stage: 'full' | 'deeper'; readonly monthsNeeded: number } | null;
}
export interface StageSource {
  readonly basis: Basis;
  readonly month: Pick<MonthModel, 'monthsUsed' | 'incomePicture'> | null;
}

function monthsOf(basis: Basis): number {
  if (basis.kind === 'quick_estimates') return 0;
  if (basis.kind === 'partial') return basis.used;
  return basis.months;
}

export function stageOf(src: StageSource): StageReading {
  const monthsUsed = monthsOf(src.basis);
  const picture = src.month?.incomePicture;
  const payCount = picture?.fullMonths ?? monthsUsed;
  const stage: DecideStage =
    src.basis.kind === 'quick_estimates' || monthsUsed < STAGE_FULL_MIN_MONTHS ? 'first_read' : monthsUsed >= STAGE_DEEPER_MIN_MONTHS ? 'deeper' : 'full';
  const heldBackParts: HeldBackPart[] = [];
  if (monthsUsed < CONFIDENCE_MIN_MONTHS) heldBackParts.push('answer_range');
  if (payCount < INCOME_SWING_MIN_MONTHS) heldBackParts.push('pay_swings');
  if (payCount < HISTORY_PAY_MIN_MONTHS) heldBackParts.push('history_pay');
  const payMonths = picture === undefined || picture.treated === 'steady' ? null : Math.min(picture.fullMonths, V3_VARIABLE_HISTORY_MONTHS);
  const nextUnlock =
    stage === 'first_read'
      ? { stage: 'full' as const, monthsNeeded: STAGE_FULL_MIN_MONTHS }
      : stage === 'full'
        ? { stage: 'deeper' as const, monthsNeeded: STAGE_DEEPER_MIN_MONTHS }
        : null;
  return {
    stage,
    monthsUsed,
    windowUsed: { recordMonths: monthsUsed, payMonths, payWindowLonger: payMonths !== null && payMonths > V3_HISTORY_MONTHS },
    heldBackParts,
    nextUnlock,
  };
}

/** The first caveat the screen shows under the StageLine. Below 'deeper' the StageLine already says quick estimates / few months. Never re-sorts. */
export function firstShownCaveat(caveats: readonly Caveat[], stage: DecideStage): Caveat | undefined {
  if (stage === 'deeper') return caveats[0];
  return caveats.find((c) => c.code !== 'quick_estimates' && c.code !== 'few_months');
}
