/**
 * 05-128 (D-102, D-104; UI-SPEC R18.3, R18.5): the verdict card's total-cost row (4b) and invested-instead row (4c),
 * worded in one place. Pure: no React, no t(). Money is whole currency units (rule 12); the screen-reader line reads the
 * same sentence through the a11y formatter (formatMoneyA11y). The rate is never invented: the headline exists only for a
 * rate the user typed, and this module only prints what the engine hands over.
 */
import type { InvestmentHeadline, Percent, TotalCost } from '@/engine/decide';
import { ref } from './types';
import type { CopyRef, Fmt } from './types';
import type { TextOf } from './keyFiguresCopy';

const SCALE = 10n ** 10n;
const TENTH = SCALE / 10n; // 10^9: one tenth of a percentage point

/** A Percent as typed, one decimal at most (half-up), a trailing ".0" dropped. Bigint arithmetic only. */
export function rateOneDecimal(p: Percent): string {
  const tenths = (p + TENTH / 2n) / TENTH;
  const whole = tenths / 10n;
  const frac = tenths % 10n;
  return frac === 0n ? whole.toString() : `${whole}.${frac}`;
}

export interface OwnershipRow {
  /** The visible sentence. */
  text: CopyRef;
  /** The sentence a screen reader speaks (amounts by currency name). */
  spoken: CopyRef;
}

/** Whole years when the horizon divides by 12, else months. */
function span(months: number): { years: boolean; count: number } {
  return months % 12 === 0 ? { years: true, count: months / 12 } : { years: false, count: months };
}

/** Row 4b. Null when there is no total or it is trivial (the total equals the price share). */
export function tcoRow(tc: TotalCost | null, fmt: Fmt, fmtA11y: Fmt): OwnershipRow | null {
  if (tc === null || tc.trivial) return null;
  const { years, count } = span(tc.horizonMonths);
  const unit = years ? 'year' : 'month';
  return {
    text: ref(`decide.verdict.tco.${unit}`, { count, total: fmt(tc.total) }),
    spoken: ref(`decide.verdict.tco.a11y_${unit}`, { count, total: fmtA11y(tc.total) }),
  };
}

/** The holding fee as the fold holds it: shown only when it is non-zero. */
export type HeadlineFee = Percent | null;

/**
 * Row 4c. Null with no headline (no typed non-zero rate, nothing contributed). Out of range reads "too large to project".
 * `spoken` carries the closing "A projection, not a forecast." through the catalogue's a11y key.
 */
export function investedRow(
  headline: InvestmentHeadline | null,
  horizonMonths: number,
  fee: HeadlineFee,
  fmt: Fmt,
  fmtA11y: Fmt,
  text: TextOf
): OwnershipRow | null {
  if (headline === null) return null;
  const rate = rateOneDecimal(headline.rate);
  const sentence = (money: Fmt): CopyRef => {
    if (headline.projected === null) return ref('decide.verdict.invested.tooLarge', { rate });
    const { years, count } = span(horizonMonths);
    const hasFee = fee !== null && fee > 0n;
    const key = `decide.verdict.invested.${hasFee ? (years ? 'feeYear' : 'feeMonth') : years ? 'year' : 'month'}`;
    return ref(key, { fv: money(headline.projected), count, rate, ...(hasFee ? { fee: rateOneDecimal(fee) } : {}) });
  };
  return { text: sentence(fmt), spoken: ref('decide.verdict.invested.a11y', { text: text(sentence(fmtA11y)) }) };
}
