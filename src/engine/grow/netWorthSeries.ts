// 07-03 (INS-01; D-07, D-08, D-09, D-10, D-22, D-26a): the month-end net-worth series behind the Insights line.
// PURE. Every point is netWorthOf of that point's own inputs (D-08): this file picks WHAT counts at a date and never
// adds money up itself.
//
// Presence rules (07-RESEARCH A7):
//   - an account counts at a month-end once it existed: it has a paid line (accountsWithLegs) or was created on or before it;
//   - a holding appears from its first dated value and is left out before it (D-22);
//   - a debt with no account is held at today's figure in past points (debtsHeldFlat); one paid off later counts at its
//     starting balance (or its current balance when none was recorded) before the paid-off date, and not on or after it.
// Known edge: a debt paid off later with no startedBalance falls back to its current balance, so earlier months may
// understate the debt.
import { addYearMonths, daysInYearMonth, yearMonthOf } from '../decide/v3/dates';
import { netWorthOf, type NetWorthAccount, type NetWorthDebt, type NetWorthHolding } from './netWorth';

export type SeriesRange = '6m' | '1y' | 'all';

export interface ValueLot {
  readonly date: string;
  /** Home-currency minor units, already converted. */
  readonly amount: number;
}
export interface SeriesAccount extends NetWorthAccount {
  /** YYYY-MM-DD. */
  readonly createdOn: string;
}
export interface SeriesHolding {
  readonly id: string;
  readonly account_id: string | null;
  readonly deleted_at?: string | null;
  readonly lots: readonly ValueLot[];
}
export interface SeriesDebt {
  readonly account_id: string | null;
  readonly balance: number;
  readonly startedBalance: number | null;
  readonly paidOffOn: string | null;
  readonly deleted_at?: string | null;
}
export interface PointSource {
  readonly date: string;
  readonly isToday: boolean;
  readonly balances: ReadonlyMap<string, number>;
  readonly accountsWithLegs: ReadonlySet<string>;
}
export interface SeriesPoint {
  readonly date: string;
  readonly value: number;
  readonly debtsHeldFlat: boolean;
  readonly holdingsLeftOut: number;
}

const MONTHS_BACK: Record<Exclude<SeriesRange, 'all'>, number> = { '6m': 6, '1y': 12 };

/**
 * D-09/D-10/D-26a: the completed month-ends in range, oldest first, never before firstMonth. A range is N full months
 * before this one ("6m" = 6 month-ends); today is added by the caller as its own point.
 */
export function monthEndsFor(today: string, firstMonth: string | null, range: SeriesRange): string[] {
  if (firstMonth === null) return [];
  const current = yearMonthOf(today);
  const last = addYearMonths(current, -1);
  let start = firstMonth;
  if (range !== 'all') {
    const floor = addYearMonths(current, -MONTHS_BACK[range]);
    if (floor > start) start = floor;
  }
  const out: string[] = [];
  for (let ym = start; ym <= last; ym = addYearMonths(ym, 1)) {
    out.push(`${ym}-${String(daysInYearMonth(ym)).padStart(2, '0')}`);
  }
  return out;
}

/** D-22: the latest value on or before the date; null before the first dated value. Ties take the later input entry. */
export function holdingValueOn(lots: readonly ValueLot[], date: string): number | null {
  let bestDate: string | null = null;
  let best: number | null = null;
  for (const lot of lots) {
    if (lot.date > date) continue;
    if (bestDate === null || lot.date >= bestDate) {
      bestDate = lot.date;
      best = lot.amount;
    }
  }
  return best;
}

/** D-08: netWorthOf once per point. */
export function netWorthSeries(args: {
  readonly accounts: readonly SeriesAccount[];
  readonly holdings: readonly SeriesHolding[];
  readonly debts: readonly SeriesDebt[];
  readonly points: readonly PointSource[];
}): SeriesPoint[] {
  return args.points.map((p) => {
    const accounts = args.accounts.filter((a) => p.isToday || p.accountsWithLegs.has(a.id) || a.createdOn <= p.date);

    const holdings: NetWorthHolding[] = [];
    let holdingsLeftOut = 0;
    for (const h of args.holdings) {
      if (h.deleted_at) continue;
      const value = holdingValueOn(h.lots, p.isToday ? '9999-12-31' : p.date);
      if (value === null) {
        holdingsLeftOut += 1;
        continue;
      }
      holdings.push({ account_id: h.account_id, value, deleted_at: h.deleted_at });
    }

    let debtsHeldFlat = false;
    const debts: NetWorthDebt[] = args.debts.map((d) => {
      const paidOff = d.paidOffOn !== null;
      if (p.isToday) {
        return { account_id: d.account_id, balance: d.balance, paid_off: paidOff, deleted_at: d.deleted_at };
      }
      if (d.paidOffOn !== null) {
        const gone = d.paidOffOn <= p.date;
        return { account_id: d.account_id, balance: d.startedBalance ?? d.balance, paid_off: gone, deleted_at: d.deleted_at };
      }
      if (d.account_id === null && !d.deleted_at) debtsHeldFlat = true;
      return { account_id: d.account_id, balance: d.balance, paid_off: false, deleted_at: d.deleted_at };
    });

    const value = netWorthOf({ accounts, balances: p.balances, holdings, debts });
    return { date: p.date, value, debtsHeldFlat, holdingsLeftOut };
  });
}

export function seriesChange(points: readonly SeriesPoint[]): { readonly from: number; readonly to: number; readonly change: number } | null {
  if (points.length < 2) return null;
  const from = points[0]!.value;
  const to = points[points.length - 1]!.value;
  const change = Number(BigInt(to) - BigInt(from));
  if (!Number.isSafeInteger(change)) throw new RangeError('seriesChange: result exceeds the safe integer range');
  return { from, to, change };
}
