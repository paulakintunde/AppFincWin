/**
 * The typical month (05.1 S2; v3 4.3/4.4, D-03, D-25, D-29, D-32, I6, I14-I16).
 * E is the MEDIAN of everyday spending over at most the last 6 full months, so one bad month cannot move it.
 * The worst month and the plain mean are discarded on purpose. Pure: the caller passes asOf.
 */
import { divideHalfUp } from '../../../money/rounding';
import type { MinorUnits } from '../../../money/types';
import { minorFromBigInt } from '../../../payoff/types';
import { yearMonthOf } from '../dates';
import { LOW_MONTH_RANK, UNDER_LOGGED_PACE_PERCENT, V3_HISTORY_MONTHS } from '../constants';
import { monthlyEquivalentOf } from '../plan/cadence';
import type { LowMonth, MonthMark, Notice, ReasonCode, RoughFigures, V3Month, V3Series } from '../types';
import { classifyLine, liveSeriesOf, seriesIndex } from './series';

/** Median; odd count = middle value, even count = half-up mean of the two middle values (D-29). */
export function medianHalfUp(values: readonly bigint[]): bigint {
  if (values.length === 0) throw new RangeError('medianHalfUp: needs at least one value');
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const n = sorted.length;
  if (n % 2 === 1) return sorted[(n - 1) / 2] as bigint;
  return divideHalfUp((sorted[n / 2 - 1] as bigint) + (sorted[n / 2] as bigint), 2n);
}

export interface EverydayMonth {
  readonly month: string;
  readonly everyday: MinorUnits;
  readonly mark: MonthMark;
  readonly byCategory: ReadonlyMap<string, bigint>;
}

/** Everyday spending per month: 'everyday' lines minus refunds, floored at 0. Dismissed series count here (D-25). */
export function everydayByMonth(months: readonly V3Month[], series: readonly V3Series[]): readonly EverydayMonth[] {
  const index = seriesIndex(series);
  return months.map((m) => {
    let total = 0n;
    const cats = new Map<string, bigint>();
    for (const l of m.lines) {
      if (l.status !== 'paid') continue;
      const cls = classifyLine(l, index);
      if (cls !== 'everyday' && cls !== 'refund') continue;
      const signed = cls === 'everyday' ? BigInt(l.amount) : -BigInt(l.amount);
      total += signed;
      if (l.categoryId !== null) cats.set(l.categoryId, (cats.get(l.categoryId) ?? 0n) + signed);
    }
    const byCategory = new Map<string, bigint>();
    for (const [k, v] of cats) byCategory.set(k, v < 0n ? 0n : v);
    return {
      month: m.month,
      everyday: minorFromBigInt(total < 0n ? 0n : total, 'everydayByMonth'),
      mark: m.mark,
      byCategory,
    };
  });
}

export interface TypicalInput {
  readonly asOf: string;
  readonly history: readonly V3Month[];
  readonly series: readonly V3Series[];
  readonly typicalIncome: MinorUnits;
  readonly setAside: MinorUnits;
  readonly everydayOverride: MinorUnits | null;
  readonly rough: RoughFigures | null; // D-32: used only when no eligible history month remains
}

export interface TypicalResult {
  readonly e: MinorUnits | null;
  readonly typicalLeft: MinorUnits | null;
  readonly recurringBills: MinorUnits;
  readonly low: LowMonth | null;
  readonly monthsUsed: readonly string[];
  readonly categoryMonthly: readonly { readonly categoryId: string; readonly amount: MinorUnits }[];
  readonly housingMonthly: MinorUnits;
  readonly notices: readonly Notice[];
  readonly reasons: readonly ReasonCode[];
}

// Keys (ids, months) are unique, so equal never occurs.
const cmp = (a: string, b: string): number => (a < b ? -1 : 1);

export function typicalOf(input: TypicalInput): TypicalResult {
  const notices: Notice[] = [];
  const reasons = new Set<ReasonCode>();

  // Recurring bills in the typical month (D-03): a yearly or quarterly bill follows the user's per-bill choice.
  let bills = 0n;
  let housing = 0n;
  const billByCategory = new Map<string, bigint>();
  const live = liveSeriesOf(input.series, input.asOf, 'bill')
    .slice()
    .sort((a, b) => cmp(a.id, b.id));
  for (const s of live) {
    const eq = BigInt(monthlyEquivalentOf(s.amount, s.cadence));
    if (s.isHousing) housing += eq;
    if (s.categoryId !== null) billByCategory.set(s.categoryId, (billByCategory.get(s.categoryId) ?? 0n) + eq);
    const longer = s.cadence.unit === 'month' && s.cadence.every > 1;
    if (longer && s.typicalChoice === 'excluded') continue;
    if (longer && s.typicalChoice === null) {
      notices.push({ code: 'yearly_bill_choice_needed', values: { seriesId: s.id } });
      reasons.add('typical_choice_defaulted');
    }
    bills += eq;
  }
  const recurringBills = minorFromBigInt(bills, 'typicalOf');
  const housingMonthly = minorFromBigInt(housing, 'typicalOf');

  // Eligible months: full, before the current month; marks and under-logged months out; then the newest six.
  const currentMonth = yearMonthOf(input.asOf);
  const past = everydayByMonth(
    input.history.filter((m) => m.full && m.month < currentMonth),
    input.series
  )
    .slice()
    .sort((a, b) => cmp(a.month, b.month)); // I16: month order in the input never matters
  const unmarked = past.filter((m) => {
    if (m.mark === 'out' || m.mark === 'half') {
      reasons.add('month_excluded_marked');
      return false;
    }
    return true;
  });
  const kept = unmarked.filter((m) => {
    if (m.mark === 'normal') return true;
    const others = unmarked.filter((o) => o.month !== m.month);
    if (others.length === 0) return true;
    const med = medianHalfUp(others.map((o) => BigInt(o.everyday)));
    if (BigInt(m.everyday) * 100n < med * BigInt(UNDER_LOGGED_PACE_PERCENT)) {
      reasons.add('month_excluded_under_logged');
      notices.push({ code: 'month_looks_under_logged', values: { month: m.month } });
      return false;
    }
    return true;
  });
  const used = kept
    .slice()
    .sort((a, b) => cmp(b.month, a.month))
    .slice(0, V3_HISTORY_MONTHS);
  const monthsUsed = used.map((m) => m.month).sort(cmp);

  // E: override first, then the median of real months, then rough figures (D-32).
  let eBig: bigint | null = null;
  let roughOnly = false;
  if (input.everydayOverride !== null) {
    eBig = BigInt(input.everydayOverride);
    reasons.add('everyday_override_used');
  } else if (used.length > 0) {
    eBig = medianHalfUp(used.map((m) => BigInt(m.everyday)));
  } else if (input.rough !== null) {
    eBig = BigInt(input.rough.expenses);
    roughOnly = true;
    reasons.add('rough_figures_used');
    notices.push({ code: 'from_your_figures', values: {} });
  }

  let typicalLeftBig: bigint | null = null;
  if (roughOnly && input.rough !== null) {
    const r = input.rough;
    typicalLeftBig = BigInt(r.income) - BigInt(r.expenses) - BigInt(r.debt) - BigInt(r.saving) - BigInt(r.invest);
  } else if (eBig !== null) {
    typicalLeftBig = BigInt(input.typicalIncome) - bills - eBig - BigInt(input.setAside);
  }

  // Low month (UP 4.3): second-lowest real month, clamped so it never sits above the typical month (I15).
  let low: LowMonth | null = null;
  if (used.length > 0 && typicalLeftBig !== null) {
    const left = used
      .map((m) => ({
        month: m.month,
        left: BigInt(input.typicalIncome) - bills - BigInt(m.everyday) - BigInt(input.setAside),
      }))
      .sort((a, b) => (a.left < b.left ? -1 : a.left > b.left ? 1 : cmp(a.month, b.month)));
    const pick = left[left.length >= 3 ? LOW_MONTH_RANK - 1 : 0] as { month: string; left: bigint };
    const reason: LowMonth['reason'] = left.length >= 3 ? 'second_lowest' : left.length === 2 ? 'lowest' : 'only_month';
    low = {
      left: minorFromBigInt(pick.left < typicalLeftBig ? pick.left : typicalLeftBig, 'typicalOf'),
      month: pick.month,
      reason,
    };
  }

  // Per-category monthly figure: median of everyday plus the monthly equivalents of confirmed bills.
  const catIds = new Set<string>(billByCategory.keys());
  for (const m of used) for (const k of m.byCategory.keys()) catIds.add(k);
  const categoryMonthly = [...catIds].sort(cmp).map((categoryId) => {
    const med = used.length === 0 ? 0n : medianHalfUp(used.map((m) => m.byCategory.get(categoryId) ?? 0n));
    return { categoryId, amount: minorFromBigInt(med + (billByCategory.get(categoryId) ?? 0n), 'typicalOf') };
  });

  return {
    e: eBig === null ? null : minorFromBigInt(eBig, 'typicalOf'),
    typicalLeft: typicalLeftBig === null ? null : minorFromBigInt(typicalLeftBig, 'typicalOf'),
    recurringBills,
    low,
    monthsUsed,
    categoryMonthly,
    housingMonthly,
    notices,
    reasons: [...reasons],
  };
}
