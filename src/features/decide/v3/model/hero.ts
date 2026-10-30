/**
 * 05.3-18 (UI-SPEC Hero). PURE. The hero's chip, title and body keys come from the engine's verdict table; every
 * placeholder of the chosen row is filled from the Evaluation here, in one place. Where the engine gives no value for a
 * body placeholder the body falls back to a complete sentence of its own, never a half-filled one.
 * Money stays integer minor units; the screen formats every param (useV3Format).
 */
import type { Band, Code, Evaluation, Fact, FactCode, Variant } from '@/engine/decide/v3';
import { verdictRowFor } from '@/engine/decide/v3';
import type { ViewParam } from '../shared/params';

export type HeroParam = ViewParam;

export interface HeroModel {
  readonly chipKey: string;
  readonly titleKey: string;
  readonly bodyKey: string;
  readonly tone: 'fits' | 'caution' | 'short' | 'input';
  readonly params: Readonly<Record<string, HeroParam>>;
}

export const NOT_COVERED_NO_DATE_KEY = 'decide.v3.ui.answer.notCoveredNoDate';
export const EMERGENCY_NO_REBUILD_KEY = 'decide.v3.ui.answer.emergencyNoRebuild';

const money = (minor: number): HeroParam => ({ kind: 'money', minor });
const month = (ym: string): HeroParam => ({ kind: 'month', ym });
const date = (iso: string): HeroParam => ({ kind: 'date', iso });
const count = (n: number): HeroParam => ({ kind: 'count', n });

function factOf(ev: Evaluation, code: FactCode): Fact | undefined {
  return ev.result.facts.find((f) => f.code === code);
}

const numberOf = (v: number | string | null | undefined): number => Number(v ?? 0);

/** Whole months from one YearMonth to another: year * 12 + month. */
function monthsBetween(from: string, to: string): number {
  const idx = (ym: string): number => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7));
  return idx(to) - idx(from);
}

/** What the purchase costs each month: the plan payment plus its running costs; 0 when there is no purchase. */
function monthlyOf(ev: Evaluation): number {
  return ev.purchase === null ? 0 : ev.purchase.monthly + ev.purchase.runningMonthly;
}

/** The tight month of a fits row: from the low_month fact, else from the month model; null when neither exists. */
function lowMonthOf(ev: Evaluation): { ym: string; short: number } | null {
  const fact = factOf(ev, 'low_month');
  if (fact !== undefined) {
    return { ym: String(fact.values.month), short: Math.max(0, numberOf(fact.values.monthly) - numberOf(fact.values.left)) };
  }
  const low = ev.month.low;
  if (low === null) return null;
  const monthly = monthlyOf(ev);
  return { ym: low.month, short: Math.max(0, monthly - low.left) };
}

function unspentParams(ev: Evaluation): Record<string, HeroParam> {
  const fromMonth = ev.result.split.filter((s) => s.source === 'month').reduce((sum, s) => sum + s.amount, 0);
  return {
    month: month(ev.month.month),
    fromMonth: money(fromMonth),
    after: money(numberOf(factOf(ev, 'unspent_before_after')?.values.after)),
  };
}

function notYetParams(ev: Evaluation, variant: Variant | null): { bodyKey: string | null; params: Record<string, HeroParam> } {
  const { readyBy } = ev.result;
  const cash = ev.cash;
  if (variant === 'payday') {
    const readyDate = readyBy !== null && readyBy.kind === 'date' ? readyBy.date : cash.kind === 'payday' ? cash.until : null;
    if (readyDate === null || cash.kind === 'ok') return { bodyKey: NOT_COVERED_NO_DATE_KEY, params: {} };
    return { bodyKey: null, params: { short: money(cash.shortBy), date: date(readyDate) } };
  }
  if (readyBy === null) return { bodyKey: NOT_COVERED_NO_DATE_KEY, params: {} };
  const ready = readyBy.kind === 'month' ? readyBy.month : readyBy.date.slice(0, 7);
  return { bodyKey: null, params: { readyMonth: month(ready), months: count(monthsBetween(ev.month.month, ready)) } };
}

function emergencyParams(ev: Evaluation): { bodyKey: string | null; params: Record<string, HeroParam> } {
  const fact = factOf(ev, 'emergency_used');
  const used = fact !== undefined ? numberOf(fact.values.used) : ev.result.split.filter((s) => s.source === 'emergency').reduce((sum, s) => sum + s.amount, 0);
  const months = fact?.values.months;
  if (months === undefined || months === null) return { bodyKey: EMERGENCY_NO_REBUILD_KEY, params: { used: money(used) } };
  return { bodyKey: null, params: { used: money(used), months: count(numberOf(months)) } };
}

export function heroModel(ev: Evaluation): HeroModel {
  const r = ev.result;
  let variant = r.variant;
  let low: { ym: string; short: number } | null = null;
  if (variant === 'low_month') {
    low = lowMonthOf(ev);
    if (low === null) variant = null; // no tight month to name: say the plain row, not a half-filled one
  }
  const row = verdictRowFor(r.code, variant);
  let part: { bodyKey: string | null; params: Record<string, HeroParam> } = { bodyKey: null, params: {} };

  switch (r.code) {
    case 'fits_month':
      part = { bodyKey: null, params: { month: month(ev.month.month), left: money(ev.month.monthLeft) } };
      break;
    case 'fits_unspent':
      part = { bodyKey: null, params: unspentParams(ev) };
      break;
    case 'not_yet':
      part = notYetParams(ev, variant);
      break;
    case 'monthly_short':
      part = {
        bodyKey: null,
        params: { left: money(ev.month.typicalLeft ?? 0), monthly: money(monthlyOf(ev)) },
      };
      break;
    case 'emergency_use':
      part = emergencyParams(ev);
      break;
    case 'needs_input':
      break;
  }
  const params = low === null ? part.params : { ...part.params, lowMonth: month(low.ym), short: money(low.short) };
  return { chipKey: row.chipKey, titleKey: row.titleKey, bodyKey: part.bodyKey ?? row.bodyKey, tone: row.tone, params };
}

const WARNING_CODES: ReadonlySet<Code> = new Set<Code>(['not_yet', 'monthly_short', 'emergency_use']);

/** One warning haptic when a not_yet, monthly_short or emergency_use answer first appears or its code changes. */
export function heroHaptic(prev: Code | undefined, next: Code): 'warning' | null {
  return WARNING_CODES.has(next) && prev !== next ? 'warning' : null;
}

/** decide_answer_shown: code, variant and band only. No money. */
export function answerShownProps(ev: Evaluation): { code: Code; variant: Variant | 'none'; band: Band } {
  return { code: ev.result.code, variant: ev.result.variant ?? 'none', band: ev.result.band ?? 1 };
}
