/**
 * Shared snapshot/check builders for decide tests (04-07…04-12 use them).
 * Changing a default here changes many tests — add an override at the call site instead.
 * Test-only: it lives under __tests__, so jest neither runs it as a suite nor counts it for coverage.
 */
import { currencyCode, minorUnits, type CurrencyCode } from '../../../money/types';
import type {
  BuyCheck,
  DecideSnapshot,
  MonthRecord,
  RecordLine,
  RecurringBill,
  RecurringIncome,
  ScheduledOutflow,
} from '../../types';

export const USD: CurrencyCode = currencyCode('USD');

export function line(
  p: Omit<Partial<RecordLine>, 'amount'> & Pick<RecordLine, 'id' | 'date' | 'direction'> & { amount: number }
): RecordLine {
  return {
    currency: USD,
    status: 'paid',
    isRefund: false,
    transferId: null,
    seriesId: null,
    categoryId: null,
    oneOff: false,
    ...p,
    amount: minorUnits(p.amount),
  };
}

export function fullMonth(
  month: string,
  income: number,
  spending: number,
  extra: readonly RecordLine[] = []
): MonthRecord {
  return {
    month,
    full: true,
    lines: [
      line({
        id: `${month}-in`,
        date: `${month}-15`,
        direction: 'in',
        amount: income,
      }),
      line({
        id: `${month}-out`,
        date: `${month}-15`,
        direction: 'out',
        amount: spending,
      }),
      ...extra,
    ],
  };
}

/** Consecutive full months starting at firstMonth ('YYYY-MM'); pairs are [income, spending]. */
export function monthsOf(
  pairs: readonly (readonly [income: number, spending: number])[],
  firstMonth = '2026-01'
): MonthRecord[] {
  const [yearStr, monthStr] = firstMonth.split('-') as [string, string];
  const startIndex = Number(yearStr) * 12 + (Number(monthStr) - 1);
  return pairs.map(([income, spending], i) => {
    const index = startIndex + i;
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    return fullMonth(`${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`, income, spending);
  });
}

export function bill(
  p: Omit<Partial<RecurringBill>, 'latestAmount'> &
    Pick<RecurringBill, 'seriesId' | 'freq' | 'anchorDate'> & {
      latestAmount: number;
    }
): RecurringBill {
  return {
    confirmed: true,
    endDate: null,
    occurrenceCount: null,
    currency: USD,
    categoryId: null,
    lastPaidDate: null,
    ...p,
    latestAmount: minorUnits(p.latestAmount),
  };
}

export function income(
  p: Omit<Partial<RecurringIncome>, 'latestAmount'> &
    Pick<RecurringIncome, 'seriesId' | 'freq' | 'anchorDate'> & {
      latestAmount: number;
    }
): RecurringIncome {
  return {
    confirmed: true,
    endDate: null,
    occurrenceCount: null,
    currency: USD,
    lastPaidDate: null,
    ...p,
    latestAmount: minorUnits(p.latestAmount),
  };
}

export function outflow(
  p: Omit<Partial<ScheduledOutflow>, 'amount'> & Pick<ScheduledOutflow, 'id' | 'date'> & { amount: number }
): ScheduledOutflow {
  return { currency: USD, ...p, amount: minorUnits(p.amount) };
}

export function snapshotOf(over: Partial<DecideSnapshot> = {}): DecideSnapshot {
  return {
    currency: USD,
    asOf: '2026-07-10',
    months: [
      fullMonth('2026-04', 600_000, 300_000),
      fullMonth('2026-05', 600_000, 300_000),
      fullMonth('2026-06', 600_000, 300_000),
    ],
    bills: [],
    basisOverride: null,
    cashOnHand: minorUnits(2_000_000),
    debts: [],
    monthlySaving: minorUnits(0),
    monthlyInvesting: minorUnits(0),
    pots: [],
    scope: { kind: 'personal' },
    householdSpending: null,
    limits: {
      reserve: null,
      dsrLine: null,
      unsecuredIncomeMultiple: null,
      investingFloor: null,
      savingFloor: null,
      spareFloor: null,
    },
    projectionReturn: null,
    projectionRates: [],
    expenseLines: [],
    incomeSeries: [],
    futureChanges: [],
    investmentBalance: minorUnits(0),
    scheduledOutflows: [],
    ...over,
  };
}

export function buyCash(price: number, over: Partial<BuyCheck> = {}): BuyCheck {
  return {
    kind: 'buy',
    currency: USD,
    price: minorUnits(price),
    dayFees: minorUnits(0),
    itemType: 'general',
    runningCostsNet: minorUnits(0),
    payment: { method: 'cash' },
    ...over,
  };
}
