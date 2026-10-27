/**
 * D-10..D-13 (05.1). Lines as facts. A line is a number the user chose to watch, never a gate: off by default, and when
 * it is on and the purchase crosses it, ONE plain fact is added. Facts only: nothing here can change a code, a split
 * or a verdict (T-05.1-44). Comparisons are bigint cross-multiplication, no division; zero income gives no
 * percentage fact (no division by zero).
 */
import type { MinorUnits } from '../../../money/types';
import { divideHalfUp } from '../../../money/rounding';
import { ONE_HUNDRED_PERCENT, PERCENT_SCALE } from '../../../payoff/types';
import {
  DEFAULT_DSR_LINE,
  DEFAULT_HOUSING_LINE,
  DEFAULT_UNSECURED_INCOME_MULTIPLE,
} from '../../lineDefaults';
import { MAX_BUILTIN_LINES, MAX_OWN_LINES } from '../constants';
import type { Fact, LimitLine, Limits, MonthModel, Purchase, V3Debt } from '../types';

/** The three built-in lines (D-11), all off. */
export function builtinLines(): readonly LimitLine[] {
  return [
    { id: 'builtin_housing', on: false, source: 'builtin', spec: { kind: 'housing_share', pct: DEFAULT_HOUSING_LINE } },
    { id: 'builtin_debt', on: false, source: 'builtin', spec: { kind: 'debt_share', pct: DEFAULT_DSR_LINE } },
    {
      id: 'builtin_unsecured',
      on: false,
      source: 'builtin',
      spec: { kind: 'unsecured_multiple', times: DEFAULT_UNSECURED_INCOME_MULTIPLE },
    },
  ];
}

/** D-12: at most 3 built-in and 5 own lines, ids unique. Never throws. */
export function validateLimits(
  l: Limits,
): readonly ('too_many_builtin' | 'too_many_own' | 'duplicate_id' | 'invalid_times')[] {
  const problems: ('too_many_builtin' | 'too_many_own' | 'duplicate_id' | 'invalid_times')[] = [];
  if (l.lines.filter((x) => x.source === 'builtin').length > MAX_BUILTIN_LINES) problems.push('too_many_builtin');
  if (l.lines.filter((x) => x.source === 'own').length > MAX_OWN_LINES) problems.push('too_many_own');
  if (new Set(l.lines.map((x) => x.id)).size !== l.lines.length) problems.push('duplicate_id');
  if (l.lines.some((x) => x.spec.kind === 'unsecured_multiple' && !validTimes(x.spec.times))) problems.push('invalid_times');
  return problems;
}

/** M-05: a multiple is a non-negative safe integer; anything else would throw out of BigInt(). */
function validTimes(times: number): boolean {
  return Number.isSafeInteger(times) && times >= 0;
}

export interface LineContext {
  readonly month: MonthModel;
  readonly purchase: Purchase;
  readonly debts: readonly V3Debt[];
  readonly unspentAfter: MinorUnits | null;
  readonly isHousing: boolean;
}

function big(n: number): bigint {
  return BigInt(n);
}

type LineUnit = 'percent' | 'money' | 'tenths';

function fact(line: LimitLine, unit: LineUnit, value: number, limit: number | string): Fact {
  return { code: 'line_crossed', values: { lineId: line.id, kind: line.spec.kind, unit, value, limit } };
}

/** part / income against pct by cross-multiplication. No fact when income is not positive or the purchase adds nothing. */
function share(line: LimitLine, part: bigint, added: bigint, income: bigint, pct: bigint): Fact | null {
  if (income <= 0n || added <= 0n) return null;
  if (part * ONE_HUNDRED_PERCENT <= pct * income) return null;
  return fact(line, 'percent', Number(divideHalfUp(part * 100n, income)), divideHalfUp(pct, PERCENT_SCALE).toString());
}

function categoryTypical(month: MonthModel, categoryId: string): number {
  return month.categoryMonthly.find((c) => c.categoryId === categoryId)?.amount ?? 0;
}

function evaluateOne(line: LimitLine, ctx: LineContext): Fact | null {
  const { month, purchase } = ctx;
  const income = big(month.typicalIncome);
  const m = big(purchase.monthly);
  const spec = line.spec;
  switch (spec.kind) {
    case 'housing_share': {
      const added = ctx.isHousing ? m : 0n;
      return share(line, big(month.housingMonthly) + added, added, income, spec.pct);
    }
    case 'debt_share': {
      const added = purchase.financed ? m : 0n;
      const mins = ctx.debts.reduce((s, d) => s + big(d.minimum), 0n);
      return share(line, mins + added, added, income, spec.pct);
    }
    case 'unsecured_multiple': {
      if (!validTimes(spec.times)) return null;
      const added = !purchase.secured && purchase.financed && purchase.schedule ? big(purchase.schedule.financed) : 0n;
      const owed = ctx.debts.filter((d) => !d.secured).reduce((s, d) => s + big(d.balance), 0n);
      const part = owed + added;
      if (income <= 0n || added <= 0n || part <= BigInt(spec.times) * income) return null;
      return fact(line, 'tenths', Number(divideHalfUp(part * 10n, income)), spec.times * 10);
    }
    case 'category_monthly_cap': {
      if (purchase.categoryId !== spec.categoryId) return null;
      const total = big(categoryTypical(month, spec.categoryId)) + m;
      return total > big(spec.cap) ? fact(line, 'money', Number(total), spec.cap) : null;
    }
    case 'single_purchase_cap':
      return purchase.whole > spec.cap ? fact(line, 'money', purchase.whole, spec.cap) : null;
    case 'category_income_share': {
      if (purchase.categoryId !== spec.categoryId) return null;
      return share(line, big(categoryTypical(month, spec.categoryId)) + m, m, income, spec.pct);
    }
    case 'unspent_floor':
      return ctx.unspentAfter !== null && ctx.unspentAfter < spec.floor ? fact(line, 'money', ctx.unspentAfter, spec.floor) : null;
  }
}

/** One `line_crossed` fact per line that is on and crossed by this purchase, sorted by line id. */
export function evaluateLines(limits: Limits, ctx: LineContext): readonly Fact[] {
  const out: { id: string; fact: Fact }[] = [];
  for (const line of limits.lines) {
    if (!line.on) continue;
    const f = evaluateOne(line, ctx);
    if (f) out.push({ id: line.id, fact: f });
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out.map((o) => o.fact);
}
