/**
 * 05.3-19: the funding strip under the answer. Pure. Parts come from Result.split (one-off), or from the month model,
 * the purchase's monthly figure and the cash check. Every part is >= 0 and the parts sum to the drawn total.
 */
import type { Evaluation, FundingSource } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';
import type { MinorUnits } from '@/engine/money';

export type StripStyle = 'accent' | 'accentHalf' | 'ink' | 'warn' | 'soft' | 'dashed';
export interface StripPart {
  readonly amount: MinorUnits;
  readonly labelKey: string;
  readonly params?: Readonly<Record<string, string | number>>;
  readonly style: StripStyle;
}
export interface FundingStrip {
  readonly headingKey: string;
  readonly headingParams: Readonly<Record<string, number | string>>;
  readonly parts: readonly StripPart[];
  /** dayOne minus the split, never negative; 0 when the strip is not a one-off split. */
  readonly uncovered: MinorUnits;
}

const A = 'decide.v3.ui.answer.';
const SOURCE: Record<FundingSource, { labelKey: string; style: StripStyle }> = {
  month: { labelKey: `${A}fromMonth`, style: 'accent' },
  unspent_earlier: { labelKey: `${A}fromEarlier`, style: 'accentHalf' },
  envelope: { labelKey: `${A}fromEnvelope`, style: 'ink' },
  emergency: { labelKey: `${A}fromEmergency`, style: 'warn' },
};

const big = (n: number): bigint => BigInt(n);
const mu = (n: bigint): MinorUnits => minorUnits(Number(n));
const clamp = (n: bigint, lo: bigint, hi: bigint): bigint => (n < lo ? lo : n > hi ? hi : n);

type StripInput = Pick<Evaluation, 'result' | 'purchase' | 'month' | 'cash'>;

function noSplit(headingKey: string, headingParams: Record<string, number | string>, parts: StripPart[]): FundingStrip {
  return { headingKey, headingParams, parts, uncovered: mu(0n) };
}

export function fundingStrip(ev: StripInput): FundingStrip | null {
  const { result, purchase, month, cash } = ev;
  if (result.code === 'needs_input' || purchase === null) return null;

  const dayOne = big(purchase.dayOne);
  const monthlyTotal = big(purchase.monthly) + big(purchase.runningMonthly);
  const typical = month.typicalLeft === null ? null : big(month.typicalLeft);

  if (result.code === 'monthly_short') {
    const left = clamp(typical ?? 0n, 0n, monthlyTotal);
    const parts: StripPart[] = [];
    if (left > 0n) parts.push({ amount: mu(left), labelKey: `${A}leftTypical`, style: 'accent' });
    parts.push({ amount: mu(monthlyTotal - left), labelKey: `${A}overspentEach`, style: 'dashed' });
    return noSplit(`${A}eachMonth`, { amount: mu(monthlyTotal) }, parts);
  }

  if (result.variant === 'payday' && cash.kind === 'payday') {
    const short = clamp(big(cash.shortBy), 0n, dayOne);
    const parts: StripPart[] = [];
    if (dayOne - short > 0n) parts.push({ amount: mu(dayOne - short), labelKey: `${A}cashToday`, style: 'accent' });
    parts.push({ amount: mu(short), labelKey: `${A}shortUntil`, params: { date: cash.until }, style: 'dashed' });
    return noSplit(`${A}cashBeforePayday`, { amount: mu(dayOne) }, parts);
  }

  if (result.split.length === 0) {
    // Periodic fit: a payment each month and nothing paid up front.
    if (monthlyTotal <= 0n || typical === null) return null;
    const pay = clamp(monthlyTotal, 0n, typical < 0n ? 0n : typical);
    const rest = (typical < 0n ? 0n : typical) - pay;
    const parts: StripPart[] = [{ amount: mu(pay), labelKey: `${A}thisPayment`, style: 'ink' }];
    if (rest > 0n) parts.push({ amount: mu(rest), labelKey: `${A}leftTypical`, style: 'soft' });
    return noSplit(`${A}typicalMonth`, { amount: mu(typical < 0n ? 0n : typical) }, parts);
  }

  const envelopeFact = result.facts.find((f) => f.code === 'envelope_used');
  const envelopeId = envelopeFact?.values.envelopeId ?? purchase.envelopeId;
  const parts: StripPart[] = [];
  let covered = 0n;
  for (const seg of result.split) {
    const amt = big(seg.amount);
    covered += amt;
    const base = SOURCE[seg.source];
    const params: Record<string, string | number> = {};
    if (seg.source === 'month') params.month = month.month;
    if (seg.source === 'envelope' && typeof envelopeId === 'string') params.envelopeId = envelopeId;
    parts.push({ amount: seg.amount, labelKey: base.labelKey, ...(Object.keys(params).length > 0 ? { params } : {}), style: base.style });
  }
  const uncovered = dayOne - covered > 0n ? dayOne - covered : 0n;
  if (result.code === 'fits_month') {
    const leftFact = result.facts.find((f) => f.code === 'month_left_after');
    const left = typeof leftFact?.values.left === 'number' ? big(leftFact.values.left) : 0n;
    if (left > 0n) parts.push({ amount: mu(left), labelKey: `${A}leftAfter`, style: 'soft' });
  }
  if (uncovered > 0n) parts.push({ amount: mu(uncovered), labelKey: `${A}notCovered`, style: 'dashed' });
  return {
    headingKey: result.code === 'not_yet' ? `${A}whereWould` : `${A}whereFrom`,
    headingParams: { price: mu(dayOne) },
    parts,
    uncovered: mu(uncovered),
  };
}
