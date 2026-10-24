/**
 * D-106 / D-107: the current calendar month as it is expected to end, for the Decide home card (DCU-39).
 *
 * Income and spending already logged this month (paid and still-pending lines) plus the confirmed recurring pay, bills and
 * other series occurrences still due before month end. The logged part goes through `summariseMonth`, so refund netting,
 * the floor at 0, transfer legs and the household share follow the same rules as the history months. A one-off line
 * logged this month counts here (it really happens); D-47 leaves one-offs out of the averages only.
 *
 * Nothing is counted twice. An occurrence is dropped from the schedule when it is settled (on or before the series'
 * lastPaidDate) or when one of the series' own lines this month takes it: a monthly, quarterly or yearly series is taken
 * by any line of the series this month (however its date was edited); a weekly or fortnightly one by a line within 3 or
 * 6 days of the occurrence. A line takes at most one occurrence. Skipped lines count for nothing.
 *
 * The result is income - spending - debtPayments - saving - setAside, the same Net Free Cash Flow formula as
 * prepareContext.leftBefore. futureChanges are not read: they feed the cash path, not this figure.
 * All arithmetic is bigint with one minorFromBigInt at each output.
 */
import type { MinorUnits } from "../money/types";
import { minorFromBigInt } from "../payoff/types";
import {
  daysInMonth,
  occurrencesBetween,
  type RecurringFreq,
} from "../recurring/schedule";
import { monthOf } from "../time/localDate";
import { assertCurrency } from "./currency";
import { shareForCategory, summariseMonth } from "./money";
import { addDays, assertValidBill } from "./series";
import { myPart } from "./share";
import type {
  AssessContext,
  DecideSnapshot,
  RecordLine,
  RecurringBill,
  SpendingShare,
} from "./types";

export interface ExpectedMonthMoney {
  readonly month: string;
  readonly income: MinorUnits;
  readonly spending: MinorUnits;
  readonly stillDue: {
    readonly income: MinorUnits;
    readonly spending: MinorUnits;
  };
}

export interface ExpectedMonthFigures {
  readonly month: string; // 'YYYY-MM' of snapshot.asOf
  readonly income: MinorUnits; // logged + pending + still due, mine
  readonly spending: MinorUnits; // same, my share
  readonly debtPayments: MinorUnits; // = context.debtPayments
  readonly saving: MinorUnits; // saving + investing = context.pausable
  readonly setAside: MinorUnits; // = context.setAside (pots)
  readonly result: MinorUnits; // signed: income - spending - debtPayments - saving - setAside
  readonly stillDue: {
    readonly income: MinorUnits;
    readonly spending: MinorUnits;
  };
}

/** How far a line may sit from a day-based occurrence and still be that occurrence (spacing is 7 and 14 days). */
const MATCH_RADIUS_DAYS: Readonly<Partial<Record<RecurringFreq, number>>> = {
  weekly: 3,
  fortnightly: 6,
};

function takes(
  freq: RecurringFreq,
  lineDate: string,
  occurrenceDate: string,
): boolean {
  const radius = MATCH_RADIUS_DAYS[freq];
  if (radius === undefined) return true; // the occurrence is the only one in the month
  return (
    lineDate <= addDays(occurrenceDate, radius) &&
    occurrenceDate <= addDays(lineDate, radius)
  );
}

/** The series' occurrences this month that are neither settled nor taken by one of its own lines, in cents of amount. */
function stillDueCount(
  series: Omit<RecurringBill, "categoryId">,
  lines: readonly RecordLine[],
  from: string,
  to: string,
): number {
  const occurrences = occurrencesBetween(
    {
      anchorDate: series.anchorDate,
      freq: series.freq,
      endDate: series.endDate,
      occurrenceCount: series.occurrenceCount,
    },
    from,
    to,
  ).map((o) => o.date);
  const taken = new Set<string>();
  const own = lines
    .filter(
      (l) =>
        l.seriesId === series.seriesId &&
        l.transferId === null &&
        l.status !== "skipped",
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const l of own) {
    const hit = occurrences.find(
      (d) => !taken.has(d) && takes(series.freq, l.date, d),
    );
    if (hit !== undefined) taken.add(hit);
  }
  return occurrences.filter(
    (d) =>
      !taken.has(d) &&
      (series.lastPaidDate === null || d > series.lastPaidDate),
  ).length;
}

/** D-107: the month's money alone, from a snapshot and its resolved existing-spending share. */
export function expectedMonthMoney(
  snapshot: DecideSnapshot,
  spendingShare: SpendingShare,
): ExpectedMonthMoney {
  const month = monthOf(snapshot.asOf);
  const record = snapshot.months.find((m) => m.month === month) ?? {
    month,
    full: false,
    lines: [],
  };
  const live = record.lines.filter((l) => l.status !== "skipped");

  const logged = summariseMonth(
    {
      ...record,
      lines: live.map((l) =>
        l.status === "pending" ? { ...l, status: "paid" as const } : l,
      ),
    },
    {
      currency: snapshot.currency,
      smoothedSeriesIds: new Set(),
      spendingShare,
      smoothedBillsMonthly: minorFromBigInt(0n, "expectedMonth"),
      smoothedPay: new Map(),
    },
  );

  const from = `${month}-01`;
  const to = `${month}-${String(daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)))).padStart(2, "0")}`;

  let dueSpending = 0n;
  for (const b of snapshot.bills) {
    assertValidBill(b, "expectedMonth");
    assertCurrency(
      snapshot.currency,
      b.currency,
      `bill ${b.seriesId}`,
      "expectedMonth",
    );
    if (!b.confirmed) continue;
    const count = stillDueCount(b, live, from, to);
    const total = minorFromBigInt(
      BigInt(b.latestAmount) * BigInt(count),
      "expectedMonth",
    );
    dueSpending += BigInt(
      myPart(total, shareForCategory(spendingShare, b.categoryId)),
    );
  }
  let dueIncome = 0n;
  for (const s of snapshot.incomeSeries) {
    assertValidBill(s, "expectedMonth");
    assertCurrency(
      snapshot.currency,
      s.currency,
      `income series ${s.seriesId}`,
      "expectedMonth",
    );
    if (!s.confirmed) continue;
    dueIncome +=
      BigInt(s.latestAmount) * BigInt(stillDueCount(s, live, from, to));
  }

  const income =
    BigInt(logged.income) + BigInt(logged.oneOffs.income) + dueIncome;
  const spending =
    BigInt(logged.spending) + BigInt(logged.oneOffs.spending) + dueSpending;
  return {
    month,
    income: minorFromBigInt(income, "expectedMonth"),
    spending: minorFromBigInt(spending, "expectedMonth"),
    stillDue: {
      income: minorFromBigInt(dueIncome, "expectedMonth"),
      spending: minorFromBigInt(dueSpending, "expectedMonth"),
    },
  };
}

/** D-106: the expected month's Net Free Cash Flow, with the same formula as prepareContext.leftBefore. */
export function expectedMonth(context: AssessContext): ExpectedMonthFigures {
  const m = expectedMonthMoney(context.snapshot, context.spendingShare);
  const result =
    BigInt(m.income) -
    BigInt(m.spending) -
    BigInt(context.debtPayments) -
    BigInt(context.pausable) -
    BigInt(context.setAside);
  return {
    month: m.month,
    income: m.income,
    spending: m.spending,
    debtPayments: context.debtPayments,
    saving: context.pausable,
    setAside: context.setAside,
    result: minorFromBigInt(result, "expectedMonth"),
    stillDue: m.stillDue,
  };
}
