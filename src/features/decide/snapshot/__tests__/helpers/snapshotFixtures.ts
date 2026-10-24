// 05-07 test builders: a SnapshotResult (logged / rough / none) built directly as the engine's DecideSnapshot, plus a
// helper for CheckComputation literals. Today is 2026-10-15, home USD. Amounts are integer minor units.
import { currencyCode, minorUnits } from '@/engine/money';
import { ZERO_PERCENT, percent } from '@/engine/decide';
import type { CardRecord, DecideSnapshot, MonthRecord, RecordLine } from '@/engine/decide';
import type { CardChoice, SnapshotMeta, SnapshotResult } from '../../types';

export const USD = currencyCode('USD');
export const TODAY = '2026-10-15';

export function line(id: string, month: string, direction: 'in' | 'out', amount: number): RecordLine {
  return {
    id,
    date: `${month}-15`,
    direction,
    amount: minorUnits(amount),
    currency: USD,
    status: 'paid',
    isRefund: false,
    transferId: null,
    seriesId: null,
    categoryId: null,
    oneOff: false,
  };
}

export function month(m: string, income: number, spending: number): MonthRecord {
  return { month: m, full: true, lines: [line(`${m}-in`, m, 'in', income), line(`${m}-out`, m, 'out', spending)] };
}

export const META: SnapshotMeta = {
  fullMonths: 4,
  expenseLinesThisMonth: 0,
  debtCount: 1,
  accountCount: 1,
  unconvertedRows: 0,
  derivedDebts: 0,
  pendingOneOffs: 0,
  cardsWithoutMinimum: 0,
  cardsMinimumWithoutRate: 0,
  cardsWithoutMinimumIds: [],
  loansWithoutPayment: 0,
  limitsReset: 0,
};

// 4 full months, income 500_000, spending 300_000, cash 1_200_000, one debt
export function snapshot(over: Partial<DecideSnapshot> = {}): DecideSnapshot {
  return {
    currency: USD,
    asOf: TODAY,
    months: [month('2026-06', 500_000, 300_000), month('2026-07', 500_000, 300_000), month('2026-08', 500_000, 300_000), month('2026-09', 500_000, 300_000)],
    bills: [],
    basisOverride: null,
    cashOnHand: minorUnits(1_200_000),
    debts: [{ id: 'd1', balance: minorUnits(400_000), minimumPayment: minorUnits(20_000), secured: false, apr: null, currency: USD }],
    monthlySaving: minorUnits(0),
    monthlyInvesting: minorUnits(0),
    scope: { kind: 'personal' },
    householdSpending: null,
    limits: { reserve: null, dsrLine: null, unsecuredIncomeMultiple: null, investingFloor: null, savingFloor: null, spareFloor: null },
    projectionReturn: null,
    projectionRates: [],
    expenseLines: [],
    incomeSeries: [],
    futureChanges: [],
    investmentBalance: minorUnits(0),
    scheduledOutflows: [],
    pots: [],
    ...over,
  };
}

export const CARD_RECORD: CardRecord = {
  id: 'card-1',
  apr: percent('19.99'),
  minimumTerms: { minimumPercent: percent('2'), interestAdded: true, floor: minorUnits(2_500) },
  currency: USD,
};
export const CARD_CHOICE: CardChoice = {
  accountId: 'acc-card',
  name: 'Visa',
  record: CARD_RECORD,
  terms: { debtId: 'card-1', source: 'stored', paidInFull: false, percentText: '2', interestAdded: true, floor: 2_500, floorCurrency: 'USD', marketAvailable: false, version: 1 },
};

const BASE = { currency: USD, meta: META, cards: [CARD_CHOICE], dealerCap: minorUnits(5_000_000), conversions: [], unconverted: null } as const;

export function loggedSource(over: Partial<DecideSnapshot> = {}, cash = 1_200_000): SnapshotResult {
  return { ...BASE, cash: minorUnits(cash), kind: 'logged', snapshot: snapshot(over) };
}

export function roughSource(cash = 600_000, monthlyIncome = 400_000, monthlySpending = 250_000): SnapshotResult {
  return {
    ...BASE,
    cash: minorUnits(cash),
    kind: 'rough',
    figures: { currency: USD, cash: minorUnits(cash), monthlyIncome: minorUnits(monthlyIncome), monthlySpending: minorUnits(monthlySpending) },
  };
}

export function noneSource(cash = 400_000): SnapshotResult {
  return { ...BASE, cash: minorUnits(cash), kind: 'none' };
}

export function unconvertedSource(kind: 'logged' | 'rough' | 'none' = 'logged'): SnapshotResult {
  const unconverted = { currencies: ['EUR'], rowCount: 2 };
  const src = kind === 'logged' ? loggedSource() : kind === 'rough' ? roughSource() : noneSource();
  return { ...src, unconverted };
}

export { ZERO_PERCENT };
