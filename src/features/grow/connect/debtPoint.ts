// 06-05 (BO-07 item 4): the debt connection point. Grow rows in, Decide debts and a dated payoff out. PURE.
// The payoff maths is engine/payoff's fixedPayoff (ENG-24); this file only turns months into dates.
import type { V3Debt } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';
import { fixedPayoff, percent, ZERO_PERCENT, type Percent } from '@/engine/payoff';
import type { DebtPoint, DebtSourceRow } from './types';

/** FIN-04: a due day is a whole number 1..31; anything else is "not set". */
const dueDayOf = (x: unknown): number | null => (typeof x === 'number' && Number.isInteger(x) && x >= 1 && x <= 31 ? x : null);

/** The builder's debt record (a snapshot debt) mapped to the engine's debt: exactly the mapping buildV3Inputs used. */
export function debtToV3Debt(
  d: { id: string; balance: V3Debt['balance']; minimumPayment: V3Debt['minimum']; apr: Percent | null; secured: boolean },
  row: DebtSourceRow | undefined,
  cardRow: DebtSourceRow | undefined,
  kindOfAccount: (id: string) => string
): V3Debt {
  return {
    id: d.id,
    kind: row !== undefined ? row.kind : kindOfAccount(d.id) === 'credit' ? 'card' : 'loan',
    balance: d.balance,
    minimum: d.minimumPayment,
    apr: d.apr,
    secured: d.secured,
    isHousing: row !== undefined && row.is_housing,
    dueDay: dueDayOf((row ?? cardRow)?.due_day),
  };
}

const daysIn = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();
const pad = (n: number): string => String(n).padStart(2, '0');

/** The date of payment number `index` (0 = the next due date on or after today). The due day is cut to short months. */
function dueDateOf(today: string, dueDay: number, index: number): string {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const dayOf = (y: number, m: number): number => Math.min(dueDay, daysIn(y, m));
  const startsThisMonth = `${today.slice(0, 8)}${pad(dayOf(year, month))}` >= today;
  const monthIndex = year * 12 + (month - 1) + (startsThisMonth ? 0 : 1) + index;
  const y = Math.floor(monthIndex / 12);
  const m = (monthIndex % 12) + 1;
  return `${y}-${pad(m)}-${pad(dayOf(y, m))}`;
}

/** One debt as Grow shows it: its payoff date from the next due date at the minimum plus any extra, and its total interest. */
export function debtPointOf(row: DebtSourceRow, today: string): DebtPoint {
  const apr = row.apr ? percent(row.apr) : null;
  const dueDay = dueDayOf(row.due_day);
  const paidInFull = row.kind === 'card' && row.pays_in_full === 'yes';
  let payoffDate: string | null = null;
  let totalInterest: DebtPoint['totalInterest'] = null;
  if (!paidInFull) {
    const result = fixedPayoff(minorUnits(row.balance), apr ?? ZERO_PERCENT, minorUnits(row.minimum_payment + (row.payoff_extra ?? 0)));
    if (result.outcome === 'cleared') {
      totalInterest = result.totalInterest;
      if (dueDay !== null && result.months > 0) payoffDate = dueDateOf(today, dueDay, result.months - 1);
    }
  }
  return {
    id: row.id,
    balance: minorUnits(row.balance),
    apr,
    minimum: minorUnits(row.minimum_payment),
    dueDay,
    payoffDate,
    totalInterest,
    paidInFull,
    linkedCheckId: row.check_id,
    paidOff: row.paid_off_on != null && row.paid_off_on <= today,
  };
}
