/**
 * 05.3-17: pure edits for the draft CheckV2 the Check screen builds. Each answer has exactly one storage place.
 * M-08 (05.1-37): sales tax goes to CheckV2.taxPercent and the down payment to pay.deposit; withExtra refuses both, so
 * neither can reach extras and be counted twice.
 * D-18: L2/L6/L7 answers are stored only (value fields and layerAnswers), never written to extras.
 * I43: answers to a layer that no longer shows are kept; switching pay mode to 'once' keeps the plan in 'L3.plan'.
 * Every edit returns a new object and never changes its input.
 */
import {
  canUseEmergency, layerOfAnswerKey, parseCheckV2, questionSpec, toStoredV2,
} from '@/engine/decide/v3';
import type { CheckV2, CheckValue, ItemTypeRef, PayV2, Purpose, QuestionId } from '@/engine/decide/v3';
import { minorUnits, type MinorUnits } from '@/engine/money';
import { PERCENT_SCALE, type Percent } from '@/engine/payoff';

type PlanPay = Extract<PayV2, { mode: 'plan' }>;
export type PlanPatch = Partial<Pick<PlanPay, 'cadence' | 'termMonths' | 'count' | 'apr' | 'fees' | 'quotedPayment' | 'firstPayment' | 'deferredInterestTerm'>>;

const MAX_PERCENT = 9999n * PERCENT_SCALE;
const MAX_COUNT = 600;
const MAX_USE_YEARS = 200;
const PLAN_KEY = 'L3.plan';
const ZERO = minorUnits(0);

function amount(n: number, name: string): MinorUnits {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`${name}: ${n} must be a non-negative safe integer`);
  return n as MinorUnits;
}

function optAmount(n: MinorUnits | null, name: string): MinorUnits | null {
  return n === null ? null : amount(n, name);
}

function percentChecked(p: Percent | null, name: string): Percent | null {
  if (p === null) return null;
  if (p < 0n || p > MAX_PERCENT) throw new RangeError(`${name}: percent out of range`);
  return p;
}

function intIn(n: number | null, name: string): number | null {
  if (n === null) return null;
  if (!Number.isInteger(n) || n < 0 || n > MAX_COUNT) throw new RangeError(`${name}: ${n} must be an integer 0..${MAX_COUNT}`);
  return n;
}

export function emptyCheck(): CheckV2 {
  const c = parseCheckV2({ v: 2 });
  /* istanbul ignore next -- parseCheckV2 returns a check whenever v is 2 */
  if (c === null) throw new Error('emptyCheck: parseCheckV2 rejected a v2 stub');
  return c;
}

function defaultPlan(): PlanPay {
  return {
    mode: 'plan', cadence: { unit: 'month', every: 1 }, count: null, termMonths: null, apr: null,
    fees: { setup: ZERO, perPeriod: ZERO, end: ZERO }, deposit: ZERO, tradeIn: ZERO, quotedPayment: null,
    firstPayment: null, deferredInterestTerm: false,
  };
}

/** The plan in its JSON-safe stored form (Percent as text), so it can sit in layerAnswers. */
function storedPay(c: CheckV2): unknown {
  return (toStoredV2(c) as { pay: unknown }).pay;
}

function savedPlan(c: CheckV2): PlanPay | null {
  const stash = c.layerAnswers[PLAN_KEY];
  if (stash === undefined) return null;
  const p = parseCheckV2({ v: 2, pay: stash });
  return p !== null && p.pay.mode === 'plan' ? p.pay : null;
}

export function withPrice(c: CheckV2, price: MinorUnits | null): CheckV2 {
  return { ...c, price: optAmount(price, 'withPrice') };
}

export function withItemType(c: CheckV2, ref: ItemTypeRef): CheckV2 {
  return { ...c, itemType: ref };
}

export function withPayMode(c: CheckV2, mode: 'once' | 'plan'): CheckV2 {
  if (c.pay.mode === mode) return c;
  if (mode === 'once') {
    return { ...c, pay: { mode: 'once' }, layerAnswers: { ...c.layerAnswers, [PLAN_KEY]: storedPay(c) } };
  }
  return { ...c, pay: savedPlan(c) ?? defaultPlan() };
}

export function withPlan(c: CheckV2, patch: PlanPatch): CheckV2 {
  if (c.pay.mode !== 'plan') throw new RangeError('withPlan: the check is not paid by a plan');
  const next: PlanPay = {
    ...c.pay,
    ...patch,
    count: patch.count === undefined ? c.pay.count : intIn(patch.count, 'count'),
    termMonths: patch.termMonths === undefined ? c.pay.termMonths : intIn(patch.termMonths, 'termMonths'),
    apr: patch.apr === undefined ? c.pay.apr : percentChecked(patch.apr, 'apr'),
    quotedPayment: patch.quotedPayment === undefined ? c.pay.quotedPayment : optAmount(patch.quotedPayment, 'quotedPayment'),
  };
  if (patch.fees !== undefined) {
    amount(patch.fees.setup, 'fees.setup');
    amount(patch.fees.perPeriod, 'fees.perPeriod');
    amount(patch.fees.end, 'fees.end');
  }
  return { ...c, pay: next };
}

export function withTaxPercent(c: CheckV2, p: Percent | null): CheckV2 {
  return { ...c, taxPercent: percentChecked(p, 'withTaxPercent') };
}

export function withDeposit(c: CheckV2, amountMinor: MinorUnits): CheckV2 {
  if (c.pay.mode !== 'plan') throw new RangeError('withDeposit: the deposit field only shows in the payment plan card');
  return { ...c, pay: { ...c.pay, deposit: amount(amountMinor, 'withDeposit') } };
}

export function withExtra(c: CheckV2, id: QuestionId, amountMinor: MinorUnits | null): CheckV2 {
  const spec = questionSpec(id);
  if (spec !== null && spec.role === 'modelled_elsewhere') {
    throw new RangeError(`withExtra: "${id}" is modelled by taxPercent or pay.deposit, never extras (M-08)`);
  }
  if (spec !== null && spec.answer !== 'amount') {
    throw new RangeError(`withExtra: "${id}" is a ${spec.answer} answer; use withLayerAnswer('L4.${id}', ...)`);
  }
  const extras: Record<QuestionId, MinorUnits> = { ...c.extras };
  if (amountMinor === null) delete extras[id];
  else extras[id] = amount(amountMinor, 'withExtra');
  return { ...c, extras };
}

export function withValue(c: CheckV2, patch: Partial<CheckValue>): CheckV2 {
  const v: CheckValue = {
    earnsMonthly: patch.earnsMonthly === undefined ? c.value.earnsMonthly : optAmount(patch.earnsMonthly, 'earnsMonthly'),
    savesMonthly: patch.savesMonthly === undefined ? c.value.savesMonthly : optAmount(patch.savesMonthly, 'savesMonthly'),
    cheaperPrice: patch.cheaperPrice === undefined ? c.value.cheaperPrice : optAmount(patch.cheaperPrice, 'cheaperPrice'),
    useYears: c.value.useYears,
  };
  if (patch.useYears !== undefined) {
    const y = patch.useYears;
    if (y !== null && (!Number.isFinite(y) || y < 0 || y > MAX_USE_YEARS)) throw new RangeError(`useYears: ${y} must be 0..${MAX_USE_YEARS}`);
    return { ...c, value: { ...v, useYears: y } };
  }
  return { ...c, value: v };
}

/** Stores one layered answer. `undefined` removes it. The key must carry a layer prefix. */
export function withLayerAnswer(c: CheckV2, key: string, value: unknown): CheckV2 {
  layerOfAnswerKey(key);
  const layerAnswers: Record<string, unknown> = { ...c.layerAnswers };
  if (value === undefined) delete layerAnswers[key];
  else layerAnswers[key] = value;
  return { ...c, layerAnswers };
}

export function withPurpose(c: CheckV2, p: Purpose | null): CheckV2 {
  return { ...c, purpose: p, emergency: canUseEmergency(p) ? c.emergency : false };
}

export function withEmergency(c: CheckV2, yes: boolean): CheckV2 {
  if (yes && !canUseEmergency(c.purpose)) throw new RangeError('withEmergency: only a necessity or for-work purpose can use the emergency fund');
  return { ...c, emergency: yes };
}
