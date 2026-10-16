/**
 * Money basis from Record lines (prototype `dmoney`): DEC-07 steadiness and the money half of DEC-08.
 *
 * Rules applied here (04-CONTEXT):
 * - D-08 / D-12 (as amended 2026-10-15): an average basis and a cautious "worst" basis that pairs the LOWEST income
 *   month with the HIGHEST spending month; under 3 full months steadiness is `insufficient`, never `steady`, so a short
 *   history defaults to the cautious basis on both sides. An explicit basisOverride still wins.
 * - D-09 / D-10 / D-13: only months the snapshot marks full, the latest AVERAGING_WINDOW_MONTHS of them.
 * - D-23 / D-25 / D-26: every confirmed non-monthly bill has its lines replaced by its monthly equivalent of the latest
 *   scheduled amount, in every averaged month; unconfirmed series are ignored and their lines count as ordinary spending.
 * - D-27: a refund nets against spending in the month it lands and is never income; a month's net is floored at 0.
 * - D-28: only `paid` lines count. A transfer leg (non-null transferId) is neither income nor spending.
 * - D-29 as amended by D-47: unmarked spikes stay in; a line the user marked one-off is left out and counted.
 * - D-34: existing spending is shared by the household rule or the per-category rules; income is mine, never shared.
 * - D-60 (extends D-23 to income, reverses the replan note that income series are not smoothed): a confirmed weekly or
 *   fortnightly pay series has its paid lines in a month replaced by its monthly equivalent. Three readings where D-60 is
 *   silent: a month holding no paid line of the series gets nothing added (no pay is invented); worst and best months
 *   move with the smoothed months; and (checker W2) only months the series spans in full are smoothed, so a partial first
 *   or last month keeps its logged lines.
 * D-02's "month's costs" uses spendingAverage (computed in assess, 04-07) and so already includes the smoothed bills.
 *
 * Steadiness compares the coefficient of variation with exact bigint arithmetic and no square root.
 */
import { assertNever } from '../guards/assertNever';
import { divideHalfUp } from '../money/rounding';
import type { CurrencyCode, MinorUnits } from '../money/types';
import { ONE_HUNDRED_PERCENT, minorFromBigInt, type Percent } from '../payoff/types';
import { isValidLocalDate, monthOf } from '../time/localDate';
import { AVERAGING_WINDOW_MONTHS, MIN_MONTHS_FOR_STEADINESS, STEADY_CV_BELOW, VARIABLE_CV_BELOW } from './constants';
import { assertCurrency } from './currency';
import { addDays, assertValidBill, isSmoothedFreq, isSmoothedPayFreq, monthlyEquivalent } from './series';
import { SOLE_SHARE, myPart, resolveShare, type ResolvedShare, type ShareScope } from './share';
import type {
  HouseholdSpendingRule,
  MoneyInput,
  MoneyResult,
  MonthRecord,
  MonthSummary,
  RecurringIncome,
  SpendingShare,
  SpendingShareResult,
  Steadiness,
} from './types';

/**
 * My share of existing household spending, bills and the cushion (D-34). The purchase uses `resolveShare(snapshot.scope)`
 * (D-15) separately; the purchase's own rule never leaks in here.
 */
export function resolveSpendingShare(scope: ShareScope, household: HouseholdSpendingRule | null): SpendingShareResult {
  switch (scope.kind) {
    case 'personal':
      return { ok: true, share: { byDefault: SOLE_SHARE, byCategory: [] } };
    case 'household': {
      if (household === null) {
        throw new RangeError('resolveSpendingShare: household scope needs householdSpending (D-34)');
      }
      const def = resolveShare({ ...scope, rule: household.rule });
      if (!def.ok) return { ok: false, reason: def.reason };
      const seen = new Set<string>();
      const byCategory: { categoryId: string; share: ResolvedShare }[] = [];
      for (const c of household.byCategory) {
        if (seen.has(c.categoryId)) {
          throw new RangeError(`resolveSpendingShare: duplicate category rule for ${c.categoryId}`);
        }
        seen.add(c.categoryId);
        const r = resolveShare({ ...scope, rule: c.rule });
        if (!r.ok) return { ok: false, reason: r.reason };
        byCategory.push({ categoryId: c.categoryId, share: r.share });
      }
      return { ok: true, share: { byDefault: def.share, byCategory } };
    }
    default:
      return assertNever(scope, 'shareScope');
  }
}

/** The category's own share when it has a rule, else the household default. */
export function shareForCategory(share: SpendingShare, categoryId: string | null): ResolvedShare {
  return share.byCategory.find((c) => c.categoryId === categoryId)?.share ?? share.byDefault;
}

export interface SummariseOptions {
  readonly currency: CurrencyCode;
  readonly smoothedSeriesIds: ReadonlySet<string>;
  readonly spendingShare: SpendingShare;
  readonly smoothedBillsMonthly: MinorUnits;
  /** D-60: seriesId to monthly equivalent, for confirmed weekly/fortnightly pay series spanning THIS month in full. */
  readonly smoothedPay: ReadonlyMap<string, MinorUnits>;
}

/**
 * One month's income and my net spending from Record lines. Income lines are mine; spending lines are household
 * spending in household scope and shared per D-34. See the file docblock for D-23, D-27, D-28, D-47 and D-60.
 */
export function summariseMonth(month: MonthRecord, opts: SummariseOptions): MonthSummary {
  let income = 0n;
  const net = new Map<string, bigint>();
  const paySeen = new Set<string>();
  let oneOffCount = 0;
  // 04-REVIEW LO-02: one-off spending nets one-off refunds and is shared per category total, like ordinary spending.
  const oneOffNet = new Map<string, bigint>();
  let oneOffIncome = 0n;

  for (const l of month.lines) {
    if (!isValidLocalDate(l.date)) {
      throw new RangeError(`summariseMonth: line ${l.id} has invalid date "${l.date}"`);
    }
    if (monthOf(l.date) !== month.month) {
      throw new RangeError(`summariseMonth: line ${l.id} dated ${l.date} is outside month ${month.month}`);
    }
    if (!Number.isSafeInteger(l.amount) || l.amount < 0) {
      throw new RangeError(`summariseMonth: line ${l.id} amount must be a non-negative integer`);
    }
    assertCurrency(opts.currency, l.currency, `line ${l.id}`, 'summariseMonth');
    if (l.isRefund && l.direction === 'out') {
      throw new RangeError(`summariseMonth: line ${l.id} is a refund on money out`);
    }

    if (l.status !== 'paid') continue; // D-28
    if (l.transferId !== null) continue;
    if (l.seriesId !== null && opts.smoothedSeriesIds.has(l.seriesId)) continue; // D-23
    if (l.direction === 'in' && !l.isRefund && l.seriesId !== null && opts.smoothedPay.has(l.seriesId)) {
      paySeen.add(l.seriesId); // D-60: replaced by the series' monthly equivalent
      continue;
    }

    const cat = l.categoryId ?? '';
    const amount = BigInt(l.amount);
    if (l.oneOff) {
      oneOffCount += 1; // D-47
      if (l.direction === 'out') {
        oneOffNet.set(cat, (oneOffNet.get(cat) ?? 0n) + amount);
      } else if (l.isRefund) {
        oneOffNet.set(cat, (oneOffNet.get(cat) ?? 0n) - amount); // LO-02: was counted but its amount dropped
      } else {
        oneOffIncome += amount;
      }
      continue;
    }
    if (l.direction === 'out') {
      net.set(cat, (net.get(cat) ?? 0n) + amount);
    } else if (l.isRefund) {
      net.set(cat, (net.get(cat) ?? 0n) - amount); // D-27
    } else {
      income += amount;
    }
  }

  const mineOf = (byCategory: ReadonlyMap<string, bigint>): bigint => {
    let mine = 0n;
    for (const [cat, total] of byCategory) {
      mine += BigInt(
        myPart(minorFromBigInt(total, 'summariseMonth'), shareForCategory(opts.spendingShare, cat === '' ? null : cat))
      );
    }
    return mine;
  };
  const myNet = mineOf(net);
  const myOneOff = mineOf(oneOffNet);
  const oneOffSpending = myOneOff > 0n ? myOneOff : 0n; // LO-02: one-off refunds net against one-off spending, floored at 0
  const spending = (myNet > 0n ? myNet : 0n) + BigInt(opts.smoothedBillsMonthly); // D-27 floor first, then smoothed bills
  for (const id of paySeen) {
    income += BigInt(opts.smoothedPay.get(id)!);
  }
  return {
    month: month.month,
    income: minorFromBigInt(income, 'summariseMonth'),
    spending: minorFromBigInt(spending, 'summariseMonth'),
    oneOffs: {
      count: oneOffCount,
      spending: minorFromBigInt(oneOffSpending, 'summariseMonth'),
      income: minorFromBigInt(oneOffIncome, 'summariseMonth'),
    },
  };
}

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The calendar step schedule.ts uses for weekly and fortnightly series (not a behaviour constant). */
function payIntervalDays(freq: RecurringIncome['freq']): number {
  return freq === 'weekly' ? 7 : 14;
}

/**
 * D-60 / checker W2: does the pay series span `month` in full? It must have started by the month's first regular payday
 * (no payday of the month would fall before the anchor) and must not end in or before the month.
 */
function paySpansMonth(series: RecurringIncome, month: string): boolean {
  const interval = payIntervalDays(series.freq);
  const started = series.anchorDate < addDays(`${month}-01`, interval);
  const ends: string[] = [];
  if (series.endDate !== null) ends.push(series.endDate);
  if (series.occurrenceCount !== null) ends.push(addDays(series.anchorDate, interval * (series.occurrenceCount - 1)));
  const lastDate = ends.sort()[0] ?? null;
  return started && (lastDate === null || lastDate.slice(0, 7) > month);
}

/** Exact integer square root (floor) by Newton's method. */
function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

/** Prototype `dmoney` over Record lines. See the file docblock. */
export function deriveMoney(input: MoneyInput): MoneyResult {
  const { currency, months, bills, incomeSeries, basisOverride, spendingShare } = input;

  const seenMonths = new Set<string>();
  for (const m of months) {
    if (!MONTH_KEY.test(m.month)) {
      throw new RangeError(`deriveMoney: month key "${m.month}" is not YYYY-MM`);
    }
    if (seenMonths.has(m.month)) {
      throw new RangeError(`deriveMoney: duplicate month ${m.month}`);
    }
    seenMonths.add(m.month);
  }
  for (const b of bills) {
    assertValidBill(b, 'deriveMoney');
    assertCurrency(currency, b.currency, `bill ${b.seriesId}`, 'deriveMoney');
  }
  const billIds = new Set(bills.map((b) => b.seriesId));
  for (const s of incomeSeries) {
    assertValidBill(s, 'deriveMoney');
    assertCurrency(currency, s.currency, `income series ${s.seriesId}`, 'deriveMoney');
    if (billIds.has(s.seriesId)) {
      throw new RangeError(`deriveMoney: series ${s.seriesId} is in both bills and incomeSeries`);
    }
  }

  const smoothed = bills.filter((b) => b.confirmed && isSmoothedFreq(b.freq));
  const smoothedSeriesIds = new Set(smoothed.map((b) => b.seriesId));
  let billsMonthly = 0n;
  for (const b of smoothed) {
    billsMonthly += BigInt(
      myPart(monthlyEquivalent(b.latestAmount, b.freq), shareForCategory(spendingShare, b.categoryId))
    );
  }
  const smoothedBillsMonthly = minorFromBigInt(billsMonthly, 'deriveMoney');
  const payCandidates = incomeSeries.filter((s) => s.confirmed && isSmoothedPayFreq(s.freq));

  const full = months
    .filter((m) => m.full)
    .sort((a, b) => (a.month < b.month ? 1 : -1))
    .slice(0, AVERAGING_WINDOW_MONTHS);
  if (full.length === 0) return { ok: false, reason: 'no_full_month' };

  const monthsUsed = full.map((m) =>
    summariseMonth(m, {
      currency,
      smoothedSeriesIds,
      spendingShare,
      smoothedBillsMonthly,
      smoothedPay: new Map(
        payCandidates
          .filter((s) => paySpansMonth(s, m.month))
          .map((s): [string, MinorUnits] => [s.seriesId, monthlyEquivalent(s.latestAmount, s.freq)])
      ),
    })
  );

  const count = monthsUsed.length;
  const n = BigInt(count);
  let S = 0n;
  let Q = 0n;
  let spendSum = 0n;
  let incomeWorst = monthsUsed[0]!.income;
  let incomeBest = monthsUsed[0]!.income;
  let spendingWorst = monthsUsed[0]!.spending;
  let oneCount = 0;
  let oneSpending = 0n;
  let oneIncome = 0n;
  for (const m of monthsUsed) {
    const inc = BigInt(m.income);
    S += inc;
    Q += inc * inc;
    spendSum += BigInt(m.spending);
    if (m.income < incomeWorst) incomeWorst = m.income;
    if (m.income > incomeBest) incomeBest = m.income;
    if (m.spending > spendingWorst) spendingWorst = m.spending;
    oneCount += m.oneOffs.count;
    oneSpending += BigInt(m.oneOffs.spending);
    oneIncome += BigInt(m.oneOffs.income);
  }
  const incomeAverage = minorFromBigInt(divideHalfUp(S, n), 'deriveMoney');
  const spendingAverage = minorFromBigInt(divideHalfUp(spendSum, n), 'deriveMoney');

  // diff = n^2 * variance. cv = sd / mean = sqrt(n*Q - S^2) / S, so cv < T/100 <=> diff * H^2 < T^2 * S^2 (S > 0).
  const diff = n * Q - S * S;
  const H = ONE_HUNDRED_PERCENT;
  const cvBelow = (t: Percent): boolean => diff * H * H < t * t * S * S;
  let steadiness: Steadiness;
  let incomeCvPercent: number | null;
  if (count < MIN_MONTHS_FOR_STEADINESS) {
    steadiness = 'insufficient';
    incomeCvPercent = null;
  } else if (S === 0n) {
    // 04-REVIEW LO-01, a named deviation from the prototype (`avg ? sd / avg : 0` gave cv 0 and Steady): no logged
    // income is not steady income. It is Volatile, so the basis is the cautious worst one, the default cushion is the
    // Volatile one and confidence is rough; the CV is undefined (null) with a mean of 0.
    steadiness = 'volatile';
    incomeCvPercent = null;
  } else {
    if (cvBelow(STEADY_CV_BELOW)) steadiness = 'steady';
    else if (cvBelow(VARIABLE_CV_BELOW)) steadiness = 'variable';
    else steadiness = 'volatile';
    // cv% = 100 * sqrt(diff) / S; half-up = floor((200 * sqrt(diff) + S) / 2S) = floor((sqrt(40000 * diff) + S) / 2S)
    incomeCvPercent = Number((isqrt(40_000n * diff) + S) / (2n * S));
  }

  const basis = basisOverride ?? (steadiness === 'steady' ? 'average' : 'worst');
  return {
    ok: true,
    money: {
      fullMonthsUsed: count,
      monthsUsed,
      incomeAverage,
      incomeWorst,
      incomeBest,
      spendingAverage,
      spendingWorst,
      smoothedBillsMonthly,
      steadiness,
      incomeCvPercent,
      basis,
      incomeBasis: basis === 'average' ? incomeAverage : incomeWorst,
      spendingBasis: basis === 'average' ? spendingAverage : spendingWorst,
      oneOffsExcluded: {
        count: oneCount,
        spending: minorFromBigInt(oneSpending, 'deriveMoney'),
        income: minorFromBigInt(oneIncome, 'deriveMoney'),
      },
    },
  };
}
